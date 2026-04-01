import { getChoferes, getVehiculos } from "@/actions/registros-vehiculos"
import { RegistroFormClient } from "./registro-form-client"

export default async function RegistroPage() {
  const [choferesRes, vehiculosRes] = await Promise.all([
    getChoferes(),
    getVehiculos(),
  ])

  const choferes = "data" in choferesRes ? choferesRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []

  return <RegistroFormClient choferes={choferes} vehiculos={vehiculos} />
}
