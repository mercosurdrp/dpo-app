import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getMesesDisponibles, getQuiebresMes } from "@/actions/quiebres-stock"
import { QuiebresStockClient } from "./quiebres-stock-client"

export default async function QuiebresStockPage() {
  const mesesRes = await getMesesDisponibles()
  const meses = "data" in mesesRes ? mesesRes.data : []
  // Arranca en el último mes con venta cargada, no en el mes en curso: el mes
  // en curso siempre muestra rachas abiertas que todavía no son quiebre.
  const inicio = meses[0]

  const res = inicio
    ? await getQuiebresMes({ anio: inicio.anio, mes: inicio.mes })
    : { error: "No hay ventas por SKU cargadas todavía." }

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
          <h1 className="text-2xl font-bold text-slate-900">Quiebres de Stock</h1>
          <p className="mt-2 text-red-500">Error: {res.error}</p>
        </div>
      ) : (
        <QuiebresStockClient inicial={res.data} meses={meses} />
      )}
    </div>
  )
}
