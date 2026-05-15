/**
 * Lógica del dashboard ejecutivo de rechazos.
 *
 * Esta es la implementación PURA — recibe el cliente Supabase como parámetro,
 * sin tocar cookies(). El server action en `src/actions/rechazos.ts` la
 * wrappea con un cliente con sesión. Los smoke scripts la consumen con un
 * cliente service_role.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Alert,
  AlertEvaluation,
  ComparisonMode,
  PeriodWindow,
  RechazoCategoria,
  RechazosAggCanal,
  RechazosAggCategoria,
  RechazosAggCliente,
  RechazosAggChofer,
  RechazosAggMotivo,
  RechazosAggProducto,
  RechazosAggSupervisor,
  RechazosComparado,
  RechazosComparadoRequest,
  RechazosComparadoResult,
  RechazosDelta,
  RechazosFilters,
  RechazosFiltersResolved,
  RechazosKPI,
  RechazosPuntoDia,
  RechazosPuntoSemana,
  SyncLogEntry,
  TopVariacion,
  TopVariaciones,
} from "@/lib/types/rechazos"

// ─────────────────────────────────────────────────────────────────────────
//  Tipos internos
// ─────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupaClient = SupabaseClient<any, "public", any>

interface RechazoRow {
  fecha: string
  id_articulo: number
  ds_articulo: string | null
  id_fletero_carga: number | null
  ds_fletero_carga: string
  id_rechazo: number
  ds_rechazo: string
  hl_rechazados: number | null
  bultos_rechazados: number
  id_cliente: number | null
  nombre_cliente: string | null
  monto_neto: number | null
  monto_bruto: number | null
  ds_canal_mkt: string | null
  ds_supervisor: string | null
  ds_localidad: string | null
}

interface VentaDiariaRow {
  fecha: string
  ds_fletero_carga: string
  total_bultos: number
  total_hl: number
}

interface CatalogoMotivo {
  id_rechazo: number
  ds_rechazo: string
  categoria: RechazoCategoria
  controlable: boolean
}

interface MapeoChofer {
  patente: string
  chofer_nombre: string | null
}

interface PeriodData {
  rechazos: RechazoRow[]
  ventasTotalBultos: number
  ventasTotalHl: number
  ventasPorFecha: Map<string, number>
  ventasHlPorFecha: Map<string, number>
  ventasPorPatente: Map<string, number>
  ventasHlPorPatente: Map<string, number>
}

// ─────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Constante operativa: fecha del cambio metodológico del catálogo de rechazos
 * (migración 055 sembró el catálogo con categorización + flag controlable).
 * Comparaciones que crucen esta fecha tienen `pct_controlable` no comparable.
 * Una vez que tengamos un mes calendario completo POST-cambio (esperado fin
 * de junio 2026), la regla deja de aplicarse.
 */
const CATALOGO_CHANGE_DATE = "2026-05-11"
const CATALOGO_FULLY_VALID_AFTER = "2026-06-30"

/**
 * Umbral de concentración para `Alert.context_summary`. Si la suma del top N
 * (ver `ALERT_CONTEXT_MAX_ITEMS`) supera este ratio del total del motivo en el
 * período, se reporta como "Concentrado en N días/patentes: ...".
 */
const ALERT_CONTEXT_CONCENTRATION_THRESHOLD = 0.70
const ALERT_CONTEXT_MAX_ITEMS = 3

/**
 * Umbrales para marcar `TopVariacion.baseline_low`. Cuando el período previous
 * tiene un monto o cantidad de eventos por debajo de estos, el delta_pct queda
 * inflado por denominador chico y la UI lo marca con asterisco.
 */
const TOP_VARIACION_MIN_BASELINE_MONTO = 50_000
const TOP_VARIACION_MIN_BASELINE_EVENTOS = 10

/** Cantidad de motivos a poblar en `RechazosAggChofer.motivos_top` para los choferes sin denominador. */
const MOTIVOS_TOP_PER_CHOFER = 3

export async function getRechazosComparado(
  supa: SupaClient,
  request: RechazosComparadoRequest,
): Promise<RechazosComparadoResult> {
  const t0 = Date.now()
  try {
    const mode: ComparisonMode = request.mode ?? inferMode(request.desde, request.hasta)
    const previousWin = computePreviousWindow(request.desde, request.hasta, mode)
    const previous2Win = computePreviousWindow(previousWin.desde, previousWin.hasta, mode)
    const filters = request.filters ?? {}

    console.time("[rechazos-comparado] loads")
    const [actualData, previousData, previous2Data, catalogo, mapeoChoferes, lastSync, filterDistincts] =
      await Promise.all([
        timed("queries_actual", () => loadPeriodData(supa, request.desde, request.hasta, filters)),
        timed("queries_previous", () => loadPeriodData(supa, previousWin.desde, previousWin.hasta, filters)),
        timed("queries_previous2", () => loadPeriodData(supa, previous2Win.desde, previous2Win.hasta, filters)),
        timed("queries_catalogo", () => loadCatalogo(supa)),
        timed("queries_mapeo", () => loadMapeoChoferes(supa)),
        timed("queries_sync_log", () => loadLastSync(supa)),
        timed("queries_filter_distincts", () => loadFilterDistincts(supa, request.desde, request.hasta)),
      ])
    console.timeEnd("[rechazos-comparado] loads")

    const catalogoMap = new Map(catalogo.map(c => [c.id_rechazo, c]))
    const mapeoMap = new Map(mapeoChoferes.map(m => [m.patente, m]))

    console.time("[rechazos-comparado] compute")
    const actualKPI = computeKPI(actualData.rechazos, actualData.ventasTotalBultos, actualData.ventasTotalHl, catalogoMap)
    const previousKPI = computeKPI(previousData.rechazos, previousData.ventasTotalBultos, previousData.ventasTotalHl, catalogoMap)
    const previous2KPI = computeKPI(previous2Data.rechazos, previous2Data.ventasTotalBultos, previous2Data.ventasTotalHl, catalogoMap)
    const delta = computeDelta(actualKPI, previousKPI, request.desde, previousWin.desde)

    const series = computeSeries(actualData.rechazos, actualData.ventasHlPorFecha)

    const choferSplit = splitChoferesPorDenominador(
      computeAggChofer(actualData.rechazos, actualData.ventasPorPatente, actualData.ventasHlPorPatente, mapeoMap),
      actualData.rechazos,
      catalogoMap,
    )

    const agg = {
      por_motivo: computeAggMotivo(actualData.rechazos, catalogoMap, actualKPI.hl),
      por_categoria: computeAggCategoria(actualData.rechazos, catalogoMap),
      por_chofer: choferSplit,
      por_cliente: computeAggCliente(actualData.rechazos),
      por_producto: computeAggProducto(actualData.rechazos),
      por_canal: computeAggCanal(actualData.rechazos, actualKPI.hl),
      por_supervisor: computeAggSupervisor(actualData.rechazos),
    }

    const top_variaciones = computeTopVariaciones(
      actualData, previousData, catalogoMap, mapeoMap, actualKPI, previousKPI,
    )

    const tendenciaEval: AlertEvaluation =
      previous2Data.rechazos.length === 0 ? "insufficient_history" : "available"

    const alertItems = computeAlerts({
      agg, actualKPI, previousKPI, previous2KPI, top_variaciones, tendenciaEval, mapeoMap,
      rechazosActual: actualData.rechazos,
    })
    console.timeEnd("[rechazos-comparado] compute")

    const filtersResolved: RechazosFiltersResolved | undefined = request.include_filters_resolved
      ? await resolveFilters(supa, filters)
      : undefined

    const filter_options = {
      motivos: catalogo.map(c => ({
        id_rechazo: c.id_rechazo, ds_rechazo: c.ds_rechazo,
        categoria: c.categoria, controlable: c.controlable,
      })),
      fleteros: mapeoChoferes
        .map(m => ({ patente: m.patente, chofer_display: m.chofer_nombre ?? m.patente }))
        .sort((a, b) => a.patente.localeCompare(b.patente)),
      canales: filterDistincts.canales,
      supervisores: filterDistincts.supervisores,
      categorias: [...new Set(catalogo.map(c => c.categoria))].sort(),
    }

    const result: RechazosComparado = {
      meta: {
        lastSync,
        actual: makeWindow(request.desde, request.hasta, mode, "actual"),
        previous: { desde: previousWin.desde, hasta: previousWin.hasta, label: previousWin.label },
        mode,
        filters_applied: filters,
        filters_resolved: filtersResolved,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
      },
      actual: actualKPI,
      previous: previousKPI,
      delta,
      filter_options,
      alerts: { items: alertItems, tendencia_evaluation: tendenciaEval },
      series,
      agg,
      top_variaciones,
    }
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Ventanas + labels
// ─────────────────────────────────────────────────────────────────────────

const MESES_AR = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
const MESES_AR_FULL = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]

function parseISO(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) throw new Error(`Fecha ISO inválida: ${s}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function diffDaysInclusive(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }

function inferMode(desde: string, hasta: string): ComparisonMode {
  const d = parseISO(desde), h = parseISO(hasta)
  if (d.getDate() === 1 && d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear()) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (toISO(h) === toISO(today)) return "mes_en_curso"
    if (toISO(h) === toISO(endOfMonth(d))) return "mes_cerrado"
  }
  return "rango_custom"
}

function computePreviousWindow(desde: string, hasta: string, mode: ComparisonMode): PeriodWindow {
  const d = parseISO(desde), h = parseISO(hasta)
  if (mode === "mes_en_curso") {
    const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const offsetDias = h.getDate() - 1
    const prevEnd = new Date(d.getFullYear(), d.getMonth() - 1, 1 + offsetDias)
    return { desde: toISO(prevStart), hasta: toISO(prevEnd), label: labelRangoEnMes(prevStart, prevEnd) }
  }
  if (mode === "mes_cerrado") {
    const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const prevEnd = endOfMonth(prevStart)
    return { desde: toISO(prevStart), hasta: toISO(prevEnd), label: `${MESES_AR_FULL[prevStart.getMonth()]} ${prevStart.getFullYear()}` }
  }
  const n = diffDaysInclusive(d, h)
  const prevEnd = addDays(d, -1)
  const prevStart = addDays(prevEnd, -(n - 1))
  return { desde: toISO(prevStart), hasta: toISO(prevEnd), label: labelRangoLibre(prevStart, prevEnd) }
}

function makeWindow(desde: string, hasta: string, mode: ComparisonMode, _which: "actual"): PeriodWindow {
  const d = parseISO(desde), h = parseISO(hasta)
  let label: string
  if (mode === "mes_en_curso") label = labelRangoEnMes(d, h)
  else if (mode === "mes_cerrado") label = `${MESES_AR_FULL[d.getMonth()]} ${d.getFullYear()}`
  else label = labelRangoLibre(d, h)
  return { desde, hasta, label }
}

function labelRangoEnMes(d: Date, h: Date): string {
  return `${d.getDate()}-${h.getDate()} ${MESES_AR[d.getMonth()]}`
}
function labelRangoLibre(d: Date, h: Date): string {
  const f = (x: Date) => `${String(x.getDate()).padStart(2, "0")}-${MESES_AR[x.getMonth()]}`
  return `${f(d)} → ${f(h)}`
}

// ─────────────────────────────────────────────────────────────────────────
//  Loaders
// ─────────────────────────────────────────────────────────────────────────

async function loadPeriodData(
  supa: SupaClient, desde: string, hasta: string, filters: RechazosFilters,
): Promise<PeriodData> {
  let q = supa.from("rechazos").select(
    "fecha,id_articulo,ds_articulo,id_fletero_carga,ds_fletero_carga,id_rechazo,ds_rechazo,hl_rechazados,bultos_rechazados,id_cliente,nombre_cliente,monto_neto,monto_bruto,ds_canal_mkt,ds_supervisor,ds_localidad"
  ).gte("fecha", desde).lte("fecha", hasta)

  if (filters.ds_fletero_carga?.length) q = q.in("ds_fletero_carga", filters.ds_fletero_carga)
  if (filters.id_cliente?.length)        q = q.in("id_cliente", filters.id_cliente)
  if (filters.id_rechazo?.length)        q = q.in("id_rechazo", filters.id_rechazo)
  if (filters.id_articulo?.length)       q = q.in("id_articulo", filters.id_articulo)
  if (filters.ds_canal_mkt?.length)      q = q.in("ds_canal_mkt", filters.ds_canal_mkt)
  if (filters.ds_supervisor?.length)     q = q.in("ds_supervisor", filters.ds_supervisor)

  const { data: rechazos, error: e1 } = await q
  if (e1) throw new Error(`rechazos query: ${e1.message}`)

  let ventaQuery = supa.from("ventas_diarias")
    .select("fecha,ds_fletero_carga,total_bultos,total_hl")
    .gte("fecha", desde).lte("fecha", hasta)
  if (filters.ds_fletero_carga?.length) {
    ventaQuery = ventaQuery.in("ds_fletero_carga", filters.ds_fletero_carga)
  }
  const { data: ventas, error: e2 } = await ventaQuery
  if (e2) throw new Error(`ventas_diarias query: ${e2.message}`)

  const ventasPorFecha = new Map<string, number>()
  const ventasHlPorFecha = new Map<string, number>()
  const ventasPorPatente = new Map<string, number>()
  const ventasHlPorPatente = new Map<string, number>()
  let ventasTotalBultos = 0
  let ventasTotalHl = 0
  for (const v of (ventas ?? []) as VentaDiariaRow[]) {
    const b = Number(v.total_bultos ?? 0)
    const h = Number(v.total_hl ?? 0)
    ventasTotalBultos += b
    ventasTotalHl += h
    ventasPorFecha.set(v.fecha, (ventasPorFecha.get(v.fecha) ?? 0) + b)
    ventasHlPorFecha.set(v.fecha, (ventasHlPorFecha.get(v.fecha) ?? 0) + h)
    ventasPorPatente.set(v.ds_fletero_carga, (ventasPorPatente.get(v.ds_fletero_carga) ?? 0) + b)
    ventasHlPorPatente.set(v.ds_fletero_carga, (ventasHlPorPatente.get(v.ds_fletero_carga) ?? 0) + h)
  }

  return {
    rechazos: (rechazos ?? []) as RechazoRow[],
    ventasTotalBultos,
    ventasTotalHl,
    ventasPorFecha,
    ventasHlPorFecha,
    ventasPorPatente,
    ventasHlPorPatente,
  }
}

async function loadCatalogo(supa: SupaClient): Promise<CatalogoMotivo[]> {
  const { data, error } = await supa
    .from("catalogo_rechazos")
    .select("id_rechazo,ds_rechazo,categoria,controlable")
  if (error) throw new Error(`catalogo_rechazos: ${error.message}`)
  return (data ?? []) as CatalogoMotivo[]
}

async function loadMapeoChoferes(supa: SupaClient): Promise<MapeoChofer[]> {
  const { data, error } = await supa
    .from("mapeo_patente_chofer")
    .select("patente, catalogo_choferes(nombre)")
  if (error) throw new Error(`mapeo_patente_chofer: ${error.message}`)
  type Row = { patente: string; catalogo_choferes: { nombre: string | null } | null }
  return ((data ?? []) as unknown as Row[]).map(r => ({
    patente: r.patente,
    chofer_nombre: r.catalogo_choferes?.nombre ?? null,
  }))
}

/**
 * Distincts de canal/supervisor del período actual SIN aplicar filtros — sirve
 * para que los dropdowns muestren todas las opciones aunque el usuario tenga
 * un filtro activo. Limita a las dimensiones donde no tenemos catálogo aparte.
 */
async function loadFilterDistincts(
  supa: SupaClient, desde: string, hasta: string,
): Promise<{ canales: string[]; supervisores: string[] }> {
  const { data } = await supa
    .from("rechazos")
    .select("ds_canal_mkt, ds_supervisor")
    .gte("fecha", desde).lte("fecha", hasta)
  const cSet = new Set<string>()
  const sSet = new Set<string>()
  for (const r of (data ?? []) as { ds_canal_mkt: string | null; ds_supervisor: string | null }[]) {
    if (r.ds_canal_mkt) cSet.add(r.ds_canal_mkt)
    if (r.ds_supervisor) sSet.add(r.ds_supervisor)
  }
  return {
    canales: [...cSet].sort(),
    supervisores: [...sSet].sort(),
  }
}

async function loadLastSync(supa: SupaClient): Promise<SyncLogEntry | null> {
  const { data, error } = await supa
    .from("sync_log")
    .select("ran_at, source, errors")
    .order("ran_at", { ascending: false })
    .limit(1)
  if (error || !data?.[0]) return null
  const row = data[0] as { ran_at: string; source: SyncLogEntry["source"]; errors: unknown[] }
  return {
    ran_at: row.ran_at,
    source: row.source,
    errors_count: Array.isArray(row.errors) ? row.errors.length : 0,
  }
}

async function resolveFilters(supa: SupaClient, filters: RechazosFilters): Promise<RechazosFiltersResolved> {
  const out: RechazosFiltersResolved = {}
  const tasks: Promise<void>[] = []

  if (filters.id_rechazo?.length) {
    tasks.push((async () => {
      const { data } = await supa.from("catalogo_rechazos")
        .select("id_rechazo, ds_rechazo")
        .in("id_rechazo", filters.id_rechazo!)
      out.id_rechazo = ((data ?? []) as { id_rechazo: number; ds_rechazo: string }[])
        .map(r => ({ id: r.id_rechazo, ds: r.ds_rechazo }))
    })())
  }
  if (filters.id_cliente?.length) {
    tasks.push((async () => {
      const { data } = await supa.from("rechazos")
        .select("id_cliente, nombre_cliente")
        .in("id_cliente", filters.id_cliente!)
        .limit(1000)
      const map = new Map<number, string>()
      for (const r of (data ?? []) as { id_cliente: number; nombre_cliente: string }[]) {
        if (!map.has(r.id_cliente)) map.set(r.id_cliente, r.nombre_cliente)
      }
      out.id_cliente = [...map].map(([id, nombre]) => ({ id, nombre }))
    })())
  }
  if (filters.id_articulo?.length) {
    tasks.push((async () => {
      const { data } = await supa.from("rechazos")
        .select("id_articulo, ds_articulo")
        .in("id_articulo", filters.id_articulo!)
        .limit(1000)
      const map = new Map<number, string>()
      for (const r of (data ?? []) as { id_articulo: number; ds_articulo: string }[]) {
        if (!map.has(r.id_articulo)) map.set(r.id_articulo, r.ds_articulo)
      }
      out.id_articulo = [...map].map(([id, ds]) => ({ id, ds }))
    })())
  }
  if (filters.ds_fletero_carga?.length) {
    tasks.push((async () => {
      const { data } = await supa.from("mapeo_patente_chofer")
        .select("patente, catalogo_choferes(nombre)")
        .in("patente", filters.ds_fletero_carga!)
      type Row = { patente: string; catalogo_choferes: { nombre: string | null } | null }
      out.ds_fletero_carga = ((data ?? []) as unknown as Row[])
        .map(r => ({ patente: r.patente, chofer_display: r.catalogo_choferes?.nombre ?? r.patente }))
    })())
  }
  if (filters.categoria?.length)     out.categoria = filters.categoria
  if (filters.ds_canal_mkt?.length)  out.ds_canal_mkt = filters.ds_canal_mkt
  if (filters.ds_supervisor?.length) out.ds_supervisor = filters.ds_supervisor

  await Promise.all(tasks)
  return out
}

// ─────────────────────────────────────────────────────────────────────────
//  KPIs
// ─────────────────────────────────────────────────────────────────────────

function computeKPI(
  rows: RechazoRow[], ventasTotalBultos: number, ventasTotalHl: number,
  catalogo: Map<number, CatalogoMotivo>,
): RechazosKPI {
  let hl = 0, bultos = 0, monto_neto = 0, monto_bruto = 0
  let eventos = 0, eventos_con_monto = 0
  let hlControlables = 0
  const clientes = new Set<number>()

  for (const r of rows) {
    const h = Number(r.hl_rechazados ?? 0)
    const b = Number(r.bultos_rechazados ?? 0)
    hl += h
    bultos += b
    eventos += 1
    if (r.monto_neto != null) { eventos_con_monto += 1; monto_neto += Number(r.monto_neto) }
    if (r.monto_bruto != null) monto_bruto += Number(r.monto_bruto)
    if (r.id_cliente != null) clientes.add(r.id_cliente)
    const cat = catalogo.get(r.id_rechazo)
    if (cat?.controlable) hlControlables += h
  }

  const tasa = ventasTotalHl > 0 ? (hl / ventasTotalHl) * 100 : 0
  const tasa_bultos = ventasTotalBultos > 0 ? (bultos / ventasTotalBultos) * 100 : 0
  const pct_controlable = hl > 0 ? (hlControlables / hl) * 100 : 0
  const ticket_promedio = eventos_con_monto > 0 ? monto_neto / eventos_con_monto : 0

  return {
    hl, total_hl_entregados: ventasTotalHl,
    bultos, total_entregados: ventasTotalBultos,
    eventos, eventos_con_monto,
    monto_neto, monto_bruto,
    tasa, tasa_bultos, pct_controlable, ticket_promedio,
    clientes_afectados: clientes.size,
  }
}

function computeDelta(
  actual: RechazosKPI, previous: RechazosKPI,
  actualDesde: string, previousDesde: string,
): RechazosDelta {
  const pct = (a: number, p: number) => p === 0 ? 0 : ((a - p) / p) * 100
  const invalidated: Partial<Record<keyof RechazosKPI, string>> = {}
  // El delta de pct_controlable no es comparable si el período previous incluye
  // días anteriores al cambio metodológico, y mientras no haya un mes calendario
  // completo POST-cambio (a partir de CATALOGO_FULLY_VALID_AFTER).
  if (
    actualDesde <= CATALOGO_FULLY_VALID_AFTER &&
    previousDesde < CATALOGO_CHANGE_DATE
  ) {
    invalidated.pct_controlable = "catalogo_actualizado_2026-05"
  }
  const delta: RechazosDelta = {
    hl_abs:          actual.hl - previous.hl,
    hl_pct:          pct(actual.hl, previous.hl),
    total_hl_entregados_abs: actual.total_hl_entregados - previous.total_hl_entregados,
    total_hl_entregados_pct: pct(actual.total_hl_entregados, previous.total_hl_entregados),
    bultos_abs:      actual.bultos - previous.bultos,
    bultos_pct:      pct(actual.bultos, previous.bultos),
    total_entregados_abs: actual.total_entregados - previous.total_entregados,
    total_entregados_pct: pct(actual.total_entregados, previous.total_entregados),
    eventos_abs:     actual.eventos - previous.eventos,
    eventos_pct:     pct(actual.eventos, previous.eventos),
    monto_neto_abs:  actual.monto_neto - previous.monto_neto,
    monto_neto_pct:  pct(actual.monto_neto, previous.monto_neto),
    tasa_pp:         actual.tasa - previous.tasa,
    tasa_bultos_pp:  actual.tasa_bultos - previous.tasa_bultos,
    pct_controlable_pp: actual.pct_controlable - previous.pct_controlable,
    ticket_abs:      actual.ticket_promedio - previous.ticket_promedio,
    ticket_pct:      pct(actual.ticket_promedio, previous.ticket_promedio),
    clientes_abs:    actual.clientes_afectados - previous.clientes_afectados,
    clientes_pct:    pct(actual.clientes_afectados, previous.clientes_afectados),
  }
  if (Object.keys(invalidated).length > 0) delta.comparison_invalidated_by = invalidated
  return delta
}

/**
 * Wrapper de medición de tiempo para cada load query.
 * Imprime `[rechazos-comparado] queries_X: NNNms` con `console.timeLog`.
 */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  const r = await fn()
  console.log(`[rechazos-comparado] ${label}: ${Date.now() - t0}ms`)
  return r
}

/**
 * Separa `por_chofer` en dos bloques: filas con denominador confiable (ranking
 * principal de la UI + entran en alertas y top_variaciones) vs filas con
 * denominador no confiable (UI las muestra colapsadas, no afectan alertas).
 * Para las filas sin denominador, además popula `motivos_top` para que el
 * bloque colapsado tenga contexto sin obligar a drill-down completo.
 */
function splitChoferesPorDenominador(
  arr: RechazosAggChofer[],
  rechazos: RechazoRow[],
  catalogo: Map<number, CatalogoMotivo>,
): { ranking_principal: RechazosAggChofer[]; ranking_sin_denominador: RechazosAggChofer[] } {
  const ranking_principal: RechazosAggChofer[] = []
  const ranking_sin_denominador: RechazosAggChofer[] = []
  for (const r of arr) {
    if (r.denominador_confiable) ranking_principal.push(r)
    else ranking_sin_denominador.push(r)
  }
  // Poblar motivos_top solo para las filas sin denominador (las otras siempre lo tienen en agg.por_motivo del global)
  if (ranking_sin_denominador.length > 0) {
    const patentesSet = new Set(ranking_sin_denominador.map(r => r.patente))
    const aggPorPat = new Map<string, Map<number, { hl: number; monto: number; eventos: number }>>()
    for (const r of rechazos) {
      if (!patentesSet.has(r.ds_fletero_carga)) continue
      let mot = aggPorPat.get(r.ds_fletero_carga)
      if (!mot) { mot = new Map(); aggPorPat.set(r.ds_fletero_carga, mot) }
      const cur = mot.get(r.id_rechazo) ?? { hl: 0, monto: 0, eventos: 0 }
      cur.hl += Number(r.hl_rechazados ?? 0)
      cur.monto += Number(r.monto_neto ?? 0)
      cur.eventos += 1
      mot.set(r.id_rechazo, cur)
    }
    for (const row of ranking_sin_denominador) {
      const mot = aggPorPat.get(row.patente)
      if (!mot) continue
      row.motivos_top = [...mot.entries()]
        .map(([id_rechazo, v]) => ({
          ds_rechazo: catalogo.get(id_rechazo)?.ds_rechazo ?? `id_${id_rechazo}`,
          hl: v.hl,
          monto: v.monto,
          eventos: v.eventos,
        }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, MOTIVOS_TOP_PER_CHOFER)
    }
  }
  return { ranking_principal, ranking_sin_denominador }
}

/**
 * Construye el `context_summary` para una alerta de motivo: detecta concentración
 * de monto en 1-3 fechas o 1-3 patentes (umbral 70%), y agrega nota de baseline_low
 * cuando el período previous tenía baja masa.
 */
function buildMotivoContextSummary(
  idRechazo: number,
  rechazosActual: RechazoRow[],
  topVar: TopVariacion | null,
): string | null {
  const filas = rechazosActual.filter(r => r.id_rechazo === idRechazo)
  if (filas.length === 0) return null
  const totalMonto = filas.reduce((s, r) => s + Number(r.monto_neto ?? 0), 0)
  if (totalMonto <= 0) return null

  const aggDias = new Map<string, number>()
  const aggPats = new Map<string, number>()
  for (const r of filas) {
    const m = Number(r.monto_neto ?? 0)
    aggDias.set(r.fecha, (aggDias.get(r.fecha) ?? 0) + m)
    aggPats.set(r.ds_fletero_carga, (aggPats.get(r.ds_fletero_carga) ?? 0) + m)
  }
  const diasConc = pickConcentration(aggDias, totalMonto)
  const patsConc = pickConcentration(aggPats, totalMonto)

  const parts: string[] = []
  if (diasConc) {
    const labels = diasConc.items.map(([f]) => formatFechaShort(f)).join(", ")
    parts.push(`${diasConc.items.length} día${diasConc.items.length > 1 ? "s" : ""} (${labels})`)
  }
  if (patsConc) {
    const labels = patsConc.items.map(([p]) => p).join(", ")
    parts.push(`${patsConc.items.length} patente${patsConc.items.length > 1 ? "s" : ""} (${labels})`)
  }

  let main: string | null = null
  if (parts.length > 0) main = `Concentrado en ${parts.join(" y ")}`

  let baselineNote: string | null = null
  if (topVar && topVar.baseline_low && !topVar.baseline_was_zero) {
    const montoLabel = topVar.previous_value >= 1_000_000
      ? `$${(topVar.previous_value / 1_000_000).toFixed(1).replace(".", ",")}M`
      : `$${Math.round(topVar.previous_value / 1000)}k`
    baselineNote = `baseline anterior bajo (${montoLabel}, ${topVar.previous_eventos} eventos)`
  }

  if (main && baselineNote) return `${main} — ${baselineNote}`
  if (main) return main
  if (baselineNote) return `Baseline anterior bajo: ${baselineNote.replace(/^baseline anterior bajo /, "").replace(/^\(/, "(")}`
  return null
}

/**
 * Devuelve el top de elementos cuya suma alcanza el umbral de concentración
 * (con un máximo de `ALERT_CONTEXT_MAX_ITEMS`). Devuelve null si no se llega
 * al umbral con `MAX_ITEMS` o menos.
 */
function pickConcentration(m: Map<string, number>, total: number): { items: [string, number][] } | null {
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1])
  let acc = 0
  const picked: [string, number][] = []
  for (let i = 0; i < Math.min(sorted.length, ALERT_CONTEXT_MAX_ITEMS); i++) {
    picked.push(sorted[i])
    acc += sorted[i][1]
    if (acc / total >= ALERT_CONTEXT_CONCENTRATION_THRESHOLD) return { items: picked }
  }
  return null
}

function formatFechaShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

// ─────────────────────────────────────────────────────────────────────────
//  Series
// ─────────────────────────────────────────────────────────────────────────

function computeSeries(
  rows: RechazoRow[],
  ventasHlPorFecha: Map<string, number>,
): RechazosComparado["series"] {
  const dias = new Map<string, { hl: number; bultos: number; monto: number; eventos: number }>()
  for (const r of rows) {
    const cur = dias.get(r.fecha) ?? { hl: 0, bultos: 0, monto: 0, eventos: 0 }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.monto += Number(r.monto_neto ?? 0)
    cur.eventos += 1
    dias.set(r.fecha, cur)
  }
  const por_dia: RechazosPuntoDia[] = [...dias.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => {
      const totalHlDia = ventasHlPorFecha.get(fecha) ?? 0
      return { fecha, hl: v.hl, bultos: v.bultos, monto: v.monto, eventos: v.eventos,
               tasa: totalHlDia > 0 ? (v.hl / totalHlDia) * 100 : 0 }
    })

  const semanas = new Map<string, { desde: string; hasta: string; hl: number; bultos: number; monto: number; eventos: number; ventasHl: number }>()
  for (const p of por_dia) {
    const { isoYear, isoWeek } = isoYearWeek(parseISO(p.fecha))
    const key = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`
    const cur = semanas.get(key)
    if (!cur) {
      const monday = mondayOfIsoWeek(isoYear, isoWeek)
      semanas.set(key, { desde: toISO(monday), hasta: toISO(addDays(monday, 6)),
                         hl: p.hl, bultos: p.bultos, monto: p.monto, eventos: p.eventos,
                         ventasHl: ventasHlPorFecha.get(p.fecha) ?? 0 })
    } else {
      cur.hl += p.hl; cur.bultos += p.bultos; cur.monto += p.monto; cur.eventos += p.eventos
      cur.ventasHl += ventasHlPorFecha.get(p.fecha) ?? 0
    }
  }
  const por_semana: RechazosPuntoSemana[] = [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, v]) => ({
      semana, desde: v.desde, hasta: v.hasta,
      hl: v.hl, bultos: v.bultos, monto: v.monto, eventos: v.eventos,
      tasa: v.ventasHl > 0 ? (v.hl / v.ventasHl) * 100 : 0,
    }))

  return { por_dia, por_semana }
}

function isoYearWeek(d: Date): { isoYear: number; isoWeek: number } {
  // ISO 8601: Thursday of the same week determines the year. Monday is day 1.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { isoYear: t.getUTCFullYear(), isoWeek: week }
}
function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const day = jan4.getDay() || 7
  const monday = new Date(jan4); monday.setDate(jan4.getDate() - (day - 1) + (week - 1) * 7)
  return monday
}

// ─────────────────────────────────────────────────────────────────────────
//  Agregaciones por dimensión
// ─────────────────────────────────────────────────────────────────────────

function computeAggMotivo(
  rows: RechazoRow[], catalogo: Map<number, CatalogoMotivo>, totalHl: number,
): RechazosAggMotivo[] {
  const map = new Map<number, RechazosAggMotivo>()
  for (const r of rows) {
    const cat = catalogo.get(r.id_rechazo)
    const cur = map.get(r.id_rechazo) ?? {
      id_rechazo: r.id_rechazo,
      ds_rechazo: cat?.ds_rechazo ?? r.ds_rechazo,
      categoria: cat?.categoria ?? "POR_CLASIFICAR",
      controlable: cat?.controlable ?? false,
      hl: 0, bultos: 0, eventos: 0, monto: 0, pct_del_total: 0,
    }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.eventos += 1
    cur.monto += Number(r.monto_neto ?? 0)
    map.set(r.id_rechazo, cur)
  }
  return [...map.values()]
    .map(m => ({ ...m, pct_del_total: totalHl > 0 ? (m.hl / totalHl) * 100 : 0 }))
    .sort((a, b) => b.hl - a.hl)
}

function computeAggCategoria(rows: RechazoRow[], catalogo: Map<number, CatalogoMotivo>): RechazosAggCategoria[] {
  const map = new Map<RechazoCategoria, RechazosAggCategoria>()
  for (const r of rows) {
    const cat = catalogo.get(r.id_rechazo)?.categoria ?? "POR_CLASIFICAR"
    const cur = map.get(cat) ?? { categoria: cat, hl: 0, bultos: 0, eventos: 0, monto: 0 }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.eventos += 1
    cur.monto += Number(r.monto_neto ?? 0)
    map.set(cat, cur)
  }
  return [...map.values()].sort((a, b) => b.hl - a.hl)
}

function computeAggChofer(
  rows: RechazoRow[], ventasPorPatente: Map<string, number>,
  ventasHlPorPatente: Map<string, number>, mapeoMap: Map<string, MapeoChofer>,
): RechazosAggChofer[] {
  const map = new Map<string, RechazosAggChofer>()
  for (const r of rows) {
    const patente = r.ds_fletero_carga
    const mapeo = mapeoMap.get(patente)
    const chofer_nombre = mapeo?.chofer_nombre ?? null
    const display = chofer_nombre ?? patente
    const cur = map.get(patente) ?? {
      display, patente, chofer_nombre,
      hl: 0, bultos: 0, eventos: 0, monto: 0, tasa: 0,
      total_hl_entregados: 0, total_entregados: 0,
      denominador_confiable: true,
    }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.eventos += 1
    cur.monto += Number(r.monto_neto ?? 0)
    map.set(patente, cur)
  }
  for (const v of map.values()) {
    v.total_hl_entregados = ventasHlPorPatente.get(v.patente) ?? 0
    v.total_entregados = ventasPorPatente.get(v.patente) ?? 0
    v.tasa = v.total_hl_entregados > 0 ? (v.hl / v.total_hl_entregados) * 100 : 0
    v.denominador_confiable = v.total_hl_entregados > 0 && v.hl <= v.total_hl_entregados
  }
  return [...map.values()].sort((a, b) => b.hl - a.hl)
}

function computeAggCliente(rows: RechazoRow[]): RechazosAggCliente[] {
  const map = new Map<number, RechazosAggCliente>()
  for (const r of rows) {
    if (r.id_cliente == null) continue
    const cur = map.get(r.id_cliente) ?? {
      id_cliente: r.id_cliente, nombre_cliente: r.nombre_cliente ?? "(sin nombre)",
      hl: 0, bultos: 0, eventos: 0, monto: 0,
    }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.eventos += 1
    cur.monto += Number(r.monto_neto ?? 0)
    map.set(r.id_cliente, cur)
  }
  return [...map.values()].sort((a, b) => b.hl - a.hl)
}

function computeAggProducto(rows: RechazoRow[]): RechazosAggProducto[] {
  const map = new Map<number, RechazosAggProducto>()
  for (const r of rows) {
    const cur = map.get(r.id_articulo) ?? {
      id_articulo: r.id_articulo, ds_articulo: r.ds_articulo ?? "(sin descripción)",
      hl: 0, bultos: 0, eventos: 0, monto: 0,
    }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.eventos += 1
    cur.monto += Number(r.monto_neto ?? 0)
    map.set(r.id_articulo, cur)
  }
  return [...map.values()].sort((a, b) => b.hl - a.hl)
}

function computeAggCanal(rows: RechazoRow[], totalHl: number): RechazosAggCanal[] {
  const map = new Map<string, RechazosAggCanal>()
  for (const r of rows) {
    const k = r.ds_canal_mkt ?? "(sin canal)"
    const cur = map.get(k) ?? { ds_canal_mkt: k, hl: 0, bultos: 0, eventos: 0, monto: 0, pct: 0 }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.eventos += 1
    cur.monto += Number(r.monto_neto ?? 0)
    map.set(k, cur)
  }
  return [...map.values()]
    .map(v => ({ ...v, pct: totalHl > 0 ? (v.hl / totalHl) * 100 : 0 }))
    .sort((a, b) => b.hl - a.hl)
}

function computeAggSupervisor(rows: RechazoRow[]): RechazosAggSupervisor[] {
  const map = new Map<string, RechazosAggSupervisor>()
  for (const r of rows) {
    const k = r.ds_supervisor ?? "(sin supervisor)"
    const cur = map.get(k) ?? { ds_supervisor: k, hl: 0, bultos: 0, eventos: 0, monto: 0 }
    cur.hl += Number(r.hl_rechazados ?? 0)
    cur.bultos += Number(r.bultos_rechazados ?? 0)
    cur.eventos += 1
    cur.monto += Number(r.monto_neto ?? 0)
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => b.hl - a.hl)
}

// ─────────────────────────────────────────────────────────────────────────
//  Top variaciones
// ─────────────────────────────────────────────────────────────────────────

function computeTopVariaciones(
  actualData: PeriodData, previousData: PeriodData,
  catalogo: Map<number, CatalogoMotivo>, mapeoMap: Map<string, MapeoChofer>,
  _aKPI: RechazosKPI, _pKPI: RechazosKPI,
): TopVariaciones {
  // Motivo: comparar monto neto por id_rechazo
  const aMot = aggBy(actualData.rechazos, r => r.id_rechazo, r => Number(r.monto_neto ?? 0))
  const pMot = aggBy(previousData.rechazos, r => r.id_rechazo, r => Number(r.monto_neto ?? 0))
  const pMotEv = aggBy(previousData.rechazos, r => r.id_rechazo, () => 1)
  const motDeltas = pairDeltas(aMot, pMot, pMotEv,
    (id) => catalogo.get(id as number)?.ds_rechazo ?? String(id), "motivo", "monto")
  const motivo_subio = topByDeltaAbs(motDeltas, "up")
  const motivo_bajo  = topByDeltaAbs(motDeltas, "down")

  // Chofer: tasa = hl_rechazados / total_hl_entregados.
  // Solo se incluyen patentes con denominador_confiable EN AMBOS períodos
  // (entregados_hl > 0 Y hl_rechazados <= entregados_hl). Si una patente falla
  // en cualquiera de los dos, queda fuera del top_variaciones.
  const aHl = aggBy(actualData.rechazos, r => r.ds_fletero_carga, r => Number(r.hl_rechazados ?? 0))
  const pHl = aggBy(previousData.rechazos, r => r.ds_fletero_carga, r => Number(r.hl_rechazados ?? 0))
  const pChoferEv = aggBy(previousData.rechazos, r => r.ds_fletero_carga, () => 1)
  const tasaActual = new Map<string, number>()
  const tasaPrevious = new Map<string, number>()
  for (const [pat, hl] of aHl) {
    const denom = actualData.ventasHlPorPatente.get(pat) ?? 0
    if (denom > 0 && hl <= denom) tasaActual.set(pat, (hl / denom) * 100)
  }
  for (const [pat, hl] of pHl) {
    const denom = previousData.ventasHlPorPatente.get(pat) ?? 0
    if (denom > 0 && hl <= denom) tasaPrevious.set(pat, (hl / denom) * 100)
  }
  const patentesConfiables = new Set<string>()
  for (const k of tasaActual.keys()) if (tasaPrevious.has(k)) patentesConfiables.add(k)
  const tasaActualF   = new Map([...tasaActual].filter(([k]) => patentesConfiables.has(k)))
  const tasaPreviousF = new Map([...tasaPrevious].filter(([k]) => patentesConfiables.has(k)))
  const choferDeltas = pairDeltas(
    tasaActualF, tasaPreviousF, pChoferEv,
    (pat) => mapeoMap.get(pat as string)?.chofer_nombre ?? String(pat),
    "chofer", "tasa",
  )
  const chofer_empeoro = topByDeltaAbs(choferDeltas, "up")
  const chofer_mejoro  = topByDeltaAbs(choferDeltas, "down")

  // Canal: monto
  const aCanal = aggBy(actualData.rechazos, r => r.ds_canal_mkt ?? "(sin canal)", r => Number(r.monto_neto ?? 0))
  const pCanal = aggBy(previousData.rechazos, r => r.ds_canal_mkt ?? "(sin canal)", r => Number(r.monto_neto ?? 0))
  const pCanalEv = aggBy(previousData.rechazos, r => r.ds_canal_mkt ?? "(sin canal)", () => 1)
  const canalDeltas = pairDeltas(aCanal, pCanal, pCanalEv, (k) => String(k), "canal", "monto")
  const canal_subio = topByDeltaAbs(canalDeltas, "up")
  const canal_bajo  = topByDeltaAbs(canalDeltas, "down")

  return { motivo_subio, motivo_bajo, chofer_mejoro, chofer_empeoro, canal_subio, canal_bajo }
}

function aggBy<K, T>(rows: T[], keyFn: (r: T) => K, valFn: (r: T) => number): Map<K, number> {
  const m = new Map<K, number>()
  for (const r of rows) {
    const k = keyFn(r)
    m.set(k, (m.get(k) ?? 0) + valFn(r))
  }
  return m
}

function pairDeltas<K extends string | number>(
  actualM: Map<K, number>, previousM: Map<K, number>,
  previousEventosM: Map<K, number>,
  labelFn: (k: K) => string, dim: TopVariacion["dim"], metric: TopVariacion["metric"],
): TopVariacion[] {
  const keys = new Set<K>([...actualM.keys(), ...previousM.keys()])
  const out: TopVariacion[] = []
  for (const k of keys) {
    const actual_value = actualM.get(k) ?? 0
    const previous_value = previousM.get(k) ?? 0
    const previous_eventos = previousEventosM.get(k) ?? 0
    const delta_abs = actual_value - previous_value
    const baseline_was_zero = previous_value === 0
    const delta_pct = baseline_was_zero ? 0 : ((actual_value - previous_value) / previous_value) * 100
    const baseline_low = !baseline_was_zero && isBaselineLow(metric, previous_value, previous_eventos)
    out.push({
      dim, id: k, label: labelFn(k), metric,
      actual_value, previous_value, previous_eventos,
      delta_abs, delta_pct, baseline_was_zero, baseline_low,
    })
  }
  return out
}

function isBaselineLow(metric: TopVariacion["metric"], previousValue: number, previousEventos: number): boolean {
  if (previousEventos < TOP_VARIACION_MIN_BASELINE_EVENTOS) return true
  if (metric === "monto" && previousValue < TOP_VARIACION_MIN_BASELINE_MONTO) return true
  return false
}

function topByDeltaAbs(arr: TopVariacion[], dir: "up" | "down"): TopVariacion | null {
  const filtered = arr.filter(v => dir === "up" ? v.delta_abs > 0 : v.delta_abs < 0)
  if (filtered.length === 0) return null
  filtered.sort((a, b) => Math.abs(b.delta_abs) - Math.abs(a.delta_abs))
  return filtered[0]
}

// ─────────────────────────────────────────────────────────────────────────
//  Alertas
// ─────────────────────────────────────────────────────────────────────────

function computeAlerts(args: {
  agg: RechazosComparado["agg"]
  actualKPI: RechazosKPI
  previousKPI: RechazosKPI
  previous2KPI: RechazosKPI
  top_variaciones: TopVariaciones
  tendenciaEval: AlertEvaluation
  mapeoMap: Map<string, MapeoChofer>
  rechazosActual: RechazoRow[]
}): Alert[] {
  const { agg, actualKPI, previousKPI, previous2KPI, top_variaciones, tendenciaEval, rechazosActual } = args
  const alerts: Alert[] = []

  // 1. Chofer con tasa > 2x avg — solo se evalúa sobre ranking_principal
  // (filas con denominador_confiable=true). Las otras se reportan aparte en agg.por_chofer.
  const avgTasa = actualKPI.tasa
  for (const ch of agg.por_chofer.ranking_principal) {
    if (avgTasa > 0 && ch.tasa >= avgTasa * 2) {
      alerts.push({
        severity: "rojo",
        category: "chofer",
        title: `${ch.display} con tasa ${ch.tasa.toFixed(1)}% (> 2× promedio)`,
        detail: `Promedio del período: ${avgTasa.toFixed(1)}%`,
        context_summary: null, // V1: solo motivos llevan context_summary
        drillTo: { tipo: "chofer", id: ch.patente },
      })
    }
  }

  // 2. Motivos: variación de monto vs período anterior
  const motSub = top_variaciones.motivo_subio
  if (motSub && !motSub.baseline_was_zero) {
    const idRechazo = typeof motSub.id === "number" ? motSub.id : Number(motSub.id)
    const ctx = Number.isFinite(idRechazo)
      ? buildMotivoContextSummary(idRechazo, rechazosActual, motSub)
      : null
    if (motSub.delta_pct >= 100) {
      alerts.push({
        severity: "rojo",
        category: "motivo",
        title: `Motivo "${motSub.label}" subió ${motSub.delta_pct.toFixed(0)}% en monto`,
        detail: `De $${motSub.previous_value.toFixed(0)} a $${motSub.actual_value.toFixed(0)}`,
        context_summary: ctx,
        drillTo: { tipo: "motivo", id: idRechazo },
      })
    } else if (motSub.delta_pct >= 50) {
      alerts.push({
        severity: "amarillo",
        category: "motivo",
        title: `Motivo "${motSub.label}" subió ${motSub.delta_pct.toFixed(0)}% en monto`,
        context_summary: ctx,
        drillTo: { tipo: "motivo", id: idRechazo },
      })
    }
  }

  // 3. Clientes con variaciones extremas
  // Construyo top de clientes que aumentaron monto
  // (no incluido en top_variaciones; calculo aparte)
  // Skip si no hay cliente en agg
  // (cliente aggregations no traen previous_value — para V1 no levantamos alert por cliente)

  // 4. Tendencia 3 períodos consecutivos en alza
  if (tendenciaEval === "available") {
    const subio_1 = actualKPI.tasa > previousKPI.tasa
    const subio_2 = previousKPI.tasa > previous2KPI.tasa
    if (subio_1 && subio_2) {
      alerts.push({
        severity: "amarillo",
        category: "tendencia",
        title: `Tasa global subió 3 períodos consecutivos`,
        detail: `${previous2KPI.tasa.toFixed(1)}% → ${previousKPI.tasa.toFixed(1)}% → ${actualKPI.tasa.toFixed(1)}%`,
        context_summary: null,
      })
    }
  }

  return alerts
}
