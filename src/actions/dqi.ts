"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { createPlanAccion } from "@/actions/gestion"
import { getRoturasChofer } from "@/actions/roturas-calle"
import type { PrioridadPlan } from "@/types/database"
import type { RoturaConDetalle } from "@/types/roturas"

// ===== DQI — Delivered Quality Index (Calidad de entrega, DPO Entrega 1.4) =====
// Roturas ocurridas EN LA ENTREGA/RUTA (categoría "ROTURA DISTRIBUCIÓN") ÷ HL
// entregados × 1.000.000 (PPM). El cálculo vive en el tablero deposito-esteban
// (que tiene la fuente de pérdidas); acá sólo lo consumimos para mostrarlo
// dentro de dpo-app, en /indicadores/dqi.

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"
// El endpoint liviano /api/dqi tarda ~2s medido (no recalcula NAC/horas/WNP
// como el /api/indicadores pesado, que tarda ~22s). El margen de 30s era una
// bomba: este fetch es un await bloqueante dentro del render de /reuniones/[id],
// que tiene 60s de presupuesto total — un cold start lento se comía la mitad y
// la página moría por timeout. Con 8s degrada a null y el resto se muestra.
const FETCH_TIMEOUT_MS = 8000

// Punto DPO Entrega 1.4 "Calidad de entrega de los productos".
const PREGUNTA_14_ID = "8d76cc3d-1d4e-4274-ac46-281cf22bdfd2"
const DQI_INDICADOR_NOMBRE = "DQI — Roturas en distribución"
// Marcador que guardamos en notas para asociar un plan a un mes del DQI.
const PERIODO_RE = /dqi_periodo=(\d{4})-(\d{2})/

export interface DqiCard {
  mes: number | null
  anual_acum: number | null
  ly_mes: number | null
  ly_anual: number | null
  vs_ly_pct: number | null
  unidad: string
  serie_real: (number | null)[]
  serie_ly: (number | null)[]
}

export interface DqiTopSku {
  codigo: string
  descripcion: string
  hl: number
  valor: number
  unidades: number
}

export interface DqiDetalle {
  hl_mes: number
  valor_mes: number
  hl_total_roturas_mes: number
  pct_de_roturas: number | null
  top_skus: DqiTopSku[]
}

export interface DqiPlan {
  id: string
  descripcion: string
  estado: string
  prioridad: string
  fecha_limite: string | null
  responsable: string | null
  /** Periodo "YYYY-MM" si el plan está asociado a un mes del DQI; null si es general. */
  periodo: string | null
  year: number | null
  month: number | null
}

export interface DqiData {
  year: number
  month: number
  dqi: DqiCard
  detalle: DqiDetalle
  /** Target en PPM tomado del indicador del punto 1.4 (meta). null si no está cargado. */
  target: number | null
  /** Planes de acción del punto 1.4 (todos los periodos). */
  planes: DqiPlan[]
  /** Roturas reportadas por choferes desde la app en el mes (registro, no recalcula el PPM). */
  roturas_chofer: RoturaConDetalle[]
}

export async function getDqi(
  year: number,
  month: number,
): Promise<{ data: DqiData } | { error: string }> {
  await requireAuth()
  try {
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/dqi?year=${year}&month=${month}`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) {
      return { error: `El tablero de pérdidas respondió ${res.status}` }
    }
    const j = (await res.json()) as {
      year: number
      month: number
      indicadores?: { dqi?: DqiCard }
      dqi_detalle?: DqiDetalle
    }
    const dqi = j?.indicadores?.dqi
    if (!dqi) {
      return { error: "El tablero no devolvió el indicador DQI todavía." }
    }

    // Target + planes del punto 1.4 (viven en dpo-app, no en el tablero) +
    // roturas reportadas por choferes desde la app (registro).
    const supabase = await createClient()
    const [{ data: ind }, { data: planesRaw }, roturasRes] = await Promise.all([
      supabase
        .from("indicadores")
        .select("meta")
        .eq("pregunta_id", PREGUNTA_14_ID)
        .eq("nombre", DQI_INDICADOR_NOMBRE)
        .maybeSingle(),
      supabase
        .from("planes_accion")
        .select("id, descripcion, estado, prioridad, notas, fecha_limite, responsable")
        .eq("pregunta_id", PREGUNTA_14_ID)
        .order("created_at", { ascending: false }),
      getRoturasChofer(year, month),
    ])
    const roturas_chofer = "data" in roturasRes ? roturasRes.data : []

    const target = ind?.meta && ind.meta > 0 ? Number(ind.meta) : null
    const planes: DqiPlan[] = (planesRaw ?? []).map((p) => {
      const m = (p.notas ?? "").match(PERIODO_RE)
      return {
        id: p.id as string,
        descripcion: p.descripcion as string,
        estado: p.estado as string,
        prioridad: p.prioridad as string,
        fecha_limite: (p.fecha_limite as string) ?? null,
        responsable: (p.responsable as string) ?? null,
        periodo: m ? `${m[1]}-${m[2]}` : null,
        year: m ? Number(m[1]) : null,
        month: m ? Number(m[2]) : null,
      }
    })

    return {
      data: {
        year: j.year,
        month: j.month,
        dqi,
        detalle:
          j.dqi_detalle ?? {
            hl_mes: 0,
            valor_mes: 0,
            hl_total_roturas_mes: 0,
            pct_de_roturas: null,
            top_skus: [],
          },
        target,
        planes,
        roturas_chofer,
      },
    }
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `No se pudo consultar el tablero de pérdidas: ${e.message}`
          : "Error consultando el tablero de pérdidas.",
    }
  }
}

/** Crea un plan de acción del punto 1.4 asociado a un mes concreto del DQI.
 * El mes queda codificado en notas (dqi_periodo=YYYY-MM) para poder marcarlo
 * sobre el gráfico de evolución. */
export async function crearPlanDqi(input: {
  year: number
  month: number
  descripcion: string
  responsable: string
  fecha_limite?: string
  prioridad?: PrioridadPlan
}): Promise<{ ok: true } | { error: string }> {
  await requireAuth()
  if (!input.descripcion.trim()) return { error: "La descripción es obligatoria." }
  if (!input.responsable.trim()) return { error: "El responsable es obligatorio." }
  const periodo = `${input.year}-${String(input.month).padStart(2, "0")}`
  const res = await createPlanAccion({
    pregunta_id: PREGUNTA_14_ID,
    descripcion: input.descripcion.trim(),
    responsable: input.responsable.trim(),
    fecha_limite: input.fecha_limite || undefined,
    prioridad: input.prioridad ?? "media",
    notas: `dqi_periodo=${periodo}`,
  })
  if ("error" in res) return { error: res.error }
  return { ok: true }
}

// ===== DQI por patente / móvil =====
// Desglose de las roturas y faltantes ocurridos EN DISTRIBUCIÓN, agrupados por la
// patente del camión (col "Descripción Transporte") y su móvil (col "Transporte")
// del "Detalle de Movimiento". La fuente es el mismo tablero deposito-esteban,
// endpoint /api/perdidas/distribucion-patente. `month` opcional: sin month = año
// entero. OJO: el DQI en PPM NO es calculable por patente (falta el denominador
// de HL entregados por camión); acá se expone el numerador desglosado (HL/unid/$
// rotos y faltantes por patente) para que la página lo muestre.

/** Roturas o faltantes de una patente/SKU (mismo shape en ambos). */
export interface DqiPatenteMagnitud {
  bultos: number
  unidades: number
  hl: number
}

export interface DqiPatenteSku {
  codigo: string
  descripcion: string
  roturas: DqiPatenteMagnitud
  faltantes: DqiPatenteMagnitud
}

export interface DqiPatente {
  patente: string
  /** Código de móvil (col "Transporte") o null si no vino. */
  movil: string | null
  roturas: DqiPatenteMagnitud
  faltantes: DqiPatenteMagnitud
  /** HL total (roturas + faltantes) valorizado con el maestro de artículos. */
  hl_total: number
  /** Desglose por SKU dentro de la patente. */
  detalle: DqiPatenteSku[]
}

export interface DqiPorPatenteData {
  year: number
  /** Mes 1-12, o null cuando es el año entero. */
  month: number | null
  patentes: DqiPatente[]
  total: {
    roturas: DqiPatenteMagnitud
    faltantes: DqiPatenteMagnitud
  }
  /** Total de filas de movimiento de distribución consideradas. */
  total_filas: number
  /** Filas que no traían patente (caen en la fila "(sin patente)"). */
  filas_sin_patente: number
  /** true si el maestro de artículos permitió valorizar HL. */
  tiene_hl: boolean
}

/** Trae el DQI (roturas + faltantes en distribución) desglosado por patente/móvil.
 * @param year año, ej 2026
 * @param month mes 1-12; omitir (o null) para el año entero. */
export async function getDqiPorPatente(
  year: number,
  month?: number | null,
): Promise<{ data: DqiPorPatenteData } | { error: string }> {
  await requireAuth()
  try {
    const qs = new URLSearchParams({ year: String(year) })
    if (month != null) qs.set("month", String(month))
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/perdidas/distribucion-patente?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) {
      return { error: `El tablero de pérdidas respondió ${res.status}` }
    }
    const j = (await res.json()) as DqiPorPatenteData
    return {
      data: {
        year: j.year,
        month: j.month ?? null,
        patentes: j.patentes ?? [],
        total: j.total ?? {
          roturas: { bultos: 0, unidades: 0, hl: 0 },
          faltantes: { bultos: 0, unidades: 0, hl: 0 },
        },
        total_filas: j.total_filas ?? 0,
        filas_sin_patente: j.filas_sin_patente ?? 0,
        tiene_hl: j.tiene_hl ?? false,
      },
    }
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `No se pudo consultar el DQI por patente: ${e.message}`
          : "Error consultando el DQI por patente.",
    }
  }
}

// ===== DQI por patente, en PPM =====
// El desglose de arriba es sólo el numerador (HL rotos por camión): con eso, el
// camión que más carga siempre parece el peor. Para rankear hace falta dividir
// por el volumen de cada uno.
//
// El DQI NO se recalcula: se REPARTE el que ya se publica. El denominador de una
// patente es su parte del HL entregado del mes, prorrateada por lo que despachó:
//
//   denom(p) = HL_entregados_del_mes × (HL_despachados(p) ÷ Σ HL_despachados)
//   ppm(p)   = HL_rotos(p) ÷ denom(p) × 1.000.000
//
// Así la suma ponderada de las patentes da EXACTO el DQI general publicado
// (verificado jun'26: Σ roturas por patente = 1,2477 HL = el hl_mes de /api/dqi,
// sobre 9.523,62 HL entregados = 131 PPM = el que publica /api/dqi).
//
// Supuesto (rotulado en la UI): los HL entregados se reparten entre camiones
// igual que los despachados. Difieren sólo por rechazos/devoluciones, que son
// chicos y no se imputan por patente en ninguna fuente.
//
// Sólo ROTURAS entran al PPM: el DQI del punto 1.4 es roturas en ruta. Los
// faltantes viajan en el mismo desglose pero quedan como dato de gestión aparte.

/** HL despachados por patente — tabla `ocupacion_bodega_diaria` (fecha, patente, hl_total). */
interface HlDespachado {
  patente: string
  hl_total: number | string | null
}

/** PostgREST corta en 1000 filas: un año son ~2.100 y el corte es SILENCIOSO
 * (dejaría camiones sin volumen → PPM inflado). Paginar siempre. */
const PAGE = 1000

async function getHlDespachadosPorPatente(
  desde: string,
  hasta: string,
): Promise<Record<string, number>> {
  const supabase = await createClient()
  const acum: Record<string, number> = {}
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("ocupacion_bodega_diaria")
      .select("patente, hl_total")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as HlDespachado[]
    for (const r of rows) {
      const p = (r.patente ?? "").trim()
      if (!p) continue
      acum[p] = (acum[p] ?? 0) + Number(r.hl_total ?? 0)
    }
    if (rows.length < PAGE) break
  }
  return acum
}

/** Cache in-process del HL entregado (dato mensual, se mueve lento). En Next 16
 * el fetch no se cachea salvo force-cache, y dentro de un server action eso no
 * es confiable — con esto la matinal no paga los ~5s del tablero en cada carga. */
const HL_TTL_MS = 15 * 60 * 1000
let hlMovidosCache: { t: number; v: Record<string, Record<string, { entregados?: number }>> } | null =
  null

/** HL entregados del período (mes, o año entero si month es null) — la MISMA
 * fuente que usa el DQI general: deposito-esteban /api/hl-movidos. */
async function getHlEntregados(
  year: number,
  month?: number | null,
): Promise<number | null> {
  let hm = hlMovidosCache && Date.now() - hlMovidosCache.t < HL_TTL_MS ? hlMovidosCache.v : null
  if (!hm) {
    const res = await fetch(`${DEPOSITO_API_BASE}/api/hl-movidos`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const j = (await res.json()) as {
      hl_movidos?: Record<string, Record<string, { entregados?: number }>>
    }
    hm = j?.hl_movidos ?? {}
    hlMovidosCache = { t: Date.now(), v: hm }
  }
  const anio = hm[String(year)]
  if (!anio) return null
  const meses = month != null ? [String(month)] : Object.keys(anio)
  let total = 0
  for (const m of meses) total += Number(anio[m]?.entregados ?? 0)
  return total > 0 ? total : null
}

/** Cache in-process del PPM mensual, por el mismo motivo que el de HL entregados:
 * lo consume el tablero de la matinal en cada carga y el endpoint tarda ~5s. */
const dqiPpmCache = new Map<string, { t: number; v: number | null }>()

/** DQI del mes en PPM — el número que ya se publica, sin recalcular nada.
 * Devuelve null (nunca tira) si el tablero de pérdidas no responde: la fila de
 * la matinal cae a "—" en vez de romper el tablero entero. */
export async function getDqiPpmMes(
  year: number,
  month: number,
): Promise<number | null> {
  await requireAuth()
  const key = `${year}-${month}`
  const hit = dqiPpmCache.get(key)
  if (hit && Date.now() - hit.t < HL_TTL_MS) return hit.v
  let ppm: number | null = null
  try {
    const res = await fetch(`${DEPOSITO_API_BASE}/api/dqi?year=${year}&month=${month}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.ok) {
      const j = (await res.json()) as { indicadores?: { dqi?: { mes?: number | null } } }
      const v = j?.indicadores?.dqi?.mes
      ppm = typeof v === "number" ? v : null
    }
  } catch {
    ppm = null
  }
  dqiPpmCache.set(key, { t: Date.now(), v: ppm })
  return ppm
}

export interface DqiPatenteRanking extends DqiPatente {
  /** HL que despachó ese camión en el período (ocupacion_bodega_diaria). */
  hl_despachados: number | null
  /** Denominador prorrateado: su parte del HL entregado del período. */
  hl_entregados_prorrateado: number | null
  /** DQI del camión en PPM. null = sin volumen registrado ⇒ se muestra "s/d",
   * NUNCA 0 (un 0 se leería como "camión impecable"). */
  ppm: number | null
  /** Participación del camión en los HL rotos del período (0-100). */
  pct_roturas: number
  /** Despachó muy poco para el período ⇒ su PPM se dispara con una sola rotura y
   * no es comparable con el resto (may'26: AF469UR movió 57 HL contra ~500 de los
   * demás y encabezaba el ranking con 1.279 PPM). Se avisa en la UI. */
  base_chica: boolean
}

export interface DqiRankingData {
  year: number
  month: number | null
  patentes: DqiPatenteRanking[]
  /** DQI general del período en PPM (el publicado): Σ rotos ÷ HL entregados. */
  dqi_ppm: number | null
  hl_rotos_total: number
  hl_entregados: number | null
  filas_sin_patente: number
  /** true si no se pudo traer el volumen: la tabla sale sin PPM, sólo numerador. */
  sin_volumen: boolean
}

function rangoFechas(year: number, month?: number | null): [string, string] {
  if (month == null) return [`${year}-01-01`, `${year}-12-31`]
  const mm = String(month).padStart(2, "0")
  // Día 0 del mes siguiente = último del mes. Se arma en UTC para que no se
  // corra un día por timezone.
  const ultimo = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(ultimo).padStart(2, "0")}`]
}

/** DQI desglosado por camión, en PPM. Ranking accionable: quién rompe más por
 * HL que mueve, no en términos absolutos.
 * @param month mes 1-12; omitir (o null) para el año entero. */
export async function getDqiPorPatenteRanking(
  year: number,
  month?: number | null,
): Promise<{ data: DqiRankingData } | { error: string }> {
  await requireAuth()

  const base = await getDqiPorPatente(year, month)
  if ("error" in base) return base

  const [desde, hasta] = rangoFechas(year, month)
  let despachados: Record<string, number> = {}
  let hlEntregados: number | null = null
  try {
    ;[despachados, hlEntregados] = await Promise.all([
      getHlDespachadosPorPatente(desde, hasta),
      getHlEntregados(year, month),
    ])
  } catch {
    // Sin volumen la tabla sigue sirviendo (numerador desglosado), sólo que sin PPM.
    despachados = {}
  }

  const totalDespachado = Object.values(despachados).reduce((a, b) => a + b, 0)
  const hlRotosTotal = base.data.total.roturas.hl
  const sinVolumen = totalDespachado <= 0 || hlEntregados == null

  // Un camión que despachó y NO rompió nada NO viene en el desglose de pérdidas
  // (ahí sólo hay filas de rotura/faltante). Hay que sumarlo igual, por dos motivos:
  //   1. Es la información más útil de la tabla: DQI 0, el camión que mejor entrega.
  //   2. Si no, su volumen queda fuera del reparto y el denominador de TODOS los
  //      demás sale chico ⇒ PPM inflado y la suma ponderada no cierra con el DQI
  //      general (jun'26: daba 147 PPM contra los 131 publicados, porque AE591EI
  //      despachó 557 HL sin roturas y no estaba en la lista).
  const VACIO: DqiPatenteMagnitud = { bultos: 0, unidades: 0, hl: 0 }
  const conRoturas = new Set(base.data.patentes.map((p) => p.patente))
  const soloVolumen: DqiPatente[] = Object.keys(despachados)
    .filter((pat) => !conRoturas.has(pat))
    .map((pat) => ({
      patente: pat,
      movil: null,
      roturas: { ...VACIO },
      faltantes: { ...VACIO },
      hl_total: 0,
      detalle: [],
    }))

  // Umbral de "base chica": menos de un tercio de lo que despachó el camión medio.
  const nCamiones = Object.keys(despachados).length
  const promedioDespachado = nCamiones > 0 ? totalDespachado / nCamiones : 0
  const UMBRAL_BASE_CHICA = promedioDespachado / 3

  const patentes: DqiPatenteRanking[] = [...base.data.patentes, ...soloVolumen].map((p) => {
    const hlDesp = despachados[p.patente] ?? null
    const prorrateado =
      !sinVolumen && hlDesp != null && hlDesp > 0
        ? (hlEntregados as number) * (hlDesp / totalDespachado)
        : null
    return {
      ...p,
      hl_despachados: hlDesp,
      hl_entregados_prorrateado: prorrateado,
      ppm:
        prorrateado != null && prorrateado > 0
          ? Math.round((p.roturas.hl / prorrateado) * 1e6)
          : null,
      pct_roturas:
        hlRotosTotal > 0 ? Math.round((p.roturas.hl / hlRotosTotal) * 1000) / 10 : 0,
      base_chica:
        hlDesp != null && UMBRAL_BASE_CHICA > 0 && hlDesp < UMBRAL_BASE_CHICA,
    }
  })

  // Peor camión primero; los que no tienen volumen ("(sin patente)") van al final.
  patentes.sort((a, b) => {
    if (a.ppm == null && b.ppm == null) return b.roturas.hl - a.roturas.hl
    if (a.ppm == null) return 1
    if (b.ppm == null) return -1
    return b.ppm - a.ppm
  })

  return {
    data: {
      year,
      month: month ?? null,
      patentes,
      dqi_ppm:
        hlEntregados != null && hlEntregados > 0
          ? Math.round((hlRotosTotal / hlEntregados) * 1e6 * 10) / 10
          : null,
      hl_rotos_total: Math.round(hlRotosTotal * 10000) / 10000,
      hl_entregados: hlEntregados,
      filas_sin_patente: base.data.filas_sin_patente,
      sin_volumen: sinVolumen,
    },
  }
}
