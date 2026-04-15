import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSkapMatriz, getEmpleadosActivos } from "@/actions/sop-certificaciones"
import { getProfile } from "@/lib/session"
import { MatrizSkapClient } from "./matriz-skap-client"

export default async function MatrizSkapPage({
  searchParams,
}: {
  searchParams: Promise<{ sop?: string }>
}) {
  const params = await searchParams
  const sop = params.sop ?? "1.1"
  const [res, empRes, profile] = await Promise.all([
    getSkapMatriz(sop),
    getEmpleadosActivos(),
    getProfile(),
  ])

  if ("error" in res) {
    return (
      <div>
        <Link
          href="/capacitaciones"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <h1 className="text-2xl font-bold">Matriz SKAP</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  const empleados = "error" in empRes ? [] : empRes.data
  const isAdmin = profile?.role === "admin"

  return (
    <div className="space-y-4">
      <Link
        href="/capacitaciones"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Volver a Capacitaciones
      </Link>
      <MatrizSkapClient
        matriz={res.data}
        sopCodigo={sop}
        empleados={empleados}
        isAdmin={isAdmin}
      />
    </div>
  )
}
