import { createClient } from "@/lib/supabase/server"
import { getRespuestasPilar } from "@/actions/respuestas"
import type { Pilar, Auditoria } from "@/types/database"
import { PilarChecklistClient } from "./pilar-checklist-client"

export default async function PilarChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: pilarId } = await params
  const supabase = await createClient()

  // Fetch pilar info
  const { data: pilar, error: pilarError } = await supabase
    .from("pilares")
    .select("*")
    .eq("id", pilarId)
    .single()

  if (pilarError || !pilar) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-500">
          Error: {pilarError?.message ?? "Pilar no encontrado"}
        </p>
      </div>
    )
  }

  // Fetch latest audit
  const { data: auditoria } = await supabase
    .from("auditorias")
    .select("*")
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .single()

  if (!auditoria) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-lg font-medium text-slate-700">
          No hay auditorias creadas
        </p>
        <p className="text-sm text-muted-foreground">
          Crea tu primera auditoria para empezar a puntuar este pilar.
        </p>
        <a
          href="/auditorias/nueva"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Crear Auditoria
        </a>
      </div>
    )
  }

  const aud = auditoria as Auditoria

  // Fetch all pilares for navigation
  const { data: allPilares } = await supabase
    .from("pilares")
    .select("id, nombre, orden")
    .order("orden")

  // Fetch bloques with preguntas + respuestas
  const result = await getRespuestasPilar(aud.id, pilarId)

  if ("error" in result) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <PilarChecklistClient
      auditoriaId={aud.id}
      auditoriaNombre={aud.nombre}
      pilar={pilar as Pilar}
      allPilares={(allPilares ?? []) as Pick<Pilar, "id" | "nombre" | "orden">[]}
      bloques={result.data.bloques}
    />
  )
}
