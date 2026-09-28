"use server"

// Tablero de Talento de la Matriz SKAP de Misiones: quién puede ser padrino,
// quién es posible sucesor del puesto siguiente y quién tiene más debilidades.
// Lee los mismos datos que la matriz (app_config, ver lib/skap/store.ts).

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { calcularCelda } from "@/lib/skap/gap"
import { ROLES_SKAP } from "@/lib/skap/roles"
import { leerAsignados, leerEvaluacionesRol, leerHabilidades } from "@/lib/skap/store"
import {
  EQUIVALENCIAS,
  PADRINO,
  SUCESION,
  normalizarHabilidad,
  type TalentoData,
  type TalentoGap,
  type TalentoHabilidadDebil,
  type TalentoPersona,
  type TalentoSucesor,
} from "@/lib/skap/talento"
import type { SkapCelda, SkapHabilidad, SkapRol } from "@/types/database"

type Result<T> = { data: T } | { error: string }

interface Fila {
  empleado_id: string
  legajo: number
  nombre: string
  rol: SkapRol
  celdas: { h: SkapHabilidad; c: SkapCelda }[]
}

const evaluable = (c: SkapCelda) => c.estado !== "sin_evaluar" && c.estado !== "no_aplica"

export async function getTalento(): Promise<Result<TalentoData>> {
  try {
    await requireAuth()

    const porRol = await Promise.all(
      ROLES_SKAP.map(async ({ rol }) => {
        const [habs, asig, evals] = await Promise.all([
          leerHabilidades(rol),
          leerAsignados(rol),
          leerEvaluacionesRol(rol),
        ])
        return { rol, habs, asig, evals }
      }),
    )

    const ids = [...new Set(porRol.flatMap((r) => r.asig))]
    const { data: emps, error } = ids.length
      ? await createAdminClient().from("empleados").select("id, legajo, nombre, activo").in("id", ids)
      : { data: [], error: null }
    if (error) return { error: error.message }
    const empPorId = new Map(
      ((emps || []) as { id: string; legajo: number; nombre: string; activo: boolean }[])
        .filter((e) => e.activo)
        .map((e) => [e.id, e]),
    )

    // Una fila por persona × rol, con la última nota de cada habilidad.
    const filas: Fila[] = porRol.flatMap(({ rol, habs, asig, evals }) =>
      asig
        .filter((id) => empPorId.has(id))
        .map((id) => {
          const ultima = new Map<string, { nivel: number | null; estandar_individual: number | null; fecha_evaluacion: string }>()
          for (const e of evals.get(id) ?? []) {
            const prev = ultima.get(e.habilidad_id)
            if (!prev || e.fecha_evaluacion > prev.fecha_evaluacion) ultima.set(e.habilidad_id, e)
          }
          const emp = empPorId.get(id)!
          return {
            empleado_id: id,
            legajo: emp.legajo,
            nombre: emp.nombre,
            rol,
            celdas: habs.map((h) => ({ h, c: calcularCelda(h, ultima.get(h.id)) })),
          }
        }),
    )

    // Índice general de cada fila (suma notas / suma estándares; estándar 0 no cuenta).
    const indiceDe = (f: Fila) => {
      const cs = f.celdas.filter(({ c }) => evaluable(c) && c.estandar > 0)
      const est = cs.reduce((s, { c }) => s + c.estandar, 0)
      return est > 0 ? cs.reduce((s, { c }) => s + (c.nivel ?? 0), 0) / est : null
    }
    const indiceFila = new Map(filas.map((f) => [f, indiceDe(f)]))

    // Quién domina cada habilidad (por nombre, cruzando roles): candidatos a padrino de ese tema.
    // Primero los que la superan (nivel 4 o arriba del estándar); si nadie la supera, sirve
    // quien la cumple con nivel ≥ 3, y entre ellos el de mejor puntaje general.
    const expertos = new Map<string, { nombre: string; rol: SkapRol; nivel: number; excedente: number; indice: number }[]>()
    for (const f of filas) {
      // Un temporal no apadrina a nadie.
      if (f.rol === "temporal") continue
      for (const { h, c } of f.celdas) {
        if (!evaluable(c) || c.nivel === null || c.estandar === 0) continue
        if (c.nivel < 3 || c.nivel < c.estandar) continue
        const k = normalizarHabilidad(h.habilidad)
        const lista = expertos.get(k) ?? []
        lista.push({ nombre: f.nombre, rol: f.rol, nivel: c.nivel, excedente: c.nivel - c.estandar, indice: indiceFila.get(f) ?? 0 })
        expertos.set(k, lista)
      }
    }
    for (const lista of expertos.values()) {
      lista.sort((a, b) => b.nivel - a.nivel || b.excedente - a.excedente || b.indice - a.indice)
    }

    const carga = new Map<string, number>()
    // Los más débiles eligen padrino primero.
    const filasPorNecesidad = [...filas].sort((a, b) => (indiceFila.get(a) ?? 1) - (indiceFila.get(b) ?? 1))
    const personasPorFila = new Map<Fila, TalentoPersona>()
    for (const f of filasPorNecesidad) personasPorFila.set(f, armarPersona(f))
    const personas: TalentoPersona[] = filas.map((f) => personasPorFila.get(f)!)

    function armarPersona(f: Fila): TalentoPersona {
      // Estándar 0 = no se le exige: no entra en el índice (inflaría a quien sabe algo extra).
      const conEstandar = f.celdas.filter(({ c }) => evaluable(c) && c.estandar > 0)
      const criticas = f.celdas.filter(({ h, c }) => h.criticidad === "A" && evaluable(c) && c.estandar > 0)

      const gaps: TalentoGap[] = f.celdas
        .filter(({ c }) => c.estado === "critico" || c.estado === "brecha")
        .map(({ h, c }) => {
          // Entre los del mejor nivel disponible, el que menos ahijados lleva: así no
          // termina una sola persona apadrinando a medio equipo.
          const cands = (expertos.get(normalizarHabilidad(h.habilidad)) ?? []).filter((x) => x.nombre !== f.nombre)
          const tope = cands[0]?.nivel
          const exp = cands
            .filter((x) => x.nivel === tope)
            .sort((a, b) => (carga.get(a.nombre) ?? 0) - (carga.get(b.nombre) ?? 0))[0]
          if (exp) carga.set(exp.nombre, (carga.get(exp.nombre) ?? 0) + 1)
          return {
            habilidad: h.habilidad,
            criticidad: h.criticidad,
            nivel: c.nivel!,
            estandar: c.estandar,
            padrino: exp ? { nombre: exp.nombre, rol: exp.rol, nivel: exp.nivel } : null,
          }
        })
        .sort((a, b) => a.nivel - a.estandar - (b.nivel - b.estandar) || a.criticidad.localeCompare(b.criticidad))

      return {
        empleado_id: f.empleado_id,
        legajo: f.legajo,
        nombre: f.nombre,
        rol: f.rol,
        indice: indiceFila.get(f) ?? null,
        pct_criticas: criticas.length ? (criticas.filter(({ c }) => c.estado === "cumple").length / criticas.length) * 100 : null,
        instruye: conEstandar.filter(({ c }) => c.nivel === 4).map(({ h }) => h.habilidad),
        gaps,
        gaps_criticos: gaps.filter((g) => g.criticidad === "A").length,
      }
    }

    const porPuntaje = (a: TalentoPersona, b: TalentoPersona) =>
      (b.indice ?? 0) - (a.indice ?? 0) ||
      (b.pct_criticas ?? 0) - (a.pct_criticas ?? 0) ||
      b.instruye.length - a.instruye.length
    const padrinos = ROLES_SKAP.filter(({ rol }) => rol !== "temporal").flatMap(({ rol }) =>
      personas
        .filter(
          (p) =>
            p.rol === rol &&
            (p.indice ?? 0) >= PADRINO.indiceMin &&
            (p.pct_criticas ?? 0) >= PADRINO.criticasMin,
        )
        .sort(porPuntaje)
        .slice(0, PADRINO.porRol),
    )

    const debiles = personas
      .filter((p) => p.gaps.length > 0)
      .sort(
        (a, b) =>
          (a.pct_criticas ?? 100) - (b.pct_criticas ?? 100) ||
          (a.indice ?? 1) - (b.indice ?? 1) ||
          b.gaps.length - a.gaps.length,
      )

    // Sucesión: se mide al candidato con las críticas del puesto destino.
    const habsPorRol = new Map(porRol.map((r) => [r.rol, r.habs]))
    const indicePorFila = new Map(personas.map((p) => [`${p.rol}|${p.empleado_id}`, p.indice]))
    const sucesores: TalentoSucesor[] = filas
      .filter((f) => SUCESION[f.rol])
      .map((f) => {
        const destino = SUCESION[f.rol]!
        const propias = new Map(f.celdas.map(({ h, c }) => [normalizarHabilidad(h.habilidad), c]))
        let cubiertas = 0
        let medibles = 0
        const faltan: string[] = []
        const aFormar: string[] = []
        for (const h of habsPorRol.get(destino) ?? []) {
          if (h.criticidad !== "A" || h.estandar === 0) continue
          const k = normalizarHabilidad(h.habilidad)
          const c = propias.get(k) ?? propias.get(EQUIVALENCIAS[k] ?? "")
          if (!c || !evaluable(c) || c.nivel === null) {
            aFormar.push(h.habilidad)
            continue
          }
          medibles++
          if (c.nivel >= h.estandar) cubiertas++
          else faltan.push(h.habilidad)
        }
        return {
          empleado_id: f.empleado_id,
          nombre: f.nombre,
          legajo: f.legajo,
          rol: f.rol,
          destino,
          preparacion: medibles ? (cubiertas / medibles) * 100 : null,
          cubiertas,
          medibles,
          faltan,
          a_formar: aFormar,
          indice_propio: indicePorFila.get(`${f.rol}|${f.empleado_id}`) ?? null,
        }
      })
      .sort((a, b) => (b.preparacion ?? -1) - (a.preparacion ?? -1) || (b.indice_propio ?? 0) - (a.indice_propio ?? 0))

    // Temas flojos del equipo: habilidades con más personas por debajo del estándar.
    const habilidadesDebiles: TalentoHabilidadDebil[] = porRol
      .flatMap(({ rol, habs }) =>
        habs.map((h) => {
          const celdas = filas.filter((f) => f.rol === rol).map((f) => f.celdas.find((x) => x.h.id === h.id)!.c)
          return {
            rol,
            habilidad: h.habilidad,
            criticidad: h.criticidad,
            con_gap: celdas.filter((c) => c.estado === "critico" || c.estado === "brecha").length,
            evaluadas: celdas.filter(evaluable).length,
          }
        }),
      )
      .filter((h) => h.con_gap > 0)
      .sort((a, b) => b.con_gap / b.evaluadas - a.con_gap / a.evaluadas || b.con_gap - a.con_gap)

    return { data: { personas, padrinos, sucesores, debiles, habilidadesDebiles } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al armar el tablero de talento" }
  }
}
