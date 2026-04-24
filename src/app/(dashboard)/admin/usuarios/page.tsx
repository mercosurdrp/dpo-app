import { requireRole } from "@/lib/session"
import { getUsersWithStats } from "@/actions/admin"
import { createClient } from "@/lib/supabase/server"
import { UsuariosClient } from "./usuarios-client"

export default async function UsuariosPage() {
  await requireRole(["admin"])

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const result = await getUsersWithStats()

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <UsuariosClient users={result.data} currentUserId={user?.id ?? ""} />
  )
}
