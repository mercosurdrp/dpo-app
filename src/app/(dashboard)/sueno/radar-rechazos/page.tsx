import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { IS_MISIONES } from "@/lib/empresa"
import { getProfile } from "@/lib/session"
import { getRadarRechazos } from "@/actions/radar-rechazos"
import { RadarClient } from "./_components/radar-client"

export const dynamic = "force-dynamic"

/**
 * Radar de Rechazos del Día Siguiente — cuelga del nodo OTIF del Árbol del Sueño.
 * Lista los clientes que se entregan pasado mañana y tienen historial de rechazo por
 * CERRADO / SIN DINERO, para que ventas avise y evite el rechazo. Solo Pampeana.
 */
export default async function RadarRechazosPage() {
  if (IS_MISIONES) notFound()

  const [profile, res] = await Promise.all([getProfile(), getRadarRechazos()])
  const puedeRegenerar =
    profile?.role === "admin" || profile?.role === "supervisor"

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al inicio
      </Link>
      {"error" in res ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h1 className="text-lg font-semibold text-red-900">
            No se pudo cargar el radar de rechazos
          </h1>
          <p className="mt-1 text-sm text-red-700">{res.error}</p>
        </div>
      ) : (
        <RadarClient data={res.data} puedeRegenerar={puedeRegenerar} />
      )}
    </div>
  )
}
