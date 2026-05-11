"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import type {
  Profile,
  TipoReunion,
  EstadoReunionActividad,
  ReunionTipoConfig,
  ReunionParticipanteFijo,
  ReunionParticipanteFijoConProfile,
  Reunion,
  ReunionAsistente,
  ReunionAsistenteConProfile,
  ReunionActividad,
  ReunionActividadConResponsable,
  ReunionArchivo,
  ReunionConResumen,
  ReunionDetalle,
  ReunionIndicadorConfig,
  ReunionIndicadorValor,
  ReunionIndicadorConValor,
  ReunionIndicadoresMes,
  AgregacionIndicador,
} from "@/types/database"

const BUCKET = "reuniones"
const REVALIDATE_PATH = "/reuniones"

const DIAS_NOMBRES: Record<number, string> = {
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
  7: "domingo",
}

type Result<T> = { data: T } | { error: string }

// =============================================
// Helpers
// =============================================

async function requireEditor(): Promise<Profile> {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar reuniones")
  }
  return profile
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

function cleanFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

/**
 * Devuelve el día de la semana ISO 8601 (1=lun, ..., 7=dom) de una fecha
 * en formato "YYYY-MM-DD". Se hace en UTC para evitar drift por timezone.
 */
function isoWeekdayFromDateStr(fechaStr: string): number {
  const [y, m, d] = fechaStr.split("-").map((s) => parseInt(s, 10))
  if (!y || !m || !d) return 0
  const dt = new Date(Date.UTC(y, m - 1, d))
  // getUTCDay: 0=dom, 1=lun, ..., 6=sab. ISO: 1=lun, ..., 7=dom.
  const js = dt.getUTCDay()
  return js === 0 ? 7 : js
}

function nombresDias(diasSemana: number[]): string {
  return diasSemana
    .map((d) => DIAS_NOMBRES[d] ?? String(d))
    .join(", ")
}

function truncar(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + "…"
}

// Inserta una notificación in-app para el responsable asignado.
// Internal helper, no exportada como server action.
async function notificarAsignacionActividad(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  responsableId: string,
  descripcion: string,
): Promise<void> {
  try {
    await supabase.from("notificaciones").insert({
      user_id: responsableId,
      tipo: "reunion_actividad_asignada",
      titulo: `Nueva actividad de reunión: ${truncar(descripcion, 60)}`,
      mensaje: "Te asignaron una actividad en una reunión.",
      link: REVALIDATE_PATH,
    })
  } catch {
    // No bloquear la operación si la notificación falla.
  }
}

// =============================================
// Configuración por tipo
// =============================================

export async function getTipoConfig(
  tipo: TipoReunion,
): Promise<Result<ReunionTipoConfig>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reuniones_tipos_config")
      .select("*")
      .eq("tipo", tipo)
      .single()
    if (error) return { error: error.message }
    return { data: data as ReunionTipoConfig }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando configuración",
    }
  }
}

export async function listParticipantesFijos(
  tipo: TipoReunion,
): Promise<Result<ReunionParticipanteFijoConProfile[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reuniones_participantes_fijos")
      .select(
        "*, profile:profiles!reuniones_participantes_fijos_profile_id_fkey(id, nombre, email)",
      )
      .eq("tipo", tipo)
    if (error) return { error: error.message }

    const enriched: ReunionParticipanteFijoConProfile[] = (data ?? []).map(
      (row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any
        return {
          id: r.id,
          tipo: r.tipo as TipoReunion,
          profile_id: r.profile_id,
          created_at: r.created_at,
          profile_nombre: r.profile?.nombre ?? "",
          profile_email: r.profile?.email ?? null,
        }
      },
    )

    enriched.sort((a, b) =>
      a.profile_nombre.localeCompare(b.profile_nombre, "es"),
    )

    return { data: enriched }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando participantes fijos",
    }
  }
}

export async function agregarParticipanteFijo(
  tipo: TipoReunion,
  profileId: string,
): Promise<Result<ReunionParticipanteFijo>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!profileId) return { error: "Profile inválido" }

    const { data, error } = await supabase
      .from("reuniones_participantes_fijos")
      .insert({ tipo, profile_id: profileId })
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return { error: "Ese usuario ya está en la lista de participantes fijos" }
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionParticipanteFijo }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error agregando participante fijo",
    }
  }
}

export async function quitarParticipanteFijo(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID inválido" }

    const { error } = await supabase
      .from("reuniones_participantes_fijos")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error quitando participante fijo",
    }
  }
}

// =============================================
// Reuniones
// =============================================

export async function listReunionesByTipo(
  tipo: TipoReunion,
): Promise<Result<ReunionConResumen[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: reuniones, error } = await supabase
      .from("reuniones")
      .select("*")
      .eq("tipo", tipo)
      .order("fecha", { ascending: false })

    if (error) return { error: error.message }

    const lista = (reuniones ?? []) as Reunion[]
    if (lista.length === 0) return { data: [] }

    const ids = lista.map((r) => r.id)

    const [{ data: asisRaw }, { data: actRaw }] = await Promise.all([
      supabase
        .from("reuniones_asistentes")
        .select("reunion_id, presente")
        .in("reunion_id", ids),
      supabase
        .from("reuniones_actividades")
        .select("reunion_id, estado")
        .in("reunion_id", ids),
    ])

    const totalAsis = new Map<string, number>()
    const presentes = new Map<string, number>()
    for (const row of (asisRaw ?? []) as {
      reunion_id: string
      presente: boolean
    }[]) {
      totalAsis.set(row.reunion_id, (totalAsis.get(row.reunion_id) ?? 0) + 1)
      if (row.presente) {
        presentes.set(row.reunion_id, (presentes.get(row.reunion_id) ?? 0) + 1)
      }
    }

    const totalAct = new Map<string, number>()
    const pendientesAct = new Map<string, number>()
    for (const row of (actRaw ?? []) as {
      reunion_id: string
      estado: string
    }[]) {
      totalAct.set(row.reunion_id, (totalAct.get(row.reunion_id) ?? 0) + 1)
      if (row.estado !== "cerrada") {
        pendientesAct.set(
          row.reunion_id,
          (pendientesAct.get(row.reunion_id) ?? 0) + 1,
        )
      }
    }

    const resumen: ReunionConResumen[] = lista.map((r) => ({
      ...r,
      total_asistentes: totalAsis.get(r.id) ?? 0,
      asistentes_presentes: presentes.get(r.id) ?? 0,
      total_compromisos: totalAct.get(r.id) ?? 0,
      compromisos_pendientes: pendientesAct.get(r.id) ?? 0,
    }))

    return { data: resumen }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando reuniones",
    }
  }
}

export async function getReunionDetalle(
  id: string,
): Promise<Result<ReunionDetalle & { actividades: ReunionActividadConResponsable[] }>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!id) return { error: "ID de reunión inválido" }

    const { data: reunion, error: errReunion } = await supabase
      .from("reuniones")
      .select("*")
      .eq("id", id)
      .single()
    if (errReunion) return { error: errReunion.message }

    const reunionActual = reunion as Reunion
    const reunionTipo = reunionActual.tipo
    const reunionFecha = reunionActual.fecha

    const [
      { data: asisRaw, error: errAsis },
      { data: actRaw, error: errAct },
      { data: archRaw, error: errArch },
    ] = await Promise.all([
      supabase
        .from("reuniones_asistentes")
        .select(
          "*, profile:profiles!reuniones_asistentes_profile_id_fkey(id, nombre, email)",
        )
        .eq("reunion_id", id),
      // Actividades: traemos todas con join a la reunión origen y filtramos en TS.
      // Lógica:
      //   - reunion_origen.tipo == reunionActual.tipo
      //   - reunion_origen.fecha <= reunionActual.fecha (no creadas en el futuro)
      //   - estado != 'cerrada'  → siempre visible (se arrastran de mes a mes hasta cerrarse)
      //   - estado == 'cerrada'  → visible solo en reuniones del mismo mes-año del cierre,
      //     comparando YYYY-MM de completado_at (en zona AR) contra YYYY-MM de reunionActual.fecha.
      //     Las cerradas no cruzan al mes siguiente: quedan como historial del mes en que se cerraron.
      supabase
        .from("reuniones_actividades")
        .select(
          "*, responsable:profiles!reuniones_actividades_responsable_id_fkey(id, nombre), reunion_origen:reuniones!reuniones_actividades_reunion_id_fkey(id, fecha, tipo)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("reuniones_archivos")
        .select("*")
        .eq("reunion_id", id)
        .order("created_at", { ascending: true }),
    ])

    if (errAsis) return { error: errAsis.message }
    if (errAct) return { error: errAct.message }
    if (errArch) return { error: errArch.message }

    const asistentes: ReunionAsistenteConProfile[] = (asisRaw ?? []).map(
      (row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any
        return {
          id: r.id,
          reunion_id: r.reunion_id,
          profile_id: r.profile_id,
          presente: r.presente,
          justificacion: r.justificacion,
          created_at: r.created_at,
          profile_nombre: r.profile?.nombre ?? "",
          profile_email: r.profile?.email ?? null,
        }
      },
    )
    asistentes.sort((a, b) =>
      a.profile_nombre.localeCompare(b.profile_nombre, "es"),
    )

    // Filtro temporal: ver descripción del .select más arriba.
    const actividadesFiltradas = ((actRaw ?? []) as unknown as Array<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Record<string, any>
    >).filter((a) => {
      const origen = a.reunion_origen
      if (!origen) return false
      if (origen.tipo !== reunionTipo) return false
      // No creadas en el futuro respecto a la reunión actual
      if (origen.fecha > reunionFecha) return false
      // Vivas: siempre visibles (mientras origen.fecha <= reunionFecha)
      if (a.estado !== "cerrada") return true
      // Cerradas: visibles solo en reuniones del MISMO mes-año del cierre (zona AR).
      if (!a.completado_at) return true // defensivo: cerrada sin marca de tiempo
      const fechaCierreAr = new Date(
        new Date(a.completado_at).toLocaleString("en-US", {
          timeZone: "America/Argentina/Buenos_Aires",
        }),
      )
      const cierreYm = `${fechaCierreAr.getFullYear()}-${String(
        fechaCierreAr.getMonth() + 1,
      ).padStart(2, "0")}`
      const reunionYm = reunionFecha.slice(0, 7) // YYYY-MM
      return cierreYm === reunionYm
    })

    const actividades: ReunionActividadConResponsable[] = actividadesFiltradas.map(
      (row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any
        return {
          id: r.id,
          reunion_id: r.reunion_id,
          descripcion: r.descripcion,
          motivo: r.motivo ?? null,
          responsable_id: r.responsable_id,
          fecha_compromiso: r.fecha_compromiso,
          estado: r.estado as EstadoReunionActividad,
          evidencia_url: r.evidencia_url,
          evidencia_nombre: r.evidencia_nombre,
          observaciones: r.observaciones,
          completado_at: r.completado_at,
          created_by: r.created_by,
          created_at: r.created_at,
          updated_at: r.updated_at,
          responsable_nombre: r.responsable?.nombre ?? null,
          reunion_origen_id: r.reunion_origen?.id ?? r.reunion_id,
          reunion_origen_fecha: r.reunion_origen?.fecha ?? "",
        }
      },
    )

    const archivos = (archRaw ?? []) as ReunionArchivo[]

    return {
      data: {
        ...(reunion as Reunion),
        asistentes,
        // compromisos: campo legacy mantenido vacío para compatibilidad de tipo;
        // el frontend ahora consume `actividades`.
        compromisos: [],
        actividades,
        archivos,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando detalle de reunión",
    }
  }
}

export async function listResponsablesPosibles(): Promise<
  Result<{ id: string; nombre: string; email: string }[]>
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
      data: (data ?? []) as { id: string; nombre: string; email: string }[],
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
      .createSignedUrl(archivoUrl, 600)
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

export async function puedeEditarReuniones(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return isEditorRole(profile.role)
}

export async function crearReunion(
  formData: FormData,
): Promise<Result<Reunion>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const tipoRaw = String(formData.get("tipo") ?? "").trim()
    const fecha = String(formData.get("fecha") ?? "").trim()
    const hora_inicio =
      String(formData.get("hora_inicio") ?? "").trim() || null
    const hora_fin = String(formData.get("hora_fin") ?? "").trim() || null
    const lugar = String(formData.get("lugar") ?? "").trim() || null
    const agenda = String(formData.get("agenda") ?? "").trim() || null
    const notas = String(formData.get("notas") ?? "").trim() || null

    if (!tipoRaw) return { error: "El tipo de reunión es obligatorio" }
    if (
      !["logistica", "logistica-ventas", "matinal-distribucion", "warehouse"].includes(
        tipoRaw,
      )
    ) {
      return { error: "Tipo de reunión inválido" }
    }
    const tipo = tipoRaw as TipoReunion

    if (!fecha) return { error: "La fecha es obligatoria" }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Fecha inválida (formato esperado YYYY-MM-DD)" }
    }

    // 1. Cargar config del tipo y validar día permitido
    const { data: config, error: errConfig } = await supabase
      .from("reuniones_tipos_config")
      .select("*")
      .eq("tipo", tipo)
      .single()
    if (errConfig || !config) {
      return { error: "No se encontró configuración para ese tipo de reunión" }
    }
    const cfg = config as ReunionTipoConfig

    const dia = isoWeekdayFromDateStr(fecha)
    if (!cfg.dias_semana.includes(dia)) {
      return {
        error: `La fecha ${fecha} no está habilitada para reuniones de tipo ${cfg.nombre} (días permitidos: ${nombresDias(cfg.dias_semana)})`,
      }
    }

    // 2. Insertar reunión (UNIQUE (tipo, fecha) protege duplicados)
    const { data: reunionRow, error: errInsert } = await supabase
      .from("reuniones")
      .insert({
        tipo,
        fecha,
        hora_inicio,
        hora_fin,
        lugar,
        agenda,
        notas,
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (errInsert) {
      if (errInsert.code === "23505") {
        return {
          error: `Ya existe una reunión de tipo ${cfg.nombre} para la fecha ${fecha}`,
        }
      }
      return { error: errInsert.message }
    }

    const reunion = reunionRow as Reunion

    // 3. Auto-generar asistentes desde participantes_fijos
    const { data: fijosRaw } = await supabase
      .from("reuniones_participantes_fijos")
      .select("profile_id")
      .eq("tipo", tipo)

    const fijos = (fijosRaw ?? []) as { profile_id: string }[]
    if (fijos.length > 0) {
      const rows = fijos.map((f) => ({
        reunion_id: reunion.id,
        profile_id: f.profile_id,
        presente: false,
      }))
      const { error: errAsis } = await supabase
        .from("reuniones_asistentes")
        .insert(rows)
      if (errAsis) {
        // No revertimos la reunión, pero devolvemos el error como warning silencioso
        // (los asistentes pueden agregarse manualmente luego).
        return {
          error: `Reunión creada, pero falló la generación automática de asistentes: ${errAsis.message}`,
        }
      }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: reunion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando reunión",
    }
  }
}

export async function actualizarReunion(
  id: string,
  formData: FormData,
): Promise<Result<Reunion>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de reunión inválido" }

    // Cargar reunión actual para conocer su tipo (no se modifica)
    const { data: actual, error: errActual } = await supabase
      .from("reuniones")
      .select("tipo")
      .eq("id", id)
      .single()
    if (errActual || !actual) {
      return { error: errActual?.message ?? "No se encontró la reunión" }
    }
    const tipo = (actual as { tipo: TipoReunion }).tipo

    const fecha = String(formData.get("fecha") ?? "").trim()
    const hora_inicio =
      String(formData.get("hora_inicio") ?? "").trim() || null
    const hora_fin = String(formData.get("hora_fin") ?? "").trim() || null
    const lugar = String(formData.get("lugar") ?? "").trim() || null
    const agenda = String(formData.get("agenda") ?? "").trim() || null
    const notas = String(formData.get("notas") ?? "").trim() || null

    if (!fecha) return { error: "La fecha es obligatoria" }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Fecha inválida (formato esperado YYYY-MM-DD)" }
    }

    // Re-validar día permitido contra config del tipo
    const { data: config, error: errConfig } = await supabase
      .from("reuniones_tipos_config")
      .select("*")
      .eq("tipo", tipo)
      .single()
    if (errConfig || !config) {
      return { error: "No se encontró configuración para ese tipo de reunión" }
    }
    const cfg = config as ReunionTipoConfig

    const dia = isoWeekdayFromDateStr(fecha)
    if (!cfg.dias_semana.includes(dia)) {
      return {
        error: `La fecha ${fecha} no está habilitada para reuniones de tipo ${cfg.nombre} (días permitidos: ${nombresDias(cfg.dias_semana)})`,
      }
    }

    const { data, error } = await supabase
      .from("reuniones")
      .update({
        fecha,
        hora_inicio,
        hora_fin,
        lugar,
        agenda,
        notas,
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return {
          error: `Ya existe una reunión de tipo ${cfg.nombre} para la fecha ${fecha}`,
        }
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as Reunion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando reunión",
    }
  }
}

export async function eliminarReunion(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de reunión inválido" }

    // 1. Listar archivos a borrar del bucket (de la reunión y de actividades)
    const [{ data: archs }, { data: acts }] = await Promise.all([
      supabase
        .from("reuniones_archivos")
        .select("archivo_url")
        .eq("reunion_id", id),
      supabase
        .from("reuniones_actividades")
        .select("evidencia_url")
        .eq("reunion_id", id),
    ])

    const paths: string[] = []
    for (const a of (archs ?? []) as { archivo_url: string | null }[]) {
      if (a.archivo_url) paths.push(a.archivo_url)
    }
    for (const c of (acts ?? []) as { evidencia_url: string | null }[]) {
      if (c.evidencia_url) paths.push(c.evidencia_url)
    }
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths)
    }

    const { error } = await supabase.from("reuniones").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando reunión",
    }
  }
}

// =============================================
// Asistentes (gestión por reunión, post-creación)
// =============================================

export async function setAsistencia(
  asistenteId: string,
  presente: boolean,
  justificacion?: string | null,
): Promise<Result<ReunionAsistente>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!asistenteId) return { error: "ID de asistente inválido" }

    // Permitir si es editor O si la fila pertenece al propio profile
    if (!isEditorRole(profile.role)) {
      const { data: actual, error: errActual } = await supabase
        .from("reuniones_asistentes")
        .select("profile_id")
        .eq("id", asistenteId)
        .single()
      if (errActual || !actual) {
        return { error: errActual?.message ?? "No se encontró el asistente" }
      }
      if ((actual as { profile_id: string }).profile_id !== profile.id) {
        return { error: "Solo el propio usuario o un editor puede modificar esta asistencia" }
      }
    }

    const justifNorm = presente
      ? null
      : (justificacion ?? "").toString().trim() || null

    const { data, error } = await supabase
      .from("reuniones_asistentes")
      .update({
        presente,
        justificacion: justifNorm,
      })
      .eq("id", asistenteId)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionAsistente }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando asistencia",
    }
  }
}

export async function marcarMiAsistencia(
  reunionId: string,
): Promise<Result<ReunionAsistente>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }

    const { data: actual, error: errFind } = await supabase
      .from("reuniones_asistentes")
      .select("id")
      .eq("reunion_id", reunionId)
      .eq("profile_id", profile.id)
      .maybeSingle()

    if (errFind) return { error: errFind.message }
    if (!actual) {
      return {
        error:
          "No estás listado como participante de esta reunión.",
      }
    }

    const { data, error } = await supabase
      .from("reuniones_asistentes")
      .update({
        presente: true,
        justificacion: null,
      })
      .eq("id", (actual as { id: string }).id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionAsistente }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error marcando asistencia",
    }
  }
}

export async function agregarAsistente(
  reunionId: string,
  profileId: string,
): Promise<Result<ReunionAsistente>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }
    if (!profileId) return { error: "Profile inválido" }

    const { data, error } = await supabase
      .from("reuniones_asistentes")
      .insert({
        reunion_id: reunionId,
        profile_id: profileId,
        presente: false,
      })
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return { error: "Ese usuario ya es asistente de esta reunión" }
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionAsistente }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error agregando asistente",
    }
  }
}

export async function quitarAsistente(
  asistenteId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!asistenteId) return { error: "ID de asistente inválido" }

    const { error } = await supabase
      .from("reuniones_asistentes")
      .delete()
      .eq("id", asistenteId)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error quitando asistente",
    }
  }
}

// =============================================
// Actividades (antes "compromisos")
// =============================================

export async function crearActividad(
  formData: FormData,
): Promise<Result<ReunionActividad>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const reunion_id = String(formData.get("reunion_id") ?? "").trim()
    const descripcion = String(formData.get("descripcion") ?? "").trim()
    const motivo = String(formData.get("motivo") ?? "").trim() || null
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fecha_compromiso =
      String(formData.get("fecha_compromiso") ?? "").trim() || null
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null

    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (!descripcion) return { error: "La descripción es obligatoria" }

    const { data, error } = await supabase
      .from("reuniones_actividades")
      .insert({
        reunion_id,
        descripcion,
        motivo,
        responsable_id,
        fecha_compromiso,
        observaciones,
        estado: "no_comenzada",
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }

    if (responsable_id) {
      await notificarAsignacionActividad(supabase, responsable_id, descripcion)
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionActividad }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando actividad",
    }
  }
}

export async function actualizarActividad(
  id: string,
  formData: FormData,
): Promise<Result<ReunionActividad>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de actividad inválido" }

    const { data: actual, error: errActual } = await supabase
      .from("reuniones_actividades")
      .select("responsable_id, estado, descripcion")
      .eq("id", id)
      .single()
    if (errActual || !actual) {
      return { error: errActual?.message ?? "No se encontró la actividad" }
    }

    const descripcion = String(formData.get("descripcion") ?? "").trim()
    const motivo = String(formData.get("motivo") ?? "").trim() || null
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fecha_compromiso =
      String(formData.get("fecha_compromiso") ?? "").trim() || null
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null
    const estadoRaw = String(formData.get("estado") ?? "").trim()

    if (!descripcion) return { error: "La descripción es obligatoria" }

    let nuevoEstado: EstadoReunionActividad | null = null
    if (estadoRaw) {
      if (!["no_comenzada", "en_curso", "cerrada"].includes(estadoRaw)) {
        return { error: "Estado inválido" }
      }
      nuevoEstado = estadoRaw as EstadoReunionActividad
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      descripcion,
      motivo,
      responsable_id,
      fecha_compromiso,
      observaciones,
    }

    if (nuevoEstado) {
      update.estado = nuevoEstado
      const estadoActual = (actual as { estado: string }).estado
      if (nuevoEstado === "cerrada") {
        update.completado_at = new Date().toISOString()
      } else if (estadoActual === "cerrada") {
        update.completado_at = null
      }
    }

    const { data, error } = await supabase
      .from("reuniones_actividades")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    // Si cambió responsable a uno nuevo no nulo, notificar
    const responsableAnterior = (actual as { responsable_id: string | null })
      .responsable_id
    if (responsable_id && responsable_id !== responsableAnterior) {
      await notificarAsignacionActividad(supabase, responsable_id, descripcion)
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionActividad }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando actividad",
    }
  }
}

export async function responderActividad(
  id: string,
  formData: FormData,
): Promise<Result<ReunionActividad>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!id) return { error: "ID de actividad inválido" }

    const isEditor = isEditorRole(profile.role)

    const { data: actual, error: errActual } = await supabase
      .from("reuniones_actividades")
      .select("evidencia_url, responsable_id, estado")
      .eq("id", id)
      .single()
    if (errActual || !actual) {
      return { error: errActual?.message ?? "No se encontró la actividad" }
    }

    const responsableId = (actual as { responsable_id: string | null })
      .responsable_id
    if (!isEditor && responsableId !== profile.id) {
      return {
        error:
          "Solo el responsable o un editor puede responder esta actividad",
      }
    }

    const observacionesRaw = String(formData.get("observaciones") ?? "").trim()
    const observaciones = observacionesRaw || null
    const file = formData.get("archivo") as File | null
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()

    const tieneArchivo = file && file instanceof File && file.size > 0

    if (!tieneArchivo && !observaciones) {
      return { error: "Subí evidencia o escribí observaciones" }
    }

    if (!nuevoEstadoRaw) {
      return { error: "Indicá el nuevo estado" }
    }
    if (!["en_curso", "cerrada"].includes(nuevoEstadoRaw)) {
      return { error: "Estado inválido" }
    }
    const nuevoEstado = nuevoEstadoRaw as EstadoReunionActividad

    let nuevaEvidenciaUrl: string | null = null
    let nuevaEvidenciaNombre: string | null = null

    if (tieneArchivo) {
      const cleanName = cleanFileName(file.name)
      const path = `actividades/${id}/v${Date.now()}-${cleanName}`
      const arrayBuffer = await file.arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }
      nuevaEvidenciaUrl = path
      nuevaEvidenciaNombre = file.name
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      estado: nuevoEstado,
    }
    if (observaciones !== null) {
      update.observaciones = observaciones
    }
    if (nuevaEvidenciaUrl) {
      update.evidencia_url = nuevaEvidenciaUrl
      update.evidencia_nombre = nuevaEvidenciaNombre
    }
    if (nuevoEstado === "cerrada") {
      update.completado_at = new Date().toISOString()
    } else {
      // pasa de cerrada a otro
      const estadoActual = (actual as { estado: string }).estado
      if (estadoActual === "cerrada") {
        update.completado_at = null
      }
    }

    const { data, error } = await supabase
      .from("reuniones_actividades")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      if (nuevaEvidenciaUrl) {
        await supabase.storage.from(BUCKET).remove([nuevaEvidenciaUrl])
      }
      return { error: error.message }
    }

    // Borrar evidencia anterior si subimos una nueva
    const evidenciaAnterior = (actual as { evidencia_url: string | null })
      .evidencia_url
    if (nuevaEvidenciaUrl && evidenciaAnterior) {
      await supabase.storage.from(BUCKET).remove([evidenciaAnterior])
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionActividad }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error respondiendo actividad",
    }
  }
}

export async function eliminarActividad(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de actividad inválido" }

    const { data: actual } = await supabase
      .from("reuniones_actividades")
      .select("evidencia_url")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase
      .from("reuniones_actividades")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    const evidenciaUrl = (actual as { evidencia_url: string | null } | null)
      ?.evidencia_url
    if (evidenciaUrl) {
      await supabase.storage.from(BUCKET).remove([evidenciaUrl])
    }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error eliminando actividad",
    }
  }
}

// =============================================
// Archivos de la reunión
// =============================================

export async function subirArchivoReunion(
  formData: FormData,
): Promise<Result<ReunionArchivo>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const reunion_id = String(formData.get("reunion_id") ?? "").trim()
    const descripcion =
      String(formData.get("descripcion") ?? "").trim() || null
    const file = formData.get("archivo") as File | null

    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Subí un archivo" }
    }

    const cleanName = cleanFileName(file.name)
    const path = `${reunion_id}/${Date.now()}-${cleanName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }

    const { data, error } = await supabase
      .from("reuniones_archivos")
      .insert({
        reunion_id,
        archivo_url: path,
        archivo_nombre: file.name,
        descripcion,
        uploaded_by: profile.id,
      })
      .select("*")
      .single()

    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionArchivo }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo archivo",
    }
  }
}

export async function eliminarArchivoReunion(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de archivo inválido" }

    const { data: actual } = await supabase
      .from("reuniones_archivos")
      .select("archivo_url")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase
      .from("reuniones_archivos")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    const archivoUrl = (actual as { archivo_url: string | null } | null)
      ?.archivo_url
    if (archivoUrl) {
      await supabase.storage.from(BUCKET).remove([archivoUrl])
    }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando archivo",
    }
  }
}

// =============================================
// Indicadores: config
// =============================================

export async function listIndicadoresConfig(
  tipo: TipoReunion,
): Promise<Result<ReunionIndicadorConfig[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("reuniones_indicadores_config")
      .select("*")
      .eq("tipo", tipo)
      .eq("activo", true)
      .order("orden", { ascending: true })

    if (error) return { error: error.message }
    return { data: (data ?? []) as ReunionIndicadorConfig[] }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando indicadores",
    }
  }
}

export async function crearIndicadorConfig(
  formData: FormData,
): Promise<Result<ReunionIndicadorConfig>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const tipoRaw = String(formData.get("tipo") ?? "").trim()
    const nombre = String(formData.get("nombre") ?? "").trim()
    const unidad = String(formData.get("unidad") ?? "").trim() || null
    const metaRaw = String(formData.get("meta") ?? "").trim()
    const ordenRaw = String(formData.get("orden") ?? "").trim()
    const agregacionRaw = String(formData.get("agregacion") ?? "").trim()

    if (!tipoRaw) return { error: "El tipo es obligatorio" }
    if (
      !["logistica", "logistica-ventas", "matinal-distribucion", "warehouse"].includes(
        tipoRaw,
      )
    ) {
      return { error: "Tipo inválido" }
    }
    if (!nombre) return { error: "El nombre es obligatorio" }

    let meta: number | null = null
    if (metaRaw) {
      const n = Number(metaRaw)
      if (!Number.isFinite(n)) return { error: "Meta inválida" }
      meta = n
    }

    let orden = 0
    if (ordenRaw) {
      const n = parseInt(ordenRaw, 10)
      if (!Number.isFinite(n)) return { error: "Orden inválido" }
      orden = n
    }

    let agregacion: AgregacionIndicador = "promedio"
    if (agregacionRaw) {
      if (!["suma", "promedio"].includes(agregacionRaw)) {
        return { error: "Agregación inválida (debe ser 'suma' o 'promedio')" }
      }
      agregacion = agregacionRaw as AgregacionIndicador
    }

    const { data, error } = await supabase
      .from("reuniones_indicadores_config")
      .insert({
        tipo: tipoRaw as TipoReunion,
        nombre,
        unidad,
        meta,
        orden,
        activo: true,
        agregacion,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionIndicadorConfig }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error creando indicador",
    }
  }
}

export async function actualizarIndicadorConfig(
  id: string,
  formData: FormData,
): Promise<Result<ReunionIndicadorConfig>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID inválido" }

    const nombre = String(formData.get("nombre") ?? "").trim()
    const unidad = String(formData.get("unidad") ?? "").trim() || null
    const metaRaw = String(formData.get("meta") ?? "").trim()
    const ordenRaw = String(formData.get("orden") ?? "").trim()
    const activoRaw = String(formData.get("activo") ?? "").trim()
    const agregacionRaw = String(formData.get("agregacion") ?? "").trim()

    if (!nombre) return { error: "El nombre es obligatorio" }

    let meta: number | null = null
    if (metaRaw) {
      const n = Number(metaRaw)
      if (!Number.isFinite(n)) return { error: "Meta inválida" }
      meta = n
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      nombre,
      unidad,
      meta,
    }

    if (ordenRaw) {
      const n = parseInt(ordenRaw, 10)
      if (!Number.isFinite(n)) return { error: "Orden inválido" }
      update.orden = n
    }

    if (activoRaw) {
      update.activo = activoRaw === "true" || activoRaw === "1"
    }

    if (agregacionRaw) {
      if (!["suma", "promedio"].includes(agregacionRaw)) {
        return { error: "Agregación inválida (debe ser 'suma' o 'promedio')" }
      }
      update.agregacion = agregacionRaw as AgregacionIndicador
    }

    const { data, error } = await supabase
      .from("reuniones_indicadores_config")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionIndicadorConfig }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando indicador",
    }
  }
}

export async function eliminarIndicadorConfig(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID inválido" }

    const { error } = await supabase
      .from("reuniones_indicadores_config")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error eliminando indicador",
    }
  }
}

// =============================================
// Indicadores: valores por reunión
// =============================================

export async function listIndicadoresConValor(
  reunionId: string,
): Promise<Result<ReunionIndicadorConValor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }

    // 1. Obtener tipo de la reunión
    const { data: reunion, error: errReunion } = await supabase
      .from("reuniones")
      .select("tipo")
      .eq("id", reunionId)
      .single()
    if (errReunion || !reunion) {
      return { error: errReunion?.message ?? "No se encontró la reunión" }
    }

    const tipo = (reunion as { tipo: TipoReunion }).tipo

    // 2. Indicadores activos del tipo
    const { data: configRaw, error: errCfg } = await supabase
      .from("reuniones_indicadores_config")
      .select("*")
      .eq("tipo", tipo)
      .eq("activo", true)
      .order("orden", { ascending: true })

    if (errCfg) return { error: errCfg.message }

    const configs = (configRaw ?? []) as ReunionIndicadorConfig[]
    if (configs.length === 0) return { data: [] }

    // 3. Valores cargados para esta reunión
    const { data: valoresRaw, error: errVal } = await supabase
      .from("reuniones_indicadores_valores")
      .select("*")
      .eq("reunion_id", reunionId)

    if (errVal) return { error: errVal.message }

    const valoresPorIndicador = new Map<string, ReunionIndicadorValor>()
    for (const v of (valoresRaw ?? []) as ReunionIndicadorValor[]) {
      valoresPorIndicador.set(v.indicador_id, v)
    }

    const result: ReunionIndicadorConValor[] = configs.map((c) => {
      const v = valoresPorIndicador.get(c.id)
      return {
        ...c,
        valor_actual: v?.valor ?? null,
        valor_id: v?.id ?? null,
        observacion_actual: v?.observacion ?? null,
      }
    })

    return { data: result }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando indicadores con valor",
    }
  }
}

export async function setIndicadorValor(
  reunionId: string,
  indicadorId: string,
  valor: number | null,
  observacion: string | null,
): Promise<Result<ReunionIndicadorValor>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }
    if (!indicadorId) return { error: "ID de indicador inválido" }

    // Permiso: editor O asistente activo de la reunión
    if (!isEditorRole(profile.role)) {
      const { data: asis } = await supabase
        .from("reuniones_asistentes")
        .select("id")
        .eq("reunion_id", reunionId)
        .eq("profile_id", profile.id)
        .maybeSingle()
      if (!asis) {
        return {
          error:
            "Solo editores o asistentes de la reunión pueden cargar indicadores",
        }
      }
    }

    const obsNorm =
      observacion === null ? null : observacion.toString().trim() || null

    // UPSERT por (reunion_id, indicador_id)
    const { data, error } = await supabase
      .from("reuniones_indicadores_valores")
      .upsert(
        {
          reunion_id: reunionId,
          indicador_id: indicadorId,
          valor,
          observacion: obsNorm,
          registrado_por: profile.id,
        },
        { onConflict: "reunion_id,indicador_id" },
      )
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionIndicadorValor }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error guardando valor de indicador",
    }
  }
}

export async function getResumenSemanal(
  tipo: TipoReunion,
  fechaDesde: string,
  fechaHasta: string,
): Promise<
  Result<{
    fechas: string[]
    indicadores: {
      id: string
      nombre: string
      unidad: string | null
      meta: number | null
      valores: Record<string, number | null>
    }[]
  }>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!fechaDesde || !fechaHasta) {
      return { error: "Las fechas son obligatorias" }
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)
    ) {
      return { error: "Fecha inválida (formato esperado YYYY-MM-DD)" }
    }
    if (fechaDesde > fechaHasta) {
      return { error: "fechaDesde debe ser <= fechaHasta" }
    }

    // Construir array de fechas (limit 31 días por seguridad)
    const fechas: string[] = []
    {
      const [y0, m0, d0] = fechaDesde.split("-").map((s) => parseInt(s, 10))
      const [y1, m1, d1] = fechaHasta.split("-").map((s) => parseInt(s, 10))
      const start = Date.UTC(y0, m0 - 1, d0)
      const end = Date.UTC(y1, m1 - 1, d1)
      for (let t = start; t <= end; t += 86400000) {
        const dt = new Date(t)
        const y = dt.getUTCFullYear()
        const m = String(dt.getUTCMonth() + 1).padStart(2, "0")
        const d = String(dt.getUTCDate()).padStart(2, "0")
        fechas.push(`${y}-${m}-${d}`)
        if (fechas.length > 31) {
          return { error: "Rango máximo: 31 días" }
        }
      }
    }

    // Indicadores activos del tipo
    const { data: configRaw, error: errCfg } = await supabase
      .from("reuniones_indicadores_config")
      .select("*")
      .eq("tipo", tipo)
      .eq("activo", true)
      .order("orden", { ascending: true })

    if (errCfg) return { error: errCfg.message }
    const configs = (configRaw ?? []) as ReunionIndicadorConfig[]

    if (configs.length === 0) {
      return { data: { fechas, indicadores: [] } }
    }

    // Reuniones del tipo en el rango
    const { data: reunionesRaw, error: errRe } = await supabase
      .from("reuniones")
      .select("id, fecha")
      .eq("tipo", tipo)
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)

    if (errRe) return { error: errRe.message }

    const reuniones = (reunionesRaw ?? []) as { id: string; fecha: string }[]
    const fechaPorReunionId = new Map<string, string>()
    for (const r of reuniones) fechaPorReunionId.set(r.id, r.fecha)

    let valores: ReunionIndicadorValor[] = []
    if (reuniones.length > 0) {
      const { data: valRaw, error: errVal } = await supabase
        .from("reuniones_indicadores_valores")
        .select("*")
        .in(
          "reunion_id",
          reuniones.map((r) => r.id),
        )
      if (errVal) return { error: errVal.message }
      valores = (valRaw ?? []) as ReunionIndicadorValor[]
    }

    // Pivot
    const indicadores = configs.map((c) => {
      const valoresPorFecha: Record<string, number | null> = {}
      for (const f of fechas) valoresPorFecha[f] = null
      for (const v of valores) {
        if (v.indicador_id !== c.id) continue
        const f = fechaPorReunionId.get(v.reunion_id)
        if (!f) continue
        valoresPorFecha[f] = v.valor
      }
      return {
        id: c.id,
        nombre: c.nombre,
        unidad: c.unidad,
        meta: c.meta,
        valores: valoresPorFecha,
      }
    })

    return { data: { fechas, indicadores } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando resumen semanal",
    }
  }
}

/**
 * Devuelve la matriz indicadores x mes que contiene la fecha de la reunión
 * dada. Para cada indicador se calcula también el MTD según su agregación
 * (suma o promedio).
 *
 * - `anio` / `mes`: año (4 dígitos) y mes (1-12) de la reunión.
 * - `fechas`: todas las fechas del mes en formato YYYY-MM-DD (28..31 entradas).
 * - `reuniones_por_fecha`: mapa fecha -> reunion_id (o null si no hay reunión
 *    de ese tipo en ese día).
 * - `indicadores`: lista ordenada de indicadores activos del tipo, con
 *    `valores` (mapa fecha -> { reunion_id, valor, observacion } o null si no
 *    hay reunión ese día) y `mtd` (acumulado del mes según `agregacion`).
 */
export async function getIndicadoresMes(
  reunionId: string,
): Promise<Result<ReunionIndicadoresMes>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }

    // 1. Obtener tipo + fecha de la reunión actual
    const { data: reunion, error: errReunion } = await supabase
      .from("reuniones")
      .select("tipo, fecha")
      .eq("id", reunionId)
      .single()
    if (errReunion || !reunion) {
      return { error: errReunion?.message ?? "No se encontró la reunión" }
    }
    const tipo = (reunion as { tipo: TipoReunion; fecha: string }).tipo
    const fecha = (reunion as { tipo: TipoReunion; fecha: string }).fecha

    // 2. Parsear fecha y calcular rango del mes
    const partes = fecha.split("-").map((s) => parseInt(s, 10))
    const anio = partes[0]
    const mes = partes[1]
    if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
      return { error: "Fecha de reunión inválida" }
    }

    const fechas = diasDelMes(anio, mes)
    const fechaDesde = fechas[0]
    const fechaHasta = fechas[fechas.length - 1]

    // 3. Reuniones del mismo tipo cuya fecha cae en ese rango
    const { data: reunionesRaw, error: errRe } = await supabase
      .from("reuniones")
      .select("id, fecha")
      .eq("tipo", tipo)
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)

    if (errRe) return { error: errRe.message }

    const reuniones = (reunionesRaw ?? []) as { id: string; fecha: string }[]
    const reunionesPorFecha: Record<string, string | null> = {}
    for (const f of fechas) reunionesPorFecha[f] = null
    for (const r of reuniones) reunionesPorFecha[r.fecha] = r.id

    const reunionIds = reuniones.map((r) => r.id)

    // 4. Indicadores activos del tipo
    const { data: configRaw, error: errCfg } = await supabase
      .from("reuniones_indicadores_config")
      .select("*")
      .eq("tipo", tipo)
      .eq("activo", true)
      .order("orden", { ascending: true })

    if (errCfg) return { error: errCfg.message }
    const configs = (configRaw ?? []) as ReunionIndicadorConfig[]

    if (configs.length === 0) {
      return {
        data: {
          anio,
          mes,
          fechas,
          reuniones_por_fecha: reunionesPorFecha,
          indicadores: [],
        },
      }
    }

    // 5. Valores existentes para esas reuniones e indicadores
    let valores: ReunionIndicadorValor[] = []
    if (reunionIds.length > 0) {
      const { data: valRaw, error: errVal } = await supabase
        .from("reuniones_indicadores_valores")
        .select("*")
        .in("reunion_id", reunionIds)
        .in(
          "indicador_id",
          configs.map((c) => c.id),
        )
      if (errVal) return { error: errVal.message }
      valores = (valRaw ?? []) as ReunionIndicadorValor[]
    }

    // Index: (reunion_id, indicador_id) -> valor
    const valoresIdx = new Map<string, ReunionIndicadorValor>()
    for (const v of valores) {
      valoresIdx.set(`${v.reunion_id}|${v.indicador_id}`, v)
    }

    // 6. Armar matriz por indicador + MTD
    const indicadores = configs.map((c) => {
      const valoresPorFecha: Record<
        string,
        {
          reunion_id: string
          valor: number | null
          observacion: string | null
        } | null
      > = {}

      const numericos: number[] = []

      for (const f of fechas) {
        const reuId = reunionesPorFecha[f]
        if (!reuId) {
          valoresPorFecha[f] = null
          continue
        }
        const v = valoresIdx.get(`${reuId}|${c.id}`)
        const valor = v?.valor ?? null
        valoresPorFecha[f] = {
          reunion_id: reuId,
          valor,
          observacion: v?.observacion ?? null,
        }
        if (valor !== null && Number.isFinite(valor)) {
          numericos.push(valor)
        }
      }

      let mtd: number | null = null
      if (numericos.length > 0) {
        if (c.agregacion === "suma") {
          mtd = numericos.reduce((acc, n) => acc + n, 0)
        } else {
          // promedio (default)
          const sum = numericos.reduce((acc, n) => acc + n, 0)
          mtd = sum / numericos.length
        }
      }

      return {
        id: c.id,
        nombre: c.nombre,
        unidad: c.unidad,
        meta: c.meta,
        orden: c.orden,
        agregacion: c.agregacion,
        valores: valoresPorFecha,
        mtd,
      }
    })

    // 7. Indicadores AUTO desde reportes_seguridad: LTI y TRI.
    //    LTI = count(tipo_accidente='lti'), TRI = count(tipo_accidente ∈ {lti,mdi,mti}).
    //    MTD se calcula hasta la fecha de la reunión actual (incluida).
    const { data: reportesRaw, error: errRep } = await supabase
      .from("reportes_seguridad")
      .select("fecha, tipo_accidente")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .not("tipo_accidente", "is", null)

    const ltiPorFecha: Record<string, number> = {}
    const triPorFecha: Record<string, number> = {}
    if (!errRep) {
      const triSet = new Set(["lti", "mdi", "mti"])
      for (const r of (reportesRaw ?? []) as Array<{
        fecha: string
        tipo_accidente: string | null
      }>) {
        if (!r.tipo_accidente) continue
        if (r.tipo_accidente === "lti") {
          ltiPorFecha[r.fecha] = (ltiPorFecha[r.fecha] ?? 0) + 1
        }
        if (triSet.has(r.tipo_accidente)) {
          triPorFecha[r.fecha] = (triPorFecha[r.fecha] ?? 0) + 1
        }
      }
    }

    function buildAutoRow(
      id: string,
      nombre: string,
      porFecha: Record<string, number>,
    ) {
      const valoresPorFecha: Record<
        string,
        { reunion_id: string; valor: number | null; observacion: string | null } | null
      > = {}
      let mtd = 0
      for (const f of fechas) {
        const v = porFecha[f] ?? 0
        valoresPorFecha[f] = {
          reunion_id: "auto",
          valor: v,
          observacion: null,
        }
        if (f <= fecha) mtd += v
      }
      return {
        id,
        nombre,
        unidad: null,
        meta: null,
        orden: -1,
        agregacion: "suma" as AgregacionIndicador,
        valores: valoresPorFecha,
        mtd,
        auto: true,
      }
    }

    const indicadoresAuto = [
      buildAutoRow("auto_lti", "LTI", ltiPorFecha),
      buildAutoRow("auto_tri", "TRI", triPorFecha),
    ]

    return {
      data: {
        anio,
        mes,
        fechas,
        reuniones_por_fecha: reunionesPorFecha,
        indicadores: [...indicadoresAuto, ...indicadores],
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando indicadores del mes",
    }
  }
}

/**
 * Devuelve todas las fechas (YYYY-MM-DD) del mes dado.
 * `mes` es 1-12. Calcula el último día usando `Date(year, month, 0)` que
 * retorna el último día del mes anterior cuando day=0.
 */
function diasDelMes(anio: number, mes: number): string[] {
  const lastDay = new Date(anio, mes, 0).getDate()
  const fechas: string[] = []
  const mm = String(mes).padStart(2, "0")
  for (let d = 1; d <= lastDay; d++) {
    fechas.push(`${anio}-${mm}-${String(d).padStart(2, "0")}`)
  }
  return fechas
}
