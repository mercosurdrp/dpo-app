import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { IS_MISIONES } from "@/lib/empresa"
import {
  getTerritorio,
  getEscenarios,
  listarPlanesTerritoriales,
  listarRevisiones,
} from "@/actions/plan-territorial"
import { getRuteroVigente, type RuteroVigente } from "@/actions/territorial-rutero"
import { PlanTerritorialClient } from "./plan-territorial-client"

export const dynamic = "force-dynamic"

// Plan Territorial — DPO Pilar Planeamiento, punto 5.1.
//
// Misiones tiene su propia versión (motor de re-zonificación por k-means) en el
// repo dpo-distribuciones; esta es la de Pampeana y ataca otras palancas:
// frecuencia, drop size y relocalización del CD.
export default async function PlanTerritorialPage() {
  if (IS_MISIONES) notFound()
  const profile = await requireAuth()

  const anio = new Date().getFullYear()
  const supabase = await createClient()

  const [territorio, escenarios, planes, revisiones, perfilesRes] =
    await Promise.all([
      getTerritorio(anio),
      getEscenarios(anio),
      listarPlanesTerritoriales(),
      listarRevisiones(anio),
      supabase
        .from("profiles")
        .select("id, nombre")
        .order("nombre", { ascending: true }),
    ])

  // Rutero vigente de promotores (base comercial) para cada ciudad con plan:
  // es el "después" vivo del rediseño de rutas. Una consulta por ciudad, no
  // por plan, y si la base comercial no contesta la página igual se muestra.
  const planesData = "data" in planes ? planes.data : []
  const ciudadesConPlan = [...new Set(planesData.map((p) => p.ciudad))]
  const ruteros: Record<string, RuteroVigente | null> = {}
  await Promise.all(
    ciudadesConPlan.map(async (c) => {
      ruteros[c] = await getRuteroVigente(c)
    }),
  )

  return (
    <PlanTerritorialClient
      anio={anio}
      rol={profile.role}
      territorio={"data" in territorio ? territorio.data : null}
      territorioError={"error" in territorio ? territorio.error : null}
      escenarios={"data" in escenarios ? escenarios.data : []}
      planes={planesData}
      ruteros={ruteros}
      revisiones={"data" in revisiones ? revisiones.data : []}
      perfiles={
        (perfilesRes.data ?? []) as Array<{ id: string; nombre: string }>
      }
    />
  )
}
