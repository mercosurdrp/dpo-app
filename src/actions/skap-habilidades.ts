"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile, requireAuth, getEmpleadoIdFromAuth } from "@/lib/session"
import type {
  SkapRol,
  SkapHabilidad,
  SkapCelda,
  SkapEstadoGap,
  SkapPersonaRow,
  SkapMatrizRol,
  SkapPlanFormacion,
  SkapAccion,
  SkapEstadoAccion,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

/** Sector de empleados al que pertenece cada rol de la matriz. */
const SECTOR_DE_ROL: Record<SkapRol, string> = {
  chofer: "Distribución",
  ayudante: "Distribución",
  pickero: "Depósito",
  autoelevadorista: "Depósito",
  mantenimiento: "Depósito",
  administrativo: "Distribución",
}

/**
 * Semáforo del gap, tal cual el instructivo del Excel:
 *   gap <= -2  crítico | gap == -1  brecha | gap >= 0  cumple
 */
function calcularCelda(
  habilidad: SkapHabilidad,
  evaluacion: { nivel: number | null; estandar_individual: number | null; fecha_evaluacion: string } | undefined,
): SkapCelda {
  const estandar = evaluacion?.estandar_individual ?? habilidad.estandar

  if (!evaluacion) {
    return {
      habilidad_id: habilidad.id,
      nivel: null,
      estandar,
      gap: null,
      estado: "sin_evaluar",
      fecha_evaluacion: null,
    }
  }
  if (evaluacion.nivel === null) {
    return {
      habilidad_id: habilidad.id,
      nivel: null,
      estandar,
      gap: null,
      estado: "no_aplica",
      fecha_evaluacion: evaluacion.fecha_evaluacion,
    }
  }

  const gap = evaluacion.nivel - estandar
  let estado: SkapEstadoGap
  if (gap >= 0) estado = "cumple"
  else if (gap === -1) estado = "brecha"
  else estado = "critico"

  return {
    habilidad_id: habilidad.id,
    nivel: evaluacion.nivel,
    estandar,
    gap,
    estado,
    fecha_evaluacion: evaluacion.fecha_evaluacion,
  }
}

/**
 * Matriz completa de un rol: habilidades × personas asignadas, con el gap ya
 * resuelto y los KPIs del 4.4. De cada persona se toma SOLO la evaluación más
 * reciente por habilidad (la tabla guarda todo el historial).
 */
export async function getMatrizRol(rol: SkapRol): Promise<Result<SkapMatrizRol>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: habsRaw, error: errHab } = await supabase
      .from("skap_habilidades")
      .select("*")
      .eq("rol", rol)
      .eq("activo", true)
      .order("orden", { ascending: true })
    if (errHab) return { error: errHab.message }
    const habilidades = (habsRaw || []) as SkapHabilidad[]

    const { data: asigRaw, error: errAsig } = await supabase
      .from("skap_asignaciones")
      .select("empleado_id, empleados!inner(id, legajo, nombre, activo)")
      .eq("rol", rol)
      .eq("activo", true)
    if (errAsig) return { error: errAsig.message }

    type AsigRow = { empleado_id: string; empleados: { id: string; legajo: number; nombre: string; activo: boolean } }
    const personasBase = ((asigRaw || []) as unknown as AsigRow[])
      .filter((a) => a.empleados?.activo)
      .map((a) => ({ empleado_id: a.empleado_id, legajo: a.empleados.legajo, nombre: a.empleados.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    const habIds = habilidades.map((h) => h.id)
    const empIds = personasBase.map((p) => p.empleado_id)

    // Historial completo del rol; nos quedamos con la última por (empleado, habilidad).
    let evaluaciones: {
      empleado_id: string
      habilidad_id: string
      nivel: number | null
      estandar_individual: number | null
      fecha_evaluacion: string
    }[] = []
    if (habIds.length > 0 && empIds.length > 0) {
      const { data: evalRaw, error: errEval } = await supabase
        .from("skap_evaluaciones")
        .select("empleado_id, habilidad_id, nivel, estandar_individual, fecha_evaluacion")
        .in("habilidad_id", habIds)
        .in("empleado_id", empIds)
        .order("fecha_evaluacion", { ascending: false })
      if (errEval) return { error: errEval.message }
      evaluaciones = evalRaw || []
    }

    const ultima = new Map<string, (typeof evaluaciones)[number]>()
    for (const e of evaluaciones) {
      const k = `${e.empleado_id}|${e.habilidad_id}`
      if (!ultima.has(k)) ultima.set(k, e) // ya vienen ordenadas desc por fecha
    }

    let accionesAbiertas = 0
    if (habIds.length > 0) {
      const { count } = await supabase
        .from("skap_acciones")
        .select("id", { count: "exact", head: true })
        .in("habilidad_id", habIds)
        .neq("estado", "cerrada")
      accionesAbiertas = count ?? 0
    }

    const criticas = habilidades.filter((h) => h.criticidad === "A")

    const personas: SkapPersonaRow[] = personasBase.map((p) => {
      const celdas = habilidades.map((h) => calcularCelda(h, ultima.get(`${p.empleado_id}|${h.id}`)))
      const porHab = new Map(celdas.map((c) => [c.habilidad_id, c]))

      const evaluables = celdas.filter((c) => c.estado !== "sin_evaluar" && c.estado !== "no_aplica")
      const criticasEval = criticas
        .map((h) => porHab.get(h.id)!)
        .filter((c) => c.estado !== "sin_evaluar" && c.estado !== "no_aplica")

      return {
        ...p,
        celdas,
        pct_criticas:
          criticasEval.length > 0
            ? (criticasEval.filter((c) => c.estado === "cumple").length / criticasEval.length) * 100
            : null,
        pct_general:
          evaluables.length > 0
            ? (evaluables.filter((c) => c.estado === "cumple").length / evaluables.length) * 100
            : null,
        gaps_criticos: criticasEval.filter((c) => c.estado === "critico" || c.estado === "brecha").length,
      }
    })

    const todasCeldas = personas.flatMap((p) => p.celdas)
    const critCeldas = personas.flatMap((p) =>
      p.celdas.filter((c) => criticas.some((h) => h.id === c.habilidad_id)),
    )
    const critEvaluadas = critCeldas.filter((c) => c.estado !== "sin_evaluar" && c.estado !== "no_aplica")

    return {
      data: {
        rol,
        habilidades,
        personas,
        kpis: {
          personas: personas.length,
          evaluadas: personas.filter((p) => p.celdas.some((c) => c.estado !== "sin_evaluar")).length,
          pct_cobertura_criticas:
            critEvaluadas.length > 0
              ? (critEvaluadas.filter((c) => c.estado === "cumple").length / critEvaluadas.length) * 100
              : null,
          gaps_criticos: todasCeldas.filter((c) => c.estado === "critico").length,
          gaps_brecha: todasCeldas.filter((c) => c.estado === "brecha").length,
          acciones_abiertas: accionesAbiertas,
        },
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al cargar la matriz" }
  }
}

/**
 * ¿Puede el usuario cargar evaluaciones de este rol?
 * admin/admin_rrhh todo; supervisor sólo el sector donde está dado de alta.
 */
export async function puedeEditarRol(rol: SkapRol): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  if (profile.role === "admin" || profile.role === "admin_rrhh") return true
  if (profile.role !== "supervisor") return false

  const empleadoId = await getEmpleadoIdFromAuth()
  if (!empleadoId) return false

  const supabase = await createClient()
  const { data } = await supabase.from("empleados").select("sector").eq("id", empleadoId).single()
  return data?.sector === SECTOR_DE_ROL[rol]
}

async function assertPuedeEditar(rol: SkapRol): Promise<void> {
  if (!(await puedeEditarRol(rol))) {
    throw new Error("No tenés permiso para cargar evaluaciones de este rol")
  }
}

/**
 * Carga (o corrige) las evaluaciones de una persona en una fecha dada.
 * Cargar de nuevo la misma fecha PISA esa evaluación; una fecha nueva agrega
 * un punto al historial y deja ver la evolución.
 */
export async function guardarEvaluacion(input: {
  rol: SkapRol
  empleadoId: string
  fecha: string
  niveles: { habilidadId: string; nivel: number | null; estandarIndividual?: number | null; observaciones?: string }[]
}): Promise<Result<{ guardadas: number }>> {
  try {
    await assertPuedeEditar(input.rol)
    const profile = await requireAuth()
    const supabase = await createClient()

    if (input.niveles.length === 0) return { data: { guardadas: 0 } }

    // PostgREST exige claves idénticas en un insert múltiple.
    const rows = input.niveles.map((n) => ({
      empleado_id: input.empleadoId,
      habilidad_id: n.habilidadId,
      fecha_evaluacion: input.fecha,
      nivel: n.nivel,
      estandar_individual: n.estandarIndividual ?? null,
      observaciones: n.observaciones ?? null,
      evaluador_id: profile.id,
    }))

    const { error } = await supabase
      .from("skap_evaluaciones")
      .upsert(rows, { onConflict: "empleado_id,habilidad_id,fecha_evaluacion" })
    if (error) return { error: error.message }

    revalidatePath("/gente/matriz-skap")
    return { data: { guardadas: rows.length } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al guardar" }
  }
}

/**
 * Nota base para arrancar un rol: a toda celda SIN EVALUAR le carga
 * nivel = estándar de la habilidad (todos "cumplen" y después se ajusta
 * celda a celda según lo observado). No pisa ninguna nota ya cargada.
 */
export async function cargarNotaBase(rol: SkapRol): Promise<Result<{ cargadas: number; personas: number }>> {
  try {
    await assertPuedeEditar(rol)
    const profile = await requireAuth()
    const supabase = await createClient()

    const matriz = await getMatrizRol(rol)
    if ("error" in matriz) return { error: matriz.error }

    const hoy = new Date().toISOString().slice(0, 10)
    const rows = matriz.data.personas.flatMap((p) =>
      p.celdas
        .filter((c) => c.estado === "sin_evaluar")
        .map((c) => ({
          empleado_id: p.empleado_id,
          habilidad_id: c.habilidad_id,
          fecha_evaluacion: hoy,
          nivel: c.estandar,
          estandar_individual: null,
          observaciones: "Nota base (= estándar requerido)",
          evaluador_id: profile.id,
        })),
    )
    if (rows.length === 0) return { data: { cargadas: 0, personas: 0 } }

    const { error } = await supabase
      .from("skap_evaluaciones")
      .upsert(rows, { onConflict: "empleado_id,habilidad_id,fecha_evaluacion" })
    if (error) return { error: error.message }

    revalidatePath("/gente/matriz-skap")
    return { data: { cargadas: rows.length, personas: new Set(rows.map((r) => r.empleado_id)).size } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al cargar la nota base" }
  }
}

/** Habilidad + su plan de formación, para el panel de detalle. */
export async function getPlanFormacion(habilidadId: string): Promise<Result<SkapPlanFormacion | null>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("skap_plan_formacion")
      .select("*")
      .eq("habilidad_id", habilidadId)
      .maybeSingle()
    if (error) return { error: error.message }
    return { data: (data as SkapPlanFormacion) ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al cargar el plan" }
  }
}

export interface SkapAccionDetalle extends SkapAccion {
  empleado_nombre: string
  legajo: number
  habilidad: string
  criticidad: string
  rol: SkapRol
  estandar: number
}

/** Acciones de formación (el seguimiento). Sin rol = todas. */
export async function getAcciones(rol?: SkapRol): Promise<Result<SkapAccionDetalle[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("skap_acciones")
      .select(
        "*, empleados!inner(legajo, nombre), skap_habilidades!inner(habilidad, criticidad, rol, estandar)",
      )
      .order("estado", { ascending: true })
      .order("fecha_programada", { ascending: true, nullsFirst: false })
    if (error) return { error: error.message }

    type Row = SkapAccion & {
      empleados: { legajo: number; nombre: string }
      skap_habilidades: { habilidad: string; criticidad: string; rol: SkapRol; estandar: number }
    }

    const acciones = ((data || []) as unknown as Row[])
      .filter((a) => !rol || a.skap_habilidades.rol === rol)
      .map((a) => ({
        ...a,
        empleado_nombre: a.empleados.nombre,
        legajo: a.empleados.legajo,
        habilidad: a.skap_habilidades.habilidad,
        criticidad: a.skap_habilidades.criticidad,
        rol: a.skap_habilidades.rol,
        estandar: a.skap_habilidades.estandar,
      }))

    return { data: acciones }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al cargar las acciones" }
  }
}

/**
 * Abre una acción de formación para cada gap (crítico o brecha) que todavía no
 * tenga una acción abierta. Es el puente entre "medí el gap" y "hago algo".
 */
export async function generarAccionesDesdeGaps(rol: SkapRol): Promise<Result<{ creadas: number }>> {
  try {
    await assertPuedeEditar(rol)
    const profile = await requireAuth()
    const supabase = await createClient()

    const matriz = await getMatrizRol(rol)
    if ("error" in matriz) return { error: matriz.error }

    const { data: abiertas } = await supabase
      .from("skap_acciones")
      .select("empleado_id, habilidad_id")
      .neq("estado", "cerrada")
    const yaAbierta = new Set((abiertas || []).map((a) => `${a.empleado_id}|${a.habilidad_id}`))

    const nuevas = matriz.data.personas.flatMap((p) =>
      p.celdas
        .filter((c) => c.estado === "critico" || c.estado === "brecha")
        .filter((c) => !yaAbierta.has(`${p.empleado_id}|${c.habilidad_id}`))
        .map((c) => ({
          empleado_id: p.empleado_id,
          habilidad_id: c.habilidad_id,
          estado: "pendiente" as const,
          fecha_programada: null,
          fecha_realizada: null,
          responsable: null,
          nivel_origen: c.nivel,
          observaciones: null,
          created_by: profile.id,
        })),
    )

    if (nuevas.length === 0) return { data: { creadas: 0 } }

    const { error } = await supabase.from("skap_acciones").insert(nuevas)
    if (error) return { error: error.message }

    revalidatePath("/gente/matriz-skap")
    return { data: { creadas: nuevas.length } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al generar acciones" }
  }
}

export async function actualizarAccion(input: {
  id: string
  rol: SkapRol
  estado: SkapEstadoAccion
  fecha_programada?: string | null
  fecha_realizada?: string | null
  responsable?: string | null
  observaciones?: string | null
}): Promise<Result<{ ok: true }>> {
  try {
    await assertPuedeEditar(input.rol)
    const supabase = await createClient()

    const { error } = await supabase
      .from("skap_acciones")
      .update({
        estado: input.estado,
        fecha_programada: input.fecha_programada ?? null,
        fecha_realizada: input.fecha_realizada ?? null,
        responsable: input.responsable ?? null,
        observaciones: input.observaciones ?? null,
      })
      .eq("id", input.id)
    if (error) return { error: error.message }

    revalidatePath("/gente/matriz-skap")
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al actualizar la acción" }
  }
}

/** Historial de una persona en una habilidad, para ver la evolución. */
export async function getHistorial(
  empleadoId: string,
  habilidadId: string,
): Promise<Result<{ fecha_evaluacion: string; nivel: number | null; observaciones: string | null }[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("skap_evaluaciones")
      .select("fecha_evaluacion, nivel, observaciones")
      .eq("empleado_id", empleadoId)
      .eq("habilidad_id", habilidadId)
      .order("fecha_evaluacion", { ascending: true })
    if (error) return { error: error.message }
    return { data: data || [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al cargar el historial" }
  }
}
