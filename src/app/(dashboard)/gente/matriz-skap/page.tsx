import { getMatrizRol, getAcciones, puedeEditarRol } from "@/actions/skap-habilidades"
import { getPlanPac, sincronizarConPac } from "@/actions/skap-pac"
import { ROLES_SKAP } from "@/lib/skap/roles"
import type { SkapRol } from "@/types/database"
import { MatrizHabilidadesClient } from "./matriz-habilidades-client"

const ROLES_VALIDOS = ROLES_SKAP.map((r) => r.rol)

export default async function MatrizSkapHabilidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string }>
}) {
  const params = await searchParams
  const rol = (ROLES_VALIDOS.includes(params.rol as SkapRol) ? params.rol : "chofer") as SkapRol

  // Primero se trae del PAC lo que ya se dictó/aprobó: las acciones quedan cumplidas solas.
  await sincronizarConPac(rol).catch(() => 0)

  const [matriz, acciones, canEdit, planPac] = await Promise.all([
    getMatrizRol(rol),
    getAcciones(rol),
    puedeEditarRol(rol),
    getPlanPac(rol),
  ])

  if ("error" in matriz) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Matriz SKAP</h1>
        <p className="text-red-500">Error: {matriz.error}</p>
      </div>
    )
  }

  return (
    <MatrizHabilidadesClient
      matriz={matriz.data}
      acciones={"error" in acciones ? [] : acciones.data}
      canEdit={canEdit}
      roles={ROLES_SKAP}
      planPac={"error" in planPac ? null : planPac.data}
    />
  )
}
