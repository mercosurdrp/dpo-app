import { createClient } from "@/lib/supabase/server"
import type { Pilar } from "@/types/database"
import { GestionClient } from "./gestion-client"

export default async function PilarGestionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: pilarId } = await params
  const supabase = await createClient()

  const { data: pilar, error } = await supabase
    .from("pilares")
    .select("*")
    .eq("id", pilarId)
    .single()

  if (error || !pilar) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-500">
          Error: {error?.message ?? "Pilar no encontrado"}
        </p>
      </div>
    )
  }

  return <GestionClient pilar={pilar as Pilar} />
}
