import { listarMiEquipo } from "@/actions/rrhh-personal"
import { listarSolicitudesEquipo } from "@/actions/rrhh-licencias"
import { requireAuth } from "@/lib/session"
import { MiEquipoClient } from "./mi-equipo-client"

export default async function MiEquipoPage() {
  const profile = await requireAuth()

  const [equipoRes, solicitudesRes] = await Promise.all([
    listarMiEquipo(),
    listarSolicitudesEquipo(),
  ])

  return (
    <MiEquipoClient
      role={profile.role}
      equipo={"data" in equipoRes ? equipoRes.data : []}
      solicitudes={"data" in solicitudesRes ? solicitudesRes.data : []}
    />
  )
}
