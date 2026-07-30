"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { fetchLecturas, kmActualPorDominio, today, daysBetween } from "@/lib/vehiculos/lecturas"
import type {
  CatalogoVehiculo,
  MaestroFlota,
  MaestroFlotaUnidad,
  VehiculoDocumento,
  VehiculoFicha,
} from "@/types/database"

/**
 * Maestro de flota — el padrón completo del parque, en una sola lectura.
 *
 * Punto 1 de la auditoría del gestor de flota: el maestro tiene que estar en la
 * pantalla de inicio. Los datos ya existían (`vehiculos_ficha`), pero sólo se
 * llegaba a ellos de a UNA unidad por vez entrando a `/vehiculos/[dominio]`: el
 * auditor entraba a Vehículos y no veía el parque por ningún lado.
 *
 * Junta las cuatro cosas que definen a una unidad:
 *  - identificación (marca, modelo, año, chasis, VIN, motor, capacidad…)
 *  - asignación (chofer responsable, centro de costo, ciudad)
 *  - documentación con sus vencimientos
 *  - estado operativo (km actual, fuera de servicio, último checklist)
 */

const DIAS_POR_VENCER = 30

/** Campos sin los que la ficha no sirve como maestro ante una auditoría. */
const CAMPOS_CLAVE = ["marca", "modelo", "anio", "chasis", "motor"] as const

export async function getMaestroFlota(): Promise<
  { data: MaestroFlota } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = today()

    const [catRes, fichasRes, docsRes, otRes, checkRes, lecturas] = await Promise.all([
      // El catálogo trae TAMBIÉN las de baja: el maestro tiene que poder mostrar
      // el parque histórico, no sólo lo que anda hoy.
      supabase.from("catalogo_vehiculos").select("*").order("dominio"),
      supabase.from("vehiculos_ficha").select("*"),
      supabase.from("vehiculos_documentos").select("*").order("vencimiento", { nullsFirst: false }),
      // Fuera de servicio vigente: OT no cancelada cuyo rango incluye hoy.
      supabase
        .from("mantenimiento_realizados")
        .select("dominio, fuera_servicio_desde, fuera_servicio_hasta, observaciones, numero_ot")
        .neq("estado", "cancelado")
        .not("fuera_servicio_desde", "is", null)
        .lte("fuera_servicio_desde", hoy)
        .or(`fuera_servicio_hasta.gte.${hoy},fuera_servicio_hasta.is.null`),
      supabase
        .from("checklist_vehiculos")
        .select("dominio, fecha")
        .order("fecha", { ascending: false }),
      fetchLecturas(undefined, supabase),
    ])

    if (catRes.error) return { error: catRes.error.message }

    const catalogo = (catRes.data ?? []) as CatalogoVehiculo[]
    const fichas = (fichasRes.data ?? []) as VehiculoFicha[]
    const documentos = (docsRes.data ?? []) as VehiculoDocumento[]

    const fichaPorDominio = new Map(fichas.map((f) => [f.dominio, f]))

    const docsPorDominio = new Map<string, VehiculoDocumento[]>()
    for (const d of documentos) {
      const lista = docsPorDominio.get(d.dominio) ?? []
      lista.push(d)
      docsPorDominio.set(d.dominio, lista)
    }

    // Una unidad puede tener más de una OT abierta: se toma la que arrancó antes.
    const fueraPorDominio = new Map<
      string,
      { desde: string; hasta: string | null; numero_ot: string | null; motivo: string | null }
    >()
    for (const ot of (otRes.data ?? []) as Array<{
      dominio: string
      fuera_servicio_desde: string
      fuera_servicio_hasta: string | null
      observaciones: string | null
      numero_ot: string | null
    }>) {
      const previa = fueraPorDominio.get(ot.dominio)
      if (previa && previa.desde <= ot.fuera_servicio_desde) continue
      fueraPorDominio.set(ot.dominio, {
        desde: ot.fuera_servicio_desde,
        hasta: ot.fuera_servicio_hasta,
        numero_ot: ot.numero_ot,
        motivo: ot.observaciones,
      })
    }

    // Ya viene ordenado por fecha desc: la primera de cada dominio es la última.
    const ultimoCheck = new Map<string, string>()
    for (const c of (checkRes.data ?? []) as Array<{ dominio: string; fecha: string }>) {
      if (!ultimoCheck.has(c.dominio)) ultimoCheck.set(c.dominio, c.fecha)
    }

    const kmPorDominio = kmActualPorDominio(lecturas)

    const unidades: MaestroFlotaUnidad[] = catalogo.map((c) => {
      const ficha = fichaPorDominio.get(c.dominio) ?? null
      const docs = docsPorDominio.get(c.dominio) ?? []
      const km = kmPorDominio.get(c.dominio) ?? null

      const faltantes = ficha
        ? CAMPOS_CLAVE.filter((campo) => !ficha[campo]).map((campo) => campo as string)
        : [...CAMPOS_CLAVE].map((campo) => campo as string)

      const docsVencidos = docs.filter(
        (d) => d.vencimiento != null && d.vencimiento < hoy
      ).length
      const docsPorVencer = docs.filter(
        (d) =>
          d.vencimiento != null &&
          d.vencimiento >= hoy &&
          daysBetween(hoy, d.vencimiento) <= DIAS_POR_VENCER
      ).length

      return {
        dominio: c.dominio,
        descripcion: c.descripcion,
        tipo: c.tipo ?? ficha?.tipo_unidad ?? null,
        sector: c.sector,
        activo: c.active !== false,
        ficha,
        documentos: docs,
        docsVencidos,
        docsPorVencer,
        camposFaltantes: faltantes,
        kmActual: km?.odometro ?? null,
        kmFecha: km?.fecha ?? null,
        fueraServicio: fueraPorDominio.get(c.dominio) ?? null,
        ultimoChecklist: ultimoCheck.get(c.dominio) ?? null,
      }
    })

    const activas = unidades.filter((u) => u.activo)
    const porTipo: Record<string, number> = {}
    for (const u of activas) {
      const t = u.tipo ?? "sin tipo"
      porTipo[t] = (porTipo[t] ?? 0) + 1
    }

    return {
      data: {
        unidades,
        resumen: {
          total: unidades.length,
          activas: activas.length,
          bajas: unidades.length - activas.length,
          porTipo,
          sinFicha: activas.filter((u) => !u.ficha).length,
          fichasIncompletas: activas.filter((u) => u.ficha && u.camposFaltantes.length > 0).length,
          docsVencidos: activas.reduce((a, u) => a + u.docsVencidos, 0),
          docsPorVencer: activas.reduce((a, u) => a + u.docsPorVencer, 0),
          fueraServicio: activas.filter((u) => u.fueraServicio).length,
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
