import { createClient } from "@/lib/supabase/server"
import type { Pilar } from "@/types/database"
import { PilarLayoutClient } from "./pilar-layout-client"

export default async function PilarLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: pilar, error } = await supabase
    .from("pilares")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !pilar) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pilar</h1>
        <p className="mt-2 text-red-500">
          Error: {error?.message ?? "Pilar no encontrado"}
        </p>
      </div>
    )
  }

  return (
    <PilarLayoutClient pilar={pilar as Pilar}>
      {children}
    </PilarLayoutClient>
  )
}
