"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Mi CIL — el chofer u operador carga su propia tarea de Limpieza, Inspección y
 * Lubricación (DPO Flota 4.1).
 *
 * Existe porque hasta hoy la única forma de cargar una tarea CIL era
 * `/vehiculos/mantenimiento` → Check lists → Tareas CIL, y esa pantalla exige
 * rol admin o supervisor: el chofer figuraba sólo como texto en el campo
 * `operario`, es decir que alguien la cargaba POR él. Con 6 unidades y meta de
 * 30 tareas al mes, eso convierte al supervisor en transcriptor y hace que la
 * meta dependa de que se acuerde.
 *
 * Escribe en la MISMA tabla `mantenimiento_cil` que la pantalla de supervisión,
 * así que el KPI, el tablero y la evidencia del 4.1 no cambian en nada.
 *
 * 🚨 La foto es obligatoria acá y opcional del lado del supervisor: el requisito
 * R4.2.6 pide demostrar que la limpieza se ejecuta según el estándar, y una fila
 * cargada sin foto no lo demuestra.
 */

import { TAREAS_CIL, META_CIL_MENSUAL } from "@/lib/flota/cil-tareas"

const BUCKET = "mantenimiento-evidencias"

export interface UnidadCil {
  dominio: string
  tipo: string | null
  numero: string | null
}

export interface MiTareaCil {
  id: string
  fecha: string
  dominio: string
  tarea: string
  descripcion: string | null
  foto_url: string | null
}

export interface MiCilData {
  /** Unidades activas sobre las que se puede cargar una tarea. */
  unidades: UnidadCil[]
  /** Lo que cargó esta persona, de lo más nuevo a lo más viejo. */
  mias: MiTareaCil[]
  /** Tareas de TODA la operación en el mes en curso, contra la meta. */
  mesTotal: number
  metaMes: number
  nombre: string
}

function ymActual(): string {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  return s.slice(0, 7)
}

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export async function getMiCil(): Promise<{ data: MiCilData } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const ym = ymActual()

    const [vehRes, misRes, mesRes] = await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo")
        .eq("active", true)
        .order("dominio"),
      supabase
        .from("mantenimiento_cil")
        .select("id, fecha, dominio, tarea, descripcion, foto_url")
        .eq("created_by", profile.id)
        .order("fecha", { ascending: false })
        .limit(20),
      supabase
        .from("mantenimiento_cil")
        .select("id")
        .gte("fecha", `${ym}-01`),
    ])

    if (vehRes.error) return { error: vehRes.error.message }
    if (misRes.error) return { error: misRes.error.message }

    // El número de flota vive en la ficha, no en el catálogo: se muestra junto
    // al dominio porque es como el chofer llama a su unidad.
    const dominios = (vehRes.data || []).map((v) => v.dominio)
    const { data: fichas } = await supabase
      .from("vehiculos_ficha")
      .select("dominio, numero_asignado")
      .in("dominio", dominios)
    const numeros = new Map(
      (fichas || []).map((f: { dominio: string; numero_asignado: string | null }) => [
        f.dominio,
        f.numero_asignado,
      ]),
    )

    return {
      data: {
        unidades: (vehRes.data || []).map((v) => ({
          dominio: v.dominio,
          tipo: v.tipo,
          numero: numeros.get(v.dominio) ?? null,
        })),
        mias: (misRes.data || []) as MiTareaCil[],
        mesTotal: (mesRes.data || []).length,
        metaMes: META_CIL_MENSUAL,
        nombre: profile.nombre ?? "",
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function createMiTareaCil(
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const dominio = String(formData.get("dominio") || "").trim().toUpperCase()
    const tareaId = String(formData.get("tarea") || "").trim()
    const descripcion = String(formData.get("descripcion") || "").trim()
    const tarea = TAREAS_CIL.find((t) => t.id === tareaId)

    if (!dominio) return { error: "Elegí la unidad." }
    if (!tarea) return { error: "Elegí qué tarea hiciste." }

    const foto = formData.get("foto")
    if (!(foto instanceof File) || foto.size === 0) {
      return { error: "Falta la foto: sin foto la tarea no queda registrada." }
    }

    // La unidad tiene que existir y estar activa: un dominio tipeado a mano que
    // no está en el catálogo queda huérfano y no suma al KPI de su unidad.
    const { data: veh } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio")
      .eq("dominio", dominio)
      .eq("active", true)
      .maybeSingle()
    if (!veh) return { error: "Esa unidad no está activa en el maestro de flota." }

    const limpio = foto.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const path = `cil/${dominio}/${Date.now()}-${limpio}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, await foto.arrayBuffer(), {
        contentType: foto.type || "image/jpeg",
        upsert: false,
      })
    if (upErr) return { error: upErr.message }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

    const { error } = await supabase.from("mantenimiento_cil").insert({
      fecha: hoyArgentina(),
      dominio,
      tarea: tarea.label,
      operario: profile.nombre ?? "",
      descripcion: descripcion || null,
      foto_url: pub.publicUrl,
      foto_path: path,
      created_by: profile.id,
    })
    if (error) {
      // Si la fila no entra, la foto no queda colgada en el bucket.
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error.message }
    }

    revalidatePath("/mi-cil")
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
