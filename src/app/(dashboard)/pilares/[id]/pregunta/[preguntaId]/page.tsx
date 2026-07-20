import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { getPreguntaGestion } from "@/actions/gestion"
import { getArchivos } from "@/actions/dpo-evidencia"
import { getCapacitacionesForPregunta } from "@/actions/capacitaciones"
import { getOwdTemplateByPregunta, getOwdKpis } from "@/actions/owd"
import {
  getCoberturaVentanasHorarias,
  PREGUNTA_44_ID,
} from "@/actions/ventanas-horarias"
import {
  getOperadoresParaAsignar,
  getPermisoCrearTareas,
} from "@/actions/tareas-directas"
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

  // Get pregunta with all gestion data + linked capacitaciones + operadores
  const [result, capsResult, operadores, puedeCrearTareas] = await Promise.all([
    getPreguntaGestion(preguntaId),
    getCapacitacionesForPregunta(preguntaId),
    getOperadoresParaAsignar(),
    getPermisoCrearTareas(),
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

  // OWD del punto (plantilla + KPIs) + rol para el tab OWD
  const profile = await requireAuth()
  const owdTplRes = await getOwdTemplateByPregunta(preguntaId)
  const owdTemplate = "data" in owdTplRes ? owdTplRes.data : null
  const owdKpisRes = owdTemplate ? await getOwdKpis(owdTemplate.id) : null
  const owdKpis = owdKpisRes && "data" in owdKpisRes ? owdKpisRes.data : null

  // Entrega 4.4 "Entregas On Time": el R4.4.2/R4.4.3 se evidencian con el
  // relevamiento trimestral de ventanas horarias, que vive en la base del
  // dashboard Mercosur. Sólo se consulta en ese punto para no pagar la latencia
  // de la Railway en el resto de los puntos.
  const esPunto44 = preguntaId === PREGUNTA_44_ID
  const vhRes = esPunto44 ? await getCoberturaVentanasHorarias() : null
  const coberturaVh = vhRes && "data" in vhRes ? vhRes.data : null
  const coberturaVhError = vhRes && "error" in vhRes ? vhRes.error : null

  return (
    <PreguntaGestionClient
      pilar={pilar as Pilar}
      pregunta={result.data}
      capacitaciones={capacitaciones}
      archivos={archivos}
      operadores={operadores}
      puedeCrearTareas={puedeCrearTareas}
      owdTemplate={owdTemplate}
      owdKpis={owdKpis}
      isAdmin={profile.role === "admin"}
      mostrarVentanasHorarias={esPunto44}
      coberturaVh={coberturaVh}
      coberturaVhError={coberturaVhError}
    />
  )
}
