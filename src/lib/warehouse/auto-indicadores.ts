/**
 * Indicadores AUTO para reuniones de tipo 'warehouse'.
 *
 * Fuentes externas (consume API pública de deposito-esteban.vercel.app + Google Sheet):
 *   - /api/indicadores?year=Y&month=M     → WQI (PPM), FGLI (HL), SCL ($)
 *   - /api/shared/load?module=ocupacion   → Capacidad utilizada por día (histórico)
 *   - /api/shared/load?module=productividad-picking → bultos/horas/bul_hh por día y operario
 *   - Google Sheet "Errores picking"       → errores por día y operario (faltantes/sobrantes)
 *
 * Se calculan on-the-fly cada vez que se abre la reunión. No persisten en DB.
 * El sub-cuadro contextual de operadores (Troli/Galvez/Ovejero) usa
 * buildAperturaPickingDelDia para una fecha específica.
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

export interface WarehouseSerieDiaria {
  /** Por fecha YYYY-MM-DD → valor (o null si no hay dato). */
  wqi: Record<string, number | null>
  fgli: Record<string, number | null>
  scl: Record<string, number | null>
  capacidad: Record<string, number | null>
  precision: Record<string, number | null>
  productividad: Record<string, number | null>
}

// ────────────────────────────────────────────────────────────────────
// Fetches con tolerancia a fallos
// ────────────────────────────────────────────────────────────────────

async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function fetchTextSafe(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// ────────────────────────────────────────────────────────────────────
// Parseo del Sheet de errores picking
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

/** "d/MM/yyyy" → "yyyy-MM-dd" o null si no parsea. */
function parseFechaSheet(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

function parseDecimalEs(s: string): number {
  const n = parseFloat(s.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

/** Devuelve: por fecha YYYY-MM-DD → por operador → total bultos errados. */
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

// ────────────────────────────────────────────────────────────────────
// Tipos de respuesta de deposito-esteban
// ────────────────────────────────────────────────────────────────────

interface DepositoIndicadoresSerieDiaria {
  year: number
  month: number
  /** Por fecha YYYY-MM-DD → valor MTD acumulado hasta ese día. */
  wqi: Record<string, number | null>
  fgli: Record<string, number | null>
  scl: Record<string, number | null>
}

interface DepositoOcupacionShared {
  data?: {
    historico?: Array<{ fecha: string; pct_ocupacion?: number | null }>
  } | null
}

interface ProductividadFila {
  fecha: string
  operario: string
  bultos: number
  horas: number
  bul_hh: number
}

interface DepositoProductividad {
  data?: {
    filas?: ProductividadFila[]
  } | null
}

// ────────────────────────────────────────────────────────────────────
// Builder: serie diaria del mes para la grilla principal
// ────────────────────────────────────────────────────────────────────

/**
 * Convierte el formato "dd/MM" del histórico de ocupación a "YYYY-MM-DD"
 * usando el año del rango pedido. Tolerante: si no parsea, devuelve null.
 */
function fechaOcupacionAIso(raw: string, anioRef: number): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  return `${anioRef}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

/**
 * Devuelve para cada fecha del rango: WQI/FGLI/SCL/Capacidad/Precision/Productividad.
 *
 * WQI/FGLI/SCL son MTD del mes (mismo valor replicado para cada fecha hasta `fechaReunion`).
 * Capacidad utilizada viene del histórico de ocupación (día real).
 * Precisión y Productividad se calculan por día desde productividad-picking + Sheet.
 *
 * Tolerante a fallos: si una fuente cae, su mapa queda vacío y los valores se ven como null.
 */
export async function buildWarehouseSerieDiaria(
  fechas: string[],
  fechaReunion: string,
): Promise<WarehouseSerieDiaria> {
  if (fechas.length === 0) {
    return {
      wqi: {},
      fgli: {},
      scl: {},
      capacidad: {},
      precision: {},
      productividad: {},
    }
  }

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

  // WQI/FGLI/SCL: serie diaria con MTD progresivo (acumulado desde el 1°
  // hasta ese día). Lo provee /api/indicadores/serie-diaria.
  // Solo mostramos hasta la fecha de la reunión (después: null).
  const wqi: Record<string, number | null> = {}
  const fgli: Record<string, number | null> = {}
  const scl: Record<string, number | null> = {}
  for (const f of fechas) {
    const visible = f <= fechaReunion
    wqi[f] = visible ? (serieRes?.wqi?.[f] ?? null) : null
    fgli[f] = visible ? (serieRes?.fgli?.[f] ?? null) : null
    scl[f] = visible ? (serieRes?.scl?.[f] ?? null) : null
  }

  // Capacidad utilizada: histórico de ocupación trae "dd/MM" → convertir a ISO
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

  // Precisión y Productividad: por fecha, computar promedio de los 3 operadores
  // (Troli/Galvez/Ovejero) usando productividad-picking + Sheet.
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
    const apertura = computeAperturaDelDia(
      f,
      filasProdPorFecha.get(f) ?? [],
      erroresPorFecha.get(f) ?? new Map<string, number>(),
      new Map<OperadorApertura, number | null>(), // sin overrides en grilla principal
    )
    precision[f] = apertura.precision_promedio
    productividad[f] = apertura.productividad_promedio_bul_hh
  }

  return { wqi, fgli, scl, capacidad, precision, productividad }
}

// ────────────────────────────────────────────────────────────────────
// Builder: apertura por operador para una fecha específica
// (usado por el Dialog contextual al hacer click en una celda)
// ────────────────────────────────────────────────────────────────────

function computeAperturaDelDia(
  fecha: string,
  filasProd: ProductividadFila[],
  erroresDelDia: Map<string, number>,
  overridesHlHh: Map<OperadorApertura, number | null>,
): AperturaPickingDelDia {
  const filas: OperadorAperturaRow[] = OPERADORES_APERTURA.map((alias) => {
    let bultos = 0
    let horasNum = 0
    let bulHhNum = 0
    let bulHhDen = 0
    let hayFila = false
    for (const f of filasProd) {
      if (!matchOperador(f.operario, alias)) continue
      hayFila = true
      bultos += f.bultos
      horasNum += f.horas
      bulHhNum += f.bultos
      bulHhDen += f.horas
    }

    let errores = 0
    let hayError = false
    for (const [nombre, errBultos] of erroresDelDia.entries()) {
      if (matchOperador(nombre, alias)) {
        errores += errBultos
        hayError = true
      }
    }

    const bultosVal = hayFila ? bultos : null
    const erroresVal = hayError ? errores : hayFila ? 0 : null
    const precision =
      bultosVal && bultosVal > 0 && erroresVal !== null
        ? Math.max(0, 1 - erroresVal / bultosVal)
        : null

    const bul_hh_auto =
      bulHhDen > 0 ? Math.round((bulHhNum / bulHhDen) * 10) / 10 : null
    const manual = overridesHlHh.get(alias) ?? null
    const efectivo = manual !== null ? manual : bul_hh_auto

    return {
      operador: alias,
      bultos: bultosVal,
      errores: erroresVal,
      precision,
      bul_hh_auto,
      bul_hh_manual: manual,
      bul_hh_efectivo: efectivo,
    }
  })

  const precisiones = filas
    .map((a) => a.precision)
    .filter((v): v is number => v !== null)
  const productividades = filas
    .map((a) => a.bul_hh_efectivo)
    .filter((v): v is number => v !== null)
  const precision_promedio =
    precisiones.length > 0
      ? Math.round(
          (precisiones.reduce((a, b) => a + b, 0) / precisiones.length) * 1000,
        ) / 10
      : null
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
    precision_promedio,
    productividad_promedio_bul_hh,
  }
}

/**
 * Para el Dialog contextual al hacer click en una celda de la grilla.
 * Devuelve la apertura por operador (Troli/Galvez/Ovejero) para una fecha específica,
 * con overrides manuales de bul/HH (columna hl_hh en reunion_apertura_picking).
 */
export async function buildAperturaPickingDelDia(
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
  return computeAperturaDelDia(fecha, filasProd, erroresDelDia, overridesHlHh)
}
