"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { fetchFueraRutaSheet, type FueraRutaFila } from "@/lib/fuera-ruta/sheet"
import { medidasDesdePedidos, medidasDesdeVentas } from "@/lib/fuera-ruta/medidas"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA = "El registro de fuera de ruta solo está disponible en Pampeana."

/** Fila del registro: lo del sheet + bultos/HL medidos desde Chess. */
export interface FueraRutaRegistro extends FueraRutaFila {
  bultos_pedido: number | null
  hl_pedido: number | null
  /** 'pedido' = medido con el pedido pendiente (puede cambiar) · 'venta' = facturado. */
  medida_origen: string | null
}

export interface FueraRutaDia {
  fecha: string
  filas: FueraRutaRegistro[]
  total_monto: number
  total_bultos: number
  total_hl: number
  /**
   * false = el sheet no contestó y se muestra el último snapshot guardado.
   * La solapa lo avisa para que nadie tome el registro por completo ese día.
   */
  sheet_ok: boolean
}

/** Hoy en Argentina (UTC-3): Vercel corre en UTC y a la noche cambiaría de día antes. */
function hoyArg(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * Pedidos FUERA DE RUTA de una fecha de entrega.
 *
 * Sync-al-leer, estilo Pampeana: baja el sheet de Novedades Logísticas, upserta el
 * snapshot en `fuera_ruta_registros` (identidad = clave fecha|pedido|cliente, así
 * re-sincronizar no duplica y una corrección en el sheet actualiza la misma fila)
 * y devuelve las filas del día desde la base. El snapshot NUNCA borra: si en el
 * sheet borran filas o queda un filtro puesto, la historia registrada se conserva.
 */
export async function getFueraRuta(fecha: string): Promise<Result<FueraRutaDia>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." }

  let sheetOk = true
  try {
    const filas = await fetchFueraRutaSheet()
    if (filas.length > 0) {
      const admin = createAdminClient()
      const ahora = new Date().toISOString()
      // primera_vez NO va en el payload: la pone el default en el insert y el
      // upsert no la pisa (queda cuándo apareció el registro por primera vez).
      const rows = filas.map((f) => ({ ...f, synced_at: ahora }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin
          .from("fuera_ruta_registros")
          .upsert(rows.slice(i, i + 500), { onConflict: "clave" })
        if (error) throw new Error(`snapshot fuera de ruta: ${error.message}`)
      }
    }
  } catch (e) {
    // Sheet caído o descompartido: la solapa sigue con el último snapshot.
    console.warn("[fuera-ruta] sync falló:", e instanceof Error ? e.message : e)
    sheetOk = false
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("fuera_ruta_registros")
    .select(
      "clave, fecha_entrega, sucursal, deposito, cod_cliente, cliente, comprobante, nro_pedido, tipo_comprobante, monto, localidad, bultos, descripcion, cod_cliente_entregado, cliente_entregado, direccion_entrega, localidad_entrega, observaciones, patente, canal, bultos_pedido, hl_pedido, medida_origen",
    )
    .eq("fecha_entrega", fecha)
    .order("monto", { ascending: false, nullsFirst: false })
  if (error) return { error: `No se pudo leer el registro de fuera de ruta: ${error.message}` }

  let filas = (data ?? []) as FueraRutaRegistro[]
  filas = await enriquecerMedidas(fecha, filas)

  return {
    data: {
      fecha,
      filas,
      total_monto: filas.reduce((a, f) => a + (f.monto ?? 0), 0),
      total_bultos: filas.reduce((a, f) => a + (f.bultos_pedido ?? f.bultos ?? 0), 0),
      total_hl: filas.reduce((a, f) => a + (f.hl_pedido ?? 0), 0),
      sheet_ok: sheetOk,
    },
  }
}

/**
 * Completa bultos/HL de las filas del día con el pedido real de Chess:
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

function restarDiasIso(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10)
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
