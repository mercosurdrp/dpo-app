import { redirect } from "next/navigation"
import { getMisTareas } from "@/actions/planes"
import { getProfile } from "@/lib/session"
import { MisTareasClient } from "./mis-tareas-client"

export const dynamic = "force-dynamic"

export default async function MisTareasPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const tareas = await getMisTareas()

  return (
    <MisTareasClient
      tareas={tareas}
      currentUserId={profile.id}
      currentRole={profile.role}
    />
  )
}
