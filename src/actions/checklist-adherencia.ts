"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Adherencia al checklist de flota (DPO Flota 1.3, requisito R1.3.1a).
 *
 * 🚨 El denominador son los días que la unidad EFECTIVAMENTE REPARTIÓ
 * (`vista_dias_ruteo`, que sale de las entregas reales), NO los días en que hay
 * algún checklist cargado. Medir contra los propios checklists es un denominador
 * auto-reportado: el camión que salió y no cargó nada desaparece del cálculo y
 * el número se infla solo. Con los datos del 07/07 al 06/08/2026 la diferencia
 * era 90,2 % (auto-reportado) contra 71,0 % (real), y esos 19 puntos eran 43
 * camión-día que rutearon sin ningún checklist.
 *
 * Por qué importa el número exacto: el R1.3.1a se activa porque el checklist NO
 * impide usar la unidad, y exige adherencia del 100 % más medidas de gestión
 * rápidas cuando baja. El 1.3 es mandatorio y si el 1a aplica y no se cumple, el
 * punto va a cero.
 *
 * Sólo camiones: los autoelevadores no rutean y el acoplado no se conduce.
 */

export interface DiaFaltante {
  fecha: string
  dominio: string
  /** Qué falta: el retorno, o el checklist entero. */
  falta: "retorno" | "liberacion" | "ambos"
}

export interface AdherenciaPunto {
  /** `YYYY-MM-DD` o `YYYY-MM` según el agrupamiento. */
  clave: string
  ruteados: number
  completos: number
  pct: number
}

export interface AdherenciaChecklist {
  desde: string
  hasta: string
  /** Camión-día con reparto real: el denominador. */
  ruteados: number
  /** Con liberación Y retorno. */
  completos: number
  /** Salió, hizo la liberación, pero nunca cerró el retorno. */
  soloLiberacion: number
  /** Repartió sin ningún checklist: el caso que el 1a quiere detectar. */
  sinNinguno: number
  pct: number | null
  serieDia: AdherenciaPunto[]
  serieMes: AdherenciaPunto[]
  faltantes: DiaFaltante[]
  /** Camión-día sin checklist agrupados por unidad, de mayor a menor. */
  porUnidad: { dominio: string; ruteados: number; completos: number; pct: number }[]
}

/**
 * PostgREST corta en 1000 filas por consulta: sin paginar, un rango largo se
 * truncaba en silencio y la adherencia salía calculada sobre datos incompletos.
 */
async function traerTodo<T>(
  hacerQuery: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] } | { error: string }> {
  const PASO = 1000
  const out: T[] = []
  for (let i = 0; ; i += PASO) {
    const { data, error } = await hacerQuery(i, i + PASO - 1)
    if (error) return { error: error.message }
    const filas = data ?? []
    out.push(...filas)
    if (filas.length < PASO) break
  }
  return { data: out }
}

export async function getAdherenciaChecklist(
  desde: string,
  hasta: string,
): Promise<{ data: AdherenciaChecklist } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [vehRes, ruteoRes, chkRes] = await Promise.all([
      supabase.from("catalogo_vehiculos").select("dominio, tipo"),
      traerTodo<{ dominio: string; fecha: string }>((a, b) =>
        supabase
          .from("vista_dias_ruteo")
          .select("dominio, fecha")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(a, b),
      ),
      traerTodo<{ dominio: string; fecha: string; tipo: string }>((a, b) =>
        supabase
          .from("checklist_vehiculos")
          .select("dominio, fecha, tipo")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(a, b),
      ),
    ])

    if (vehRes.error) return { error: vehRes.error.message }
    if ("error" in ruteoRes) return { error: ruteoRes.error }
    if ("error" in chkRes) return { error: chkRes.error }

    const esCamion = new Set(
      ((vehRes.data || []) as Array<{ dominio: string; tipo: string | null }>)
        .filter((v) => v.tipo === "camion")
        .map((v) => v.dominio.trim().toUpperCase()),
    )

    const clave = (fecha: string, dominio: string) => `${fecha}|${dominio}`
    const lib = new Set<string>()
    const ret = new Set<string>()
    for (const c of chkRes.data) {
      const dom = (c.dominio || "").trim().toUpperCase()
      if (!esCamion.has(dom)) continue
      if (c.tipo === "liberacion") lib.add(clave(c.fecha, dom))
      else if (c.tipo === "retorno") ret.add(clave(c.fecha, dom))
    }

    // Denominador: camión-día con reparto real, sin repetir.
    const ruteados = new Map<string, { fecha: string; dominio: string }>()
    for (const r of ruteoRes.data) {
      const dom = (r.dominio || "").trim().toUpperCase()
      if (!esCamion.has(dom)) continue
      ruteados.set(clave(r.fecha, dom), { fecha: r.fecha, dominio: dom })
    }

    let completos = 0
    let soloLiberacion = 0
    let sinNinguno = 0
    const faltantes: DiaFaltante[] = []
    const porUnidadMap = new Map<string, { ruteados: number; completos: number }>()

    for (const [k, { fecha, dominio }] of ruteados) {
      const tieneLib = lib.has(k)
      const tieneRet = ret.has(k)
      const acc = porUnidadMap.get(dominio) ?? { ruteados: 0, completos: 0 }
      acc.ruteados += 1

      if (tieneLib && tieneRet) {
        completos += 1
        acc.completos += 1
      } else if (tieneLib) {
        soloLiberacion += 1
        faltantes.push({ fecha, dominio, falta: "retorno" })
      } else if (tieneRet) {
        faltantes.push({ fecha, dominio, falta: "liberacion" })
      } else {
        sinNinguno += 1
        faltantes.push({ fecha, dominio, falta: "ambos" })
      }
      porUnidadMap.set(dominio, acc)
    }

    const agrupar = (corte: (f: string) => string): AdherenciaPunto[] => {
      const m = new Map<string, { ruteados: number; completos: number }>()
      for (const [k, { fecha }] of ruteados) {
        const c = corte(fecha)
        const acc = m.get(c) ?? { ruteados: 0, completos: 0 }
        acc.ruteados += 1
        if (lib.has(k) && ret.has(k)) acc.completos += 1
        m.set(c, acc)
      }
      return [...m.entries()]
        .map(([clave, v]) => ({
          clave,
          ruteados: v.ruteados,
          completos: v.completos,
          pct: Math.round((v.completos / v.ruteados) * 1000) / 10,
        }))
        .sort((a, b) => a.clave.localeCompare(b.clave))
    }

    const total = ruteados.size

    return {
      data: {
        desde,
        hasta,
        ruteados: total,
        completos,
        soloLiberacion,
        sinNinguno,
        pct: total ? Math.round((completos / total) * 1000) / 10 : null,
        serieDia: agrupar((f) => f),
        serieMes: agrupar((f) => f.slice(0, 7)),
        faltantes: faltantes.sort(
          (a, b) => b.fecha.localeCompare(a.fecha) || a.dominio.localeCompare(b.dominio),
        ),
        porUnidad: [...porUnidadMap.entries()]
          .map(([dominio, v]) => ({
            dominio,
            ruteados: v.ruteados,
            completos: v.completos,
            pct: Math.round((v.completos / v.ruteados) * 1000) / 10,
          }))
          .sort((a, b) => a.pct - b.pct || b.ruteados - a.ruteados),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
