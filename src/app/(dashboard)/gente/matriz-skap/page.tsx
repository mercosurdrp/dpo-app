import { getMatrizRol, getAcciones, puedeEditarRol, ROLES_SKAP } from "@/actions/skap-habilidades"
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

  const [matriz, acciones, canEdit] = await Promise.all([
    getMatrizRol(rol),
    getAcciones(rol),
    puedeEditarRol(rol),
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
    />
  )
}
