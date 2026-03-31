import {
  getCapacitacionPreguntas,
  getMisRespuestas,
  getCapacitacion,
  getMyEmpleado,
} from "@/actions/capacitaciones"
import { ExamenClient } from "./examen-client"

export default async function ExamenPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [capResult, pregResult, respResult, empResult] = await Promise.all([
    getCapacitacion(id),
    getCapacitacionPreguntas(id),
    getMisRespuestas(id),
    getMyEmpleado(),
  ])

  if ("error" in capResult) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Examen</h1>
        <p className="mt-2 text-red-500">Error: {capResult.error}</p>
      </div>
    )
  }

  const preguntas = "error" in pregResult ? [] : pregResult.data
  const misRespuestas = "error" in respResult ? [] : respResult.data
  const empleado = "error" in empResult ? null : empResult.data

  // Find my asistencia
  const miAsistencia = empleado
    ? capResult.data.asistencias.find((a) => a.empleado_id === empleado.id)
    : null

  return (
    <ExamenClient
      capacitacion={capResult.data}
      preguntas={preguntas}
      misRespuestas={misRespuestas}
      asistencia={miAsistencia ?? null}
    />
  )
}
