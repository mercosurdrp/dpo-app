import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getRechazosComparado } from "@/actions/rechazos-v2"
import { parseRechazosSearchParams } from "@/lib/rechazos/search-params"
import { DashboardClient } from "./_components/dashboard-client"

export const dynamic = "force-dynamic"

export default async function RechazosV2Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const request = parseRechazosSearchParams(sp)
  const result = await getRechazosComparado(request)

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h1 className="text-lg font-semibold text-red-900">No se pudo cargar el dashboard de rechazos</h1>
          <p className="mt-1 text-sm text-red-700">{result.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <DashboardClient data={result.data} />
    </div>
  )
}
