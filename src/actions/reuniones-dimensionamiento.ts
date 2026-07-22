"use server"

/**
 * Resumen del dimensionamiento para la reunión de Logística del último día hábil
 * del mes (DPO Planeamiento 2.3 — R2.3.4: "el distribuidor comunica este tamaño a
 * los equipos de almacén, entrega y acarreo dentro de 1 mes de la ejecución").
 *
 * El módulo `/planeamiento/dimensionamiento` calcula siempre contra el mes EN CURSO.
 * Acá se congela en un snapshot por reunión: lo que se comunicó ese día queda tal
 * cual, aunque se lo mire meses después. Recalcular es explícito (botón).
 *
 * El resumen se arma sobre `getDatosDimensionamiento()` para no duplicar el modelo:
 * una sola fuente de verdad para dotaciones, capacidades y costos.
 */

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { getDatosDimensionamiento } from "./dimensionamiento"

type Result<T> = { data: T } | { error: string }

const ROLES_EDICION: ("admin" | "admin_rrhh" | "supervisor")[] = ["admin", "admin_rrhh", "supervisor"]

export interface ResumenRolAlmacen {
  rol: string
  unidad: string
  dotacion: number
  dotacionEfectiva: number
  necesariosProm: number
  necesariosPico: number
  volumenProm: number
  capacidadEquipo: number
  estado: "cubre" | "extras_pico" | "faltan"
  brecha: number            // necesarios − dotación efectiva (>0 = faltan)
}

export interface ResumenRecursoFlota {
  recurso: string
  dotacion: number
  necesariosProm: number
  necesariosPico: number
  estado: "cubre" | "extras_pico" | "faltan"
  brecha: number
}

export interface ResumenMesQueViene {
  mes: string               // "2026-08"
  hlProyectados: number
  hhAlmacen: number
  costoAlmacen: number
  hhDistribucion: number
  costoDistribucion: number
  costoTotal: number
  costoPorHl: number
  diasRefuerzoFlota: number
  segundaVueltaObligada: boolean
  rolesConFalta: string[]   // roles de almacén que no llegan ni en promedio
}

export interface ResumenDimensionamiento {
  mes: string                          // mes de la operación medida
  generadoEl: string
  almacen: ResumenRolAlmacen[]
  flota: ResumenRecursoFlota[]
  camiones: { operativos: number; capacidadCeqDia: number; volumenCeqProm: number; volumenCeqPico: number }
  proximoMes: ResumenMesQueViene | null
  vlc: { valorMes: number | null; mesBase: string | null; ytd: number | null; meta: number | null }
}

export interface SnapshotDimReunion {
  datos: ResumenDimensionamiento
  updatedAt: string
}

function estadoDe(necProm: number, necPico: number, dot: number) {
  if (necPico <= dot) return "cubre" as const
  if (necProm <= dot) return "extras_pico" as const
  return "faltan" as const
}

/** Arma el resumen desde el módulo de dimensionamiento (sin persistir). */
async function construirResumen(): Promise<Result<ResumenDimensionamiento>> {
  const res = await getDatosDimensionamiento()
  if ("error" in res) return { error: res.error }
  const d = res.data

  const almacen: ResumenRolAlmacen[] = []
  if (d.almacen) {
    const roles = [
      { rol: "Pickeros", r: d.almacen.pickeros, unidad: "bultos" },
      { rol: "Clasificadores", r: d.almacen.clasificadores, unidad: "HL" },
      { rol: "Tareas generales", r: d.almacen.reempaque, unidad: "bultos" },
      { rol: "Maquinistas", r: d.almacen.maquinistas, unidad: "pallets" },
    ]
    for (const { rol, r, unidad } of roles) {
      almacen.push({
        rol,
        unidad,
        dotacion: r.dotacion,
        dotacionEfectiva: r.dotacionEfectiva,
        necesariosProm: r.fteNecesariosProm,
        necesariosPico: r.fteNecesariosPico,
        volumenProm: r.volumenProm,
        capacidadEquipo: Math.round(r.capDiariaFte * r.dotacionEfectiva),
        estado: estadoDe(r.fteNecesariosProm, r.fteNecesariosPico, r.dotacionEfectiva),
        brecha: Math.round((r.fteNecesariosProm - r.dotacionEfectiva) * 10) / 10,
      })
    }
  }

  const flota: ResumenRecursoFlota[] = []
  if (d.metricas) {
    flota.push({
      recurso: "Camiones",
      dotacion: d.unidadesDisponibles,
      necesariosProm: d.metricas.camionesNecesariosPromedio,
      necesariosPico: d.metricas.camionesNecesariosPico,
      estado: estadoDe(d.metricas.camionesNecesariosPromedio, d.metricas.camionesNecesariosPico, d.unidadesDisponibles),
      brecha: d.metricas.camionesNecesariosPromedio - d.unidadesDisponibles,
    })
  }
  if (d.reparto) {
    for (const [k, label] of [["choferes", "Choferes"], ["ayudantes", "Ayudantes"]] as const) {
      const r = d.reparto[k]
      const dot = Math.round(r.dotacionProm)
      flota.push({
        recurso: label,
        dotacion: dot,
        necesariosProm: r.fteNecesariosProm,
        necesariosPico: r.fteNecesariosPico,
        estado: estadoDe(r.fteNecesariosProm, r.fteNecesariosPico, dot),
        brecha: r.fteNecesariosProm - dot,
      })
    }
  }

  // Mes que viene: primer mes de la proyección (es a donde apunta la comunicación).
  let proximoMes: ResumenMesQueViene | null = null
  const p = d.proyeccion
  if (p && p.meses.length > 0) {
    const i = 0
    const mm = p.meses[i]
    const mesN = Number(mm.mes.split("-")[1])
    const tar = p.costoHh.find((c) => c.mes === mesN)
    const hhAlmacen = Math.round(p.almacen.reduce((s, r) => s + (r.horasExtra[i] ?? 0), 0) * 10) / 10
    const hhDistribucion = Math.round(
      p.flota.filter((r) => r.rol !== "Camiones")
        .reduce((s, r) => s + (r.personaDias?.[i] ?? 0), 0) * p.horasVueltaExtra * 10) / 10
    const costoAlmacen = hhAlmacen * (tar?.almacen ?? 0)
    const costoDistribucion = hhDistribucion * (tar?.entrega ?? 0)
    const costoTotal = costoAlmacen + costoDistribucion
    proximoMes = {
      mes: mm.mes,
      hlProyectados: Math.round(mm.hl),
      hhAlmacen,
      costoAlmacen: Math.round(costoAlmacen),
      hhDistribucion,
      costoDistribucion: Math.round(costoDistribucion),
      costoTotal: Math.round(costoTotal),
      costoPorHl: mm.hl > 0 ? Math.round((costoTotal / mm.hl) * 10) / 10 : 0,
      diasRefuerzoFlota: Math.max(0, ...p.flota.map((r) => r.diasRefuerzo[i] ?? 0)),
      segundaVueltaObligada: p.flota.some((r) => r.segundaVueltaMeses[i]),
      rolesConFalta: p.almacen.filter((r) => (r.faltanPico[i] ?? 0) > 0).map((r) => r.rol),
    }
  }

  return {
    data: {
      mes: d.almacen?.mes ?? d.metricas?.mes ?? "",
      generadoEl: new Date().toISOString(),
      almacen,
      flota,
      camiones: {
        operativos: d.unidadesDisponibles,
        capacidadCeqDia: Math.round(d.capacidadInstaladaDiaria),
        volumenCeqProm: d.metricas?.volumenCeqPromedio ?? 0,
        volumenCeqPico: d.metricas?.volumenCeqPico ?? 0,
      },
      proximoMes,
      vlc: {
        valorMes: p?.vlc.valorMes ?? null,
        mesBase: p?.vlc.mesBase ?? null,
        ytd: p?.vlc.ytd ?? null,
        meta: p?.vlc.meta ?? null,
      },
    },
  }
}

/** Devuelve el snapshot guardado para la reunión; null si todavía no se generó. */
export async function getResumenDimReunion(reunionId: string): Promise<Result<SnapshotDimReunion | null>> {
  try {
    const profile = await requireAuth()
    if (!profile) return { error: "No autenticado" }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reunion_dimensionamiento_snapshots")
      .select("datos, updated_at")
      .eq("reunion_id", reunionId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { data: null }
    return { data: { datos: data.datos as ResumenDimensionamiento, updatedAt: data.updated_at as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Recalcula el resumen desde el módulo de dimensionamiento y lo congela en la reunión. */
export async function actualizarResumenDimReunion(reunionId: string): Promise<Result<SnapshotDimReunion>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (!profile) return { error: "Sin permisos" }
    const res = await construirResumen()
    if ("error" in res) return { error: res.error }
    const supabase = await createClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from("reunion_dimensionamiento_snapshots")
      .upsert({ reunion_id: reunionId, datos: res.data, created_by: profile.id, updated_at: now }, { onConflict: "reunion_id" })
    if (error) return { error: error.message }
    return { data: { datos: res.data, updatedAt: now } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}
