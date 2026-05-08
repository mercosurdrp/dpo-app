import { createClient } from "@/lib/supabase/server"
import { getPreguntaGestion } from "@/actions/gestion"
import { getArchivos } from "@/actions/dpo-evidencia"
import { getCapacitacionesForPregunta } from "@/actions/capacitaciones"
import type { Pilar } from "@/types/database"
import { PreguntaGestionClient } from "./pregunta-gestion-client"

function pilarSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

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

  // Get pregunta with all gestion data + linked capacitaciones
  const [result, capsResult] = await Promise.all([
    getPreguntaGestion(preguntaId),
    getCapacitacionesForPregunta(preguntaId),
  ])

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  // Fetch archivos DPO subidos para este punto
  const archivosRes = await getArchivos({
    pilar_codigo: pilarSlug((pilar as Pilar).nombre),
    punto_codigo: result.data.numero,
    archivado: false,
  })
  const archivos = "data" in archivosRes ? archivosRes.data : []

  const capacitaciones = "error" in capsResult ? [] : capsResult.data

  return (
    <PreguntaGestionClient
      pilar={pilar as Pilar}
      pregunta={result.data}
      capacitaciones={capacitaciones}
      archivos={archivos}
    />
  )
}
