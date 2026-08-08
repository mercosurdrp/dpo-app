"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { fetchPlanesPorRespuesta } from "@/lib/vehiculos/planes-checklist"
import type { PlanResumen } from "@/lib/vehiculos/tiempo-resolucion"

/** Un ítem del checklist con su respuesta. */
export interface ChecklistItemDetalle {
  categoria: string
  nombre: string
  critico: boolean
  valor: string
  comentario: string | null
  /** true si la respuesta no es un fallo (nook/malo). */
  ok: boolean
  /** Plan de acción del foco: si se resolvió, con qué y en cuánto tiempo. */
  plan: PlanResumen | null
}

/** Una unidad con su checklist de liberación del día. */
export interface ChecklistUnidadDetalle {
  id: string
  dominio: string
  chofer: string
  hora: string
  resultado: "aprobado" | "rechazado"
  observaciones: string | null
  /** Ítems que no aprobaron (valor nook/malo). */
  items_fallados: ChecklistItemDetalle[]
  total_items: number
}

export interface ChecklistResumenDia {
  fecha: string
  /** Unidades únicas que hicieron checklist de liberación. */
  camiones: number
  total_checklists: number
  aprobados: number
  rechazados: number
  checklists: ChecklistUnidadDetalle[]
  /** Dominios con egreso registrado en TML pero sin checklist de liberación. */
  sin_checklist: string[]
}

const VALORES_FALLO = new Set(["nook", "malo"])

/**
 * Resumen del día para el indicador "Checklist" del tablero de reuniones:
 * detalle por unidad de los checklists de liberación + las unidades que
 * salieron (egreso en registros_vehiculos) sin haber hecho el checklist.
 */
export async function getChecklistResumenDia(
  fecha: string,
  grupo: "camiones" | "autoelevadores" = "camiones",
): Promise<{ data: ChecklistResumenDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()

    // 1. Checklists de liberación del día
    const { data: chkRaw, error: e1 } = await supa
      .from("checklist_vehiculos")
      .select("id, dominio, chofer, hora, resultado, observaciones")
      .eq("fecha", fecha)
      .eq("tipo", "liberacion")
      .order("hora", { ascending: true })
    if (e1) return { error: e1.message }
    // El autoelevador también se graba como 'liberacion', así que el grupo se
    // resuelve por el tipo de la unidad en el catálogo, no por el del check.
    const { data: catRaw } = await supa
      .from("catalogo_vehiculos")
      .select("dominio, tipo")
    const tipoPorDominio = new Map<string, string>()
    for (const v of (catRaw ?? []) as Array<{
      dominio: string | null
      tipo: string | null
    }>) {
      const d = (v.dominio ?? "").trim().toUpperCase()
      if (d && v.tipo) tipoPorDominio.set(d, v.tipo)
    }
    const perteneceAlGrupo = (dominio: string | null) => {
      const esAe =
        tipoPorDominio.get((dominio ?? "").trim().toUpperCase()) ===
        "autoelevador"
      return grupo === "autoelevadores" ? esAe : !esAe
    }
    const checklists = ((chkRaw ?? []) as Array<{
      id: string
      dominio: string
      chofer: string
      hora: string
      resultado: "aprobado" | "rechazado"
      observaciones: string | null
    }>).filter((c) => perteneceAlGrupo(c.dominio))

    // 2. Respuestas + ítems de esos checklists
    const respPorChk: Record<string, ChecklistItemDetalle[]> = {}
    const totalItemsPorChk: Record<string, number> = {}
    if (checklists.length > 0) {
      const ids = checklists.map((c) => c.id)
      const { data: respRaw, error: e2 } = await supa
        .from("checklist_respuestas")
        .select(
          "id, checklist_id, valor, comentario, item:checklist_items(categoria, nombre, critico, orden)",
        )
        .in("checklist_id", ids)
      if (e2) return { error: e2.message }
      const fallos: Array<{
        respuestaId: string
        checklistId: string
        detalle: ChecklistItemDetalle
      }> = []
      for (const r of (respRaw ?? []) as unknown as Array<{
        id: string
        checklist_id: string
        valor: string
        comentario: string | null
        item: {
          categoria: string
          nombre: string
          critico: boolean
          orden: number
        } | null
      }>) {
        totalItemsPorChk[r.checklist_id] =
          (totalItemsPorChk[r.checklist_id] ?? 0) + 1
        if (!r.item) continue
        const esFallo = VALORES_FALLO.has((r.valor ?? "").toLowerCase())
        if (!esFallo) continue
        const detalle: ChecklistItemDetalle = {
          categoria: r.item.categoria,
          nombre: r.item.nombre,
          critico: r.item.critico,
          valor: r.valor,
          comentario: r.comentario,
          ok: false,
          plan: null,
        }
        fallos.push({
          respuestaId: r.id,
          checklistId: r.checklist_id,
          detalle,
        })
        if (!respPorChk[r.checklist_id]) respPorChk[r.checklist_id] = []
        respPorChk[r.checklist_id].push(detalle)
      }

      // Estado del foco en la reunión: si mantenimiento ya cerró el plan, el
      // ítem se muestra resuelto con su tiempo de respuesta.
      if (fallos.length > 0) {
        const horaPorChecklist = new Map(checklists.map((c) => [c.id, c.hora]))
        const horaPorRespuesta = new Map(
          fallos.map((f) => [
            f.respuestaId,
            horaPorChecklist.get(f.checklistId) ?? "",
          ]),
        )
        const planes = await fetchPlanesPorRespuesta(
          supa,
          fallos.map((f) => f.respuestaId),
          horaPorRespuesta,
        )
        for (const f of fallos) {
          f.detalle.plan = planes.get(f.respuestaId) ?? null
        }
      }
    }

    // 3. Egresos del día (registros_vehiculos = fuente del TML)
    const { data: egrRaw } = await supa
      .from("registros_vehiculos")
      .select("dominio")
      .eq("fecha", fecha)
      .eq("tipo", "egreso")

    const norm = (d: string | null) => (d ?? "").trim().toUpperCase()
    const dominiosConChecklist = new Set(checklists.map((c) => norm(c.dominio)))
    const dominiosEgreso = new Set(
      (egrRaw ?? []).map((e: { dominio: string | null }) => norm(e.dominio)),
    )
    dominiosEgreso.delete("")
    // "Salió sin checklist" se mide contra los egresos de calle: un
    // autoelevador no registra egreso, así que en su grupo la lista no aplica.
    const sinChecklist =
      grupo === "autoelevadores"
        ? []
        : [...dominiosEgreso]
            .filter((d) => !dominiosConChecklist.has(d))
            .sort()

    let aprobados = 0
    let rechazados = 0
    const detalle: ChecklistUnidadDetalle[] = checklists.map((c) => {
      if (c.resultado === "aprobado") aprobados++
      else rechazados++
      return {
        id: c.id,
        dominio: c.dominio,
        chofer: c.chofer,
        hora: c.hora,
        resultado: c.resultado,
        observaciones: c.observaciones,
        items_fallados: respPorChk[c.id] ?? [],
        total_items: totalItemsPorChk[c.id] ?? 0,
      }
    })

    return {
      data: {
        fecha,
        camiones: dominiosConChecklist.size,
        total_checklists: checklists.length,
        aprobados,
        rechazados,
        checklists: detalle,
        sin_checklist: sinChecklist,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando el detalle de checklists",
    }
  }
}
