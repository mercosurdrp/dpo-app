"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, getProfile } from "@/lib/session"
import type {
  Profile,
  RequisitoLegal,
  RequisitoLegalCategoria,
  RequisitoLegalConResponsable,
  EstadoRequisitoLegal,
  RequisitoLegalAlertaConfig,
  RequisitoLegalRaci,
  RequisitoLegalRaciFila,
  RequisitoLegalRaciRol,
  RaciLetra,
  RequisitoLegalGestion,
  EstadoGestionRequisito,
} from "@/types/database"

const BUCKET = "requisitos-legales"
const REVALIDATE_PATH = "/requisitos-legales"
const DIAS_ALERTA = 30

type Result<T> = { data: T } | { error: string }

// =============================================
// Helpers
// =============================================

function calcularEstado(
  fechaVencimiento: string,
  hoy: Date = new Date(),
): { estado: EstadoRequisitoLegal; dias: number } {
  const venc = new Date(fechaVencimiento + "T00:00:00")
  const hoyDate = new Date(hoy.toISOString().slice(0, 10) + "T00:00:00")
  const ms = venc.getTime() - hoyDate.getTime()
  const dias = Math.round(ms / 86400000)

  if (dias < 0) return { estado: "vencido", dias }
  if (dias <= DIAS_ALERTA) return { estado: "por_vencer", dias }
  return { estado: "vigente", dias }
}

async function requireEditor() {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar requisitos legales")
  }
  return profile
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/**
 * Sube un archivo al bucket y devuelve el path. `tag` distingue ranura/versión
 * (ej. "v1" frente, "v1-dorso" dorso) para que dos archivos del mismo item no
 * colisionen de path. Lanza si falla la subida.
 */
async function subirArchivoRequisito(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  categoriaId: string,
  requisitoId: string,
  file: File,
  tag: string,
): Promise<string> {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${categoriaId}/${requisitoId}/${tag}-${cleanName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
  if (error) throw new Error(`Subiendo archivo: ${error.message}`)
  return path
}

// =============================================
// Lectura
// =============================================

export async function listCategorias(): Promise<
  Result<RequisitoLegalCategoria[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("requisitos_legales_categorias")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data ?? []) as RequisitoLegalCategoria[] }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando categorías",
    }
  }
}

export async function listRequisitos(): Promise<
  Result<RequisitoLegalConResponsable[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("requisitos_legales")
      .select(
        "*, responsable:profiles!requisitos_legales_responsable_id_fkey(id, nombre, email)",
      )
      .order("fecha_vencimiento", { ascending: true })

    if (error) return { error: error.message }

    const enriched: RequisitoLegalConResponsable[] = (data ?? []).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const { estado, dias } = calcularEstado(r.fecha_vencimiento)
      return {
        id: r.id,
        categoria_id: r.categoria_id,
        nombre: r.nombre,
        fecha_emision: r.fecha_emision,
        fecha_vencimiento: r.fecha_vencimiento,
        responsable_id: r.responsable_id,
        archivo_url: r.archivo_url,
        archivo_nombre: r.archivo_nombre,
        archivo_url_2: r.archivo_url_2,
        archivo_nombre_2: r.archivo_nombre_2,
        observaciones: r.observaciones,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
        responsable_nombre: r.responsable?.nombre ?? null,
        responsable_email: r.responsable?.email ?? null,
        estado,
        dias_para_vencer: dias,
      }
    })

    return { data: enriched }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando requisitos legales",
    }
  }
}

export async function listResponsablesPosibles(): Promise<
  Result<Pick<Profile, "id" | "nombre" | "email">[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nombre, email")
      .eq("active", true)
      .order("nombre")
    if (error) return { error: error.message }
    return {
      data: (data ?? []) as Pick<Profile, "id" | "nombre" | "email">[],
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando usuarios",
    }
  }
}

export async function getSignedUrl(
  archivoUrl: string,
): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(archivoUrl, 60 * 10)
    if (error || !data) {
      return { error: error?.message ?? "No se pudo firmar URL" }
    }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error firmando URL",
    }
  }
}

// =============================================
// Mutaciones de categorías
// =============================================

export async function crearCategoria(
  formData: FormData,
): Promise<Result<RequisitoLegalCategoria>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const nombre = String(formData.get("nombre") ?? "").trim()
    const tipo_identificador = String(
      formData.get("tipo_identificador") ?? "ninguno",
    ).trim() as RequisitoLegalCategoria["tipo_identificador"]
    const identificador_label =
      String(formData.get("identificador_label") ?? "").trim() || null
    const ordenRaw = String(formData.get("orden") ?? "").trim()

    if (!nombre) return { error: "El nombre de la tarjeta es obligatorio" }
    if (
      !["ninguno", "vehiculo", "persona", "ubicacion"].includes(
        tipo_identificador,
      )
    ) {
      return { error: "Tipo de identificador inválido" }
    }

    let orden: number
    if (ordenRaw) {
      const parsed = Number(ordenRaw)
      if (!Number.isFinite(parsed)) return { error: "Orden inválido" }
      orden = Math.trunc(parsed)
    } else {
      const { data: maxRow } = await supabase
        .from("requisitos_legales_categorias")
        .select("orden")
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle()
      orden = ((maxRow?.orden as number | undefined) ?? 0) + 10
    }

    const baseSlug = slugify(nombre) || `tarjeta-${Date.now()}`
    let slug = baseSlug
    for (let i = 2; i < 50; i++) {
      const { data: clash } = await supabase
        .from("requisitos_legales_categorias")
        .select("id")
        .eq("slug", slug)
        .maybeSingle()
      if (!clash) break
      slug = `${baseSlug}-${i}`
    }

    const { data, error } = await supabase
      .from("requisitos_legales_categorias")
      .insert({
        nombre,
        slug,
        tipo_identificador,
        identificador_label,
        orden,
        activa: true,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalCategoria }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando tarjeta",
    }
  }
}

export async function actualizarCategoria(
  id: string,
  formData: FormData,
): Promise<Result<RequisitoLegalCategoria>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const nombre = String(formData.get("nombre") ?? "").trim()
    const tipo_identificador = String(
      formData.get("tipo_identificador") ?? "ninguno",
    ).trim() as RequisitoLegalCategoria["tipo_identificador"]
    const identificador_label =
      String(formData.get("identificador_label") ?? "").trim() || null
    const ordenRaw = String(formData.get("orden") ?? "").trim()

    if (!nombre) return { error: "El nombre de la tarjeta es obligatorio" }
    if (
      !["ninguno", "vehiculo", "persona", "ubicacion"].includes(
        tipo_identificador,
      )
    ) {
      return { error: "Tipo de identificador inválido" }
    }

    const update: Record<string, unknown> = {
      nombre,
      tipo_identificador,
      identificador_label,
    }
    if (ordenRaw) {
      const parsed = Number(ordenRaw)
      if (!Number.isFinite(parsed)) return { error: "Orden inválido" }
      update.orden = Math.trunc(parsed)
    }

    const { data, error } = await supabase
      .from("requisitos_legales_categorias")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalCategoria }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando tarjeta",
    }
  }
}

export async function eliminarCategoria(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { count, error: countErr } = await supabase
      .from("requisitos_legales")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", id)
    if (countErr) return { error: countErr.message }
    if ((count ?? 0) > 0) {
      return {
        error: `No se puede eliminar: la tarjeta tiene ${count} requisito${
          count === 1 ? "" : "s"
        } cargado${count === 1 ? "" : "s"}. Mové o eliminá los items primero.`,
      }
    }

    const { error } = await supabase
      .from("requisitos_legales_categorias")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando tarjeta",
    }
  }
}

export async function actualizarResponsablePrincipal(
  categoriaId: string,
  responsableId: string | null,
): Promise<Result<RequisitoLegalCategoria>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("requisitos_legales_categorias")
      .update({ responsable_principal_id: responsableId })
      .eq("id", categoriaId)
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalCategoria }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando categoría",
    }
  }
}

// =============================================
// Mutaciones de items
// =============================================

export async function crearRequisito(
  formData: FormData,
): Promise<Result<RequisitoLegal>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const categoria_id = String(formData.get("categoria_id") ?? "").trim()
    const nombre = String(formData.get("nombre") ?? "").trim()
    const fecha_emision = String(formData.get("fecha_emision") ?? "").trim() || null
    const fecha_vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim()
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null
    const file = formData.get("archivo") as File | null
    const file2 = formData.get("archivo_2") as File | null

    if (!categoria_id) return { error: "La categoría es obligatoria" }
    if (!nombre) return { error: "El nombre del requisito es obligatorio" }
    if (!fecha_vencimiento) return { error: "La fecha de vencimiento es obligatoria" }

    const requisitoId = crypto.randomUUID()
    let archivo_url: string | null = null
    let archivo_nombre: string | null = null
    let archivo_url_2: string | null = null
    let archivo_nombre_2: string | null = null
    const subidos: string[] = []

    try {
      if (file && file instanceof File && file.size > 0) {
        archivo_url = await subirArchivoRequisito(
          supabase, categoria_id, requisitoId, file, "v1",
        )
        archivo_nombre = file.name
        subidos.push(archivo_url)
      }
      if (file2 && file2 instanceof File && file2.size > 0) {
        archivo_url_2 = await subirArchivoRequisito(
          supabase, categoria_id, requisitoId, file2, "v1-dorso",
        )
        archivo_nombre_2 = file2.name
        subidos.push(archivo_url_2)
      }
    } catch (err) {
      if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos)
      return {
        error: err instanceof Error ? err.message : "Error subiendo archivo",
      }
    }

    const { data, error } = await supabase
      .from("requisitos_legales")
      .insert({
        id: requisitoId,
        categoria_id,
        nombre,
        fecha_emision,
        fecha_vencimiento,
        responsable_id,
        archivo_url,
        archivo_nombre,
        archivo_url_2,
        archivo_nombre_2,
        observaciones,
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) {
      if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos)
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegal }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando requisito",
    }
  }
}

export async function actualizarRequisito(
  id: string,
  formData: FormData,
): Promise<Result<RequisitoLegal>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const nombre = String(formData.get("nombre") ?? "").trim()
    const fecha_emision = String(formData.get("fecha_emision") ?? "").trim() || null
    const fecha_vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim()
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null
    const file = formData.get("archivo") as File | null
    const file2 = formData.get("archivo_2") as File | null

    if (!nombre) return { error: "El nombre del requisito es obligatorio" }
    if (!fecha_vencimiento) return { error: "La fecha de vencimiento es obligatoria" }

    const tieneArchivo1 = !!(file && file instanceof File && file.size > 0)
    const tieneArchivo2 = !!(file2 && file2 instanceof File && file2.size > 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      nombre,
      fecha_emision,
      fecha_vencimiento,
      responsable_id,
      observaciones,
    }

    const subidos: string[] = []
    const aBorrar: string[] = []

    if (tieneArchivo1 || tieneArchivo2) {
      const { data: actual, error: errActual } = await supabase
        .from("requisitos_legales")
        .select("categoria_id, archivo_url, archivo_url_2")
        .eq("id", id)
        .single()
      if (errActual) return { error: errActual.message }

      try {
        if (tieneArchivo1) {
          update.archivo_url = await subirArchivoRequisito(
            supabase, actual.categoria_id, id, file!, `e${Date.now()}`,
          )
          update.archivo_nombre = file!.name
          subidos.push(update.archivo_url)
          if (actual.archivo_url) aBorrar.push(actual.archivo_url)
        }
        if (tieneArchivo2) {
          update.archivo_url_2 = await subirArchivoRequisito(
            supabase, actual.categoria_id, id, file2!, `e${Date.now()}-dorso`,
          )
          update.archivo_nombre_2 = file2!.name
          subidos.push(update.archivo_url_2)
          if (actual.archivo_url_2) aBorrar.push(actual.archivo_url_2)
        }
      } catch (err) {
        if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos)
        return {
          error: err instanceof Error ? err.message : "Error subiendo archivo",
        }
      }
    }

    const { data, error } = await supabase
      .from("requisitos_legales")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos)
      return { error: error.message }
    }

    if (aBorrar.length) await supabase.storage.from(BUCKET).remove(aBorrar)

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegal }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando requisito",
    }
  }
}

/**
 * Renovar: sube nuevo archivo y actualiza fecha de emisión + vencimiento.
 * Borra el archivo anterior si existía.
 */
export async function renovarRequisito(
  id: string,
  formData: FormData,
): Promise<Result<RequisitoLegal>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const fecha_emision = String(formData.get("fecha_emision") ?? "").trim()
    const fecha_vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim()
    const file = formData.get("archivo") as File | null
    const file2 = formData.get("archivo_2") as File | null

    if (!fecha_emision) return { error: "La fecha de emisión es obligatoria" }
    if (!fecha_vencimiento) return { error: "La fecha de vencimiento es obligatoria" }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Subí el archivo de la renovación (frente)" }
    }
    const tieneArchivo2 = !!(file2 && file2 instanceof File && file2.size > 0)

    const { data: actual, error: errActual } = await supabase
      .from("requisitos_legales")
      .select("archivo_url, archivo_url_2, categoria_id")
      .eq("id", id)
      .single()
    if (errActual) return { error: errActual.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { fecha_emision, fecha_vencimiento }
    const subidos: string[] = []
    const aBorrar: string[] = []

    try {
      update.archivo_url = await subirArchivoRequisito(
        supabase, actual.categoria_id, id, file, `v${Date.now()}`,
      )
      update.archivo_nombre = file.name
      subidos.push(update.archivo_url)
      if (actual.archivo_url) aBorrar.push(actual.archivo_url)

      if (tieneArchivo2) {
        update.archivo_url_2 = await subirArchivoRequisito(
          supabase, actual.categoria_id, id, file2!, `v${Date.now()}-dorso`,
        )
        update.archivo_nombre_2 = file2!.name
        subidos.push(update.archivo_url_2)
        if (actual.archivo_url_2) aBorrar.push(actual.archivo_url_2)
      }
    } catch (err) {
      if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos)
      return {
        error: err instanceof Error ? err.message : "Error subiendo archivo",
      }
    }

    const { data, error } = await supabase
      .from("requisitos_legales")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos)
      return { error: error.message }
    }

    if (aBorrar.length) await supabase.storage.from(BUCKET).remove(aBorrar)

    // El documento nuevo ya está arriba: el trámite que estaba en curso se
    // cierra solo. Si el tenant no tiene las tablas de gestión (Misiones), el
    // error se ignora — la renovación en sí ya se guardó.
    await cerrarGestionPorRenovacion(supabase, id, profile.id)

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegal }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error renovando requisito",
    }
  }
}

async function cerrarGestionPorRenovacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  requisitoId: string,
  userId: string,
): Promise<void> {
  try {
    const { data: abierta } = await supabase
      .from("requisitos_legales_gestiones")
      .select("id")
      .eq("requisito_id", requisitoId)
      .eq("abierta", true)
      .maybeSingle()
    if (!abierta) return

    await supabase
      .from("requisitos_legales_gestiones")
      .update({
        abierta: false,
        cierre_motivo: "renovado",
        cerrada_at: new Date().toISOString(),
        cerrada_por: userId,
      })
      .eq("id", abierta.id)

    await supabase.from("requisitos_legales_gestion_eventos").insert({
      gestion_id: abierta.id,
      estado: "renovado",
      comentario: "Documento renovado y cargado en el sistema",
      created_by: userId,
    })
  } catch {
    // sin gestión / tablas ausentes: no rompe la renovación
  }
}

export async function eliminarRequisito(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("requisitos_legales")
      .select("archivo_url, archivo_url_2")
      .eq("id", id)
      .single()

    const { error } = await supabase
      .from("requisitos_legales")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    const aBorrar = [actual?.archivo_url, actual?.archivo_url_2].filter(
      Boolean,
    ) as string[]
    if (aBorrar.length) {
      await supabase.storage.from(BUCKET).remove(aBorrar)
    }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando requisito",
    }
  }
}

// =============================================
// Permisos para la UI
// =============================================

export async function puedeEditarRequisitos(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
}

/**
 * Id del usuario logueado. La UI lo usa para saber si es el responsable de un
 * requisito y por lo tanto puede cargar la gestión sin ser editor.
 */
export async function getUsuarioActualId(): Promise<string | null> {
  const profile = await getProfile()
  return profile?.id ?? null
}

// =============================================
// Gestión del trámite de renovación
// =============================================

const ESTADOS_GESTION = ["solicitado", "turno_asignado", "en_tramite"] as const

/** Mapea filas de gestión + eventos al tipo del cliente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGestion(row: any, eventos: any[]): RequisitoLegalGestion {
  return {
    id: row.id,
    requisito_id: row.requisito_id,
    estado: row.estado,
    fecha_turno: row.fecha_turno,
    organismo: row.organismo,
    nro_tramite: row.nro_tramite,
    vencimiento_objetivo: row.vencimiento_objetivo,
    abierta: row.abierta,
    cierre_motivo: row.cierre_motivo,
    cerrada_at: row.cerrada_at,
    cerrada_por: row.cerrada_por,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    eventos: eventos
      .filter((e) => e.gestion_id === row.id)
      .map((e) => ({
        id: e.id,
        gestion_id: e.gestion_id,
        estado: e.estado,
        fecha_turno: e.fecha_turno,
        comentario: e.comentario,
        archivo_url: e.archivo_url,
        archivo_nombre: e.archivo_nombre,
        created_by: e.created_by,
        created_by_nombre: e.autor?.nombre ?? null,
        created_at: e.created_at,
      })),
  }
}

const SELECT_EVENTOS =
  "*, autor:profiles!requisitos_legales_gestion_eventos_created_by_fkey(id, nombre)"

/**
 * Gestiones ABIERTAS con su bitácora. Si las tablas no existen en el tenant
 * (Misiones no las tiene), devuelve error y la UI oculta la solapa/columna.
 */
export async function listGestionesAbiertas(): Promise<
  Result<RequisitoLegalGestion[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: gestiones, error } = await supabase
      .from("requisitos_legales_gestiones")
      .select("*")
      .eq("abierta", true)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    if (!gestiones || gestiones.length === 0) return { data: [] }

    const { data: eventos, error: errEv } = await supabase
      .from("requisitos_legales_gestion_eventos")
      .select(SELECT_EVENTOS)
      .in(
        "gestion_id",
        gestiones.map((g) => g.id),
      )
      .order("created_at", { ascending: false })

    if (errEv) return { error: errEv.message }

    return { data: gestiones.map((g) => mapGestion(g, eventos ?? [])) }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando gestiones",
    }
  }
}

/** Todas las gestiones de un requisito (abierta + cerradas), para el historial. */
export async function listGestionesDeRequisito(
  requisitoId: string,
): Promise<Result<RequisitoLegalGestion[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: gestiones, error } = await supabase
      .from("requisitos_legales_gestiones")
      .select("*")
      .eq("requisito_id", requisitoId)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    if (!gestiones || gestiones.length === 0) return { data: [] }

    const { data: eventos, error: errEv } = await supabase
      .from("requisitos_legales_gestion_eventos")
      .select(SELECT_EVENTOS)
      .in(
        "gestion_id",
        gestiones.map((g) => g.id),
      )
      .order("created_at", { ascending: false })

    if (errEv) return { error: errEv.message }

    return { data: gestiones.map((g) => mapGestion(g, eventos ?? [])) }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el historial",
    }
  }
}

/**
 * Registra un movimiento del trámite. Abre la gestión si todavía no existe y
 * la deja en el estado declarado. El responsable del requisito puede cargar
 * aunque no sea editor: es quien recibe la alerta por mail.
 */
export async function registrarMovimientoGestion(
  requisitoId: string,
  formData: FormData,
): Promise<Result<RequisitoLegalGestion>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: requisito, error: errReq } = await supabase
      .from("requisitos_legales")
      .select("id, responsable_id, fecha_vencimiento")
      .eq("id", requisitoId)
      .single()
    if (errReq || !requisito) {
      return { error: errReq?.message ?? "No se encontró el requisito" }
    }

    const esEditor = ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
    if (!esEditor && requisito.responsable_id !== profile.id) {
      return {
        error:
          "Solo el responsable del requisito o un editor pueden cargar la gestión",
      }
    }

    const estado = String(
      formData.get("estado") ?? "",
    ).trim() as EstadoGestionRequisito
    if (!ESTADOS_GESTION.includes(estado)) {
      return { error: "Estado de gestión inválido" }
    }

    const fecha_turno = String(formData.get("fecha_turno") ?? "").trim() || null
    const organismo = String(formData.get("organismo") ?? "").trim() || null
    const nro_tramite = String(formData.get("nro_tramite") ?? "").trim() || null
    const comentario = String(formData.get("comentario") ?? "").trim() || null
    const file = formData.get("archivo") as File | null
    const tieneArchivo = !!(file && file instanceof File && file.size > 0)

    if (estado === "turno_asignado" && !fecha_turno) {
      return { error: "Cargá la fecha del turno" }
    }

    // Gestión abierta o nueva
    const { data: abierta, error: errAbierta } = await supabase
      .from("requisitos_legales_gestiones")
      .select("*")
      .eq("requisito_id", requisitoId)
      .eq("abierta", true)
      .maybeSingle()
    if (errAbierta) return { error: errAbierta.message }

    let gestionId: string
    if (abierta) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: Record<string, any> = { estado }
      // Los datos del trámite solo se pisan si el movimiento trae valor nuevo:
      // pasar a "en trámite" no debe borrar el turno ya cargado.
      if (fecha_turno) update.fecha_turno = fecha_turno
      if (organismo) update.organismo = organismo
      if (nro_tramite) update.nro_tramite = nro_tramite

      const { error } = await supabase
        .from("requisitos_legales_gestiones")
        .update(update)
        .eq("id", abierta.id)
      if (error) return { error: error.message }
      gestionId = abierta.id
    } else {
      const { data: creada, error } = await supabase
        .from("requisitos_legales_gestiones")
        .insert({
          requisito_id: requisitoId,
          estado,
          fecha_turno,
          organismo,
          nro_tramite,
          vencimiento_objetivo: requisito.fecha_vencimiento,
          created_by: profile.id,
        })
        .select("id")
        .single()
      if (error) return { error: error.message }
      gestionId = creada.id as string
    }

    // Comprobante opcional (turno, constancia de inicio de trámite…).
    // Se sube con el cliente admin porque el responsable puede no tener rol
    // editor y la policy de storage del bucket exige editor para escribir.
    let archivo_url: string | null = null
    let archivo_nombre: string | null = null
    if (tieneArchivo) {
      const admin = createAdminClient()
      const cleanName = file!.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `gestiones/${requisitoId}/${gestionId}/${Date.now()}-${cleanName}`
      const arrayBuffer = await file!.arrayBuffer()
      const { error: errUp } = await admin.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, {
          contentType: file!.type || "application/octet-stream",
          upsert: false,
        })
      if (errUp) return { error: `Subiendo comprobante: ${errUp.message}` }
      archivo_url = path
      archivo_nombre = file!.name
    }

    const { error: errEvento } = await supabase
      .from("requisitos_legales_gestion_eventos")
      .insert({
        gestion_id: gestionId,
        estado,
        fecha_turno,
        comentario,
        archivo_url,
        archivo_nombre,
        created_by: profile.id,
      })
    if (errEvento) {
      if (archivo_url) {
        await createAdminClient().storage.from(BUCKET).remove([archivo_url])
      }
      return { error: errEvento.message }
    }

    revalidatePath(REVALIDATE_PATH)

    const { data: gestionFinal, error: errFinal } = await supabase
      .from("requisitos_legales_gestiones")
      .select("*")
      .eq("id", gestionId)
      .single()
    if (errFinal) return { error: errFinal.message }

    const { data: eventos } = await supabase
      .from("requisitos_legales_gestion_eventos")
      .select(SELECT_EVENTOS)
      .eq("gestion_id", gestionId)
      .order("created_at", { ascending: false })

    return { data: mapGestion(gestionFinal, eventos ?? []) }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error registrando el movimiento",
    }
  }
}

/**
 * Cierra la gestión abierta sin renovar (se cargó por error o el trámite se
 * cayó). El cierre por documento conseguido lo hace `renovarRequisito`.
 */
export async function cancelarGestion(
  gestionId: string,
  motivo?: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: gestion, error: errG } = await supabase
      .from("requisitos_legales_gestiones")
      .select("id, requisito_id, abierta")
      .eq("id", gestionId)
      .single()
    if (errG || !gestion) {
      return { error: errG?.message ?? "No se encontró la gestión" }
    }
    if (!gestion.abierta) return { error: "La gestión ya está cerrada" }

    const { data: requisito } = await supabase
      .from("requisitos_legales")
      .select("responsable_id")
      .eq("id", gestion.requisito_id)
      .single()

    const esEditor = ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
    if (!esEditor && requisito?.responsable_id !== profile.id) {
      return { error: "No tenés permiso para cancelar esta gestión" }
    }

    const { error } = await supabase
      .from("requisitos_legales_gestiones")
      .update({
        abierta: false,
        cierre_motivo: "cancelada",
        cerrada_at: new Date().toISOString(),
        cerrada_por: profile.id,
      })
      .eq("id", gestionId)
    if (error) return { error: error.message }

    await supabase.from("requisitos_legales_gestion_eventos").insert({
      gestion_id: gestionId,
      estado: "cancelada",
      comentario: motivo?.trim() || null,
      created_by: profile.id,
    })

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cancelando la gestión",
    }
  }
}

// =============================================
// RACI (DPO Planeamiento 2.1 — R2.1.1)
// =============================================

/**
 * Devuelve la matriz RACI. Si las tablas no existen en el tenant
 * (Misiones aún no las tiene), devuelve error y la UI oculta la solapa.
 */
export async function getRaci(): Promise<Result<RequisitoLegalRaci>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [rolesRes, filasRes] = await Promise.all([
      supabase
        .from("requisitos_legales_raci_roles")
        .select("*")
        .eq("activa", true)
        .order("orden", { ascending: true }),
      supabase
        .from("requisitos_legales_raci_filas")
        .select("*")
        .eq("activa", true)
        .order("orden", { ascending: true }),
    ])

    if (rolesRes.error) return { error: rolesRes.error.message }
    if (filasRes.error) return { error: filasRes.error.message }

    return {
      data: {
        roles: (rolesRes.data ?? []) as RequisitoLegalRaciRol[],
        filas: (filasRes.data ?? []) as RequisitoLegalRaciFila[],
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando RACI",
    }
  }
}

export async function setCeldaRaci(
  filaId: string,
  rolId: string,
  letra: RaciLetra | null,
): Promise<Result<RequisitoLegalRaciFila>> {
  try {
    await requireEditor()
    if (letra !== null && !["R", "A", "C", "I"].includes(letra)) {
      return { error: "Letra RACI inválida" }
    }
    const supabase = await createClient()

    const { data: fila, error: errFila } = await supabase
      .from("requisitos_legales_raci_filas")
      .select("asignaciones")
      .eq("id", filaId)
      .single()
    if (errFila) return { error: errFila.message }

    const asignaciones = {
      ...((fila?.asignaciones ?? {}) as Record<string, RaciLetra>),
    }
    if (letra === null) {
      delete asignaciones[rolId]
    } else {
      asignaciones[rolId] = letra
    }

    const { data, error } = await supabase
      .from("requisitos_legales_raci_filas")
      .update({ asignaciones })
      .eq("id", filaId)
      .select("*")
      .single()
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalRaciFila }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error guardando celda",
    }
  }
}

export async function crearFilaRaci(
  nombre: string,
  descripcion: string | null,
): Promise<Result<RequisitoLegalRaciFila>> {
  try {
    await requireEditor()
    const nombreClean = nombre.trim()
    if (!nombreClean) return { error: "El nombre de la fila es obligatorio" }
    const supabase = await createClient()

    const { data: maxRow } = await supabase
      .from("requisitos_legales_raci_filas")
      .select("orden")
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle()
    const orden = ((maxRow?.orden as number | undefined) ?? 0) + 10

    const { data, error } = await supabase
      .from("requisitos_legales_raci_filas")
      .insert({
        nombre: nombreClean,
        descripcion: descripcion?.trim() || null,
        orden,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalRaciFila }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando fila",
    }
  }
}

export async function actualizarFilaRaci(
  id: string,
  nombre: string,
  descripcion: string | null,
): Promise<Result<RequisitoLegalRaciFila>> {
  try {
    await requireEditor()
    const nombreClean = nombre.trim()
    if (!nombreClean) return { error: "El nombre de la fila es obligatorio" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("requisitos_legales_raci_filas")
      .update({ nombre: nombreClean, descripcion: descripcion?.trim() || null })
      .eq("id", id)
      .select("*")
      .single()
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalRaciFila }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando fila",
    }
  }
}

export async function eliminarFilaRaci(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase
      .from("requisitos_legales_raci_filas")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando fila",
    }
  }
}

export async function crearRolRaci(
  nombre: string,
): Promise<Result<RequisitoLegalRaciRol>> {
  try {
    await requireEditor()
    const nombreClean = nombre.trim()
    if (!nombreClean) return { error: "El nombre del rol es obligatorio" }
    const supabase = await createClient()

    const { data: maxRow } = await supabase
      .from("requisitos_legales_raci_roles")
      .select("orden")
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle()
    const orden = ((maxRow?.orden as number | undefined) ?? 0) + 10

    const { data, error } = await supabase
      .from("requisitos_legales_raci_roles")
      .insert({ nombre: nombreClean, orden })
      .select("*")
      .single()
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalRaciRol }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando rol",
    }
  }
}

export async function actualizarRolRaci(
  id: string,
  nombre: string,
): Promise<Result<RequisitoLegalRaciRol>> {
  try {
    await requireEditor()
    const nombreClean = nombre.trim()
    if (!nombreClean) return { error: "El nombre del rol es obligatorio" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("requisitos_legales_raci_roles")
      .update({ nombre: nombreClean })
      .eq("id", id)
      .select("*")
      .single()
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalRaciRol }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando rol",
    }
  }
}

export async function eliminarRolRaci(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    // Limpiar las asignaciones del rol en todas las filas
    const { data: filas, error: errFilas } = await supabase
      .from("requisitos_legales_raci_filas")
      .select("id, asignaciones")
    if (errFilas) return { error: errFilas.message }

    for (const fila of filas ?? []) {
      const asignaciones = (fila.asignaciones ?? {}) as Record<string, string>
      if (id in asignaciones) {
        delete asignaciones[id]
        const { error: errUpd } = await supabase
          .from("requisitos_legales_raci_filas")
          .update({ asignaciones })
          .eq("id", fila.id)
        if (errUpd) return { error: errUpd.message }
      }
    }

    const { error } = await supabase
      .from("requisitos_legales_raci_roles")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando rol",
    }
  }
}

// =============================================
// Config de alertas
// =============================================

export async function listAlertasConfig(): Promise<
  Result<RequisitoLegalAlertaConfig[]>
> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("requisitos_legales_alertas_config")
      .select("*")
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data ?? []) as RequisitoLegalAlertaConfig[] }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando configuración",
    }
  }
}
