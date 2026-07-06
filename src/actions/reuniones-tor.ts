"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  ReunionTor,
  TipoReunion,
  TorContenido,
  TorFrecuencia,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

const TIPOS_VALIDOS: TipoReunion[] = [
  "logistica",
  "logistica-ventas",
  "matinal-distribucion",
  "warehouse",
  "presupuesto",
]

const FRECUENCIAS_VALIDAS: TorFrecuencia[] = ["diaria", "semanal", "mensual"]

async function requireEditor() {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar la TOR")
  }
  return profile
}

function limpiarLista(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0)
}

function limpiarContenido(raw: TorContenido): TorContenido {
  return {
    nombre: String(raw.nombre ?? "").trim(),
    objetivos: String(raw.objetivos ?? "").trim(),
    dueno: limpiarLista(raw.dueno),
    participantes: limpiarLista(raw.participantes),
    ubicacion: limpiarLista(raw.ubicacion),
    duracion: String(raw.duracion ?? "").trim(),
    frecuencia_texto: String(raw.frecuencia_texto ?? "").trim(),
    reglas: limpiarLista(raw.reglas),
    entradas: limpiarLista(raw.entradas),
    salidas: limpiarLista(raw.salidas),
    kpis: limpiarLista(raw.kpis),
    temario: (Array.isArray(raw.temario) ? raw.temario : [])
      .map((t) => ({
        tema: String(t?.tema ?? "").trim(),
        quien: String(t?.quien ?? "").trim(),
      }))
      .filter((t) => t.tema.length > 0),
  }
}

/**
 * Devuelve la TOR de un tipo de reunión para una frecuencia dada.
 * data = null si todavía no hay TOR cargada para esa combinación.
 */
export async function getTorReunion(
  tipo: TipoReunion,
  frecuencia: TorFrecuencia,
): Promise<Result<ReunionTor | null>> {
  try {
    await requireAuth()
    if (!TIPOS_VALIDOS.includes(tipo)) return { error: "Tipo inválido" }
    if (!FRECUENCIAS_VALIDAS.includes(frecuencia)) {
      return { error: "Frecuencia inválida" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reuniones_tor_docs")
      .select("id, tipo, frecuencia, contenido, updated_at")
      .eq("tipo", tipo)
      .eq("frecuencia", frecuencia)
      .maybeSingle()

    if (error) return { error: error.message }
    return { data: (data as ReunionTor | null) ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al cargar la TOR" }
  }
}

/**
 * Crea o actualiza la TOR de (tipo, frecuencia). Solo roles editores.
 */
export async function guardarTorReunion(
  tipo: TipoReunion,
  frecuencia: TorFrecuencia,
  contenido: TorContenido,
): Promise<Result<ReunionTor>> {
  try {
    const profile = await requireEditor()
    if (!TIPOS_VALIDOS.includes(tipo)) return { error: "Tipo inválido" }
    if (!FRECUENCIAS_VALIDAS.includes(frecuencia)) {
      return { error: "Frecuencia inválida" }
    }

    const limpio = limpiarContenido(contenido)
    if (!limpio.nombre) {
      return { error: "El nombre de la reunión es obligatorio" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reuniones_tor_docs")
      .upsert(
        {
          tipo,
          frecuencia,
          contenido: limpio,
          updated_by: profile.id,
        },
        { onConflict: "tipo,frecuencia" },
      )
      .select("id, tipo, frecuencia, contenido, updated_at")
      .single()

    if (error) return { error: error.message }
    return { data: data as ReunionTor }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Error al guardar la TOR",
    }
  }
}
