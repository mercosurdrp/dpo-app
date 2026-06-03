"use server"

import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
import { cumpleRecepcion } from "@/lib/sla-cumplimiento"

export interface RecepcionFinalizada {
  id: string
  fecha: string
  patente: string
  transportista: string | null
  origen: string | null
  remito: string | null
  pallets: number | null
  hora_arribo: string
  hora_inicio_descarga: string | null
  hora_fin_descarga: string | null
  estadiaMin: number | null
  cumpleSla: boolean | null // null = arribo fuera de 08–16
}

type Result<T> = { data: T } | { error: string }

/**
 * Recepciones FINALIZADAS en el rango [desde, hasta] (inclusive), leídas desde
 * la Supabase de acarreo-rdf. Solo lectura. Calcula estadía y cumplimiento del
 * SLA #7 con la misma regla que la matriz de Cumplimientos.
 */
export async function getRecepcionesAcarreo(
  desde: string,
  hasta: string,
): Promise<Result<RecepcionFinalizada[]>> {
  try {
    await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) {
      return { error: "La recepción de acarreos solo está disponible en Pampeana." }
    }
    const acarreo = createAcarreoClient()
    if (!acarreo) {
      return { error: "La integración con acarreo-rdf no está configurada." }
    }

    const { data, error } = await acarreo
      .from("recepcion_acarreos")
      .select(
        "id, fecha, patente, transportista, origen, remito, pallets, hora_arribo, hora_inicio_descarga, hora_fin_descarga",
      )
      .eq("estado", "finalizado")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("hora_arribo", { ascending: false })

    if (error) {
      return { error: "No se pudo leer la recepción de acarreos: " + error.message }
    }

    const rows: RecepcionFinalizada[] = (data ?? []).map((r: any) => {
      const estadiaMin = r.hora_fin_descarga
        ? Math.round(
            (new Date(r.hora_fin_descarga).getTime() - new Date(r.hora_arribo).getTime()) / 60000,
          )
        : null
      return {
        id: r.id,
        fecha: r.fecha,
        patente: r.patente,
        transportista: r.transportista,
        origen: r.origen,
        remito: r.remito,
        pallets: r.pallets,
        hora_arribo: r.hora_arribo,
        hora_inicio_descarga: r.hora_inicio_descarga,
        hora_fin_descarga: r.hora_fin_descarga,
        estadiaMin,
        cumpleSla: cumpleRecepcion(r.hora_arribo, r.hora_fin_descarga),
      }
    })

    return { data: rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando recepciones" }
  }
}
