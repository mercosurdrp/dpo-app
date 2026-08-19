import { getHuellaAnual, getHuellaMetaPlanes } from "@/actions/huella"
import { requireAuth } from "@/lib/session"
import { HuellaClient } from "./_components/huella-client"

export const dynamic = "force-dynamic"

export default async function HuellaCarbonoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireAuth()
  const sp = await searchParams
  const anio = Number(typeof sp.anio === "string" ? sp.anio : "") || new Date().getFullYear()

  const [res, metaPlanes] = await Promise.all([getHuellaAnual(anio), getHuellaMetaPlanes(anio)])
  if ("error" in res) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h1 className="text-lg font-semibold text-red-900">
          No se pudo calcular la huella de carbono
        </h1>
        <p className="mt-1 text-sm text-red-700">{res.error}</p>
      </div>
    )
  }

  return (
    <HuellaClient
      huella={res.data}
      role={profile.role}
      meta={"error" in metaPlanes ? null : metaPlanes.data.meta}
      planes={"error" in metaPlanes ? [] : metaPlanes.data.planes}
    />
  )
}
