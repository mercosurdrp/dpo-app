"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { fetchFueraRutaSheet, type FueraRutaFila } from "@/lib/fuera-ruta/sheet"
import { medidasDesdePedidos, medidasDesdeVentas } from "@/lib/fuera-ruta/medidas"
import { FUERA_RUTA_CHESS_DESDE } from "@/lib/fuera-ruta/chess"
import { sincronizarFueraRutaChess, hoyArg, restarDiasIso } from "@/lib/fuera-ruta/sync-chess"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA = "El registro de fuera de ruta solo está disponible en Pampeana."

/** Fila del registro: lo del sheet (o lo detectado en Chess) + bultos/HL medidos desde Chess. */
export interface FueraRutaRegistro extends FueraRutaFila {
  bultos_pedido: number | null
  hl_pedido: number | null
  /** 'pedido' = medido con el pedido pendiente (puede cambiar) · 'venta' = facturado. */
  medida_origen: string | null
}

export type FueraRutaFuente = "sheet" | "chess"

export interface FueraRutaDia {
  fecha: string
  filas: FueraRutaRegistro[]
  total_monto: number
  total_bultos: number
  total_hl: number
  /**
   * 'sheet' = fechas anteriores al 16/10/2026, cargadas a mano en Novedades
   * Logísticas. 'chess' = desde esa fecha, detectado por el día pactado del cliente.
   */
  fuente: FueraRutaFuente
  /**
   * false = la fuente (sheet o Chess) no contestó y se muestra el último
   * snapshot guardado. La solapa lo avisa para que nadie lo tome por completo.
   */
  fuente_ok: boolean
  /** Cuándo se bajó de Chess el maestro de días pactados (sólo fuente 'chess'). */
  dias_pactados_en: string | null
}

const COLUMNAS =
  "clave, fecha_entrega, sucursal, deposito, cod_cliente, cliente, comprobante, nro_pedido, tipo_comprobante, monto, localidad, bultos, descripcion, cod_cliente_entregado, cliente_entregado, direccion_entrega, localidad_entrega, observaciones, patente, canal, bultos_pedido, hl_pedido, medida_origen"

/**
 * Pedidos FUERA DE RUTA de una fecha de entrega.
 *
 * Desde el 16/10/2026 la fuente es Chess: un pedido está fuera de ruta si su
 * fecha de entrega no es un día pactado del cliente (`sincronizarFueraRutaChess`, en lib/fuera-ruta/sync-chess).
 * Para fechas anteriores sigue valiendo el sheet de Novedades Logísticas, que
 * se cargaba a mano: se sincroniza igual (por si corrigen algo viejo) pero
 * nunca escribe fechas del período Chess.
 */
export async function getFueraRuta(fecha: string): Promise<Result<FueraRutaDia>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." }

  const fuente: FueraRutaFuente = fecha >= FUERA_RUTA_CHESS_DESDE ? "chess" : "sheet"
  let fuenteOk = true
  let diasPactadosEn: string | null = null

  if (fuente === "chess") {
    try {
      const r = await sincronizarFueraRutaChess(fecha, hoyArg())
      diasPactadosEn = r.dias_pactados_en
    } catch (e) {
      console.warn("[fuera-ruta] Chess falló:", e instanceof Error ? e.message : e)
      fuenteOk = false
    }
  } else {
    try {
      await sincronizarSheet()
    } catch (e) {
      // Sheet caído o descompartido: la solapa sigue con el último snapshot.
      console.warn("[fuera-ruta] sync del sheet falló:", e instanceof Error ? e.message : e)
      fuenteOk = false
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("fuera_ruta_registros")
    .select(COLUMNAS)
    .eq("fecha_entrega", fecha)
    .order("monto", { ascending: false, nullsFirst: false })
  if (error) return { error: `No se pudo leer el registro de fuera de ruta: ${error.message}` }

  let filas = (data ?? []) as FueraRutaRegistro[]
  if (fuente === "sheet") filas = await enriquecerMedidas(fecha, filas)

  return {
    data: {
      fecha,
      filas,
      total_monto: filas.reduce((a, f) => a + (f.monto ?? 0), 0),
      total_bultos: filas.reduce((a, f) => a + (f.bultos_pedido ?? f.bultos ?? 0), 0),
      total_hl: filas.reduce((a, f) => a + (f.hl_pedido ?? 0), 0),
      fuente,
      fuente_ok: fuenteOk,
      dias_pactados_en: diasPactadosEn,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuente sheet (fechas anteriores al 16/10/2026)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync-al-leer del sheet de Novedades Logísticas: upserta el snapshot en
 * `fuera_ruta_registros` (identidad = clave fecha|pedido|cliente). El snapshot
 * NUNCA borra: si en el sheet borran filas o queda un filtro puesto, la
 * historia registrada se conserva. Las fechas del período Chess se descartan:
 * ahí manda Chess y una carga manual tardía no debe pisarlo.
 */
async function sincronizarSheet(): Promise<void> {
  const filas = (await fetchFueraRutaSheet()).filter((f) => f.fecha_entrega < FUERA_RUTA_CHESS_DESDE)
  if (filas.length === 0) return
  const admin = createAdminClient()
  const ahora = new Date().toISOString()
  const rows = filas.map((f) => ({ ...f, synced_at: ahora }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("fuera_ruta_registros")
      .upsert(rows.slice(i, i + 500), { onConflict: "clave" })
    if (error) throw new Error(`snapshot fuera de ruta: ${error.message}`)
  }
}

/**
 * Completa bultos/HL de las filas del sheet con el pedido real de Chess:
 * fecha de hoy en adelante → /pedidos/ (pendiente, se re-mide en cada apertura);
 * fecha pasada reciente → /ventas/ (facturado, se mide UNA vez y queda).
 * El histórico viejo se cargó por backfill. Best effort: si Chess no contesta,
 * las filas salen con lo que ya tenían.
 */
async function enriquecerMedidas(
  fecha: string,
  filas: FueraRutaRegistro[],
): Promise<FueraRutaRegistro[]> {
  const hoy = hoyArg()
  const esPendiente = fecha >= hoy
  // Facturado y ya medido como venta = definitivo, no se vuelve a Chess.
  // Más de 14 días atrás tampoco: eso lo cubrió el backfill y no vale la pena
  // demorar la pantalla re-consultando días viejos que no van a aparecer.
  const candidatas = filas.filter((f) => f.nro_pedido)
  const pendientesDeMedida = esPendiente
    ? candidatas
    : candidatas.filter((f) => f.medida_origen !== "venta")
  if (pendientesDeMedida.length === 0) return filas
  if (!esPendiente && fecha < restarDiasIso(hoy, 14)) return filas

  try {
    const nros = new Set(pendientesDeMedida.map((f) => f.nro_pedido!))
    const medidas = esPendiente
      ? await medidasDesdePedidos(fecha, nros)
      : await medidasDesdeVentas(fecha, nros)
    if (medidas.size === 0) return filas

    const admin = createAdminClient()
    const origen = esPendiente ? "pedido" : "venta"
    await Promise.all(
      pendientesDeMedida.map(async (f) => {
        const m = medidas.get(f.nro_pedido!)
        if (!m) return
        f.bultos_pedido = Math.round(m.bultos * 100) / 100
        f.hl_pedido = Math.round(m.hl * 100) / 100
        f.medida_origen = origen
        await admin
          .from("fuera_ruta_registros")
          .update({ bultos_pedido: f.bultos_pedido, hl_pedido: f.hl_pedido, medida_origen: origen })
          .eq("clave", f.clave)
      }),
    )
  } catch (e) {
    console.warn("[fuera-ruta] medidas Chess fallaron:", e instanceof Error ? e.message : e)
  }
  return filas
}

// ─────────────────────────────────────────────────────────────────────────────
// Acumulado mensual — para revisar meses anteriores (junto al VRL en la UI).
// ─────────────────────────────────────────────────────────────────────────────

export interface FueraRutaMes {
  anio_mes: string
  pedidos: number
  clientes: number
  bultos: number
  hl: number
  monto: number
}

/**
 * El acumulado publicado arranca en abril 2026 (definición del usuario, 2026-07-17):
 * la carga del sheet en los meses anteriores fue irregular y la serie no es
 * representativa. El detalle diario y la tabla conservan TODO el histórico igual.
 * Octubre 2026 mezcla fuentes: sheet hasta el 15, Chess desde el 16.
 */
const ACUMULADO_DESDE = "2026-04"

/** Acumulado por mes desde la vista (bypassa el techo de 1000 filas de PostgREST). */
export async function getFueraRutaMensual(meses = 13): Promise<Result<FueraRutaMes[]>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("v_fuera_ruta_mensual")
    .select("*")
    .gte("anio_mes", ACUMULADO_DESDE)
    .limit(meses)
  if (error) return { error: `No se pudo leer el acumulado de fuera de ruta: ${error.message}` }

  return {
    data: (data ?? []).map((r) => ({
      anio_mes: String(r.anio_mes),
      pedidos: Number(r.pedidos ?? 0),
      clientes: Number(r.clientes ?? 0),
      bultos: Number(r.bultos ?? 0),
      hl: Number(r.hl ?? 0),
      monto: Number(r.monto ?? 0),
    })),
  }
}
