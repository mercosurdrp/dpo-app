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
  /** Cuándo apareció la fila por primera vez (en el ruteo, o recién al facturar). */
  primera_vez: string | null
  /**
   * Sólo fuente Chess. 'ruteo' = pendiente, está en el ruteo fuera de día ·
   * 'entregado' = salió fuera de ruta y ya estaba en el ruteo · 'entregado_sin_ruteo'
   * = salió fuera de ruta sin haber figurado en el ruteo · 'no_salio' = estaba en
   * el ruteo y no se entregó fuera de ruta ese día (se sacó o se reprogramó).
   */
  estado: FueraRutaEstado | null
}

export type FueraRutaEstado = "ruteo" | "entregado" | "entregado_sin_ruteo" | "no_salio"

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
  /** Fuente Chess: 'ruteo' = la fecha todavía no se entregó · 'entregado' = ya se facturó. */
  foto: "ruteo" | "entregado" | null
}

const COLUMNAS =
  "clave, fecha_entrega, sucursal, deposito, cod_cliente, cliente, comprobante, nro_pedido, tipo_comprobante, monto, localidad, bultos, descripcion, cod_cliente_entregado, cliente_entregado, direccion_entrega, localidad_entrega, observaciones, patente, canal, bultos_pedido, hl_pedido, medida_origen, primera_vez"

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

  const hoy = hoyArg()
  let filas = (data ?? []) as FueraRutaRegistro[]
  if (fuente === "sheet") {
    filas = await enriquecerMedidas(fecha, filas)
    for (const f of filas) f.estado = null
  } else {
    for (const f of filas) f.estado = estadoChess(f, hoy)
  }
  // Los totales son de lo que efectivamente salió (o está por salir): lo que
  // quedó en el ruteo y no se entregó fuera de ruta se lista, pero no suma.
  const suman = filas.filter((f) => f.estado !== "no_salio")

  return {
    data: {
      fecha,
      filas,
      total_monto: suman.reduce((a, f) => a + (f.monto ?? 0), 0),
      total_bultos: suman.reduce((a, f) => a + (f.bultos_pedido ?? f.bultos ?? 0), 0),
      total_hl: suman.reduce((a, f) => a + (f.hl_pedido ?? 0), 0),
      fuente,
      fuente_ok: fuenteOk,
      dias_pactados_en: diasPactadosEn,
      foto: fuente === "chess" ? (fecha >= hoy ? "ruteo" : "entregado") : null,
    },
  }
}

/** Día (ARG) en que apareció la fila: si fue antes o el mismo día de la entrega, ya estaba en el ruteo. */
function diaArg(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10) : null
}

function estadoChess(f: FueraRutaRegistro, hoy: string): FueraRutaEstado {
  if (f.fecha_entrega >= hoy) return "ruteo"
  if (f.medida_origen !== "venta") return "no_salio"
  const visto = diaArg(f.primera_vez)
  return visto && visto <= f.fecha_entrega ? "entregado" : "entregado_sin_ruteo"
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

/**
 * Acumulado por mes. Se agrega acá y no en la vista `v_fuera_ruta_mensual`
 * porque desde el 16/10/2026 la tabla guarda también lo que quedó en el ruteo
 * y no salió fuera de ruta ('pedido' en una fecha ya entregada): eso se lista
 * para comparar, pero no cuenta como fuera de ruta.
 */
export async function getFueraRutaMensual(meses = 13): Promise<Result<FueraRutaMes[]>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }

  const supabase = await createClient()
  const hoy = hoyArg()
  type Fila = {
    fecha_entrega: string
    cod_cliente: number | null
    bultos_pedido: number | null
    bultos: number | null
    hl_pedido: number | null
    monto: number | null
    medida_origen: string | null
  }
  const filas: Fila[] = []
  // PostgREST corta en 1000 filas: se pagina.
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("fuera_ruta_registros")
      .select("fecha_entrega, cod_cliente, bultos_pedido, bultos, hl_pedido, monto, medida_origen")
      .gte("fecha_entrega", `${ACUMULADO_DESDE}-01`)
      .order("fecha_entrega")
      .range(desde, desde + 999)
    if (error) return { error: `No se pudo leer el acumulado de fuera de ruta: ${error.message}` }
    const lote = (data ?? []) as Fila[]
    filas.push(...lote)
    if (lote.length < 1000) break
  }

  const porMes = new Map<string, FueraRutaMes & { _clientes: Set<number> }>()
  for (const f of filas) {
    const esChess = f.fecha_entrega >= FUERA_RUTA_CHESS_DESDE
    if (esChess && f.fecha_entrega < hoy && f.medida_origen !== "venta") continue // no salió
    const mes = f.fecha_entrega.slice(0, 7)
    const m = porMes.get(mes) ?? { anio_mes: mes, pedidos: 0, clientes: 0, bultos: 0, hl: 0, monto: 0, _clientes: new Set<number>() }
    m.pedidos += 1
    if (f.cod_cliente != null) m._clientes.add(f.cod_cliente)
    m.bultos += Number(f.bultos_pedido ?? f.bultos ?? 0)
    m.hl += Number(f.hl_pedido ?? 0)
    m.monto += Number(f.monto ?? 0)
    porMes.set(mes, m)
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    data: [...porMes.values()]
      .sort((a, b) => b.anio_mes.localeCompare(a.anio_mes))
      .slice(0, meses)
      .map(({ _clientes, ...m }) => ({ ...m, clientes: _clientes.size, bultos: r2(m.bultos), hl: r2(m.hl), monto: r2(m.monto) })),
  }
}
