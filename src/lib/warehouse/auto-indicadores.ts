/**
 * Indicadores AUTO para reuniones de tipo 'warehouse' / 'logistica'.
 *
 * Lee un snapshot diario pre-cocinado del blob `shared/warehouse-kpi-diario`
 * (1 sola URL chica). El snapshot lo genera un pusher local
 * (push_warehouse_kpi.ps1, Scheduled Task `WMS-WarehouseKPI-Push`) que junta:
 *   - /api/indicadores/serie-diaria        → WQI (PPM), FGLI (HL), SCL ($)
 *   - /api/shared/load?module=ocupacion    → Capacidad utilizada por día
 *   - /api/shared/load?module=productividad-picking → bul/HH por operario
 *   - Google Sheet "Errores picking"        → errores por operario
 * y computa por día apertura por operador (Troli/Galvez/Ovejero).
 *
 * Esto reemplaza al esquema anterior que hacía 4 fetches en cada apertura
 * de reunión y tardaba 5-15s en cold start. Ahora la apertura solo lee 1
 * JSON pre-cocinado (<500ms).
 *
 * Fallback: si el snapshot no existe todavía, se llama a la versión legacy
 * que computa on-the-fly (mantiene compatibilidad).
 */

// ────────────────────────────────────────────────────────────────────
// Configuración
// ────────────────────────────────────────────────────────────────────

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"
// Objetivo de venta mensual (HL) por categoría — denominador del target WQI.
// Alias estable del team (mismo que consume Acarreo-RDF para planificador).
const CHESS_DASHBOARD_BASE = "https://chess-dashboard-mercosurdrps-projects.vercel.app"
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1K7zWrhFFx7SBoTxZ6Dk93ZrgO05kULlGvxL6ahmUYTA/gviz/tq?tqx=out:csv&sheet=Errores%20picking"

export const OPERADORES_APERTURA = ["Troli", "Galvez", "Ovejero"] as const
export type OperadorApertura = (typeof OPERADORES_APERTURA)[number]

/**
 * Matching case-insensitive de "contains". PRUEBA1 = Hugo Ovejero histórico
 * (era su sesión antes de tener registro propio — sus bultos siguen siendo de él).
 */
function matchOperador(
  nombreFuente: string,
  alias: OperadorApertura,
): boolean {
  const upper = nombreFuente.trim().toUpperCase()
  if (alias === "Ovejero" && upper === "PRUEBA1") return true
  return upper.includes(alias.toUpperCase())
}

// ────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────

export interface OperadorAperturaRow {
  operador: OperadorApertura
  bultos: number | null
  /** Bultos involucrados en errores (col "CANTIDAD DE BULTOS" del Sheet). */
  errores: number | null
  /** Cantidad de errores = filas del Sheet "Errores picking" del operador. */
  errores_count: number | null
  /** 0..1 (donde 1 = sin errores). null si no hay bultos. */
  precision: number | null
  bul_hh_auto: number | null
  bul_hh_manual: number | null
  bul_hh_efectivo: number | null
}

export interface AperturaPickingDelDia {
  fecha: string
  filas: OperadorAperturaRow[]
  /** Promedio de los 3 (efectivo). null si no hay datos. */
  productividad_promedio_bul_hh: number | null
  /** Promedio de las 3 precisiones. null si no hay datos. */
  precision_promedio: number | null
}

/** Targets mensuales: HL para fgli/roturas/faltantes; PPM para wqi; $ para scl. */
export interface WarehouseTargets {
  fgli: number | null
  roturas: number | null
  faltantes: number | null
  /** WQI objetivo en PPM = HL roturas presup. / HL ventas esperadas × 1M. */
  wqi: number | null
  /** SCL objetivo en $ = roturas + faltantes + vencidos del presupuesto $. */
  scl: number | null
  /** WNP objetivo en HL/HH = (HL ventas presup. − pérdidas presup.) / horas plan. */
  wnp: number | null
}

/**
 * Ventas esperadas en HL por mes — presupuesto, hoja "PRESUPUESTO 2026 MRP"
 * fila 17 ("Total en HL") del archivo cargado en dpo-app /presupuesto.
 *
 * Denominador del target de WNP, y FALLBACK del denominador del target de WQI:
 * para el WQI el valor preferido es el objetivo de venta del mes cargado en
 * chess-dashboard /gerencial (ver fetchObjetivoVentaHl); esta tabla fija se usa
 * sólo si ese objetivo no está cargado o el fetch falla. Valores fijos por año.
 */
const VENTAS_HL_PRESUPUESTO: Record<number, Record<number, number>> = {
  2026: {
    1: 12764.48, 2: 11759.19, 3: 9190.44, 4: 9157.13,
    5: 10611.85, 6: 7065.16, 7: 9706.19, 8: 9376.89,
    9: 9886.44, 10: 11303.44, 11: 11279.08, 12: 15986.61,
  },
}

/** Series que provee el snapshot pre-cocinado (o el fallback legacy). */
export interface WarehouseSerieBase {
  /** Por fecha YYYY-MM-DD → valor (o null si no hay dato). MTD acumulado. */
  wqi: Record<string, number | null>
  fgli: Record<string, number | null>
  scl: Record<string, number | null>
  capacidad: Record<string, number | null>
  precision: Record<string, number | null>
  productividad: Record<string, number | null>
  /** Cantidad de errores de picking del día (filas del Sheet, cada fila = 1 error). */
  errores_dia: Record<string, number | null>
}

export interface WarehouseSerieDiaria extends WarehouseSerieBase {
  /** Sub-series de pérdida para la reunión de logística (acumulado MTD). */
  roturas: Record<string, number | null>
  faltantes: Record<string, number | null>
  /** WNP = productividad total del almacén (HL/HH). Acumulado MTD. */
  wnp: Record<string, number | null>
  /** Valores DEL DÍA (no acumulado). Para mostrar en cada celda de la grilla. */
  wqi_dia: Record<string, number | null>
  fgli_dia: Record<string, number | null>
  scl_dia: Record<string, number | null>
  roturas_dia: Record<string, number | null>
  faltantes_dia: Record<string, number | null>
  wnp_dia: Record<string, number | null>
  /** Errores por operador por día (para el drill-down). { fecha: { Troli/Galvez/Ovejero: count } } */
  errores_por_operador_dia: Record<string, Record<string, number>>
  /** Targets mensuales del mes consultado. */
  targets: WarehouseTargets
}

// ────────────────────────────────────────────────────────────────────
// Fetches con tolerancia a fallos + cache in-memory por proceso
// ────────────────────────────────────────────────────────────────────
//
// El snapshot es chiquito (~50KB para un año) y se regenera 1 vez al día,
// asi que cacheamos 1 hora en memoria. Si el cache vence o el pusher falla,
// caemos al legacy path (4 fetches en paralelo con cache de 5min como ya hacía).

const EXTERNAL_FETCH_TTL_MS = 5 * 60 * 1000
const SNAPSHOT_TTL_MS = 60 * 60 * 1000
const EXTERNAL_FETCH_TIMEOUT_MS = 5000

type CacheEntry = { value: unknown; expiresAt: number }
const externalCache = new Map<string, CacheEntry>()

function readCache<T>(url: string): T | undefined {
  const entry = externalCache.get(url)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    externalCache.delete(url)
    return undefined
  }
  return entry.value as T
}

function writeCache(url: string, value: unknown, ttlMs = EXTERNAL_FETCH_TTL_MS) {
  externalCache.set(url, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

async function fetchJsonSafe<T>(url: string, ttlMs?: number): Promise<T | null> {
  const cached = readCache<T | null>(url)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as T
    writeCache(url, data, ttlMs)
    return data
  } catch {
    return null
  }
}

async function fetchTextSafe(url: string): Promise<string | null> {
  const cached = readCache<string | null>(url)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const text = await res.text()
    writeCache(url, text)
    return text
  } catch {
    return null
  }
}

// ────────────────────────────────────────────────────────────────────
// Snapshot pre-cocinado (camino principal)
// ────────────────────────────────────────────────────────────────────

interface SnapshotApertura {
  bultos: number | null
  horas: number | null
  errores: number | null
  precision: number | null
  bul_hh: number | null
}

interface SnapshotDia {
  wqi: number | null
  fgli: number | null
  scl: number | null
  capacidad: number | null
  precision: number | null
  productividad: number | null
  apertura: Record<string, SnapshotApertura>
}

interface SnapshotResponse {
  data?: {
    generado_en?: string
    anio?: number
    dias?: Record<string, SnapshotDia>
  } | null
}

async function fetchSnapshot(): Promise<SnapshotResponse["data"] | null> {
  const res = await fetchJsonSafe<SnapshotResponse>(
    `${DEPOSITO_API_BASE}/api/shared/load?module=warehouse-kpi-diario`,
    SNAPSHOT_TTL_MS,
  )
  return res?.data ?? null
}

// ────────────────────────────────────────────────────────────────────
// Builder principal: serie diaria del mes para la grilla
// ────────────────────────────────────────────────────────────────────

export async function buildWarehouseSerieDiaria(
  fechas: string[],
  fechaReunion: string,
): Promise<WarehouseSerieDiaria> {
  const sinTargets: WarehouseTargets = {
    fgli: null,
    roturas: null,
    faltantes: null,
    wqi: null,
    scl: null,
    wnp: null,
  }
  if (fechas.length === 0) {
    return {
      wqi: {},
      fgli: {},
      scl: {},
      capacidad: {},
      precision: {},
      productividad: {},
      errores_dia: {},
      roturas: {},
      faltantes: {},
      wnp: {},
      wqi_dia: {},
      fgli_dia: {},
      scl_dia: {},
      roturas_dia: {},
      faltantes_dia: {},
      wnp_dia: {},
      errores_por_operador_dia: {},
      targets: sinTargets,
    }
  }

  const snap = await fetchSnapshot()
  const base: WarehouseSerieBase =
    snap && snap.dias
      ? buildSerieFromSnapshot(fechas, fechaReunion, snap.dias)
      : // Fallback: si el snapshot no existe (primera vez, o pusher caído),
        // pegar a las 4 fuentes originales.
        await buildSerieLegacy(fechas, fechaReunion)

  // roturas/faltantes/targets + series diarias no están en el snapshot
  // pre-cocinado → se leen directo de serie-diaria (1 fetch cacheado;
  // en el camino legacy es la misma URL ya cacheada por fetchJsonSafe).
  const extra = await fetchSerieExtra(fechas, fechaReunion)

  return { ...base, ...extra }
}

function buildSerieFromSnapshot(
  fechas: string[],
  fechaReunion: string,
  dias: Record<string, SnapshotDia>,
): WarehouseSerieBase {
  const wqi: Record<string, number | null> = {}
  const fgli: Record<string, number | null> = {}
  const scl: Record<string, number | null> = {}
  const capacidad: Record<string, number | null> = {}
  const precision: Record<string, number | null> = {}
  const productividad: Record<string, number | null> = {}
  const errores_dia: Record<string, number | null> = {}

  for (const f of fechas) {
    const dia = dias[f]
    const visible = f <= fechaReunion
    // WQI/FGLI/SCL: serie MTD acumulada. Sólo se conserva para que la
    // columna MTD del indicador tome el último acumulado del mes; las
    // celdas diarias se renderizan con la serie *_dia (ver fetchSerieExtra).
    // WQI oculta el día de la reunión (cierre de hoy aún no confirmado en el
    // matinal): el MTD toma el último acumulado hasta el día anterior.
    wqi[f] = f < fechaReunion ? (dia?.wqi ?? null) : null
    fgli[f] = visible ? (dia?.fgli ?? null) : null
    scl[f] = visible ? (dia?.scl ?? null) : null
    // Resto: valor del día (la grilla los muestra todos, no oculta futuro)
    capacidad[f] = dia?.capacidad ?? null
    productividad[f] = dia?.productividad ?? null
    // Precisión: ocultar el día actual y futuros (aún no se pickeó →
    // no hay errores cargados, el valor sería falso 100%).
    precision[f] = f < fechaReunion ? (dia?.precision ?? null) : null

    // errores_dia (cantidad de errores) lo provee fetchSerieExtra desde
    // el endpoint serie-diaria (cuenta filas del Sheet). El snapshot
    // pre-cocinado expone `op.errores` que es BULTOS errados, no conteo.
    errores_dia[f] = null
  }

  return { wqi, fgli, scl, capacidad, precision, productividad, errores_dia }
}

// ────────────────────────────────────────────────────────────────────
// Builder: apertura por operador para una fecha específica
// ────────────────────────────────────────────────────────────────────

export async function buildAperturaPickingDelDia(
  fecha: string,
  overridesHlHh: Map<OperadorApertura, number | null>,
): Promise<AperturaPickingDelDia> {
  // Conteo de errores por operador (= filas del Sheet). Se enriquece
  // sobre la apertura, que el snapshot expone con bultos errados.
  const erroresPorOpPromise = fetchErroresCountPorOperador(fecha)
  const snap = await fetchSnapshot()
  const base =
    snap && snap.dias && snap.dias[fecha]
      ? buildAperturaFromSnapshot(fecha, snap.dias[fecha], overridesHlHh)
      : await buildAperturaLegacy(fecha, overridesHlHh)
  const erroresPorOp = await erroresPorOpPromise
  if (erroresPorOp) {
    for (const fila of base.filas) {
      const c = erroresPorOp[fila.operador]
      fila.errores_count = typeof c === "number" ? c : 0
    }
  }
  return base
}

/** Trae { Troli, Galvez, Ovejero } con la cantidad de errores (= filas
 *  del Sheet "Errores picking") de un día puntual. */
async function fetchErroresCountPorOperador(
  fecha: string,
): Promise<Record<string, number> | null> {
  const partes = fecha.split("-").map((s) => parseInt(s, 10))
  const year = partes[0]
  const month = partes[1]
  if (!year || !month) return null
  const res = await fetchJsonSafe<DepositoIndicadoresSerieDiaria>(
    `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
  )
  return res?.errores_count_por_operador_dia?.[fecha] ?? null
}

function buildAperturaFromSnapshot(
  fecha: string,
  dia: SnapshotDia,
  overridesHlHh: Map<OperadorApertura, number | null>,
): AperturaPickingDelDia {
  const filas: OperadorAperturaRow[] = OPERADORES_APERTURA.map((alias) => {
    const op = dia.apertura?.[alias] ?? null
    const bultos = op?.bultos ?? null
    // Errores: entero por definición. Si el Sheet trae decimal (carga
    // erronea), lo redondeamos para que el drill no muestre coma.
    const errores =
      op?.errores !== null && op?.errores !== undefined
        ? Math.round(op.errores)
        : null
    const precision = op?.precision ?? null
    const bul_hh_auto = op?.bul_hh ?? null
    const manual = overridesHlHh.get(alias) ?? null
    const efectivo = manual !== null ? manual : bul_hh_auto
    return {
      operador: alias,
      bultos,
      errores,
      errores_count: null,
      precision,
      bul_hh_auto,
      bul_hh_manual: manual,
      bul_hh_efectivo: efectivo,
    }
  })

  // Aplicar overrides manuales al promedio de productividad si los hay.
  const tieneOverride = Array.from(overridesHlHh.values()).some(
    (v) => v !== null,
  )
  let productividad_promedio_bul_hh = dia.productividad ?? null
  if (tieneOverride) {
    const efectivos = filas
      .map((f) => f.bul_hh_efectivo)
      .filter((v): v is number => v !== null && Number.isFinite(v))
    productividad_promedio_bul_hh =
      efectivos.length > 0
        ? Math.round(
            (efectivos.reduce((a, b) => a + b, 0) / efectivos.length) * 10,
          ) / 10
        : null
  }

  return {
    fecha,
    filas,
    precision_promedio: dia.precision ?? null,
    productividad_promedio_bul_hh,
  }
}

// ────────────────────────────────────────────────────────────────────
// Legacy: cómputo on-the-fly desde las 4 fuentes
// (Se usa SOLO si el snapshot no existe — primera vez tras el deploy o si
// el pusher se cayó. Mantiene la app funcional sin depender del snapshot.)
// ────────────────────────────────────────────────────────────────────

function parseCsvRow(line: string): string[] {
  const cells: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') {
        inQuote = false
      } else cur += c
    } else {
      if (c === '"') inQuote = true
      else if (c === ",") {
        cells.push(cur)
        cur = ""
      } else cur += c
    }
  }
  cells.push(cur)
  return cells
}

function parseFechaSheet(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

function parseDecimalEs(s: string): number {
  const n = parseFloat(s.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

async function fetchErroresPickingPorFecha(): Promise<
  Map<string, Map<string, number>>
> {
  const out = new Map<string, Map<string, number>>()
  const csv = await fetchTextSafe(SHEET_URL)
  if (!csv) return out

  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return out

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i])
    if (cells.length < 3) continue
    const fecha = parseFechaSheet(cells[0])
    if (!fecha) continue
    const operario = cells[1]?.trim() ?? ""
    if (!operario) continue
    const bultos = parseDecimalEs(cells[2] ?? "0")
    if (!Number.isFinite(bultos) || bultos <= 0) continue

    let porOp = out.get(fecha)
    if (!porOp) {
      porOp = new Map()
      out.set(fecha, porOp)
    }
    porOp.set(operario, (porOp.get(operario) ?? 0) + bultos)
  }
  return out
}

interface DepositoIndicadoresSerieDiaria {
  year: number
  month: number
  /** Σ horas planificadas del mes (72h L-V / 32h sáb). Denominador del target WNP. */
  horas_plan_mes?: number
  wqi: Record<string, number | null>
  fgli: Record<string, number | null>
  scl: Record<string, number | null>
  roturas?: Record<string, number | null>
  faltantes?: Record<string, number | null>
  wnp?: Record<string, number | null>
  wqi_dia?: Record<string, number | null>
  fgli_dia?: Record<string, number | null>
  scl_dia?: Record<string, number | null>
  roturas_dia?: Record<string, number | null>
  faltantes_dia?: Record<string, number | null>
  wnp_dia?: Record<string, number | null>
  precision?: Record<string, number | null>
  errores_count_dia?: Record<string, number>
  errores_count_por_operador_dia?: Record<string, Record<string, number>>
  targets?: Partial<WarehouseTargets>
}

interface DepositoOcupacionShared {
  data?: {
    historico?: Array<{ fecha: string; pct_ocupacion?: number | null }>
  } | null
}

interface ProductividadFila {
  fecha: string
  operario: string
  bul_hh?: number
}

interface DepositoProductividad {
  data?: {
    filas?: ProductividadFila[]
  } | null
}

function fechaOcupacionAIso(raw: string, anioRef: number): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  return `${anioRef}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

async function buildSerieLegacy(
  fechas: string[],
  fechaReunion: string,
): Promise<WarehouseSerieBase> {
  const partes = fechaReunion.split("-").map((s) => parseInt(s, 10))
  const year = partes[0]
  const month = partes[1]

  const [serieRes, ocupacionRes, productividadRes, erroresPorFecha] =
    await Promise.all([
      fetchJsonSafe<DepositoIndicadoresSerieDiaria>(
        `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      ),
      fetchJsonSafe<DepositoOcupacionShared>(
        `${DEPOSITO_API_BASE}/api/shared/load?module=ocupacion`,
      ),
      fetchJsonSafe<DepositoProductividad>(
        `${DEPOSITO_API_BASE}/api/shared/load?module=productividad-picking`,
      ),
      fetchErroresPickingPorFecha(),
    ])

  const wqi: Record<string, number | null> = {}
  const fgli: Record<string, number | null> = {}
  const scl: Record<string, number | null> = {}
  for (const f of fechas) {
    const visible = f <= fechaReunion
    // Serie MTD acumulada — sólo se usa para el MTD del indicador.
    // Las celdas diarias se renderizan con la serie *_dia (fetchSerieExtra).
    // WQI oculta el día de la reunión (cierre de hoy aún no confirmado): el
    // MTD toma el último acumulado hasta el día anterior.
    wqi[f] = f < fechaReunion ? (serieRes?.wqi?.[f] ?? null) : null
    fgli[f] = visible ? (serieRes?.fgli?.[f] ?? null) : null
    scl[f] = visible ? (serieRes?.scl?.[f] ?? null) : null
  }

  const capacidad: Record<string, number | null> = {}
  const historicoOcup = ocupacionRes?.data?.historico ?? []
  const ocupPorFecha = new Map<string, number>()
  for (const punto of historicoOcup) {
    const isoFecha = fechaOcupacionAIso(punto.fecha, year)
    if (isoFecha && punto.pct_ocupacion != null) {
      ocupPorFecha.set(isoFecha, punto.pct_ocupacion)
    }
  }
  for (const f of fechas) {
    capacidad[f] = ocupPorFecha.get(f) ?? null
  }

  const filasProd = productividadRes?.data?.filas ?? []
  const filasProdPorFecha = new Map<string, ProductividadFila[]>()
  for (const fila of filasProd) {
    let arr = filasProdPorFecha.get(fila.fecha)
    if (!arr) {
      arr = []
      filasProdPorFecha.set(fila.fecha, arr)
    }
    arr.push(fila)
  }

  const precision: Record<string, number | null> = {}
  const productividad: Record<string, number | null> = {}
  const errores_dia: Record<string, number | null> = {}
  for (const f of fechas) {
    const apertura = computeAperturaLegacy(
      f,
      filasProdPorFecha.get(f) ?? [],
      erroresPorFecha.get(f) ?? new Map<string, number>(),
      new Map<OperadorApertura, number | null>(),
    )
    // Misma máscara que el path snapshot: precisión oculta para día
    // actual y futuros.
    precision[f] = f < fechaReunion ? apertura.precision_promedio : null
    productividad[f] = apertura.productividad_promedio_bul_hh
    // errores_dia (conteo) lo provee fetchSerieExtra desde el endpoint
    // serie-diaria (cuenta filas del Sheet).
    errores_dia[f] = null
  }

  return { wqi, fgli, scl, capacidad, precision, productividad, errores_dia }
}

interface ObjetivoVentaResponse {
  total?: number | null
}

/**
 * Total de venta esperada del mes en HL (cervezas+aguas+ung) desde
 * chess-dashboard /gerencial (empresa pampeana, que es la operación del módulo
 * warehouse). Denominador preferido del target de WQI. Devuelve null si el fetch
 * falla o el mes no tiene objetivo cargado (total 0), para que el caller caiga
 * al presupuesto fijo.
 */
async function fetchObjetivoVentaHl(
  year: number,
  month: number,
): Promise<number | null> {
  const res = await fetchJsonSafe<ObjetivoVentaResponse>(
    `${CHESS_DASHBOARD_BASE}/api/objetivos-venta?anio=${year}&mes=${month}&empresa=pampeana`,
  )
  const total = res?.total
  return typeof total === "number" && total > 0 ? total : null
}

/**
 * Trae de /api/indicadores/serie-diaria:
 *  - Series MTD acumuladas (roturas/faltantes) para que la columna MTD del
 *    indicador tome el último acumulado del mes.
 *  - Series DIARIAS (wqi_dia/fgli_dia/scl_dia/roturas_dia/faltantes_dia) que
 *    son las que se renderizan en cada celda de la grilla.
 *  - Precisión del día (ya enmascarada en el snapshot, acá se hace lo mismo
 *    como red de seguridad para el path legacy).
 *  - Targets mensuales (HL para roturas/faltantes/fgli, PPM para WQI, $ para SCL).
 */
async function fetchSerieExtra(
  fechas: string[],
  fechaReunion: string,
): Promise<{
  roturas: Record<string, number | null>
  faltantes: Record<string, number | null>
  wnp: Record<string, number | null>
  wqi_dia: Record<string, number | null>
  fgli_dia: Record<string, number | null>
  scl_dia: Record<string, number | null>
  roturas_dia: Record<string, number | null>
  faltantes_dia: Record<string, number | null>
  wnp_dia: Record<string, number | null>
  precision: Record<string, number | null>
  errores_dia: Record<string, number | null>
  errores_por_operador_dia: Record<string, Record<string, number>>
  targets: WarehouseTargets
}> {
  const partes = fechaReunion.split("-").map((s) => parseInt(s, 10))
  const year = partes[0]
  const month = partes[1]
  const res = await fetchJsonSafe<DepositoIndicadoresSerieDiaria>(
    `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
  )

  const roturas: Record<string, number | null> = {}
  const faltantes: Record<string, number | null> = {}
  const wnp: Record<string, number | null> = {}
  const wqi_dia: Record<string, number | null> = {}
  const fgli_dia: Record<string, number | null> = {}
  const scl_dia: Record<string, number | null> = {}
  const roturas_dia: Record<string, number | null> = {}
  const faltantes_dia: Record<string, number | null> = {}
  const wnp_dia: Record<string, number | null> = {}
  const precision: Record<string, number | null> = {}
  const errores_dia: Record<string, number | null> = {}
  const errores_por_operador_dia: Record<string, Record<string, number>> = {}
  for (const f of fechas) {
    // FGLI y SCL conservan el día en curso.
    const visible = f <= fechaReunion
    // WQI, roturas, faltantes y WNP ocultan el día de la reunión (y futuros): a
    // la hora del matinal el cierre de hoy todavía no está confirmado, igual que
    // precisión, errores y ausentismo. Se muestran hasta el último día cerrado.
    const cerrado = f < fechaReunion
    roturas[f] = cerrado ? (res?.roturas?.[f] ?? null) : null
    faltantes[f] = cerrado ? (res?.faltantes?.[f] ?? null) : null
    wnp[f] = cerrado ? (res?.wnp?.[f] ?? null) : null
    wqi_dia[f] = cerrado ? (res?.wqi_dia?.[f] ?? null) : null
    fgli_dia[f] = visible ? (res?.fgli_dia?.[f] ?? null) : null
    scl_dia[f] = visible ? (res?.scl_dia?.[f] ?? null) : null
    roturas_dia[f] = cerrado ? (res?.roturas_dia?.[f] ?? null) : null
    faltantes_dia[f] = cerrado ? (res?.faltantes_dia?.[f] ?? null) : null
    wnp_dia[f] = cerrado ? (res?.wnp_dia?.[f] ?? null) : null
    // Precisión y errores: ocultar día actual y futuros (todavía no se pickeó).
    precision[f] = f < fechaReunion ? (res?.precision?.[f] ?? null) : null
    if (f < fechaReunion) {
      const cnt = res?.errores_count_dia?.[f]
      errores_dia[f] = typeof cnt === "number" ? cnt : null
      const porOp = res?.errores_count_por_operador_dia?.[f]
      if (porOp) errores_por_operador_dia[f] = porOp
    } else {
      errores_dia[f] = null
    }
  }

  // Target de WQI (PPM): HL de roturas presupuestadas / HL de ventas
  // esperadas del mes × 1M. Roturas presupuestadas: del endpoint serie-diaria.
  // Ventas esperadas: objetivo de venta del mes cargado en chess-dashboard
  // /gerencial (cervezas+aguas+ung); si no está cargado o el fetch falla, se cae
  // al presupuesto fijo (ventasHl). El target de WNP, más abajo, sigue usando el
  // presupuesto.
  const roturasTarget = res?.targets?.roturas ?? null
  const ventasHl = VENTAS_HL_PRESUPUESTO[year]?.[month] ?? null
  const ventasHlWqi = (await fetchObjetivoVentaHl(year, month)) ?? ventasHl
  const wqiTarget =
    roturasTarget !== null && ventasHlWqi
      ? Math.round((roturasTarget / ventasHlWqi) * 1_000_000)
      : null

  // Target de WNP (HL/HH): (HL ventas presupuestadas − pérdidas presupuestadas)
  // / horas planificadas del mes. Ventas esperadas de la tabla fija del
  // presupuesto; pérdidas (targets.fgli) y horas plan. del endpoint de deposito.
  const perdidasHl = res?.targets?.fgli ?? 0
  const horasPlan = res?.horas_plan_mes ?? null
  const wnpTarget =
    ventasHl && horasPlan
      ? Math.round(((ventasHl - perdidasHl) / horasPlan) * 100) / 100
      : null

  return {
    roturas,
    faltantes,
    wnp,
    wqi_dia,
    fgli_dia,
    scl_dia,
    roturas_dia,
    faltantes_dia,
    wnp_dia,
    precision,
    errores_dia,
    errores_por_operador_dia,
    targets: {
      fgli: res?.targets?.fgli ?? null,
      roturas: roturasTarget,
      faltantes: res?.targets?.faltantes ?? null,
      wqi: wqiTarget,
      scl: res?.targets?.scl ?? null,
      wnp: wnpTarget,
    },
  }
}

async function buildAperturaLegacy(
  fecha: string,
  overridesHlHh: Map<OperadorApertura, number | null>,
): Promise<AperturaPickingDelDia> {
  const [productividadRes, erroresPorFecha] = await Promise.all([
    fetchJsonSafe<DepositoProductividad>(
      `${DEPOSITO_API_BASE}/api/shared/load?module=productividad-picking`,
    ),
    fetchErroresPickingPorFecha(),
  ])

  const filasProd = (productividadRes?.data?.filas ?? []).filter(
    (f) => f.fecha === fecha,
  )
  const erroresDelDia = erroresPorFecha.get(fecha) ?? new Map<string, number>()
  return computeAperturaLegacy(fecha, filasProd, erroresDelDia, overridesHlHh)
}

function computeAperturaLegacy(
  fecha: string,
  filasProd: ProductividadFila[],
  erroresDelDia: Map<string, number>,
  overridesHlHh: Map<OperadorApertura, number | null>,
): AperturaPickingDelDia {
  const filas: OperadorAperturaRow[] = OPERADORES_APERTURA.map((alias) => {
    // El scraper actual sólo expone `bul_hh` (rate). Si hubiera varias filas
    // del mismo operador en el día (no debería: dedupea por fecha|operario),
    // tomamos el promedio.
    let bulHhSum = 0
    let bulHhCnt = 0
    for (const f of filasProd) {
      if (!matchOperador(f.operario, alias)) continue
      if (typeof f.bul_hh === "number" && Number.isFinite(f.bul_hh)) {
        bulHhSum += f.bul_hh
        bulHhCnt++
      }
    }

    let errores = 0
    let hayError = false
    for (const [nombre, errBultos] of erroresDelDia.entries()) {
      if (matchOperador(nombre, alias)) {
        errores += errBultos
        hayError = true
      }
    }

    const bul_hh_auto =
      bulHhCnt > 0 ? Math.round((bulHhSum / bulHhCnt) * 10) / 10 : null
    // Errores: entero por definición (redondea si el Sheet trae decimal).
    const erroresVal = hayError ? Math.round(errores) : bulHhCnt > 0 ? 0 : null
    // Sin raw bultos no podemos calcular precision por operador
    const precision = null
    const manual = overridesHlHh.get(alias) ?? null
    const efectivo = manual !== null ? manual : bul_hh_auto

    return {
      operador: alias,
      bultos: null,
      errores: erroresVal,
      errores_count: null,
      precision,
      bul_hh_auto,
      bul_hh_manual: manual,
      bul_hh_efectivo: efectivo,
    }
  })

  const productividades = filas
    .map((a) => a.bul_hh_efectivo)
    .filter((v): v is number => v !== null)
  const productividad_promedio_bul_hh =
    productividades.length > 0
      ? Math.round(
          (productividades.reduce((a, b) => a + b, 0) /
            productividades.length) *
            10,
        ) / 10
      : null

  return {
    fecha,
    filas,
    precision_promedio: null,
    productividad_promedio_bul_hh,
  }
}
