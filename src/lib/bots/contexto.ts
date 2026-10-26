// Lo que "ve" el bot de un pilar: los indicadores de su reunión, calculados
// por la MISMA action que usa la grilla (`getIndicadoresMes`) corriendo en
// contexto de sistema. El bot nunca calcula números: recibe estos y los lee.

import { createAdminClient } from "@/lib/supabase/admin"
import { runAsSystem } from "@/lib/system-context"
import { getIndicadoresMes } from "@/actions/reuniones"
import { hoyArgentina } from "@/lib/warehouse/auto-indicadores"
import { esFeriado } from "@/lib/feriados-ar"
import {
  estadoIndicador,
  SEMAFORO_MENSUAL,
  type EstadoSemaforo,
} from "@/lib/reuniones/semaforo"
import type { ReunionIndicadoresMes } from "@/types/database"
import type { BotPilar } from "./tipos"

const DIAS_SERIE = 7

export interface PuntoSerie {
  fecha: string
  valor: number | null
  texto: string | null
  estado: EstadoSemaforo
}

export interface IndicadorContexto {
  id: string
  nombre: string
  unidad: string | null
  meta: number | null
  gatillo: number | null
  mejor_si: "menor" | "mayor" | null
  /** Último día cerrado con dato. */
  ultimo: PuntoSerie | null
  /** Últimos días cerrados con dato, del más viejo al más nuevo. */
  serie: PuntoSerie[]
  mtd: number | null
  mtd_texto: string | null
  estado_mtd: EstadoSemaforo
  /** Días seguidos (hasta el último) fuera de meta (rojo o amarillo). */
  racha_fuera: number
  /** La racha cubre toda la serie: puede venir de antes. */
  racha_toda_la_serie: boolean
  /** Para los de umbral mensual el estado relevante es el del MTD. */
  umbral_mensual: boolean
}

export interface ContextoPilar {
  bot: string
  pilar: string
  hoy: string
  reunion_tipo: string
  indicadores: IndicadorContexto[]
}

type Indicador = ReunionIndicadoresMes["indicadores"][number]

async function reunionHasta(tipo: string, hasta: string, estricto: boolean) {
  const supabase = createAdminClient()
  let q = supabase.from("reuniones").select("id, fecha").eq("tipo", tipo)
  q = estricto ? q.lt("fecha", hasta) : q.lte("fecha", hasta)
  const { data, error } = await q.order("fecha", { ascending: false }).limit(1)
  if (error) throw new Error(`reuniones: ${error.message}`)
  return (data?.[0] as { id: string; fecha: string } | undefined) ?? null
}

async function indicadoresDe(reunionId: string): Promise<ReunionIndicadoresMes> {
  const res = await runAsSystem("bot-pilar", () => getIndicadoresMes(reunionId))
  if (!("data" in res)) throw new Error(`getIndicadoresMes: ${res.error}`)
  return res.data
}

function coincide(ind: Indicador, filtro: string[]): boolean {
  if (filtro.length === 0) return true
  const nombre = ind.nombre.trim().toLowerCase()
  return filtro.some((f) => f === ind.id || f.trim().toLowerCase() === nombre)
}

export async function armarContexto(bot: BotPilar, hoy = hoyArgentina()): Promise<ContextoPilar> {
  const reunion = await reunionHasta(bot.reunion_tipo, hoy, false)
  if (!reunion) throw new Error(`No hay reuniones de tipo ${bot.reunion_tipo}`)
  const actual = await indicadoresDe(reunion.id)

  // A principio de mes la grilla trae pocos días: se completa la serie con
  // la última reunión del mes anterior.
  const primeroDelMes = `${actual.anio}-${String(actual.mes).padStart(2, "0")}-01`
  const diasCerradosMes = actual.fechas.filter((f) => f < hoy).length
  let anterior: ReunionIndicadoresMes | null = null
  if (diasCerradosMes < DIAS_SERIE) {
    const reuAnt = await reunionHasta(bot.reunion_tipo, primeroDelMes, true)
    if (reuAnt) anterior = await indicadoresDe(reuAnt.id).catch(() => null)
  }

  // Días operativos: sin domingos ni feriados, y si la reunión trae la
  // cantidad de camiones, sin los días en que no salió ninguno. Un domingo
  // con 0 bultos no es un rojo, es que no se trabajó.
  const camiones = actual.indicadores.find((i) => i.id === "auto_camiones_calle")
  const camionesPrev = anterior?.indicadores.find((i) => i.id === "auto_camiones_calle")
  const celdasCamiones = { ...(camionesPrev?.valores ?? {}), ...(camiones?.valores ?? {}) }
  const operativo = (f: string) => {
    if (new Date(f + "T12:00:00").getDay() === 0 || esFeriado(f)) return false
    if (!camiones) return true
    const v = celdasCamiones[f]?.valor
    return v == null || v > 0
  }

  const indicadores: IndicadorContexto[] = []
  for (const ind of actual.indicadores) {
    if (!coincide(ind, bot.indicadores)) continue
    const prev = anterior?.indicadores.find((p) => p.id === ind.id)
    const celdas = { ...(prev?.valores ?? {}), ...ind.valores }
    const serie: PuntoSerie[] = Object.keys(celdas)
      .filter((f) => f < hoy && operativo(f))
      .sort()
      .map((f) => {
        const c = celdas[f]
        const valor = c?.valor ?? null
        return { fecha: f, valor, texto: c?.texto ?? null, estado: estadoIndicador(ind, valor) }
      })
      .filter((p) => p.valor != null || p.texto != null)
      .slice(-DIAS_SERIE)

    let racha = 0
    for (let i = serie.length - 1; i >= 0; i--) {
      if (serie[i].estado === "rojo" || serie[i].estado === "amarillo") racha++
      else break
    }

    indicadores.push({
      id: ind.id,
      nombre: ind.nombre,
      unidad: ind.unidad,
      meta: ind.meta,
      gatillo: ind.gatillo ?? null,
      mejor_si: ind.mejor_si ?? null,
      ultimo: serie.at(-1) ?? null,
      serie,
      mtd: ind.mtd,
      mtd_texto: ind.mtd_texto ?? null,
      estado_mtd: estadoIndicador(ind, ind.mtd),
      racha_fuera: racha,
      racha_toda_la_serie: racha > 0 && racha === serie.length,
      umbral_mensual: SEMAFORO_MENSUAL.has(ind.id),
    })
  }

  return {
    bot: bot.key,
    pilar: bot.nombre,
    hoy,
    reunion_tipo: bot.reunion_tipo,
    indicadores,
  }
}
