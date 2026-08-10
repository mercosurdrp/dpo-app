"use server"
/**
 * Salidas programadas: administración define la formación del día (patente +
 * chofer + hasta 2 ayudantes) desde /salidas. Ver la migración
 * 20260810160000_salidas_programadas.sql para el doble propósito
 * (planificación + atribución persona↔camión).
 */
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, requireRole } from "@/lib/session"
import { hoyAR } from "@/lib/herramientas-gestion"

const ROLES_EDICION = ["admin", "supervisor"] as const

// ---------- Types ----------

export interface SalidaRow {
  id: string
  fecha: string
  patente: string
  chofer_empleado_id: string | null
  chofer_nombre: string | null
  ayudante1_empleado_id: string | null
  ayudante1_nombre: string | null
  ayudante2_empleado_id: string | null
  ayudante2_nombre: string | null
  notas: string | null
}

export interface DatosSalidas {
  empleados: { id: string; nombre: string; sector: string }[]
  patentes: string[]
}

export interface SalidaInput {
  fecha: string
  patente: string
  chofer_empleado_id: string | null
  ayudante1_empleado_id: string | null
  ayudante2_empleado_id: string | null
  notas: string | null
}

// ---------- Queries ----------

function esFechaValida(f: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(f)
}

export async function getSalidasDia(
  fecha: string,
): Promise<{ data: SalidaRow[] } | { error: string }> {
  try {
    await requireAuth()
    if (!esFechaValida(fecha)) return { error: "Fecha inválida" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("salidas_programadas")
      .select("id, fecha, patente, chofer_empleado_id, ayudante1_empleado_id, ayudante2_empleado_id, notas")
      .eq("fecha", fecha)
      .order("patente")
    if (error) return { error: error.message }

    const rows = data ?? []
    const ids = new Set<string>()
    for (const r of rows) {
      for (const id of [r.chofer_empleado_id, r.ayudante1_empleado_id, r.ayudante2_empleado_id]) {
        if (id) ids.add(id)
      }
    }
    const nombres = new Map<string, string>()
    if (ids.size > 0) {
      const { data: emps } = await supabase
        .from("empleados")
        .select("id, nombre")
        .in("id", [...ids])
      for (const e of emps ?? []) nombres.set(e.id, e.nombre)
    }

    return {
      data: rows.map((r) => ({
        id: r.id,
        fecha: r.fecha,
        patente: r.patente,
        chofer_empleado_id: r.chofer_empleado_id,
        chofer_nombre: r.chofer_empleado_id ? (nombres.get(r.chofer_empleado_id) ?? null) : null,
        ayudante1_empleado_id: r.ayudante1_empleado_id,
        ayudante1_nombre: r.ayudante1_empleado_id ? (nombres.get(r.ayudante1_empleado_id) ?? null) : null,
        ayudante2_empleado_id: r.ayudante2_empleado_id,
        ayudante2_nombre: r.ayudante2_empleado_id ? (nombres.get(r.ayudante2_empleado_id) ?? null) : null,
        notas: r.notas,
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando salidas" }
  }
}

/** Empleados activos + patentes del catálogo, para los selects del form. */
export async function getDatosSalidas(): Promise<
  { data: DatosSalidas } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [{ data: emps }, { data: vehiculos }] = await Promise.all([
      supabase
        .from("empleados")
        .select("id, nombre, sector")
        .eq("activo", true)
        .order("nombre"),
      supabase
        .from("catalogo_vehiculos")
        .select("dominio")
        .eq("active", true)
        .order("dominio"),
    ])
    return {
      data: {
        empleados: (emps ?? []) as DatosSalidas["empleados"],
        patentes: ((vehiculos ?? []) as { dominio: string }[])
          .map((v) => v.dominio)
          .filter(Boolean),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" }
  }
}

// ---------- Mutations ----------

export async function upsertSalida(
  input: SalidaInput,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole([...ROLES_EDICION])
    if (!esFechaValida(input.fecha)) return { error: "Fecha inválida" }
    const patente = input.patente.trim().toUpperCase()
    if (!patente) return { error: "Falta la patente" }
    if (!input.chofer_empleado_id) return { error: "Falta el chofer" }

    const admin = createAdminClient()
    const { error } = await admin.from("salidas_programadas").upsert(
      {
        fecha: input.fecha,
        patente,
        chofer_empleado_id: input.chofer_empleado_id,
        ayudante1_empleado_id: input.ayudante1_empleado_id || null,
        ayudante2_empleado_id: input.ayudante2_empleado_id || null,
        notas: input.notas?.trim() || null,
        created_by: profile.id,
      },
      { onConflict: "fecha,patente" },
    )
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error guardando salida" }
  }
}

export async function deleteSalida(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole([...ROLES_EDICION])
    const admin = createAdminClient()
    const { error } = await admin.from("salidas_programadas").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error borrando salida" }
  }
}

/**
 * Copia al día destino la última formación cargada anterior a esa fecha
 * (normalmente ayer). No pisa patentes que ya existan en el destino.
 */
export async function copiarUltimaSalida(
  fechaDestino: string,
): Promise<{ copiadas: number; desde: string | null } | { error: string }> {
  try {
    const profile = await requireRole([...ROLES_EDICION])
    if (!esFechaValida(fechaDestino)) return { error: "Fecha inválida" }
    const admin = createAdminClient()

    const { data: ultima } = await admin
      .from("salidas_programadas")
      .select("fecha")
      .lt("fecha", fechaDestino)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!ultima?.fecha) return { copiadas: 0, desde: null }

    const [{ data: origen }, { data: existentes }] = await Promise.all([
      admin
        .from("salidas_programadas")
        .select("patente, chofer_empleado_id, ayudante1_empleado_id, ayudante2_empleado_id, notas")
        .eq("fecha", ultima.fecha),
      admin.from("salidas_programadas").select("patente").eq("fecha", fechaDestino),
    ])
    const yaCargadas = new Set((existentes ?? []).map((e) => e.patente))
    const rows = (origen ?? [])
      .filter((o) => !yaCargadas.has(o.patente))
      .map((o) => ({
        fecha: fechaDestino,
        patente: o.patente,
        chofer_empleado_id: o.chofer_empleado_id,
        ayudante1_empleado_id: o.ayudante1_empleado_id,
        ayudante2_empleado_id: o.ayudante2_empleado_id,
        notas: o.notas,
        created_by: profile.id,
      }))
    if (rows.length > 0) {
      const { error } = await admin.from("salidas_programadas").insert(rows)
      if (error) return { error: error.message }
    }
    return { copiadas: rows.length, desde: ultima.fecha }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error copiando salidas" }
  }
}

/** Mañana en hora argentina, default del selector de fecha. */
export async function getFechaDefaultSalidas(): Promise<string> {
  const d = new Date(`${hoyAR()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
