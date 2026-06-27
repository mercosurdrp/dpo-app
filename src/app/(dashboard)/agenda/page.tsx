import { notFound } from "next/navigation"
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { listarEventosEnRango } from "@/actions/agenda"
import type { AgendaEvento } from "@/lib/agenda"
import { AgendaClient } from "./agenda-client"

/** Rango de la grilla mensual (lunes a domingo) que contiene a `ref`. */
function rangoGrilla(ref: Date): { desde: string; hasta: string } {
  const inicio = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 })
  const fin = endOfWeek(endOfMonth(ref), { weekStartsOn: 1 })
  // Forzamos que el intervalo sea válido (date-fns lo exige).
  eachDayOfInterval({ start: inicio, end: fin })
  return {
    desde: format(inicio, "yyyy-MM-dd"),
    hasta: format(fin, "yyyy-MM-dd"),
  }
}

export default async function AgendaPage() {
  // Solo gestión y solo tenant Misiones.
  await requireRole(["admin", "supervisor"])
  if (!IS_MISIONES) notFound()

  const hoy = new Date()
  const mesISO = format(hoy, "yyyy-MM-dd")
  const { desde, hasta } = rangoGrilla(hoy)

  const res = await listarEventosEnRango(desde, hasta)
  const eventos: AgendaEvento[] = "data" in res ? res.data : []

  return <AgendaClient mesInicialISO={mesISO} eventosIniciales={eventos} />
}
