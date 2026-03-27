import { createClient } from "@/lib/supabase/server"
import { getPreguntaGestion } from "@/actions/gestion"
import type { Pilar } from "@/types/database"
import { PreguntaGestionClient } from "./pregunta-gestion-client"

export default async function PreguntaPage({
  params,
}: {
  params: Promise<{ id: string; preguntaId: string }>
}) {
  const { id, preguntaId } = await params
  const supabase = await createClient()

  // Get pilar info
  const { data: pilar, error: pilarErr } = await supabase
    .from("pilares")
    .select("*")
    .eq("id", id)
    .single()

  if (pilarErr || !pilar) {
    return (
      <div className="p-4">
        <p className="text-red-500">
          Error: {pilarErr?.message ?? "Pilar no encontrado"}
        </p>
      </div>
    )
  }

  // Get pregunta with all gestion data
  const result = await getPreguntaGestion(preguntaId)

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <PreguntaGestionClient
      pilar={pilar as Pilar}
      pregunta={result.data}
    />
  )
}
