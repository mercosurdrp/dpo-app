"use server"

// Matriz SKAP ↔ PAC (Misiones). El PAC es lo calendarizado en la tabla
// `capacitaciones` y la asistencia/examen en `asistencias`: de ahí sale si una
// acción de formación quedó cumplida. Nada se carga dos veces.

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProfile, requireAuth } from "@/lib/session"
import { CLAVE_ESTADO_MANUAL, parseEstadosManuales } from "@/lib/capacitacion-estado"
import { addAsistentes, createCapacitacion } from "@/actions/capacitaciones"
import { getMatrizRol, puedeEditarRol } from "@/actions/skap-habilidades"
import {
  escribirVinculosPac,
  guardarAccion,
  leerAcciones,
  leerHabilidades,
  leerVinculosPac,
  type SkapAccionGuardada,
} from "@/lib/skap/store"
import {
  PILAR_DE_ROL,
  estadoPacPersona,
  sugerirCapacitaciones,
  type CapacitacionPac,
  type EstadoPacPersona,
} from "@/lib/skap/pac"
import type { SkapRol } from "@/types/database"

type Result<T> = { data: T } | { error: string }

const RUTA = "/gente/matriz-skap"

/** Inscribir gente o dar de alta capacitaciones es del PAC: mismos roles que /capacitaciones. */
async function puedeGestionarPac(): Promise<boolean> {
  const p = await getProfile()
  return !!p && ["admin", "auditor"].includes(p.role)
}

async function leerCapacitaciones(): Promise<CapacitacionPac[]> {
  const db = createAdminClient()
  const [{ data, error }, { data: manual }] = await Promise.all([
    db.from("capacitaciones").select("id, titulo, fecha, pilar, estado").order("fecha").limit(2000),
    db.from("app_config").select("valor").eq("clave", CLAVE_ESTADO_MANUAL).maybeSingle(),
  ])
  if (error) throw new Error(error.message)
  const manuales = parseEstadosManuales((manual as { valor: string } | null)?.valor)
  return ((data || []) as CapacitacionPac[]).map((c) => ({ ...c, estado: manuales[c.id] ?? c.estado }))
}

type Asist = { capacitacion_id: string; empleado_id: string; presente: boolean; resultado: string }

async function leerAsistencias(capIds: string[], empIds: string[]): Promise<Map<string, Asist>> {
  const out = new Map<string, Asist>()
  if (!capIds.length || !empIds.length) return out
  const { data, error } = await createAdminClient()
    .from("asistencias")
    .select("capacitacion_id, empleado_id, presente, resultado")
    .in("capacitacion_id", capIds)
    .in("empleado_id", empIds)
    .limit(10000)
  if (error) throw new Error(error.message)
  for (const a of (data || []) as Asist[]) out.set(`${a.capacitacion_id}|${a.empleado_id}`, a)
  return out
}

const hoy = () => new Date().toISOString().slice(0, 10)

export interface PacPersonaGap {
  empleado_id: string
  nombre: string
  legajo: number
  nivel: number
  estandar: number
  /** Su situación en las capacitaciones vinculadas (la mejor de todas). */
  pac: EstadoPacPersona
}

export interface PacCapacitacionVinculada extends CapacitacionPac {
  inscriptos: number
  cumplidos: number
}

export interface PacHabilidadPlan {
  habilidad_id: string
  habilidad: string
  criticidad: string
  bloque: string
  personas: PacPersonaGap[]
  vinculadas: PacCapacitacionVinculada[]
  sugeridas: CapacitacionPac[]
  /** Lo que el plan de formación de la matriz dice para dictarla (si no hay nada en el PAC). */
  plan: { instructor: string | null; material: string | null; horas: number | null; metodo: string | null } | null
}

export interface PacPlanRol {
  habilidades: PacHabilidadPlan[]
  capacitaciones: CapacitacionPac[]
  puedeGestionarPac: boolean
}

const ORDEN_PAC: Record<EstadoPacPersona, number> = { cumplida: 2, inscripta: 1, no_inscripta: 0 }

/**
 * Plan de acción sugerido del rol: por cada habilidad con gaps, quiénes lo
 * tienen, qué capacitación del PAC lo cubre (vinculada o sugerida) y cómo
 * viene cada persona en ella.
 */
export async function getPlanPac(rol: SkapRol): Promise<Result<PacPlanRol>> {
  try {
    await requireAuth()
    const [matriz, caps, vinculos, puede] = await Promise.all([
      getMatrizRol(rol),
      leerCapacitaciones(),
      leerVinculosPac(rol),
      puedeGestionarPac(),
    ])
    if ("error" in matriz) return { error: matriz.error }

    const capPorId = new Map(caps.map((c) => [c.id, c]))
    const conGap = matriz.data.personas.flatMap((p) =>
      p.celdas
        .filter((c) => c.estado === "critico" || c.estado === "brecha")
        .map((c) => ({ p, c })),
    )
    const idsVinc = [...new Set(Object.values(vinculos).flat())]
    const asist = await leerAsistencias(idsVinc, [...new Set(conGap.map((x) => x.p.empleado_id))])

    const habilidades: PacHabilidadPlan[] = matriz.data.habilidades
      .map((h): PacHabilidadPlan | null => {
        const gaps = conGap.filter((x) => x.c.habilidad_id === h.id)
        if (!gaps.length) return null
        const vinc = (vinculos[h.id] ?? []).map((id) => capPorId.get(id)).filter((c): c is CapacitacionPac => !!c)

        const personas = gaps.map(({ p, c }) => {
          let pac: EstadoPacPersona = "no_inscripta"
          for (const cap of vinc) {
            const e = estadoPacPersona(asist.get(`${cap.id}|${p.empleado_id}`), cap.estado)
            if (ORDEN_PAC[e] > ORDEN_PAC[pac]) pac = e
          }
          return { empleado_id: p.empleado_id, nombre: p.nombre, legajo: p.legajo, nivel: c.nivel!, estandar: c.estandar, pac }
        })
        const idsGap = new Set(personas.map((p) => p.empleado_id))

        return {
          habilidad_id: h.id,
          habilidad: h.habilidad,
          criticidad: h.criticidad,
          bloque: h.bloque,
          personas: personas.sort((a, b) => a.nivel - a.estandar - (b.nivel - b.estandar) || a.nombre.localeCompare(b.nombre)),
          vinculadas: vinc.map((cap) => {
            const est = [...idsGap].map((e) => estadoPacPersona(asist.get(`${cap.id}|${e}`), cap.estado))
            return { ...cap, inscriptos: est.filter((e) => e !== "no_inscripta").length, cumplidos: est.filter((e) => e === "cumplida").length }
          }),
          sugeridas: sugerirCapacitaciones(h.habilidad, caps, hoy()).filter((c) => !vinc.some((v) => v.id === c.id)),
          plan: h.plan
            ? {
                instructor: h.plan.instructor ?? h.plan.experto ?? null,
                material: h.plan.material ?? null,
                horas: (h.plan.hs_teoricas ?? 0) + (h.plan.hs_practicas ?? 0) || null,
                metodo: h.plan.metodo ?? null,
              }
            : null,
        }
      })
      .filter((x): x is PacHabilidadPlan => !!x)
      .sort(
        (a, b) =>
          Number(b.criticidad === "A") - Number(a.criticidad === "A") || b.personas.length - a.personas.length,
      )

    return {
      data: {
        habilidades,
        capacitaciones: caps.filter((c) => c.estado !== "cancelada"),
        puedeGestionarPac: puede,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al armar el plan con el PAC" }
  }
}

export async function vincularCapacitacion(
  rol: SkapRol,
  habilidadId: string,
  capacitacionId: string,
  vincular: boolean,
): Promise<Result<{ ok: true }>> {
  try {
    if (!(await puedeEditarRol(rol))) return { error: "No tenés permiso para editar esta matriz" }
    const profile = await requireAuth()
    const vinculos = await leerVinculosPac(rol)
    const actuales = new Set(vinculos[habilidadId] ?? [])
    if (vincular) actuales.add(capacitacionId)
    else actuales.delete(capacitacionId)
    vinculos[habilidadId] = [...actuales]
    await escribirVinculosPac(rol, vinculos, profile.id)
    await sincronizarConPac(rol)
    revalidatePath(RUTA)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al vincular" }
  }
}

/**
 * Deja una acción abierta por cada persona con gap en la habilidad, apuntando
 * a la capacitación del PAC. Reusa la acción abierta si ya existía.
 */
async function accionesParaCapacitacion(
  rol: SkapRol,
  habilidadId: string,
  cap: CapacitacionPac,
  personas: { empleado_id: string; nivel: number }[],
  autorId: string,
): Promise<number> {
  const abiertas = (await leerAcciones(rol)).filter((a) => a.estado !== "cerrada" && a.habilidad_id === habilidadId)
  let n = 0
  for (const p of personas) {
    const previa = abiertas.find((a) => a.empleado_id === p.empleado_id)
    const accion: SkapAccionGuardada = previa
      ? { ...previa, capacitacion_id: cap.id, fecha_programada: previa.fecha_programada ?? cap.fecha }
      : {
          id: randomUUID(),
          rol,
          empleado_id: p.empleado_id,
          habilidad_id: habilidadId,
          estado: "programada",
          fecha_programada: cap.fecha,
          fecha_realizada: null,
          responsable: null,
          nivel_origen: p.nivel,
          observaciones: `PAC: ${cap.titulo}`,
          created_by: autorId,
          created_at: new Date().toISOString(),
          capacitacion_id: cap.id,
        }
    if (accion.estado === "pendiente") accion.estado = "programada"
    await guardarAccion(accion, autorId)
    n++
  }
  return n
}

/**
 * Inscribe en la capacitación del PAC a todas las personas con gap en esa
 * habilidad y les deja la acción de formación programada para esa fecha.
 */
export async function inscribirGapsEnCapacitacion(
  rol: SkapRol,
  habilidadId: string,
  capacitacionId: string,
): Promise<Result<{ inscriptos: number }>> {
  try {
    if (!(await puedeGestionarPac())) return { error: "Inscribir en el PAC lo hace un admin o auditor de Capacitaciones" }
    const profile = await requireAuth()
    const plan = await getPlanPac(rol)
    if ("error" in plan) return plan
    const h = plan.data.habilidades.find((x) => x.habilidad_id === habilidadId)
    const cap = plan.data.capacitaciones.find((c) => c.id === capacitacionId)
    if (!h || !cap) return { error: "No se encontró la habilidad o la capacitación" }

    const faltan = h.personas.filter((p) => p.pac !== "cumplida")
    if (faltan.length) {
      const res = await addAsistentes(capacitacionId, faltan.map((p) => p.empleado_id))
      if ("error" in res) return { error: res.error }
    }
    await accionesParaCapacitacion(rol, habilidadId, cap, faltan, profile.id)
    if (!h.vinculadas.some((v) => v.id === capacitacionId)) {
      const vinculos = await leerVinculosPac(rol)
      vinculos[habilidadId] = [...new Set([...(vinculos[habilidadId] ?? []), capacitacionId])]
      await escribirVinculosPac(rol, vinculos, profile.id)
    }
    revalidatePath(RUTA)
    revalidatePath(`/capacitaciones/${capacitacionId}`)
    return { data: { inscriptos: faltan.length } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al inscribir" }
  }
}

/**
 * Cuando el PAC no tiene nada que cubra la habilidad: da de alta la
 * capacitación con lo que dice el plan de formación de la matriz, la vincula e
 * inscribe a los que tienen el gap.
 */
export async function crearCapacitacionDesdeGap(input: {
  rol: SkapRol
  habilidadId: string
  titulo: string
  fecha: string
  instructor: string
  duracionHoras: number
}): Promise<Result<{ capacitacionId: string }>> {
  try {
    if (!(await puedeGestionarPac())) return { error: "Crear capacitaciones del PAC lo hace un admin o auditor" }
    const habs = await leerHabilidades(input.rol)
    const h = habs.find((x) => x.id === input.habilidadId)
    if (!h) return { error: "No se encontró la habilidad" }

    const res = await createCapacitacion({
      titulo: input.titulo.trim(),
      instructor: input.instructor.trim() || "A definir",
      fecha: input.fecha,
      duracion_horas: input.duracionHoras > 0 ? input.duracionHoras : 1,
      pilar: PILAR_DE_ROL[input.rol],
      descripcion: `Sale de la Matriz SKAP (${input.rol}): ${h.habilidad}.${h.plan?.alcance ? ` ${h.plan.alcance}` : ""}`,
      material_url: h.plan?.material && /^https?:\/\//.test(h.plan.material) ? h.plan.material : undefined,
    })
    if ("error" in res) return { error: res.error }

    const ins = await inscribirGapsEnCapacitacion(input.rol, input.habilidadId, res.data.id)
    if ("error" in ins) return { error: `Se creó la capacitación pero no se pudo inscribir: ${ins.error}` }
    revalidatePath("/capacitaciones")
    return { data: { capacitacionId: res.data.id } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al crear la capacitación" }
  }
}

/**
 * Pone al día las acciones de formación contra el PAC:
 *  - aprobó (o estuvo presente en una ya completada) → «realizada» = cumplida,
 *    con la fecha de la capacitación;
 *  - inscripta y la acción seguía pendiente → «programada» para esa fecha.
 * Mira la capacitación de la acción y, si no tiene, todas las vinculadas a su
 * habilidad. Las cerradas (ya reevaluadas) no se tocan. Devuelve cuántas cambió.
 */
export async function sincronizarConPac(rol: SkapRol): Promise<number> {
  await requireAuth()
  const [acciones, vinculos, caps] = await Promise.all([leerAcciones(rol), leerVinculosPac(rol), leerCapacitaciones()])
  const abiertas = acciones.filter((a) => a.estado !== "cerrada")
  if (!abiertas.length) return 0
  const capPorId = new Map(caps.map((c) => [c.id, c]))
  const candidatas = (a: SkapAccionGuardada) =>
    [...new Set([a.capacitacion_id, ...(vinculos[a.habilidad_id] ?? [])])]
      .filter((id): id is string => !!id)
      .map((id) => capPorId.get(id))
      .filter((c): c is CapacitacionPac => !!c)

  const capIds = [...new Set(abiertas.flatMap((a) => candidatas(a).map((c) => c.id)))]
  const asist = await leerAsistencias(capIds, [...new Set(abiertas.map((a) => a.empleado_id))])

  let cambios = 0
  for (const a of abiertas) {
    const estados = candidatas(a).map((c) => ({ c, e: estadoPacPersona(asist.get(`${c.id}|${a.empleado_id}`), c.estado) }))
    const cumplida = estados.find((x) => x.e === "cumplida")
    const inscripta = estados.find((x) => x.e === "inscripta")
    let nueva: SkapAccionGuardada | null = null
    if (cumplida && a.estado !== "realizada") {
      nueva = { ...a, estado: "realizada", fecha_realizada: cumplida.c.fecha, capacitacion_id: cumplida.c.id }
    } else if (!cumplida && inscripta && a.estado === "pendiente") {
      nueva = { ...a, estado: "programada", fecha_programada: inscripta.c.fecha, capacitacion_id: inscripta.c.id }
    }
    if (nueva) {
      await guardarAccion(nueva, null)
      cambios++
    }
  }
  return cambios
}
