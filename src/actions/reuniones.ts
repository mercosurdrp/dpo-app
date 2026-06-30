"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, getProfile } from "@/lib/session"
import {
  crearPdaEnMantenimiento,
  actualizarPdaEnMantenimiento,
  eliminarPdaEnMantenimiento,
  subirEvidenciaPda,
} from "@/actions/mantenimiento-edilicio"
import {
  buildAperturaPickingDelDia,
  buildAperturaMaquinistasDelDia,
  buildMaquinistasDespachoSerie,
  buildWarehouseSerieDiaria,
  refreshSerieDiariaDeposito,
  OPERADORES_APERTURA,
  type AperturaPickingDelDia,
  type AperturaMaquinistasDelDia,
  type OperadorApertura,
} from "@/lib/warehouse/auto-indicadores"
import {
  buildMisionesLogisticaSerie,
  type MisionesSucursal,
} from "@/lib/foxtrot/auto-indicadores-misiones"
import { buildPampeanaFoxtrotSerie } from "@/lib/foxtrot/auto-indicadores-pampeana"
import { buildCloudfleetChecksSerie } from "@/lib/cloudfleet/checks-serie"
import { IS_MISIONES } from "@/lib/empresa"
import { getAusentismoSerieEventos } from "@/actions/ausentismo"
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
  ReunionActividadEvidenciaConAutor,
  ReunionArchivo,
  ReunionConResumen,
  ReunionDetalle,
  ReunionIndicadorConfig,
  ReunionIndicadorValor,
  ReunionIndicadorConValor,
  ReunionIndicadoresMes,
  AgregacionIndicador,
  TareaDestino,
} from "@/types/database"

// =============================================
// Espejo en s5_acciones: helpers
// =============================================
const DESTINOS_5S: TareaDestino[] = ["5s_flota", "5s_almacen"]

function isDestino5S(destino: TareaDestino): destino is "5s_flota" | "5s_almacen" {
  return DESTINOS_5S.includes(destino)
}

// Resuelve el nombre del responsable para mostrar en el PDA externo de
// Mantenimiento Edilicio. Si no se puede resolver, devuelve "".
async function resolverNombreResponsable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  responsableId: string | null
): Promise<string> {
  if (!responsableId) return ""
  try {
    const { data } = await supabase
      .from("profiles")
      .select("nombre")
      .eq("id", responsableId)
      .maybeSingle()
    return (data as { nombre: string | null } | null)?.nombre ?? ""
  } catch {
    return ""
  }
}

function tipo5SFromDestino(destino: "5s_flota" | "5s_almacen"): "flota" | "almacen" {
  return destino === "5s_flota" ? "flota" : "almacen"
}

interface ParsedDestino {
  destino: TareaDestino
  s5_sector_numero: number | null
  s5_vehiculo_id: string | null
  mantenimiento_rubro: string | null
}

/**
 * Parsea destino + sub-campos desde el FormData de la actividad.
 * Devuelve `{ error }` si la combinación no es válida (igual que el CHECK SQL).
 * Si el form no manda `destino`, default = 'simple'.
 */
function parseDestino(formData: FormData): ParsedDestino | { error: string } {
  const destinoRaw = String(formData.get("destino") ?? "simple").trim()
  if (
    !["simple", "5s_flota", "5s_almacen", "mantenimiento_edilicio"].includes(
      destinoRaw,
    )
  ) {
    return { error: "Destino inválido" }
  }
  const destino = destinoRaw as TareaDestino

  let s5_sector_numero: number | null = null
  let s5_vehiculo_id: string | null = null
  let mantenimiento_rubro: string | null = null

  if (destino === "5s_almacen") {
    const sRaw = String(formData.get("s5_sector_numero") ?? "").trim()
    const n = parseInt(sRaw, 10)
    if (!Number.isFinite(n) || n < 1 || n > 4) {
      return { error: "Para 5S Almacén el sector debe ser 1..4" }
    }
    s5_sector_numero = n
  } else if (destino === "5s_flota") {
    const v = String(formData.get("s5_vehiculo_id") ?? "").trim()
    s5_vehiculo_id = v && v !== "none" ? v : null
  } else if (destino === "mantenimiento_edilicio") {
    const r = String(formData.get("mantenimiento_rubro") ?? "").trim()
    if (!r) return { error: "Para Mantenimiento Edilicio el rubro es obligatorio" }
    mantenimiento_rubro = r
  }

  return { destino, s5_sector_numero, s5_vehiculo_id, mantenimiento_rubro }
}

/**
 * Crea la fila espejo en s5_acciones para una actividad 5S. Devuelve error si
 * el insert falla — el caller decide qué rollback hacer.
 */
async function crearEspejo5S(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    actividadId: string
    destino: "5s_flota" | "5s_almacen"
    sector: number | null
    vehiculoId: string | null
    descripcion: string
    responsableId: string | null
    fechaCompromiso: string | null
    estado: EstadoReunionActividad
    creadoPor: string
  },
): Promise<{ error: string } | { ok: true }> {
  const tipo5s = tipo5SFromDestino(params.destino)
  const { error } = await supabase.from("s5_acciones").insert({
    tipo: tipo5s,
    sector_numero: tipo5s === "almacen" ? params.sector : null,
    vehiculo_id: tipo5s === "flota" ? params.vehiculoId : null,
    descripcion: params.descripcion,
    responsable_id: params.responsableId,
    fecha_compromiso: params.fechaCompromiso,
    estado: params.estado,
    origen_reunion_actividad_id: params.actividadId,
    creado_por: params.creadoPor,
    // Si la actividad nace ya cerrada (poco probable acá), respeta la CHECK
    // cerrada_at NOT NULL en estado=cerrada.
    cerrada_at: params.estado === "cerrada" ? new Date().toISOString() : null,
    cerrada_por: params.estado === "cerrada" ? params.creadoPor : null,
  })
  if (error) return { error: error.message }
  return { ok: true }
}

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
          destino: (r.destino as ReunionActividad["destino"]) ?? "simple",
          s5_sector_numero: r.s5_sector_numero ?? null,
          s5_vehiculo_id: r.s5_vehiculo_id ?? null,
          mantenimiento_rubro: r.mantenimiento_rubro ?? null,
          seccion: r.seccion ?? null,
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
      !["logistica", "logistica-ventas", "matinal-distribucion", "warehouse", "presupuesto"].includes(
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

export interface MiAsistenciaReunionHoy {
  reunion_id: string
  fecha: string
  hora_inicio: string | null
  asistente_id: string
  presente: boolean
}

export async function getMiAsistenciaReunionHoy(
  tipo: TipoReunion,
): Promise<{ data: MiAsistenciaReunionHoy | null } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const hoy = new Date().toISOString().slice(0, 10)
    const { data: reunion, error: errReu } = await supabase
      .from("reuniones")
      .select("id, fecha, hora_inicio")
      .eq("tipo", tipo)
      .eq("fecha", hoy)
      .maybeSingle()
    if (errReu) return { error: errReu.message }
    if (!reunion) return { data: null }

    const r = reunion as { id: string; fecha: string; hora_inicio: string | null }
    const { data: asis, error: errAsis } = await supabase
      .from("reuniones_asistentes")
      .select("id, presente")
      .eq("reunion_id", r.id)
      .eq("profile_id", profile.id)
      .maybeSingle()
    if (errAsis) return { error: errAsis.message }
    if (!asis) return { data: null }

    const a = asis as { id: string; presente: boolean }
    return {
      data: {
        reunion_id: r.id,
        fecha: r.fecha,
        hora_inicio: r.hora_inicio,
        asistente_id: a.id,
        presente: a.presente,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error consultando reunión del día",
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
    const seccion = String(formData.get("seccion") ?? "").trim() || null

    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (!descripcion) return { error: "La descripción es obligatoria" }

    const destinoParsed = parseDestino(formData)
    if ("error" in destinoParsed) return { error: destinoParsed.error }

    const { data, error } = await supabase
      .from("reuniones_actividades")
      .insert({
        reunion_id,
        descripcion,
        motivo,
        responsable_id,
        fecha_compromiso,
        observaciones,
        seccion,
        estado: "no_comenzada",
        created_by: profile.id,
        destino: destinoParsed.destino,
        s5_sector_numero: destinoParsed.s5_sector_numero,
        s5_vehiculo_id: destinoParsed.s5_vehiculo_id,
        mantenimiento_rubro: destinoParsed.mantenimiento_rubro,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }
    const actividad = data as ReunionActividad

    // Espejo en s5_acciones si corresponde. Si falla, rollback manual.
    if (isDestino5S(destinoParsed.destino)) {
      const mirror = await crearEspejo5S(supabase, {
        actividadId: actividad.id,
        destino: destinoParsed.destino,
        sector: destinoParsed.s5_sector_numero,
        vehiculoId: destinoParsed.s5_vehiculo_id,
        descripcion,
        responsableId: responsable_id,
        fechaCompromiso: fecha_compromiso,
        estado: "no_comenzada",
        creadoPor: profile.id,
      })
      if ("error" in mirror) {
        await supabase
          .from("reuniones_actividades")
          .delete()
          .eq("id", actividad.id)
        return { error: `Error creando espejo 5S: ${mirror.error}` }
      }
    }

    if (responsable_id) {
      await notificarAsignacionActividad(supabase, responsable_id, descripcion)
    }

    // Si destino es mantenimiento_edilicio, espejar PDA en la app externa.
    // Silent fail: no romper el flujo principal si la integración falla.
    if (
      destinoParsed.destino === "mantenimiento_edilicio" &&
      destinoParsed.mantenimiento_rubro
    ) {
      const nombreResp = await resolverNombreResponsable(supabase, responsable_id)
      await crearPdaEnMantenimiento({
        externalId: actividad.id,
        titulo: descripcion,
        descripcion,
        responsable: nombreResp,
        fechaProbable: fecha_compromiso,
        rubro: destinoParsed.mantenimiento_rubro,
      })
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: actividad }
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
    const profile = await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de actividad inválido" }

    const { data: actual, error: errActual } = await supabase
      .from("reuniones_actividades")
      .select(
        "responsable_id, estado, descripcion, destino, s5_sector_numero, s5_vehiculo_id, mantenimiento_rubro",
      )
      .eq("id", id)
      .single()
    if (errActual || !actual) {
      return { error: errActual?.message ?? "No se encontró la actividad" }
    }

    const actualRow = actual as {
      responsable_id: string | null
      estado: EstadoReunionActividad
      descripcion: string
      destino: TareaDestino | null
      s5_sector_numero: number | null
      s5_vehiculo_id: string | null
      mantenimiento_rubro: string | null
    }
    const destinoViejo: TareaDestino = actualRow.destino ?? "simple"

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

    const destinoParsed = parseDestino(formData)
    if ("error" in destinoParsed) return { error: destinoParsed.error }

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
      destino: destinoParsed.destino,
      s5_sector_numero: destinoParsed.s5_sector_numero,
      s5_vehiculo_id: destinoParsed.s5_vehiculo_id,
      mantenimiento_rubro: destinoParsed.mantenimiento_rubro,
    }

    if (nuevoEstado) {
      update.estado = nuevoEstado
      const estadoActual = actualRow.estado
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
    const actividad = data as ReunionActividad

    // =============================================
    // Rebalance del espejo en s5_acciones
    // =============================================
    const destinoNuevo: TareaDestino = destinoParsed.destino
    const era5S = isDestino5S(destinoViejo)
    const es5S = isDestino5S(destinoNuevo)

    const estadoFinal: EstadoReunionActividad =
      (update.estado as EstadoReunionActividad | undefined) ?? actualRow.estado

    if (es5S && !era5S) {
      // simple/mantenimiento → 5S: crear espejo nuevo.
      const mirror = await crearEspejo5S(supabase, {
        actividadId: actividad.id,
        destino: destinoNuevo,
        sector: destinoParsed.s5_sector_numero,
        vehiculoId: destinoParsed.s5_vehiculo_id,
        descripcion,
        responsableId: responsable_id,
        fechaCompromiso: fecha_compromiso,
        estado: estadoFinal,
        creadoPor: profile.id,
      })
      if ("error" in mirror) {
        // No rollback de la actividad: el cambio principal ya se guardó.
        // Devolver el error pero advertir.
        return {
          error: `Actividad actualizada pero falló el espejo 5S: ${mirror.error}`,
        }
      }
    } else if (era5S && !es5S) {
      // 5S → simple/mantenimiento: borrar espejo si existe.
      await supabase
        .from("s5_acciones")
        .delete()
        .eq("origen_reunion_actividad_id", id)
    } else if (era5S && es5S && destinoViejo !== destinoNuevo) {
      // 5s_flota ↔ 5s_almacen: tipo distinto → rehacer.
      await supabase
        .from("s5_acciones")
        .delete()
        .eq("origen_reunion_actividad_id", id)
      const mirror = await crearEspejo5S(supabase, {
        actividadId: actividad.id,
        destino: destinoNuevo,
        sector: destinoParsed.s5_sector_numero,
        vehiculoId: destinoParsed.s5_vehiculo_id,
        descripcion,
        responsableId: responsable_id,
        fechaCompromiso: fecha_compromiso,
        estado: estadoFinal,
        creadoPor: profile.id,
      })
      if ("error" in mirror) {
        return {
          error: `Actividad actualizada pero falló el espejo 5S: ${mirror.error}`,
        }
      }
    } else if (era5S && es5S && destinoViejo === destinoNuevo) {
      // Mismo destino 5S: UPDATE del espejo (sincroniza sector/vehículo +
      // campos comunes).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mirrorUpdate: Record<string, any> = {
        descripcion,
        responsable_id,
        fecha_compromiso,
        estado: estadoFinal,
      }
      if (destinoNuevo === "5s_almacen") {
        mirrorUpdate.sector_numero = destinoParsed.s5_sector_numero
        mirrorUpdate.vehiculo_id = null
      } else {
        mirrorUpdate.vehiculo_id = destinoParsed.s5_vehiculo_id
        mirrorUpdate.sector_numero = null
      }
      if (estadoFinal === "cerrada") {
        mirrorUpdate.cerrada_at = new Date().toISOString()
        mirrorUpdate.cerrada_por = profile.id
      } else {
        mirrorUpdate.cerrada_at = null
        mirrorUpdate.cerrada_por = null
      }
      await supabase
        .from("s5_acciones")
        .update(mirrorUpdate)
        .eq("origen_reunion_actividad_id", id)
    }

    // Si cambió responsable a uno nuevo no nulo, notificar
    const responsableAnterior = actualRow.responsable_id
    if (responsable_id && responsable_id !== responsableAnterior) {
      await notificarAsignacionActividad(supabase, responsable_id, descripcion)
    }

    // =============================================
    // Rebalance del espejo en Mantenimiento Edilicio (app externa)
    // Silent fail para no romper el flujo principal.
    // =============================================
    const eraMant = destinoViejo === "mantenimiento_edilicio"
    const esMant = destinoNuevo === "mantenimiento_edilicio"

    if (eraMant && !esMant) {
      await eliminarPdaEnMantenimiento(id)
    } else if (!eraMant && esMant && destinoParsed.mantenimiento_rubro) {
      const nombreResp = await resolverNombreResponsable(supabase, responsable_id)
      await crearPdaEnMantenimiento({
        externalId: id,
        titulo: descripcion,
        descripcion,
        responsable: nombreResp,
        fechaProbable: fecha_compromiso,
        rubro: destinoParsed.mantenimiento_rubro,
      })
    } else if (eraMant && esMant && destinoParsed.mantenimiento_rubro) {
      const nombreResp = await resolverNombreResponsable(supabase, responsable_id)
      const estadoMant =
        estadoFinal === "cerrada"
          ? "ejecutado"
          : estadoFinal === "en_curso"
            ? "en_curso"
            : "planificado"
      await actualizarPdaEnMantenimiento({
        externalId: id,
        descripcion,
        responsable: nombreResp,
        fechaProbable: fecha_compromiso,
        rubro: destinoParsed.mantenimiento_rubro,
        estado: estadoMant,
      })
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: actividad }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando actividad",
    }
  }
}

/**
 * Devuelve el historial de avances (comentario + archivo) de una actividad,
 * más reciente primero. Alimenta la línea de tiempo del popup de detalle.
 */
export async function getHistorialActividad(
  actividadId: string,
): Promise<Result<ReunionActividadEvidenciaConAutor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!actividadId) return { error: "ID de actividad inválido" }

    const { data, error } = await supabase
      .from("reuniones_actividades_evidencias")
      .select(
        "*, autor:profiles!reuniones_actividades_evidencias_autor_id_fkey(id, nombre)",
      )
      .eq("actividad_id", actividadId)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    const historial: ReunionActividadEvidenciaConAutor[] = (
      (data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        actividad_id: r.actividad_id,
        comentario: r.comentario ?? null,
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante:
          (r.estado_resultante as EstadoReunionActividad | null) ?? null,
        autor_id: r.autor_id ?? null,
        created_at: r.created_at,
        autor_nombre: r.autor?.nombre ?? null,
      }
    })

    return { data: historial }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando el historial",
    }
  }
}

/**
 * Registra un avance en una actividad del Action Log: guarda una entrada en
 * el historial (comentario + archivo opcional) y actualiza el estado.
 *
 * Reglas:
 *   - Para cerrar (nuevo_estado='cerrada') el comentario es OBLIGATORIO.
 *   - Para el resto de los estados alcanza con comentario o archivo.
 */
export async function agregarAvanceActividad(
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
      .select("evidencia_url, responsable_id, estado, destino")
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
          "Solo el responsable o un editor puede registrar avances en esta actividad",
      }
    }

    const observacionesRaw = String(formData.get("observaciones") ?? "").trim()
    const observaciones = observacionesRaw || null
    const file = formData.get("archivo") as File | null
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()

    const tieneArchivo = file && file instanceof File && file.size > 0

    if (!nuevoEstadoRaw) {
      return { error: "Indicá el estado de la actividad" }
    }
    if (!["no_comenzada", "en_curso", "cerrada"].includes(nuevoEstadoRaw)) {
      return { error: "Estado inválido" }
    }
    const nuevoEstado = nuevoEstadoRaw as EstadoReunionActividad

    // Para cerrar, el comentario es obligatorio sí o sí.
    if (nuevoEstado === "cerrada" && !observaciones) {
      return {
        error: "Para cerrar la actividad tenés que escribir un comentario",
      }
    }
    if (!tieneArchivo && !observaciones) {
      return { error: "Adjuntá un archivo o escribí un comentario" }
    }

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

    // Entrada en el historial de avances. Cada avance conserva su propio
    // archivo: no se borran las evidencias previas.
    const { data: evidenciaRow, error: errEvid } = await supabase
      .from("reuniones_actividades_evidencias")
      .insert({
        actividad_id: id,
        comentario: observaciones,
        archivo_path: nuevaEvidenciaUrl,
        archivo_nombre: nuevaEvidenciaNombre,
        archivo_mime: tieneArchivo ? file.type || null : null,
        archivo_bytes: tieneArchivo ? file.size : null,
        estado_resultante: nuevoEstado,
        autor_id: profile.id,
      })
      .select("id")
      .single()

    if (errEvid || !evidenciaRow) {
      if (nuevaEvidenciaUrl) {
        await supabase.storage.from(BUCKET).remove([nuevaEvidenciaUrl])
      }
      return {
        error: errEvid?.message ?? "No se pudo registrar el avance",
      }
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
      // Rollback manual del avance recién insertado.
      await supabase
        .from("reuniones_actividades_evidencias")
        .delete()
        .eq("id", (evidenciaRow as { id: string }).id)
      if (nuevaEvidenciaUrl) {
        await supabase.storage.from(BUCKET).remove([nuevaEvidenciaUrl])
      }
      return { error: error.message }
    }

    // Espejar el avance al s5_acciones_evidencias si la actividad tiene espejo.
    // Buscamos la fila espejo por origen_reunion_actividad_id e insertamos una
    // entrada nueva en su historial. Si se cerró la actividad, también
    // espejamos el cierre.
    //
    // Se usa el cliente admin (service-role): quien responde la actividad de
    // reunión (responsable o editor de reuniones) puede no tener permiso RLS
    // sobre s5_acciones; con el cliente de usuario el espejo quedaba
    // desincronizado en silencio (acción 5S abierta / actividad cerrada).
    try {
      const admin = createAdminClient()
      const { data: espejo } = await admin
        .from("s5_acciones")
        .select("id, estado")
        .eq("origen_reunion_actividad_id", id)
        .maybeSingle()

      if (espejo) {
        const e = espejo as { id: string; estado: string }
        // Insertar evidencia al historial del espejo (si hay archivo o comentario).
        const tieneComentarioParaEspejo =
          (observaciones?.trim().length ?? 0) > 0
        if (nuevaEvidenciaUrl || tieneComentarioParaEspejo) {
          await admin.from("s5_acciones_evidencias").insert({
            accion_id: e.id,
            comentario: observaciones ?? null,
            archivo_path: nuevaEvidenciaUrl,
            archivo_nombre: nuevaEvidenciaNombre,
            archivo_mime: tieneArchivo ? file.type || null : null,
            archivo_bytes: tieneArchivo ? file.size : null,
            autor_id: profile.id,
          })
        }

        // Sincronizar estado del espejo.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mirrorUpdate: Record<string, any> = { estado: nuevoEstado }
        if (nuevoEstado === "cerrada") {
          mirrorUpdate.cerrada_at = new Date().toISOString()
          mirrorUpdate.cerrada_por = profile.id
        } else if (e.estado === "cerrada") {
          mirrorUpdate.cerrada_at = null
          mirrorUpdate.cerrada_por = null
        }
        const { error: errMirror } = await admin
          .from("s5_acciones")
          .update(mirrorUpdate)
          .eq("id", e.id)
        if (errMirror) {
          console.error(
            `[reuniones] no se pudo espejar estado a s5_acciones ${e.id}: ${errMirror.message}`,
          )
        }
      }
    } catch (err) {
      // No bloquear el flujo principal por fallo en sync.
      console.error("[reuniones] error espejando avance a s5_acciones:", err)
    }

    // Espejar al PDA de Mantenimiento Edilicio si corresponde.
    // Silent fail.
    try {
      const destinoActual = (actual as { destino: TareaDestino | null })
        .destino
      if (destinoActual === "mantenimiento_edilicio") {
        // Update estado del PDA.
        const estadoMant =
          nuevoEstado === "cerrada"
            ? "ejecutado"
            : "en_curso"
        await actualizarPdaEnMantenimiento({
          externalId: id,
          estado: estadoMant,
        })

        // Si subimos archivo, replicarlo al PDA.
        if (tieneArchivo && nuevaEvidenciaUrl) {
          const { data: blob } = await supabase.storage
            .from(BUCKET)
            .download(nuevaEvidenciaUrl)
          if (blob) {
            await subirEvidenciaPda({
              externalId: id,
              archivoBlob: blob,
              archivoNombre: nuevaEvidenciaNombre || "evidencia",
              descripcion: observaciones,
            })
          }
        }
      }
    } catch {
      // silent
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionActividad }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error registrando el avance",
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
      .select("evidencia_url, destino")
      .eq("id", id)
      .maybeSingle()

    // Archivos del historial de avances (se borran de Storage; las filas
    // caen solas por ON DELETE CASCADE al eliminar la actividad).
    const { data: evidenciasRows } = await supabase
      .from("reuniones_actividades_evidencias")
      .select("archivo_path")
      .eq("actividad_id", id)

    const { error } = await supabase
      .from("reuniones_actividades")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    const pathsABorrar = new Set<string>()
    const evidenciaUrl = (actual as {
      evidencia_url: string | null
      destino: TareaDestino | null
    } | null)?.evidencia_url
    if (evidenciaUrl) pathsABorrar.add(evidenciaUrl)
    for (const row of (evidenciasRows ?? []) as Array<{
      archivo_path: string | null
    }>) {
      if (row.archivo_path) pathsABorrar.add(row.archivo_path)
    }
    if (pathsABorrar.size > 0) {
      await supabase.storage.from(BUCKET).remove([...pathsABorrar])
    }

    // Si la actividad estaba espejada en mantenimiento, borrar el PDA.
    // Silent fail.
    const destinoActual = (actual as {
      destino: TareaDestino | null
    } | null)?.destino
    if (destinoActual === "mantenimiento_edilicio") {
      try {
        await eliminarPdaEnMantenimiento(id)
      } catch {
        // silent
      }
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
    const gatilloRaw = String(formData.get("gatillo") ?? "").trim()
    const mejorSiRaw = String(formData.get("mejor_si") ?? "").trim()

    if (!tipoRaw) return { error: "El tipo es obligatorio" }
    if (
      !["logistica", "logistica-ventas", "matinal-distribucion", "warehouse", "presupuesto"].includes(
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

    let gatillo: number | null = null
    if (gatilloRaw) {
      const n = Number(gatilloRaw)
      if (!Number.isFinite(n)) return { error: "Gatillo inválido" }
      gatillo = n
    }

    let mejorSi: "mayor" | "menor" | null = null
    if (mejorSiRaw) {
      if (!["mayor", "menor"].includes(mejorSiRaw)) {
        return { error: "Polaridad inválida (debe ser 'mayor' o 'menor')" }
      }
      mejorSi = mejorSiRaw as "mayor" | "menor"
    }

    const { data, error } = await supabase
      .from("reuniones_indicadores_config")
      .insert({
        tipo: tipoRaw as TipoReunion,
        nombre,
        unidad,
        meta,
        gatillo,
        mejor_si: mejorSi,
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

/**
 * Setea (o limpia) el `gatillo` de un indicador por NOMBRE dentro de un tipo de
 * reunión. Sirve tanto para indicadores manuales (actualiza su fila de config)
 * como para los AUTOMÁTICOS (WQI, Precisión, Errores, etc.): para estos crea una
 * fila de config "solo gatillo" con el mismo nombre — el wrapper getIndicadoresMes
 * la matchea por nombre e inyecta el gatillo en la fila auto, y el dedup final la
 * oculta de la sección manual para no duplicar. Idempotente.
 */
export async function setGatilloIndicador(
  tipo: string,
  nombre: string,
  gatillo: number | null,
  opts?: { unidad?: string | null; mejor_si?: "mayor" | "menor" | null },
): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const tipoT = tipo.trim()
    const nombreT = nombre.trim()
    if (!tipoT || !nombreT) return { error: "Tipo y nombre son obligatorios" }
    if (gatillo !== null && !Number.isFinite(gatillo)) {
      return { error: "Gatillo inválido" }
    }

    // ¿Ya hay una fila de config con ese nombre (case-insensitive) para el tipo?
    const { data: existentes, error: eSel } = await supabase
      .from("reuniones_indicadores_config")
      .select("id, nombre")
      .eq("tipo", tipoT)
    if (eSel) return { error: eSel.message }

    const match = (existentes ?? []).find(
      (c: { id: string; nombre: string }) =>
        c.nombre.trim().toLowerCase() === nombreT.toLowerCase(),
    )

    if (match) {
      const { error } = await supabase
        .from("reuniones_indicadores_config")
        .update({ gatillo })
        .eq("id", match.id)
      if (error) return { error: error.message }
    } else {
      // Fila "solo gatillo" para un indicador automático. orden alto: el dedup
      // final la oculta de la tabla, pero por las dudas queda al final.
      const { error } = await supabase
        .from("reuniones_indicadores_config")
        .insert({
          tipo: tipoT as TipoReunion,
          nombre: nombreT,
          unidad: opts?.unidad ?? null,
          meta: null,
          gatillo,
          mejor_si: opts?.mejor_si ?? null,
          orden: 999,
          activo: true,
          agregacion: "promedio",
        })
      if (error) return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error guardando el gatillo",
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
    const gatilloRaw = String(formData.get("gatillo") ?? "").trim()
    const mejorSiRaw = String(formData.get("mejor_si") ?? "").trim()

    if (!nombre) return { error: "El nombre es obligatorio" }

    let meta: number | null = null
    if (metaRaw) {
      const n = Number(metaRaw)
      if (!Number.isFinite(n)) return { error: "Meta inválida" }
      meta = n
    }

    let gatillo: number | null = null
    if (gatilloRaw) {
      const n = Number(gatilloRaw)
      if (!Number.isFinite(n)) return { error: "Gatillo inválido" }
      gatillo = n
    }

    let mejorSi: "mayor" | "menor" | null = null
    if (mejorSiRaw) {
      if (!["mayor", "menor"].includes(mejorSiRaw)) {
        return { error: "Polaridad inválida (debe ser 'mayor' o 'menor')" }
      }
      mejorSi = mejorSiRaw as "mayor" | "menor"
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      nombre,
      unidad,
      meta,
      gatillo,
      mejor_si: mejorSi,
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

// =====================================================================
// Semáforo de seguridad del día (Etapa 1, al lado de la pirámide).
// Solo Misiones — la tabla reuniones_seguridad_semaforo existe únicamente
// en ese tenant (ver APLICAR_EN_MISIONES_REUNIONES_SEGURIDAD_SEMAFORO.sql).
// El componente gatea con IS_MISIONES, así que estas acciones no se llaman
// en Pampeana.
// =====================================================================
export type SemaforoEstado = "rojo" | "amarillo" | "verde"
const SEMAFORO_ESTADOS: SemaforoEstado[] = ["rojo", "amarillo", "verde"]

export async function getSeguridadSemaforo(
  reunionId: string,
): Promise<Result<{ estado: SemaforoEstado | null }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!reunionId) return { error: "ID de reunión inválido" }

    const { data, error } = await supabase
      .from("reuniones_seguridad_semaforo")
      .select("estado")
      .eq("reunion_id", reunionId)
      .maybeSingle()

    if (error) return { error: error.message }
    return {
      data: { estado: (data?.estado ?? null) as SemaforoEstado | null },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando semáforo de seguridad",
    }
  }
}

export async function setSeguridadSemaforo(
  reunionId: string,
  estado: SemaforoEstado,
): Promise<Result<{ estado: SemaforoEstado }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }
    if (!SEMAFORO_ESTADOS.includes(estado))
      return { error: "Estado de semáforo inválido" }

    // Permiso: editor O asistente activo de la reunión (igual que indicadores).
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
            "Solo editores o asistentes de la reunión pueden marcar el semáforo",
        }
      }
    }

    // UPSERT por reunion_id (una marca por reunión / día).
    const { error } = await supabase
      .from("reuniones_seguridad_semaforo")
      .upsert(
        {
          reunion_id: reunionId,
          estado,
          actualizado_por: profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reunion_id" },
      )

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: { estado } }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error guardando semáforo de seguridad",
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
// Wrapper: corre el cálculo base y luego inyecta en cada indicador el `gatillo`
// y la polaridad `mejor_si` configurados (match por nombre, case-insensitive).
// Así el semáforo de 3 zonas (verde/amarillo/rojo + ♻) funciona tanto en filas
// auto (que ya traen meta/mejor_si del código + gatillo de config) como en las
// manuales (que toman meta/mejor_si/gatillo de la config). Defensivo: si las
// columnas gatillo/mejor_si todavía no existen en la DB, devuelve el base.
export async function getIndicadoresMes(
  reunionId: string,
  opts?: { sucursal?: MisionesSucursal },
): Promise<Result<ReunionIndicadoresMes>> {
  const base = await getIndicadoresMesCore(reunionId, opts)
  if (!("data" in base)) return base
  try {
    const supabase = await createClient()
    const { data: reu } = await supabase
      .from("reuniones")
      .select("tipo")
      .eq("id", reunionId)
      .single()
    const tipo = (reu as { tipo?: string } | null)?.tipo
    if (!tipo) return base
    const { data: cfg, error } = await supabase
      .from("reuniones_indicadores_config")
      .select("nombre, gatillo, mejor_si, meta")
      .eq("tipo", tipo)
    if (error || !cfg) return base
    const porNombre = new Map<
      string,
      {
        gatillo: number | null
        mejor_si: "mayor" | "menor" | null
        meta: number | null
      }
    >()
    for (const c of cfg as Array<{
      nombre: string
      gatillo: number | null
      mejor_si: "mayor" | "menor" | null
      meta: number | null
    }>) {
      porNombre.set(c.nombre.trim().toLowerCase(), {
        gatillo: c.gatillo ?? null,
        mejor_si: c.mejor_si ?? null,
        meta: c.meta ?? null,
      })
    }
    const indicadores = base.data.indicadores.map((ind) => {
      const c = porNombre.get(ind.nombre.trim().toLowerCase())
      if (!c) return ind
      return {
        ...ind,
        gatillo: c.gatillo,
        // La meta del código (filas auto con target dinámico, ej. WQI) tiene
        // prioridad; cuando el código no define meta (ej. Errores/Ausentismo)
        // se toma la de la config, para que el semáforo de 3 zonas sea
        // configurable desde el diálogo de indicadores.
        meta: ind.meta ?? c.meta ?? null,
        // La polaridad del código (filas auto) tiene prioridad; para las
        // manuales viene de la config.
        mejor_si: ind.mejor_si ?? c.mejor_si ?? undefined,
      }
    })
    return { data: { ...base.data, indicadores } }
  } catch {
    return base
  }
}

// Botón "Actualizar datos" de la reunión de logística (Pampeana): fuerza el
// recálculo de la serie diaria en deposito-esteban — para cuando roturas,
// faltantes o errores de picking se cargaron después de que el cache quedó
// armado — y devuelve los indicadores recalculados. Tarda ~45s; el maxDuration
// de la página (60s) cubre la acción.
export async function refreshIndicadoresLogistica(
  reunionId: string,
): Promise<Result<ReunionIndicadoresMes>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data: reu, error } = await supabase
      .from("reuniones")
      .select("tipo, fecha")
      .eq("id", reunionId)
      .single()
    if (error || !reu) return { error: "Reunión no encontrada" }
    const { tipo, fecha } = reu as { tipo: string; fecha: string }
    if (tipo !== "logistica" || IS_MISIONES)
      return { error: "Sólo aplica a reuniones de logística de Pampeana" }
    const [year, month] = fecha.split("-").map((s) => parseInt(s, 10))
    const ok = await refreshSerieDiariaDeposito(year, month)
    if (!ok)
      return {
        error:
          "El depósito no respondió al recálculo (tarda ~1 min); probá de nuevo",
      }
    return getIndicadoresMes(reunionId)
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "No se pudieron actualizar los datos",
    }
  }
}

async function getIndicadoresMesCore(
  reunionId: string,
  opts?: { sucursal?: MisionesSucursal },
): Promise<Result<ReunionIndicadoresMes>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }
    const sucursal: MisionesSucursal = opts?.sucursal ?? "todo"

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
    // Dedupe: descartamos indicadores manuales con nombre que coincide con
    // una fila auto (LTI/TRI, Rechazos / Rechazos %). La versión auto los
    // reemplaza en todos los tipos de reunión.
    const NOMBRES_AUTO = new Set([
      "lti",
      "tri",
      "rechazos",
      "rechazos %",
      "bultos vendidos",
      "bultos entregados",
      "tml",
      "tiempo medio de liberación",
      "hl vendidos",
      "hectolitros vendidos",
      "hl",
    ])
    // Para warehouse, los 6 KPIs del handbook (WQI/FGLI/SCL/Precision picking/
    // Capacidad utilizada/Productividad de picking) se computan on-the-fly desde
    // fuentes externas — ver src/lib/warehouse/auto-indicadores.ts.
    // Para logistica: Productividad de picking, WQI, Roturas y Faltantes
    // (los KPIs de depósito FGLI/SCL/etc. no aplican al rol de logística).
    if (tipo === "warehouse") {
      NOMBRES_AUTO.add("wqi")
      NOMBRES_AUTO.add("fgli")
      NOMBRES_AUTO.add("scl")
      NOMBRES_AUTO.add("precision picking")
      NOMBRES_AUTO.add("capacidad utilizada")
      NOMBRES_AUTO.add("productividad de picking")
    } else if (
      tipo === "logistica" ||
      (IS_MISIONES && tipo === "matinal-distribucion")
    ) {
      // En Misiones la matinal de distribución reusa el set basado en Foxtrot
      // de logística (acotado más abajo), así que comparte el mismo dedupe.
      if (IS_MISIONES) {
        // En Misiones reseteamos el set base (LTI/TRI/Bultos vendidos/TML
        // liberación/etc. son de Pampeana y no aplican). Los AUTO de Foxtrot
        // adoptan los nombres que el usuario ya configuró como manuales para
        // REEMPLAZARLOS (no duplicar). El resto de los manuales (SIF
        // Actual/Potencial/Precursor, Ausentismo, Pérdidas, Productividad
        // picking) sobreviven como filas de carga manual.
        // OJO: Ausentismo NO se incluye acá a propósito — pasó a carga manual
        // (ver más abajo: ya no se calcula desde Foxtrot).
        NOMBRES_AUTO.clear()
        NOMBRES_AUTO.add("cantidad de camiones")
        NOMBRES_AUTO.add("bultos totales")
        NOMBRES_AUTO.add("rechazo")
        NOMBRES_AUTO.add("tiempo en ruta")
        NOMBRES_AUTO.add("horas en ruta")
        NOMBRES_AUTO.add("tiempo por pdv")
        NOMBRES_AUTO.add("tml")
        NOMBRES_AUTO.add("tlp")
        NOMBRES_AUTO.add("hl")
        NOMBRES_AUTO.add("ocupación de bodega")
        NOMBRES_AUTO.add("ocupacion de bodega")
        NOMBRES_AUTO.add("errores")
        NOMBRES_AUTO.add("checks aprobados")
        NOMBRES_AUTO.add("checks rechazados")
        NOMBRES_AUTO.add("ae aprobados")
        NOMBRES_AUTO.add("adherencia a checks")
      } else {
        NOMBRES_AUTO.add("wqi")
        NOMBRES_AUTO.add("wnp")
        NOMBRES_AUTO.add("productividad de picking")
        NOMBRES_AUTO.add("precision picking")
        NOMBRES_AUTO.add("roturas")
        NOMBRES_AUTO.add("faltantes")
      }
    }
    if (tipo === "logistica" || tipo === "matinal-distribucion") {
      NOMBRES_AUTO.add("fte")
      if (!IS_MISIONES) NOMBRES_AUTO.add("tlp")
    }
    const configs = ((configRaw ?? []) as ReunionIndicadorConfig[]).filter(
      (c) => !NOMBRES_AUTO.has(c.nombre.trim().toLowerCase()),
    )

    // 5. Valores existentes para esas reuniones e indicadores
    let valores: ReunionIndicadorValor[] = []
    if (reunionIds.length > 0 && configs.length > 0) {
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

    const indicadoresAuto: ReunionIndicadoresMes["indicadores"] = [
      buildAutoRow("auto_lti", "LTI", ltiPorFecha),
      buildAutoRow("auto_tri", "TRI", triPorFecha),
    ]

    // 7b. Indicador AUTO "Rechazos %" — todos los tipos salvo warehouse.
    //     Tasa diaria = hl_rechazados_dia / total_hl_ventas_dia * 100.
    //     Se imputa por `fecha_venta` (día de la venta real, no el de carga de
    //     la devolución) y se mide en HL. Mismo criterio que /indicadores/rechazos
    //     (lib/rechazos/comparado.ts) y el detalle del día (lib/rechazos/resumen-dia.ts).
    if (tipo !== "warehouse" && tipo !== "presupuesto") {
      const hlPorFecha: Record<string, number> = {}
      const ventasHlPorFecha: Record<string, number> = {}

      const { data: rechRaw, error: errRech } = await supabase
        .from("rechazos")
        .select("fecha_venta, hl_rechazados")
        .gte("fecha_venta", fechaDesde)
        .lte("fecha_venta", fechaHasta)

      if (!errRech) {
        for (const r of (rechRaw ?? []) as Array<{
          fecha_venta: string
          hl_rechazados: number | null
        }>) {
          const hl = Number(r.hl_rechazados ?? 0)
          if (!Number.isFinite(hl)) continue
          hlPorFecha[r.fecha_venta] = (hlPorFecha[r.fecha_venta] ?? 0) + hl
        }

        const { data: ventRaw, error: errVent } = await supabase
          .from("ventas_diarias")
          .select("fecha, total_hl")
          .gte("fecha", fechaDesde)
          .lte("fecha", fechaHasta)

        if (!errVent) {
          for (const v of (ventRaw ?? []) as Array<{
            fecha: string
            total_hl: number | null
          }>) {
            const hl = Number(v.total_hl ?? 0)
            if (!Number.isFinite(hl)) continue
            ventasHlPorFecha[v.fecha] = (ventasHlPorFecha[v.fecha] ?? 0) + hl
          }

          const valoresPorFecha: Record<
            string,
            { reunion_id: string; valor: number | null; observacion: string | null } | null
          > = {}
          let sumHlMtd = 0
          let sumVentasHlMtd = 0

          for (const f of fechas) {
            const ventas = ventasHlPorFecha[f] ?? 0
            const hl = hlPorFecha[f] ?? 0
            const tasa = ventas > 0 ? (hl / ventas) * 100 : null
            valoresPorFecha[f] = {
              reunion_id: "auto",
              valor: tasa,
              observacion: null,
            }
            if (f <= fecha) {
              sumHlMtd += hl
              sumVentasHlMtd += ventas
            }
          }

          const mtd =
            sumVentasHlMtd > 0 ? (sumHlMtd / sumVentasHlMtd) * 100 : null

          indicadoresAuto.push({
            id: "auto_rechazos_pct",
            nombre: "Rechazos %",
            unidad: "%",
            meta: 1.7,
            orden: -1,
            agregacion: "promedio",
            valores: valoresPorFecha,
            mtd,
            auto: true,
            mostrar_cero: true,
            mejor_si: "menor",
          })
        }
      }
    }

    // 7c. Indicadores AUTO "Bultos vendidos" + "HL vendidos" — todos los tipos
    //     salvo warehouse. Suma diaria de total_bultos / total_hl. Meta de cada
    //     uno = promedio diario del mes anterior. mejor_si=mayor (verde si
    //     supera meta). Se hace una sola lectura por rango con ambas columnas.
    if (tipo !== "warehouse" && tipo !== "presupuesto") {
      const { data: ventRaw, error: errVent } = await supabase
        .from("ventas_diarias")
        .select("fecha, total_bultos, total_hl")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)

      if (!errVent) {
        // Rango del mes anterior
        const prevAnio = mes === 1 ? anio - 1 : anio
        const prevMes = mes === 1 ? 12 : mes - 1
        const prevFechasMes = diasDelMes(prevAnio, prevMes)
        const prevDesde = prevFechasMes[0]
        const prevHasta = prevFechasMes[prevFechasMes.length - 1]

        const { data: ventPrevRaw } = await supabase
          .from("ventas_diarias")
          .select("fecha, total_bultos, total_hl")
          .gte("fecha", prevDesde)
          .lte("fecha", prevHasta)

        // Promedios diarios mes anterior (bultos y HL por separado)
        let metaBultos: number | null = null
        let metaHl: number | null = null
        if (ventPrevRaw) {
          const porFechaBultosPrev: Record<string, number> = {}
          const porFechaHlPrev: Record<string, number> = {}
          for (const v of ventPrevRaw as Array<{
            fecha: string
            total_bultos: number | null
            total_hl: number | null
          }>) {
            const b = Number(v.total_bultos ?? 0)
            const h = Number(v.total_hl ?? 0)
            if (Number.isFinite(b)) {
              porFechaBultosPrev[v.fecha] = (porFechaBultosPrev[v.fecha] ?? 0) + b
            }
            if (Number.isFinite(h)) {
              porFechaHlPrev[v.fecha] = (porFechaHlPrev[v.fecha] ?? 0) + h
            }
          }
          const diasBultos = Object.keys(porFechaBultosPrev).length
          if (diasBultos > 0) {
            let sum = 0
            for (const b of Object.values(porFechaBultosPrev)) sum += b
            metaBultos = Math.round(sum / diasBultos)
          }
          const diasHl = Object.keys(porFechaHlPrev).length
          if (diasHl > 0) {
            let sum = 0
            for (const h of Object.values(porFechaHlPrev)) sum += h
            metaHl = Math.round((sum / diasHl) * 10) / 10
          }
        }

        // Bultos + HL por fecha (mes en curso)
        const bultosPorFecha: Record<string, number> = {}
        const hlPorFecha: Record<string, number> = {}
        for (const v of (ventRaw ?? []) as Array<{
          fecha: string
          total_bultos: number | null
          total_hl: number | null
        }>) {
          const b = Number(v.total_bultos ?? 0)
          const h = Number(v.total_hl ?? 0)
          if (Number.isFinite(b)) {
            bultosPorFecha[v.fecha] = (bultosPorFecha[v.fecha] ?? 0) + b
          }
          if (Number.isFinite(h)) {
            hlPorFecha[v.fecha] = (hlPorFecha[v.fecha] ?? 0) + h
          }
        }

        // Fila auto: Bultos vendidos
        {
          const valoresPorFecha: Record<
            string,
            { reunion_id: string; valor: number | null; observacion: string | null } | null
          > = {}
          let mtd = 0
          for (const f of fechas) {
            const b = bultosPorFecha[f] ?? 0
            valoresPorFecha[f] = {
              reunion_id: "auto",
              valor: b,
              observacion: null,
            }
            if (f <= fecha) mtd += b
          }
          indicadoresAuto.push({
            id: "auto_bultos_vendidos",
            nombre: "Bultos vendidos",
            unidad: "bultos",
            meta: metaBultos,
            orden: -1,
            agregacion: "suma",
            valores: valoresPorFecha,
            mtd,
            auto: true,
            mostrar_cero: true,
            mejor_si: "mayor",
          })
        }

        // Fila auto: HL vendidos
        {
          const valoresPorFecha: Record<
            string,
            { reunion_id: string; valor: number | null; observacion: string | null } | null
          > = {}
          let mtd = 0
          for (const f of fechas) {
            const h = hlPorFecha[f] ?? 0
            const hRedondeado = Math.round(h * 10) / 10
            valoresPorFecha[f] = {
              reunion_id: "auto",
              valor: hRedondeado,
              observacion: null,
            }
            if (f <= fecha) mtd += h
          }
          indicadoresAuto.push({
            id: "auto_hl_vendidos",
            nombre: "HL vendidos",
            unidad: "HL",
            meta: metaHl,
            orden: -1,
            agregacion: "suma",
            valores: valoresPorFecha,
            mtd: Math.round(mtd * 10) / 10,
            auto: true,
            mostrar_cero: true,
            mejor_si: "mayor",
          })
        }
      }
    }

    // 7d. Indicador AUTO "TML" (Tiempo Medio de Liberación) — todos los tipos
    //     salvo warehouse. Promedio diario de tml_minutos en registros_vehiculos
    //     (tipo=egreso, tml_minutos NOT NULL). Meta 25 min. mejor_si=menor.
    //     MTD = promedio ponderado por # de egresos (Σ minutos / Σ egresos).
    if (tipo !== "warehouse" && tipo !== "presupuesto") {
      const { data: tmlRaw, error: errTml } = await supabase
        .from("registros_vehiculos")
        .select("fecha, tml_minutos")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .eq("tipo", "egreso")
        .not("tml_minutos", "is", null)

      if (!errTml) {
        const sumPorFecha: Record<string, number> = {}
        const countPorFecha: Record<string, number> = {}
        for (const r of (tmlRaw ?? []) as Array<{
          fecha: string
          tml_minutos: number | null
        }>) {
          const t = Number(r.tml_minutos ?? 0)
          if (!Number.isFinite(t)) continue
          sumPorFecha[r.fecha] = (sumPorFecha[r.fecha] ?? 0) + t
          countPorFecha[r.fecha] = (countPorFecha[r.fecha] ?? 0) + 1
        }

        const valoresPorFecha: Record<
          string,
          { reunion_id: string; valor: number | null; observacion: string | null } | null
        > = {}
        let sumMtd = 0
        let countMtd = 0
        for (const f of fechas) {
          const cnt = countPorFecha[f] ?? 0
          const sum = sumPorFecha[f] ?? 0
          const prom = cnt > 0 ? Math.round(sum / cnt) : null
          valoresPorFecha[f] = {
            reunion_id: "auto",
            valor: prom,
            observacion: null,
          }
          if (f <= fecha) {
            sumMtd += sum
            countMtd += cnt
          }
        }
        const mtd = countMtd > 0 ? Math.round(sumMtd / countMtd) : null

        indicadoresAuto.push({
          id: "auto_tml",
          nombre: "TML",
          unidad: "min",
          meta: 25,
          orden: -1,
          agregacion: "promedio",
          valores: valoresPorFecha,
          mtd,
          auto: true,
          mejor_si: "menor",
        })
      }
    }

    // 7d-bis. Indicador AUTO "Ocupación de Bodega" — todos los tipos salvo warehouse.
    //   Lee ocupacion_bodega_diaria (alimentado por el cron de rechazos).
    //   Valor diario = AVG(ceq_total/600 × 100) de los viajes del día — % del target.
    //   MTD = (Σ ceq / (600 × Σ viajes)) × 100 (% promedio ponderado por viaje).
    //   Unidad: % · Meta: 100 · mejor_si=mayor.
    if (tipo !== "warehouse" && tipo !== "presupuesto") {
      const { data: obRaw, error: errOB } = await supabase
        .from("ocupacion_bodega_diaria")
        .select("fecha, ceq_total")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .gt("ceq_total", 0)
      if (!errOB) {
        const TARGET_OB = 600
        const sumPorFecha: Record<string, number> = {}
        const countPorFecha: Record<string, number> = {}
        for (const r of (obRaw ?? []) as Array<{ fecha: string; ceq_total: number | null }>) {
          const v = Number(r.ceq_total ?? 0)
          if (!Number.isFinite(v) || v === 0) continue
          sumPorFecha[r.fecha] = (sumPorFecha[r.fecha] ?? 0) + v
          countPorFecha[r.fecha] = (countPorFecha[r.fecha] ?? 0) + 1
        }
        const valoresOB: Record<string, { reunion_id: string; valor: number | null; observacion: string | null } | null> = {}
        let sumCeqMtd = 0
        let countMtd = 0
        for (const f of fechas) {
          const cnt = countPorFecha[f] ?? 0
          if (cnt === 0) {
            valoresOB[f] = null
          } else {
            const pctDia = (sumPorFecha[f] / cnt / TARGET_OB) * 100
            valoresOB[f] = { reunion_id: "", valor: Math.round(pctDia * 10) / 10, observacion: null }
            sumCeqMtd += sumPorFecha[f]
            countMtd += cnt
          }
        }
        const mtdOB = countMtd > 0
          ? Math.round((sumCeqMtd / countMtd / TARGET_OB) * 1000) / 10
          : null

        indicadoresAuto.push({
          id: "auto_ocupacion_bodega",
          nombre: "Ocupación de Bodega",
          unidad: "%",
          meta: 100,
          orden: -1,
          agregacion: "promedio",
          valores: valoresOB,
          mtd: mtdOB,
          auto: true,
          mejor_si: "mayor",
        })
      }
    }

    // 7d-ter. Indicador AUTO "TLP" (Transport Labor Productivity) — solo
    //   Logística/Matinal Distribución de Pampeana. Cajas equivalentes
    //   entregadas ÷ horas-hombre en ruta. Por viaje (patente+fecha): CEq de
    //   ocupacion_bodega_diaria, horas de checklist retorno, FTE de
    //   registros_vehiculos egreso (1 chofer + ayudantes; fallback 2). Valor
    //   diario = Σceq_dia / Σ(horas×FTE)_dia; MTD = ratio de acumulados (NO
    //   promedio de diarios). Unidad CEq/h · mejor_si=mayor. Detalle por
    //   patente/ciudad al hacer clic (getTlpDetalleDia).
    if ((tipo === "logistica" || tipo === "matinal-distribucion") && !IS_MISIONES) {
      const normPat = (s: string | null | undefined) => (s ?? "").trim().toUpperCase()
      const [obT, retT, egrT] = await Promise.all([
        supabase.from("ocupacion_bodega_diaria")
          .select("patente, fecha, ceq_total")
          .gte("fecha", fechaDesde).lte("fecha", fechaHasta).gt("ceq_total", 0),
        supabase.from("checklist_vehiculos")
          .select("dominio, fecha, tiempo_ruta_minutos")
          .eq("tipo", "retorno").not("tiempo_ruta_minutos", "is", null)
          .gte("fecha", fechaDesde).lte("fecha", fechaHasta),
        supabase.from("registros_vehiculos")
          .select("dominio, fecha, ayudante1, ayudante2")
          .eq("tipo", "egreso")
          .gte("fecha", fechaDesde).lte("fecha", fechaHasta),
      ])
      if (!obT.error && !retT.error && !egrT.error) {
        const ceqViaje: Record<string, number> = {}
        for (const r of (obT.data ?? []) as Array<{ patente: string; fecha: string; ceq_total: number | null }>) {
          const v = Number(r.ceq_total ?? 0)
          if (!(v > 0)) continue
          const k = `${normPat(r.patente)}|${r.fecha}`
          ceqViaje[k] = (ceqViaje[k] ?? 0) + v
        }
        const tiempoViaje: Record<string, number> = {}
        for (const r of (retT.data ?? []) as Array<{ dominio: string; fecha: string; tiempo_ruta_minutos: number | null }>) {
          const m = Number(r.tiempo_ruta_minutos ?? 0)
          if (!(m > 0)) continue
          const k = `${normPat(r.dominio)}|${r.fecha}`
          tiempoViaje[k] = Math.max(tiempoViaje[k] ?? 0, m)
        }
        const fteViaje: Record<string, number> = {}
        for (const r of (egrT.data ?? []) as Array<{ dominio: string; fecha: string; ayudante1: string | null; ayudante2: string | null }>) {
          const f = 1 + ((r.ayudante1 ?? "").trim() ? 1 : 0) + ((r.ayudante2 ?? "").trim() ? 1 : 0)
          const k = `${normPat(r.dominio)}|${r.fecha}`
          fteViaje[k] = Math.max(fteViaje[k] ?? 0, f)
        }
        const ceqFecha: Record<string, number> = {}
        const hhFecha: Record<string, number> = {}
        for (const k of Object.keys(ceqViaje)) {
          const min = tiempoViaje[k]
          if (!min) continue // sin tiempo en ruta no entra al denominador
          const ff = k.split("|")[1]
          const fte = fteViaje[k] ?? 2
          ceqFecha[ff] = (ceqFecha[ff] ?? 0) + ceqViaje[k]
          hhFecha[ff] = (hhFecha[ff] ?? 0) + (min / 60) * fte
        }
        const valoresTlp: Record<string, { reunion_id: string; valor: number | null; observacion: string | null } | null> = {}
        let ceqMtd = 0
        let hhMtd = 0
        for (const ff of fechas) {
          const hh = hhFecha[ff] ?? 0
          if (hh <= 0) {
            valoresTlp[ff] = null
            continue
          }
          valoresTlp[ff] = { reunion_id: "", valor: Math.round((ceqFecha[ff] / hh) * 100) / 100, observacion: null }
          if (ff <= fecha) {
            ceqMtd += ceqFecha[ff]
            hhMtd += hh
          }
        }
        const mtdTlp = hhMtd > 0 ? Math.round((ceqMtd / hhMtd) * 100) / 100 : null
        indicadoresAuto.push({
          id: "auto_tlp",
          nombre: "TLP",
          unidad: "CEq/h",
          meta: null,
          orden: -1,
          agregacion: "promedio",
          valores: valoresTlp,
          mtd: mtdTlp,
          auto: true,
          mejor_si: "mayor",
        })
      }
    }

    // 7e. Indicadores AUTO "Camiones a la calle" + "Checklist" — solo en
    //     reuniones de Logística y Matinal Distribución. Cada checklist de
    //     liberación (checklist_vehiculos.tipo='liberacion') = un camión
    //     liberado para salir a la calle. El indicador Checklist muestra
    //     aprobados/total como texto "X/Y" (ej. 8/8, 7/8).
    if (tipo === "logistica" || tipo === "matinal-distribucion") {
      const { data: chkRaw, error: errChk } = await supabase
        .from("checklist_vehiculos")
        .select("fecha, dominio, tipo, resultado, odometro, hora")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)

      if (!errChk) {
        const totalPorFecha: Record<string, number> = {}
        const aprobPorFecha: Record<string, number> = {}
        // Dominios únicos por fecha — un camión puede tener más de un
        // checklist el mismo día (rehace tras corregir un desvío).
        const dominiosPorFecha: Record<string, Set<string>> = {}
        // Odómetros por fecha+dominio (liberación y retorno) para los km.
        const odoPorFechaDom: Record<
          string,
          Record<string, { lib: number[]; ret: number[] }>
        > = {}
        // Marcas horarias por fecha+dominio (liberación y retorno), en ms
        // epoch, para las horas en la calle.
        const horaPorFechaDom: Record<
          string,
          Record<string, { lib: number[]; ret: number[] }>
        > = {}
        for (const r of (chkRaw ?? []) as Array<{
          fecha: string
          dominio: string | null
          tipo: string
          resultado: string | null
          odometro: number | null
          hora: string | null
        }>) {
          const dom = (r.dominio ?? "").trim().toUpperCase()
          // Camiones a la calle + Checklist: sólo los checklists de liberación.
          if (r.tipo === "liberacion") {
            totalPorFecha[r.fecha] = (totalPorFecha[r.fecha] ?? 0) + 1
            if (r.resultado === "aprobado") {
              aprobPorFecha[r.fecha] = (aprobPorFecha[r.fecha] ?? 0) + 1
            }
            if (dom) {
              if (!dominiosPorFecha[r.fecha]) dominiosPorFecha[r.fecha] = new Set()
              dominiosPorFecha[r.fecha].add(dom)
            }
          }
          // Km recorridos: odómetro de liberación y de retorno por unidad.
          if (dom && r.odometro != null && Number.isFinite(r.odometro)) {
            if (!odoPorFechaDom[r.fecha]) odoPorFechaDom[r.fecha] = {}
            if (!odoPorFechaDom[r.fecha][dom]) {
              odoPorFechaDom[r.fecha][dom] = { lib: [], ret: [] }
            }
            if (r.tipo === "liberacion") {
              odoPorFechaDom[r.fecha][dom].lib.push(r.odometro)
            } else if (r.tipo === "retorno") {
              odoPorFechaDom[r.fecha][dom].ret.push(r.odometro)
            }
          }
          // Horas en la calle: marca horaria de liberación y de retorno.
          if (dom && r.hora) {
            const t = new Date(r.hora).getTime()
            if (Number.isFinite(t)) {
              if (!horaPorFechaDom[r.fecha]) horaPorFechaDom[r.fecha] = {}
              if (!horaPorFechaDom[r.fecha][dom]) {
                horaPorFechaDom[r.fecha][dom] = { lib: [], ret: [] }
              }
              if (r.tipo === "liberacion") {
                horaPorFechaDom[r.fecha][dom].lib.push(t)
              } else if (r.tipo === "retorno") {
                horaPorFechaDom[r.fecha][dom].ret.push(t)
              }
            }
          }
        }

        // Fila "Camiones a la calle": unidades únicas liberadas por día.
        const camionesPorFecha: Record<string, number> = {}
        for (const f of Object.keys(dominiosPorFecha)) {
          camionesPorFecha[f] = dominiosPorFecha[f].size
        }
        indicadoresAuto.push(
          buildAutoRow("auto_camiones_calle", "Camiones a la calle", camionesPorFecha),
        )

        // Fila "Checklist": texto "aprobados/total" por día; MTD = ΣA/ΣT.
        const chkValores: Record<
          string,
          {
            reunion_id: string
            valor: number | null
            observacion: string | null
            texto: string | null
          } | null
        > = {}
        let sumAprob = 0
        let sumTotal = 0
        for (const f of fechas) {
          const total = totalPorFecha[f] ?? 0
          const aprob = aprobPorFecha[f] ?? 0
          chkValores[f] = {
            reunion_id: "auto",
            valor: total > 0 ? aprob : null,
            observacion: null,
            texto: total > 0 ? `${aprob}/${total}` : null,
          }
          if (f <= fecha) {
            sumAprob += aprob
            sumTotal += total
          }
        }
        indicadoresAuto.push({
          id: "auto_checklist",
          nombre: "Checklist",
          unidad: null,
          meta: null,
          orden: -1,
          agregacion: "suma",
          valores: chkValores,
          mtd: sumTotal > 0 ? sumAprob : null,
          mtd_texto: sumTotal > 0 ? `${sumAprob}/${sumTotal}` : null,
          auto: true,
          mostrar_cero: true,
        })

        // Fila "Km recorridos": Σ (odómetro de retorno − odómetro de
        // liberación) de cada unidad. Se descartan lecturas inválidas
        // (km ≤ 0 o > KM_MAX_DIA, p.ej. un odómetro tipeado con un dígito
        // de más). El detalle por camión está en el modal (celda clickeable).
        const KM_MAX_DIA = 2000
        const kmPorFecha: Record<string, number> = {}
        for (const f of Object.keys(odoPorFechaDom)) {
          let suma = 0
          for (const dom of Object.keys(odoPorFechaDom[f])) {
            const { lib, ret } = odoPorFechaDom[f][dom]
            if (lib.length === 0 || ret.length === 0) continue
            const km = Math.max(...ret) - Math.min(...lib)
            if (km > 0 && km <= KM_MAX_DIA) suma += km
          }
          kmPorFecha[f] = suma
        }
        const kmValores: Record<
          string,
          {
            reunion_id: string
            valor: number | null
            observacion: string | null
          } | null
        > = {}
        let kmMtd = 0
        for (const f of fechas) {
          const v = kmPorFecha[f] ?? 0
          kmValores[f] = { reunion_id: "auto", valor: v, observacion: null }
          if (f <= fecha) kmMtd += v
        }
        indicadoresAuto.push({
          id: "auto_km_recorridos",
          nombre: "Km recorridos",
          unidad: "km",
          meta: null,
          orden: -1,
          agregacion: "suma",
          valores: kmValores,
          mtd: kmMtd,
          auto: true,
        })

        // Fila "Horas en la calle": promedio de (hora de retorno − hora de
        // liberación) de cada unidad del día. Se descartan marcas inválidas
        // (horas ≤ 0 o > HORAS_MAX_DIA, p.ej. un retorno mal cargado). El
        // detalle por camión está en el modal (celda clickeable).
        const HORAS_MAX_DIA = 18
        const horasPorFecha: Record<string, number> = {}
        for (const f of Object.keys(horaPorFechaDom)) {
          let suma = 0
          let n = 0
          for (const dom of Object.keys(horaPorFechaDom[f])) {
            const { lib, ret } = horaPorFechaDom[f][dom]
            if (lib.length === 0 || ret.length === 0) continue
            const horas =
              (Math.max(...ret) - Math.min(...lib)) / 3_600_000
            if (horas > 0 && horas <= HORAS_MAX_DIA) {
              suma += horas
              n++
            }
          }
          if (n > 0) horasPorFecha[f] = suma / n
        }
        const horasValores: Record<
          string,
          {
            reunion_id: string
            valor: number | null
            observacion: string | null
          } | null
        > = {}
        let horasSuma = 0
        let horasDias = 0
        for (const f of fechas) {
          const v = horasPorFecha[f]
          if (v != null) {
            horasValores[f] = {
              reunion_id: "auto",
              valor: Math.round(v * 10) / 10,
              observacion: null,
            }
            if (f <= fecha) {
              horasSuma += v
              horasDias++
            }
          } else {
            horasValores[f] = null
          }
        }
        indicadoresAuto.push({
          id: "auto_horas_calle",
          nombre: "Horas en la calle",
          unidad: "hs",
          meta: null,
          orden: -1,
          agregacion: "promedio",
          valores: horasValores,
          mtd:
            horasDias > 0
              ? Math.round((horasSuma / horasDias) * 10) / 10
              : null,
          auto: true,
        })
      }

      // Fila "FTE": personas-viaje por egreso del día.
      // Por día: Σ (1 chofer + ayud1?1 + ayud2?1) / cantidad de egresos.
      // MTD: Σ personas-viaje del mes / Σ egresos del mes (= mismo cálculo
      //   que el card "FTE Promedio" del tablero /indicadores/tml).
      const { data: regsRaw } = await supabase
        .from("registros_vehiculos")
        .select("fecha, ayudante1, ayudante2")
        .eq("tipo", "egreso")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)

      const personasViajeDia: Record<string, number> = {}
      const egresosDia: Record<string, number> = {}
      const esAyudante = (s: string | null) => {
        if (!s) return false
        const t = s.trim().toUpperCase()
        return t.length > 0 && t !== "SIN AYUDANTE"
      }
      for (const r of (regsRaw ?? []) as Array<{
        fecha: string
        ayudante1: string | null
        ayudante2: string | null
      }>) {
        const ft = 1 + (esAyudante(r.ayudante1) ? 1 : 0) + (esAyudante(r.ayudante2) ? 1 : 0)
        personasViajeDia[r.fecha] = (personasViajeDia[r.fecha] ?? 0) + ft
        egresosDia[r.fecha] = (egresosDia[r.fecha] ?? 0) + 1
      }

      const fteValores: Record<
        string,
        {
          reunion_id: string
          valor: number | null
          observacion: string | null
        } | null
      > = {}
      let ftePersonasMtd = 0
      let fteEgresosMtd = 0
      for (const f of fechas) {
        const eg = egresosDia[f] ?? 0
        if (eg > 0) {
          const personas = personasViajeDia[f] ?? 0
          fteValores[f] = {
            reunion_id: "auto",
            valor: Math.round((personas / eg) * 100) / 100,
            observacion: null,
          }
          if (f <= fecha) {
            ftePersonasMtd += personas
            fteEgresosMtd += eg
          }
        } else {
          fteValores[f] = null
        }
      }
      indicadoresAuto.push({
        id: "auto_fte",
        nombre: "FTE",
        unidad: null,
        meta: null,
        orden: -1,
        agregacion: "promedio",
        valores: fteValores,
        mtd:
          fteEgresosMtd > 0
            ? Math.round((ftePersonasMtd / fteEgresosMtd) * 100) / 100
            : null,
        auto: true,
      })
    }

    // 7d. Indicadores AUTO warehouse + logistica — KPIs del handbook 2025.
    //     Vienen de deposito-esteban.vercel.app (APIs públicas) + Google Sheet
    //     de errores picking. Tolerante a fallos: si una fuente cae, su KPI
    //     queda en null pero el resto sigue. Para detalle por operador del
    //     día, ver getAperturaPickingDia() y el dialog AperturaPickingDetalleDiaDialog.
    //
    //     Warehouse: Productividad, Errores, Precisión, Roturas y Faltantes
    //     (hasta el día anterior). WQI/FGLI/SCL/Capacidad quedan fuera por ahora.
    //     Logistica: WQI + Productividad + Precisión, Errores, Roturas,
    //     Faltantes y Ausentismo.
    if (
      tipo === "warehouse" ||
      tipo === "logistica" ||
      (IS_MISIONES && tipo === "matinal-distribucion")
    ) {
      // Misiones: la fuente warehouse (deposito-esteban) es de Pampeana y no
      // aplica acá. Para 'logistica' usamos un set de KPIs basado en Foxtrot
      // (rutas, entregas, TML) + ausentismo. 'warehouse' no tiene equivalente
      // en Misiones por ahora; cuando integremos el dashboard de Analía
      // (perdidas-deposito) podremos cubrirlo. Por ahora si alguien crea una
      // reunión 'warehouse' en Misiones, los AUTO de warehouse no se llenan.
      if (IS_MISIONES) {
        // En Misiones descartamos los AUTO de Pampeana (LTI/TRI/Rechazos %/
        // Bultos-HL vendidos/TML liberación/Camiones/Checklist/Km/Horas/FTE)
        // ya acumulados en `indicadoresAuto`: armamos una lista limpia.
        if (tipo === "logistica" || tipo === "matinal-distribucion") {
          const ms = await buildMisionesLogisticaSerie(
            supabase,
            fechas,
            fecha,
            sucursal,
          )
          // Ausentismo ya no se calcula desde Foxtrot: ahora es un indicador de
          // carga manual (sobrevive como fila de config, ver más abajo).

          // Formato HH:MM a partir de minutos (para "Horas en ruta"). El valor
          // numérico (minutos) se preserva para que el MTD promedie bien; el
          // texto formateado se muestra en celda y MTD.
          const fmtHHMM = (min: number): string => {
            const tot = Math.max(0, Math.round(min))
            return `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, "0")}`
          }
          const aplicarHHMM = (
            row: ReunionIndicadoresMes["indicadores"][number],
          ) => {
            for (const f of fechas) {
              const cell = row.valores[f]
              if (cell && cell.valor != null) cell.texto = fmtHHMM(cell.valor)
            }
            if (row.mtd != null) row.mtd_texto = fmtHHMM(row.mtd)
            return row
          }

          // Filas AUTO de Foxtrot/Chess (adoptan los nombres que el usuario ya
          // tenía configurados como manuales, para reemplazarlos sin duplicar).
          const cantCamionesRow = buildSerieRow(
            "auto_cantidad_camiones", "Cantidad de camiones", "u.",
            ms.rutas_distribucion, "promedio", null, "mayor",
          )
          const bultosRow = buildSerieRow(
            "auto_bultos_totales", "Bultos totales", "bultos",
            ms.bultos_salida_reparto, "suma", null, "mayor",
          )
          const hlRow = buildSerieRow(
            "auto_hl", "HL", "HL", ms.hl, "suma", null, "mayor",
          )
          const obRow = buildSerieRow(
            "auto_ob", "Ocupación de bodega", "CEq", ms.ob, "promedio", null, "mayor",
          )
          // OB se muestra sin decimales (el MTD es promedio → redondear).
          if (obRow.mtd != null) obRow.mtd = Math.round(obRow.mtd)
          const rechazoRow = buildSerieRow(
            "auto_rechazo", "Rechazo", "%", ms.pct_rechazo, "promedio", 2, "menor",
          )
          const entregasRow = buildSerieRow(
            "auto_pct_entregas_exitosas", "% Entregas exitosas", "%",
            ms.pct_entregas_exitosas, "promedio", 98, "mayor",
          )
          // Horas en ruta: valor en minutos, display HH:MM.
          const horasRutaRow = aplicarHHMM(
            buildSerieRow(
              "auto_horas_en_ruta", "Horas en ruta", "hs",
              ms.tiempo_ruta_promedio, "promedio", null, "menor",
            ),
          )
          const tlpRow = buildSerieRow(
            "auto_tlp", "TLP", "CEq/h", ms.tlp, "promedio", null, "mayor",
          )
          const tiempoPdvRow = buildSerieRow(
            "auto_tiempo_pdv", "Tiempo por PDV", "min", ms.tiempo_pdv, "promedio", null, "menor",
          )
          // id distinto de "auto_tml" a propósito: ese id dispara en el cliente
          // el dialog de TML de liberación (Pampeana) que consulta
          // registros_vehiculos.hora_entrada — tabla/columna inexistente en
          // Misiones. Con "auto_tml_fx" la celda no es clickeable (el detalle
          // del TML Foxtrot está en /indicadores/tml-foxtrot).
          const tmlRow = buildSerieRow(
            "auto_tml_fx", "TML", "min", ms.tml_promedio, "promedio", 25, "menor",
          )
          // Errores operativos de depósito (Analía). Fila nueva, sin manual homónimo.
          const erroresRow = buildSerieRow(
            "auto_errores_deposito", "Errores de picking", "errores", ms.errores, "suma", null, "menor",
          )

          // Matinal Distribución (Misiones): set acotado pedido por operación
          // — solo Bultos totales, TML, Tiempo por PDV, Rechazo y Horas en
          // ruta (auto Foxtrot) + los indicadores manuales configurados (ej.
          // RMD). No arrastra LTI/TRI/Ausentismo ni el resto del set completo
          // de la reunión de Logística.
          if (tipo === "matinal-distribucion") {
            return {
              data: {
                anio,
                mes,
                fechas,
                reuniones_por_fecha: reunionesPorFecha,
                indicadores: [
                  bultosRow,
                  tmlRow,
                  tiempoPdvRow,
                  rechazoRow,
                  horasRutaRow,
                  ...indicadores,
                ],
              },
            }
          }

          // Reordenamiento pedido: el bloque SIF (Actual/Potencial/Precursor,
          // ex-LTI/TRI) y Ausentismo —todos de carga manual— van al inicio;
          // luego los KPIs operativos AUTO; al final el resto de los manuales.
          // sifRank ordena el bloque SIF y reconoce los nombres viejos (lti/tri)
          // por si el deploy va antes que el rename en la base.
          const sifRank = (n: string): number | null => {
            const l = n.trim().toLowerCase()
            if (l === "sif actual" || l === "lti") return 0
            if (l === "sif potencial" || l === "tri") return 1
            if (l === "sif precursor") return 2
            return null
          }
          const esAusentismo = (n: string) => n.trim().toLowerCase() === "ausentismo"
          // Productividad de picking y Pérdidas (manuales) van inmediatamente
          // debajo de "Errores de picking", dentro del bloque AUTO. El resto de
          // los manuales queda al final.
          const pickPerdRank = (n: string): number | null => {
            const l = n.trim().toLowerCase()
            if (l === "productividad de picking") return 0
            if (l === "pérdidas" || l === "perdidas") return 1
            return null
          }
          const sifRows = indicadores
            .filter((i) => sifRank(i.nombre) !== null)
            .sort((a, b) => (sifRank(a.nombre) ?? 99) - (sifRank(b.nombre) ?? 99))
          const ausentismoRows = indicadores.filter((i) => esAusentismo(i.nombre))
          const pickingPerdidasRows = indicadores
            .filter((i) => pickPerdRank(i.nombre) !== null)
            .sort(
              (a, b) =>
                (pickPerdRank(a.nombre) ?? 99) - (pickPerdRank(b.nombre) ?? 99),
            )
          const otrosManuales = indicadores.filter(
            (i) =>
              sifRank(i.nombre) === null &&
              !esAusentismo(i.nombre) &&
              pickPerdRank(i.nombre) === null,
          )

          // Checks de Cloudfleet (liberación/retorno/AE) — solo Misiones. Se
          // leen de cloudfleet_checklists (con refresh best-effort del día de
          // hoy adentro del helper). Adherencia usa la Cantidad de camiones de
          // Foxtrot como denominador: (LIB + RET) / (2 × camiones) × 100.
          const cf = await buildCloudfleetChecksSerie(supabase, fechas, sucursal)
          const adherenciaChecks: Record<string, number | null> = {}
          for (const f of fechas) {
            const camiones = ms.rutas_distribucion[f]
            const lib = cf.lib_count[f] ?? 0
            const ret = cf.ret_count[f] ?? 0
            adherenciaChecks[f] =
              camiones && camiones > 0
                ? ((lib + ret) / (2 * camiones)) * 100
                : null
          }
          const checksAprobadosRow = buildSerieRow(
            "auto_checks_aprobados", "Checks Aprobados", "checks",
            cf.checks_aprobados, "suma", null, "mayor",
          )
          const checksRechazadosRow = buildSerieRow(
            "auto_checks_rechazados", "Checks Rechazados", "checks",
            cf.checks_rechazados, "suma", 0, "menor",
          )
          const aeAprobadosRow = buildSerieRow(
            "auto_ae_aprobados", "AE Aprobados", "checks",
            cf.ae_aprobados, "suma", null, "mayor",
          )
          const adherenciaChecksRow = buildSerieRow(
            "auto_adherencia_checks", "Adherencia a checks", "%",
            adherenciaChecks, "promedio", 100, "mayor",
          )

          const autosOrdenados = [
            bultosRow,
            hlRow,
            cantCamionesRow,
            obRow,
            rechazoRow,
            entregasRow,
            horasRutaRow,
            tlpRow,
            tiempoPdvRow,
            tmlRow,
            erroresRow,
            ...pickingPerdidasRows,
            checksAprobadosRow,
            checksRechazadosRow,
            aeAprobadosRow,
            adherenciaChecksRow,
          ]

          return {
            data: {
              anio,
              mes,
              fechas,
              reuniones_por_fecha: reunionesPorFecha,
              indicadores: [
                ...sifRows,
                ...ausentismoRows,
                ...autosOrdenados,
                ...otrosManuales,
              ],
            },
          }
        }
        // Misiones · warehouse: sin AUTO por ahora (fase 2 = integrar Analía)
        return {
          data: {
            anio,
            mes,
            fechas,
            reuniones_por_fecha: reunionesPorFecha,
            indicadores: [...indicadores],
          },
        }
      }

      const serie = await buildWarehouseSerieDiaria(fechas, fecha)

      // Métricas diarias (cada celda tiene valor del día, no acumulado).
      // El MTD se computa según `agregacion`.
      function buildSerieRow(
        id: string,
        nombre: string,
        unidad: string,
        porFecha: Record<string, number | null>,
        agregacion: "suma" | "promedio",
        meta: number | null,
        mejorSi: "menor" | "mayor" | undefined,
      ): ReunionIndicadoresMes["indicadores"][number] {
        const valoresPorFecha: Record<
          string,
          { reunion_id: string; valor: number | null; observacion: string | null } | null
        > = {}
        const numericos: number[] = []
        for (const f of fechas) {
          const v = porFecha[f] ?? null
          valoresPorFecha[f] = {
            reunion_id: "auto",
            valor: v,
            observacion: null,
          }
          if (v !== null && Number.isFinite(v) && f <= fecha) {
            numericos.push(v)
          }
        }
        let mtd: number | null = null
        if (numericos.length > 0) {
          if (agregacion === "suma") {
            mtd = numericos.reduce((a, b) => a + b, 0)
          } else {
            mtd =
              numericos.reduce((a, b) => a + b, 0) / numericos.length
          }
        }
        return {
          id,
          nombre,
          unidad,
          meta,
          orden: -1,
          agregacion,
          valores: valoresPorFecha,
          mtd,
          auto: true,
          mejor_si: mejorSi,
        }
      }

      // Precisión de picking: nunca reportar 100%. Aunque el redondeo a 2
      // decimales llegue a 100,00 (p. ej. 99,996%), siempre hubo algún error,
      // así que se topea en 99,9% para no mostrar una precisión "perfecta"
      // que queda desprolija. Se aplica sobre la serie cruda, de modo que
      // tanto las celdas diarias como el MTD (promedio) queden por debajo de
      // 100. Pedido de negocio.
      function capPrecision(
        porFecha: Record<string, number | null>,
      ): Record<string, number | null> {
        const out: Record<string, number | null> = {}
        for (const [f, v] of Object.entries(porFecha)) {
          // Solo topear cuando el valor REAL es < 100 (hubo al menos un
          // error) pero el redondeo a 2 decimales lo empujaría a 100,00.
          // Un día con 0 errores da exactamente 100,0 (no es < 100) y debe
          // mostrarse 100. Pedido de negocio.
          out[f] =
            v != null &&
            Number.isFinite(v) &&
            v < 100 &&
            Math.round(v * 100) / 100 >= 100
              ? 99.9
              : v
        }
        return out
      }

      // Métricas acumuladas día por día (MTD progresivo: cada celda ya tiene
      // el valor acumulado desde el 1° hasta ese día). El MTD del indicador
      // es el valor en la fecha de la reunión (el último acumulado conocido).
      function buildAcumuladoRow(
        id: string,
        nombre: string,
        unidad: string,
        porFecha: Record<string, number | null>,
        meta: number | null,
        mejorSi: "menor" | "mayor" | undefined,
      ): ReunionIndicadoresMes["indicadores"][number] {
        const valoresPorFecha: Record<
          string,
          { reunion_id: string; valor: number | null; observacion: string | null } | null
        > = {}
        for (const f of fechas) {
          valoresPorFecha[f] = {
            reunion_id: "auto",
            valor: porFecha[f] ?? null,
            observacion: null,
          }
        }
        // MTD = último acumulado conocido hasta la fecha de la reunión
        // (inclusive). Si ese día no tiene dato — fin de semana, o el WQI
        // que oculta el día en curso — se toma el último día con valor,
        // no null.
        let mtd: number | null = null
        for (const f of fechas) {
          if (f > fecha) break
          const v = porFecha[f]
          if (v != null && Number.isFinite(v)) mtd = v
        }
        return {
          id,
          nombre,
          unidad,
          meta,
          orden: -1,
          agregacion: "promedio",
          valores: valoresPorFecha,
          mtd,
          auto: true,
          mejor_si: mejorSi,
        }
      }

      // Indicadores con doble vista: cada celda muestra el valor del día
      // (no acumulado), pero el MTD del indicador toma el último valor
      // de la serie MTD acumulada del mes. Se usa para WQI/Roturas/
      // Faltantes/FGLI/SCL en la reunión de logística.
      function buildDiarioConMtdRow(
        id: string,
        nombre: string,
        unidad: string,
        porFechaDia: Record<string, number | null>,
        porFechaMtd: Record<string, number | null>,
        meta: number | null,
        mejorSi: "menor" | "mayor" | undefined,
      ): ReunionIndicadoresMes["indicadores"][number] {
        const valoresPorFecha: Record<
          string,
          { reunion_id: string; valor: number | null; observacion: string | null } | null
        > = {}
        for (const f of fechas) {
          valoresPorFecha[f] = {
            reunion_id: "auto",
            valor: porFechaDia[f] ?? null,
            observacion: null,
          }
        }
        let mtd: number | null = null
        for (const f of fechas) {
          if (f > fecha) break
          const v = porFechaMtd[f]
          if (v != null && Number.isFinite(v)) mtd = v
        }
        return {
          id,
          nombre,
          unidad,
          meta,
          orden: -1,
          agregacion: "promedio",
          valores: valoresPorFecha,
          mtd,
          auto: true,
          mejor_si: mejorSi,
        }
      }

      // Logística: WQI (con drill al detalle de roturas/faltantes/$ del día) y
      // Productividad de picking + Precisión, errores totales del día con drill
      // por operador, y Ausentismo. Roturas y Faltantes ya no van como filas
      // propias: su detalle vive en el popover del WQI.
      if (tipo === "logistica") {
        // Ausentismo del mes (Depósito + Distribución), valor del día.
        // Drill por día desde la grilla muestra quién está ausente.
        const ausentismoRes = await getAusentismoSerieEventos(mes, anio)
        const ausentismoPorFechaRaw = "data" in ausentismoRes
          ? ausentismoRes.data.por_fecha
          : {}
        // Ocultar el día de la reunión (y futuros): a la hora del matinal el
        // ausentismo de hoy todavía no está confirmado, igual que precisión y
        // productividad. Solo se muestran días < fecha de la reunión.
        const ausentismoPorFecha: Record<string, number | null> = {}
        for (const [f, v] of Object.entries(ausentismoPorFechaRaw)) {
          ausentismoPorFecha[f] = f < fecha ? v : null
        }

        // WQI recalculado sobre el HL VENDIDOS del tablero
        // (`ventas_diarias.total_hl`, Chess/rechazos-sync), NO sobre el HL
        // despachado de deposito-esteban (mercosur-dashboard) que trae
        // `serie.wqi_dia/serie.wqi`. Numerador: HL de roturas de serie-diaria
        // (ya enmascarado al último día cerrado). Misma fuente HL que la fila
        // auto "HL vendidos" del tablero, para que ambas coincidan.
        // Pedido del usuario 2026-06-18.
        const { data: ventHlRaw } = await supabase
          .from("ventas_diarias")
          .select("fecha, total_hl")
          .gte("fecha", fechaDesde)
          .lte("fecha", fechaHasta)
        const hlVendidoDia: Record<string, number> = {}
        for (const v of (ventHlRaw ?? []) as Array<{
          fecha: string
          total_hl: number | null
        }>) {
          const h = Number(v.total_hl ?? 0)
          if (Number.isFinite(h)) {
            hlVendidoDia[v.fecha] = (hlVendidoDia[v.fecha] ?? 0) + h
          }
        }
        // Celda diaria = HL roturas día / HL vendido día × 1M.
        // MTD acumulado = Σ HL roturas / Σ HL vendido (solo días cerrados),
        // numerador tomado de `serie.roturas` para coincidir con la fila Roturas.
        const wqiDiaTablero: Record<string, number | null> = {}
        const wqiMtdTablero: Record<string, number | null> = {}
        let accHlVend = 0
        for (const f of fechas) {
          const rotDia = serie.roturas_dia[f]
          const hlDia = hlVendidoDia[f] ?? 0
          wqiDiaTablero[f] =
            rotDia != null && Number.isFinite(rotDia) && hlDia > 0
              ? Math.round((rotDia / hlDia) * 1_000_000 * 10) / 10
              : null
          if (f < fecha) {
            accHlVend += hlDia
            const rotAcum = serie.roturas[f]
            wqiMtdTablero[f] =
              rotAcum != null && Number.isFinite(rotAcum) && accHlVend > 0
                ? Math.round((rotAcum / accHlVend) * 1_000_000 * 10) / 10
                : null
          } else {
            wqiMtdTablero[f] = null
          }
        }

        // WNP (productividad del depósito, HL/HH) recalculado con la MISMA
        // fuente de HL que el WQI y la fila "HL vendidos": el HL DESPACHADO de
        // `ventas_diarias` (Chess+Gestión, por fecha de carga) — NO el HL
        // facturado de deposito-esteban (serie.wnp). Denominador: HORAS REALES
        // del fichaje biométrico del personal de Depósito (legajos abajo), en
        // lugar de las horas fijas 72/32 de serie.wnp. Gestión se incluye porque
        // también sale del depósito Esteban. Pedido de Leonardo 2026-06-25 — el
        // día que cambie el equipo se actualiza la lista de legajos.
        const LEGAJOS_WNP = [30, 107, 110, 112, 135, 36467481, 43907801, 425283564]
        const { data: fichajeRaw } = await supabase
          .from("asistencia_resumen_diario")
          .select("fecha, horas_trabajadas")
          .in("legajo", LEGAJOS_WNP)
          .gte("fecha", fechaDesde)
          .lte("fecha", fechaHasta)
        const horasFichajeDia: Record<string, number> = {}
        for (const r of (fichajeRaw ?? []) as Array<{
          fecha: string
          horas_trabajadas: number | null
        }>) {
          const h = Number(r.horas_trabajadas ?? 0)
          if (Number.isFinite(h) && h > 0) {
            horasFichajeDia[r.fecha] = (horasFichajeDia[r.fecha] ?? 0) + h
          }
        }
        // WNP día = HL despachado del día / horas fichadas del día.
        // WNP MTD = Σ HL / Σ horas (solo días cerrados con venta Y fichaje;
        // un día sin uno de los dos queda vacío y fuera del MTD). Se enmascara
        // el día de la reunión y futuros (f < fecha), igual que el resto de los
        // indicadores auto: al matinal el día de hoy todavía no está cerrado.
        const wnpDiaTablero: Record<string, number | null> = {}
        const wnpMtdTablero: Record<string, number | null> = {}
        let accHlWnp = 0
        let accHorasWnp = 0
        for (const f of fechas) {
          const hlDia = hlVendidoDia[f] ?? 0
          const horasDia = horasFichajeDia[f] ?? 0
          const okDia = f < fecha && hlDia > 0 && horasDia > 0
          wnpDiaTablero[f] = okDia
            ? Math.round((hlDia / horasDia) * 100) / 100
            : null
          if (okDia) {
            accHlWnp += hlDia
            accHorasWnp += horasDia
            wnpMtdTablero[f] = Math.round((accHlWnp / accHorasWnp) * 100) / 100
          } else {
            wnpMtdTablero[f] = null
          }
        }

        indicadoresAuto.push(
          buildDiarioConMtdRow(
            "auto_wqi",
            "WQI",
            "PPM",
            wqiDiaTablero,
            wqiMtdTablero,
            serie.targets.wqi,
            "menor",
          ),
          buildDiarioConMtdRow(
            "auto_wnp",
            "WNP",
            "HL/HH",
            wnpDiaTablero,
            wnpMtdTablero,
            serie.targets.wnp,
            "mayor",
          ),
          buildSerieRow(
            "auto_productividad_picking",
            "Productividad de picking",
            "bul/HH",
            serie.productividad,
            "promedio",
            300,
            "mayor",
          ),
          buildSerieRow(
            "auto_precision_picking",
            "Precision picking",
            "%",
            capPrecision(serie.precision),
            "promedio",
            99.8,
            "mayor",
          ),
          buildSerieRow(
            "auto_errores_picking",
            "Errores de picking",
            "bultos",
            serie.errores_dia,
            "suma",
            null,
            "menor",
          ),
          buildSerieRow(
            "auto_ausentismo",
            "Ausentismo",
            "personas",
            ausentismoPorFecha,
            "suma",
            null,
            "menor",
          ),
        )
        // Roturas y Faltantes ya no se muestran como filas propias en la
        // reunión de logística (pedido del usuario): la calidad se sigue por
        // WQI, y el detalle de roturas/faltantes/$ del día se ve haciendo
        // click en la celda de WQI (popover "Ventas y pérdidas del día").
      }

      // Solo warehouse (rol de depósito): por pedido, sólo Productividad,
      // Errores, Precisión, Roturas y Faltantes — todos hasta el último día
      // cerrado (se oculta el día en curso). WQI/FGLI/SCL/Capacidad quedan
      // fuera por ahora.
      if (tipo === "warehouse") {
        // Productividad: enmascarar el día en curso (igual que precisión,
        // errores y ausentismo). La serie cruda la trae con el día de hoy.
        const productividadHastaAyer: Record<string, number | null> = {}
        for (const f of fechas) {
          productividadHastaAyer[f] =
            f < fecha ? (serie.productividad[f] ?? null) : null
        }

        // Productividad de maquinistas (carga de camiones / despacho) en
        // Pal/HH. Sólo warehouse. Detalle por operario al clickear el día
        // (ver getAperturaMaquinistasDia + AperturaMaquinistasDetalleDiaDialog).
        // Se enmascara el día en curso (igual que picking): el despacho de hoy
        // todavía no está cerrado. Va inmediatamente debajo del picking.
        const maqDespacho = await buildMaquinistasDespachoSerie(fechas)
        const maqHastaAyer: Record<string, number | null> = {}
        for (const f of fechas) {
          maqHastaAyer[f] = f < fecha ? (maqDespacho[f] ?? null) : null
        }

        indicadoresAuto.push(
          buildSerieRow(
            "auto_productividad_picking",
            "Productividad de picking",
            "bul/HH",
            productividadHastaAyer,
            "promedio",
            300,
            "mayor",
          ),
          buildSerieRow(
            "auto_productividad_maquinistas",
            "Productividad maquinistas",
            "Pal/HH",
            maqHastaAyer,
            "promedio",
            25,
            "mayor",
          ),
          buildSerieRow(
            "auto_errores_picking",
            "Errores de picking",
            "bultos",
            serie.errores_dia,
            "suma",
            null,
            "menor",
          ),
          buildSerieRow(
            "auto_precision_picking",
            "Precision picking",
            "%",
            capPrecision(serie.precision),
            "promedio",
            99.8,
            "mayor",
          ),
          buildDiarioConMtdRow(
            "auto_roturas",
            "Roturas",
            "HL",
            serie.roturas_dia,
            serie.roturas,
            serie.targets.roturas,
            "menor",
          ),
          buildDiarioConMtdRow(
            "auto_faltantes",
            "Faltantes",
            "HL",
            serie.faltantes_dia,
            serie.faltantes,
            serie.targets.faltantes,
            "menor",
          ),
        )
      }
    }

    // 7f. Indicadores AUTO de Foxtrot — Matinal de Distribución de PAMPEANA.
    //     (En Misiones la matinal ya se resolvió arriba con su propia serie y
    //     retornó.) Calidad de conducción (click score / adherencia /
    //     resecuenciado) + operativos de ruta, todo desde foxtrot_routes.
    //     Drill por día → detalle por patente (cruce con egreso TML).
    if (!IS_MISIONES && tipo === "matinal-distribucion") {
      try {
        const fx = await buildPampeanaFoxtrotSerie(supabase, fechas)
        // Helper local (buildSerieRow vive en otro bloque y no está en scope acá).
        const fxRow = (
          id: string,
          nombre: string,
          unidad: string,
          porFecha: Record<string, number | null>,
          agregacion: "suma" | "promedio",
          meta: number | null,
          mejorSi: "menor" | "mayor" | undefined,
        ): ReunionIndicadoresMes["indicadores"][number] => {
          const valoresPorFecha: Record<
            string,
            { reunion_id: string; valor: number | null; observacion: string | null } | null
          > = {}
          const numericos: number[] = []
          for (const f of fechas) {
            const v = porFecha[f] ?? null
            valoresPorFecha[f] = { reunion_id: "auto", valor: v, observacion: null }
            if (v !== null && Number.isFinite(v) && f <= fecha) numericos.push(v)
          }
          let mtd: number | null = null
          if (numericos.length > 0) {
            const sum = numericos.reduce((a, b) => a + b, 0)
            mtd = agregacion === "suma" ? sum : sum / numericos.length
          }
          return {
            id, nombre, unidad, meta, orden: -1, agregacion,
            valores: valoresPorFecha, mtd, auto: true, mejor_si: mejorSi,
          }
        }
        indicadoresAuto.push(
          fxRow("auto_fx_click_score", "Driver Click Score", "%", fx.click_score, "promedio", 90, "mayor"),
          fxRow("auto_fx_adherencia", "Adherencia a la secuencia", "%", fx.adherencia_secuencia, "promedio", 80, "mayor"),
          fxRow("auto_fx_resecuenciado", "Rutas con resecuenciado", "%", fx.pct_resecuenciado, "promedio", null, "mayor"),
          fxRow("auto_fx_pct_finalizadas", "Rutas finalizadas", "%", fx.pct_finalizadas, "promedio", 100, "mayor"),
          fxRow("auto_fx_entregas_ok", "Entregas exitosas", "%", fx.pct_entregas_exitosas, "promedio", 98, "mayor"),
          fxRow("auto_fx_tiempo_ruta", "Tiempo en ruta", "min", fx.tiempo_ruta, "promedio", null, "menor"),
          fxRow("auto_fx_tiempo_pdv", "Tiempo por PDV", "min", fx.tiempo_pdv, "promedio", null, "menor"),
          fxRow("auto_fx_km", "Km recorridos", "km", fx.km_recorridos, "suma", null, undefined),
          fxRow("auto_fx_paradas_no_auth", "Paradas no autorizadas", "u.", fx.paradas_no_autorizadas, "suma", null, "menor"),
        )
      } catch {
        // si Foxtrot/DB falla, la matinal sigue con el resto de los indicadores
      }
    }

    // Dedup final: una fila de config cuyo nombre coincide con un indicador
    // AUTO no debe mostrarse como fila manual duplicada. Esas filas existen
    // sólo para guardar el `gatillo` (umbral rojo) del indicador automático
    // — el wrapper getIndicadoresMes lo inyecta por nombre en la fila auto.
    const autoNombres = new Set(
      indicadoresAuto.map((a) => a.nombre.trim().toLowerCase()),
    )
    const indicadoresManual = indicadores.filter(
      (m) => !autoNombres.has(m.nombre.trim().toLowerCase()),
    )

    return {
      data: {
        anio,
        mes,
        fechas,
        reuniones_por_fecha: reunionesPorFecha,
        indicadores: [...indicadoresAuto, ...indicadoresManual],
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

// =============================================
// Apertura por operador del día (sub-cuadro contextual — solo warehouse)
// =============================================

/**
 * Devuelve la apertura por operador (Troli/Galvez/Ovejero) para una fecha específica.
 * Datos en vivo desde el WMS + Google Sheet + overrides manuales de bul/HH.
 */
export async function getAperturaPickingDia(
  reunionId: string,
  fecha: string,
): Promise<Result<AperturaPickingDelDia>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Fecha inválida (formato esperado YYYY-MM-DD)" }
    }

    const { data: overridesRaw } = await supabase
      .from("reunion_apertura_picking")
      .select("operador, hl_hh")
      .eq("reunion_id", reunionId)

    const overrides = new Map<OperadorApertura, number | null>()
    for (const a of (overridesRaw ?? []) as Array<{
      operador: string
      hl_hh: number | null
    }>) {
      const op = OPERADORES_APERTURA.find(
        (o) => o.toLowerCase() === a.operador.toLowerCase(),
      )
      if (op && a.hl_hh !== null) overrides.set(op, Number(a.hl_hh))
    }

    const data = await buildAperturaPickingDelDia(fecha, overrides)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error obteniendo apertura por operador",
    }
  }
}

/**
 * Devuelve la apertura por maquinista (despacho / carga de camiones) para una
 * fecha específica: Pal/HH y Bul/HH por operario. Datos en vivo desde
 * deposito-esteban (productividad-maquinistas). Read-only (sin overrides).
 */
export async function getAperturaMaquinistasDia(
  reunionId: string,
  fecha: string,
): Promise<Result<AperturaMaquinistasDelDia>> {
  try {
    await requireAuth()

    if (!reunionId) return { error: "ID de reunión inválido" }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Fecha inválida (formato esperado YYYY-MM-DD)" }
    }

    const data = await buildAperturaMaquinistasDelDia(fecha)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error obteniendo apertura de maquinistas",
    }
  }
}

/**
 * Upsert del bul/HH manual para un operador en una reunión.
 * El nombre de columna en la tabla es hl_hh (histórico de cuando la unidad
 * planeada era HL/HH), pero conceptualmente es bul/HH.
 * Permisos: igual que setIndicadorValor (editor O asistente activo).
 */
export async function setAperturaPickingHlHh(
  reunionId: string,
  operador: OperadorApertura,
  bulHh: number | null,
): Promise<Result<{ reunion_id: string; operador: string; hl_hh: number | null }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!reunionId) return { error: "ID de reunión inválido" }
    if (!OPERADORES_APERTURA.includes(operador)) {
      return { error: "Operador inválido" }
    }
    if (bulHh !== null && !Number.isFinite(bulHh)) {
      return { error: "bul/HH inválido" }
    }

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
            "Solo editores o asistentes de la reunión pueden cargar la apertura",
        }
      }
    }

    const { data, error } = await supabase
      .from("reunion_apertura_picking")
      .upsert(
        {
          reunion_id: reunionId,
          operador,
          hl_hh: bulHh,
        },
        { onConflict: "reunion_id,operador" },
      )
      .select("reunion_id, operador, hl_hh")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as { reunion_id: string; operador: string; hl_hh: number | null } }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error guardando apertura por operador",
    }
  }
}
