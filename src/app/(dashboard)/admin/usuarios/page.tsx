import { requireRole } from "@/lib/session"
import { getUsers } from "@/actions/admin"
import { UsuariosClient } from "./usuarios-client"

export default async function UsuariosPage() {
  await requireRole(["admin"])
  const result = await getUsers()

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return <UsuariosClient users={result.data} />
}
