import { getCapacitacion, getEmpleados, getCapacitacionPreguntas, getDpoPuntosForCapacitacion, getDpoHierarchy, getIntentosCapacitacion, getRespuestasCapacitacion } from "@/actions/capacitaciones"
import { getProfile } from "@/lib/session"
import { CapacitacionDetailClient } from "./capacitacion-detail-client"

export default async function CapacitacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [result, empleadosResult, preguntasResult, dpoPuntosResult, dpoHierarchyResult, intentosResult, respuestasResult, profile] = await Promise.all([
    getCapacitacion(id),
    getEmpleados(),
    getCapacitacionPreguntas(id),
    getDpoPuntosForCapacitacion(id),
    getDpoHierarchy(),
    getIntentosCapacitacion(id),
    getRespuestasCapacitacion(id),
    getProfile(),
  ])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Capacitacion</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const empleados = "error" in empleadosResult ? [] : empleadosResult.data
  const preguntas = "error" in preguntasResult ? [] : preguntasResult.data
  const dpoPuntos = "error" in dpoPuntosResult ? [] : dpoPuntosResult.data
  const dpoHierarchy = "error" in dpoHierarchyResult ? [] : dpoHierarchyResult.data
  const intentos = "error" in intentosResult ? [] : intentosResult.data
  const respuestas = "error" in respuestasResult ? [] : respuestasResult.data
  const canEdit = profile?.role === "admin" || profile?.role === "auditor"

  return (
    <CapacitacionDetailClient
      capacitacion={result.data}
      empleados={empleados}
      preguntas={preguntas}
      dpoPuntos={dpoPuntos}
      dpoHierarchy={dpoHierarchy}
      intentos={intentos}
      respuestas={respuestas}
      canEdit={canEdit}
    />
  )
}
