"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Estado de cada punto del pilar Flota: lo que dijo la última auditoría y lo
 * que hay hoy.
 *
 * 🚨 Esto NO reemplaza ni reescribe la auditoría. Las respuestas con puntaje
 * son el resultado de una auditoría **cerrada** —"Auditoría DPO 2.1 — H1 2026",
 * del 30/06 al 04/07/2026, cargada por el auditor— y pisarlas sería falsear el
 * registro y, peor, perder la única forma de mostrar la mejora entre un ciclo y
 * el siguiente, que es lo que el DPO premia. Acá el puntaje se LEE y se muestra
 * con su fecha, para poder decir "esto era un 0 en julio, mirá lo que hay hoy".
 *
 * Cuando corresponda puntuar de nuevo, se abre una auditoría nueva desde el
 * módulo de Auditorías y la vieja queda intacta.
 */
export interface PuntoEstadoDpo {
  numero: string
  titulo: string
  bloque: string
  mandatorio: boolean
  /** Requisitos del punto, uno por línea, como los pide el manual. */
  requisitos: string[]
  /** Cómo lo verifica el auditor. */
  comoVerificar: string | null
  /** Puntaje de la última auditoría. null = no se evaluó. */
  puntaje: number | null
  /** Lo que escribió el auditor en esa visita. */
  comentario: string | null
  /** Qué significa cada puntaje para este punto. */
  criterio: Record<string, string>
}

export interface EstadoDpoFlota {
  /** La auditoría de la que salen los puntajes. */
  auditoria: { nombre: string; fechaInicio: string | null; estado: string } | null
  puntos: PuntoEstadoDpo[]
}

/** "R2.3.1 - texto…" por línea → lista limpia. */
function partirRequisitos(texto: string | null): string[] {
  if (!texto) return []
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^R\d/.test(l))
}

export async function getEstadoDpoFlota(): Promise<
  { data: EstadoDpoFlota } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: pilar } = await supabase
      .from("pilares")
      .select("id")
      .ilike("nombre", "flota")
      .maybeSingle()
    if (!pilar?.id) return { data: { auditoria: null, puntos: [] } }

    const { data: bloques, error: bErr } = await supabase
      .from("bloques")
      .select("id, nombre")
      .eq("pilar_id", pilar.id)
    if (bErr) return { error: bErr.message }
    const bloqueIds = (bloques ?? []).map((b) => b.id as string)
    if (bloqueIds.length === 0) return { data: { auditoria: null, puntos: [] } }
    const nombreBloque = new Map((bloques ?? []).map((b) => [b.id as string, b.nombre as string]))

    const [pregRes, audRes] = await Promise.all([
      supabase
        .from("preguntas")
        .select("id, numero, texto, mandatorio, bloque_id, requerimiento, como_verificar, puntaje_criterio")
        .in("bloque_id", bloqueIds),
      // La más reciente: es de la que salen los puntajes que se muestran.
      supabase
        .from("auditorias")
        .select("id, nombre, fecha_inicio, estado")
        .order("fecha_inicio", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (pregRes.error) return { error: pregRes.error.message }

    type PregRow = {
      id: string
      numero: string
      texto: string
      mandatorio: boolean
      bloque_id: string
      requerimiento: string | null
      como_verificar: string | null
      puntaje_criterio: Record<string, string> | null
    }
    const preguntas = (pregRes.data || []) as unknown as PregRow[]

    const auditoria = audRes.data as
      | { id: string; nombre: string; fecha_inicio: string | null; estado: string }
      | null

    const respuestas = new Map<string, { puntaje: number | null; comentario: string | null }>()
    if (auditoria?.id && preguntas.length > 0) {
      const { data: resp } = await supabase
        .from("respuestas")
        .select("pregunta_id, puntaje, comentario")
        .eq("auditoria_id", auditoria.id)
        .in("pregunta_id", preguntas.map((p) => p.id))
      for (const r of (resp || []) as unknown as Array<{
        pregunta_id: string
        puntaje: number | null
        comentario: string | null
      }>) {
        respuestas.set(r.pregunta_id, { puntaje: r.puntaje, comentario: r.comentario })
      }
    }

    const puntos: PuntoEstadoDpo[] = preguntas
      .map((p) => {
        const r = respuestas.get(p.id)
        return {
          numero: p.numero,
          titulo: p.texto,
          bloque: nombreBloque.get(p.bloque_id) ?? "",
          mandatorio: p.mandatorio,
          requisitos: partirRequisitos(p.requerimiento),
          comoVerificar: p.como_verificar,
          puntaje: r?.puntaje ?? null,
          comentario: r?.comentario ?? null,
          criterio: p.puntaje_criterio ?? {},
        }
      })
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))

    return {
      data: {
        auditoria: auditoria
          ? {
              nombre: auditoria.nombre,
              fechaInicio: auditoria.fecha_inicio,
              estado: auditoria.estado,
            }
          : null,
        puntos,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
