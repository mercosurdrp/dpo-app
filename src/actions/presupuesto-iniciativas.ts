"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import { cleanFileName } from "@/lib/adjuntos-avance"
import type {
  Profile,
  DireccionKpiIniciativa,
  EstadoIniciativaAhorro,
  IniciativaAhorroConDetalle,
  IniciativaEvidencia,
  TipoIniciativaAhorro,
} from "@/types/database"

const BUCKET = "presupuestos"
const REVALIDATE_PATH = "/presupuesto"

type Result<T> = { data: T } | { error: string }

const TIPOS_VALIDOS: TipoIniciativaAhorro[] = [
  "hhee",
  "ausentismo",
  "mermas_wh_del",
  "ocupacion_capacidad",
  "productividad_wh_del",
  "renovacion_flota",
  "cambio_glp",
  "consumo_combustible",
  "otro",
]

const ESTADOS_VALIDOS: EstadoIniciativaAhorro[] = [
  "planificada",
  "en_implementacion",
  "implementada",
  "cancelada",
]

// =============================================
// Helpers
// =============================================

async function requireEditor(): Promise<Profile> {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar iniciativas de ahorro")
  }
  return profile
}

function parseNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim()
  if (s === "") return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

function parseText(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

export async function puedeEditarIniciativas(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
}

// =============================================
// Lectura
// =============================================

export async function listIniciativas(
  anio: number,
): Promise<Result<IniciativaAhorroConDetalle[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("presupuestos_iniciativas")
      .select(
        "*, responsable:profiles!presupuestos_iniciativas_responsable_id_fkey(id, nombre, email)",
      )
      .eq("anio", anio)
      .order("created_at", { ascending: true })

    if (error) return { error: error.message }

    // Evidencias de cada iniciativa (archivos que respaldan la iniciativa
    // entera), en una sola consulta para todas.
    const ids = (data ?? []).map((r) => (r as { id: string }).id)
    const evidPorIni = new Map<string, IniciativaEvidencia[]>()
    if (ids.length > 0) {
      const { data: evid, error: errEvid } = await supabase
        .from("presupuestos_iniciativas_evidencias")
        .select("*")
        .in("iniciativa_id", ids)
        .order("created_at", { ascending: true })
      if (errEvid) return { error: errEvid.message }
      for (const e of (evid ?? []) as IniciativaEvidencia[]) {
        const lista = evidPorIni.get(e.iniciativa_id) ?? []
        lista.push(e)
        evidPorIni.set(e.iniciativa_id, lista)
      }
    }

    const enriched: IniciativaAhorroConDetalle[] = (data ?? []).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        anio: r.anio,
        tipo: r.tipo as TipoIniciativaAhorro,
        tipo_otro: r.tipo_otro,
        titulo: r.titulo,
        descripcion: r.descripcion,
        responsable_id: r.responsable_id,
        fecha_implementacion: r.fecha_implementacion,
        ahorro_comprometido_anual:
          r.ahorro_comprometido_anual !== null
            ? Number(r.ahorro_comprometido_anual)
            : null,
        rubro: r.rubro ?? null,
        ahorro_pct_objetivo:
          r.ahorro_pct_objetivo !== null ? Number(r.ahorro_pct_objetivo) : null,
        presupuesto_rubro_anual:
          r.presupuesto_rubro_anual !== null
            ? Number(r.presupuesto_rubro_anual)
            : null,
        kpi_nombre: r.kpi_nombre,
        kpi_unidad: r.kpi_unidad,
        kpi_linea_base:
          r.kpi_linea_base !== null ? Number(r.kpi_linea_base) : null,
        kpi_objetivo: r.kpi_objetivo !== null ? Number(r.kpi_objetivo) : null,
        kpi_mejor_si: r.kpi_mejor_si as DireccionKpiIniciativa,
        incluida_en_presupuesto: !!r.incluida_en_presupuesto,
        estado: r.estado as EstadoIniciativaAhorro,
        observaciones: r.observaciones,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
        responsable_nombre: r.responsable?.nombre ?? null,
        responsable_email: r.responsable?.email ?? null,
        evidencias: evidPorIni.get(r.id) ?? [],
      }
    })

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando iniciativas",
    }
  }
}

// =============================================
// Mutaciones — iniciativa (cabecera)
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function camposIniciativaDesdeForm(formData: FormData): Record<string, any> {
  const tipoRaw = String(formData.get("tipo") ?? "").trim()
  const tipo: TipoIniciativaAhorro = TIPOS_VALIDOS.includes(
    tipoRaw as TipoIniciativaAhorro,
  )
    ? (tipoRaw as TipoIniciativaAhorro)
    : "otro"

  const estadoRaw = String(formData.get("estado") ?? "").trim()
  const estado: EstadoIniciativaAhorro = ESTADOS_VALIDOS.includes(
    estadoRaw as EstadoIniciativaAhorro,
  )
    ? (estadoRaw as EstadoIniciativaAhorro)
    : "planificada"

  const mejorSiRaw = String(formData.get("kpi_mejor_si") ?? "").trim()
  const kpi_mejor_si: DireccionKpiIniciativa =
    mejorSiRaw === "mayor" ? "mayor" : "menor"

  return {
    tipo,
    tipo_otro: tipo === "otro" ? parseText(formData.get("tipo_otro")) : null,
    titulo: String(formData.get("titulo") ?? "").trim(),
    descripcion: parseText(formData.get("descripcion")),
    responsable_id: parseText(formData.get("responsable_id")),
    fecha_implementacion: parseText(formData.get("fecha_implementacion")),
    ahorro_comprometido_anual: parseNum(
      formData.get("ahorro_comprometido_anual"),
    ),
    // Meta como % del presupuesto anual del rubro. El monto comprometido se
    // calcula en el form y viaja resuelto en ahorro_comprometido_anual; acá se
    // guarda de dónde salió (rubro, % y presupuesto usado) para que sea auditable
    // y no se recalcule solo cuando se vuelva a subir el EERR.
    rubro: parseText(formData.get("rubro")),
    ahorro_pct_objetivo: parseNum(formData.get("ahorro_pct_objetivo")),
    presupuesto_rubro_anual: parseNum(formData.get("presupuesto_rubro_anual")),
    kpi_nombre: parseText(formData.get("kpi_nombre")),
    kpi_unidad: parseText(formData.get("kpi_unidad")),
    kpi_linea_base: parseNum(formData.get("kpi_linea_base")),
    kpi_objetivo: parseNum(formData.get("kpi_objetivo")),
    kpi_mejor_si,
    incluida_en_presupuesto:
      String(formData.get("incluida_en_presupuesto") ?? "") === "true",
    estado,
    observaciones: parseText(formData.get("observaciones")),
  }
}

export async function crearIniciativa(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const anio = parseNum(formData.get("anio"))
    if (anio === null) return { error: "El año es obligatorio" }

    const campos = camposIniciativaDesdeForm(formData)
    if (!campos.titulo) return { error: "El título es obligatorio" }

    const { data, error } = await supabase
      .from("presupuestos_iniciativas")
      .insert({ anio, ...campos, created_by: profile.id })
      .select("id")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando iniciativa",
    }
  }
}

export async function actualizarIniciativa(
  id: string,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const campos = camposIniciativaDesdeForm(formData)
    if (!campos.titulo) return { error: "El título es obligatorio" }

    const { error } = await supabase
      .from("presupuestos_iniciativas")
      .update(campos)
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando iniciativa",
    }
  }
}

export async function eliminarIniciativa(
  id: string,
): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    // Las filas de evidencias caen por CASCADE; los archivos del storage no.
    const { data: evid } = await supabase
      .from("presupuestos_iniciativas_evidencias")
      .select("archivo_url")
      .eq("iniciativa_id", id)
    const paths = ((evid ?? []) as { archivo_url: string }[]).map(
      (e) => e.archivo_url,
    )

    const { error } = await supabase
      .from("presupuestos_iniciativas")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths)
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando iniciativa",
    }
  }
}

// =============================================
// Evidencias de la iniciativa
// =============================================
//
// Respaldan la iniciativa ENTERA (el resumen de Axion con el precio del
// gasoil, la cotización, el acta con Ventas), no un mes ni un trimestre: las
// iniciativas se miran por mes y el mes se calcula solo, así que no hay
// "avance" al que colgarle un archivo.

export async function subirEvidenciaIniciativa(
  iniciativaId: string,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const file = formData.get("evidencia") as File | null
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Elegí un archivo" }
    }
    const path = `iniciativas/${iniciativaId}/${Date.now()}-${cleanFileName(file.name)}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (upErr) return { error: `Subiendo evidencia: ${upErr.message}` }

    const { data, error } = await supabase
      .from("presupuestos_iniciativas_evidencias")
      .insert({
        iniciativa_id: iniciativaId,
        archivo_url: path,
        nombre: file.name,
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (error || !data) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error?.message ?? "No se pudo guardar la evidencia" }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo evidencia",
    }
  }
}

export async function eliminarEvidenciaIniciativa(
  id: string,
): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("presupuestos_iniciativas_evidencias")
      .select("archivo_url")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase
      .from("presupuestos_iniciativas_evidencias")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }

    const path = (actual as { archivo_url: string } | null)?.archivo_url
    if (path) await supabase.storage.from(BUCKET).remove([path])

    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando evidencia",
    }
  }
}
