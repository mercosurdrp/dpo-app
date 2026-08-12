"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import {
  archivosDeFila,
  archivosDelForm,
  columnasArchivos,
  subirArchivosAvance,
  type ArchivoAvance,
} from "@/lib/adjuntos-avance"
import {
  CLIMA_BUCKET,
  CLIMA_PREFIJO_ARCHIVOS,
  borrarClave,
  borrarPrefijo,
  escribirClave,
  leerClave,
  leerObjetos,
} from "@/lib/clima-store"
import type {
  ClimaPlan,
  ClimaPlanAvance,
  EstadoClimaPlan,
  PrioridadClimaPlan,
} from "@/actions/clima-tipos"

const CLIMA_PATH = "/clima"

const ESTADOS_VALIDOS: EstadoClimaPlan[] = [
  "pendiente",
  "en_progreso",
  "completado",
]
const PRIORIDADES_VALIDAS: PrioridadClimaPlan[] = ["alta", "media", "baja"]

type Result<T> = { data: T } | { error: string }

/** Lo que se guarda de un plan; los nombres se resuelven al listar. */
type PlanGuardado = Omit<
  ClimaPlan,
  "responsable_nombre" | "created_by_nombre" | "ola_codigo" | "avances_count"
>

/** Lo que se guarda de un avance. */
type AvanceGuardado = Omit<ClimaPlanAvance, "autor_nombre">

function clavePlan(id: string) {
  return `clima:plan:${id}`
}

function claveAvance(planId: string, id: string) {
  return `clima:avance:${planId}:${id}`
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

function textoOpcional(formData: FormData, campo: string): string | null {
  return String(formData.get(campo) ?? "").trim() || null
}

/** {id: nombre} de los perfiles pedidos, para mostrar autor y responsable. */
async function nombresDePerfiles(
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))]
  const out = new Map<string, string>()
  if (!unicos.length) return out
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre")
    .in("id", unicos)
  for (const p of (data ?? []) as Array<{ id: string; nombre: string }>) {
    out.set(p.id, p.nombre)
  }
  return out
}

// ------------------------------------------------------------------
// Listado
// ------------------------------------------------------------------
export async function listarPlanesClima(): Promise<Result<ClimaPlan[]>> {
  try {
    await requireAuth()

    const res = await leerObjetos<PlanGuardado>("clima:plan:")
    if ("error" in res) return res

    const avances = await leerObjetos<AvanceGuardado>("clima:avance:")
    const conteo = new Map<string, number>()
    if (!("error" in avances)) {
      for (const a of avances.data) {
        conteo.set(a.plan_id, (conteo.get(a.plan_id) ?? 0) + 1)
      }
    }

    const nombres = await nombresDePerfiles(
      res.data.flatMap((p) => [p.responsable_id, p.created_by]),
    )

    const planes: ClimaPlan[] = res.data
      .map((p) => ({
        ...p,
        ola_codigo: p.ola_id,
        responsable_nombre: p.responsable_id
          ? (nombres.get(p.responsable_id) ?? null)
          : null,
        created_by_nombre: p.created_by
          ? (nombres.get(p.created_by) ?? null)
          : null,
        avances_count: conteo.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

    return { data: planes }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los planes",
    }
  }
}

// ------------------------------------------------------------------
// Alta
// ------------------------------------------------------------------
export async function crearPlanClima(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!isEditorRole(profile.role)) {
      return { error: "No tenés permiso para cargar planes de acción" }
    }

    const accion = String(formData.get("accion") ?? "").trim()
    if (!accion) return { error: "Escribí la acción concreta" }

    const prioridadRaw = String(formData.get("prioridad") ?? "media").trim()
    const prioridad = PRIORIDADES_VALIDAS.includes(
      prioridadRaw as PrioridadClimaPlan,
    )
      ? (prioridadRaw as PrioridadClimaPlan)
      : "media"

    const ahora = new Date().toISOString()
    const plan: PlanGuardado = {
      id: crypto.randomUUID(),
      ola_id: textoOpcional(formData, "ola_id"),
      prioridad,
      foco: textoOpcional(formData, "foco"),
      eje: textoOpcional(formData, "eje"),
      dimension: textoOpcional(formData, "dimension"),
      pregunta: textoOpcional(formData, "pregunta"),
      hallazgo: textoOpcional(formData, "hallazgo"),
      accion,
      responsable_id: textoOpcional(formData, "responsable_id"),
      responsable_texto: textoOpcional(formData, "responsable_texto"),
      plazo: textoOpcional(formData, "plazo"),
      fecha_objetivo: textoOpcional(formData, "fecha_objetivo"),
      indicador_exito: textoOpcional(formData, "indicador_exito"),
      estado: "pendiente",
      created_by: profile.id,
      created_at: ahora,
      updated_at: ahora,
    }

    const r = await escribirClave(clavePlan(plan.id), plan, profile.id)
    if ("error" in r) return { error: r.error }

    revalidatePath(CLIMA_PATH)
    return { data: { id: plan.id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Edición
// ------------------------------------------------------------------
export async function actualizarPlanClima(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }

    const plan = await leerClave<PlanGuardado>(clavePlan(planId))
    if (!plan) return { error: "Plan no encontrado" }
    if (
      !isEditorRole(profile.role) &&
      plan.created_by !== profile.id &&
      plan.responsable_id !== profile.id
    ) {
      return { error: "No tenés permiso para editar este plan" }
    }

    const actualizado: PlanGuardado = {
      ...plan,
      updated_at: new Date().toISOString(),
    }

    if (formData.has("accion")) {
      const a = String(formData.get("accion") ?? "").trim()
      if (!a) return { error: "La acción no puede quedar vacía" }
      actualizado.accion = a
    }
    if (formData.has("prioridad")) {
      const pr = String(formData.get("prioridad") ?? "").trim()
      if (PRIORIDADES_VALIDAS.includes(pr as PrioridadClimaPlan)) {
        actualizado.prioridad = pr as PrioridadClimaPlan
      }
    }
    if (formData.has("estado")) {
      const es = String(formData.get("estado") ?? "").trim()
      if (!ESTADOS_VALIDOS.includes(es as EstadoClimaPlan)) {
        return { error: "Estado inválido" }
      }
      actualizado.estado = es as EstadoClimaPlan
    }
    const camposTexto = [
      "ola_id",
      "foco",
      "eje",
      "dimension",
      "pregunta",
      "hallazgo",
      "responsable_id",
      "responsable_texto",
      "plazo",
      "fecha_objetivo",
      "indicador_exito",
    ] as const
    for (const campo of camposTexto) {
      if (formData.has(campo)) {
        actualizado[campo] = textoOpcional(formData, campo)
      }
    }

    const r = await escribirClave(clavePlan(planId), actualizado, profile.id)
    if ("error" in r) return { error: r.error }

    revalidatePath(CLIMA_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Baja (se llevan también los avances y sus archivos)
// ------------------------------------------------------------------
export async function eliminarPlanClima(
  planId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }

    const plan = await leerClave<PlanGuardado>(clavePlan(planId))
    if (!plan) return { error: "Plan no encontrado" }
    if (!isEditorRole(profile.role) && plan.created_by !== profile.id) {
      return { error: "No tenés permiso para eliminar este plan" }
    }

    const avances = await leerObjetos<AvanceGuardado>(`clima:avance:${planId}:`)
    const paths = [
      ...new Set(
        ("error" in avances ? [] : avances.data).flatMap((a) =>
          (a.archivos ?? []).map((x) => x.path),
        ),
      ),
    ]

    const borradoAvances = await borrarPrefijo(`clima:avance:${planId}:`)
    if ("error" in borradoAvances) return { error: borradoAvances.error }
    const borrado = await borrarClave(clavePlan(planId))
    if ("error" in borrado) return { error: borrado.error }

    if (paths.length) {
      await createAdminClient().storage.from(CLIMA_BUCKET).remove(paths)
    }

    revalidatePath(CLIMA_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Avances (seguimiento + evidencia)
// ------------------------------------------------------------------
export async function listarAvancesPlanClima(
  planId: string,
): Promise<Result<ClimaPlanAvance[]>> {
  try {
    await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }

    const res = await leerObjetos<AvanceGuardado>(`clima:avance:${planId}:`)
    if ("error" in res) return res

    const nombres = await nombresDePerfiles(res.data.map((a) => a.autor_id))

    const avances: ClimaPlanAvance[] = res.data
      .map((a) => ({
        ...a,
        archivos: a.archivos ?? [],
        autor_nombre: a.autor_id ? (nombres.get(a.autor_id) ?? null) : null,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

    return { data: avances }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los avances",
    }
  }
}

export async function agregarAvancePlanClima(
  planId: string,
  formData: FormData,
): Promise<Result<ClimaPlanAvance>> {
  try {
    const profile = await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }

    const plan = await leerClave<PlanGuardado>(clavePlan(planId))
    if (!plan) return { error: "Plan no encontrado" }
    if (
      !isEditorRole(profile.role) &&
      plan.created_by !== profile.id &&
      plan.responsable_id !== profile.id
    ) {
      return { error: "Solo el responsable o un editor puede cargar avances" }
    }

    const comentario = String(formData.get("comentario") ?? "").trim() || null
    const files = archivosDelForm(formData)
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()

    let nuevoEstado: EstadoClimaPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS_VALIDOS.includes(nuevoEstadoRaw as EstadoClimaPlan)) {
        return { error: "Estado inválido" }
      }
      nuevoEstado = nuevoEstadoRaw as EstadoClimaPlan
    }

    if (!files.length && !comentario) {
      return { error: "Cargá un comentario o adjuntá un archivo de evidencia" }
    }

    // La evidencia va al bucket de planes de la app, bajo el prefijo del
    // módulo, y se sube con la service role: quién puede hacerlo ya se validó.
    const admin = createAdminClient()
    let archivos: ArchivoAvance[] = []
    if (files.length) {
      const subida = await subirArchivosAvance(
        admin,
        CLIMA_BUCKET,
        `${CLIMA_PREFIJO_ARCHIVOS}/${planId}`,
        files,
      )
      if ("error" in subida) return { error: subida.error }
      archivos = subida.archivos
    }
    const paths = archivos.map((a) => a.path)

    const avance: AvanceGuardado = {
      id: crypto.randomUUID(),
      plan_id: planId,
      comentario,
      archivos: columnasArchivos(archivos).archivos,
      estado_resultante: nuevoEstado,
      autor_id: profile.id,
      created_at: new Date().toISOString(),
    }

    const r = await escribirClave(
      claveAvance(planId, avance.id),
      avance,
      profile.id,
    )
    if ("error" in r) {
      if (paths.length) await admin.storage.from(CLIMA_BUCKET).remove(paths)
      return { error: r.error }
    }

    if (nuevoEstado && nuevoEstado !== plan.estado) {
      const upd = await escribirClave(
        clavePlan(planId),
        {
          ...plan,
          estado: nuevoEstado,
          updated_at: new Date().toISOString(),
        },
        profile.id,
      )
      if ("error" in upd) {
        await borrarClave(claveAvance(planId, avance.id))
        if (paths.length) await admin.storage.from(CLIMA_BUCKET).remove(paths)
        return { error: upd.error }
      }
    }

    revalidatePath(CLIMA_PATH)
    return {
      data: {
        ...avance,
        autor_nombre:
          (await nombresDePerfiles([profile.id])).get(profile.id) ?? null,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error registrando el avance",
    }
  }
}

export async function eliminarAvancePlanClima(
  avanceId: string,
  planId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!avanceId || !planId) return { error: "Avance inválido" }

    const avance = await leerClave<AvanceGuardado>(
      claveAvance(planId, avanceId),
    )
    if (!avance) return { error: "Avance no encontrado" }
    if (!isEditorRole(profile.role) && avance.autor_id !== profile.id) {
      return { error: "Solo el autor o un editor puede eliminar el avance" }
    }

    const r = await borrarClave(claveAvance(planId, avanceId))
    if ("error" in r) return { error: r.error }

    const paths = archivosDeFila({ archivos: avance.archivos }).map(
      (a) => a.path,
    )
    if (paths.length) {
      await createAdminClient().storage.from(CLIMA_BUCKET).remove(paths)
    }

    revalidatePath(CLIMA_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el avance",
    }
  }
}

export async function getAvanceClimaSignedUrl(
  archivoPath: string,
): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    if (!archivoPath) return { error: "Ruta de archivo inválida" }
    // Solo se firman rutas del módulo: nadie puede pedir con esto un archivo
    // de otro plan de la app que comparte bucket.
    if (!archivoPath.startsWith(`${CLIMA_PREFIJO_ARCHIVOS}/`)) {
      return { error: "Ruta de archivo inválida" }
    }

    const { data, error } = await createAdminClient()
      .storage.from(CLIMA_BUCKET)
      .createSignedUrl(archivoPath, 60 * 10)
    if (error || !data) {
      return { error: error?.message ?? "No se pudo generar URL" }
    }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando URL" }
  }
}
