import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getAnalisisCombustible } from "@/actions/combustible-analisis"
import { AnalisisCombustibleClient } from "./analisis-client"

export const dynamic = "force-dynamic"

/**
 * Análisis de combustible de la flota (mensual): consumo, km y rendimiento
 * (km/l) por camión vs el promedio de la flota, para armar el plan de acción.
 */
export default async function AnalisisCombustiblePage() {
  const res = await getAnalisisCombustible()

  return (
    <div className="space-y-4">
      <Link
        href="/vehiculos/combustible"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Combustible
      </Link>
      {"error" in res ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el análisis: {res.error}
        </div>
      ) : (
        <AnalisisCombustibleClient inicial={res.data} />
      )}
    </div>
  )
}
