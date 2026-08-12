import { getClimaAnalisis } from "@/actions/clima"
import { listarPlanesClima } from "@/actions/clima-planes"
import { listResponsablesPosibles } from "@/actions/reuniones"
import { requireAuth } from "@/lib/session"
import { EMPRESA_NOMBRE } from "@/lib/empresa"
import { ClimaClient } from "./_components/clima-client"

export const dynamic = "force-dynamic"

export default async function ClimaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireAuth()
  const sp = await searchParams
  const olaId = typeof sp.ola === "string" ? sp.ola : undefined

  const [analisis, planes, responsables] = await Promise.all([
    getClimaAnalisis(olaId),
    listarPlanesClima(),
    listResponsablesPosibles(),
  ])

  if ("error" in analisis) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h1 className="text-lg font-semibold text-red-900">
          No se pudo cargar la Encuesta de Clima
        </h1>
        <p className="mt-1 text-sm text-red-700">{analisis.error}</p>
      </div>
    )
  }

  return (
    <ClimaClient
      empresa={EMPRESA_NOMBRE}
      analisis={analisis.data}
      planes={"error" in planes ? [] : planes.data}
      responsables={"error" in responsables ? [] : responsables.data}
      role={profile.role}
    />
  )
}
