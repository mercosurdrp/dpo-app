import { redirect } from "next/navigation"
import { getProfile } from "@/lib/session"
import {
  listarAcciones,
  listResponsablesPosibles,
} from "@/actions/s5-acciones"
import { getVehiculosActivos } from "@/actions/s5"
import { AccionesClient } from "../acciones-client"

export default async function AccionesAlmacenPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const [accionesRes, responsablesRes, vehiculosRes] = await Promise.all([
    listarAcciones({ tipo: "almacen" }),
    listResponsablesPosibles(),
    getVehiculosActivos(),
  ])

  if ("error" in accionesRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Acciones 5S — Almacén</h1>
        <p className="mt-2 text-red-500">Error: {accionesRes.error}</p>
      </div>
    )
  }

  return (
    <AccionesClient
      tipo="almacen"
      currentUserId={profile.id}
      currentRole={profile.role}
      accionesIniciales={accionesRes.data}
      responsables={"error" in responsablesRes ? [] : responsablesRes.data}
      vehiculos={"error" in vehiculosRes ? [] : vehiculosRes.data}
    />
  )
}
