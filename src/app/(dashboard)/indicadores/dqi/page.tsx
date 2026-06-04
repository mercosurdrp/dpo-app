import { getDqi } from "@/actions/dqi"
import { DqiClient } from "./dqi-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function DqiPage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const res = await getDqi(year, month)

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      {"error" in res ? (
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            DQI · Calidad de entrega
          </h1>
          <p className="mt-2 text-red-500">Error: {res.error}</p>
        </div>
      ) : (
        <DqiClient initial={res.data} initialYear={year} initialMonth={month} />
      )}
    </div>
  )
}
