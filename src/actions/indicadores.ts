"use server"

import { createClient } from "@/lib/supabase/server"
import type { Pilar, Indicador } from "@/types/database"

// ---------- Types ----------

export interface PilarConIndicadoresCount extends Pilar {
  indicadores_count: number
  preguntas_count: number
}

export interface IndicadorConPregunta extends Indicador {
  pregunta_numero: string
  pregunta_texto: string
  bloque_nombre: string
}

export interface BloqueIndicadores {
  bloque_id: string
  bloque_nombre: string
  preguntas: {
    pregunta_id: string
    pregunta_numero: string
    pregunta_texto: string
    indicadores: Indicador[]
  }[]
}

// ---------- getPilaresConIndicadores ----------

export async function getPilaresConIndicadores(): Promise<
  { data: PilarConIndicadoresCount[] } | { error: string }
> {
  try {
    const supabase = await createClient()

    // Get all pilares
    const { data: pilares, error: pilaresErr } = await supabase
      .from("pilares")
      .select("*")
      .order("orden")

    if (pilaresErr) return { error: pilaresErr.message }

    const pilaresArr = (pilares ?? []) as Pilar[]
    const result: PilarConIndicadoresCount[] = []

    for (const pilar of pilaresArr) {
      // Get bloques for this pilar
      const { data: bloques } = await supabase
        .from("bloques")
        .select("id")
        .eq("pilar_id", pilar.id)

      const bloqueIds = (bloques ?? []).map((b) => b.id)

      let indicadores_count = 0
      let preguntas_count = 0

      if (bloqueIds.length > 0) {
        // Get preguntas count
        const { data: preguntas } = await supabase
          .from("preguntas")
          .select("id")
          .in("bloque_id", bloqueIds)

        const preguntaIds = (preguntas ?? []).map((p) => p.id)
        preguntas_count = preguntaIds.length

        if (preguntaIds.length > 0) {
          // Get indicadores count
          const { data: indicadores } = await supabase
            .from("indicadores")
            .select("id")
            .in("pregunta_id", preguntaIds)

          indicadores_count = (indicadores ?? []).length
        }
      }

      result.push({
        ...pilar,
        indicadores_count,
        preguntas_count,
      })
    }

    return { data: result }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error loading pilares",
    }
  }
}

// ---------- getIndicadoresPorPilar ----------

export async function getIndicadoresPorPilar(
  pilarId: string
): Promise<{ data: { pilar: Pilar; bloques: BloqueIndicadores[] } } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get pilar
    const { data: pilar, error: pilarErr } = await supabase
      .from("pilares")
      .select("*")
      .eq("id", pilarId)
      .single()

    if (pilarErr || !pilar) {
      return { error: pilarErr?.message ?? "Pilar no encontrado" }
    }

    // Get bloques
    const { data: bloques, error: bloquesErr } = await supabase
      .from("bloques")
      .select("*")
      .eq("pilar_id", pilarId)
      .order("orden")

    if (bloquesErr) return { error: bloquesErr.message }

    const bloquesArr = bloques ?? []
    const bloqueIds = bloquesArr.map((b) => b.id)

    if (bloqueIds.length === 0) {
      return { data: { pilar: pilar as Pilar, bloques: [] } }
    }

    // Get preguntas for all bloques
    const { data: preguntas } = await supabase
      .from("preguntas")
      .select("id, bloque_id, numero, texto")
      .in("bloque_id", bloqueIds)
      .order("numero")

    const preguntasArr = preguntas ?? []
    const preguntaIds = preguntasArr.map((p) => p.id)

    // Get all indicadores for these preguntas
    let indicadoresMap = new Map<string, Indicador[]>()

    if (preguntaIds.length > 0) {
      const { data: indicadores } = await supabase
        .from("indicadores")
        .select("*")
        .in("pregunta_id", preguntaIds)
        .order("created_at")

      for (const ind of (indicadores ?? []) as Indicador[]) {
        const list = indicadoresMap.get(ind.pregunta_id) ?? []
        list.push(ind)
        indicadoresMap.set(ind.pregunta_id, list)
      }
    }

    // Group preguntas by bloque
    const preguntasByBloque = new Map<string, typeof preguntasArr>()
    for (const p of preguntasArr) {
      const list = preguntasByBloque.get(p.bloque_id) ?? []
      list.push(p)
      preguntasByBloque.set(p.bloque_id, list)
    }

    // Build result
    const result: BloqueIndicadores[] = bloquesArr.map((b) => {
      const preguntasDelBloque = preguntasByBloque.get(b.id) ?? []
      return {
        bloque_id: b.id,
        bloque_nombre: b.nombre,
        preguntas: preguntasDelBloque.map((p) => ({
          pregunta_id: p.id,
          pregunta_numero: p.numero,
          pregunta_texto: p.texto,
          indicadores: indicadoresMap.get(p.id) ?? [],
        })),
      }
    })

    return { data: { pilar: pilar as Pilar, bloques: result } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error loading indicadores",
    }
  }
}
