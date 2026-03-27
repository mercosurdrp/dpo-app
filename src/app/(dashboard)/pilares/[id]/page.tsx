import { createClient } from "@/lib/supabase/server"
import { getPilarGestion } from "@/actions/gestion"
import type { Pilar } from "@/types/database"
import { PilarClient } from "./pilar-client"

export default async function PilarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Get pilar
  const { data: pilar, error: pilarErr } = await supabase
    .from("pilares")
    .select("*")
    .eq("id", id)
    .single()

  if (pilarErr || !pilar) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-slate-900">Pilar</h1>
        <p className="mt-2 text-red-500">
          Error: {pilarErr?.message ?? "Pilar no encontrado"}
        </p>
      </div>
    )
  }

  // Get gestion data grouped by categoria
  const gestionResult = await getPilarGestion(id)

  if ("error" in gestionResult) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-slate-900">{(pilar as Pilar).nombre}</h1>
        <p className="mt-2 text-red-500">Error: {gestionResult.error}</p>
      </div>
    )
  }

  return (
    <PilarClient
      pilar={pilar as Pilar}
      categorias={gestionResult.data}
    />
  )
}
