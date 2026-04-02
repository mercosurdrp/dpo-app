import { getReunionKpis, getReunionResumenMensual } from "@/actions/reunion-preruta"
import { AsistenciaMatinalClient } from "./asistencia-matinal-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function AsistenciaMatinalPage() {
  const hoy = new Date().toISOString().slice(0, 10)
  const mesActual = new Date().getMonth() + 1
  const anioActual = new Date().getFullYear()

  const [kpisHoyRes, resumenMesRes] = await Promise.all([
    getReunionKpis(hoy),
    getReunionResumenMensual(mesActual, anioActual),
  ])

  if ("error" in kpisHoyRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Asistencia Matinal</h1>
        <p className="mt-2 text-red-500">Error: {kpisHoyRes.error}</p>
      </div>
    )
  }

  const resumenMes = "data" in resumenMesRes ? resumenMesRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <AsistenciaMatinalClient
        kpisHoy={kpisHoyRes.data}
        resumenMes={resumenMes}
        mesActual={mesActual}
        anioActual={anioActual}
      />
    </div>
  )
}
