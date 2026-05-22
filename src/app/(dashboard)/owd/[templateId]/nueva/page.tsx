import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getOwdTemplateById, getOwdItems, getEmpleadosActivos } from "@/actions/owd"
import { getVehiculos } from "@/actions/registros-vehiculos"
import { NuevaOwdClient } from "./nueva-owd-client"

export default async function NuevaOwdPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params

  const [tplRes, itemsRes, empleadosRes, vehiculosRes] = await Promise.all([
    getOwdTemplateById(templateId),
    getOwdItems(templateId),
    getEmpleadosActivos(),
    getVehiculos(),
  ])

  if ("error" in tplRes) {
    if (tplRes.error.includes("No rows")) notFound()
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nueva OWD</h1>
        <p className="mt-2 text-red-500">Error: {tplRes.error}</p>
      </div>
    )
  }
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
        href={`/owd/${templateId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <NuevaOwdClient
        templateId={templateId}
        titulo={tplRes.data.template.nombre}
        items={itemsRes.data}
        empleados={empleados}
        vehiculos={vehiculos}
      />
    </div>
  )
}
