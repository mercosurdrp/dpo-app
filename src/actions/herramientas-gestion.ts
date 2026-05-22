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
import { generarPdfHerramienta } from "@/lib/herramientas-gestion-pdf"

type Result<T> = { data: T } | { error: string }

const PDF_BUCKET = "plan-herramientas"

// ---------------------------------------------------------------------------
// Permisos (mismo criterio que plan-avances.ts / reuniones.ts)
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

async function puedeIntervenirEnActividad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  profileRole: string,
  actividadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isEditorRole(profileRole)) return { ok: true }

  const { data: act, error: actErr } = await supabase
    .from("reuniones_actividades")
    .select("responsable_id")
    .eq("id", actividadId)
    .single()
  if (actErr || !act) {
    return { ok: false, error: actErr?.message ?? "Actividad no encontrada" }
  }
  if ((act as { responsable_id: string | null }).responsable_id === profileId) {
    return { ok: true }
  }

  return {
    ok: false,
    error: "Solo el responsable de la actividad o editores pueden gestionar herramientas",
  }
}

// ---------------------------------------------------------------------------
// Contexto del target (plan → pilar/pregunta · actividad → reunión)
// ---------------------------------------------------------------------------

interface Contexto {
  plan_titulo: string | null
  plan_pregunta_numero: number | null
  plan_pilar_nombre: string | null
  reunion_id: string | null
  reunion_tipo: string | null
  actividad_descripcion: string | null
}

const CONTEXTO_VACIO: Contexto = {
  plan_titulo: null,
  plan_pregunta_numero: null,
  plan_pilar_nombre: null,
  reunion_id: null,
  reunion_tipo: null,
  actividad_descripcion: null,
}

// Cadena plan → pregunta → bloque → pilar. Falla suave (null) en cada eslabón.
async function getPlanContexto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<Contexto> {
  const { data: plan } = await supabase
    .from("planes_accion")
    .select("titulo, descripcion, pregunta_id")
    .eq("id", planId)
    .single()
  if (!plan) return { ...CONTEXTO_VACIO }

  const p = plan as {
    titulo: string | null
    descripcion: string | null
    pregunta_id: string | null
  }
  const ctx: Contexto = { ...CONTEXTO_VACIO, plan_titulo: p.titulo ?? p.descripcion ?? null }
  if (!p.pregunta_id) return ctx

  const { data: pregunta } = await supabase
    .from("preguntas")
    .select("numero, bloque_id")
    .eq("id", p.pregunta_id)
    .single()
  if (!pregunta) return ctx

  const preg = pregunta as { numero: string | number | null; bloque_id: string }
  ctx.plan_pregunta_numero = preg.numero != null ? Number(preg.numero) : null

  const { data: bloque } = await supabase
    .from("bloques")
    .select("pilar_id")
    .eq("id", preg.bloque_id)
    .single()
  if (!bloque) return ctx

  const { data: pilar } = await supabase
    .from("pilares")
    .select("nombre")
    .eq("id", (bloque as { pilar_id: string }).pilar_id)
    .single()
  ctx.plan_pilar_nombre = pilar ? (pilar as { nombre: string }).nombre : null
  return ctx
}

async function getActividadContexto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actividadId: string,
): Promise<Contexto> {
  const { data: act } = await supabase
    .from("reuniones_actividades")
    .select(
      "descripcion, reunion_id, reunion:reuniones!reuniones_actividades_reunion_id_fkey(id, tipo)",
    )
    .eq("id", actividadId)
    .single()
  if (!act) return { ...CONTEXTO_VACIO }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = act as any
  return {
    ...CONTEXTO_VACIO,
    actividad_descripcion: a.descripcion ?? null,
    reunion_id: a.reunion_id ?? a.reunion?.id ?? null,
    reunion_tipo: a.reunion?.tipo ?? null,
  }
}

async function getContexto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: { plan_id: string | null; reunion_actividad_id: string | null },
): Promise<Contexto> {
  if (row.plan_id) return getPlanContexto(supabase, row.plan_id)
  if (row.reunion_actividad_id)
    return getActividadContexto(supabase, row.reunion_actividad_id)
  return { ...CONTEXTO_VACIO }
}

function getNombre(p: unknown): string | null {
  return (p as { nombre?: string | null })?.nombre ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any, ctx: Contexto, autorNombre: string | null): HerramientaGestionConContexto {
  return {
    id: row.id,
    plan_id: row.plan_id ?? null,
    reunion_actividad_id: row.reunion_actividad_id ?? null,
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
    reunion_id: ctx.reunion_id,
    reunion_tipo: ctx.reunion_tipo,
    actividad_descripcion: ctx.actividad_descripcion,
  }
}

// Path a revalidar según el target.
function targetPath(ctx: Contexto, row: { plan_id: string | null }): string | null {
  if (row.plan_id) return `/planes/${row.plan_id}`
  if (ctx.reunion_id) return `/reuniones/${ctx.reunion_id}`
  return null
}

// Genera el PDF, lo sube al bucket y guarda pdf_path. No lanza.
async function generarYGuardarPdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  herramienta: HerramientaGestionConContexto,
): Promise<string | null> {
  try {
    const bytes = await generarPdfHerramienta(herramienta)
    const carpeta = herramienta.plan_id ?? herramienta.reunion_actividad_id ?? "otros"
    const path = `${carpeta}/${herramienta.id}.pdf`
    const { error: upErr } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(path, Buffer.from(bytes), {
        contentType: "application/pdf",
        upsert: true,
      })
    if (upErr) {
      console.error("[herramientas-gestion] upload PDF:", upErr.message)
      return null
    }
    await supabase
      .from("plan_herramientas_gestion")
      .update({ pdf_path: path })
      .eq("id", herramienta.id)
    return path
  } catch (e) {
    console.error("[herramientas-gestion] generar PDF:", e)
    return null
  }
}

// Inserta una fila (target ya armado), genera el PDF y devuelve la herramienta.
async function insertarHerramienta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fila: Record<string, unknown>,
  autorNombre: string | null,
): Promise<Result<HerramientaGestion>> {
  const { data, error } = await supabase
    .from("plan_herramientas_gestion")
    .insert(fila)
    .select("*")
    .single()
  if (error || !data) {
    return { error: error?.message ?? "No se pudo crear la herramienta" }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  const ctx = await getContexto(supabase, row)
  const conCtx = mapRow(row, ctx, autorNombre)
  const pdfPath = await generarYGuardarPdf(supabase, conCtx)

  revalidatePath("/herramientas-gestion")
  const path = targetPath(ctx, row)
  if (path) revalidatePath(path)

  return {
    data: {
      id: row.id,
      plan_id: row.plan_id ?? null,
      reunion_actividad_id: row.reunion_actividad_id ?? null,
      tipo: row.tipo as HerramientaGestionTipo,
      titulo: row.titulo ?? "",
      contenido: row.contenido as HerramientaGestionContenido,
      pdf_path: pdfPath ?? row.pdf_path ?? null,
      autor_id: row.autor_id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  }
}

// ---------------------------------------------------------------------------
// crearHerramientaGestion — target = plan
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

    const permiso = await puedeIntervenirEnPlan(supabase, profile.id, profile.role, planId)
    if (!permiso.ok) return { error: permiso.error }

    return insertarHerramienta(
      supabase,
      {
        plan_id: planId,
        tipo,
        titulo: titulo.trim() || null,
        contenido,
        autor_id: profile.id,
      },
      getNombre(profile),
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la herramienta" }
  }
}

// ---------------------------------------------------------------------------
// crearHerramientaActividad — target = actividad de reunión
// ---------------------------------------------------------------------------

export async function crearHerramientaActividad(
  actividadId: string,
  tipo: HerramientaGestionTipo,
  titulo: string,
  contenido: HerramientaGestionContenido,
): Promise<Result<HerramientaGestion>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!actividadId) return { error: "ID de actividad inválido" }

    const permiso = await puedeIntervenirEnActividad(
      supabase,
      profile.id,
      profile.role,
      actividadId,
    )
    if (!permiso.ok) return { error: permiso.error }

    return insertarHerramienta(
      supabase,
      {
        reunion_actividad_id: actividadId,
        tipo,
        titulo: titulo.trim() || null,
        contenido,
        autor_id: profile.id,
      },
      getNombre(profile),
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la herramienta" }
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

    const { data: actual, error: errH } = await supabase
      .from("plan_herramientas_gestion")
      .select("plan_id, reunion_actividad_id")
      .eq("id", id)
      .single()
    if (errH || !actual) {
      return { error: errH?.message ?? "Herramienta no encontrada" }
    }
    const tgt = actual as { plan_id: string | null; reunion_actividad_id: string | null }

    const permiso = tgt.plan_id
      ? await puedeIntervenirEnPlan(supabase, profile.id, profile.role, tgt.plan_id)
      : await puedeIntervenirEnActividad(
          supabase,
          profile.id,
          profile.role,
          tgt.reunion_actividad_id!,
        )
    if (!permiso.ok) return { error: permiso.error }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .update({ titulo: titulo.trim() || null, contenido, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single()
    if (error || !data) {
      return { error: error?.message ?? "No se pudo actualizar la herramienta" }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    const ctx = await getContexto(supabase, row)
    const conCtx = mapRow(row, ctx, getNombre(profile))
    const pdfPath = await generarYGuardarPdf(supabase, conCtx)

    revalidatePath("/herramientas-gestion")
    const path = targetPath(ctx, row)
    if (path) revalidatePath(path)

    return {
      data: {
        id: row.id,
        plan_id: row.plan_id ?? null,
        reunion_actividad_id: row.reunion_actividad_id ?? null,
        tipo: row.tipo as HerramientaGestionTipo,
        titulo: row.titulo ?? "",
        contenido: row.contenido as HerramientaGestionContenido,
        pdf_path: pdfPath ?? row.pdf_path ?? null,
        autor_id: row.autor_id ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error actualizando la herramienta" }
  }
}

// ---------------------------------------------------------------------------
// Listados
// ---------------------------------------------------------------------------

const SELECT_CON_AUTOR =
  "*, autor:profiles!plan_herramientas_gestion_autor_id_fkey(id, nombre)"

export async function listarHerramientasPlan(
  planId: string,
): Promise<Result<HerramientaGestionConContexto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .select(SELECT_CON_AUTOR)
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const ctx = await getPlanContexto(supabase, planId)
    const items = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return mapRow(r, ctx, r.autor?.nombre ?? null)
    })
    return { data: items }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando herramientas del plan" }
  }
}

export async function listarHerramientasActividad(
  actividadId: string,
): Promise<Result<HerramientaGestionConContexto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!actividadId) return { error: "ID de actividad inválido" }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .select(SELECT_CON_AUTOR)
      .eq("reunion_actividad_id", actividadId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const ctx = await getActividadContexto(supabase, actividadId)
    const items = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return mapRow(r, ctx, r.autor?.nombre ?? null)
    })
    return { data: items }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando herramientas de la actividad" }
  }
}

export async function listarHerramientasGestion(
  tipo?: HerramientaGestionTipo,
): Promise<Result<HerramientaGestionConContexto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("plan_herramientas_gestion")
      .select(SELECT_CON_AUTOR)
      .order("created_at", { ascending: false })
    if (tipo) query = query.eq("tipo", tipo)

    const { data, error } = await query
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>

    // Resolver contexto por target único, en paralelo.
    const keys = new Map<string, { plan_id: string | null; reunion_actividad_id: string | null }>()
    for (const r of rows) {
      const row = r as { plan_id: string | null; reunion_actividad_id: string | null }
      const k = row.plan_id ? `p:${row.plan_id}` : `a:${row.reunion_actividad_id}`
      if (!keys.has(k)) keys.set(k, row)
    }
    const ctxMap = new Map<string, Contexto>()
    await Promise.all(
      Array.from(keys.entries()).map(async ([k, row]) => {
        ctxMap.set(k, await getContexto(supabase, row))
      }),
    )

    const items = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const k = r.plan_id ? `p:${r.plan_id}` : `a:${r.reunion_actividad_id}`
      return mapRow(r, ctxMap.get(k) ?? { ...CONTEXTO_VACIO }, r.autor?.nombre ?? null)
    })
    return { data: items }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando herramientas de gestión" }
  }
}

export async function getHerramientaGestion(
  id: string,
): Promise<Result<HerramientaGestionConContexto>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!id) return { error: "ID de herramienta inválido" }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .select(SELECT_CON_AUTOR)
      .eq("id", id)
      .single()
    if (error || !data) {
      return { error: error?.message ?? "Herramienta no encontrada" }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any
    const ctx = await getContexto(supabase, r)
    return { data: mapRow(r, ctx, r.autor?.nombre ?? null) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando la herramienta" }
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

    const { data: herramienta, error: errH } = await supabase
      .from("plan_herramientas_gestion")
      .select("plan_id, reunion_actividad_id, autor_id")
      .eq("id", id)
      .single()
    if (errH || !herramienta) {
      return { ok: false, error: errH?.message ?? "Herramienta no encontrada" }
    }
    const row = herramienta as {
      plan_id: string | null
      reunion_actividad_id: string | null
      autor_id: string | null
    }

    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return { ok: false, error: "Solo el autor o un editor puede eliminar esta herramienta" }
    }

    const { error: errDel } = await supabase
      .from("plan_herramientas_gestion")
      .delete()
      .eq("id", id)
    if (errDel) return { ok: false, error: errDel.message }

    revalidatePath("/herramientas-gestion")
    if (row.plan_id) revalidatePath(`/planes/${row.plan_id}`)

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error eliminando la herramienta" }
  }
}

// ---------------------------------------------------------------------------
// getHerramientaPdfUrl — URL firmada del PDF (lo regenera si no existe)
// ---------------------------------------------------------------------------

export async function getHerramientaPdfUrl(id: string): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!id) return { error: "ID de herramienta inválido" }

    const { data, error } = await supabase
      .from("plan_herramientas_gestion")
      .select("pdf_path")
      .eq("id", id)
      .single()
    if (error || !data) {
      return { error: error?.message ?? "Herramienta no encontrada" }
    }

    let path = (data as { pdf_path: string | null }).pdf_path
    if (!path) {
      const full = await getHerramientaGestion(id)
      if ("error" in full) return { error: full.error }
      const generado = await generarYGuardarPdf(supabase, full.data)
      if (!generado) return { error: "No se pudo generar el PDF" }
      path = generado
    }

    const { data: signed, error: sErr } = await supabase.storage
      .from(PDF_BUCKET)
      .createSignedUrl(path, 3600)
    if (sErr || !signed) {
      return { error: sErr?.message ?? "No se pudo generar el enlace de descarga" }
    }
    return { data: { url: signed.signedUrl } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error obteniendo el PDF" }
  }
}
