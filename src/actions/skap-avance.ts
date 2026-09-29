"use server"

// Avance por persona: su plan de acción SKAP (acciones de formación) + sus
// PDP de Desempeño (los importa rrhh-app a app_config `des:pdp:<año>`).

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { getMatrizRol } from "@/actions/skap-habilidades"
import { leerAcciones } from "@/lib/skap/store"
import {
  avanceObjetivo,
  calcularAvance,
  clavePdp,
  normalizarDni,
  type AvancePersona,
  type ObjetivoPdp,
} from "@/lib/skap/avance"
import type { SkapRol } from "@/types/database"

type Result<T> = { data: T } | { error: string }

export interface AvanceRol {
  personas: AvancePersona[]
  anioPdp: number
  /** false si RRHH todavía no importó PDP de ese año. */
  hayPdp: boolean
}

async function leerPdp(anio: number): Promise<ObjetivoPdp[] | null> {
  const { data, error } = await createAdminClient()
    .from("app_config")
    .select("valor")
    .eq("clave", clavePdp(anio))
    .maybeSingle()
  if (error) throw new Error(error.message)
  const valor = (data as { valor: string } | null)?.valor
  if (!valor) return null
  try {
    return (JSON.parse(valor) as { objetivos?: ObjetivoPdp[] }).objetivos ?? []
  } catch {
    return null
  }
}

export async function getAvancePersonas(rol: SkapRol): Promise<Result<AvanceRol>> {
  try {
    await requireAuth()
    const anio = new Date().getFullYear()
    const [matriz, acciones, pdp] = await Promise.all([getMatrizRol(rol), leerAcciones(rol), leerPdp(anio)])
    if ("error" in matriz) return { error: matriz.error }

    const ids = matriz.data.personas.map((p) => p.empleado_id)
    const { data: emps, error } = ids.length
      ? await createAdminClient().from("empleados").select("id, numero_id").in("id", ids)
      : { data: [], error: null }
    if (error) return { error: error.message }
    const dniPorId = new Map(((emps || []) as { id: string; numero_id: string | null }[]).map((e) => [e.id, normalizarDni(e.numero_id)]))

    const pdpPorDni = new Map<string, ObjetivoPdp[]>()
    for (const o of pdp ?? []) {
      const d = normalizarDni(o.dni)
      if (d) pdpPorDni.set(d, [...(pdpPorDni.get(d) ?? []), o])
    }

    const habPorId = new Map(matriz.data.habilidades.map((h) => [h.id, h]))
    const hoy = new Date().toISOString().slice(0, 10)

    const personas = matriz.data.personas.map((p) => {
      const dni = dniPorId.get(p.empleado_id)
      return calcularAvance({
        empleado_id: p.empleado_id,
        nombre: p.nombre,
        legajo: p.legajo,
        acciones: acciones
          .filter((a) => a.empleado_id === p.empleado_id && habPorId.has(a.habilidad_id))
          .map((a) => {
            const h = habPorId.get(a.habilidad_id)!
            return {
              id: a.id,
              habilidad: h.habilidad,
              criticidad: h.criticidad,
              estado: a.estado,
              fecha_programada: a.fecha_programada,
              fecha_realizada: a.fecha_realizada,
              vencida:
                (a.estado === "pendiente" || a.estado === "programada") &&
                !!a.fecha_programada &&
                a.fecha_programada < hoy,
            }
          }),
        pdp: (dni ? pdpPorDni.get(dni) ?? [] : []).map((o) => ({
          objetivo: o.objetivo,
          descripcion: o.descripcion,
          jefe: o.jefe?.nombre ?? "",
          meta: o.meta,
          obtenido: o.obtenido,
          avance: avanceObjetivo(o),
        })),
      })
    })

    personas.sort(
      (a, b) =>
        (a.avance_total ?? 101) - (b.avance_total ?? 101) || a.nombre.localeCompare(b.nombre),
    )
    return { data: { personas, anioPdp: anio, hayPdp: pdp !== null } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al calcular el avance" }
  }
}
