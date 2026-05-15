import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getOwdItems, getEmpleadosDistribucion } from "@/actions/owd-pre-ruta"
import { getVehiculos } from "@/actions/registros-vehiculos"
import { NuevaOwdClient } from "./nueva-owd-client"

export default async function NuevaOwdPage() {
  const [itemsRes, empleadosRes, vehiculosRes] = await Promise.all([
    getOwdItems(),
    getEmpleadosDistribucion(),
    getVehiculos(),
  ])

  if ("error" in itemsRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nueva OWD</h1>
        <p className="mt-2 text-red-500">Error: {itemsRes.error}</p>
      </div>
    )
  }

  const empleados = "data" in empleadosRes ? empleadosRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores/owd-pre-ruta"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <NuevaOwdClient items={itemsRes.data} empleados={empleados} vehiculos={vehiculos} />
    </div>
  )
}
