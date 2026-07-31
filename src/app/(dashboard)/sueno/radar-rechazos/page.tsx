import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { IS_MISIONES } from "@/lib/empresa"
import { getProfile } from "@/lib/session"
import { getRadarFechas, getRadarRechazos } from "@/actions/radar-rechazos"
import { RadarClient } from "./_components/radar-client"

export const dynamic = "force-dynamic"

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Radar de Rechazos del Día Siguiente — cuelga del nodo OTIF del Árbol del Sueño.
 * Lista los clientes que se entregan pasado mañana y tienen historial de rechazo por
 * CERRADO / SIN DINERO, para que ventas avise y evite el rechazo. Solo Pampeana.
 *
 * Con `?fecha=YYYY-MM-DD` muestra la foto histórica de ese día de entrega en vez
 * de la vigente, para consultar días para atrás.
 */
export default async function RadarRechazosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  if (IS_MISIONES) notFound()

  const fechaRaw = (await searchParams).fecha
  const fecha =
    typeof fechaRaw === "string" && RE_FECHA.test(fechaRaw) ? fechaRaw : undefined

  const [profile, res, fechasRes] = await Promise.all([
    getProfile(),
    getRadarRechazos(fecha),
    getRadarFechas(),
  ])
  const puedeRegenerar =
    profile?.role === "admin" || profile?.role === "supervisor"
  const fechas = "error" in fechasRes ? [] : fechasRes.data

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
        <RadarClient
          data={res.data}
          puedeRegenerar={puedeRegenerar}
          fechas={fechas}
          fechaPedida={fecha}
        />
      )}
    </div>
  )
}
