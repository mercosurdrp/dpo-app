import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getMiEmpleado } from "@/lib/session"
import { getMiRanking5S } from "@/actions/s5-deposito"
import { getMiRanking3RDistribucion } from "@/actions/tres-r-distribucion"
import { MiRanking5SClient } from "./mi-ranking-5s-client"
import { MiRanking3RDistribucionClient } from "./mi-ranking-3r-distribucion-client"

// "Ranking 3R" — el ranking del bimestre EN CURSO, para que el personal vea
// cómo va: Depósito ve el de ayudantes de depósito y Distribución el de
// choferes y ayudantes. La gestión puede elegir con ?area=deposito|distribucion.
// La gestión (podio, premios, raspones, fórmula) sigue en /5s/ayudantes.

export const dynamic = "force-dynamic"

export default async function MiRanking5SPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>
}) {
  await requireModuloPortal("ranking-5s")
  const { area } = await searchParams
  const sector = (await getMiEmpleado())?.sector
  const distribucion = area === "distribucion" || (area !== "deposito" && sector === "Distribución")

  if (distribucion) {
    const r = await getMiRanking3RDistribucion()
    if ("error" in r) {
      return (
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="text-lg font-semibold text-slate-800">Ranking 3R</p>
          <p className="mt-2 text-sm text-muted-foreground">{r.error}</p>
        </div>
      )
    }
    return <MiRanking3RDistribucionClient data={r.data} />
  }

  const res = await getMiRanking5S()

  if ("error" in res) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-semibold text-slate-800">Ranking 3R</p>
        <p className="mt-2 text-sm text-muted-foreground">{res.error}</p>
      </div>
    )
  }

  return <MiRanking5SClient data={res.data} />
}
