import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getChoferesResumenMes } from "@/actions/choferes"
import { ChoferesRankingClient } from "./choferes-ranking-client"

export const dynamic = "force-dynamic"

function parseRango(
  sp: Record<string, string | string[] | undefined>,
): { desde: string; hasta: string } {
  const ahora = new Date()
  const y = ahora.getUTCFullYear()
  const m = String(ahora.getUTCMonth() + 1).padStart(2, "0")
  const ultimoDia = new Date(Date.UTC(y, ahora.getUTCMonth() + 1, 0)).getUTCDate()
  const defaultDesde = `${y}-${m}-01`
  const defaultHasta = `${y}-${m}-${String(ultimoDia).padStart(2, "0")}`
  const isoRe = /^\d{4}-\d{2}-\d{2}$/
  const desdeRaw = typeof sp.desde === "string" ? sp.desde : undefined
  const hastaRaw = typeof sp.hasta === "string" ? sp.hasta : undefined
  const desde = desdeRaw && isoRe.test(desdeRaw) ? desdeRaw : defaultDesde
  const hasta = hastaRaw && isoRe.test(hastaRaw) ? hastaRaw : defaultHasta
  if (desde > hasta) {
    return { desde: defaultDesde, hasta: defaultHasta }
  }
  return { desde, hasta }
}

export default async function ChoferesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const { desde, hasta } = parseRango(sp)
  const res = await getChoferesResumenMes(desde, hasta)

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      {"error" in res ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h1 className="text-lg font-semibold text-red-900">
            No se pudo cargar el ranking de choferes
          </h1>
          <p className="mt-1 text-sm text-red-700">{res.error}</p>
        </div>
      ) : (
        <ChoferesRankingClient data={res.data} desde={desde} hasta={hasta} />
      )}
    </div>
  )
}
