"use server"

// Avance por persona: su plan de acción SKAP (acciones de formación) + sus
// PDP de Desempeño (los importa rrhh-app a app_config `des:pdp:<año>`).

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProfile, requireAuth } from "@/lib/session"
import { getMatrizRol, puedeEditarRol } from "@/actions/skap-habilidades"
import { leerAcciones } from "@/lib/skap/store"
import { escribirClave, leerClave } from "@/lib/clima-store"
import {
  aAvancePdp,
  calcularAvance,
  claveObjetivoPdp,
  claveObtenidoManualPdp,
  clavePdp,
  normalizarDni,
  type AvancePersona,
  type ObjetivoPdp,
  type ObtenidoManualPdp,
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
    const [matriz, acciones, pdp, manuales] = await Promise.all([
      getMatrizRol(rol),
      leerAcciones(rol),
      leerPdp(anio),
      leerObtenidosManualPdp(anio),
    ])
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
        pdp: (dni ? pdpPorDni.get(dni) ?? [] : []).map((o) => aAvancePdp(o, manuales[claveObjetivoPdp(o)])),
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

/** Obtenido de PDP cargado a mano: claveObjetivoPdp → valor. */
async function leerObtenidosManualPdp(anio: number): Promise<Record<string, ObtenidoManualPdp>> {
  return (await leerClave<Record<string, ObtenidoManualPdp>>(claveObtenidoManualPdp(anio))) ?? {}
}

/**
 * Carga a mano el obtenido de un PDP (manda sobre el de la plataforma aunque se
 * reimporte). `obtenido: null` borra el valor manual y vuelve al de la plataforma.
 */
export async function guardarObtenidoPdp(input: {
  rol: SkapRol
  anio: number
  clave: string
  obtenido: number | null
}): Promise<Result<{ ok: true }>> {
  try {
    if (!(await puedeEditarRol(input.rol))) return { error: "No tenés permiso para cargar avances de PDP" }
    if (input.obtenido !== null && (!Number.isFinite(input.obtenido) || input.obtenido < 0)) {
      return { error: "El obtenido tiene que ser un número mayor o igual a 0" }
    }
    const pdp = await leerPdp(input.anio)
    if (!pdp?.some((o) => claveObjetivoPdp(o) === input.clave)) return { error: "No se encontró ese PDP" }

    const profile = await getProfile()
    const manuales = await leerObtenidosManualPdp(input.anio)
    if (input.obtenido === null) delete manuales[input.clave]
    else
      manuales[input.clave] = {
        obtenido: input.obtenido,
        fecha: new Date().toISOString().slice(0, 10),
        por: profile?.id ?? null,
      }
    const res = await escribirClave(claveObtenidoManualPdp(input.anio), manuales, profile?.id ?? null)
    if ("error" in res) return { error: res.error }
    revalidatePath("/gente/matriz-skap")
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al guardar el avance del PDP" }
  }
}
