"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { S5Categoria, S5ItemCatalogo } from "@/types/database"

const MI_PATH = "/mi-5s"
const DASHBOARD_PATH = "/5s"

export interface S5TareaSector {
  id: string
  periodo: string
  sector_numero: number
  categoria: S5Categoria | null
  titulo: string
  descripcion: string | null
  orden: number
  activo: boolean
}

export interface S5EvidenciaSector {
  id: string
  periodo: string
  sector_numero: number
  item_id: string | null
  tarea_id: string | null
  categoria: S5Categoria | null
  comentario: string
  storage_path: string | null
  created_at: string
  autor_nombre: string
  es_mia: boolean
}

export interface MiSector5S {
  /** Período vigente (YYYY-MM-01). */
  periodo: string
  /** null = este mes no me tocó ningún sector. */
  sector_numero: number | null
  sector_nombre: string | null
  /** Ítems del checklist con el que después lo auditan. */
  checklist: S5ItemCatalogo[]
  /** Tareas puntuales cargadas para ese sector y mes. */
  tareas: S5TareaSector[]
  evidencias: S5EvidenciaSector[]
  /** Nota de la última auditoría del sector (referencia de dónde está parado). */
  ultima_nota: number | null
  ultima_fecha: string | null
  /** Días que quedan del mes, para el contador del tablero. */
  dias_restantes: number
}

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`
}

function diasRestantesDelMes(): number {
  const hoy = new Date()
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  return ultimo - hoy.getDate()
}

/**
 * Sector que le tocó al usuario logueado este mes, con su checklist,
 * sus tareas y lo que ya cargó. Es lo que alimenta /mi-5s y el recuadro
 * verde del tablero del operario.
 */
export async function getMiSector5S(): Promise<
  { data: MiSector5S } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const periodo = periodoActual()

    const { data: empleado } = await supabase
      .from("empleados")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle()

    const vacio: MiSector5S = {
      periodo,
      sector_numero: null,
      sector_nombre: null,
      checklist: [],
      tareas: [],
      evidencias: [],
      ultima_nota: null,
      ultima_fecha: null,
      dias_restantes: diasRestantesDelMes(),
    }

    if (!empleado) return { data: vacio }

    const { data: resp } = await supabase
      .from("s5_sector_responsables")
      .select("sector_numero")
      .eq("periodo", periodo)
      .eq("empleado_id", empleado.id)
      .maybeSingle()

    if (!resp) return { data: vacio }

    const sector = resp.sector_numero as number

    const [sectorRes, itemsRes, tareasRes, evidRes, auditRes] = await Promise.all([
      supabase.from("s5_sectores_almacen").select("nombre").eq("numero", sector).maybeSingle(),
      supabase
        .from("s5_items_catalogo")
        .select("*")
        .eq("tipo", "almacen")
        .eq("activo", true)
        .order("orden", { ascending: true }),
      supabase
        .from("s5_tareas_sector")
        .select("*")
        .eq("periodo", periodo)
        .eq("sector_numero", sector)
        .eq("activo", true)
        .order("orden", { ascending: true }),
      supabase
        .from("s5_evidencias_sector")
        .select("*, autor:profiles!s5_evidencias_sector_profile_id_fkey(nombre)")
        .eq("periodo", periodo)
        .eq("sector_numero", sector)
        .order("created_at", { ascending: false }),
      supabase
        .from("s5_auditorias")
        .select("nota_total, fecha")
        .eq("tipo", "almacen")
        .eq("sector_numero", sector)
        .eq("estado", "completada")
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return {
      data: {
        periodo,
        sector_numero: sector,
        sector_nombre: sectorRes.data?.nombre ?? `Sector ${sector}`,
        checklist: (itemsRes.data ?? []) as S5ItemCatalogo[],
        tareas: (tareasRes.data ?? []) as S5TareaSector[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evidencias: ((evidRes.data ?? []) as any[]).map((row) => ({
          id: row.id,
          periodo: row.periodo,
          sector_numero: row.sector_numero,
          item_id: row.item_id,
          tarea_id: row.tarea_id,
          categoria: row.categoria,
          comentario: row.comentario,
          storage_path: row.storage_path,
          created_at: row.created_at,
          autor_nombre: row.autor?.nombre ?? "—",
          es_mia: row.profile_id === profile.id,
        })),
        ultima_nota: auditRes.data?.nota_total ?? null,
        ultima_fecha: auditRes.data?.fecha ?? null,
        dias_restantes: diasRestantesDelMes(),
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando tu sector 5S" }
  }
}

/**
 * Carpeta donde el responsable puede subir según la política de storage:
 * sector/{periodo}/{sector_numero}/...
 */
export async function getCarpetaEvidencia5S(): Promise<
  { data: { carpeta: string; periodo: string; sector: number } } | { error: string }
> {
  const res = await getMiSector5S()
  if ("error" in res) return { error: res.error }
  if (res.data.sector_numero === null) return { error: "Este mes no sos responsable de ningún sector" }
  const { periodo, sector_numero } = res.data
  return {
    data: {
      carpeta: `sector/${periodo}/${sector_numero}`,
      periodo,
      sector: sector_numero,
    },
  }
}

export async function cargarEvidencia5S(input: {
  comentario: string
  itemId?: string | null
  tareaId?: string | null
  categoria?: S5Categoria | null
  storagePath?: string | null
  mimeType?: string | null
  tamanoBytes?: number | null
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const comentario = input.comentario.trim()
    if (!comentario) return { error: "Escribí un comentario de lo que hiciste" }

    const periodo = periodoActual()

    const { data: empleado } = await supabase
      .from("empleados")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle()
    if (!empleado) return { error: "Tu usuario no está vinculado a un legajo" }

    const { data: resp } = await supabase
      .from("s5_sector_responsables")
      .select("sector_numero")
      .eq("periodo", periodo)
      .eq("empleado_id", empleado.id)
      .maybeSingle()
    if (!resp) return { error: "Este mes no sos responsable de ningún sector" }

    const { error } = await supabase.from("s5_evidencias_sector").insert({
      periodo,
      sector_numero: resp.sector_numero,
      item_id: input.itemId || null,
      tarea_id: input.tareaId || null,
      categoria: input.categoria || null,
      comentario,
      storage_path: input.storagePath || null,
      mime_type: input.mimeType || null,
      tamano_bytes: input.tamanoBytes ?? null,
      profile_id: profile.id,
      empleado_id: empleado.id,
    })
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la evidencia" }
  }
}

export async function borrarEvidencia5S(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase.from("s5_evidencias_sector").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error borrando la evidencia" }
  }
}

export async function getEvidenciaSectorUrl(
  path: string
): Promise<{ data: { url: string } } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from("s5-auditorias")
      .createSignedUrl(path, 60 * 10)
    if (error) return { error: error.message }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando URL" }
  }
}

// ===================================================
// Panel del auditor: tareas del mes por sector
// ===================================================

export interface SectorConEvidencias {
  sector_numero: number
  sector_nombre: string
  responsable_nombre: string | null
  tareas: S5TareaSector[]
  evidencias: S5EvidenciaSector[]
}

/**
 * Vista del mes completo (los 4 sectores) para el panel 5S: quién es
 * responsable, qué tareas tiene y qué evidencia subió.
 */
export async function getPanelSectores5S(
  periodo: string
): Promise<{ data: SectorConEvidencias[] } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const [sectoresRes, respRes, tareasRes, evidRes] = await Promise.all([
      supabase.from("s5_sectores_almacen").select("*").order("numero"),
      supabase
        .from("s5_sector_responsables")
        .select("sector_numero, empleado:empleados!s5_sector_responsables_empleado_id_fkey(nombre)")
        .eq("periodo", periodo),
      supabase
        .from("s5_tareas_sector")
        .select("*")
        .eq("periodo", periodo)
        .order("orden", { ascending: true }),
      supabase
        .from("s5_evidencias_sector")
        .select("*, autor:profiles!s5_evidencias_sector_profile_id_fkey(nombre)")
        .eq("periodo", periodo)
        .order("created_at", { ascending: false }),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const respPorSector = new Map<number, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (respRes.data ?? []) as any[]) {
      respPorSector.set(r.sector_numero, r.empleado?.nombre ?? null)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evidencias: S5EvidenciaSector[] = ((evidRes.data ?? []) as any[]).map((row) => ({
      id: row.id,
      periodo: row.periodo,
      sector_numero: row.sector_numero,
      item_id: row.item_id,
      tarea_id: row.tarea_id,
      categoria: row.categoria,
      comentario: row.comentario,
      storage_path: row.storage_path,
      created_at: row.created_at,
      autor_nombre: row.autor?.nombre ?? "—",
      es_mia: row.profile_id === profile.id,
    }))

    const tareas = (tareasRes.data ?? []) as S5TareaSector[]

    const data: SectorConEvidencias[] = (sectoresRes.data ?? []).map((s) => ({
      sector_numero: s.numero,
      sector_nombre: s.nombre,
      responsable_nombre: respPorSector.get(s.numero) ?? null,
      tareas: tareas.filter((t) => t.sector_numero === s.numero && t.activo),
      evidencias: evidencias.filter((e) => e.sector_numero === s.numero),
    }))

    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el panel" }
  }
}

export async function crearTareaSector(input: {
  periodo: string
  sectorNumero: number
  titulo: string
  descripcion?: string | null
  categoria?: S5Categoria | null
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin" && profile.role !== "auditor") {
      return { error: "No tenés permiso" }
    }
    const titulo = input.titulo.trim()
    if (!titulo) return { error: "Falta el título de la tarea" }

    const supabase = await createClient()
    const { error } = await supabase.from("s5_tareas_sector").insert({
      periodo: input.periodo,
      sector_numero: input.sectorNumero,
      titulo,
      descripcion: input.descripcion?.trim() || null,
      categoria: input.categoria || null,
      creado_por: profile.id,
    })
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la tarea" }
  }
}

export async function borrarTareaSector(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin" && profile.role !== "auditor") {
      return { error: "No tenés permiso" }
    }
    const supabase = await createClient()
    const { error } = await supabase.from("s5_tareas_sector").update({ activo: false }).eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error borrando la tarea" }
  }
}
