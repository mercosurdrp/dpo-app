"use server"

// Calidad de la DETECCIÓN del checklist de flota (DPO 1.3).
//
// La pirámide de defectos y el análisis por ítem miden lo que el checklist
// encontró. Esta lectura mide lo otro: si el checklist está encontrando algo.
//
// El número que la justifica: en 2026 se cargaron 1.762 checklists y sólo 41
// —el 2,33 %— marcaron algún hallazgo. Abierto por chofer, cuatro de ellos
// llevan entre 147 y 207 revisiones sin haber encontrado NUNCA nada, mientras
// otro marca en el 65 % de las suyas. Doscientas revisiones seguidas sin un
// solo defecto no describen una flota impecable: describen un formulario que se
// completa en piloto automático. Con la base subreportada, la pirámide mide más
// quién reporta que qué se rompe, y la tasa de detección por ítem se lee en
// auditoría como un control que no se hace.
//
// De paso sale el DENOMINADOR que le faltaba a la torta: cuántos checklists
// tuvo cada unidad. Sin eso, la unidad que más se controla parece la peor.

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/** Valores de respuesta que NO son hallazgo. */
const VALORES_OK = ["ok", "bueno"]

export interface DeteccionChofer {
  chofer: string
  /** Checklists que cargó en el período. */
  checklists: number
  /** De ésos, cuántos marcaron al menos un ítem no conforme. */
  conHallazgo: number
  /** Ítems no conformes marcados (un checklist puede aportar varios). */
  hallazgos: number
  /** conHallazgo ÷ checklists, en %. */
  pctDeteccion: number | null
}

export interface ExposicionUnidad {
  dominio: string
  /** Checklists que se le hicieron en el período: el denominador. */
  checklists: number
  hallazgos: number
  /** Hallazgos cada 10 checklists. */
  cada10: number | null
}

export interface CalidadDeteccion {
  porChofer: DeteccionChofer[]
  porUnidad: ExposicionUnidad[]
  totales: {
    checklists: number
    conHallazgo: number
    hallazgos: number
    pctDeteccion: number | null
    /** Choferes con checklists en el período y CERO hallazgos. */
    choferesSinDetectar: number
  }
}

/** PostgREST corta en 1.000: hay que paginar sí o sí. */
async function traerTodo<T>(
  paso: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PASO = 1000
  const out: T[] = []
  for (let i = 0; ; i += PASO) {
    const { data, error } = await paso(i, i + PASO - 1)
    if (error) throw new Error(error.message)
    const filas = data ?? []
    out.push(...filas)
    if (filas.length < PASO) break
  }
  return out
}

export async function getCalidadDeteccion(periodo?: {
  desde?: string | null
  hasta?: string | null
}): Promise<{ data: CalidadDeteccion } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const desde = periodo?.desde ?? null
    const hasta = periodo?.hasta ?? null

    const checklists = await traerTodo<{
      id: string
      dominio: string
      fecha: string
      chofer: string | null
    }>((a, b) => {
      let q = supabase
        .from("checklist_vehiculos")
        .select("id, dominio, fecha, chofer")
      if (desde) q = q.gte("fecha", desde)
      if (hasta) q = q.lte("fecha", hasta)
      return q.range(a, b)
    })

    const respuestas = await traerTodo<{
      id: string
      cv: { id: string } | null
    }>((a, b) => {
      let q = supabase
        .from("checklist_respuestas")
        .select("id, cv:checklist_vehiculos!inner(id, fecha)")
        .not("valor", "in", `(${VALORES_OK.map((v) => `"${v}"`).join(",")})`)
      if (desde) q = q.gte("cv.fecha", desde)
      if (hasta) q = q.lte("cv.fecha", hasta)
      return q.range(a, b) as unknown as PromiseLike<{
        data: { id: string; cv: { id: string } | null }[] | null
        error: { message: string } | null
      }>
    })

    // Hallazgos por checklist: la unidad de "detectó algo" es el checklist, no
    // el ítem — un mismo check con tres ítems marcados detectó una vez.
    const hallazgosPorCheck = new Map<string, number>()
    for (const r of respuestas) {
      const id = r.cv?.id
      if (!id) continue
      hallazgosPorCheck.set(id, (hallazgosPorCheck.get(id) ?? 0) + 1)
    }

    const choferes = new Map<string, DeteccionChofer>()
    const unidades = new Map<string, ExposicionUnidad>()
    for (const c of checklists) {
      const h = hallazgosPorCheck.get(c.id) ?? 0

      const nombre = c.chofer?.trim() || "(sin chofer)"
      const ch = choferes.get(nombre) ?? {
        chofer: nombre,
        checklists: 0,
        conHallazgo: 0,
        hallazgos: 0,
        pctDeteccion: null,
      }
      ch.checklists++
      ch.hallazgos += h
      if (h > 0) ch.conHallazgo++
      choferes.set(nombre, ch)

      const u = unidades.get(c.dominio) ?? {
        dominio: c.dominio,
        checklists: 0,
        hallazgos: 0,
        cada10: null,
      }
      u.checklists++
      u.hallazgos += h
      unidades.set(c.dominio, u)
    }

    const porChofer = Array.from(choferes.values())
      .map((c) => ({
        ...c,
        pctDeteccion:
          c.checklists > 0 ? (c.conHallazgo / c.checklists) * 100 : null,
      }))
      // Primero el que más revisiones hizo: si ése no detecta nada, es el que
      // más peso tiene en el agujero.
      .sort((a, b) => b.checklists - a.checklists || a.chofer.localeCompare(b.chofer))

    const porUnidad = Array.from(unidades.values())
      .map((u) => ({
        ...u,
        cada10: u.checklists > 0 ? (u.hallazgos / u.checklists) * 10 : null,
      }))
      .sort((a, b) => (b.cada10 ?? 0) - (a.cada10 ?? 0) || b.hallazgos - a.hallazgos)

    const conHallazgo = checklists.filter(
      (c) => (hallazgosPorCheck.get(c.id) ?? 0) > 0
    ).length

    return {
      data: {
        porChofer,
        porUnidad,
        totales: {
          checklists: checklists.length,
          conHallazgo,
          hallazgos: respuestas.length,
          pctDeteccion:
            checklists.length > 0 ? (conHallazgo / checklists.length) * 100 : null,
          choferesSinDetectar: porChofer.filter(
            (c) => c.conHallazgo === 0 && c.checklists > 0
          ).length,
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
