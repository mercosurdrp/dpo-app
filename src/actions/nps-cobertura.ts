"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

/** Un mes de la comparación enviadas vs respondidas. */
export interface NpsCoberturaMes {
  mes: number // 1-12
  enviadas: number
  respondidas: number
  tasa_respuesta: number | null
  /** Mes en curso: el Power BI todavía no cargó las enviadas ⇒ no promediar. */
  parcial: boolean
}

export interface NpsCoberturaPromotor {
  promotor: string
  clientes: number
  enviadas: number
  respondidas: number
  tasa_respuesta: number | null
  queja_abierta: number
  promotor_apagado: number
  nunca_respondio: number
  /** HL del año de los clientes de ese promotor que no están respondiendo. */
  hl_sin_voz: number
}

export type NpsSegmento =
  | "queja_abierta"
  | "promotor_apagado"
  | "nunca_respondio"
  | "un_solo_envio"
  | "respondiendo"

export interface NpsCoberturaCliente {
  cod_cliente: number
  nombre_cliente: string | null
  promotor: string | null
  localidad: string | null
  enviadas: number
  respondidas: number
  /** Encuestas que le llegaron después de su última respuesta. */
  envios_ignorados: number
  ultima_respuesta: string | null
  ultima_categoria: "Promoter" | "Passive" | "Detractor" | null
  ultimo_score: number | null
  ultimo_comentario: string | null
  hl_anio: number
  segmento: NpsSegmento
  prioridad: number
}

export interface NpsCoberturaData {
  anio: number
  meses: NpsCoberturaMes[]
  promotores: NpsCoberturaPromotor[]
  /** Solo los accionables (excluye a los que sí están respondiendo). */
  clientes: NpsCoberturaCliente[]
  resumen: {
    /** Totales de meses cerrados: el mes en curso viene incompleto. */
    enviadas: number
    respondidas: number
    tasa_respuesta: number | null
    clientes_alcanzados: number
    clientes_sin_voz: number
    /** HL del año que compran los clientes que no están respondiendo. */
    hl_sin_voz: number
  }
}

const ANIO = 2026

export async function getNpsCobertura(): Promise<Result<NpsCoberturaData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [mesRes, promRes] = await Promise.all([
      supabase
        .from("v_nps_cobertura_mensual")
        .select("mes, enviadas, respondidas, tasa_respuesta, parcial")
        .eq("anio", ANIO)
        .order("mes"),
      supabase
        .from("v_nps_cobertura_promotor")
        .select(
          "promotor, clientes, enviadas, respondidas, tasa_respuesta, queja_abierta, promotor_apagado, nunca_respondio, hl_sin_voz",
        )
        .eq("anio", ANIO),
    ])

    if (mesRes.error) return { error: mesRes.error.message }
    if (promRes.error) return { error: promRes.error.message }

    // La tabla de clientes puede superar el tope de filas de PostgREST, así que
    // se pagina explícitamente en vez de confiar en un .limit() alto.
    const clientes: NpsCoberturaCliente[] = []
    const PAGINA = 1000
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from("v_nps_cobertura_cliente")
        .select(
          "cod_cliente, nombre_cliente, promotor, localidad, enviadas, respondidas, envios_ignorados, ultima_respuesta, ultima_categoria, ultimo_score, ultimo_comentario, hl_anio, segmento, prioridad",
        )
        .eq("anio", ANIO)
        .neq("segmento", "respondiendo")
        .order("prioridad")
        .order("hl_anio", { ascending: false })
        .range(desde, desde + PAGINA - 1)
      if (error) return { error: error.message }
      const lote = (data ?? []) as unknown as Array<
        Record<string, unknown>
      >
      clientes.push(
        ...lote.map((c) => ({
          cod_cliente: Number(c.cod_cliente),
          nombre_cliente: (c.nombre_cliente as string) ?? null,
          promotor: (c.promotor as string) ?? null,
          localidad: (c.localidad as string) ?? null,
          enviadas: Number(c.enviadas ?? 0),
          respondidas: Number(c.respondidas ?? 0),
          envios_ignorados: Number(c.envios_ignorados ?? 0),
          ultima_respuesta: (c.ultima_respuesta as string) ?? null,
          ultima_categoria:
            (c.ultima_categoria as NpsCoberturaCliente["ultima_categoria"]) ??
            null,
          ultimo_score: c.ultimo_score == null ? null : Number(c.ultimo_score),
          ultimo_comentario: (c.ultimo_comentario as string) ?? null,
          hl_anio: Number(c.hl_anio ?? 0),
          segmento: c.segmento as NpsSegmento,
          prioridad: Number(c.prioridad ?? 9),
        })),
      )
      if (lote.length < PAGINA) break
    }

    const meses: NpsCoberturaMes[] = (
      (mesRes.data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((m) => ({
      mes: Number(m.mes),
      enviadas: Number(m.enviadas ?? 0),
      respondidas: Number(m.respondidas ?? 0),
      tasa_respuesta:
        m.tasa_respuesta == null ? null : Number(m.tasa_respuesta),
      parcial: Boolean(m.parcial),
    }))

    const promotores: NpsCoberturaPromotor[] = (
      (promRes.data ?? []) as unknown as Array<Record<string, unknown>>
    )
      .map((p) => ({
        promotor: String(p.promotor),
        clientes: Number(p.clientes ?? 0),
        enviadas: Number(p.enviadas ?? 0),
        respondidas: Number(p.respondidas ?? 0),
        tasa_respuesta:
          p.tasa_respuesta == null ? null : Number(p.tasa_respuesta),
        queja_abierta: Number(p.queja_abierta ?? 0),
        promotor_apagado: Number(p.promotor_apagado ?? 0),
        nunca_respondio: Number(p.nunca_respondio ?? 0),
        hl_sin_voz: Number(p.hl_sin_voz ?? 0),
      }))
      .sort((a, b) => (a.tasa_respuesta ?? 0) - (b.tasa_respuesta ?? 0))

    // El mes en curso no entra en los totales: sus enviadas todavía no cargaron.
    const cerrados = meses.filter((m) => !m.parcial)
    const enviadas = cerrados.reduce((s, m) => s + m.enviadas, 0)
    const respondidas = cerrados.reduce((s, m) => s + m.respondidas, 0)
    const sinVoz = clientes.filter((c) => c.segmento !== "un_solo_envio")

    return {
      data: {
        anio: ANIO,
        meses,
        promotores,
        clientes,
        resumen: {
          enviadas,
          respondidas,
          tasa_respuesta: enviadas
            ? Math.round((respondidas / enviadas) * 1000) / 10
            : null,
          clientes_alcanzados: promotores.reduce((s, p) => s + p.clientes, 0),
          clientes_sin_voz: sinVoz.length,
          hl_sin_voz:
            Math.round(sinVoz.reduce((s, c) => s + c.hl_anio, 0) * 10) / 10,
        },
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando la cobertura de encuestas",
    }
  }
}
