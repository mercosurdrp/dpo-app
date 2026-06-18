"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  BpIdea,
  BpAvance,
  BpAccion,
  BpAccionEstado,
  BpEstado,
  BpStats,
  BpDashboard,
  BpCumplimiento,
  BpRequisito,
} from "@/types/buenas-practicas"
import { PREGUNTA_44_ID } from "@/types/buenas-practicas"

type Result<T> = { data: T } | { error: string }

const EDITORES = ["admin", "supervisor", "admin_rrhh"]

function esEditor(role: string): boolean {
  return EDITORES.includes(role)
}

const ESTADOS: BpEstado[] = [
  "nueva",
  "en_revision",
  "aprobada",
  "rechazada",
  "implementada",
  "replicada",
]

function dentroDe12Meses(iso: string): boolean {
  const t = new Date(iso).getTime()
  const limite = Date.now() - 365 * 24 * 60 * 60 * 1000
  return t >= limite
}

// -------- Cumplimiento del punto 4.4 (R4.4.1 .. R4.4.6) --------
function calcularCumplimiento(ideas: BpIdea[]): BpCumplimiento {
  const ultimos12m = ideas.filter((i) => dentroDe12Meses(i.created_at))

  const r1 = ultimos12m.length >= 1
  const r2 = ultimos12m.some((i) => i.origen === "portal")
  const r3 = ideas.some(
    (i) => i.reconocido || (i.comentario_revision ?? "").trim() !== "",
  )
  const r4 = ideas.some((i) => i.replicable || i.estado === "replicada")
  const r5 = ideas.some(
    (i) => i.kpi_nombre != null && i.kpi_nombre.trim() !== "" && i.kpi_logrado != null,
  )

  const requisitos: BpRequisito[] = [
    {
      codigo: "R4.4.1",
      texto:
        "Programa definido para incentivar ideas de mejora (almacén/entrega/flota: seguridad, calidad, productividad, capacidad).",
      cumple: r1,
      detalle: r1
        ? `${ultimos12m.length} buena(s) práctica(s) cargada(s) en los últimos 12 meses.`
        : "No hay buenas prácticas cargadas en los últimos 12 meses.",
    },
    {
      codigo: "R4.4.2",
      texto:
        "Empleados de todos los niveles usan la plataforma para enviar ideas.",
      cumple: r2,
      detalle: r2
        ? `${ultimos12m.filter((i) => i.origen === "portal").length} idea(s) enviada(s) por empleados desde el Portal.`
        : "Ningún empleado envió ideas desde el Portal en los últimos 12 meses.",
    },
    {
      codigo: "R4.4.3",
      texto: "Reconocimiento/feedback al empleado y seguimiento de la implementación.",
      cumple: r3,
      detalle: r3
        ? `${ideas.filter((i) => i.reconocido).length} idea(s) con reconocimiento y feedback registrado.`
        : "Falta registrar reconocimiento/feedback a los proponentes.",
    },
    {
      codigo: "R4.4.4",
      texto: "Buenas prácticas aprobadas se analizan para replicar/implementar.",
      cumple: r4,
      detalle: r4
        ? `${ideas.filter((i) => i.replicable || i.estado === "replicada").length} idea(s) marcada(s) como replicable(s).`
        : "Ninguna idea fue analizada para replicación.",
    },
    {
      codigo: "R4.4.5",
      texto: "Mejora medible en un KPI/PI por la idea implementada.",
      cumple: r5,
      detalle: r5
        ? `${ideas.filter((i) => i.kpi_nombre && i.kpi_logrado != null).length} idea(s) con impacto medido en un KPI.`
        : "Falta cargar el impacto en el KPI (valor logrado) de alguna idea implementada.",
    },
  ]

  let nivelEstimado: 0 | 1 | 3 | 5 = 0
  if (r1 && r2 && r3 && r4 && r5) nivelEstimado = 3
  else if (r1 && r2 && r3) nivelEstimado = 1
  else nivelEstimado = 0

  const nivelTexto =
    nivelEstimado === 3
      ? "Nivel 3 — Se cumplen R4.4.1, R4.4.2 y R4.4.3 más R4.4.4 y R4.4.5."
      : nivelEstimado === 1
        ? "Nivel 1 — Se cumplen R4.4.1, R4.4.2 y R4.4.3."
        : "Nivel 0 — No se cumple el mínimo (R4.4.1 + R4.4.2 + R4.4.3)."

  return { requisitos, nivelEstimado, nivelTexto }
}

function calcularStats(ideas: BpIdea[]): BpStats {
  const porEstado = ESTADOS.reduce(
    (acc, e) => {
      acc[e] = 0
      return acc
    },
    {} as Record<BpEstado, number>,
  )
  for (const i of ideas) porEstado[i.estado] = (porEstado[i.estado] ?? 0) + 1

  return {
    total: ideas.length,
    porEstado,
    desdePortal: ideas.filter((i) => i.origen === "portal").length,
    implementadas: ideas.filter(
      (i) => i.estado === "implementada" || i.estado === "replicada",
    ).length,
    conImpacto: ideas.filter((i) => i.kpi_nombre && i.kpi_logrado != null).length,
    replicables: ideas.filter((i) => i.replicable || i.estado === "replicada").length,
    elevadas: ideas.filter((i) => i.elevada_zona).length,
    ultimos12m: ideas.filter((i) => dentroDe12Meses(i.created_at)).length,
  }
}

export async function getBuenasPracticasDashboard(): Promise<Result<BpDashboard>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("bp_ideas")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    const ideas = (data ?? []) as BpIdea[]
    return {
      data: {
        ideas,
        stats: calcularStats(ideas),
        cumplimiento: calcularCumplimiento(ideas),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getIdeaDetalle(
  id: string,
): Promise<Result<{ idea: BpIdea; avances: BpAvance[]; acciones: BpAccion[] }>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [ideaRes, avRes, accRes] = await Promise.all([
      supabase.from("bp_ideas").select("*").eq("id", id).single(),
      supabase
        .from("bp_avances")
        .select("*")
        .eq("idea_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("bp_acciones")
        .select("*")
        .eq("idea_id", id)
        .order("orden", { ascending: true })
        .order("created_at", { ascending: true }),
    ])

    if (ideaRes.error) return { error: ideaRes.error.message }
    return {
      data: {
        idea: ideaRes.data as BpIdea,
        avances: (avRes.data ?? []) as BpAvance[],
        acciones: (accRes.data ?? []) as BpAccion[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// -------- Plan de implementación: qué hacer + ejecución (R4.4.3) --------
interface NuevaAccionInput {
  que_hacer: string
  responsable?: string
  fecha_limite?: string | null
}

export async function agregarAccion(
  ideaId: string,
  input: NuevaAccionInput,
): Promise<Result<BpAccion>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    if (!input.que_hacer?.trim()) return { error: "Indicá qué hacer" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("bp_acciones")
      .insert({
        idea_id: ideaId,
        que_hacer: input.que_hacer.trim(),
        responsable: input.responsable?.trim() || null,
        fecha_limite: input.fecha_limite || null,
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }
    revalidatePath("/buenas-practicas")
    return { data: data as BpAccion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface ActualizarAccionInput {
  que_hacer?: string
  responsable?: string | null
  fecha_limite?: string | null
  estado?: BpAccionEstado
}

export async function actualizarAccion(
  id: string,
  input: ActualizarAccionInput,
): Promise<Result<BpAccion>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.que_hacer !== undefined) update.que_hacer = input.que_hacer.trim()
    if (input.responsable !== undefined)
      update.responsable = input.responsable?.trim() || null
    if (input.fecha_limite !== undefined) update.fecha_limite = input.fecha_limite || null
    if (input.estado !== undefined) {
      update.estado = input.estado
      update.completado_at = input.estado === "hecho" ? new Date().toISOString() : null
    }

    const { data, error } = await supabase
      .from("bp_acciones")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }
    revalidatePath("/buenas-practicas")
    return { data: data as BpAccion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarAccion(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    const { error } = await supabase.from("bp_acciones").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/buenas-practicas")
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface NuevaIdeaInput {
  titulo: string
  descripcion?: string
  area: string
  categoria: string
  autor_nombre?: string
  autor_area?: string
}

// Alta desde la pantalla de gestión (editor). Puede registrar a un tercero.
export async function crearIdea(input: NuevaIdeaInput): Promise<Result<BpIdea>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    if (!input.titulo?.trim()) return { error: "El título es obligatorio" }
    const autor = input.autor_nombre?.trim() || profile.nombre

    const { data, error } = await supabase
      .from("bp_ideas")
      .insert({
        titulo: input.titulo.trim(),
        descripcion: input.descripcion?.trim() || null,
        area: input.area || "otro",
        categoria: input.categoria || "otro",
        autor_nombre: autor,
        autor_area: input.autor_area?.trim() || null,
        origen: "gestion",
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }
    revalidatePath("/buenas-practicas")
    return { data: data as BpIdea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Alta desde el Portal del Empleado (cualquier usuario logueado). R4.4.2.
export async function enviarIdeaPortal(input: NuevaIdeaInput): Promise<Result<BpIdea>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!input.titulo?.trim()) return { error: "Contanos tu idea (título)" }

    const { data, error } = await supabase
      .from("bp_ideas")
      .insert({
        titulo: input.titulo.trim(),
        descripcion: input.descripcion?.trim() || null,
        area: input.area || "otro",
        categoria: input.categoria || "otro",
        autor_nombre: input.autor_nombre?.trim() || profile.nombre,
        autor_area: input.autor_area?.trim() || null,
        autor_profile_id: profile.id,
        origen: "portal",
        estado: "nueva",
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }
    revalidatePath("/mis-buenas-practicas")
    revalidatePath("/buenas-practicas")
    return { data: data as BpIdea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getMisIdeas(): Promise<Result<BpIdea[]>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("bp_ideas")
      .select("*")
      .eq("autor_profile_id", profile.id)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    return { data: (data ?? []) as BpIdea[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Helper interno: registra un avance en el timeline.
async function registrarAvance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ideaId: string,
  profile: { id: string; nombre: string },
  campos: {
    tipo: BpAvance["tipo"]
    descripcion?: string | null
    estado_resultante?: BpEstado | null
  },
) {
  await supabase.from("bp_avances").insert({
    idea_id: ideaId,
    tipo: campos.tipo,
    descripcion: campos.descripcion ?? null,
    estado_resultante: campos.estado_resultante ?? null,
    autor_id: profile.id,
    autor_nombre: profile.nombre,
  })
}

// Revisión: cambia el estado y deja feedback (R4.4.3).
export async function revisarIdea(
  id: string,
  estado: BpEstado,
  comentario?: string,
): Promise<Result<BpIdea>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("bp_ideas")
      .update({
        estado,
        comentario_revision: comentario?.trim() || null,
        revisado_por: profile.id,
        fecha_revision: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    await registrarAvance(supabase, id, profile, {
      tipo: "cambio_estado",
      descripcion: comentario?.trim() || null,
      estado_resultante: estado,
    })

    revalidatePath("/buenas-practicas")
    revalidatePath("/mis-buenas-practicas")
    return { data: data as BpIdea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Reconocimiento al empleado en la reunión matinal (R4.4.3).
function formatFechaDMY(d: string): string {
  // d en formato YYYY-MM-DD → DD/MM/YYYY (sin tocar zona horaria)
  const [y, m, dd] = d.split("-")
  return dd && m && y ? `${dd}/${m}/${y}` : d
}

export async function reconocerEnMatinal(
  id: string,
  fecha: string,
): Promise<Result<BpIdea>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    if (!fecha) return { error: "Indicá la fecha de la reunión matinal" }
    const supabase = await createClient()

    const texto = `Reconocida en la reunión matinal del ${formatFechaDMY(fecha)}`

    const { data, error } = await supabase
      .from("bp_ideas")
      .update({
        reconocido: true,
        reconocida_matinal_fecha: fecha,
        reconocimiento: texto,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    await registrarAvance(supabase, id, profile, {
      tipo: "reconocimiento",
      descripcion: texto,
    })

    revalidatePath("/buenas-practicas")
    revalidatePath("/mis-buenas-practicas")
    return { data: data as BpIdea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface ImpactoInput {
  kpi_nombre: string
  kpi_unidad?: string
  kpi_linea_base?: number | null
  kpi_objetivo?: number | null
  kpi_logrado?: number | null
  kpi_comentario?: string
  marcarImplementada?: boolean
}

// Impacto medible en KPI/PI (R4.4.5).
export async function registrarImpacto(
  id: string,
  input: ImpactoInput,
): Promise<Result<BpIdea>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    if (!input.kpi_nombre?.trim()) return { error: "Indicá el KPI/PI afectado" }
    const supabase = await createClient()

    const update: Record<string, unknown> = {
      kpi_nombre: input.kpi_nombre.trim(),
      kpi_unidad: input.kpi_unidad?.trim() || null,
      kpi_linea_base: input.kpi_linea_base ?? null,
      kpi_objetivo: input.kpi_objetivo ?? null,
      kpi_logrado: input.kpi_logrado ?? null,
      kpi_comentario: input.kpi_comentario?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (input.marcarImplementada) update.estado = "implementada"

    const { data, error } = await supabase
      .from("bp_ideas")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    const resumen = `${input.kpi_nombre.trim()}: ${input.kpi_linea_base ?? "—"} → ${input.kpi_logrado ?? "—"} ${input.kpi_unidad ?? ""}`.trim()
    await registrarAvance(supabase, id, profile, {
      tipo: "impacto",
      descripcion: input.kpi_comentario?.trim()
        ? `${resumen}. ${input.kpi_comentario.trim()}`
        : resumen,
    })

    revalidatePath("/buenas-practicas")
    return { data: data as BpIdea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface ReplicacionInput {
  replicable: boolean
  replica_areas?: string
  replica_comentario?: string
  marcarReplicada?: boolean
}

// Análisis de replicación (R4.4.4).
export async function actualizarReplicacion(
  id: string,
  input: ReplicacionInput,
): Promise<Result<BpIdea>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    const update: Record<string, unknown> = {
      replicable: input.replicable,
      replica_areas: input.replica_areas?.trim() || null,
      replica_comentario: input.replica_comentario?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (input.marcarReplicada) update.estado = "replicada"

    const { data, error } = await supabase
      .from("bp_ideas")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    await registrarAvance(supabase, id, profile, {
      tipo: "comentario",
      descripcion: input.replicable
        ? `Marcada como replicable${input.replica_areas?.trim() ? ` en: ${input.replica_areas.trim()}` : ""}. ${input.replica_comentario?.trim() ?? ""}`.trim()
        : "Marcada como NO replicable.",
      estado_resultante: input.marcarReplicada ? "replicada" : null,
    })

    revalidatePath("/buenas-practicas")
    return { data: data as BpIdea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Elevación a Mejor Práctica de Zona/UN (R4.4.6).
export async function elevarAMejorPractica(
  id: string,
  comentario?: string,
): Promise<Result<BpIdea>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("bp_ideas")
      .update({
        elevada_zona: true,
        fecha_elevacion: new Date().toISOString(),
        elevacion_comentario: comentario?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    await registrarAvance(supabase, id, profile, {
      tipo: "comentario",
      descripcion: `Elevada a Mejor Práctica de Zona/UN. ${comentario?.trim() ?? ""}`.trim(),
    })

    revalidatePath("/buenas-practicas")
    return { data: data as BpIdea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Comentario/seguimiento libre en el timeline (editor o autor de la idea).
export async function agregarComentario(
  ideaId: string,
  texto: string,
): Promise<Result<BpAvance>> {
  try {
    const profile = await requireAuth()
    if (!texto?.trim()) return { error: "Escribí un comentario" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("bp_avances")
      .insert({
        idea_id: ideaId,
        tipo: "comentario",
        descripcion: texto.trim(),
        autor_id: profile.id,
        autor_nombre: profile.nombre,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }
    revalidatePath("/buenas-practicas")
    revalidatePath("/mis-buenas-practicas")
    return { data: data as BpAvance }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarIdea(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    const { error } = await supabase.from("bp_ideas").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/buenas-practicas")
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// Sincroniza una evidencia tipo "link" en la pregunta 4.4 del manual para que
// el auditor la vea en el flujo de auditoría (integración con el score).
export async function sincronizarEvidencia44(): Promise<Result<{ resumen: string }>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) return { error: "Sin permiso" }
    const supabase = await createClient()

    const dash = await getBuenasPracticasDashboard()
    if ("error" in dash) return { error: dash.error }
    const { stats, cumplimiento } = dash.data

    const titulo = "Programa Buenas Prácticas (módulo /buenas-practicas)"
    const descripcion =
      `Nivel estimado: ${cumplimiento.nivelEstimado}/5. ` +
      `${stats.total} ideas (${stats.desdePortal} de empleados), ` +
      `${stats.implementadas} implementadas, ${stats.conImpacto} con impacto medido, ` +
      `${stats.replicables} replicables, ${stats.elevadas} elevadas a Zona. ` +
      `Requisitos: ${cumplimiento.requisitos.filter((r) => r.cumple).map((r) => r.codigo).join(", ") || "ninguno"} cumplidos.`

    // Upsert manual: buscamos una evidencia link existente del programa.
    const { data: existentes } = await supabase
      .from("evidencias")
      .select("id")
      .eq("pregunta_id", PREGUNTA_44_ID)
      .eq("url", "/buenas-practicas")
      .limit(1)

    if (existentes && existentes.length > 0) {
      const { error } = await supabase
        .from("evidencias")
        .update({ titulo, descripcion })
        .eq("id", existentes[0].id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from("evidencias").insert({
        pregunta_id: PREGUNTA_44_ID,
        titulo,
        descripcion,
        url: "/buenas-practicas",
        tipo: "link",
        created_by: profile.id,
      })
      if (error) return { error: error.message }
    }

    return { data: { resumen: descripcion } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
