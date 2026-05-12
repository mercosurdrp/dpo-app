import { getPlanesList } from "@/actions/planes"
import { createClient } from "@/lib/supabase/server"
import { PlanesListClient } from "./planes-list-client"

export default async function PlanesPage() {
  const result = await getPlanesList()

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: adminsRaw } = await supabase
    .from("profiles")
    .select("id, nombre")
    .eq("active", true)
    .eq("role", "admin")
    .order("nombre")

  const admins = (adminsRaw ?? []) as Array<{ id: string; nombre: string }>

  return <PlanesListClient planes={result.data} admins={admins} />
}
