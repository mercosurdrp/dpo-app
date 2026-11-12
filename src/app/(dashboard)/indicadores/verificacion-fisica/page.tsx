import { getTiKpis, getTiPlanesDesvio } from "@/actions/tiempo-interno"
import { TiempoInternoClient } from "../tiempo-interno/tiempo-interno-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

// Verificación física (SOP 1.3 Post-Ruta): la parte del Tiempo Interno que
// hace el ayudante — descarga, control de envases, estacionamiento, limpieza y
// checklist de retorno —, desde la llegada del camión al CD hasta el fichaje
// de salida de cada ayudante. Mismo cálculo y misma pantalla que el TI del
// chofer (cierre financiero), con `rol: "ayudante"`.
const MIN_TI_OPERATIVO = 10

export default async function VerificacionFisicaPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>
}) {
  const sp = await searchParams
  const minTiMinutos = sp.min === String(MIN_TI_OPERATIVO) ? MIN_TI_OPERATIVO : 0

  const [kpisRes, planesDesvioRes] = await Promise.all([
    getTiKpis({ minTiMinutos, rol: "ayudante" }),
    getTiPlanesDesvio("vf_desvio"),
  ])

  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Verificación física</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const planesDesvio = "data" in planesDesvioRes ? planesDesvioRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <TiempoInternoClient kpis={kpisRes.data} planesResumen={[]} planesDesvio={planesDesvio} />
    </div>
  )
}
