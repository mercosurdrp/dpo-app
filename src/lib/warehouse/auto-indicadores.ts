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
 * y computa por día apertura por operador (Troli/Galvez/Ovejero/Selenzo).
 *
 * Esto reemplaza al esquema anterior que hacía 4 fetches en cada apertura
 * de reunión y tardaba 5-15s en cold start. Ahora la apertura solo lee 1
 * JSON pre-cocinado (<500ms).
 *
 * Fallback: si el snapshot no existe todavía, se llama a la versión legacy
 * que computa on-the-fly (mantiene compatibilidad).
 */

import { diaAnterior, esFeriado } from "@/lib/feriados-ar"

// ────────────────────────────────────────────────────────────────────
// Configuración
// ────────────────────────────────────────────────────────────────────

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"
// Objetivo de venta mensual (HL) por categoría — denominador del target WQI.
// Alias estable del team (mismo que consume Acarreo-RDF para planificador).
const CHESS_DASHBOARD_BASE = "https://chess-dashboard-mercosurdrps-projects.vercel.app"
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1K7zWrhFFx7SBoTxZ6Dk93ZrgO05kULlGvxL6ahmUYTA/gviz/tq?tqx=out:csv&sheet=Errores%20picking"
/**
 * Bultos despachados por día — el DENOMINADOR de la precisión de picking.
 *
 * Misma planilla que lee `_picking_precision_diaria` de deposito-esteban
 * (gid 716749838, col A = "Fecha SALIDA", col H = "Bultos"), pero agregada por
 * gviz: `select A, sum(H) group by A` devuelve ~700 filas (15 KB) en vez de las
 * 7.300 del CSV crudo (546 KB). Se necesita acá porque el numerador (errores)
 * ya se lee fresco del Sheet y el denominador no puede llegar cacheado — ver
 * `fetchPrecisionDelSheet`.
 */
const SHEET_BULTOS_URL =
  "https://docs.google.com/spreadsheets/d/1K7zWrhFFx7SBoTxZ6Dk93ZrgO05kULlGvxL6ahmUYTA/gviz/tq?tqx=out:csv&gid=716749838&tq=" +
  encodeURIComponent("select A, sum(H) group by A")

export const OPERADORES_APERTURA = [
  "Troli",
  "Galvez",
  "Ovejero",
  "Selenzo",
] as const
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
  /** Vencidos objetivo en HL = bultos vencidos presup. × 0,0987. */
  vencidos: number | null
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
  /** Errores por operador por día (para el drill-down). { fecha: { Troli/Galvez/Ovejero/Selenzo: count } } */
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
/**
 * Timeout para `/api/indicadores/serie-diaria` de deposito-esteban.
 *
 * Ese endpoint re-arma la serie del mes (movimientos + Sheets) y mide 3-5s en
 * caliente: quedaba PEGADO al timeout genérico de 5s y se caía de a ratos.
 * Cuando se cae, `fetchSerieExtra` devuelve todo null y la grilla pierde
 * Precisión, Errores, WQI, Roturas y Faltantes de golpe — y encima el fallo se
 * cachea 30s, así que el vacío persiste. Es la única fuente lenta y es la que
 * alimenta media grilla: se le da margen propio.
 */
const SERIE_DIARIA_TIMEOUT_MS = 20_000
/**
 * Cuánto recordamos que una fuente FALLÓ (timeout, 5xx, red caída).
 *
 * Sin esto, un fallo no se cachea y cada render vuelve a pagar los 5s de
 * timeout, por cada fuente: con deposito-esteban caído, abrir la reunión
 * costaba ~15s a CADA persona, indefinidamente. Recordar el fallo un rato
 * corto convierte eso en 15s para el primero y respuesta inmediata (con las
 * filas vacías, como ya pasaba) para los demás.
 *
 * Corto a propósito: es lo que tarda en recuperarse solo cuando la fuente vuelve.
 */
const FAILURE_CACHE_TTL_MS = 30 * 1000

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

async function fetchJsonSafe<T>(
  url: string,
  ttlMs?: number,
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS,
): Promise<T | null> {
  const cached = readCache<T | null>(url)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      writeCache(url, null, FAILURE_CACHE_TTL_MS)
      return null
    }
    const data = (await res.json()) as T
    writeCache(url, data, ttlMs)
    return data
  } catch {
    writeCache(url, null, FAILURE_CACHE_TTL_MS)
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
    if (!res.ok) {
      writeCache(url, null, FAILURE_CACHE_TTL_MS)
      return null
    }
    const text = await res.text()
    writeCache(url, text)
    return text
  } catch {
    writeCache(url, null, FAILURE_CACHE_TTL_MS)
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
    vencidos: null,
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

  const [snap, pickingPorFecha] = await Promise.all([
    fetchSnapshot(),
    fetchPickingBulHhPorFechaOperador(),
  ])
  const base: WarehouseSerieBase =
    snap && snap.dias
      ? buildSerieFromSnapshot(fechas, fechaReunion, snap.dias, pickingPorFecha)
      : // Fallback: si el snapshot no existe (primera vez, o pusher caído),
        // pegar a las 4 fuentes originales.
        await buildSerieLegacy(fechas, fechaReunion)

  // roturas/faltantes/targets + series diarias no están en el snapshot
  // pre-cocinado → se leen directo de serie-diaria (1 fetch cacheado;
  // en el camino legacy es la misma URL ya cacheada por fetchJsonSafe).
  const extra = await fetchSerieExtra(fechas, fechaReunion)

  // El MTD del WQI se prefiere de serie-diaria (la fuente del popover del día);
  // si ese fetch no respondió, queda el del snapshot, que es el respaldo.
  const { wqi: wqiSerie, ...extraSinWqi } = extra
  return { ...base, ...extraSinWqi, wqi: wqiSerie ?? base.wqi }
}

/** HOY en zona horaria de Argentina (YYYY-MM-DD). Usar SIEMPRE esto en vez de
 * `toISOString()`, que devuelve UTC y de noche (>21hs ART) adelanta un día. */
function hoyArgentina(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

/** ¿El día `f` ya cerró (dato confirmado)? El día de la reunión se oculta
 * mientras la reunión sea de HOY o futura (en el matinal el cierre del día aún
 * no está confirmado). Una vez que esa fecha quedó en el pasado, el día de la
 * reunión ya cerró y se revela. */
function diaCerrado(f: string, fechaReunion: string, hoy: string): boolean {
  return fechaReunion < hoy ? f <= fechaReunion : f < fechaReunion
}

function buildSerieFromSnapshot(
  fechas: string[],
  fechaReunion: string,
  dias: Record<string, SnapshotDia>,
  pickingPorFecha: Map<string, Map<OperadorApertura, number>>,
): WarehouseSerieBase {
  const wqi: Record<string, number | null> = {}
  const fgli: Record<string, number | null> = {}
  const scl: Record<string, number | null> = {}
  const capacidad: Record<string, number | null> = {}
  const precision: Record<string, number | null> = {}
  const productividad: Record<string, number | null> = {}
  const errores_dia: Record<string, number | null> = {}

  const hoy = hoyArgentina()
  for (const f of fechas) {
    const dia = dias[f]
    const visible = f <= fechaReunion
    // WQI/FGLI/SCL: serie MTD acumulada. Sólo se conserva para que la
    // columna MTD del indicador tome el último acumulado del mes; las
    // celdas diarias se renderizan con la serie *_dia (ver fetchSerieExtra).
    // WQI oculta el día de la reunión sólo mientras esa fecha sea de hoy o
    // futura (cierre aún no confirmado en el matinal); si la reunión ya quedó
    // en el pasado, el día cerró y se muestra.
    wqi[f] = diaCerrado(f, fechaReunion, hoy) ? (dia?.wqi ?? null) : null
    fgli[f] = visible ? (dia?.fgli ?? null) : null
    scl[f] = visible ? (dia?.scl ?? null) : null
    // Resto: valor del día (la grilla los muestra todos, no oculta futuro)
    capacidad[f] = dia?.capacidad ?? null
    // Promedio diario de picking: recomputado para incluir a TODOS los
    // operadores con dato en productividad-picking. El snapshot pre-cocinado
    // sólo promedia la lista fija del pusher (Troli/Galvez/Ovejero) y deja
    // afuera a los que cubren (p.ej. Selenzo) → su productividad no se veía.
    // Si no hay filas de picking del día, se conserva el promedio del snapshot.
    const pk = pickingPorFecha.get(f)
    if (pk && pk.size > 0) {
      const vals = Array.from(pk.values())
      productividad[f] =
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
    } else {
      productividad[f] = dia?.productividad ?? null
    }
    // Precisión: ocultar el día actual y futuros (aún no se pickeó →
    // no hay errores cargados, el valor sería falso 100%). Se revela el día
    // de la reunión una vez que quedó en el pasado.
    precision[f] = diaCerrado(f, fechaReunion, hoy) ? (dia?.precision ?? null) : null

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
  const [snap, pickingPorFecha] = await Promise.all([
    fetchSnapshot(),
    fetchPickingBulHhPorFechaOperador(),
  ])
  const pickingDelDia = pickingPorFecha.get(fecha) ?? null
  const base =
    snap && snap.dias && snap.dias[fecha]
      ? buildAperturaFromSnapshot(
          fecha,
          snap.dias[fecha],
          overridesHlHh,
          pickingDelDia,
        )
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

/** Trae { Troli, Galvez, Ovejero, Selenzo } con la cantidad de errores (= filas
 *  del Sheet "Errores picking") de un día puntual. El conteo sale del Sheet
 *  directo (ver fetchErroresCountDelSheet); a serie-diaria sólo se le pregunta
 *  si el día operó, para no mostrar 0 en un día sin despacho. */
async function fetchErroresCountPorOperador(
  fecha: string,
): Promise<Record<string, number> | null> {
  const partes = fecha.split("-").map((s) => parseInt(s, 10))
  const year = partes[0]
  const month = partes[1]
  if (!year || !month) return null
  const [sheet, res] = await Promise.all([
    fetchErroresCountDelSheet(year, month),
    fetchJsonSafe<DepositoIndicadoresSerieDiaria>(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      undefined,
      SERIE_DIARIA_TIMEOUT_MS,
    ),
  ])
  if (sheet) {
    const delSheet = sheet.porOperador[fecha]
    if (delSheet) return delSheet
    return res?.errores_count_dia?.[fecha] !== undefined
      ? ceroPorOperador()
      : null
  }
  return res?.errores_count_por_operador_dia?.[fecha] ?? null
}

function buildAperturaFromSnapshot(
  fecha: string,
  dia: SnapshotDia,
  overridesHlHh: Map<OperadorApertura, number | null>,
  pickingDelDia: Map<OperadorApertura, number> | null,
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
    // bul/HH del snapshot. Si el operador no está en la lista fija del pusher
    // (p.ej. Selenzo, que cubre picking) lo completamos desde
    // productividad-picking para que su productividad aparezca igual.
    let bul_hh_auto = op?.bul_hh ?? null
    if (bul_hh_auto === null && pickingDelDia) {
      const pk = pickingDelDia.get(alias)
      if (pk != null) bul_hh_auto = pk
    }
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

  // Promedio de productividad del día: se recomputa sobre los bul/HH efectivos
  // (incluye a los operadores suplidos desde picking y a los overrides
  // manuales) siempre que haya datos de picking o algún override. Si no, se
  // usa el promedio pre-cocinado del snapshot.
  const tieneOverride = Array.from(overridesHlHh.values()).some(
    (v) => v !== null,
  )
  let productividad_promedio_bul_hh = dia.productividad ?? null
  if (tieneOverride || (pickingDelDia && pickingDelDia.size > 0)) {
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

/**
 * Fecha de una celda tipeada a mano. Acepta los dos formatos con los que sale
 * la planilla: `D/M/AAAA` (CSV crudo) y `AAAA-M-D` (agregado por gviz).
 *
 * 🚨 Valida el año: la planilla tiene filas tipeadas "30/05/0206" (por 2026) y
 * ese año fantasma, al ser menor que cualquier fecha real, se volvía el inicio
 * de la medición y hacía que meses SIN errores cargados mostraran 100% de
 * precisión en vez de "—" (mismo filtro que `_dmy` en deposito-esteban).
 */
function parseFechaSheet(raw: string): string | null {
  const s = raw.trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const [y, mes, dia] = dmy
    ? [+dmy[3], +dmy[2], +dmy[1]]
    : ymd
      ? [+ymd[1], +ymd[2], +ymd[3]]
      : [0, 0, 0]
  if (!y) return null
  const anioMax = new Date().getFullYear() + 1
  if (y < 2000 || y > anioMax) return null
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return `${y}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

function parseDecimalEs(s: string): number {
  const n = parseFloat(s.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

/**
 * Conteo de errores de picking del mes leyendo el Sheet DIRECTO — cada fila
 * del Sheet es 1 error.
 *
 * Misma semántica que `_picking_errores_conteo_diaria` de deposito-esteban
 * (excluye TIPO DE ERROR = SISTEMA, que no es error de operario), pero sin
 * pasar por `serie-diaria`: ese endpoint tarda ~45s, así que cachea su
 * resultado y sólo lo revalida cuando cambian los movimientos acumulados. El
 * Sheet no participa de esa invalidación ⇒ una carga nueva de errores no se
 * veía hasta el cron de las 08:00 del día siguiente, y el matinal (que mira
 * los errores de ayer) llegaba siempre tarde. El CSV es chico: leerlo acá
 * cuesta ~1s y el dato queda fresco a los 5 min (TTL de `fetchTextSafe`).
 *
 * A diferencia de deposito-esteban, el desglose por operador incluye a
 * SELENZO: cubre picking y sus errores ya sumaban al total, pero al no estar
 * en la lista de allá quedaban sin atribuir (su fila mostraba 0). Mismo
 * criterio que la productividad, que ya lo incluye.
 */
async function fetchErroresCountDelSheet(
  year: number,
  month: number,
): Promise<{
  porDia: Record<string, number>
  porOperador: Record<string, Record<string, number>>
  /** Bultos involucrados en errores por día (col "CANTIDAD DE BULTOS").
   *  Numerador de la precisión; el conteo de filas es otra cosa. */
  bultosErradosPorDia: Record<string, number>
  /** Primer error cargado en la planilla, de cualquier tipo y cualquier mes:
   *  antes de esa fecha nadie anotaba errores y un 100% sería inventado. */
  inicioMedicion: string | null
} | null> {
  const csv = await fetchTextSafe(SHEET_URL)
  if (!csv) return null

  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null

  const prefijo = `${year}-${String(month).padStart(2, "0")}`
  const porDia: Record<string, number> = {}
  const porOperador: Record<string, Record<string, number>> = {}
  const bultosErradosPorDia: Record<string, number> = {}
  let inicioMedicion: string | null = null

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i])
    if (cells.length < 2 || !cells[0]?.trim()) continue
    const fecha = parseFechaSheet(cells[0])
    if (!fecha) continue
    // El inicio de la medición lo marca CUALQUIER error cargado (incluidos los
    // de SISTEMA y los de otros meses): dice desde cuándo existe la planilla.
    if (inicioMedicion === null || fecha < inicioMedicion) inicioMedicion = fecha
    // TIPO DE ERROR (col 4) = SISTEMA no es error de operario.
    if (cells.length > 4 && cells[4]?.trim().toUpperCase() === "SISTEMA") continue
    if (!fecha.startsWith(prefijo)) continue

    bultosErradosPorDia[fecha] =
      (bultosErradosPorDia[fecha] ?? 0) + parseDecimalEs(cells[2] ?? "0")

    // El total cuenta la fila aunque el operario no matchee ningún alias
    // (igual que deposito-esteban): un error mal tipeado sigue siendo un error.
    porDia[fecha] = (porDia[fecha] ?? 0) + 1

    // Sin diacríticos: el Sheet se tipea a mano y alterna GALVEZ/GÁLVEZ.
    const operario = (cells[1] ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    const alias = OPERADORES_APERTURA.find((a) => matchOperador(operario, a))
    if (!alias) continue
    let fila = porOperador[fecha]
    if (!fila) {
      fila = Object.fromEntries(OPERADORES_APERTURA.map((a) => [a, 0]))
      porOperador[fecha] = fila
    }
    fila[alias] += 1
  }

  return { porDia, porOperador, bultosErradosPorDia, inicioMedicion }
}

/**
 * Día en que se PICKEÓ lo que se entrega en `isoEntrega`: el día hábil
 * inmediatamente anterior, salteando domingos y feriados nacionales.
 *
 * 🚨 La planilla de bultos está fechada por "Fecha SALIDA" (entrega) y los
 * errores por fecha de PICKEO, así que sin este mapeo la precisión de un día
 * divide los errores de ese día por los bultos de otro. Mismo criterio que
 * `diaPickeoDeEntrega` en deposito-esteban (`src/lib/pickingPrecision.js`).
 */
function diaPickeoDeEntrega(isoEntrega: string): string {
  let d = diaAnterior(isoEntrega)
  // Domingo: el 1° de enero de 1970 fue jueves; más simple, se pregunta al Date.
  while (new Date(`${d}T00:00:00Z`).getUTCDay() === 0 || esFeriado(d)) {
    d = diaAnterior(d)
  }
  return d
}

/**
 * Precisión de picking del mes, calculada acá con las planillas FRESCAS:
 * `(bultos pickeados − bultos errados) / bultos pickeados × 100`.
 *
 * 🚨 Por qué no se toma de `serie-diaria`: ese endpoint cachea su resultado en
 * blob y sólo lo invalida cuando cambian los MOVIMIENTOS del mes. Las dos
 * planillas de picking no participan de esa firma, así que un error cargado
 * después del último recálculo no se veía hasta que alguien subiera pérdidas o
 * corriera el cron del día siguiente. El conteo de errores ya se leía del Sheet
 * directo (ver `fetchErroresCountDelSheet`) y la precisión no: la grilla de la
 * reunión terminaba mostrando "3 errores" y "100% de precisión" el mismo día
 * (2026-08-04 en producción). Numerador y denominador tienen que salir de la
 * misma lectura o vuelven a contradecirse.
 *
 * Mismo criterio que `_picking_precision_diaria` de deposito-esteban: excluye
 * los errores de SISTEMA, no emite nada antes del primer error cargado y
 * re-fecha los bultos al día en que se pickearon (ver `diaPickeoDeEntrega`).
 *
 * Devuelve null si alguna de las dos planillas no se pudo leer.
 */
function computePrecisionDelSheet(
  year: number,
  month: number,
  erroresSheet: Awaited<ReturnType<typeof fetchErroresCountDelSheet>>,
  csv: string | null,
): Record<string, number> | null {
  if (!erroresSheet?.inicioMedicion || !csv) return null

  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null

  const prefijo = `${year}-${String(month).padStart(2, "0")}`
  // Bultos del mes agrupados por DÍA DE PICKEO. Se recorre toda la planilla (no
  // sólo el mes) porque la entrega del 1° la pickeó el último día hábil del mes
  // anterior, y viceversa.
  const bultosPorPickeo: Record<string, number> = {}
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i])
    if (cells.length < 2) continue
    const entrega = parseFechaSheet(cells[0] ?? "")
    if (!entrega) continue
    const bultos = parseDecimalEs(cells[1] ?? "0")
    if (!(bultos > 0)) continue
    const pickeo = diaPickeoDeEntrega(entrega)
    if (!pickeo.startsWith(prefijo)) continue
    bultosPorPickeo[pickeo] = (bultosPorPickeo[pickeo] ?? 0) + bultos
  }

  const precision: Record<string, number> = {}
  for (const [fecha, bultos] of Object.entries(bultosPorPickeo)) {
    if (fecha < erroresSheet.inicioMedicion) continue
    const errados = erroresSheet.bultosErradosPorDia[fecha] ?? 0
    precision[fecha] = Math.round(((bultos - errados) / bultos) * 10000) / 100
  }
  return Object.keys(precision).length > 0 ? precision : null
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
  roturas_detalle_dia?: Record<string, RoturaDetalleSku[]>
  faltantes_dia?: Record<string, number | null>
  faltantes_detalle_dia?: Record<string, RoturaDetalleSku[]>
  vencidos?: Record<string, number | null>
  vencidos_dia?: Record<string, number | null>
  vencidos_detalle_dia?: Record<string, RoturaDetalleSku[]>
  wnp_dia?: Record<string, number | null>
  precision?: Record<string, number | null>
  errores_count_dia?: Record<string, number>
  errores_count_por_operador_dia?: Record<string, Record<string, number>>
  targets?: Partial<WarehouseTargets>
}

/** Dónde ocurrió la pérdida: en el almacén o arriba del camión (en la calle).
 *  Sale de la categoría del Excel de pérdidas:
 *   - "distribucion" → ROTURA/FALTANTE DISTRIBUCIÓN: pasó en la calle, va al DQI.
 *   - "acarreo"      → *ACARREO*: transporte primario entre plantas. Es el
 *     grueso de los faltantes y NO pasó dentro del almacén. Hoy es sólo un
 *     rótulo: a efectos de cálculo el backend lo sigue contando como almacén.
 *   - "almacen"      → el resto (rotura de depósito, pinchados y rotos…). */
export type OrigenPerdida = "almacen" | "distribucion" | "acarreo"

/** Una pérdida del día agregada por SKU y origen (popover de FGLI/WQI en la
 *  reunión). Vale para roturas, faltantes y vencidos. `valor` = $ sin IVA. */
export interface RoturaDetalleSku {
  sku: string
  descripcion: string
  /** Un mismo SKU puede venir dos veces el mismo día, una por origen. */
  origen?: OrigenPerdida
  /** Patentes de los camiones involucrados (sólo en las de distribución y
   *  acarreo, y únicamente cuando el Excel las informa). */
  patentes?: string[]
  bultos: number
  unidades: number
  /** Bultos equivalentes = bultos + unidades/un_bulto (un solo número). */
  bultos_eq?: number
  hl: number
  valor?: number
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

/**
 * bul/HH por operador (alias de OPERADORES_APERTURA) por fecha, leído directo
 * de productividad-picking (la misma fuente WMS que alimenta el snapshot). El
 * snapshot pre-cocinado sólo arma la apertura para la lista fija del pusher
 * (Troli/Galvez/Ovejero) y deja afuera a los que cubren picking (p.ej.
 * Selenzo); con esto completamos su bul/HH tanto en la apertura por operador
 * como en el promedio diario. El fetch ya está cacheado por URL.
 */
async function fetchPickingBulHhPorFechaOperador(): Promise<
  Map<string, Map<OperadorApertura, number>>
> {
  const out = new Map<string, Map<OperadorApertura, number>>()
  const res = await fetchJsonSafe<DepositoProductividad>(
    `${DEPOSITO_API_BASE}/api/shared/load?module=productividad-picking`,
  )
  for (const fila of res?.data?.filas ?? []) {
    if (typeof fila.bul_hh !== "number" || !Number.isFinite(fila.bul_hh)) continue
    if (fila.bul_hh <= 0) continue
    const alias = OPERADORES_APERTURA.find((a) => matchOperador(fila.operario, a))
    if (!alias) continue
    let porOp = out.get(fila.fecha)
    if (!porOp) {
      porOp = new Map()
      out.set(fila.fecha, porOp)
    }
    // Si hubiera más de una fila del mismo operador/día (no debería), nos
    // quedamos con la mayor para no subcontar.
    const prev = porOp.get(alias)
    porOp.set(alias, prev != null ? Math.max(prev, fila.bul_hh) : fila.bul_hh)
  }
  return out
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
        undefined,
        SERIE_DIARIA_TIMEOUT_MS,
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
  const hoy = hoyArgentina()
  for (const f of fechas) {
    const visible = f <= fechaReunion
    // Serie MTD acumulada — sólo se usa para el MTD del indicador.
    // Las celdas diarias se renderizan con la serie *_dia (fetchSerieExtra).
    // WQI oculta el día de la reunión mientras sea de hoy/futura; una vez que
    // esa fecha quedó en el pasado, el día cerró y se muestra.
    wqi[f] = diaCerrado(f, fechaReunion, hoy) ? (serieRes?.wqi?.[f] ?? null) : null
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
    // actual y futuros; se revela el día de la reunión cuando ya cerró.
    precision[f] = diaCerrado(f, fechaReunion, hoy) ? apertura.precision_promedio : null
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
 * HL de venta esperados del mes — el MISMO denominador que usa el target del WQI:
 * objetivo de venta de chess-dashboard (/gerencial), con fallback al presupuesto
 * fijo. Se usa para pasar los targets de pérdida (HL) a PPM en el popover de FGLI.
 */
export async function getVentasHlEsperadas(
  year: number,
  month: number,
): Promise<number | null> {
  return (
    (await fetchObjetivoVentaHl(year, month)) ??
    VENTAS_HL_PRESUPUESTO[year]?.[month] ??
    null
  )
}

function ceroPorOperador(): Record<string, number> {
  return Object.fromEntries(OPERADORES_APERTURA.map((a) => [a, 0]))
}

/**
 * Errores del día. El Sheet manda (es la fuente, y llega fresco), pero
 * serie-diaria decide si el día CUENTA: sólo rellena en 0 los días con
 * despacho, así que un domingo/feriado/futuro queda en "—" en vez de mostrar
 * un 0 inventado. Si el Sheet no está disponible, se cae al conteo de la API.
 */
function contarErroresDelDia(
  fecha: string,
  sheet: { porDia: Record<string, number> } | null,
  api: DepositoIndicadoresSerieDiaria | null,
): number | null {
  const deApi = api?.errores_count_dia?.[fecha]
  if (!sheet) return typeof deApi === "number" ? deApi : null
  const delSheet = sheet.porDia[fecha]
  if (delSheet !== undefined) return delSheet
  return typeof deApi === "number" ? 0 : null
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
  fgli: Record<string, number | null>
  wnp: Record<string, number | null>
  /** MTD del WQI. `null` cuando serie-diaria no respondió: ahí manda el
   *  snapshot, que es justamente el que cubre esa caída. */
  wqi: Record<string, number | null> | null
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
  // El conteo de errores sale del Sheet directo (fresco a los 5 min); el resto
  // de las series sigue viniendo de serie-diaria, que las necesita calcular.
  // El objetivo de venta va acá aunque sólo se use al final (target de WQI):
  // no depende de `res`, y esperarlo después agregaba un round-trip entero a
  // chess-dashboard a la ruta crítica del render (hasta 5s si está frío).
  const [res, erroresSheet, objetivoVentaHl, csvBultos] = await Promise.all([
    fetchJsonSafe<DepositoIndicadoresSerieDiaria>(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      undefined,
      SERIE_DIARIA_TIMEOUT_MS,
    ),
    fetchErroresCountDelSheet(year, month),
    fetchObjetivoVentaHl(year, month),
    // Denominador de la precisión. Va en el mismo Promise.all para no sumar un
    // round-trip en serie a la ruta crítica del render.
    fetchTextSafe(SHEET_BULTOS_URL),
  ])
  // La precisión se recalcula acá con las planillas frescas; la de
  // `serie-diaria` queda de respaldo para cuando la planilla no responde.
  const precisionSheet = computePrecisionDelSheet(
    year,
    month,
    erroresSheet,
    csvBultos,
  )

  const roturas: Record<string, number | null> = {}
  const faltantes: Record<string, number | null> = {}
  const fgli: Record<string, number | null> = {}
  const wnp: Record<string, number | null> = {}
  // El MTD del WQI también sale de serie-diaria y no del snapshot: el snapshot
  // lo recalcula el pusher local a su hora (al 31-07 daba 1.500 contra 1.585 de
  // la serie), y el popover del día lee serie-diaria ⇒ la celda y su drill
  // mostraban números distintos. Una sola fuente para los dos.
  const wqi: Record<string, number | null> = {}
  const wqi_dia: Record<string, number | null> = {}
  const fgli_dia: Record<string, number | null> = {}
  const scl_dia: Record<string, number | null> = {}
  const roturas_dia: Record<string, number | null> = {}
  const faltantes_dia: Record<string, number | null> = {}
  const wnp_dia: Record<string, number | null> = {}
  const precision: Record<string, number | null> = {}
  const errores_dia: Record<string, number | null> = {}
  const errores_por_operador_dia: Record<string, Record<string, number>> = {}
  const hoy = hoyArgentina()
  for (const f of fechas) {
    // FGLI y SCL conservan el día en curso.
    const visible = f <= fechaReunion
    // WQI, roturas, faltantes y WNP ocultan el día de la reunión (y futuros): a
    // la hora del matinal el cierre de hoy todavía no está confirmado, igual que
    // precisión, errores y ausentismo. Se muestran hasta el último día cerrado;
    // el día de la reunión se revela una vez que esa fecha quedó en el pasado.
    const cerrado = diaCerrado(f, fechaReunion, hoy)
    roturas[f] = cerrado ? (res?.roturas?.[f] ?? null) : null
    faltantes[f] = cerrado ? (res?.faltantes?.[f] ?? null) : null
    // FGLI (MTD) conserva el día en curso, igual que fgli_dia/scl.
    fgli[f] = visible ? (res?.fgli?.[f] ?? null) : null
    wnp[f] = cerrado ? (res?.wnp?.[f] ?? null) : null
    wqi[f] = cerrado ? (res?.wqi?.[f] ?? null) : null
    wqi_dia[f] = cerrado ? (res?.wqi_dia?.[f] ?? null) : null
    fgli_dia[f] = visible ? (res?.fgli_dia?.[f] ?? null) : null
    scl_dia[f] = visible ? (res?.scl_dia?.[f] ?? null) : null
    roturas_dia[f] = cerrado ? (res?.roturas_dia?.[f] ?? null) : null
    faltantes_dia[f] = cerrado ? (res?.faltantes_dia?.[f] ?? null) : null
    wnp_dia[f] = cerrado ? (res?.wnp_dia?.[f] ?? null) : null
    // Precisión y errores: ocultar día actual y futuros (todavía no se pickeó);
    // el día de la reunión se revela una vez cerrado (misma máscara `cerrado`).
    // La precisión sale de la planilla fresca; sólo si esa lectura falló se cae
    // al valor de serie-diaria, que puede venir de un cache anterior a la carga
    // de los errores del día.
    precision[f] = cerrado
      ? (precisionSheet?.[f] ?? res?.precision?.[f] ?? null)
      : null
    if (cerrado) {
      const cnt = contarErroresDelDia(f, erroresSheet, res)
      errores_dia[f] = cnt
      // 🚨 Guardián: un día con errores NO puede dar 100% de precisión. Si el
      // único valor disponible es el de respaldo y contradice al conteo, se
      // deja la celda vacía: mejor un "—" que una precisión perfecta falsa.
      if (cnt !== null && cnt > 0 && precision[f] === 100) precision[f] = null
      const porOp = erroresSheet
        ? cnt === null
          ? undefined
          : (erroresSheet.porOperador[f] ?? ceroPorOperador())
        : res?.errores_count_por_operador_dia?.[f]
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
  const ventasHlWqi = objetivoVentaHl ?? ventasHl
  // 🚨 Desde 2026-07-28 el WQI mide el VOLUMEN AFECTADO por rotura (lo que
  // entra a reempaque + las roturas que no pasan por el sector), no la merma
  // final. El presupuesto de roturas está armado sobre la merma final, así que
  // derivar el target de ahí deja la reunión en rojo permanente: si el endpoint
  // publica su propio target de WQI, manda ese.
  const wqiTarget =
    res?.targets?.wqi ??
    (roturasTarget !== null && ventasHlWqi
      ? Math.round((roturasTarget / ventasHlWqi) * 1_000_000)
      : null)

  // Target de WNP (HL/HH): fijo en 6 por pedido de logística.
  const wnpTarget = 6

  return {
    roturas,
    faltantes,
    fgli,
    wnp,
    wqi: res?.wqi ? wqi : null,
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
      vencidos: res?.targets?.vencidos ?? null,
      wqi: wqiTarget,
      scl: res?.targets?.scl ?? null,
      wnp: wnpTarget,
    },
  }
}

/**
 * Fuerza el recálculo de la serie diaria en deposito-esteban (`?refresh=1`,
 * ~45s: re-parsea los Excels y los Google Sheets de errores de picking). El
 * cache en blob de deposito-esteban sólo se invalida cuando cambian los
 * movimientos acumulados, así que una carga nueva en el Sheet de errores (o
 * un cache envenenado) queda vieja hasta el cron — este refresh la destraba.
 * Deja el resultado en el cache in-memory bajo la URL sin `refresh` para que
 * un buildWarehouseSerieDiaria posterior de esta misma invocación lo lea
 * fresco; el blob queda actualizado para el resto de las instancias.
 */
export async function refreshSerieDiariaDeposito(
  year: number,
  month: number,
): Promise<boolean> {
  const url = `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`
  try {
    const res = await fetch(`${url}&refresh=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
    })
    if (!res.ok) return false
    const data = (await res.json()) as DepositoIndicadoresSerieDiaria
    writeCache(url, data)
    return true
  } catch {
    return false
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

// ────────────────────────────────────────────────────────────────────
// Maquinistas — productividad en MINUTOS POR CAMIÓN (las dos mitades)
//
// Espejo de la pestaña "Maquinistas" de deposito-esteban, que el 2026-07-31
// dejó de medir en Pal/HH y pasó a MINUTOS POR CAMIÓN para poder leer juntas
// las dos mitades del muelle:
//   · carga    → despachar el camión de reparto  (/api/carga/tiempos)
//   · descarga → descargar el camión de acarreo  (/api/acarreo/descargas)
// Los pallets casi no varían entre camiones (mediana 25 en acarreo, 9 en
// reparto), así que los minutos SON la productividad: normalizar por pallet
// no agrega nada (la regresión tiempo~pallets da R²=0,18).
//
// 🚨 MENOS ES MEJOR. Y las dos escalas NO son comparables entre sí: el camión
// de reparto lleva 9 pallets y el de acarreo 25.
//
// 🚨 Descarga hecha "de a dos": a CADA maquinista se le imputan los minutos
// que estuvo en el camión, pero el total del día lo cuenta en minutos-PERSONA
// (el doble). Por eso el total no es el promedio de las filas por operario —
// es lo que le costó al almacén, no lo que le costó a cada uno. En la carga no
// pasa: el WMS registra un único usuario por viaje.
//
// El promedio (celda MTD) pondera por CAMIÓN, no por día: un día de un solo
// camión no puede pesar lo mismo que uno de cinco. Mismo criterio que la
// pestaña de deposito-esteban.
// ────────────────────────────────────────────────────────────────────

export type MaquinistasTramo = "carga" | "descarga"

/**
 * Timeout propio para los dos endpoints de minutos: `/api/carga/tiempos` lee
 * un blob (~2s medidos) y `/api/acarreo/descargas` sale a acarreo-rdf, que
 * puede pagar cold start. Con los 5s genéricos quedaban al filo.
 */
const MINUTOS_CAMION_TIMEOUT_MS = 10_000

interface MinutosFilaApi {
  operario: string
  fecha: string
  pallets: number
  minutos: number
  camiones: number
  min_camion: number
  pal_h: number
  /** Sólo descarga: cuántos de esos camiones se hicieron de a dos. */
  en_equipo?: number
}

interface MinutosTotalApi {
  fecha: string
  pallets: number
  camiones: number
  /** Carga: reloj puro. */
  minutos?: number
  /** Descarga: reloj × cantidad de maquinistas del camión. */
  minutos_persona?: number
  minutos_reloj?: number
  min_camion: number
  min_camion_reloj?: number
  pal_h: number
}

interface MinutosCamionResp {
  filas?: MinutosFilaApi[]
  totales?: MinutosTotalApi[]
  descartados?: Record<string, number>
}

export interface MinutosCamionOperarioRow {
  operario: string
  camiones: number
  minutos: number
  min_camion: number
  pallets: number
  pal_h: number
  /** Sólo descarga: camiones hechos acompañado. 0 en carga. */
  en_equipo: number
}

export interface MinutosCamionTotalDia {
  camiones: number
  /** Descarga: minutos-persona. Carga: reloj. */
  minutos: number
  min_camion: number
  /** Sólo descarga: el mismo total contado en reloj (sin duplicar el de a dos). */
  min_camion_reloj: number | null
  pallets: number
  pal_h: number
}

export interface AperturaMinutosCamionDelDia {
  fecha: string
  tramo: MaquinistasTramo
  filas: MinutosCamionOperarioRow[]
  total: MinutosCamionTotalDia | null
  /** Lo que el backend dejó afuera, ya en criollo ("2 con duración fuera de rango"). */
  descartados: string
}

/** Serie diaria + MTD acumulado, las dos en minutos por camión. */
export interface MinutosCamionSerie {
  dia: Record<string, number | null>
  mtd: Record<string, number | null>
}

const MINUTOS_ENDPOINT: Record<MaquinistasTramo, string> = {
  carga: "/api/carga/tiempos",
  descarga: "/api/acarreo/descargas",
}

/** Etiquetas de los descartes que devuelve cada endpoint de deposito-esteban. */
const MINUTOS_DESCARTES: Record<string, string> = {
  sin_maquinista: "sin maquinista identificado",
  fuera_de_rango: "con duración fuera de rango",
  sin_horas: "sin horas registradas",
  sin_pallets: "sin pallets",
  sin_duracion: "sin duración medida",
  un_solo_escaneo: "con un solo escaneo",
}

function textoDescartados(d: Record<string, number> | undefined): string {
  if (!d) return ""
  return Object.entries(d)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${v} ${MINUTOS_DESCARTES[k] ?? k}`)
    .join(", ")
}

async function fetchMinutosCamion(
  tramo: MaquinistasTramo,
  desde: string,
  hasta: string,
): Promise<MinutosCamionResp | null> {
  return fetchJsonSafe<MinutosCamionResp>(
    `${DEPOSITO_API_BASE}${MINUTOS_ENDPOINT[tramo]}?desde=${desde}&hasta=${hasta}`,
    EXTERNAL_FETCH_TTL_MS,
    MINUTOS_CAMION_TIMEOUT_MS,
  )
}

/** Minutos-persona del día (descarga) o reloj (carga): lo que le costó al almacén. */
function minutosDelTotal(t: MinutosTotalApi): number {
  const v = t.minutos_persona ?? t.minutos
  return Number.isFinite(Number(v)) ? Number(v) : 0
}

/**
 * Serie del indicador AUTO: min/camión del día (total del almacén) y el MTD
 * acumulado ponderado por camión. El enmascarado del día en curso lo hace el
 * caller, igual que picking.
 */
export async function buildMinutosCamionSerie(
  fechas: string[],
  tramo: MaquinistasTramo,
): Promise<MinutosCamionSerie> {
  const dia: Record<string, number | null> = {}
  const mtd: Record<string, number | null> = {}
  if (fechas.length === 0) return { dia, mtd }

  const res = await fetchMinutosCamion(
    tramo,
    fechas[0],
    fechas[fechas.length - 1],
  )
  const porFecha = new Map<string, MinutosTotalApi>()
  for (const t of res?.totales ?? []) {
    if (t?.fecha) porFecha.set(t.fecha, t)
  }

  let accMinutos = 0
  let accCamiones = 0
  for (const f of fechas) {
    const t = porFecha.get(f)
    if (!t || !t.camiones) {
      dia[f] = null
      // El MTD arrastra el último valor: un día sin camiones no lo borra.
      mtd[f] = accCamiones > 0 ? Math.round((accMinutos / accCamiones) * 10) / 10 : null
      continue
    }
    dia[f] = Math.round(Number(t.min_camion) * 10) / 10
    accMinutos += minutosDelTotal(t)
    accCamiones += Number(t.camiones) || 0
    mtd[f] = accCamiones > 0 ? Math.round((accMinutos / accCamiones) * 10) / 10 : null
  }
  return { dia, mtd }
}

/** Apertura por maquinista de un día puntual. Read-only (sin overrides). */
export async function buildAperturaMinutosCamionDelDia(
  fecha: string,
  tramo: MaquinistasTramo,
): Promise<AperturaMinutosCamionDelDia> {
  const res = await fetchMinutosCamion(tramo, fecha, fecha)
  const filas: MinutosCamionOperarioRow[] = (res?.filas ?? [])
    .filter((r) => r?.fecha === fecha && Number(r?.camiones) > 0)
    .map((r) => ({
      operario: r.operario,
      camiones: Number(r.camiones) || 0,
      minutos: Number(r.minutos) || 0,
      min_camion: Number(r.min_camion) || 0,
      pallets: Number(r.pallets) || 0,
      pal_h: Number(r.pal_h) || 0,
      en_equipo: Number(r.en_equipo) || 0,
    }))
    // El más rápido arriba: acá menos minutos es mejor.
    .sort((a, b) => a.min_camion - b.min_camion)

  const t = (res?.totales ?? []).find((x) => x?.fecha === fecha)
  const total: MinutosCamionTotalDia | null =
    t && Number(t.camiones) > 0
      ? {
          camiones: Number(t.camiones) || 0,
          minutos: Math.round(minutosDelTotal(t) * 10) / 10,
          min_camion: Math.round(Number(t.min_camion) * 10) / 10,
          min_camion_reloj:
            t.min_camion_reloj != null
              ? Math.round(Number(t.min_camion_reloj) * 10) / 10
              : null,
          pallets: Number(t.pallets) || 0,
          pal_h: Number(t.pal_h) || 0,
        }
      : null

  return {
    fecha,
    tramo,
    filas,
    total,
    descartados: textoDescartados(res?.descartados),
  }
}
