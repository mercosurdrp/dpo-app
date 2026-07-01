import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns"
import { requireAuth } from "@/lib/session"
import { getOwdTemplates, getEmpleadosActivos } from "@/actions/owd"
import { listarAgendaEnRango } from "@/actions/owd-agenda"
import { OwdCalendarioClient } from "./owd-calendario-client"

export default async function OwdCalendarioPage() {
  const profile = await requireAuth()
  if (profile.role !== "admin" && profile.role !== "supervisor") redirect("/owd")

  // Rango del mes visible actual (grilla lunes→domingo) para precargar.
  const hoy = new Date()
  const desde = format(startOfWeek(startOfMonth(hoy), { weekStartsOn: 1 }), "yyyy-MM-dd")
  const hasta = format(endOfWeek(endOfMonth(hoy), { weekStartsOn: 1 }), "yyyy-MM-dd")

  const [templatesRes, empleadosRes, agendaRes] = await Promise.all([
    getOwdTemplates(),
    getEmpleadosActivos(),
    listarAgendaEnRango(desde, hasta),
  ])

  const templates = ("data" in templatesRes ? templatesRes.data : []).map((t) => ({
    id: t.template.id,
    nombre: t.template.nombre,
    pilar: t.pilar_nombre,
  }))
  const empleados = ("data" in empleadosRes ? empleadosRes.data : []).map((e) => e.nombre)
  const agendaInicial = "data" in agendaRes ? agendaRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/owd"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a OWD
      </Link>
      <OwdCalendarioClient
        templates={templates}
        empleados={empleados}
        agendaInicial={agendaInicial}
        supervisorDefault={profile.nombre ?? ""}
      />
    </div>
  )
}
