"use server"

import { createClient } from "@/lib/supabase/server"

// ============================================================
// Capa de lectura unificada de planes de TODOS los módulos.
//
// Cada módulo de la app guarda sus planes de acción en su propia tabla
// (nps_planes, rechazos_planes, owd_planes, roturas_calle_planes,
// s5_acciones) además de los planes "genéricos" (planes_accion). Esta
// función los lee a todos y los normaliza a un mismo shape para poder
// mostrarlos juntos en el tablero general de /planes y, más adelante, en
// la vista personal de cada responsable.
//
// Fase 1: solo los orígenes que YA tienen responsable (o que ya viven en
// planes_accion). Los planes "de proceso" sin responsable (TML, Tiempo
// Interno, Períodos Críticos, Seguridad) se suman en una fase posterior,
// una vez que se les agregue la columna responsable_id.
// ============================================================

export type PlanOrigen =
  | "plan_accion"
  | "nps"
  | "rechazos"
  | "owd"
  | "roturas"
  | "s5"
  | "tlp"

export type EstadoUnificado = "no_comenzada" | "en_curso" | "cerrada"

export interface PlanUnificado {
  origen: PlanOrigen
  origen_label: string
  id: string
  titulo: string
  descripcion: string | null
  estado_unificado: EstadoUnificado
  fecha_limite: string | null
  is_overdue: boolean
  prioridad: "alta" | "media" | "baja" | null
  responsable_id: string | null
  responsable_nombre: string | null
  href: string
  created_at: string
}

const ORIGEN_LABEL: Record<PlanOrigen, string> = {
  plan_accion: "Plan de acción",
  nps: "NPS",
  rechazos: "Rechazos",
  owd: "OWD",
  roturas: "Roturas en calle",
  s5: "5S",
  tlp: "TLP",
}

/** Mapea los distintos vocabularios de estado a uno solo de 3 valores. */
function mapEstado(e: string | null | undefined): EstadoUnificado {
  switch (e) {
    case "completado":
    case "cerrada":
      return "cerrada"
    case "en_progreso":
    case "en_curso":
      return "en_curso"
    default:
      // 'pendiente' | 'no_comenzada' | null
      return "no_comenzada"
  }
}

function calcOverdue(
  fecha: string | null,
  estado: EstadoUnificado,
  hoyISO: string
): boolean {
  if (!fecha || estado === "cerrada") return false
  return fecha < hoyISO
}

type PrioridadUnif = "alta" | "media" | "baja" | null
function normPrioridad(p: string | null | undefined): PrioridadUnif {
  return p === "alta" || p === "media" || p === "baja" ? p : null
}

/**
 * Resuelve el nombre del pilar (pregunta → bloque → pilar) para cada plan de
 * auditoría, así el chip indica de qué módulo/área es. Hace 3 queries en lote.
 */
async function resolvePilarPorPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planRows: Array<{ id: string; pregunta_id: string | null }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const preguntaIds = Array.from(
    new Set(planRows.map((p) => p.pregunta_id).filter((x): x is string => !!x))
  )
  if (preguntaIds.length === 0) return result

  const { data: preguntas } = await supabase
    .from("preguntas")
    .select("id, bloque_id")
    .in("id", preguntaIds)
  const bloqueByPregunta = new Map<string, string>()
  for (const q of (preguntas ?? []) as Array<{ id: string; bloque_id: string }>) {
    bloqueByPregunta.set(q.id, q.bloque_id)
  }

  const bloqueIds = Array.from(new Set(bloqueByPregunta.values()))
  if (bloqueIds.length === 0) return result
  const { data: bloques } = await supabase
    .from("bloques")
    .select("id, pilar_id")
    .in("id", bloqueIds)
  const pilarByBloque = new Map<string, string>()
  for (const b of (bloques ?? []) as Array<{ id: string; pilar_id: string }>) {
    pilarByBloque.set(b.id, b.pilar_id)
  }

  const pilarIds = Array.from(new Set(pilarByBloque.values()))
  if (pilarIds.length === 0) return result
  const { data: pilares } = await supabase
    .from("pilares")
    .select("id, nombre")
    .in("id", pilarIds)
  const nombreByPilar = new Map<string, string>()
  for (const pil of (pilares ?? []) as Array<{ id: string; nombre: string }>) {
    nombreByPilar.set(pil.id, pil.nombre)
  }

  for (const p of planRows) {
    if (!p.pregunta_id) continue
    const bloqueId = bloqueByPregunta.get(p.pregunta_id)
    const pilarId = bloqueId ? pilarByBloque.get(bloqueId) : undefined
    const nombre = pilarId ? nombreByPilar.get(pilarId) : undefined
    if (nombre) result.set(p.id, nombre)
  }
  return result
}

/**
 * Lee todos los planes de todos los módulos y los normaliza.
 * @param opts.responsableId  si se pasa, devuelve sólo los planes de esa
 *                            persona (vista personal). Si no, devuelve todos
 *                            (tablero general).
 */
export async function getPlanesUnificados(opts?: {
  responsableId?: string
}): Promise<{ data: PlanUnificado[] } | { error: string }> {
  try {
    const supabase = await createClient()
    const hoyISO = new Date().toISOString().slice(0, 10)
    const soloMios = opts?.responsableId ?? null

    // El tablero general muestra SÓLO los planes cuyo responsable es un
    // administrador (decisión Leonardo 2026-06-24): los planes de los
    // operarios/empleados se gestionan en sus módulos, acá interesa el
    // seguimiento de los responsables. La vista personal (soloMios) no
    // aplica este filtro: ahí ya se pide un responsable puntual.
    const adminIds = new Set<string>()
    if (!soloMios) {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
      for (const a of (admins ?? []) as Array<{ id: string }>) {
        adminIds.add(a.id)
      }
    }

    const items: PlanUnificado[] = []
    // Acumulamos los profile_id a resolver al final, en un solo query.
    const profileIds = new Set<string>()

    // ---- 1) planes_accion: SÓLO auditorías ----
    // Las tareas directas (tipo='directa') que los auxiliares cargan a los
    // operarios NO son planes de acción: van a "Mis Tareas", no a este tablero.
    {
      const { data: rows, error } = await supabase
        .from("planes_accion")
        .select(
          "id, titulo, descripcion, estado, prioridad, fecha_limite, created_at, pregunta_id"
        )
        .neq("tipo", "directa")
        .order("created_at", { ascending: false })
      if (error) return { error: error.message }

      const planRows = (rows ?? []) as Array<{
        id: string
        titulo: string | null
        descripcion: string
        estado: string
        prioridad: string | null
        fecha_limite: string | null
        created_at: string
        pregunta_id: string | null
      }>

      // Responsable principal de cada plan
      const ids = planRows.map((p) => p.id)
      const { data: respRows } = ids.length
        ? await supabase
            .from("plan_responsables")
            .select("plan_id, profile_id, rol")
            .in("plan_id", ids)
        : { data: [] as Array<{ plan_id: string; profile_id: string; rol: string }> }

      const principalByPlan = new Map<string, string>()
      for (const r of (respRows ?? []) as Array<{
        plan_id: string
        profile_id: string
        rol: string
      }>) {
        if (r.rol === "responsable_principal" || !principalByPlan.has(r.plan_id)) {
          principalByPlan.set(r.plan_id, r.profile_id)
        }
      }

      // Pilar de origen (pregunta → bloque → pilar) para etiquetar de qué
      // módulo/área es cada auditoría.
      const pilarByPlan = await resolvePilarPorPlan(supabase, planRows)

      for (const p of planRows) {
        const respId = principalByPlan.get(p.id) ?? null
        if (soloMios && respId !== soloMios) continue
        if (respId) profileIds.add(respId)
        const estado = mapEstado(p.estado)
        const pilar = pilarByPlan.get(p.id)
        items.push({
          origen: "plan_accion",
          origen_label: pilar ? `Auditoría · ${pilar}` : "Auditoría",
          id: p.id,
          titulo: p.titulo || p.descripcion,
          descripcion: p.descripcion,
          estado_unificado: estado,
          fecha_limite: p.fecha_limite,
          is_overdue: calcOverdue(p.fecha_limite, estado, hoyISO),
          prioridad: normPrioridad(p.prioridad),
          responsable_id: respId,
          responsable_nombre: null,
          href: `/planes/${p.id}`,
          created_at: p.created_at,
        })
      }
    }

    // ---- 2/3/4) nps_planes, rechazos_planes, owd_planes (shape común) ----
    const comunes: Array<{
      origen: PlanOrigen
      tabla: string
      href: string
    }> = [
      { origen: "nps", tabla: "nps_planes", href: "/nps" },
      { origen: "rechazos", tabla: "rechazos_planes", href: "/indicadores/rechazos" },
      { origen: "owd", tabla: "owd_planes", href: "/owd" },
      { origen: "tlp", tabla: "tlp_planes", href: "/indicadores/tlp" },
    ]

    for (const cfg of comunes) {
      let q = supabase
        .from(cfg.tabla)
        .select(
          "id, titulo, descripcion, estado, prioridad, responsable_id, fecha_objetivo, created_at"
        )
        .order("created_at", { ascending: false })
      if (soloMios) q = q.eq("responsable_id", soloMios)

      const { data: rows, error } = await q
      if (error) return { error: `${cfg.tabla}: ${error.message}` }

      for (const r of (rows ?? []) as Array<{
        id: string
        titulo: string
        descripcion: string | null
        estado: string
        prioridad: string | null
        responsable_id: string | null
        fecha_objetivo: string | null
        created_at: string
      }>) {
        if (r.responsable_id) profileIds.add(r.responsable_id)
        const estado = mapEstado(r.estado)
        items.push({
          origen: cfg.origen,
          origen_label: ORIGEN_LABEL[cfg.origen],
          id: r.id,
          titulo: r.titulo,
          descripcion: r.descripcion,
          estado_unificado: estado,
          fecha_limite: r.fecha_objetivo,
          is_overdue: calcOverdue(r.fecha_objetivo, estado, hoyISO),
          prioridad: normPrioridad(r.prioridad),
          responsable_id: r.responsable_id,
          responsable_nombre: null,
          href: cfg.href,
          created_at: r.created_at,
        })
      }
    }

    // ---- 5) s5_acciones (responsable_id UUID, estado ya unificado) ----
    {
      let q = supabase
        .from("s5_acciones")
        .select(
          "id, descripcion, estado, responsable_id, fecha_compromiso, created_at"
        )
        .order("created_at", { ascending: false })
      if (soloMios) q = q.eq("responsable_id", soloMios)

      const { data: rows, error } = await q
      if (error) return { error: `s5_acciones: ${error.message}` }

      for (const r of (rows ?? []) as Array<{
        id: string
        descripcion: string
        estado: string
        responsable_id: string | null
        fecha_compromiso: string | null
        created_at: string
      }>) {
        if (r.responsable_id) profileIds.add(r.responsable_id)
        const estado = mapEstado(r.estado)
        items.push({
          origen: "s5",
          origen_label: ORIGEN_LABEL.s5,
          id: r.id,
          titulo: r.descripcion,
          descripcion: r.descripcion,
          estado_unificado: estado,
          fecha_limite: r.fecha_compromiso,
          is_overdue: calcOverdue(r.fecha_compromiso, estado, hoyISO),
          prioridad: null,
          responsable_id: r.responsable_id,
          responsable_nombre: null,
          href: "/5s/acciones",
          created_at: r.created_at,
        })
      }
    }

    // ---- 6) roturas_calle_planes (responsable es TEXTO libre, sin estado) ----
    // Como el responsable no es un profile, en la vista personal (soloMios)
    // no podemos cruzarlo por id: lo dejamos sólo en el tablero general.
    if (!soloMios) {
      const { data: rows, error } = await supabase
        .from("roturas_calle_planes")
        .select(
          "id, descripcion, responsable, fecha_planificada, fecha_completado, created_at"
        )
        .order("created_at", { ascending: false })
      if (error) return { error: `roturas_calle_planes: ${error.message}` }

      for (const r of (rows ?? []) as Array<{
        id: string
        descripcion: string
        responsable: string | null
        fecha_planificada: string | null
        fecha_completado: string | null
        created_at: string
      }>) {
        const estado: EstadoUnificado = r.fecha_completado
          ? "cerrada"
          : "no_comenzada"
        items.push({
          origen: "roturas",
          origen_label: ORIGEN_LABEL.roturas,
          id: r.id,
          titulo: r.descripcion,
          descripcion: r.descripcion,
          estado_unificado: estado,
          fecha_limite: r.fecha_planificada,
          is_overdue: calcOverdue(r.fecha_planificada, estado, hoyISO),
          prioridad: null,
          responsable_id: null,
          responsable_nombre: r.responsable?.trim() || null,
          href: "/mis-roturas",
          created_at: r.created_at,
        })
      }
    }

    // En el tablero general, dejar sólo los planes de responsables admin.
    // (roturas_calle_planes tiene responsable de texto libre / sin profile,
    // por lo que queda fuera de esta vista.)
    const visibles = soloMios
      ? items
      : items.filter((it) => it.responsable_id && adminIds.has(it.responsable_id))

    // ---- Resolver nombres de responsables en un solo query ----
    if (profileIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nombre")
        .in("id", Array.from(profileIds))

      const nameById = new Map<string, string>()
      for (const p of (profiles ?? []) as Array<{ id: string; nombre: string }>) {
        nameById.set(p.id, p.nombre)
      }
      for (const it of visibles) {
        if (it.responsable_id) {
          it.responsable_nombre = nameById.get(it.responsable_id) ?? "—"
        }
      }
    }

    // ---- Orden global: vencidos primero, luego por fecha límite asc (NULLS last),
    //      cerradas al final ----
    visibles.sort((a, b) => {
      const aDone = a.estado_unificado === "cerrada"
      const bDone = b.estado_unificado === "cerrada"
      if (aDone !== bDone) return aDone ? 1 : -1
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1
      if (a.fecha_limite && !b.fecha_limite) return -1
      if (!a.fecha_limite && b.fecha_limite) return 1
      if (a.fecha_limite && b.fecha_limite) {
        const cmp = a.fecha_limite.localeCompare(b.fecha_limite)
        if (cmp !== 0) return cmp
      }
      return b.created_at.localeCompare(a.created_at)
    })

    return { data: visibles }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando planes unificados",
    }
  }
}
