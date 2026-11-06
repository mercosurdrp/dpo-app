"use server"

/**
 * Control de aceite del CIL — tablero y acción (DPO Flota 4.1, R4.1.4/R4.1.5).
 *
 * El control se CARGA desde `/mi-cil` y desde la carga del supervisor (ver
 * `lib/flota/cil-aceite.ts`). Acá se LEE para la solapa CIL: qué encontró el
 * operador en los últimos tres meses, qué unidades repiten, qué unidades no
 * tienen el control del mes, y el paso de hallazgo a OT correctiva, que es lo
 * que el auditor pide ver en el R4.1.5 («se toman acciones»).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { createMantenimiento } from "@/actions/mantenimiento-vehiculos"
import {
  DOMINIOS_CIL_EXCLUIDOS,
  TIPOS_CIL_OBLIGATORIOS,
} from "@/lib/flota/cil-tareas"
import { esHallazgoAceite, resumenAceite } from "@/lib/flota/cil-aceite"
import { dominiosReincidentes, type FilaCilAceite } from "@/lib/flota/kpi-aceite"

export interface HallazgoAceite {
  id: string
  fecha: string
  dominio: string
  operario: string
  resumen: string
  litros: number | null
  circuito: string | null
  perdida: boolean
  reincidente: boolean
  backfill: boolean
  ot: { id: string; numero: string | null; estado: string } | null
  foto_url: string | null
}

export interface ControlAceiteTablero {
  /** false = la migración del 06/11 no está aplicada en esta base. */
  disponible: boolean
  mes: string
  /** Desde cuándo se listan los hallazgos (YYYY-MM-DD). */
  desde: string
  /** Unidades obligatorias con el control del mes cargado / total. */
  conControl: number
  obligatorias: number
  sinControl: string[]
  hallazgos: HallazgoAceite[]
  litrosTrimestre: number
}

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date())
}

export async function getControlAceite(): Promise<
  { data: ControlAceiteTablero } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArgentina()
    const mes = hoy.slice(0, 7)
    // Los 3 meses cerrados + el actual: con 3 a secas, en noviembre se perdía
    // agosto y el reincidente de ago–sep (AE591EI) dejaba de verse.
    const d0 = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 4, 1)
    const desde = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-01`

    const [cilRes, vehRes] = await Promise.all([
      supabase
        .from("mantenimiento_cil")
        .select(
          "id, fecha, dominio, operario, foto_url, origen, aceite_nivel, aceite_litros, aceite_circuito, perdida_detectada, perdida_ubicacion, mantenimiento_id",
        )
        .gte("fecha", desde)
        .order("fecha", { ascending: false }),
      supabase.from("catalogo_vehiculos").select("dominio, tipo").eq("active", true),
    ])
    if (vehRes.error) return { error: vehRes.error.message }
    const obligatorias = ((vehRes.data || []) as Array<{ dominio: string; tipo: string | null }>)
      .filter(
        (v) =>
          (TIPOS_CIL_OBLIGATORIOS as readonly string[]).includes(v.tipo ?? "") &&
          !(v.dominio in DOMINIOS_CIL_EXCLUIDOS),
      )
      .map((v) => v.dominio)
      .sort()

    if (cilRes.error) {
      if (cilRes.error.code === "42703")
        return {
          data: {
            disponible: false,
            mes,
            desde,
            conControl: 0,
            obligatorias: obligatorias.length,
            sinControl: obligatorias,
            hallazgos: [],
            litrosTrimestre: 0,
          },
        }
      return { error: cilRes.error.message }
    }

    type Fila = FilaCilAceite & {
      id: string
      operario: string
      foto_url: string | null
      origen: string | null
    }
    const filas = (cilRes.data || []) as unknown as Fila[]
    const controles = filas.filter((f) => f.aceite_nivel != null || f.perdida_detectada != null)
    const hallazgos = controles.filter(esHallazgoAceite)
    const reincidentes = dominiosReincidentes(hallazgos)

    const controladasMes = new Set(
      controles.filter((c) => String(c.fecha).startsWith(mes)).map((c) => c.dominio),
    )

    // Número y estado de las OT vinculadas.
    const otIds = hallazgos.map((h) => h.mantenimiento_id).filter((x): x is string => !!x)
    const ots = new Map<string, { numero: string | null; estado: string }>()
    if (otIds.length > 0) {
      const { data } = await supabase
        .from("mantenimiento_realizados")
        .select("id, numero_ot, estado")
        .in("id", otIds)
      for (const o of (data || []) as Array<{ id: string; numero_ot: string | null; estado: string }>)
        ots.set(o.id, { numero: o.numero_ot, estado: o.estado })
    }

    return {
      data: {
        disponible: true,
        mes,
        desde,
        conControl: obligatorias.filter((d) => controladasMes.has(d)).length,
        obligatorias: obligatorias.length,
        sinControl: obligatorias.filter((d) => !controladasMes.has(d)),
        litrosTrimestre: hallazgos.reduce((s, h) => s + Number(h.aceite_litros ?? 0), 0),
        hallazgos: hallazgos.map((h) => {
          const ot = h.mantenimiento_id ? ots.get(h.mantenimiento_id) : undefined
          return {
            id: h.id,
            fecha: String(h.fecha),
            dominio: h.dominio,
            operario: h.operario,
            resumen: resumenAceite(h) ?? "",
            litros: h.aceite_litros == null ? null : Number(h.aceite_litros),
            circuito: h.aceite_circuito ?? null,
            perdida: h.perdida_detectada === true,
            reincidente: reincidentes.has(h.dominio),
            backfill: h.origen === "backfill",
            ot: h.mantenimiento_id && ot ? { id: h.mantenimiento_id, ...ot } : null,
            foto_url: h.foto_url,
          }
        }),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Del hallazgo a la OT correctiva (R4.1.5). Crea la OT en estado `programado`
 * —la reparación todavía no se hizo— y la deja enlazada al control con
 * `mantenimiento_id`, así el KPI muestra qué hallazgos ya tienen acción.
 *
 * 🚨 Una sola OT por hallazgo: si ya tiene, no crea otra (doble click, dos
 * supervisores mirando la misma pantalla).
 */
export async function generarOtDesdeHallazgoAceite(
  cilId: string,
): Promise<{ success: true; numeroOt: string | null } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: fila, error } = await supabase
      .from("mantenimiento_cil")
      .select(
        "id, fecha, dominio, operario, aceite_nivel, aceite_litros, aceite_circuito, perdida_detectada, perdida_ubicacion, mantenimiento_id",
      )
      .eq("id", cilId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!fila) return { error: "No se encontró el control de aceite" }
    const f = fila as unknown as FilaCilAceite & { operario: string }
    if (f.mantenimiento_id) return { error: "Ese hallazgo ya tiene una OT" }
    if (!esHallazgoAceite(f)) return { error: "Ese control no tiene hallazgo: no hay nada que reparar" }

    const resumen = resumenAceite(f) ?? "hallazgo de aceite"
    const fechaCil = String(f.fecha).split("-").reverse().join("/")
    const tarea = f.perdida_detectada
      ? `Reparar pérdida de aceite${f.perdida_ubicacion ? ` (${f.perdida_ubicacion})` : ""}`
      : "Revisar consumo de aceite: se repuso en el control del CIL"

    const creada = await createMantenimiento({
      dominio: f.dominio,
      fecha: hoyArgentina(),
      tipo: "correctivo",
      estado: "programado",
      sistema: f.aceite_circuito === "hidraulico" ? "hidraulico" : "refrigeracion_fluidos",
      observaciones:
        `OT generada desde el control de aceite del CIL del ${fechaCil} (DPO 4.1): ${resumen}. ` +
        `Lo detectó ${f.operario}.`,
      tareas: [{ descripcion: tarea }],
    })
    if ("error" in creada) return { error: `No se pudo crear la OT: ${creada.error}` }

    const { data: upd, error: updErr } = await supabase
      .from("mantenimiento_cil")
      .update({ mantenimiento_id: creada.data.id })
      .eq("id", cilId)
      .select("id")
    if (updErr) return { error: `La OT ${creada.data.numero_ot ?? ""} se creó pero no se pudo vincular: ${updErr.message}` }
    // RLS no da error cuando no deja actualizar: devuelve 0 filas.
    if (!upd || upd.length === 0)
      return { error: `La OT ${creada.data.numero_ot ?? ""} se creó pero no se pudo vincular (¿falta la policy de UPDATE de la migración?)` }

    revalidatePath("/vehiculos/mantenimiento")
    return { success: true, numeroOt: creada.data.numero_ot ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
