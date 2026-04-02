import { getPuntualidadDiaria, getPuntualidadMensual } from "@/actions/puntualidad"
import { PuntualidadClient } from "./puntualidad-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function PuntualidadPage() {
  const hoy = new Date().toISOString().slice(0, 10)
  const mesActual = new Date().getMonth() + 1
  const anioActual = new Date().getFullYear()

  const [diariaRes, mensualRes] = await Promise.all([
    getPuntualidadDiaria(hoy),
    getPuntualidadMensual(mesActual, anioActual),
  ])

  if ("error" in diariaRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">% Puntualidad Pre-Ruta</h1>
        <p className="mt-2 text-red-500">Error: {diariaRes.error}</p>
      </div>
    )
  }

  const resumenMes = "data" in mensualRes ? mensualRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <PuntualidadClient
        diariaHoy={diariaRes.data}
        resumenMes={resumenMes}
        mesActual={mesActual}
        anioActual={anioActual}
      />
    </div>
  )
}
