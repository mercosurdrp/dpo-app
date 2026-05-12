/**
 * Indicadores AUTO para reuniones de tipo 'warehouse'.
 *
 * Fuentes externas (consume API pública de deposito-esteban.vercel.app + Google Sheet):
 *   - /api/indicadores?year=Y&month=M     → WQI (PPM), FGLI (HL), SCL ($)
 *   - /api/ocupacion/ultimo                → Capacidad utilizada (%)
 *   - /api/shared/load?module=productividad-picking → bultos/horas/bul_hh por día y operario
 *   - Google Sheet "Errores picking"       → errores por día y operario (faltantes/sobrantes)
 *
 * Se calculan on-the-fly cada vez que se abre la reunión. No persisten en DB.
 * El sub-cuadro de operadores (Troli/Galvez/Ovejero) tiene además HL/HH editable
 * que SÍ persiste en `reunion_apertura_picking` (ver actions).
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

/** Día anterior hábil (lunes a viernes; saltea sábado y domingo). */
export function diaAnteriorHabil(fechaIso: string): string {
  const d = new Date(fechaIso + "T00:00:00")
  do {
    d.setDate(d.getDate() - 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return d.toISOString().slice(0, 10)
}

// ────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────

export interface OperadorAperturaRow {
  operador: OperadorApertura
  bultos: number | null
  errores: number | null
  /** 0..1, donde 1 = sin errores. null si no hay bultos. */
  precision: number | null
  /** bul/HH automático del WMS. Editable manualmente y persistido en
   *  reunion_apertura_picking.hl_hh (se mantiene nombre histórico). */
  bul_hh_auto: number | null
  bul_hh_manual: number | null
  /** El valor efectivo a usar: manual si hay, sino auto. */
  bul_hh_efectivo: number | null
}

export interface WarehouseAutoData {
  /** Día desde el que se sacan errores/productividad/precisión. */
  diaAnterior: string
  /** Para la grilla principal. */
  indicadores: {
    wqi_ppm: number | null
    fgli_hl: number | null
    scl_ars: number | null
    capacidad_pct: number | null
    precision_pct: number | null
    productividad_bul_hh: number | null
  }
  /** Para el sub-cuadro. */
  apertura: OperadorAperturaRow[]
}

// ────────────────────────────────────────────────────────────────────
// Fetches con tolerancia a fallos (cada fuente cae sin tumbar las demás)
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
// Parseo del Sheet de errores
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

/** Convierte "d/MM/yyyy" o "dd/MM/yyyy" → "yyyy-MM-dd". Devuelve null si no parsea. */
function parseFechaSheet(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

function parseDecimalEs(s: string): number {
  const n = parseFloat(s.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

/**
 * Lee el CSV y devuelve: por fecha → por operador → total bultos errados.
 * Si el sheet no responde, devuelve mapa vacío (precisión queda null).
 */
async function fetchErroresPickingPorFechaOperador(): Promise<
  Map<string, Map<string, number>>
> {
  const out = new Map<string, Map<string, number>>()
  const csv = await fetchTextSafe(SHEET_URL)
  if (!csv) return out

  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return out

  // Asumimos header en línea 0.
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
// Builders por fuente
// ────────────────────────────────────────────────────────────────────

interface DepositoIndicadores {
  indicadores?: {
    wqi?: { mes?: number | null }
    fgli?: { mes?: number | null }
    scl?: { mes?: number | null }
  }
}

interface DepositoOcupacion {
  ultimo?: {
    pct_ocupacion?: number | null
  }
}

interface DepositoProductividad {
  data?: {
    filas?: Array<{
      fecha: string
      operario: string
      bultos: number
      horas: number
      bul_hh: number
    }>
  }
}

/**
 * Devuelve los 6 KPIs y la apertura por operador para una reunión warehouse.
 * Tolerante a fallos: si una fuente no responde, los KPIs de esa fuente quedan null.
 *
 * @param fechaReunion fecha de la reunión (YYYY-MM-DD)
 * @param overridesHlHh map operador → bul/HH manual desde reunion_apertura_picking (si hay)
 */
export async function buildWarehouseAutoData(
  fechaReunion: string,
  overridesHlHh: Map<OperadorApertura, number | null>,
): Promise<WarehouseAutoData> {
  const partes = fechaReunion.split("-").map((s) => parseInt(s, 10))
  const year = partes[0]
  const month = partes[1]
  const diaAnt = diaAnteriorHabil(fechaReunion)

  // Fetches en paralelo
  const [indicadoresRes, ocupacionRes, productividadRes, erroresPorFecha] =
    await Promise.all([
      fetchJsonSafe<DepositoIndicadores>(
        `${DEPOSITO_API_BASE}/api/indicadores?year=${year}&month=${month}`,
      ),
      fetchJsonSafe<DepositoOcupacion>(
        `${DEPOSITO_API_BASE}/api/ocupacion/ultimo`,
      ),
      fetchJsonSafe<DepositoProductividad>(
        `${DEPOSITO_API_BASE}/api/shared/load?module=productividad-picking`,
      ),
      fetchErroresPickingPorFechaOperador(),
    ])

  // KPIs mensuales desde deposito-esteban
  const wqi = indicadoresRes?.indicadores?.wqi?.mes ?? null
  const fgli = indicadoresRes?.indicadores?.fgli?.mes ?? null
  const scl = indicadoresRes?.indicadores?.scl?.mes ?? null
  const capacidad = ocupacionRes?.ultimo?.pct_ocupacion ?? null

  // Productividad del día anterior hábil — filtramos las filas de los 3 operarios
  const filasProd = productividadRes?.data?.filas ?? []
  const filasDelDia = filasProd.filter((f) => f.fecha === diaAnt)

  // Errores del día anterior hábil
  const erroresDelDia = erroresPorFecha.get(diaAnt) ?? new Map<string, number>()

  // Armar fila por operador
  const apertura: OperadorAperturaRow[] = OPERADORES_APERTURA.map((alias) => {
    // Sumar bultos/horas de TODAS las filas que matcheen ese alias
    let bultos = 0
    let horas = 0
    let bul_hh_weighted_num = 0
    let bul_hh_weighted_den = 0
    let hayFila = false
    for (const f of filasDelDia) {
      if (!matchOperador(f.operario, alias)) continue
      hayFila = true
      bultos += f.bultos
      horas += f.horas
      bul_hh_weighted_num += f.bultos
      bul_hh_weighted_den += f.horas
    }

    // Errores: sumar todas las filas que matcheen el alias
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
      bul_hh_weighted_den > 0
        ? Math.round((bul_hh_weighted_num / bul_hh_weighted_den) * 10) / 10
        : null
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

  // Precisión picking (promedio de los 3) y productividad (promedio de los 3 bul/HH efectivos)
  const precisiones = apertura.map((a) => a.precision).filter((v): v is number => v !== null)
  const productividades = apertura.map((a) => a.bul_hh_efectivo).filter((v): v is number => v !== null)
  const precision_pct =
    precisiones.length > 0
      ? Math.round(
          (precisiones.reduce((a, b) => a + b, 0) / precisiones.length) * 1000,
        ) / 10
      : null
  const productividad_bul_hh =
    productividades.length > 0
      ? Math.round(
          (productividades.reduce((a, b) => a + b, 0) /
            productividades.length) *
            10,
        ) / 10
      : null

  return {
    diaAnterior: diaAnt,
    indicadores: {
      wqi_ppm: wqi,
      fgli_hl: fgli,
      scl_ars: scl,
      capacidad_pct: capacidad,
      precision_pct,
      productividad_bul_hh,
    },
    apertura,
  }
}
