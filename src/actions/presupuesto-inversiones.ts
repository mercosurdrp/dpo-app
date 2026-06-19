"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import type {
  Profile,
  CategoriaInversion,
  EstadoInversion,
  InversionConDetalle,
} from "@/types/database"

const BUCKET = "presupuestos"
const REVALIDATE_PATH = "/presupuesto"

type Result<T> = { data: T } | { error: string }

const CATEGORIAS_VALIDAS: CategoriaInversion[] = [
  "flota",
  "equipos_almacen",
  "tecnologia",
  "infraestructura",
  "otro",
]

const ESTADOS_VALIDOS: EstadoInversion[] = [
  "programada",
  "aprobada",
  "en_curso",
  "realizada",
  "cancelada",
]

// =============================================
// Helpers
// =============================================

async function requireEditor(): Promise<Profile> {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar inversiones")
  }
  return profile
}

function cleanFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function parseNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim()
  if (s === "") return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

function parseInt0(v: FormDataEntryValue | null): number | null {
  const n = parseNum(v)
  return n === null ? null : Math.round(n)
}

function parseText(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

export async function puedeEditarInversiones(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
}

// =============================================
// Lectura
// =============================================

export async function listInversiones(
  anio: number,
): Promise<Result<InversionConDetalle[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("presupuestos_inversiones")
      .select(
        "*, responsable:profiles!presupuestos_inversiones_responsable_id_fkey(id, nombre, email)",
      )
      .eq("anio", anio)
      .order("fecha_programada", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })

    if (error) return { error: error.message }

    const enriched: InversionConDetalle[] = (data ?? []).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        anio: r.anio,
        titulo: r.titulo,
        categoria: r.categoria as CategoriaInversion,
        cantidad: r.cantidad !== null ? Number(r.cantidad) : null,
        descripcion: r.descripcion,
        beneficio_esperado: r.beneficio_esperado,
        kpi_nombre: r.kpi_nombre,
        kpi_unidad: r.kpi_unidad,
        kpi_objetivo: r.kpi_objetivo !== null ? Number(r.kpi_objetivo) : null,
        proveedor: r.proveedor,
        fecha_programada: r.fecha_programada,
        monto_estimado:
          r.monto_estimado !== null ? Number(r.monto_estimado) : null,
        estado: r.estado as EstadoInversion,
        fecha_realizada: r.fecha_realizada,
        monto_real: r.monto_real !== null ? Number(r.monto_real) : null,
        evidencia_url: r.evidencia_url,
        evidencia_nombre: r.evidencia_nombre,
        responsable_id: r.responsable_id,
        observaciones: r.observaciones,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
        responsable_nombre: r.responsable?.nombre ?? null,
        responsable_email: r.responsable?.email ?? null,
      }
    })

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando inversiones",
    }
  }
}

// =============================================
// Mutaciones
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function camposDesdeForm(formData: FormData): Record<string, any> {
  const categoriaRaw = String(formData.get("categoria") ?? "").trim()
  const categoria: CategoriaInversion = CATEGORIAS_VALIDAS.includes(
    categoriaRaw as CategoriaInversion,
  )
    ? (categoriaRaw as CategoriaInversion)
    : "otro"

  const estadoRaw = String(formData.get("estado") ?? "").trim()
  const estado: EstadoInversion = ESTADOS_VALIDOS.includes(
    estadoRaw as EstadoInversion,
  )
    ? (estadoRaw as EstadoInversion)
    : "programada"

  return {
    titulo: String(formData.get("titulo") ?? "").trim(),
    categoria,
    cantidad: parseInt0(formData.get("cantidad")),
    descripcion: parseText(formData.get("descripcion")),
    beneficio_esperado: parseText(formData.get("beneficio_esperado")),
    kpi_nombre: parseText(formData.get("kpi_nombre")),
    kpi_unidad: parseText(formData.get("kpi_unidad")),
    kpi_objetivo: parseNum(formData.get("kpi_objetivo")),
    proveedor: parseText(formData.get("proveedor")),
    fecha_programada: parseText(formData.get("fecha_programada")),
    monto_estimado: parseNum(formData.get("monto_estimado")),
    estado,
    fecha_realizada: parseText(formData.get("fecha_realizada")),
    monto_real: parseNum(formData.get("monto_real")),
    observaciones: parseText(formData.get("observaciones")),
  }
}

// Sube la evidencia (cotización/factura) al storage. Devuelve {url, nombre} o null.
async function subirEvidencia(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  formData: FormData,
): Promise<{ url: string; nombre: string } | { error: string } | null> {
  const file = formData.get("evidencia") as File | null
  if (!file || !(file instanceof File) || file.size === 0) return null
  const cleanName = cleanFileName(file.name)
  const path = `inversiones/${Date.now()}-${cleanName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
  if (upErr) return { error: `Subiendo evidencia: ${upErr.message}` }
  return { url: path, nombre: file.name }
}

export async function crearInversion(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const anio = parseNum(formData.get("anio"))
    if (anio === null) return { error: "El año es obligatorio" }

    const campos = camposDesdeForm(formData)
    if (!campos.titulo) return { error: "El título es obligatorio" }

    const subida = await subirEvidencia(supabase, formData)
    if (subida && "error" in subida) return { error: subida.error }

    const { data, error } = await supabase
      .from("presupuestos_inversiones")
      .insert({
        anio,
        ...campos,
        evidencia_url: subida?.url ?? null,
        evidencia_nombre: subida?.nombre ?? null,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (error) {
      if (subida) await supabase.storage.from(BUCKET).remove([subida.url])
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando inversión",
    }
  }
}

export async function actualizarInversion(
  id: string,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const campos = camposDesdeForm(formData)
    if (!campos.titulo) return { error: "El título es obligatorio" }

    const subida = await subirEvidencia(supabase, formData)
    if (subida && "error" in subida) return { error: subida.error }

    // Si subió una evidencia nueva, traer la anterior para borrarla luego
    let evidenciaAnterior: string | null = null
    if (subida) {
      const { data: actual } = await supabase
        .from("presupuestos_inversiones")
        .select("evidencia_url")
        .eq("id", id)
        .maybeSingle()
      evidenciaAnterior = actual?.evidencia_url ?? null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = { ...campos }
    if (subida) {
      payload.evidencia_url = subida.url
      payload.evidencia_nombre = subida.nombre
    }

    const { error } = await supabase
      .from("presupuestos_inversiones")
      .update(payload)
      .eq("id", id)

    if (error) {
      if (subida) await supabase.storage.from(BUCKET).remove([subida.url])
      return { error: error.message }
    }

    if (subida && evidenciaAnterior && evidenciaAnterior !== subida.url) {
      await supabase.storage.from(BUCKET).remove([evidenciaAnterior])
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando inversión",
    }
  }
}

export async function eliminarInversion(
  id: string,
): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("presupuestos_inversiones")
      .select("evidencia_url")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase
      .from("presupuestos_inversiones")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    if (actual?.evidencia_url) {
      await supabase.storage.from(BUCKET).remove([actual.evidencia_url])
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando inversión",
    }
  }
}
