/**
 * Acceso a la Matriz SKAP de Pampeana con la MISMA interfaz que el store de
 * Misiones (allá todo vive en `app_config`), para que el tablero de Talento y
 * el plan de acción con el PAC sean el mismo código en las dos apps.
 *
 * Acá los datos están en las tablas `skap_*`. Lo único que no tiene columna
 * (y sin DDL desde la VM no se puede agregar) va a `app_config`:
 *   skap:pac:<rol>   → { habilidad_id: capacitacion_id[] } vínculos con el PAC
 *   skap:acc-pac     → { accion_id: capacitacion_id } capacitación de cada acción
 *
 * Todo pasa por la service role: el permiso se valida ANTES, en cada server
 * action. Nunca importar esto desde un componente de cliente.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { escribirClave, leerClave } from "@/lib/clima-store"
import type { SkapAccion, SkapHabilidad, SkapPlanFormacion, SkapRol } from "@/types/database"

export interface SkapEvaluacionGuardada {
  habilidad_id: string
  fecha_evaluacion: string
  nivel: number | null
  estandar_individual: number | null
  observaciones: string | null
  evaluador_id: string | null
}

export type SkapAccionGuardada = SkapAccion & {
  rol: SkapRol
  created_by: string | null
  created_at: string
  /** Capacitación del PAC con la que se cierra este gap (tabla `capacitaciones`). */
  capacitacion_id?: string | null
}

const CLAVE_ACC_PAC = "skap:acc-pac"

export async function leerHabilidades(rol: SkapRol): Promise<SkapHabilidad[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from("skap_habilidades")
    .select("*")
    .eq("rol", rol)
    .eq("activo", true)
    .order("orden")
  if (error) throw new Error(error.message)
  const habs = (data || []) as SkapHabilidad[]
  if (!habs.length) return habs

  const { data: planes } = await db
    .from("skap_plan_formacion")
    .select("*")
    .in(
      "habilidad_id",
      habs.map((h) => h.id),
    )
  const planPorHab = new Map(((planes || []) as SkapPlanFormacion[]).map((p) => [p.habilidad_id, p]))
  return habs.map((h) => {
    const p = planPorHab.get(h.id)
    if (!p) return { ...h, plan: null }
    const { id: _id, habilidad_id: _h, ...plan } = p
    return { ...h, plan }
  })
}

export async function leerAsignados(rol: SkapRol): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("skap_asignaciones")
    .select("empleado_id")
    .eq("rol", rol)
    .eq("activo", true)
  if (error) throw new Error(error.message)
  return ((data || []) as { empleado_id: string }[]).map((a) => a.empleado_id)
}

/** Historial de todo el rol: empleado_id → evaluaciones. */
export async function leerEvaluacionesRol(rol: SkapRol): Promise<Map<string, SkapEvaluacionGuardada[]>> {
  const habs = await leerHabilidades(rol)
  const out = new Map<string, SkapEvaluacionGuardada[]>()
  if (!habs.length) return out
  const db = createAdminClient()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from("skap_evaluaciones")
      .select("empleado_id, habilidad_id, fecha_evaluacion, nivel, estandar_individual, observaciones, evaluador_id")
      .in(
        "habilidad_id",
        habs.map((h) => h.id),
      )
      .order("id")
      .range(desde, desde + 999)
    if (error) throw new Error(error.message)
    const filas = (data || []) as (SkapEvaluacionGuardada & { empleado_id: string })[]
    for (const { empleado_id, ...e } of filas) {
      const lista = out.get(empleado_id) ?? []
      lista.push(e)
      out.set(empleado_id, lista)
    }
    if (filas.length < 1000) break
  }
  return out
}

export async function leerAcciones(rol: SkapRol): Promise<SkapAccionGuardada[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from("skap_acciones")
    .select("*, skap_habilidades!inner(rol)")
    .eq("skap_habilidades.rol", rol)
  if (error) throw new Error(error.message)
  const mapa = (await leerClave<Record<string, string>>(CLAVE_ACC_PAC)) ?? {}
  return ((data || []) as (SkapAccionGuardada & { skap_habilidades: unknown })[]).map(
    ({ skap_habilidades: _sh, ...a }) => ({ ...a, rol, capacitacion_id: mapa[a.id] ?? null }),
  )
}

export async function leerAccion(rol: SkapRol, id: string): Promise<SkapAccionGuardada | null> {
  return (await leerAcciones(rol)).find((a) => a.id === id) ?? null
}

export async function guardarAccion(accion: SkapAccionGuardada, autorId: string | null): Promise<void> {
  const { rol: _rol, capacitacion_id, ...fila } = accion
  const { error } = await createAdminClient().from("skap_acciones").upsert(fila, { onConflict: "id" })
  if (error) throw new Error(error.message)

  const mapa = (await leerClave<Record<string, string>>(CLAVE_ACC_PAC)) ?? {}
  if ((mapa[accion.id] ?? null) !== (capacitacion_id ?? null)) {
    if (capacitacion_id) mapa[accion.id] = capacitacion_id
    else delete mapa[accion.id]
    const res = await escribirClave(CLAVE_ACC_PAC, mapa, autorId)
    if ("error" in res) throw new Error(res.error)
  }
}

/** Habilidad → capacitaciones del PAC que la tratan (vínculos confirmados a mano). */
export async function leerVinculosPac(rol: SkapRol): Promise<Record<string, string[]>> {
  return (await leerClave<Record<string, string[]>>(`skap:pac:${rol}`)) ?? {}
}

export async function escribirVinculosPac(
  rol: SkapRol,
  vinculos: Record<string, string[]>,
  autorId: string | null,
): Promise<void> {
  const res = await escribirClave(`skap:pac:${rol}`, vinculos, autorId)
  if ("error" in res) throw new Error(res.error)
}
