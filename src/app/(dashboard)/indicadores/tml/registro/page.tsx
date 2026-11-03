import { getChoferes, getVehiculos } from "@/actions/registros-vehiculos"
import { getCamionesBloqueados } from "@/actions/bloqueo-critico"
import { getProfile } from "@/lib/session"
import { RegistroFormClient } from "./registro-form-client"

export default async function RegistroPage() {
  const [choferesRes, vehiculosRes, bloqueadosRes, profile] = await Promise.all([
    getChoferes(),
    getVehiculos(),
    getCamionesBloqueados(),
    getProfile(),
  ])

  const choferes = "data" in choferesRes ? choferesRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []

  const bloqueados = "data" in bloqueadosRes ? bloqueadosRes.data : []
  const puedeLiberar = profile?.role === "admin" || profile?.role === "supervisor"

  return (
    <RegistroFormClient
      choferes={choferes}
      vehiculos={vehiculos}
      bloqueados={bloqueados}
      puedeLiberar={puedeLiberar}
    />
  )
}
