import { getPlanesList } from "@/actions/planes"
import { getPlanesUnificados } from "@/actions/planes-unificados"
import { createClient } from "@/lib/supabase/server"
import { IS_MISIONES } from "@/lib/empresa"
import { PlanesTabsClient } from "./planes-tabs-client"

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

  // Tablero unificado (todos los módulos): sólo Pampeana por ahora.
  let unificados = null
  if (!IS_MISIONES) {
    const uni = await getPlanesUnificados()
    if (!("error" in uni)) unificados = uni.data
  }

  return (
    <PlanesTabsClient
      planes={result.data}
      admins={admins}
      unificados={unificados}
    />
  )
}
