import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getVehiculoDetalle } from "@/actions/vehiculos-analytics"
import { getFichaVehiculo } from "@/actions/vehiculos-ficha"
import { getProfile } from "@/lib/session"
import { VehiculoDetalleClient } from "./vehiculo-detalle-client"
import { FichaVehiculo } from "./ficha-vehiculo"

export default async function VehiculoDetallePage({
  params,
}: {
  params: Promise<{ dominio: string }>
}) {
  const { dominio } = await params
  const decoded = decodeURIComponent(dominio)
  const [res, fichaRes, profile] = await Promise.all([
    getVehiculoDetalle(decoded),
    getFichaVehiculo(decoded),
    getProfile(),
  ])

  if ("error" in res) {
    if (res.error.includes("no encontrado")) notFound()
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Vehículo</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  const fichaData = "data" in fichaRes ? fichaRes.data : { ficha: null, documentos: [] }
  const canEdit = profile?.role === "admin" || profile?.role === "supervisor"

  return (
    <div className="space-y-4">
      <Link
        href="/vehiculos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Vehículos
      </Link>
      <VehiculoDetalleClient detalle={res.data}>
        <FichaVehiculo
          dominio={res.data.vehiculo.dominio}
          ficha={fichaData.ficha}
          documentos={fichaData.documentos}
          canEdit={canEdit}
        />
      </VehiculoDetalleClient>
    </div>
  )
}
