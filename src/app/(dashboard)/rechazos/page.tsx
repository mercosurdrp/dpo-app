import {
  getRechazosRankingEmpleado,
  type PeriodoKey,
} from "@/actions/rechazos-empleado"
import { RechazosEmpleadoClient } from "./_components/rechazos-empleado-client"

export const dynamic = "force-dynamic"

const PERIODOS_VALIDOS: PeriodoKey[] = ["mes", "mes_pasado", "semana"]

export default async function RechazosEmpleadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const raw = typeof sp.periodo === "string" ? sp.periodo : "mes"
  const periodo: PeriodoKey = PERIODOS_VALIDOS.includes(raw as PeriodoKey)
    ? (raw as PeriodoKey)
    : "mes"

  const result = await getRechazosRankingEmpleado(periodo)

  if ("error" in result) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h1 className="text-lg font-semibold text-red-900">No se pudieron cargar los rechazos</h1>
        <p className="mt-1 text-sm text-red-700">{result.error}</p>
      </div>
    )
  }

  return <RechazosEmpleadoClient data={result.data} />
}
