import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import {
  getOperadoresParaAsignar,
} from "@/actions/tareas-directas"
import { NuevaTareaClient } from "./nueva-tarea-client"

export const dynamic = "force-dynamic"

export default async function NuevaTareaPage() {
  const profile = await requireAuth()

  const puedeCrear =
    profile.role === "admin" ||
    profile.role === "auditor" ||
    profile.puede_asignar_tareas === true

  if (!puedeCrear) redirect("/")

  const operadores = await getOperadoresParaAsignar()

  return <NuevaTareaClient operadores={operadores} />
}
