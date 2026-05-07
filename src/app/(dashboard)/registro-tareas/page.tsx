import { requireAuth } from "@/lib/session"
import {
  getRegistroTareasDirectas,
  getOperadoresParaAsignar,
  getPilaresParaFiltro,
  getBloquesParaFiltro,
} from "@/actions/tareas-directas"
import { RegistroTareasClient } from "./registro-tareas-client"

export const dynamic = "force-dynamic"

export default async function RegistroTareasPage() {
  const profile = await requireAuth()

  const [resultado, operadores, pilares, bloques] = await Promise.all([
    getRegistroTareasDirectas(),
    getOperadoresParaAsignar(),
    getPilaresParaFiltro(),
    getBloquesParaFiltro(),
  ])

  if ("error" in resultado) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold">Registro de tareas</h1>
        <p className="mt-2 text-red-500">Error: {resultado.error}</p>
      </div>
    )
  }

  const puedeCrear =
    profile.role === "admin" ||
    profile.role === "auditor" ||
    profile.puede_asignar_tareas === true

  return (
    <RegistroTareasClient
      tareasIniciales={resultado.data}
      operadores={operadores}
      pilares={pilares}
      bloques={bloques}
      puedeCrear={puedeCrear}
    />
  )
}
