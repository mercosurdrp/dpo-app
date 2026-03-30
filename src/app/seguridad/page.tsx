import { getChoferesPublic, getVehiculosPublic } from "@/actions/seguridad"
import { SeguridadFormClient } from "./seguridad-form-client"

export const metadata = {
  title: "Registro de Vehículos - Seguridad",
}

export default async function SeguridadPage() {
  const [choferes, vehiculos] = await Promise.all([
    getChoferesPublic(),
    getVehiculosPublic(),
  ])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-6">
        <SeguridadFormClient choferes={choferes} vehiculos={vehiculos} />
      </div>
    </div>
  )
}
