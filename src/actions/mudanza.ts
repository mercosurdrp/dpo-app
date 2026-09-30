"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import {
  archivosDelForm,
  subirArchivosAvance,
  type ArchivoAvance,
} from "@/lib/adjuntos-avance"
import type {
  MudanzaAvance,
  MudanzaConfig,
  MudanzaEstado,
  MudanzaGasto,
  MudanzaGastoEstado,
  MudanzaMiembro,
  MudanzaPartida,
  MudanzaTarea,
} from "@/types/mudanza"

const BUCKET = "mudanza"
const REVALIDATE_PATH = "/mudanza"
const EDITORES = ["admin", "supervisor", "admin_rrhh"]
const ESTADOS: MudanzaEstado[] = ["pendiente", "en_curso", "hecha", "bloqueada"]

type Result<T> = { data: T } | { error: string }

function msg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

async function requireEditor() {
  const profile = await requireAuth()
  if (!EDITORES.includes(profile.role)) {
    throw new Error("No tenés permiso para editar la mudanza")
  }
  return profile
}

export async function puedeEditarMudanza(): Promise<boolean> {
  const profile = await getProfile()
  return !!profile && EDITORES.includes(profile.role)
}

export async function getUsuarioActualId(): Promise<string | null> {
  const profile = await getProfile()
  return profile?.id ?? null
}

function str(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null
}
function fecha(formData: FormData, key: string): string | null {
  const v = str(formData, key)
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
function entero(formData: FormData, key: string, def = 0): number {
  const n = Number(String(formData.get(key) ?? "").replace(",", "."))
  return Number.isFinite(n) ? Math.round(n) : def
}
function monto(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim()
  // Acepta "1.234.567,89" y "1234567.89"
  const norm =
    raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw
  const n = Number(norm)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
function estadoDe(formData: FormData, key = "estado"): MudanzaEstado {
  const v = str(formData, key) as MudanzaEstado | null
  return v && ESTADOS.includes(v) ? v : "pendiente"
}

// ---------- Lecturas ----------

export async function getConfig(): Promise<Result<MudanzaConfig | null>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mudanza_config")
      .select("*")
      .eq("id", "default")
      .maybeSingle()
    if (error) {
      // Tenant sin el módulo: la página lo muestra como "falta aplicar la migración"
      if (error.code === "42P01") return { data: null }
      return { error: error.message }
    }
    return { data: (data as MudanzaConfig) ?? null }
  } catch (err) {
    return { error: msg(err, "Error al leer la configuración") }
  }
}

export async function listEquipo(): Promise<Result<MudanzaMiembro[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mudanza_equipo")
      .select("profile_id, orden, perfil:profiles!mudanza_equipo_profile_id_fkey(id, nombre, email)")
      .order("orden")
    if (error) return { error: error.message }
    const rows = (data ?? []) as unknown as {
      profile_id: string
      orden: number
      perfil: { id: string; nombre: string; email: string | null } | null
    }[]
    return {
      data: rows.map((r) => ({
        profile_id: r.profile_id,
        orden: r.orden,
        nombre: r.perfil?.nombre ?? "(sin perfil)",
        email: r.perfil?.email ?? null,
      })),
    }
  } catch (err) {
    return { error: msg(err, "Error al leer el equipo") }
  }
}

export async function listPerfilesActivos(): Promise<
  Result<{ id: string; nombre: string; email: string | null }[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nombre, email")
      .eq("active", true)
      .neq("role", "empleado")
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data ?? []) as { id: string; nombre: string; email: string | null }[] }
  } catch (err) {
    return { error: msg(err, "Error al leer perfiles") }
  }
}

export async function listTareas(): Promise<Result<MudanzaTarea[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mudanza_tareas")
      .select("*, responsable:profiles!mudanza_tareas_responsable_id_fkey(id, nombre)")
      .order("orden")
      .order("created_at")
    if (error) return { error: error.message }
    const rows = (data ?? []) as unknown as (Omit<MudanzaTarea, "responsable_nombre"> & {
      responsable: { id: string; nombre: string } | null
    })[]
    return {
      data: rows.map(({ responsable, ...t }) => ({
        ...t,
        avance: Number(t.avance ?? 0),
        responsable_nombre: responsable?.nombre ?? null,
      })),
    }
  } catch (err) {
    return { error: msg(err, "Error al leer tareas") }
  }
}

export async function listAvances(): Promise<Result<MudanzaAvance[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mudanza_avances")
      .select("*, autor:profiles!mudanza_avances_created_by_fkey(id, nombre)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)
    if (error) return { error: error.message }
    const rows = (data ?? []) as unknown as (Omit<MudanzaAvance, "autor_nombre"> & {
      autor: { id: string; nombre: string } | null
    })[]
    return {
      data: rows.map(({ autor, ...a }) => ({
        ...a,
        archivos: Array.isArray(a.archivos) ? (a.archivos as ArchivoAvance[]) : [],
        autor_nombre: autor?.nombre ?? null,
      })),
    }
  } catch (err) {
    return { error: msg(err, "Error al leer avances") }
  }
}

export async function listPartidas(): Promise<Result<MudanzaPartida[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mudanza_partidas")
      .select("*")
      .order("orden")
      .order("created_at")
    if (error) return { error: error.message }
    return {
      data: ((data ?? []) as MudanzaPartida[]).map((p) => ({
        ...p,
        cantidad: Number(p.cantidad),
        unitario: Number(p.unitario),
        monto: Number(p.monto),
      })),
    }
  } catch (err) {
    return { error: msg(err, "Error al leer partidas") }
  }
}

export async function listGastos(): Promise<Result<MudanzaGasto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mudanza_gastos")
      .select("*, partida:mudanza_partidas!mudanza_gastos_partida_id_fkey(id, nombre)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }
    const rows = (data ?? []) as unknown as (Omit<MudanzaGasto, "partida_nombre"> & {
      partida: { id: string; nombre: string } | null
    })[]
    return {
      data: rows.map(({ partida, ...g }) => ({
        ...g,
        monto: Number(g.monto),
        archivos: Array.isArray(g.archivos) ? (g.archivos as ArchivoAvance[]) : [],
        partida_nombre: partida?.nombre ?? null,
      })),
    }
  } catch (err) {
    return { error: msg(err, "Error al leer gastos") }
  }
}

export async function getSignedUrlMudanza(path: string): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
    if (error || !data) return { error: error?.message ?? "No se pudo firmar la URL" }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return { error: msg(err, "Error al abrir el archivo") }
  }
}

// ---------- Configuración y equipo ----------

export async function guardarConfig(formData: FormData): Promise<Result<MudanzaConfig>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const body = {
      id: "default",
      nombre: str(formData, "nombre") ?? 'Mudanza "Express a San Nicolás"',
      fecha_llaves: fecha(formData, "fecha_llaves"),
      fecha_mudanza: fecha(formData, "fecha_mudanza"),
    }
    const { data, error } = await supabase
      .from("mudanza_config")
      .upsert(body, { onConflict: "id" })
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as MudanzaConfig }
  } catch (err) {
    return { error: msg(err, "Error al guardar la configuración") }
  }
}

export async function agregarMiembro(profileId: string): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data: max } = await supabase
      .from("mudanza_equipo")
      .select("orden")
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await supabase
      .from("mudanza_equipo")
      .upsert({ profile_id: profileId, orden: ((max?.orden as number) ?? 0) + 10 }, { onConflict: "profile_id" })
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: true }
  } catch (err) {
    return { error: msg(err, "Error al agregar al equipo") }
  }
}

export async function quitarMiembro(profileId: string): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase.from("mudanza_equipo").delete().eq("profile_id", profileId)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: true }
  } catch (err) {
    return { error: msg(err, "Error al quitar del equipo") }
  }
}

// ---------- Tareas ----------

export async function guardarTarea(formData: FormData): Promise<Result<MudanzaTarea>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()
    const id = str(formData, "id")
    const hito = formData.get("hito") === "on" || formData.get("hito") === "true"
    const inicio = fecha(formData, "inicio")
    let fin = fecha(formData, "fin")
    if (hito && inicio) fin = inicio
    if ((inicio && !fin) || (!inicio && fin)) {
      return { error: "Poné inicio y fin planificados, o dejá los dos vacíos." }
    }
    if (inicio && fin && fin < inicio) return { error: "El fin no puede ser antes del inicio." }
    const inicioReal = fecha(formData, "inicio_real")
    let finReal = fecha(formData, "fin_real")
    if (hito && inicioReal) finReal = inicioReal
    if (inicioReal && finReal && finReal < inicioReal) {
      return { error: "El fin real no puede ser antes del inicio real." }
    }
    const estado = estadoDe(formData)
    const nombre = str(formData, "nombre")
    if (!nombre) return { error: "La tarea necesita un nombre." }
    const body = {
      rubro: str(formData, "rubro") ?? "Sin rubro",
      nombre,
      responsable_id: str(formData, "responsable_id"),
      inicio,
      fin,
      inicio_real: inicioReal,
      fin_real: finReal,
      estado,
      avance: estado === "hecha" ? 100 : Math.max(0, Math.min(100, entero(formData, "avance"))),
      hito,
      notas: str(formData, "notas"),
    }
    let q
    if (id) {
      q = supabase.from("mudanza_tareas").update(body).eq("id", id)
    } else {
      const { data: max } = await supabase
        .from("mudanza_tareas")
        .select("orden")
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle()
      q = supabase.from("mudanza_tareas").insert({
        ...body,
        orden: ((max?.orden as number) ?? 0) + 10,
        created_by: profile.id,
      })
    }
    const { data, error } = await q.select("*").single()
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: { ...(data as MudanzaTarea), responsable_nombre: null } }
  } catch (err) {
    return { error: msg(err, "Error al guardar la tarea") }
  }
}

/**
 * Cambia el avance desde el desplegable de la lista (de 10 en 10). Ajusta el
 * estado y las fechas reales: el primer avance fija inicio_real, 100 % marca
 * la tarea hecha y fija fin_real. Lo puede hacer un editor o el responsable.
 */
export async function setAvanceTarea(tareaId: string, avance: number): Promise<Result<true>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const av = Math.max(0, Math.min(100, Math.round(avance / 10) * 10))
    const { data: tarea, error: tErr } = await supabase
      .from("mudanza_tareas")
      .select("id, responsable_id, estado, inicio_real, fin_real")
      .eq("id", tareaId)
      .single()
    if (tErr || !tarea) return { error: tErr?.message ?? "Tarea no encontrada" }
    if (!EDITORES.includes(profile.role) && tarea.responsable_id !== profile.id) {
      return { error: "Sólo el responsable de la tarea o un editor pueden cambiar el avance." }
    }
    const hoy = new Date().toISOString().slice(0, 10)
    const patch: Record<string, unknown> = { avance: av }
    if (av === 100) {
      patch.estado = "hecha"
      patch.fin_real = tarea.fin_real ?? hoy
      if (!tarea.inicio_real) patch.inicio_real = hoy
    } else {
      if (tarea.estado === "hecha") patch.estado = av === 0 ? "pendiente" : "en_curso"
      else if (tarea.estado === "pendiente" && av > 0) patch.estado = "en_curso"
      if (av > 0 && !tarea.inicio_real) patch.inicio_real = hoy
      if (tarea.fin_real) patch.fin_real = null
    }
    const { error } = await supabase.from("mudanza_tareas").update(patch).eq("id", tareaId)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: true }
  } catch (err) {
    return { error: msg(err, "Error al cambiar el avance") }
  }
}

export async function borrarTarea(id: string): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase.from("mudanza_tareas").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: true }
  } catch (err) {
    return { error: msg(err, "Error al borrar la tarea") }
  }
}

/**
 * Registra un avance en la bitácora y actualiza la tarea (avance, estado,
 * inicio_real al primer avance y fin_real cuando queda hecha). Lo puede
 * hacer un editor o el responsable de la tarea (RLS lo controla).
 */
export async function registrarAvance(formData: FormData): Promise<Result<MudanzaAvance>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const tareaId = str(formData, "tarea_id")
    if (!tareaId) return { error: "Falta la tarea." }
    const { data: tarea, error: tErr } = await supabase
      .from("mudanza_tareas")
      .select("id, responsable_id, inicio_real, fin_real, hito")
      .eq("id", tareaId)
      .single()
    if (tErr || !tarea) return { error: tErr?.message ?? "Tarea no encontrada" }
    const esEditor = EDITORES.includes(profile.role)
    if (!esEditor && tarea.responsable_id !== profile.id) {
      return { error: "Sólo el responsable de la tarea o un editor pueden cargar avances." }
    }
    const estado = estadoDe(formData, "estado")
    const avance = estado === "hecha" ? 100 : Math.max(0, Math.min(100, entero(formData, "avance")))
    const fechaAv = fecha(formData, "fecha") ?? new Date().toISOString().slice(0, 10)
    const comentario = str(formData, "comentario")
    const files = archivosDelForm(formData, "archivo")
    let archivos: ArchivoAvance[] = []
    if (files.length) {
      const up = await subirArchivosAvance(supabase, BUCKET, `avances/${tareaId}`, files)
      if ("error" in up) return { error: up.error }
      archivos = up.archivos
    }
    const { data, error } = await supabase
      .from("mudanza_avances")
      .insert({
        tarea_id: tareaId,
        fecha: fechaAv,
        avance,
        estado,
        comentario,
        archivos,
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (error) {
      if (archivos.length) {
        await supabase.storage.from(BUCKET).remove(archivos.map((a) => a.path))
      }
      return { error: error.message }
    }
    const patch: Record<string, unknown> = { avance, estado }
    if (!tarea.inicio_real && estado !== "pendiente") patch.inicio_real = fechaAv
    if (estado === "hecha") patch.fin_real = tarea.fin_real ?? fechaAv
    else if (tarea.fin_real) patch.fin_real = null
    if (tarea.hito && estado === "hecha") patch.inicio_real = tarea.inicio_real ?? fechaAv
    const { error: uErr } = await supabase.from("mudanza_tareas").update(patch).eq("id", tareaId)
    if (uErr) return { error: uErr.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: { ...(data as MudanzaAvance), archivos, autor_nombre: profile.nombre } }
  } catch (err) {
    return { error: msg(err, "Error al registrar el avance") }
  }
}

export async function borrarAvance(id: string): Promise<Result<true>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data: av } = await supabase
      .from("mudanza_avances")
      .select("archivos")
      .eq("id", id)
      .maybeSingle()
    const { error } = await supabase.from("mudanza_avances").delete().eq("id", id)
    if (error) return { error: error.message }
    const archivos = Array.isArray(av?.archivos) ? (av!.archivos as ArchivoAvance[]) : []
    if (archivos.length) {
      await supabase.storage.from(BUCKET).remove(archivos.map((a) => a.path))
    }
    revalidatePath(REVALIDATE_PATH)
    return { data: true }
  } catch (err) {
    return { error: msg(err, "Error al borrar el avance") }
  }
}

// ---------- Presupuesto ----------

export async function guardarPartida(formData: FormData): Promise<Result<MudanzaPartida>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()
    const id = str(formData, "id")
    const nombre = str(formData, "nombre")
    if (!nombre) return { error: "La partida necesita un nombre." }
    const cantidad = monto(formData, "cantidad") || 1
    const unitario = monto(formData, "unitario")
    const body = {
      rubro: str(formData, "rubro") ?? "Sin rubro",
      nombre,
      cantidad,
      unitario,
      monto: Math.round(cantidad * unitario * 100) / 100,
      notas: str(formData, "notas"),
    }
    let q
    if (id) {
      q = supabase.from("mudanza_partidas").update(body).eq("id", id)
    } else {
      const { data: max } = await supabase
        .from("mudanza_partidas")
        .select("orden")
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle()
      q = supabase.from("mudanza_partidas").insert({
        ...body,
        orden: ((max?.orden as number) ?? 0) + 10,
        created_by: profile.id,
      })
    }
    const { data, error } = await q.select("*").single()
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as MudanzaPartida }
  } catch (err) {
    return { error: msg(err, "Error al guardar la partida") }
  }
}

export async function borrarPartida(id: string): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase.from("mudanza_partidas").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: true }
  } catch (err) {
    return { error: msg(err, "Error al borrar la partida") }
  }
}

export async function guardarGasto(formData: FormData): Promise<Result<MudanzaGasto>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()
    const id = str(formData, "id") ?? crypto.randomUUID()
    const esNuevo = !str(formData, "id")
    const concepto = str(formData, "concepto")
    if (!concepto) return { error: "El gasto necesita un concepto." }
    const estado = (str(formData, "estado") as MudanzaGastoEstado | null) ?? "pagado"
    const partidaId = str(formData, "partida_id")
    let rubro = str(formData, "rubro")
    if (partidaId && !rubro) {
      const { data: p } = await supabase
        .from("mudanza_partidas")
        .select("rubro")
        .eq("id", partidaId)
        .maybeSingle()
      rubro = (p?.rubro as string | undefined) ?? null
    }
    const files = archivosDelForm(formData, "archivo")
    let nuevos: ArchivoAvance[] = []
    if (files.length) {
      const up = await subirArchivosAvance(supabase, BUCKET, `gastos/${id}`, files)
      if ("error" in up) return { error: up.error }
      nuevos = up.archivos
    }
    const body: Record<string, unknown> = {
      partida_id: partidaId,
      tarea_id: str(formData, "tarea_id"),
      rubro: rubro ?? "Sin rubro",
      fecha: fecha(formData, "fecha") ?? new Date().toISOString().slice(0, 10),
      proveedor: str(formData, "proveedor"),
      concepto,
      monto: monto(formData, "monto"),
      estado: estado === "comprometido" ? "comprometido" : "pagado",
      notas: str(formData, "notas"),
    }
    let q
    if (esNuevo) {
      q = supabase
        .from("mudanza_gastos")
        .insert({ id, ...body, archivos: nuevos, created_by: profile.id })
    } else {
      const { data: prev } = await supabase
        .from("mudanza_gastos")
        .select("archivos")
        .eq("id", id)
        .maybeSingle()
      const previos = Array.isArray(prev?.archivos) ? (prev!.archivos as ArchivoAvance[]) : []
      q = supabase
        .from("mudanza_gastos")
        .update({ ...body, archivos: [...previos, ...nuevos] })
        .eq("id", id)
    }
    const { data, error } = await q.select("*").single()
    if (error) {
      if (nuevos.length) await supabase.storage.from(BUCKET).remove(nuevos.map((a) => a.path))
      return { error: error.message }
    }
    revalidatePath(REVALIDATE_PATH)
    const g = data as MudanzaGasto
    return {
      data: {
        ...g,
        monto: Number(g.monto),
        archivos: Array.isArray(g.archivos) ? g.archivos : [],
        partida_nombre: null,
      },
    }
  } catch (err) {
    return { error: msg(err, "Error al guardar el gasto") }
  }
}

export async function borrarGasto(id: string): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data: g } = await supabase
      .from("mudanza_gastos")
      .select("archivos")
      .eq("id", id)
      .maybeSingle()
    const { error } = await supabase.from("mudanza_gastos").delete().eq("id", id)
    if (error) return { error: error.message }
    const archivos = Array.isArray(g?.archivos) ? (g!.archivos as ArchivoAvance[]) : []
    if (archivos.length) {
      await supabase.storage.from(BUCKET).remove(archivos.map((a) => a.path))
    }
    revalidatePath(REVALIDATE_PATH)
    return { data: true }
  } catch (err) {
    return { error: msg(err, "Error al borrar el gasto") }
  }
}
