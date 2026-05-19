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
  errores: number | null
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

/** Targets mensuales: HL para fgli/roturas/faltantes; PPM para wqi. */
export interface WarehouseTargets {
  fgli: number | null
  roturas: number | null
  faltantes: number | null
  /** WQI objetivo en PPM = HL roturas presup. / HL ventas esperadas × 1M. */
  wqi: number | null
}

/**
 * Ventas esperadas en HL por mes — presupuesto, hoja "PRESUPUESTO 2026 MRP"
 * fila 17 ("Total en HL") del archivo cargado en dpo-app /presupuesto. Es el
 * denominador del target de WQI. Valores fijos por año: se agrega una entrada
 * nueva cuando se sube el presupuesto del año siguiente.
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
  /** Por fecha YYYY-MM-DD → valor (o null si no hay dato). */
  wqi: Record<string, number | null>
  fgli: Record<string, number | null>
  scl: Record<string, number | null>
  capacidad: Record<string, number | null>
  precision: Record<string, number | null>
  productividad: Record<string, number | null>
}

export interface WarehouseSerieDiaria extends WarehouseSerieBase {
  /** Sub-series de pérdida para la reunión de logística (acumulado MTD). */
  roturas: Record<string, number | null>
  faltantes: Record<string, number | null>
  /** Targets mensuales en HL del mes consultado. */
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
  }
  if (fechas.length === 0) {
    return {
      wqi: {},
      fgli: {},
      scl: {},
      capacidad: {},
      precision: {},
      productividad: {},
      roturas: {},
      faltantes: {},
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

  // roturas/faltantes/targets no están en el snapshot pre-cocinado → se leen
  // directo de serie-diaria (1 fetch cacheado; en el camino legacy es la
  // misma URL ya cacheada por fetchJsonSafe).
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

  for (const f of fechas) {
    const dia = dias[f]
    const visible = f <= fechaReunion
    // WQI: hasta el día ANTERIOR a la reunión — la reunión analiza el
    // valor de ayer, no el del día en curso (recién arranca).
    wqi[f] = f < fechaReunion ? (dia?.wqi ?? null) : null
    // FGLI/SCL: hasta la fecha de la reunión inclusive (acumulado MTD)
    fgli[f] = visible ? (dia?.fgli ?? null) : null
    scl[f] = visible ? (dia?.scl ?? null) : null
    // Resto: valor del día (la grilla los muestra todos, no oculta futuro)
    capacidad[f] = dia?.capacidad ?? null
    precision[f] = dia?.precision ?? null
    productividad[f] = dia?.productividad ?? null
  }

  return { wqi, fgli, scl, capacidad, precision, productividad }
}

// ────────────────────────────────────────────────────────────────────
// Builder: apertura por operador para una fecha específica
// ────────────────────────────────────────────────────────────────────

export async function buildAperturaPickingDelDia(
  fecha: string,
  overridesHlHh: Map<OperadorApertura, number | null>,
): Promise<AperturaPickingDelDia> {
  const snap = await fetchSnapshot()
  if (snap && snap.dias && snap.dias[fecha]) {
    return buildAperturaFromSnapshot(fecha, snap.dias[fecha], overridesHlHh)
  }
  return buildAperturaLegacy(fecha, overridesHlHh)
}

function buildAperturaFromSnapshot(
  fecha: string,
  dia: SnapshotDia,
  overridesHlHh: Map<OperadorApertura, number | null>,
): AperturaPickingDelDia {
  const filas: OperadorAperturaRow[] = OPERADORES_APERTURA.map((alias) => {
    const op = dia.apertura?.[alias] ?? null
    const bultos = op?.bultos ?? null
    const errores = op?.errores ?? null
    const precision = op?.precision ?? null
    const bul_hh_auto = op?.bul_hh ?? null
    const manual = overridesHlHh.get(alias) ?? null
    const efectivo = manual !== null ? manual : bul_hh_auto
    return {
      operador: alias,
      bultos,
      errores,
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
  wqi: Record<string, number | null>
  fgli: Record<string, number | null>
  scl: Record<string, number | null>
  roturas?: Record<string, number | null>
  faltantes?: Record<string, number | null>
  precision?: Record<string, number | null>
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
    // WQI: hasta el día anterior a la reunión (analiza el valor de ayer).
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
  for (const f of fechas) {
    const apertura = computeAperturaLegacy(
      f,
      filasProdPorFecha.get(f) ?? [],
      erroresPorFecha.get(f) ?? new Map<string, number>(),
      new Map<OperadorApertura, number | null>(),
    )
    precision[f] = apertura.precision_promedio
    productividad[f] = apertura.productividad_promedio_bul_hh
  }

  return { wqi, fgli, scl, capacidad, precision, productividad }
}

/**
 * roturas/faltantes (acumulado MTD, sólo hasta la fecha de reunión) y los
 * targets del mes en HL. Se leen directo de /api/indicadores/serie-diaria
 * porque el snapshot pre-cocinado no los incluye.
 */
async function fetchSerieExtra(
  fechas: string[],
  fechaReunion: string,
): Promise<{
  roturas: Record<string, number | null>
  faltantes: Record<string, number | null>
  precision: Record<string, number | null>
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
  // Precisión de picking: valor del día (no acumulado, no se oculta el día
  // en curso). El snapshot no la trae — viene de este endpoint cacheado.
  const precision: Record<string, number | null> = {}
  for (const f of fechas) {
    const visible = f <= fechaReunion
    roturas[f] = visible ? (res?.roturas?.[f] ?? null) : null
    faltantes[f] = visible ? (res?.faltantes?.[f] ?? null) : null
    precision[f] = res?.precision?.[f] ?? null
  }

  // Target de WQI (PPM): HL de roturas presupuestadas / HL de ventas
  // esperadas del mes × 1M. Las roturas presupuestadas vienen del endpoint;
  // las ventas esperadas, de la tabla fija del presupuesto.
  const roturasTarget = res?.targets?.roturas ?? null
  const ventasHl = VENTAS_HL_PRESUPUESTO[year]?.[month] ?? null
  const wqiTarget =
    roturasTarget !== null && ventasHl
      ? Math.round((roturasTarget / ventasHl) * 1_000_000)
      : null

  return {
    roturas,
    faltantes,
    precision,
    targets: {
      fgli: res?.targets?.fgli ?? null,
      roturas: roturasTarget,
      faltantes: res?.targets?.faltantes ?? null,
      wqi: wqiTarget,
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
    const erroresVal = hayError ? errores : bulHhCnt > 0 ? 0 : null
    // Sin raw bultos no podemos calcular precision por operador
    const precision = null
    const manual = overridesHlHh.get(alias) ?? null
    const efectivo = manual !== null ? manual : bul_hh_auto

    return {
      operador: alias,
      bultos: null,
      errores: erroresVal,
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
