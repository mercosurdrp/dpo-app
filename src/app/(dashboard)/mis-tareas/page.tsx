import { getMisTareas } from "@/actions/planes"
import { MisTareasClient } from "./mis-tareas-client"

export const dynamic = "force-dynamic"

export default async function MisTareasPage() {
  const tareas = await getMisTareas()

  return <MisTareasClient tareas={tareas} />
}
