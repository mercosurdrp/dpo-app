import { Pool } from "pg"

// ─────────────────────────────────────────────────────────────────────────────
// Conexión de SOLO LECTURA a la base del dashboard Mercosur (Railway/Postgres),
// donde viven las ventas (Chess + GESCOM) y los objetivos de venta (PAV).
// dpo-app no replica esos datos: los consulta acá y congela un snapshot en su
// propia base. URL en la env MERCOSUR_DB_URL.
// El "real" replica EXACTAMENTE la pantalla "Resumen Ventas" del dashboard
// (/api/dashboard/ventas → dashboard.py): SUM(unimed_total) de Chess
// (`comprobantes`) por unidad de negocio desde la tabla `segmentos`, SIN excluir
// fletes (SEGUNDA VUELTA/REFUERZO) ni envases y SIN sumar GESCOM, para que el
// número de la reunión coincida al decimal con el dashboard. El objetivo sale de
// `objetivos_final` (proceso cerrado del mes) y la tendencia se pondera por días
// hábiles (L-V=1, S=0.5, Dom=0).
// ─────────────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null

export function getPool(): Pool {
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

// CASE que mapea la unidad de negocio (tabla `segmentos`) a la categoría del
// avance, agrupando igual que "Resumen Ventas" del dashboard (dashboard.py).
const CAT_SQL = `CASE
  WHEN s.uneg = 'CERVEZAS CMQ' THEN 'Cervezas'
  WHEN s.uneg = 'UNG' THEN 'UNG'
  WHEN s.uneg = 'AGUAS' THEN 'Aguas'
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

    // 3. Venta real — réplica EXACTA de "Resumen Ventas" del dashboard
    // (/api/dashboard/ventas → dashboard.py): SUM(unimed_total) de Chess por
    // unidad de negocio desde la tabla `segmentos`, acumulado a la fecha, sin
    // excluir fletes (SEGUNDA VUELTA/REFUERZO) ni envases y sin sumar GESCOM.
    const ventasRes = await client.query<{ cat: CategoriaVenta | null; hl: string }>(
      `SELECT ${CAT_SQL} AS cat, SUM(c.unimed_total) AS hl
       FROM comprobantes c
       LEFT JOIN segmentos s ON c.id_articulo = s.id_articulo
       WHERE c.fecha BETWEEN $1 AND $2
         AND c.region = 'pampeana'
         AND c.anulado = 'NO'
       GROUP BY 1`,
      [first, hastaStr],
    )
    for (const r of ventasRes.rows) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Ventas por cliente (PDV) en dos períodos comparables — insumo de la
// clusterización del Pilar Planeamiento (pregunta 4.2 "Plan de agrupación de
// clientes"). Devuelve ingresos del período actual y del anterior (mismo largo)
// por id_cliente, más bultos y días de compra del período actual (proxy de
// frecuencia / drop size para aproximar el costo de servir cada PDV).
//
// Fuente: tabla `comprobantes` (ventas Chess, ya neta de devoluciones vía
// subtotal_neto; anulado='NO'). El corte se ancla al MAX(fecha) de la tabla
// para que sea estable aunque el sync venga atrasado.
// ─────────────────────────────────────────────────────────────────────────────

export interface VentasClienteRow {
  id_cliente: number
  nombre: string | null
  localidad: string | null
  promotor: string | null
  segmento: string | null
  ingresos_actual: number
  ingresos_anterior: number
  bultos_actual: number
  dias_actual: number
}

export interface PeriodoComparado {
  /** Largo de cada período, en días. */
  dias_periodo: number
  /** Período actual: [actual_desde, actual_hasta] (inclusive). */
  actual_desde: string
  actual_hasta: string
  /** Período anterior: [anterior_desde, actual_desde). */
  anterior_desde: string
}

export interface VentasPorClienteResultado {
  periodo: PeriodoComparado
  clientes: VentasClienteRow[]
}

export async function consultarVentasPorCliente(
  diasPeriodo = 90,
): Promise<VentasPorClienteResultado> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Ancla = última fecha cargada en comprobantes.
    const maxRes = await client.query<{ maxf: string }>(
      "SELECT to_char(max(fecha), 'YYYY-MM-DD') AS maxf FROM comprobantes",
    )
    const maxF = maxRes.rows[0]?.maxf
    if (!maxF) {
      return {
        periodo: {
          dias_periodo: diasPeriodo,
          actual_desde: "",
          actual_hasta: "",
          anterior_desde: "",
        },
        clientes: [],
      }
    }

    const [y, m, d] = maxF.split("-").map((s) => parseInt(s, 10))
    const hasta = new Date(Date.UTC(y, m - 1, d)) // inclusive
    const actualDesdeD = new Date(hasta)
    actualDesdeD.setUTCDate(actualDesdeD.getUTCDate() - (diasPeriodo - 1))
    const anteriorDesdeD = new Date(actualDesdeD)
    anteriorDesdeD.setUTCDate(anteriorDesdeD.getUTCDate() - diasPeriodo)
    const hastaExclD = new Date(hasta)
    hastaExclD.setUTCDate(hastaExclD.getUTCDate() + 1) // límite superior exclusivo

    const actualDesde = ymd(actualDesdeD)
    const anteriorDesde = ymd(anteriorDesdeD)
    const hastaExcl = ymd(hastaExclD)

    const res = await client.query<{
      id_cliente: number
      nombre: string | null
      localidad: string | null
      promotor: string | null
      segmento: string | null
      ingresos_actual: string
      ingresos_anterior: string
      bultos_actual: string
      dias_actual: string
    }>(
      `SELECT
         id_cliente,
         max(nombre_cliente)   AS nombre,
         max(ds_localidad)     AS localidad,
         max(ds_vendedor)      AS promotor,
         max(ds_segmento_mkt)  AS segmento,
         sum(CASE WHEN fecha >= $1 THEN subtotal_neto ELSE 0 END)                 AS ingresos_actual,
         sum(CASE WHEN fecha >= $2 AND fecha < $1 THEN subtotal_neto ELSE 0 END)  AS ingresos_anterior,
         sum(CASE WHEN fecha >= $1 THEN cantidades_total ELSE 0 END)              AS bultos_actual,
         count(DISTINCT CASE WHEN fecha >= $1 THEN fecha::date END)               AS dias_actual
       FROM comprobantes
       WHERE fecha >= $2 AND fecha < $3 AND anulado = 'NO' AND id_cliente IS NOT NULL
       GROUP BY id_cliente
       HAVING sum(CASE WHEN fecha >= $1 THEN subtotal_neto ELSE 0 END) > 0`,
      [actualDesde, anteriorDesde, hastaExcl],
    )

    const clientes: VentasClienteRow[] = res.rows.map((r) => ({
      id_cliente: r.id_cliente,
      nombre: r.nombre,
      localidad: r.localidad,
      promotor: r.promotor,
      segmento: r.segmento,
      ingresos_actual: Number(r.ingresos_actual) || 0,
      ingresos_anterior: Number(r.ingresos_anterior) || 0,
      bultos_actual: Number(r.bultos_actual) || 0,
      dias_actual: Number(r.dias_actual) || 0,
    }))

    return {
      periodo: {
        dias_periodo: diasPeriodo,
        actual_desde: actualDesde,
        actual_hasta: maxF,
        anterior_desde: anteriorDesde,
      },
      clientes,
    }
  } finally {
    client.release()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clusterización (Planeamiento 4.2): el ENCUADRE (facturación + crecimiento) es
// YTD —acumulado del año vs el mismo tramo del año anterior—, mientras que el
// DROP SIZE mira solo los últimos 45 días (foto reciente). El rechazo (estado)
// también se evalúa a 45 días, pero eso lo resuelve la capa de Supabase.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClusterClienteRow {
  id_cliente: number
  nombre: string | null
  localidad: string | null
  promotor: string | null
  segmento: string | null
  /** Facturación neta acumulada del año en curso (YTD). */
  facturacion_ytd: number
  /** Facturación neta del mismo tramo del año anterior (YTD-1). */
  facturacion_ytd_prev: number
  /** Bultos de los últimos 45 días (para el drop size). */
  bultos_45d: number
  /** Días con visita en los últimos 45 días. */
  dias_45d: number
}

export interface ClusterPeriodo {
  ytd_desde: string
  ytd_hasta: string
  ytd_prev_desde: string
  ytd_prev_hasta: string
  drop_desde: string
}

export interface ClusterVentasResultado {
  periodo: ClusterPeriodo
  clientes: ClusterClienteRow[]
}

const DROP_DIAS = 45

export async function consultarClusterClientes(): Promise<ClusterVentasResultado> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const maxRes = await client.query<{ maxf: string }>(
      "SELECT to_char(max(fecha), 'YYYY-MM-DD') AS maxf FROM comprobantes",
    )
    const maxF = maxRes.rows[0]?.maxf
    if (!maxF) {
      return {
        periodo: { ytd_desde: "", ytd_hasta: "", ytd_prev_desde: "", ytd_prev_hasta: "", drop_desde: "" },
        clientes: [],
      }
    }

    const [y, m, d] = maxF.split("-").map((s) => parseInt(s, 10))
    const ancla = new Date(Date.UTC(y, m - 1, d)) // inclusive
    const ytdDesde = `${y}-01-01`
    const ytdPrevDesde = `${y - 1}-01-01`
    const ytdPrevHasta = ymd(new Date(Date.UTC(y - 1, m - 1, d))) // mismo día/mes, año anterior
    const dropDesdeD = new Date(ancla)
    dropDesdeD.setUTCDate(dropDesdeD.getUTCDate() - (DROP_DIAS - 1))
    const dropDesde = ymd(dropDesdeD)

    const res = await client.query<{
      id_cliente: number
      nombre: string | null
      localidad: string | null
      promotor: string | null
      segmento: string | null
      facturacion_ytd: string
      facturacion_ytd_prev: string
      bultos_45d: string
      dias_45d: string
    }>(
      `SELECT
         id_cliente,
         max(nombre_cliente)   AS nombre,
         max(ds_localidad)     AS localidad,
         max(ds_vendedor)      AS promotor,
         max(ds_segmento_mkt)  AS segmento,
         sum(CASE WHEN fecha >= $1 THEN subtotal_neto ELSE 0 END)                  AS facturacion_ytd,
         sum(CASE WHEN fecha >= $2 AND fecha <= $3 THEN subtotal_neto ELSE 0 END)  AS facturacion_ytd_prev,
         sum(CASE WHEN fecha >= $4 THEN cantidades_total ELSE 0 END)               AS bultos_45d,
         count(DISTINCT CASE WHEN fecha >= $4 THEN fecha::date END)                AS dias_45d
       FROM comprobantes
       WHERE fecha >= $2 AND fecha <= $5 AND anulado = 'NO' AND id_cliente IS NOT NULL
       GROUP BY id_cliente
       HAVING sum(CASE WHEN fecha >= $1 THEN subtotal_neto ELSE 0 END) > 0`,
      [ytdDesde, ytdPrevDesde, ytdPrevHasta, dropDesde, maxF],
    )

    const clientes: ClusterClienteRow[] = res.rows.map((r) => ({
      id_cliente: r.id_cliente,
      nombre: r.nombre,
      localidad: r.localidad,
      promotor: r.promotor,
      segmento: r.segmento,
      facturacion_ytd: Number(r.facturacion_ytd) || 0,
      facturacion_ytd_prev: Number(r.facturacion_ytd_prev) || 0,
      bultos_45d: Number(r.bultos_45d) || 0,
      dias_45d: Number(r.dias_45d) || 0,
    }))

    return {
      periodo: { ytd_desde: ytdDesde, ytd_hasta: maxF, ytd_prev_desde: ytdPrevDesde, ytd_prev_hasta: ytdPrevHasta, drop_desde: dropDesde },
      clientes,
    }
  } finally {
    client.release()
  }
}

export interface EquipoFrioCliente {
  /** Cantidad de equipos de frío INSTALADOS en el PDV. */
  cantidad: number
  /** Resumen de modelos instalados (ej. "SLIM, VG"). null = sin dato. */
  tipos: string | null
}

/**
 * Equipos de frío (EDF) INSTALADOS por cliente, leídos de `edf_activos` (la base
 * del dashboard Mercosur, misma DB que comprobantes — fuente viva, NO el Excel).
 * Clave = id_cliente de Chess (cruza con la clusterización). Solo Estado=INSTALADO.
 */
export async function consultarEquiposFrioPorCliente(): Promise<Map<number, EquipoFrioCliente>> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ id_cliente: number; cantidad: string; tipos: string | null }>(
      `SELECT cliente AS id_cliente,
              count(*) AS cantidad,
              string_agg(DISTINCT modelo, ', ' ORDER BY modelo) AS tipos
         FROM edf_activos
        WHERE estado = 'INSTALADO' AND cliente IS NOT NULL
        GROUP BY cliente`,
    )
    const m = new Map<number, EquipoFrioCliente>()
    for (const r of res.rows) {
      m.set(Number(r.id_cliente), { cantidad: Number(r.cantidad) || 0, tipos: r.tipos })
    }
    return m
  } finally {
    client.release()
  }
}

export interface CensoPdvInfo {
  /** HL/mes que el PDV mueve en TODO el mercado (CMQ + CCU + otros). */
  hl_total: number
  /** HL/mes CMQ relevados en el PDV. */
  hl_cmq: number
  /** Share of market CMQ en el PDV (hl_cmq / hl_total). null = sin volumen. */
  som: number | null
  canal: string | null
  subcanal: string | null
  /** Promotor según el censo (puede diferir del vigente en Chess). */
  promotor_censo: string | null
  /** true = el censo relevó volumen en el PDV (universo de KPIs del censo). */
  con_volumen: boolean
  /** Marca madre de la COMPETENCIA con más HL en el PDV (batalla sugerida). */
  comp_marca: string | null
  comp_marca_hl: number
  /** Segmento de esa marca (VALUE/CORE/…) — define la marca CMQ espejo. */
  comp_segmento: string | null
}

export interface CensoThomasResultado {
  censo_id: number
  censo_nombre: string
  /** PDV del censo por código (= id_cliente de Chess). */
  pdvs: Map<number, CensoPdvInfo>
}

/**
 * Censo Thomas (módulo censo del dashboard Mercosur, misma DB que comprobantes):
 * volumen de mercado por PDV del censo MÁS RECIENTE + la marca de la competencia
 * más vendida en cada PDV. Clave = codigo_pdv numérico (= id_cliente de Chess).
 * Devuelve null si todavía no hay censos cargados.
 */
export async function consultarCensoThomasPorPdv(): Promise<CensoThomasResultado | null> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const cRes = await client.query<{ id: number; nombre: string }>(
      `SELECT id, nombre FROM censo_thomas_censos ORDER BY fecha DESC, id DESC LIMIT 1`,
    )
    const censo = cRes.rows[0]
    if (!censo) return null

    const res = await client.query<{
      codigo_pdv: string
      hl_total: string | null
      hl_cmq: string | null
      canal_agrupado: string | null
      subcanal_mkt: string | null
      promotor: string | null
      censado_con_volumen: boolean | null
      comp_marca: string | null
      comp_marca_hl: string | null
      comp_segmento: string | null
    }>(
      `SELECT p.codigo_pdv, p.hl_total, p.hl_cmq, p.canal_agrupado, p.subcanal_mkt,
              p.promotor, p.censado_con_volumen,
              t.marca_madre AS comp_marca, t.hl AS comp_marca_hl, t.segmento AS comp_segmento
         FROM censo_thomas_pdv p
         LEFT JOIN LATERAL (
           SELECT r.marca_madre, r.segmento, sum(r.hl_mes) AS hl
             FROM censo_thomas_respuestas r
            WHERE r.censo_id = p.censo_id AND r.codigo_pdv = p.codigo_pdv
              AND r.fabricante <> 'CMQ' AND r.hl_mes > 0
            GROUP BY r.marca_madre, r.segmento
            ORDER BY sum(r.hl_mes) DESC
            LIMIT 1
         ) t ON true
        WHERE p.censo_id = $1 AND p.codigo_pdv ~ '^[0-9]+$'`,
      [censo.id],
    )

    const pdvs = new Map<number, CensoPdvInfo>()
    for (const r of res.rows) {
      const hlTotal = Number(r.hl_total) || 0
      const hlCmq = Number(r.hl_cmq) || 0
      pdvs.set(Number(r.codigo_pdv), {
        hl_total: hlTotal,
        hl_cmq: hlCmq,
        som: hlTotal > 0 ? hlCmq / hlTotal : null,
        canal: r.canal_agrupado,
        subcanal: r.subcanal_mkt,
        promotor_censo: r.promotor,
        con_volumen: !!r.censado_con_volumen,
        comp_marca: r.comp_marca,
        comp_marca_hl: Number(r.comp_marca_hl) || 0,
        comp_segmento: r.comp_segmento,
      })
    }
    return { censo_id: censo.id, censo_nombre: censo.nombre, pdvs }
  } finally {
    client.release()
  }
}
