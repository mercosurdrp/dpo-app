import { getRespuestasPilar } from "@/actions/respuestas"
import { createClient } from "@/lib/supabase/server"
import type { Pilar } from "@/types/database"
import { PilarScoringClient } from "./pilar-scoring-client"

export default async function PilarScoringPage({
  params,
}: {
  params: Promise<{ id: string; pilarId: string }>
}) {
  const { id: auditoriaId, pilarId } = await params

  const supabase = await createClient()

  // Fetch pilar info
  const { data: pilar, error: pilarError } = await supabase
    .from("pilares")
    .select("*")
    .eq("id", pilarId)
    .single()

  if (pilarError || !pilar) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pilar</h1>
        <p className="mt-2 text-red-500">
          Error: {pilarError?.message ?? "Pilar no encontrado"}
        </p>
      </div>
    )
  }

  // Fetch all pilares for navigation
  const { data: allPilares } = await supabase
    .from("pilares")
    .select("id, nombre, orden")
    .order("orden")

  // Fetch bloques with preguntas + respuestas
  const result = await getRespuestasPilar(auditoriaId, pilarId)

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{(pilar as Pilar).nombre}</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <PilarScoringClient
      auditoriaId={auditoriaId}
      pilar={pilar as Pilar}
      allPilares={(allPilares ?? []) as Pick<Pilar, "id" | "nombre" | "orden">[]}
      bloques={result.data.bloques}
    />
  )
}
