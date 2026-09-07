"use server"

// Campus de Capacitaciones: biblioteca de material (videos, PPT, SOPs, PDFs,
// flyers) organizada por los 7 pilares. La carga RRHH (roles admin y
// admin_rrhh); la consulta cualquier usuario logueado.
//
// ⚠️ No confundir con `src/actions/capacitaciones.ts`: eso son EVENTOS
// dictados, con fecha, instructor, asistencia y examen. Acá no hay
// inscripción, ni nota, ni registro de quién vio qué: es una biblioteca.

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile, requireAuth, requireRole } from "@/lib/session"
import {
  CAMPUS_BUCKET,
  CAMPUS_PILARES,
  esPilarValido,
  esUrlValida,
  type CampusMaterialTipo,
} from "@/lib/campus"
import type {
  CampusCapacitacion,
  CampusCapacitacionConTotal,
  CampusMaterial,
  CampusMaterialConUrl,
  CampusPilarResumen,
} from "@/types/database"

const ROLES_EDICION = ["admin", "admin_rrhh"] as const

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

const TIPOS_VALIDOS: CampusMaterialTipo[] = ["video", "ppt", "sop", "pdf", "flyer", "otro"]

/** La migración se aplica a mano en cada tenant: si todavía no corrió, el
 *  Campus se ve vacío en vez de romper la pantalla. */
function tablaFaltante(mensaje: string): boolean {
  return /campus_capacitaciones|campus_materiales/.test(mensaje)
}

function mensajeError(e: unknown): string {
  // requireRole redirige; el redirect llega acá como error de Next.
  const msg = e instanceof Error ? e.message : "Error desconocido"
  if (msg === "NEXT_REDIRECT" || msg.includes("NEXT_REDIRECT")) return "No autorizado."
  return msg
}

function revalidarCampus(pilar?: string, capacitacionId?: string) {
  revalidatePath("/campus")
  if (pilar) revalidatePath(`/campus/${pilar}`)
  if (pilar && capacitacionId) revalidatePath(`/campus/${pilar}/${capacitacionId}`)
}

// ===========================================================================
// Lectura
// ===========================================================================

/** Contadores por pilar para la portada. Los 7 pilares salen de la constante,
 *  así que acá solo se cuentan las filas que existan. */
export async function getCampusResumen(): Promise<Result<CampusPilarResumen[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: caps, error: errCaps } = await supabase
      .from("campus_capacitaciones")
      .select("id, pilar_codigo")
    if (errCaps) {
      if (tablaFaltante(errCaps.message)) return { data: resumenVacio() }
      return { error: errCaps.message }
    }

    const { data: mats, error: errMats } = await supabase
      .from("campus_materiales")
      .select("capacitacion_id")
    if (errMats) {
      if (tablaFaltante(errMats.message)) return { data: resumenVacio() }
      return { error: errMats.message }
    }

    const pilarDeCap = new Map<string, string>()
    for (const c of caps ?? []) pilarDeCap.set(c.id as string, c.pilar_codigo as string)

    const resumen = resumenVacio()
    const porCodigo = new Map(resumen.map((r) => [r.pilar_codigo as string, r]))

    for (const c of caps ?? []) {
      const r = porCodigo.get(c.pilar_codigo as string)
      if (r) r.total_capacitaciones += 1
    }
    for (const m of mats ?? []) {
      const codigo = pilarDeCap.get(m.capacitacion_id as string)
      const r = codigo ? porCodigo.get(codigo) : undefined
      if (r) r.total_materiales += 1
    }

    return { data: resumen }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

function resumenVacio(): CampusPilarResumen[] {
  return CAMPUS_PILARES.map((p) => ({
    pilar_codigo: p.codigo,
    total_capacitaciones: 0,
    total_materiales: 0,
  }))
}

export async function getCampusCapacitaciones(
  pilarCodigo: string,
): Promise<Result<CampusCapacitacionConTotal[]>> {
  try {
    await requireAuth()
    if (!esPilarValido(pilarCodigo)) return { error: "Pilar inválido." }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("campus_capacitaciones")
      .select("*")
      .eq("pilar_codigo", pilarCodigo)
      .order("orden")
      .order("created_at")
    if (error) {
      if (tablaFaltante(error.message)) return { data: [] }
      return { error: error.message }
    }

    const caps = (data ?? []) as CampusCapacitacion[]
    if (caps.length === 0) return { data: [] }

    const { data: mats, error: errMats } = await supabase
      .from("campus_materiales")
      .select("capacitacion_id")
      .in(
        "capacitacion_id",
        caps.map((c) => c.id),
      )
    if (errMats && !tablaFaltante(errMats.message)) return { error: errMats.message }

    const conteo = new Map<string, number>()
    for (const m of mats ?? []) {
      const id = m.capacitacion_id as string
      conteo.set(id, (conteo.get(id) ?? 0) + 1)
    }

    return {
      data: caps.map((c) => ({ ...c, total_materiales: conteo.get(c.id) ?? 0 })),
    }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

export async function getCampusCapacitacion(id: string): Promise<Result<CampusCapacitacion>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("campus_capacitaciones")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: "No se encontró la capacitación." }
    return { data: data as CampusCapacitacion }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

/** Materiales con la URL ya resuelta: pública del bucket, o el link externo. */
export async function getCampusMateriales(
  capacitacionId: string,
): Promise<Result<CampusMaterialConUrl[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("campus_materiales")
      .select("*")
      .eq("capacitacion_id", capacitacionId)
      .order("orden")
      .order("created_at")
    if (error) {
      if (tablaFaltante(error.message)) return { data: [] }
      return { error: error.message }
    }

    const materiales = ((data ?? []) as CampusMaterial[]).map((m) => ({
      ...m,
      url:
        m.origen === "link"
          ? (m.url_externa ?? "")
          : supabase.storage.from(CAMPUS_BUCKET).getPublicUrl(m.storage_path ?? "").data.publicUrl,
    }))

    return { data: materiales }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

// ===========================================================================
// Escritura: capacitaciones (solo admin / admin_rrhh)
// ===========================================================================

/** El alta va al final: max(orden) + 10, para dejar lugar a reordenar. */
async function proximoOrden(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tabla: "campus_capacitaciones" | "campus_materiales",
  columna: "pilar_codigo" | "capacitacion_id",
  valor: string,
): Promise<number> {
  const { data } = await supabase
    .from(tabla)
    .select("orden")
    .eq(columna, valor)
    .order("orden", { ascending: false })
    .limit(1)
  const max = data?.[0]?.orden
  return typeof max === "number" ? max + 10 : 10
}

export async function createCampusCapacitacion(input: {
  pilar_codigo: string
  titulo: string
  descripcion?: string | null
}): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireRole([...ROLES_EDICION])
    if (!esPilarValido(input.pilar_codigo)) return { error: "Pilar inválido." }
    const titulo = input.titulo.trim()
    if (!titulo) return { error: "Poné un título." }

    const supabase = await createClient()
    const orden = await proximoOrden(
      supabase,
      "campus_capacitaciones",
      "pilar_codigo",
      input.pilar_codigo,
    )

    const { data, error } = await supabase
      .from("campus_capacitaciones")
      .insert({
        pilar_codigo: input.pilar_codigo,
        titulo,
        descripcion: input.descripcion?.trim() || null,
        orden,
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (error) return { error: error.message }

    revalidarCampus(input.pilar_codigo)
    return { data: { id: data.id as string } }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

export async function updateCampusCapacitacion(input: {
  id: string
  titulo: string
  descripcion?: string | null
}): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDICION])
    const titulo = input.titulo.trim()
    if (!titulo) return { error: "Poné un título." }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("campus_capacitaciones")
      .update({ titulo, descripcion: input.descripcion?.trim() || null })
      .eq("id", input.id)
      .select("pilar_codigo")
      .single()
    if (error) return { error: error.message }

    revalidarCampus(data?.pilar_codigo as string, input.id)
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

/** Borra la capacitación, sus materiales (CASCADE) y los archivos del bucket. */
export async function deleteCampusCapacitacion(id: string): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDICION])
    const supabase = await createClient()

    const { data: cap } = await supabase
      .from("campus_capacitaciones")
      .select("pilar_codigo")
      .eq("id", id)
      .maybeSingle()

    const { data: mats } = await supabase
      .from("campus_materiales")
      .select("storage_path")
      .eq("capacitacion_id", id)
      .eq("origen", "archivo")

    const { error } = await supabase.from("campus_capacitaciones").delete().eq("id", id)
    if (error) return { error: error.message }

    const paths = (mats ?? [])
      .map((m) => m.storage_path as string | null)
      .filter((p): p is string => !!p)
    if (paths.length > 0) {
      // Si el borrado del Storage falla, la fila ya no está: un objeto huérfano
      // molesta menos que una capacitación fantasma. Solo lo dejamos anotado.
      const { error: errStorage } = await supabase.storage.from(CAMPUS_BUCKET).remove(paths)
      if (errStorage) console.error("campus: no se pudieron borrar archivos", errStorage.message)
    }

    revalidarCampus(cap?.pilar_codigo as string | undefined)
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

// ===========================================================================
// Escritura: materiales
// ===========================================================================

/** El archivo ya lo subió el browser directo al bucket (esquiva el límite de
 *  4,5 MB del body serverless); acá solo se registran los metadatos. Si esto
 *  falla, el cliente borra el objeto que acaba de subir. */
export async function registrarMaterialArchivo(input: {
  capacitacion_id: string
  titulo: string
  descripcion?: string | null
  tipo: string
  storage_path: string
  nombre_original: string
  mime_type: string
  bytes: number
}): Promise<Ok> {
  try {
    const profile = await requireRole([...ROLES_EDICION])
    const titulo = input.titulo.trim()
    if (!titulo) return { error: "Poné un título." }
    if (!input.storage_path) return { error: "Falta el archivo." }
    const tipo = TIPOS_VALIDOS.includes(input.tipo as CampusMaterialTipo)
      ? (input.tipo as CampusMaterialTipo)
      : "otro"

    const supabase = await createClient()
    const orden = await proximoOrden(
      supabase,
      "campus_materiales",
      "capacitacion_id",
      input.capacitacion_id,
    )

    const { error } = await supabase.from("campus_materiales").insert({
      capacitacion_id: input.capacitacion_id,
      titulo,
      descripcion: input.descripcion?.trim() || null,
      tipo,
      origen: "archivo",
      storage_path: input.storage_path,
      nombre_original: input.nombre_original,
      mime_type: input.mime_type,
      bytes: input.bytes,
      orden,
      created_by: profile.id,
    })
    if (error) return { error: error.message }

    revalidatePath("/campus")
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

export async function registrarMaterialLink(input: {
  capacitacion_id: string
  titulo: string
  descripcion?: string | null
  tipo: string
  url_externa: string
}): Promise<Ok> {
  try {
    const profile = await requireRole([...ROLES_EDICION])
    const titulo = input.titulo.trim()
    if (!titulo) return { error: "Poné un título." }
    const url = input.url_externa.trim()
    if (!esUrlValida(url)) return { error: "El link tiene que empezar con http:// o https://" }
    const tipo = TIPOS_VALIDOS.includes(input.tipo as CampusMaterialTipo)
      ? (input.tipo as CampusMaterialTipo)
      : "otro"

    const supabase = await createClient()
    const orden = await proximoOrden(
      supabase,
      "campus_materiales",
      "capacitacion_id",
      input.capacitacion_id,
    )

    const { error } = await supabase.from("campus_materiales").insert({
      capacitacion_id: input.capacitacion_id,
      titulo,
      descripcion: input.descripcion?.trim() || null,
      tipo,
      origen: "link",
      url_externa: url,
      orden,
      created_by: profile.id,
    })
    if (error) return { error: error.message }

    revalidatePath("/campus")
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

/** Edita título, descripción, tipo y (si es link) la URL. Cambiar de archivo a
 *  link o al revés no se permite: para eso se borra y se carga de nuevo. */
export async function updateCampusMaterial(input: {
  id: string
  titulo: string
  descripcion?: string | null
  tipo: string
  url_externa?: string | null
}): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDICION])
    const titulo = input.titulo.trim()
    if (!titulo) return { error: "Poné un título." }
    const tipo = TIPOS_VALIDOS.includes(input.tipo as CampusMaterialTipo)
      ? (input.tipo as CampusMaterialTipo)
      : "otro"

    const supabase = await createClient()
    const { data: actual, error: errActual } = await supabase
      .from("campus_materiales")
      .select("origen")
      .eq("id", input.id)
      .maybeSingle()
    if (errActual) return { error: errActual.message }
    if (!actual) return { error: "No se encontró el material." }

    const cambios: Record<string, unknown> = {
      titulo,
      descripcion: input.descripcion?.trim() || null,
      tipo,
    }

    if (actual.origen === "link") {
      const url = (input.url_externa ?? "").trim()
      if (!esUrlValida(url)) return { error: "El link tiene que empezar con http:// o https://" }
      cambios.url_externa = url
    }

    const { error } = await supabase.from("campus_materiales").update(cambios).eq("id", input.id)
    if (error) return { error: error.message }

    revalidatePath("/campus")
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

export async function deleteCampusMaterial(id: string): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDICION])
    const supabase = await createClient()

    const { data: mat } = await supabase
      .from("campus_materiales")
      .select("storage_path, origen")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase.from("campus_materiales").delete().eq("id", id)
    if (error) return { error: error.message }

    if (mat?.origen === "archivo" && mat.storage_path) {
      const { error: errStorage } = await supabase.storage
        .from(CAMPUS_BUCKET)
        .remove([mat.storage_path as string])
      if (errStorage) console.error("campus: no se pudo borrar el archivo", errStorage.message)
    }

    revalidatePath("/campus")
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

// ===========================================================================
// Orden manual (botones ↑ ↓: se usa desde el celular, sin drag & drop)
// ===========================================================================

type Direccion = "arriba" | "abajo"

async function moverFila(
  tabla: "campus_capacitaciones" | "campus_materiales",
  columnaPadre: "pilar_codigo" | "capacitacion_id",
  id: string,
  direccion: Direccion,
): Promise<Ok> {
  const supabase = await createClient()

  const { data: fila, error: errFila } = await supabase
    .from(tabla)
    .select(`id, orden, created_at, ${columnaPadre}`)
    .eq("id", id)
    .maybeSingle()
  if (errFila) return { error: errFila.message }
  if (!fila) return { error: "No se encontró la fila." }

  const padre = (fila as Record<string, unknown>)[columnaPadre] as string

  const { data: hermanos, error: errHermanos } = await supabase
    .from(tabla)
    .select("id, orden, created_at")
    .eq(columnaPadre, padre)
    .order("orden")
    .order("created_at")
  if (errHermanos) return { error: errHermanos.message }

  const lista = hermanos ?? []
  const i = lista.findIndex((f) => f.id === id)
  const j = direccion === "arriba" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= lista.length) return { success: true } // ya está en la punta

  const a = lista[i]
  const b = lista[j]
  // Si el orden viene empatado (datos viejos), lo desempatamos al vuelo.
  const ordenA = a.orden === b.orden ? (direccion === "arriba" ? b.orden - 1 : b.orden + 1) : b.orden
  const ordenB = a.orden === b.orden ? b.orden : a.orden

  const { error: err1 } = await supabase.from(tabla).update({ orden: ordenA }).eq("id", a.id)
  if (err1) return { error: err1.message }
  const { error: err2 } = await supabase.from(tabla).update({ orden: ordenB }).eq("id", b.id)
  if (err2) return { error: err2.message }

  return { success: true }
}

export async function moverCampusCapacitacion(id: string, direccion: Direccion): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDICION])
    const res = await moverFila("campus_capacitaciones", "pilar_codigo", id, direccion)
    if ("error" in res) return res
    revalidatePath("/campus")
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

export async function moverCampusMaterial(id: string, direccion: Direccion): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDICION])
    const res = await moverFila("campus_materiales", "capacitacion_id", id, direccion)
    if ("error" in res) return res
    revalidatePath("/campus")
    return { success: true }
  } catch (e) {
    return { error: mensajeError(e) }
  }
}

/** Puede cargar y editar el Campus. */
export async function puedeEditarCampus(): Promise<boolean> {
  const profile = await getProfile()
  return profile?.role === "admin" || profile?.role === "admin_rrhh"
}
