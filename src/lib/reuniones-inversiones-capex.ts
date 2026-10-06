/**
 * Seguimiento mensual de Inversiones / CAPEX en la Reunión de Presupuesto
 * (DPO 5.3 · 3YP & CAPEX, R5.3.1: la rutina está definida en el ciclo de
 * negocio). Agrupa las inversiones del año en lo que la reunión tiene que
 * mirar: qué estaba programado para el mes cerrado, qué se hizo, qué quedó
 * vencido y qué viene en los próximos 60 días.
 */
import type { InversionConDetalle, PresupuestoCapex } from "@/types/database"
import {
  desvioMonto,
  desvioTiempo,
  estaCerrada,
  fechaValida,
  isoHoy,
  parseFecha,
  resumenCapex,
  type DesvioMonto,
  type DesvioTiempo,
  type ResumenCapex,
} from "@/lib/inversiones-seguimiento"

export interface InversionesCapexReunionData {
  /** Año del presupuesto que se sigue (el del mes cerrado). */
  anio: number
  /** Mes cerrado que revisa la reunión (1..12). */
  mesCierre: number
  inversiones: InversionConDetalle[]
  capex: PresupuestoCapex | null
}

export interface InversionConDesvios {
  inv: InversionConDetalle
  tiempo: DesvioTiempo | null
  monto: DesvioMonto | null
}

export interface AgendaInversiones {
  resumen: ResumenCapex
  /** Programadas con fecha en el mes cerrado (cualquier estado salvo cancelada). */
  delMes: InversionConDesvios[]
  /** Realizadas con fecha real en el mes cerrado. */
  realizadasMes: InversionConDesvios[]
  /** Abiertas con fecha programada ya pasada. */
  vencidas: InversionConDesvios[]
  /** Abiertas programadas dentro de los próximos 60 días. */
  proximas: InversionConDesvios[]
  /** Sin cotización ni factura adjunta (R5.3.3 pide una por proyecto). */
  sinEvidencia: number
}

function mesDe(iso: string | null, anio: number): number | null {
  if (!fechaValida(iso)) return null
  const [y, m] = iso.split("-").map(Number)
  return y === anio ? m : null
}

function conDesvios(inv: InversionConDetalle, hoy: string): InversionConDesvios {
  return { inv, tiempo: desvioTiempo(inv, hoy), monto: desvioMonto(inv) }
}

export function agendaInversiones(
  data: InversionesCapexReunionData,
  hoy = isoHoy(),
): AgendaInversiones {
  const vivas = data.inversiones.filter((i) => i.estado !== "cancelada")
  const resumen = resumenCapex(data.inversiones, data.anio, data.capex?.monto ?? null, hoy)

  const limite = new Date(parseFecha(hoy))
  limite.setDate(limite.getDate() + 60)
  const isoLimite = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`

  const delMes = vivas
    .filter((i) => mesDe(i.fecha_programada, data.anio) === data.mesCierre)
    .map((i) => conDesvios(i, hoy))
  const realizadasMes = vivas
    .filter(
      (i) => i.estado === "realizada" && mesDe(i.fecha_realizada, data.anio) === data.mesCierre,
    )
    .map((i) => conDesvios(i, hoy))
  const vencidas = vivas
    .filter(
      (i) => !estaCerrada(i) && fechaValida(i.fecha_programada) && i.fecha_programada < hoy,
    )
    .sort((a, b) => (a.fecha_programada ?? "").localeCompare(b.fecha_programada ?? ""))
    .map((i) => conDesvios(i, hoy))
  const proximas = vivas
    .filter(
      (i) =>
        !estaCerrada(i) &&
        fechaValida(i.fecha_programada) &&
        i.fecha_programada >= hoy &&
        i.fecha_programada <= isoLimite,
    )
    .sort((a, b) => (a.fecha_programada ?? "").localeCompare(b.fecha_programada ?? ""))
    .map((i) => conDesvios(i, hoy))
  const sinEvidencia = vivas.filter((i) => !i.evidencia_url).length

  return { resumen, delMes, realizadasMes, vencidas, proximas, sinEvidencia }
}
