import { listBenchs, puedeEditarBenchmarking } from "@/actions/benchmarking"
import { IS_MISIONES } from "@/lib/empresa"
import { BenchmarkingClient } from "./benchmarking-client"

export const dynamic = "force-dynamic"

export default async function BenchmarkingPage() {
  const [benchsRes, puedeEditar] = await Promise.all([listBenchs(), puedeEditarBenchmarking()])

  if ("error" in benchsRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Benchmarking</h1>
        <p className="mt-2 text-red-500">Error: {benchsRes.error}</p>
        <p className="mt-2 text-sm text-slate-500">
          Si es la primera vez, falta aplicar la migración <code>20261103120000_benchmarking.sql</code>.
        </p>
      </div>
    )
  }

  return (
    <BenchmarkingClient
      benchs={benchsRes.data}
      puedeEditar={puedeEditar}
      conCuadro={!IS_MISIONES}
    />
  )
}
