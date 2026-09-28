import { getTalento } from "@/actions/skap-talento"
import { ROLES_SKAP } from "@/lib/skap/roles"
import { TalentoClient } from "./talento-client"

export default async function TalentoSkapPage() {
  const res = await getTalento()
  if ("error" in res) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Talento · Matriz de habilidades</h1>
        <p className="text-red-500">Error: {res.error}</p>
      </div>
    )
  }
  return <TalentoClient data={res.data} roles={ROLES_SKAP} />
}
