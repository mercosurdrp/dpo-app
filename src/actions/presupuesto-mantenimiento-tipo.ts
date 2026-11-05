"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  esTipoMantenimiento,
  type MantenimientoPorTipo,
  type MantenimientoTipoFila,
} from "@/lib/presupuesto/mantenimiento-tipo"

/**
 * Gasto de mantenimiento de la flota estratificado por tipo (preventivo /
 * correctivo / proactivo), por mes y unidad, para la pestaña Presupuesto
 * filtrada por el pilar Flota.
 *
 * Responde a la observación del auditor DPO H2 2026 en Flota 3.2 «Presupuesto
 * de gastos de flota»: «Seguimiento de gastos vs presupuestado. Motivos ante
 * desvíos. Oportunidad de segregar en motivos (correctivos, preventivos)».
 * El requisito R3.2.2 pide controlar los costos de la flota separando
 * mantenimiento preventivo y correctivo.
 *
 * Fuente: las órdenes de trabajo de `/vehiculos/mantenimiento`
 * (`mantenimiento_realizados`): cada OT tiene su tipo y su costo total (mano
 * de obra + repuestos, editable). Se excluyen las canceladas. El libro de
 * gastos (`mantenimiento_gastos`) tiene la misma columna `tipo_mantenimiento`
 * pero no se usa en 2026, así que no suma.
 *
 * 🚨 El mes es el de la fecha de la OT (cuándo se hizo el trabajo), no el mes
 * de imputación contable del EERR: una OT de fin de mes puede facturarse el
 * mes siguiente, así que el cruce con el EERR es orientativo.
 */

type Result<T> = { data: T } | { error: string }

export async function getMantenimientoPorTipo(
  anio: number,
): Promise<Result<MantenimientoPorTipo>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("mantenimiento_realizados")
      .select("dominio, fecha, tipo, estado, costo")
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .neq("estado", "cancelado")
      .order("fecha")
      .limit(5000)
    if (error) return { error: error.message }

    const filas = new Map<string, MantenimientoTipoFila>()
    let ultimoMes = 0
    let totalOt = 0

    for (const r of data ?? []) {
      const tipo = String(r.tipo)
      if (!esTipoMantenimiento(tipo)) continue
      const mes = Number(String(r.fecha).slice(5, 7))
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) continue
      const dominio =
        String(r.dominio ?? "").trim().toUpperCase() || "SIN PATENTE"
      const costo =
        r.costo === null || r.costo === undefined ? NaN : Number(r.costo)
      const hayCosto = Number.isFinite(costo)

      const key = `${mes}|${dominio}|${tipo}`
      let f = filas.get(key)
      if (!f) {
        f = { mes, dominio, tipo, costo: 0, ot: 0, sinCosto: 0 }
        filas.set(key, f)
      }
      f.ot++
      if (hayCosto) f.costo += costo
      else f.sinCosto++

      totalOt++
      ultimoMes = Math.max(ultimoMes, mes)
    }

    return {
      data: { anio, filas: [...filas.values()], ultimoMes, totalOt },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
