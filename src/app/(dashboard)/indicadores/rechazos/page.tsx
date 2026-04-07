import { getRechazosAcumulado } from "@/actions/rechazos"
import { RechazosClient } from "./rechazos-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function RechazosPage() {
  const mesActual = new Date().getMonth() + 1
  const anioActual = new Date().getFullYear()

  const result = await getRechazosAcumulado(mesActual, anioActual)

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">% Rechazos</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <RechazosClient
        acumulado={result.data}
        mesInicial={mesActual}
        anioInicial={anioActual}
      />
    </div>
  )
}
