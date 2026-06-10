import { Pool } from "pg"

// ─────────────────────────────────────────────────────────────────────────────
// Conexión de SOLO LECTURA a la base del dashboard Mercosur (Railway/Postgres),
// donde viven las ventas (Chess + GESCOM) y los objetivos de venta (PAV).
// dpo-app no replica esos datos: los consulta acá y congela un snapshot en su
// propia base. URL en la env MERCOSUR_DB_URL.
// La lógica de avance replica la del endpoint /api/pav/avance del dashboard:
// objetivo de `objetivos_final` (proceso cerrado del mes), venta real Chess+GESCOM
// por categoría, y tendencia ponderada por días hábiles (L-V=1, S=0.5, Dom=0).
// ─────────────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.MERCOSUR_DB_URL
    if (!url) {
      throw new Error(
        "Falta configurar MERCOSUR_DB_URL (la base del dashboard Mercosur).",
      )
    }
    _pool = new Pool({
      connectionString: url,
      max: 3,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
    })
  }
  return _pool
}

export type CategoriaVenta = "Cervezas" | "UNG" | "Aguas"

export interface AvanceCategoria {
  categoria: CategoriaVenta
  objetivo_hl: number
  real_hl: number
  tendencia_hl: number
  pct_avance: number
}

export interface AvanceEmpresa {
  anio: number
  mes: number
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD (corte del acumulado)
  peso_habiles: number
  peso_trabajados: number
  objetivo_disponible: boolean
  total: {
    objetivo_hl: number
    real_hl: number
    tendencia_hl: number
    pct_avance: number
  }
  categorias: AvanceCategoria[]
}

const ORDEN: CategoriaVenta[] = ["Cervezas", "UNG", "Aguas"]

// Clasifica el grupo_producto de objetivos_final a una categoría. Robusto ante
// el tipo de guión usado en los nombres (ej. "1 – CZA Core+Value").
function clasificarGrupo(grupo: string): CategoriaVenta | null {
  const g = grupo.toUpperCase()
  if (g.includes("CZA") || g.includes("CERVEZ")) return "Cervezas"
  if (g.includes("UNG")) return "UNG"
  if (g.includes("AGUA")) return "Aguas"
  return null
}

// CASE compartido (Chess y GESCOM) para mapear uneg/segmento a categoría.
// Mismos segmentos que /api/pav/avance; excluye combos, envases y NULL.
const CAT_SQL = `CASE
  WHEN upper(a.uneg) = 'CERVEZAS CMQ' AND upper(coalesce(a.segmento,'')) IN ('LOW','CORE','CORE PLUS','HIGH END','SUPER PREMIUM') THEN 'Cervezas'
  WHEN upper(a.uneg) = 'UNG' AND upper(coalesce(a.segmento,'')) IN ('TOP','UNG RESTO') THEN 'UNG'
  WHEN upper(a.uneg) = 'AGUAS' AND upper(coalesce(a.segmento,'')) NOT LIKE 'ENV%' THEN 'Aguas'
  ELSE NULL END`

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

// Hoy en hora Argentina (UTC-3), como Date "naive" en UTC para usar getUTC*.
function hoyArg(): Date {
  const ahora = new Date()
  return new Date(ahora.getTime() - 3 * 60 * 60 * 1000)
}

// Pesos de días hábiles del mes: L-V=1, S=0.5, Dom=0, menos feriados.
function calcularPesos(
  anio: number,
  mes: number,
  feriados: Set<string>,
  hasta: Date,
): { peso_habiles: number; peso_trabajados: number } {
  const first = new Date(Date.UTC(anio, mes - 1, 1))
  const last = new Date(Date.UTC(anio, mes, 0))
  let peso_habiles = 0
  let peso_trabajados = 0
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay() // 0=Dom, 6=Sáb
    let peso = wd === 0 ? 0 : wd === 6 ? 0.5 : 1
    if (feriados.has(ymd(d))) peso = 0
    peso_habiles += peso
    if (d <= hasta) peso_trabajados += peso
  }
  return { peso_habiles, peso_trabajados }
}

function nuevoTotalCategorias(): Record<CategoriaVenta, { objetivo: number; real: number }> {
  return {
    Cervezas: { objetivo: 0, real: 0 },
    UNG: { objetivo: 0, real: 0 },
    Aguas: { objetivo: 0, real: 0 },
  }
}

// Consulta el avance de venta de la empresa (HL) para un mes, con corte al día.
export async function consultarAvanceEmpresa(
  anio: number,
  mes: number,
): Promise<AvanceEmpresa> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const first = `${anio}-${String(mes).padStart(2, "0")}-01`
    const lastDate = new Date(Date.UTC(anio, mes, 0))
    const lastStr = ymd(lastDate)

    // Corte = hoy (ARG) acotado al mes; mes pasado => fin de mes; futuro => día 1.
    const hoy = hoyArg()
    const firstDate = new Date(Date.UTC(anio, mes - 1, 1))
    const hastaDate = hoy < firstDate ? firstDate : hoy > lastDate ? lastDate : hoy
    const hastaStr = ymd(hastaDate)

    // 1. Feriados del mes → pesos de días hábiles
    const feriadosRes = await client.query<{ fecha: string }>(
      "SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM feriados WHERE fecha BETWEEN $1 AND $2",
      [first, lastStr],
    )
    const feriados = new Set(feriadosRes.rows.map((r) => r.fecha))
    const { peso_habiles, peso_trabajados } = calcularPesos(
      anio,
      mes,
      feriados,
      hastaDate,
    )

    const acc = nuevoTotalCategorias()

    // 2. Objetivo del mes: último proceso cerrado de objetivos
    const procRes = await client.query<{ id: number }>(
      `SELECT id FROM objetivos_proceso
       WHERE anio = $1 AND mes = $2 AND estado = 'cerrado'
       ORDER BY id DESC LIMIT 1`,
      [anio, mes],
    )
    const objetivo_disponible = procRes.rows.length > 0
    if (objetivo_disponible) {
      const objRes = await client.query<{ grupo_producto: string; total: string }>(
        `SELECT grupo_producto, SUM(valor) AS total
         FROM objetivos_final WHERE proceso_id = $1
         GROUP BY grupo_producto`,
        [procRes.rows[0].id],
      )
      for (const r of objRes.rows) {
        const cat = clasificarGrupo(r.grupo_producto)
        if (cat) acc[cat].objetivo += Number(r.total) || 0
      }
    }

    // 3. Venta real Chess (acumulado a la fecha) — mismos filtros que /api/pav/avance
    const chessRes = await client.query<{ cat: CategoriaVenta | null; hl: string }>(
      `SELECT ${CAT_SQL} AS cat, SUM(c.unimed_total) AS hl
       FROM comprobantes c
       LEFT JOIN articulos a ON c.id_articulo = a.id_articulo
       WHERE c.fecha BETWEEN $1 AND $2
         AND c.anulado = 'NO' AND c.region = 'pampeana'
         AND COALESCE(c.ds_fletero_carga, '') NOT ILIKE '%SEGUNDA VUELTA%'
         AND COALESCE(a.segmento, '') NOT LIKE 'env%'
       GROUP BY 1`,
      [first, hastaStr],
    )
    for (const r of chessRes.rows) {
      if (r.cat) acc[r.cat].real += Number(r.hl) || 0
    }

    // 4. Venta real GESCOM (acumulado a la fecha)
    const gescomRes = await client.query<{ cat: CategoriaVenta | null; hl: string }>(
      `SELECT ${CAT_SQL} AS cat, SUM(g.cantidad * COALESCE(a.valor_unidad_medida, 0)) AS hl
       FROM comprobantes_gescom g
       LEFT JOIN articulos a ON g.id_articulo = a.id_articulo
       WHERE g.fecha BETWEEN $1 AND $2
         AND g.codigo_sede = 2 AND COALESCE(g.estado, '') = 'Finalizada'
         AND COALESCE(a.segmento, '') NOT LIKE 'env%'
       GROUP BY 1`,
      [first, hastaStr],
    )
    for (const r of gescomRes.rows) {
      if (r.cat) acc[r.cat].real += Number(r.hl) || 0
    }

    // 5. Armar resultado (tendencia = real / peso_trabajados * peso_habiles)
    const factor = peso_trabajados > 0 ? peso_habiles / peso_trabajados : 0
    const categorias: AvanceCategoria[] = ORDEN.map((cat) => {
      const o = acc[cat].objetivo
      const r = acc[cat].real
      return {
        categoria: cat,
        objetivo_hl: o,
        real_hl: r,
        tendencia_hl: r * factor,
        pct_avance: o > 0 ? (r / o) * 100 : 0,
      }
    })
    const objTotal = categorias.reduce((s, c) => s + c.objetivo_hl, 0)
    const realTotal = categorias.reduce((s, c) => s + c.real_hl, 0)

    return {
      anio,
      mes,
      desde: first,
      hasta: hastaStr,
      peso_habiles,
      peso_trabajados,
      objetivo_disponible,
      total: {
        objetivo_hl: objTotal,
        real_hl: realTotal,
        tendencia_hl: realTotal * factor,
        pct_avance: objTotal > 0 ? (realTotal / objTotal) * 100 : 0,
      },
      categorias,
    }
  } finally {
    client.release()
  }
}
