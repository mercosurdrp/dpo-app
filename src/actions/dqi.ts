"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { createPlanAccion } from "@/actions/gestion"
import { getRoturasChofer } from "@/actions/roturas-calle"
import { PREGUNTA_KEY, preguntaIdPorKey } from "@/lib/dpo/pregunta-por-key"
import type { PrioridadPlan } from "@/types/database"
import type { RoturaConDetalle, RoturaMotivo } from "@/types/roturas"
import { ROTURA_MOTIVO_LABELS } from "@/types/roturas"
import {
  clasificarSku,
  type DqiGrupoCalibre,
  type DqiGrupoEnvase,
  type DqiSkuFila,
  type DqiTipoSkuData,
  type EnvaseSku,
} from "@/lib/dqi/tipo-sku"

// ===== DQI — Delivered Quality Index (Calidad de entrega, DPO Entrega 1.4) =====
// Roturas ocurridas EN LA ENTREGA/RUTA (categoría "ROTURA DISTRIBUCIÓN") ÷ HL
// entregados × 1.000.000 (PPM). El cálculo vive en el tablero deposito-esteban
// (que tiene la fuente de pérdidas); acá sólo lo consumimos para mostrarlo
// dentro de dpo-app, en /indicadores/dqi.

const DEPOSITO_API_BASE = "https://deposito-regionpampeana.vercel.app"
// El endpoint liviano /api/dqi tarda ~2s medido (no recalcula NAC/horas/WNP
// como el /api/indicadores pesado, que tarda ~22s). El margen de 30s era una
// bomba: este fetch es un await bloqueante dentro del render de /reuniones/[id],
// que tiene 60s de presupuesto total — un cold start lento se comía la mitad y
// la página moría por timeout. Con 8s degrada a null y el resto se muestra.
const FETCH_TIMEOUT_MS = 8000

// Punto DPO Entrega 1.4 "Calidad de entrega de los productos". Se busca por la
// key del manual: el UUID que estaba fijo acá sólo existía en la base de Pampeana.
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

/**
 * Corrección auditoría DPO H2 (punto 1.4): el DQI debe incluir el volumen que
 * entra a REEMPAQUE — un producto que vuelve de ruta con el packaging roto es
 * una falla de calidad de entrega aunque se recupere y vuelva al stock. La
 * medición anterior (solo merma de ruta) subestimaba ~25× el indicador.
 */
export interface DqiCorreccion {
  /** HL que entraron a reempaque en el mes (serie diaria del tablero). */
  reempaque_hl: number
  /** Aporte del reempaque en PPM sobre los HL entregados del mes. */
  reempaque_ppm: number | null
  /** DQI corregido: (HL rotos en ruta + HL a reempaque) ÷ HL entregados × 1M. */
  ppm_corregido: number | null
}

export interface DqiData {
  year: number
  month: number
  dqi: DqiCard
  detalle: DqiDetalle
  /** null si la serie diaria del tablero no respondió. */
  correccion: DqiCorreccion | null
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
    // roturas reportadas por choferes desde la app (registro) + insumos de la
    // corrección H2 (reempaque del mes + HL entregados, en paralelo).
    const supabase = await createClient()
    const pregunta14 = (await preguntaIdPorKey(supabase, PREGUNTA_KEY.ENTREGA_1_4)) ?? ""
    const [{ data: ind }, { data: planesRaw }, roturasRes, reempaqueHl, hlEntregados] = await Promise.all([
      supabase
        .from("indicadores")
        .select("meta")
        .eq("pregunta_id", pregunta14)
        .eq("nombre", DQI_INDICADOR_NOMBRE)
        .maybeSingle(),
      supabase
        .from("planes_accion")
        .select("id, descripcion, estado, prioridad, notas, fecha_limite, responsable")
        .eq("pregunta_id", pregunta14)
        .order("created_at", { ascending: false }),
      getRoturasChofer(year, month),
      getReempaqueHlMes(year, month),
      getHlEntregados(year, month),
    ])
    const roturas_chofer = "data" in roturasRes ? roturasRes.data : []

    // DQI corregido (auditoría H2): roturas de ruta + reempaque, mismo
    // denominador que la tarjeta mensual oficial (HL entregados del mes).
    let correccion: DqiCorreccion | null = null
    if (reempaqueHl != null) {
      const hlRuta = j.dqi_detalle?.hl_mes ?? 0
      correccion = {
        reempaque_hl: Math.round(reempaqueHl * 100) / 100,
        reempaque_ppm: hlEntregados
          ? Math.round((reempaqueHl / hlEntregados) * 1_000_000)
          : null,
        ppm_corregido: hlEntregados
          ? Math.round(((hlRuta + reempaqueHl) / hlEntregados) * 1_000_000)
          : null,
      }
    }

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
        correccion,
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

/** HL que entraron a reempaque en el mes (Σ `reempaque_hl_dia` de la serie
 * diaria del tablero). Devuelve null si el tablero no responde: la corrección
 * del DQI simplemente no se muestra, la página no se rompe. */
const reempaqueMesCache = new Map<string, { t: number; v: number | null }>()

async function getReempaqueHlMes(
  year: number,
  month: number,
): Promise<number | null> {
  const key = `${year}-${month}`
  const hit = reempaqueMesCache.get(key)
  if (hit && Date.now() - hit.t < HL_TTL_MS) return hit.v
  let total: number | null = null
  try {
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (res.ok) {
      const j = (await res.json()) as {
        reempaque_hl_dia?: Record<string, number | null>
      }
      if (j?.reempaque_hl_dia) {
        total = 0
        for (const v of Object.values(j.reempaque_hl_dia)) {
          if (v != null && Number.isFinite(v)) total += v
        }
      }
    }
  } catch {
    total = null
  }
  reempaqueMesCache.set(key, { t: Date.now(), v: total })
  return total
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
  const pregunta14 = await preguntaIdPorKey(await createClient(), PREGUNTA_KEY.ENTREGA_1_4)
  if (!pregunta14) return { error: "No se encontró el punto 1.4 de Entrega en el manual DPO." }
  const periodo = `${input.year}-${String(input.month).padStart(2, "0")}`
  const res = await createPlanAccion({
    pregunta_id: pregunta14,
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

/** Serie diaria del DQI: valor del día + acumulado MTD, ambos en PPM. */
export interface DqiSerieDiaria {
  /** {fecha: PPM del día} — HL rotos en la calle del día ÷ HL entregado del día. */
  dia: Record<string, number | null>
  /** {fecha: PPM acumulado del mes HASTA esa fecha}. */
  mtd: Record<string, number | null>
}

/** Cache in-process de la serie diaria, por el mismo motivo que el PPM mensual. */
const dqiDiarioCache = new Map<string, { t: number; v: DqiSerieDiaria }>()

/** DQI día por día del mes + su acumulado, en PPM.
 *
 * Sale de `dqi_dia` / `dqi` de la serie diaria de deposito-esteban: HL rotos EN
 * LA CALLE ÷ HL entregado × 1M. Misma fuente y MISMO denominador que el
 * `wqi_dia` de la matinal ⇒ las dos filas son comparables entre sí, y una
 * rotura de distribución que el WQI deja afuera aparece acá el mismo día.
 *
 * 🚨 No coincide con `getDqiPpmMes` (`/api/dqi`) mientras el mes está en curso,
 * y la diferencia no es de redondeo: aquél divide las roturas del mes por el HL
 * entregado del MES ENTERO (dato mensual), esto acumula día a día hasta la
 * fecha. Ago'26 al día 12: 99 PPM acá contra 88,9 allá. Encima leen storages
 * distintos (blob de pérdidas procesado vs acumulado diario de movimientos).
 * La fila de la matinal usa ESTE para las dos cosas —celdas y MTD— porque una
 * fila cuyo acumulado no cierra con sus propios días no se puede discutir en
 * una reunión; la tarjeta mensual de /indicadores/dqi sigue con el otro.
 *
 * Devuelve series vacías si el tablero no responde: las celdas caen a "—" y el
 * MTD se resuelve con el fallback mensual. Nunca tira. */
export async function getDqiDiarioMes(
  year: number,
  month: number,
): Promise<DqiSerieDiaria> {
  await requireAuth()
  const key = `${year}-${month}`
  const hit = dqiDiarioCache.get(key)
  if (hit && Date.now() - hit.t < HL_TTL_MS) return hit.v
  let serie: DqiSerieDiaria = { dia: {}, mtd: {} }
  try {
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (res.ok) {
      const j = (await res.json()) as {
        dqi_dia?: Record<string, number | null>
        dqi?: Record<string, number | null>
      }
      serie = { dia: j?.dqi_dia ?? {}, mtd: j?.dqi ?? {} }
    }
  } catch {
    serie = { dia: {}, mtd: {} }
  }
  dqiDiarioCache.set(key, { t: Date.now(), v: serie })
  return serie
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

// ===== DQI por tipo de SKU (envase › calibre › SKU) =====
// Pedido de la auditoría (punto 1.4): ver QUÉ se rompe para encontrar el motivo.
// Fuente: la serie diaria del tablero de pérdidas, que publica las dos partes
// del DQI corregido con detalle por SKU:
//   - roturas_detalle_dia  (origen "distribucion" = rotura en ruta)
//   - reempaque_detalle_dia (lo que vuelve de ruta con el packaging roto)
// El denominador es el mismo HL entregado del mes que usa getDqi, así que la
// suma de los grupos + "sin detalle" da exacto el DQI corregido publicado.
//
// "Sin detalle": el `dqi_detalle.hl_mes` del tablero (lo que usa el DQI oficial
// para las roturas en ruta) es mayor que la suma de roturas de distribución por
// SKU (oct'26: 1,36 vs 0,44 HL). Esa diferencia se muestra aparte, sin
// asignarla a ningún SKU.

interface SerieDiariaItemRotura {
  sku?: string | number
  descripcion?: string
  origen?: string
  patentes?: string[]
  unidades?: number
  hl?: number
}
interface SerieDiariaItemReempaque {
  sku?: string | number
  descripcion?: string
  bultos?: number
  hl?: number
}

async function fetchSerieDiariaDetalle(
  year: number,
  month: number,
): Promise<{
  roturas: SerieDiariaItemRotura[]
  reempaque: SerieDiariaItemReempaque[]
} | null> {
  try {
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) return null
    const j = (await res.json()) as {
      roturas_detalle_dia?: Record<string, SerieDiariaItemRotura[] | null>
      reempaque_detalle_dia?: Record<string, SerieDiariaItemReempaque[] | null>
    }
    const roturas: SerieDiariaItemRotura[] = []
    for (const arr of Object.values(j.roturas_detalle_dia ?? {})) {
      for (const it of arr ?? []) if (it?.origen === "distribucion") roturas.push(it)
    }
    const reempaque: SerieDiariaItemReempaque[] = []
    for (const arr of Object.values(j.reempaque_detalle_dia ?? {})) {
      for (const it of arr ?? []) if (it) reempaque.push(it)
    }
    return { roturas, reempaque }
  } catch {
    return null
  }
}

async function fetchDqiHlRutaMes(year: number, month: number): Promise<number | null> {
  try {
    const res = await fetch(`${DEPOSITO_API_BASE}/api/dqi?year=${year}&month=${month}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { dqi_detalle?: { hl_mes?: number | null } }
    const v = j?.dqi_detalle?.hl_mes
    return typeof v === "number" ? v : null
  } catch {
    return null
  }
}

const tipoSkuCache = new Map<string, { t: number; v: DqiTipoSkuData }>()

export async function getDqiPorTipoSku(
  year: number,
  month: number,
): Promise<{ data: DqiTipoSkuData } | { error: string }> {
  await requireAuth()
  const key = `${year}-${month}`
  const hit = tipoSkuCache.get(key)
  if (hit && Date.now() - hit.t < HL_TTL_MS) return { data: hit.v }

  try {
    const [detalle, hlRutaOficial, hlEntregados, roturasChofer] = await Promise.all([
      fetchSerieDiariaDetalle(year, month),
      fetchDqiHlRutaMes(year, month),
      getHlEntregados(year, month),
      getRoturasChofer(year, month),
    ])
    if (!detalle) {
      return { error: "El tablero de pérdidas no respondió el detalle por SKU." }
    }

    const ppm = (hl: number) =>
      hlEntregados ? Math.round((hl / hlEntregados) * 1_000_000 * 10) / 10 : null
    const r4 = (n: number) => Math.round(n * 10000) / 10000

    // ── Acumular por SKU ────────────────────────────────────────────────
    type Acc = {
      descripcion: string
      hl_ruta: number
      hl_reempaque: number
      unidades_ruta: number
      bultos_reempaque: number
      patentes: Set<string>
    }
    const porSku = new Map<string, Acc>()
    const acc = (sku: string, desc: string): Acc => {
      let a = porSku.get(sku)
      if (!a) {
        a = {
          descripcion: desc,
          hl_ruta: 0,
          hl_reempaque: 0,
          unidades_ruta: 0,
          bultos_reempaque: 0,
          patentes: new Set(),
        }
        porSku.set(sku, a)
      }
      return a
    }
    for (const it of detalle.roturas) {
      const a = acc(String(it.sku ?? "?"), it.descripcion ?? "")
      a.hl_ruta += Number(it.hl ?? 0)
      a.unidades_ruta += Number(it.unidades ?? 0)
      for (const p of it.patentes ?? []) if (p) a.patentes.add(p)
    }
    for (const it of detalle.reempaque) {
      const a = acc(String(it.sku ?? "?"), it.descripcion ?? "")
      a.hl_reempaque += Number(it.hl ?? 0)
      a.bultos_reempaque += Number(it.bultos ?? 0)
    }

    // ── Familia desde el maestro de Chess ───────────────────────────────
    const ids = [...porSku.keys()].map(Number).filter((n) => Number.isFinite(n))
    const uneg = new Map<string, string | null>()
    if (ids.length > 0) {
      const supabase = await createClient()
      const { data: arts } = await supabase
        .from("chess_articulos")
        .select("id_articulo, uneg")
        .in("id_articulo", ids)
      for (const a of (arts ?? []) as { id_articulo: number; uneg: string | null }[]) {
        uneg.set(String(a.id_articulo), a.uneg)
      }
    }

    // ── Motivos que cargó el chofer en /mis-roturas, por SKU ────────────
    const motivos = new Map<string, Set<string>>()
    if ("data" in roturasChofer) {
      for (const r of roturasChofer.data) {
        const label = ROTURA_MOTIVO_LABELS[r.motivo as RoturaMotivo] ?? String(r.motivo ?? "")
        for (const it of r.items ?? []) {
          if (it.id_articulo == null || !label) continue
          const k = String(it.id_articulo)
          if (!motivos.has(k)) motivos.set(k, new Set())
          motivos.get(k)!.add(label)
        }
      }
    }

    // ── Agrupar envase › calibre › SKU ──────────────────────────────────
    const grupos = new Map<EnvaseSku, Map<string, DqiGrupoCalibre>>()
    for (const [codigo, a] of porSku) {
      const tipo = clasificarSku(a.descripcion, uneg.get(codigo))
      const hlTotal = a.hl_ruta + a.hl_reempaque
      const fila: DqiSkuFila = {
        codigo,
        descripcion: a.descripcion,
        tipo,
        hl_ruta: r4(a.hl_ruta),
        hl_reempaque: r4(a.hl_reempaque),
        hl_total: r4(hlTotal),
        unidades_ruta: a.unidades_ruta,
        bultos_reempaque: a.bultos_reempaque,
        ppm: ppm(hlTotal),
        patentes: [...a.patentes].sort(),
        motivos_chofer: [...(motivos.get(codigo) ?? [])],
      }
      if (!grupos.has(tipo.envase)) grupos.set(tipo.envase, new Map())
      const porCal = grupos.get(tipo.envase)!
      let g = porCal.get(tipo.calibre)
      if (!g) {
        g = {
          calibre: tipo.calibre,
          calibre_cc: tipo.calibre_cc,
          hl_ruta: 0,
          hl_reempaque: 0,
          hl_total: 0,
          ppm: null,
          skus: [],
        }
        porCal.set(tipo.calibre, g)
      }
      g.hl_ruta += a.hl_ruta
      g.hl_reempaque += a.hl_reempaque
      g.hl_total += hlTotal
      g.skus.push(fila)
    }

    const totalRutaSku = [...porSku.values()].reduce((s, a) => s + a.hl_ruta, 0)
    const totalReemp = [...porSku.values()].reduce((s, a) => s + a.hl_reempaque, 0)
    // El DQI oficial toma las roturas en ruta de dqi_detalle.hl_mes; si no vino,
    // se usa la suma por SKU (sin "sin detalle").
    const hlRutaDqi = hlRutaOficial != null ? Math.max(hlRutaOficial, totalRutaSku) : totalRutaSku
    const sinDetalleHl = Math.max(0, hlRutaDqi - totalRutaSku)
    const totalHl = hlRutaDqi + totalReemp
    const ppmTotal = hlEntregados ? Math.round((totalHl / hlEntregados) * 1_000_000) : null

    const envases: DqiGrupoEnvase[] = [...grupos.entries()]
      .map(([envase, porCal]) => {
        const calibres = [...porCal.values()]
          .map((g) => ({
            ...g,
            hl_ruta: r4(g.hl_ruta),
            hl_reempaque: r4(g.hl_reempaque),
            hl_total: r4(g.hl_total),
            ppm: ppm(g.hl_total),
            skus: g.skus.sort((x, y) => y.hl_total - x.hl_total),
          }))
          .sort((x, y) => y.hl_total - x.hl_total)
        const hlR = calibres.reduce((s, c) => s + c.hl_ruta, 0)
        const hlE = calibres.reduce((s, c) => s + c.hl_reempaque, 0)
        const hlT = hlR + hlE
        return {
          envase,
          hl_ruta: r4(hlR),
          hl_reempaque: r4(hlE),
          hl_total: r4(hlT),
          ppm: ppm(hlT),
          pct_dqi: totalHl > 0 ? Math.round((hlT / totalHl) * 1000) / 10 : null,
          calibres,
        }
      })
      .sort((x, y) => y.hl_total - x.hl_total)

    const data: DqiTipoSkuData = {
      year,
      month,
      hl_entregados: hlEntregados,
      envases,
      sin_detalle: { hl: r4(sinDetalleHl), ppm: ppm(sinDetalleHl) },
      total: {
        hl_ruta: r4(hlRutaDqi),
        hl_reempaque: r4(totalReemp),
        hl_total: r4(totalHl),
        ppm: ppmTotal,
      },
    }
    tipoSkuCache.set(key, { t: Date.now(), v: data })
    return { data }
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `No se pudo armar la apertura por SKU: ${e.message}`
          : "Error armando la apertura por SKU.",
    }
  }
}
