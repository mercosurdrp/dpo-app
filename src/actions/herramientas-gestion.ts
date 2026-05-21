"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  HerramientaGestion,
  HerramientaGestionConContexto,
  HerramientaGestionContenido,
  HerramientaGestionTipo,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

// ---------------------------------------------------------------------------
// Helpers (copiados de plan-avances.ts)
// ---------------------------------------------------------------------------

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

async function puedeIntervenirEnPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  profileRole: string,
  planId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isEditorRole(profileRole)) return { ok: true }

  const { data: plan, error: planErr } = await supabase
    .from("planes_accion")
    .select("created_by")
    .eq("id", planId)
    .single()
  if (planErr || !plan) {
    return { ok: false, error: planErr?.message ?? "Plan no encontrado" }
  }
  if ((plan as { created_by: string | null }).created_by === profileId) {
    return { ok: true }
  }

  const { data: resp } = await supabase
    .from("plan_responsables")
    .select("id")
    .eq("plan_id", planId)
    .eq("profile_id", profileId)
    .maybeSingle()
  if (resp) return { ok: true }

  return {
    ok: false,
    error: "Solo responsables del plan o editores pueden gestionar herramientas",
  }
}

// ---------------------------------------------------------------------------
// Join chain: planes_accion → preguntas → bloques → pilares
// Devuelve { plan_titulo, plan_pregunta_numero, plan_pilar_nombre }
// Si algún join falla, devuelve null en ese campo pero no rompe.
// ---------------------------------------------------------------------------

interface PlanContexto {
  plan_titulo: string | null
  plan_pregunta_numero: number | null
  plan_pilar_nombre: string | null
}

async function getPlanContexto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<PlanContexto> {
  const { data: plan } = await supabase
    .from("planes_accion")
    .select("titulo, descripcion, pregunta_id")
    .eq("id", planId)
    .single()

  if (!plan) {
    return { plan_titulo: null, plan_pregunta_numero: null, plan_pilar_nombre: null }
  }

  const p = plan as {
    titulo: string | null
    descripcion: string | null
    pregunta_id: string | null
  }

  const plan_titulo = p.titulo ?? p.descripcion ?? null

  if (!p.pregunta_id) {
    return { plan_titulo, plan_pregunta_numero: null, plan_pilar_nombre: null }
  }

  const { data: pregunta } = await supabase
    .from("preguntas")
    .select("numero, bloque_id")
    .eq("id", p.pregunta_id)
    .single()

  if (!pregunta) {
    return { plan_titulo, plan_pregunta_numero: null, plan_pilar_nombre: null }
  }

  const preg = pregunta as { numero: string | number | null; bloque_id: string }
  const plan_pregunta_numero =
    preg.numero != null ? Number(preg.numero) : null

  const { data: bloque } = await supabase
    .from("bloques")
    .select("pilar_id")
    .eq("id", preg.bloque_id)
    .single()

  if (!bloque) {
    return { plan_titulo, plan_pregunta_numero, plan_pilar_nombre: null }
  }

  const { data: pilar } = await supabase
    .from("pilares")
    .select("nombre")
    .eq("id", (bloque as { pilar_id: string }).pilar_id)
    .single()

  return {
    plan_titulo,
    plan_pregunta_numero,
    plan_pilar_nombre: pilar ? (pilar as { nombre: string }).nombre : null,
  }
}

// ---------------------------------------------------------------------------
// Map a raw DB row + contexto → HerramientaGestionConContexto
// ---------------------------------------------------------------------------

function mapRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  ctx: PlanContexto,
  autorNombre: string | null,
): HerramientaGestionConContexto {
  return {
    id: row.id,
    plan_id: row.plan_id,
    tipo: row.tipo as HerramientaGestionTipo,
    titulo: row.titulo ?? "",
    contenido: row.contenido as HerramientaGestionContenido,
    pdf_path: row.pdf_path ?? null,
    autor_id: row.autor_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    autor_nombre: autorNombre,
    plan_titulo: ctx.plan_titulo,
    plan_pregunta_numero: ctx.plan_pregunta_numero,
    plan_pilar_nombre: ctx.plan_pilar_nombre,
  }
}

// ---------------------------------------------------------------------------
// crearHerramientaGestion
// ---------------------------------------------------------------------------

export async function crearHerramientaGestion(
  planId: string,
  tipo: HerramientaGestionTipo,
  titulo: string,
  contenido: HerramientaGestionContenido,
): Promise<Result<HerramientaGestion>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!planId) return { error: "ID de plan inválido" }

    const permiso = await puedeIntervenirEnPlan(
      supabase,
      profile.id,
      profile.role,
      planId,
    )
    if (!permiso.ok) return { error: permiso.error }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .insert({
        plan_id: planId,
        tipo,
        titulo: titulo.trim() || null,
        contenido,
        autor_id: profile.id,
      })
      .select("*")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "No se pudo crear la herramienta" }
    }

    revalidatePath(`/planes/${planId}`)
    revalidatePath("/herramientas-gestion")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    return {
      data: {
        id: row.id,
        plan_id: row.plan_id,
        tipo: row.tipo as HerramientaGestionTipo,
        titulo: row.titulo ?? "",
        contenido: row.contenido as HerramientaGestionContenido,
        pdf_path: row.pdf_path ?? null,
        autor_id: row.autor_id ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando la herramienta",
    }
  }
}

// ---------------------------------------------------------------------------
// actualizarHerramientaGestion
// ---------------------------------------------------------------------------

export async function actualizarHerramientaGestion(
  id: string,
  titulo: string,
  contenido: HerramientaGestionContenido,
): Promise<Result<HerramientaGestion>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!id) return { error: "ID de herramienta inválido" }

    // Traer el plan_id primero
    const { data: herramienta, error: errH } = await supabase
      .from("plan_herramientas_gestion")
      .select("plan_id")
      .eq("id", id)
      .single()
    if (errH || !herramienta) {
      return { error: errH?.message ?? "Herramienta no encontrada" }
    }
    const planId = (herramienta as { plan_id: string }).plan_id

    const permiso = await puedeIntervenirEnPlan(
      supabase,
      profile.id,
      profile.role,
      planId,
    )
    if (!permiso.ok) return { error: permiso.error }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .update({
        titulo: titulo.trim() || null,
        contenido,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "No se pudo actualizar la herramienta" }
    }

    revalidatePath(`/planes/${planId}`)
    revalidatePath("/herramientas-gestion")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    return {
      data: {
        id: row.id,
        plan_id: row.plan_id,
        tipo: row.tipo as HerramientaGestionTipo,
        titulo: row.titulo ?? "",
        contenido: row.contenido as HerramientaGestionContenido,
        pdf_path: row.pdf_path ?? null,
        autor_id: row.autor_id ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando la herramienta",
    }
  }
}

// ---------------------------------------------------------------------------
// listarHerramientasPlan
// ---------------------------------------------------------------------------

export async function listarHerramientasPlan(
  planId: string,
): Promise<Result<HerramientaGestionConContexto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .select("*, autor:profiles!plan_herramientas_gestion_autor_id_fkey(id, nombre)")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    const ctx = await getPlanContexto(supabase, planId)

    const items: HerramientaGestionConContexto[] = (
      (data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const autorNombre = r.autor?.nombre ?? null
      return mapRow(r, ctx, autorNombre)
    })

    return { data: items }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando herramientas del plan",
    }
  }
}

// ---------------------------------------------------------------------------
// listarHerramientasGestion
// ---------------------------------------------------------------------------

export async function listarHerramientasGestion(
  tipo?: HerramientaGestionTipo,
): Promise<Result<HerramientaGestionConContexto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("plan_herramientas_gestion")
      .select("*, autor:profiles!plan_herramientas_gestion_autor_id_fkey(id, nombre)")
      .order("created_at", { ascending: false })

    if (tipo) {
      query = query.eq("tipo", tipo)
    }

    const { data, error } = await query

    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>

    // Collect unique plan_ids and resolve contexts in batch (one query each)
    const planIds = Array.from(new Set(rows.map((r) => (r as { plan_id: string }).plan_id)))

    const ctxMap = new Map<string, PlanContexto>()
    await Promise.all(
      planIds.map(async (pid) => {
        const ctx = await getPlanContexto(supabase, pid)
        ctxMap.set(pid, ctx)
      }),
    )

    const items: HerramientaGestionConContexto[] = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const ctx = ctxMap.get(r.plan_id) ?? {
        plan_titulo: null,
        plan_pregunta_numero: null,
        plan_pilar_nombre: null,
      }
      const autorNombre = r.autor?.nombre ?? null
      return mapRow(r, ctx, autorNombre)
    })

    return { data: items }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando herramientas de gestión",
    }
  }
}

// ---------------------------------------------------------------------------
// getHerramientaGestion
// ---------------------------------------------------------------------------

export async function getHerramientaGestion(
  id: string,
): Promise<Result<HerramientaGestionConContexto>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!id) return { error: "ID de herramienta inválido" }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .select("*, autor:profiles!plan_herramientas_gestion_autor_id_fkey(id, nombre)")
      .eq("id", id)
      .single()

    if (error || !data) {
      return { error: error?.message ?? "Herramienta no encontrada" }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any
    const ctx = await getPlanContexto(supabase, r.plan_id)
    const autorNombre = r.autor?.nombre ?? null

    return { data: mapRow(r, ctx, autorNombre) }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando la herramienta",
    }
  }
}

// ---------------------------------------------------------------------------
// eliminarHerramientaGestion
// ---------------------------------------------------------------------------

export async function eliminarHerramientaGestion(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!id) return { ok: false, error: "ID de herramienta inválido" }

    // Traer plan_id y autor_id
    const { data: herramienta, error: errH } = await supabase
      .from("plan_herramientas_gestion")
      .select("plan_id, autor_id")
      .eq("id", id)
      .single()
    if (errH || !herramienta) {
      return { ok: false, error: errH?.message ?? "Herramienta no encontrada" }
    }

    const row = herramienta as { plan_id: string; autor_id: string | null }

    // DELETE policy: autor o admin/supervisor/admin_rrhh
    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return {
        ok: false,
        error: "Solo el autor o un editor puede eliminar esta herramienta",
      }
    }

    const { error: errDel } = await supabase
      .from("plan_herramientas_gestion")
      .delete()
      .eq("id", id)
    if (errDel) return { ok: false, error: errDel.message }

    revalidatePath(`/planes/${row.plan_id}`)
    revalidatePath("/herramientas-gestion")

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error eliminando la herramienta",
    }
  }
}
