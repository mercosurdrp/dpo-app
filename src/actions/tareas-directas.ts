"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"
import type {
  EstadoPlan,
  Profile,
  PrioridadPlan,
  PlanTipo,
  S5AccionEstado,
} from "@/types/database"

// ============================================================
// Tipos del módulo
// ============================================================

export interface PuntoManualSearchResult {
  pregunta_id: string
  numero: string
  texto: string
  bloque_id: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
  guia: string | null
  requerimiento: string | null
  como_verificar: string | null
}

export interface RegistroTareaItem {
  id: string
  titulo: string | null
  descripcion: string
  estado: EstadoPlan
  prioridad: PrioridadPlan | null
  fecha_limite: string | null
  evidencia_obligatoria: boolean
  created_at: string
  created_by: string | null
  creador_nombre: string
  responsables: Array<{ profile_id: string; nombre: string }>
  pregunta_id: string | null
  pregunta_numero: string | null
  pregunta_texto: string | null
  bloque_nombre: string | null
  pilar_id: string | null
  pilar_nombre: string | null
  pilar_color: string | null
  evidencias_count: number
  /**
   * De dónde sale la fila: 'manual' es una tarea directa de planes_accion;
   * las '5s_*' son filas de s5_acciones (cargadas a mano, espejadas desde una
   * reunión con destino 5S, o nacidas de una auditoría 5S).
   */
  origen: RegistroOrigen
  /** Contexto del origen: sector del almacén o dominio del vehículo. */
  origen_detalle: string | null
  /** Si la acción 5S vino espejada de una reunión, el id para linkearla. */
  origen_reunion_id: string | null
  /** A dónde navega la fila. */
  href: string
}

export type RegistroOrigen = "manual" | "5s_almacen" | "5s_flota"

export interface RegistroTareasFiltros {
  pilarId?: string
  bloqueId?: string
  preguntaId?: string
  responsableId?: string
  estado?: EstadoPlan | "all"
  fechaDesde?: string
  fechaHasta?: string
  query?: string
  origen?: RegistroOrigen | "all"
}

// ============================================================
// Permisos
// ============================================================

async function getProfileWithFlags(): Promise<Profile> {
  return await requireAuth()
}

function puedeAsignar(profile: Profile): boolean {
  return (
    profile.role === "admin" ||
    profile.role === "auditor" ||
    profile.puede_asignar_tareas === true
  )
}

export async function getPermisoCrearTareas(): Promise<boolean> {
  const profile = await getProfileWithFlags()
  return puedeAsignar(profile)
}

// ============================================================
// Listado de operadores asignables
// ============================================================

export async function getOperadoresParaAsignar(): Promise<
  Array<{ id: string; nombre: string; email: string | null; role: string }>
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre, email, role")
    .eq("active", true)
    .order("nombre", { ascending: true })

  return (data ?? []) as Array<{
    id: string
    nombre: string
    email: string | null
    role: string
  }>
}

// ============================================================
// Buscador inteligente de puntos del manual
// ============================================================

export async function searchPuntosManual(
  query: string,
  limit = 25
): Promise<PuntoManualSearchResult[]> {
  const supabase = await createClient()
  const q = query.trim()

  let preguntasQuery = supabase
    .from("preguntas")
    .select("id, numero, texto, bloque_id, guia, requerimiento, como_verificar")
    .order("numero", { ascending: true })
    .limit(limit)

  if (q.length > 0) {
    // Busca match en numero, texto, guia o requerimiento (case-insensitive)
    const escaped = q.replace(/[%,]/g, " ")
    const pattern = `%${escaped}%`
    preguntasQuery = preguntasQuery.or(
      `numero.ilike.${pattern},texto.ilike.${pattern},guia.ilike.${pattern},requerimiento.ilike.${pattern}`
    )
  }

  const { data: preguntas } = await preguntasQuery
  const preguntasList = (preguntas ?? []) as Array<{
    id: string
    numero: string
    texto: string
    bloque_id: string
    guia: string | null
    requerimiento: string | null
    como_verificar: string | null
  }>

  if (preguntasList.length === 0) return []

  const bloqueIds = Array.from(new Set(preguntasList.map((p) => p.bloque_id)))
  const { data: bloques } = await supabase
    .from("bloques")
    .select("id, nombre, pilar_id")
    .in("id", bloqueIds)

  const bloqueMap = new Map(
    ((bloques ?? []) as Array<{ id: string; nombre: string; pilar_id: string }>).map((b) => [
      b.id,
      b,
    ])
  )

  const pilarIds = Array.from(
    new Set((bloques ?? []).map((b: { pilar_id: string }) => b.pilar_id))
  )
  const { data: pilares } = await supabase
    .from("pilares")
    .select("id, nombre, color")
    .in("id", pilarIds)

  const pilarMap = new Map(
    ((pilares ?? []) as Array<{ id: string; nombre: string; color: string }>).map((p) => [
      p.id,
      p,
    ])
  )

  const result: PuntoManualSearchResult[] = preguntasList.map((p) => {
    const b = bloqueMap.get(p.bloque_id)
    const pi = b ? pilarMap.get(b.pilar_id) : undefined
    return {
      pregunta_id: p.id,
      numero: p.numero,
      texto: p.texto,
      bloque_id: p.bloque_id,
      bloque_nombre: b?.nombre ?? "",
      pilar_id: b?.pilar_id ?? "",
      pilar_nombre: pi?.nombre ?? "",
      pilar_color: pi?.color ?? "#64748B",
      guia: p.guia,
      requerimiento: p.requerimiento,
      como_verificar: p.como_verificar,
    }
  })

  return result
}

// ============================================================
// Crear tarea directa
// ============================================================

export async function crearTareaDirecta(input: {
  titulo: string
  descripcion: string
  responsable_ids: string[]
  fecha_inicio?: string | null
  fecha_limite: string | null
  prioridad?: PrioridadPlan
  evidencia_obligatoria: boolean
  pregunta_id?: string | null
  // 'directa' (default) para tareas sueltas; 'auditoria' cuando se crea
  // desde la solapa de un punto del manual (pilar).
  tipo?: PlanTipo
}): Promise<{ data: { id: string } } | { error: string }> {
  try {
    const profile = await getProfileWithFlags()
    if (!puedeAsignar(profile)) {
      return { error: "No tenés permiso para crear tareas." }
    }

    if (!input.titulo.trim()) return { error: "El título es requerido." }
    if (!input.descripcion.trim())
      return { error: "La descripción es requerida." }
    if (!input.responsable_ids || input.responsable_ids.length === 0) {
      return { error: "Asigná al menos un responsable." }
    }

    const supabase = await createClient()

    // Insert plan
    const { data: plan, error: planErr } = await supabase
      .from("planes_accion")
      .insert({
        pregunta_id: input.pregunta_id ?? null,
        tipo: input.tipo ?? "directa",
        titulo: input.titulo.trim(),
        descripcion: input.descripcion.trim(),
        responsable: "", // legacy column NOT NULL → string vacío; los reales viven en plan_responsables
        fecha_inicio: input.fecha_inicio ?? null,
        fecha_limite: input.fecha_limite,
        prioridad: input.prioridad ?? "media",
        evidencia_obligatoria: input.evidencia_obligatoria,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (planErr || !plan) {
      return { error: planErr?.message ?? "No se pudo crear la tarea." }
    }

    const planId = plan.id as string

    // Insert responsables: el primero queda como principal, el resto coresponsables
    const rows = input.responsable_ids.map((profile_id, idx) => ({
      plan_id: planId,
      profile_id,
      rol:
        idx === 0
          ? ("responsable_principal" as const)
          : ("coresponsable" as const),
      asignado_por: profile.id,
    }))

    const { error: respErr } = await supabase
      .from("plan_responsables")
      .insert(rows)

    if (respErr) {
      // Rollback manual: borrar el plan recién creado
      await supabase.from("planes_accion").delete().eq("id", planId)
      return {
        error: `No se pudieron asignar los responsables: ${respErr.message}`,
      }
    }

    revalidatePath("/registro-tareas")
    revalidatePath("/mis-tareas")
    revalidatePath("/planes")

    return { data: { id: planId } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando tarea",
    }
  }
}

// ============================================================
// Asociar / cambiar punto del manual de una tarea
// ============================================================

export async function asociarPuntoManual(
  planId: string,
  preguntaId: string | null
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await getProfileWithFlags()
    if (!puedeAsignar(profile)) {
      return { error: "No tenés permiso para editar el punto del manual." }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("planes_accion")
      .update({ pregunta_id: preguntaId })
      .eq("id", planId)

    if (error) return { error: error.message }

    revalidatePath(`/planes/${planId}`)
    revalidatePath("/registro-tareas")
    revalidatePath("/mis-tareas")

    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando punto",
    }
  }
}

// ============================================================
// Registro de tareas (vista para defender auditoría)
// ============================================================

/**
 * Filas del registro que salen de planes_accion (tareas directas atadas al
 * manual DPO). El merge con las acciones 5S lo hace getRegistroTareasDirectas.
 */
async function getTareasDirectasItems(
  filtros: RegistroTareasFiltros = {}
): Promise<{ data: RegistroTareaItem[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // 1) Planes (filtrados)
    let planesQ = supabase
      .from("planes_accion")
      .select("*")
      .eq("tipo", "directa")
      .order("created_at", { ascending: false })

    if (filtros.estado && filtros.estado !== "all") {
      planesQ = planesQ.eq("estado", filtros.estado)
    }
    if (filtros.fechaDesde) {
      planesQ = planesQ.gte("created_at", filtros.fechaDesde)
    }
    if (filtros.fechaHasta) {
      planesQ = planesQ.lte("created_at", filtros.fechaHasta)
    }
    if (filtros.preguntaId) {
      planesQ = planesQ.eq("pregunta_id", filtros.preguntaId)
    }

    const { data: planesRaw, error: planesErr } = await planesQ
    if (planesErr) return { error: planesErr.message }

    type PlanRow = {
      id: string
      titulo: string | null
      descripcion: string
      estado: EstadoPlan
      prioridad: PrioridadPlan
      fecha_limite: string | null
      evidencia_obligatoria: boolean
      created_at: string
      created_by: string | null
      pregunta_id: string | null
    }
    const planes = (planesRaw ?? []) as PlanRow[]
    if (planes.length === 0) return { data: [] }

    const planIds = planes.map((p) => p.id)

    // 2) Responsables
    const { data: respRows } = await supabase
      .from("plan_responsables")
      .select("plan_id, profile_id")
      .in("plan_id", planIds)

    const profileIds = Array.from(
      new Set(
        ((respRows ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id)
      )
    )
    const creadorIds = planes
      .map((p) => p.created_by)
      .filter((id): id is string => !!id)
    const allProfileIds = Array.from(new Set([...profileIds, ...creadorIds]))

    const { data: profilesRows } = allProfileIds.length
      ? await supabase
          .from("profiles")
          .select("id, nombre")
          .in("id", allProfileIds)
      : { data: [] as Array<{ id: string; nombre: string }> }

    const profileMap = new Map(
      ((profilesRows ?? []) as Array<{ id: string; nombre: string }>).map((p) => [
        p.id,
        p.nombre,
      ])
    )

    const respByPlan = new Map<string, Array<{ profile_id: string; nombre: string }>>()
    for (const r of (respRows ?? []) as Array<{
      plan_id: string
      profile_id: string
    }>) {
      const arr = respByPlan.get(r.plan_id) ?? []
      arr.push({
        profile_id: r.profile_id,
        nombre: profileMap.get(r.profile_id) ?? "—",
      })
      respByPlan.set(r.plan_id, arr)
    }

    // 3) Preguntas / bloques / pilares (con filtros pilarId/bloqueId)
    const preguntaIds = Array.from(
      new Set(planes.map((p) => p.pregunta_id).filter((id): id is string => !!id))
    )

    const { data: preguntasRows } = preguntaIds.length
      ? await supabase
          .from("preguntas")
          .select("id, numero, texto, bloque_id")
          .in("id", preguntaIds)
      : {
          data: [] as Array<{
            id: string
            numero: string
            texto: string
            bloque_id: string
          }>,
        }

    const preguntaMap = new Map(
      ((preguntasRows ?? []) as Array<{
        id: string
        numero: string
        texto: string
        bloque_id: string
      }>).map((p) => [p.id, p])
    )

    const bloqueIds = Array.from(
      new Set(
        ((preguntasRows ?? []) as Array<{ bloque_id: string }>).map((p) => p.bloque_id)
      )
    )
    const { data: bloquesRows } = bloqueIds.length
      ? await supabase
          .from("bloques")
          .select("id, nombre, pilar_id")
          .in("id", bloqueIds)
      : {
          data: [] as Array<{ id: string; nombre: string; pilar_id: string }>,
        }

    const bloqueMap = new Map(
      ((bloquesRows ?? []) as Array<{
        id: string
        nombre: string
        pilar_id: string
      }>).map((b) => [b.id, b])
    )

    const pilarIds = Array.from(
      new Set(
        ((bloquesRows ?? []) as Array<{ pilar_id: string }>).map((b) => b.pilar_id)
      )
    )
    const { data: pilaresRows } = pilarIds.length
      ? await supabase
          .from("pilares")
          .select("id, nombre, color")
          .in("id", pilarIds)
      : {
          data: [] as Array<{ id: string; nombre: string; color: string }>,
        }

    const pilarMap = new Map(
      ((pilaresRows ?? []) as Array<{
        id: string
        nombre: string
        color: string
      }>).map((p) => [p.id, p])
    )

    // 4) Conteo de evidencias por plan
    const { data: evLinks } = await supabase
      .from("evidencia_planes")
      .select("plan_id")
      .in("plan_id", planIds)

    const evCount = new Map<string, number>()
    for (const r of (evLinks ?? []) as Array<{ plan_id: string }>) {
      evCount.set(r.plan_id, (evCount.get(r.plan_id) ?? 0) + 1)
    }

    // 5) Construir items + filtros que requieren joins
    let items: RegistroTareaItem[] = planes.map((plan) => {
      const pregunta = plan.pregunta_id ? preguntaMap.get(plan.pregunta_id) : undefined
      const bloque = pregunta ? bloqueMap.get(pregunta.bloque_id) : undefined
      const pilar = bloque ? pilarMap.get(bloque.pilar_id) : undefined

      return {
        id: plan.id,
        titulo: plan.titulo,
        descripcion: plan.descripcion,
        estado: plan.estado,
        prioridad: plan.prioridad,
        fecha_limite: plan.fecha_limite,
        evidencia_obligatoria: plan.evidencia_obligatoria,
        created_at: plan.created_at,
        created_by: plan.created_by,
        creador_nombre: plan.created_by
          ? profileMap.get(plan.created_by) ?? "—"
          : "—",
        responsables: respByPlan.get(plan.id) ?? [],
        pregunta_id: plan.pregunta_id,
        pregunta_numero: pregunta?.numero ?? null,
        pregunta_texto: pregunta?.texto ?? null,
        bloque_nombre: bloque?.nombre ?? null,
        pilar_id: bloque?.pilar_id ?? null,
        pilar_nombre: pilar?.nombre ?? null,
        pilar_color: pilar?.color ?? null,
        evidencias_count: evCount.get(plan.id) ?? 0,
        origen: "manual",
        origen_detalle: null,
        origen_reunion_id: null,
        href: `/planes/${plan.id}`,
      }
    })

    // Filtros post-join
    if (filtros.pilarId) {
      items = items.filter((t) => t.pilar_id === filtros.pilarId)
    }
    if (filtros.bloqueId) {
      const bloque = bloqueMap.get(filtros.bloqueId)
      if (bloque) {
        items = items.filter((t) => {
          const preg = t.pregunta_id ? preguntaMap.get(t.pregunta_id) : undefined
          return preg?.bloque_id === filtros.bloqueId
        })
      } else {
        items = []
      }
    }
    if (filtros.responsableId) {
      items = items.filter((t) =>
        t.responsables.some((r) => r.profile_id === filtros.responsableId)
      )
    }
    if (filtros.query && filtros.query.trim().length > 0) {
      const q = filtros.query.trim().toLowerCase()
      items = items.filter(
        (t) =>
          (t.titulo ?? "").toLowerCase().includes(q) ||
          t.descripcion.toLowerCase().includes(q) ||
          (t.pregunta_numero ?? "").toLowerCase().includes(q) ||
          (t.pregunta_texto ?? "").toLowerCase().includes(q)
      )
    }

    return { data: items }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando registro",
    }
  }
}

// ============================================================
// Acciones 5S dentro del registro
// ============================================================

const ESTADO_S5_A_PLAN: Record<S5AccionEstado, EstadoPlan> = {
  no_comenzada: "pendiente",
  en_curso: "en_progreso",
  cerrada: "completado",
}

const ESTADO_PLAN_A_S5: Record<EstadoPlan, S5AccionEstado> = {
  pendiente: "no_comenzada",
  en_progreso: "en_curso",
  completado: "cerrada",
}

type Accion5SRow = {
  id: string
  tipo: "almacen" | "flota"
  sector_numero: number | null
  descripcion: string
  responsable_id: string | null
  fecha_compromiso: string | null
  estado: S5AccionEstado
  creado_por: string | null
  created_at: string
  origen_reunion_actividad_id: string | null
  vehiculo: { dominio: string } | null
  origen_actividad: { reunion_id: string } | null
  evidencias: { id: string }[] | null
}

/**
 * Filas del registro que salen de s5_acciones. Incluye las tres procedencias
 * del módulo: carga manual en /5s/acciones, espejo de una actividad de reunión
 * con destino 5S, y acción nacida de una auditoría 5S.
 *
 * Los filtros del manual (pilar / bloque / punto) no aplican acá: si alguno
 * viene seteado devolvemos vacío, porque el usuario está filtrando por una
 * dimensión que las acciones 5S no tienen.
 */
async function getAcciones5SItems(
  filtros: RegistroTareasFiltros = {}
): Promise<{ data: RegistroTareaItem[] } | { error: string }> {
  try {
    if (filtros.pilarId || filtros.bloqueId || filtros.preguntaId) {
      return { data: [] }
    }

    const supabase = await createClient()

    let q = supabase
      .from("s5_acciones")
      .select(
        `id, tipo, sector_numero, descripcion, responsable_id, fecha_compromiso,
         estado, creado_por, created_at, origen_reunion_actividad_id,
         vehiculo:catalogo_vehiculos!s5_acciones_vehiculo_id_fkey(dominio),
         origen_actividad:reuniones_actividades!s5_acciones_origen_reunion_actividad_id_fkey(reunion_id),
         evidencias:s5_acciones_evidencias(id)`
      )
      .order("created_at", { ascending: false })

    if (filtros.origen === "5s_almacen") q = q.eq("tipo", "almacen")
    if (filtros.origen === "5s_flota") q = q.eq("tipo", "flota")
    if (filtros.estado && filtros.estado !== "all") {
      q = q.eq("estado", ESTADO_PLAN_A_S5[filtros.estado])
    }
    if (filtros.fechaDesde) q = q.gte("created_at", filtros.fechaDesde)
    if (filtros.fechaHasta) q = q.lte("created_at", filtros.fechaHasta)
    if (filtros.responsableId) {
      q = q.eq("responsable_id", filtros.responsableId)
    }

    const { data, error } = await q
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Accion5SRow[]
    if (rows.length === 0) return { data: [] }

    // Nombres de sector (la tabla puede estar vacía: fallback "Sector N")
    const { data: sectoresRows } = await supabase
      .from("s5_sectores_almacen")
      .select("numero, nombre")

    const sectorMap = new Map(
      ((sectoresRows ?? []) as Array<{ numero: number; nombre: string }>).map(
        (s) => [s.numero, s.nombre]
      )
    )

    const profileIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.responsable_id, r.creado_por])
          .filter((id): id is string => !!id)
      )
    )
    const { data: profilesRows } = profileIds.length
      ? await supabase.from("profiles").select("id, nombre").in("id", profileIds)
      : { data: [] as Array<{ id: string; nombre: string }> }

    const profileMap = new Map(
      ((profilesRows ?? []) as Array<{ id: string; nombre: string }>).map(
        (p) => [p.id, p.nombre]
      )
    )

    let items: RegistroTareaItem[] = rows.map((r) => {
      const esAlmacen = r.tipo === "almacen"
      const detalle = esAlmacen
        ? r.sector_numero
          ? sectorMap.get(r.sector_numero) || `Sector ${r.sector_numero}`
          : null
        : r.vehiculo?.dominio ?? null

      return {
        id: r.id,
        titulo: null,
        descripcion: r.descripcion,
        estado: ESTADO_S5_A_PLAN[r.estado],
        prioridad: null,
        fecha_limite: r.fecha_compromiso,
        // Cerrar una acción 5S exige evidencia (lo valida cerrarAccion).
        evidencia_obligatoria: true,
        created_at: r.created_at,
        created_by: r.creado_por,
        creador_nombre: r.creado_por
          ? profileMap.get(r.creado_por) ?? "—"
          : "—",
        responsables: r.responsable_id
          ? [
              {
                profile_id: r.responsable_id,
                nombre: profileMap.get(r.responsable_id) ?? "—",
              },
            ]
          : [],
        pregunta_id: null,
        pregunta_numero: null,
        pregunta_texto: null,
        bloque_nombre: null,
        pilar_id: null,
        pilar_nombre: null,
        pilar_color: null,
        evidencias_count: r.evidencias?.length ?? 0,
        origen: esAlmacen ? "5s_almacen" : "5s_flota",
        origen_detalle: detalle,
        origen_reunion_id: r.origen_actividad?.reunion_id ?? null,
        href: esAlmacen ? "/5s/acciones/almacen" : "/5s/acciones/flota",
      }
    })

    if (filtros.query && filtros.query.trim().length > 0) {
      const qs = filtros.query.trim().toLowerCase()
      items = items.filter(
        (t) =>
          t.descripcion.toLowerCase().includes(qs) ||
          (t.origen_detalle ?? "").toLowerCase().includes(qs)
      )
    }

    return { data: items }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando acciones 5S",
    }
  }
}

// ============================================================
// Registro de tareas: manual DPO + 5S en una sola lista
// ============================================================

export async function getRegistroTareasDirectas(
  filtros: RegistroTareasFiltros = {}
): Promise<{ data: RegistroTareaItem[] } | { error: string }> {
  const origen = filtros.origen ?? "all"
  const vacio = { data: [] as RegistroTareaItem[] }

  const [directas, acciones] = await Promise.all([
    origen === "all" || origen === "manual"
      ? getTareasDirectasItems(filtros)
      : Promise.resolve(vacio),
    origen === "all" || origen === "5s_almacen" || origen === "5s_flota"
      ? getAcciones5SItems(filtros)
      : Promise.resolve(vacio),
  ])

  if ("error" in directas) return directas
  if ("error" in acciones) return acciones

  const items = [...directas.data, ...acciones.data].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  )

  return { data: items }
}

// ============================================================
// Pilares + bloques para los filtros del registro
// ============================================================

export async function getPilaresParaFiltro(): Promise<
  Array<{ id: string; nombre: string; color: string }>
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("pilares")
    .select("id, nombre, color")
    .order("orden", { ascending: true })
  return (data ?? []) as Array<{ id: string; nombre: string; color: string }>
}

export async function getBloquesParaFiltro(
  pilarId?: string
): Promise<Array<{ id: string; nombre: string; pilar_id: string }>> {
  const supabase = await createClient()
  let q = supabase
    .from("bloques")
    .select("id, nombre, pilar_id")
    .order("orden", { ascending: true })

  if (pilarId) q = q.eq("pilar_id", pilarId)

  const { data } = await q
  return (data ?? []) as Array<{ id: string; nombre: string; pilar_id: string }>
}
