import { getOBKpis, getOBViajes, getOBPorPatente, getOBPorDia, getOBPorMes, getPatentesDisponibles } from "@/actions/ocupacion-bodega"
import { OcupacionBodegaClient } from "./ocupacion-bodega-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function OcupacionBodegaPage() {
  const [kpisRes, viajesRes, patentesRes, diasRes, mesesRes, patListRes] = await Promise.all([
    getOBKpis(),
    getOBViajes({ limit: 200 }),
    getOBPorPatente(),
    getOBPorDia(),
    getOBPorMes({ meses: 12 }),
    getPatentesDisponibles(),
  ])

  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ocupación de Bodega</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href="/indicadores" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <OcupacionBodegaClient
        kpis={kpisRes.data}
        viajes={"data" in viajesRes ? viajesRes.data : []}
        porPatente={"data" in patentesRes ? patentesRes.data : []}
        porDia={"data" in diasRes ? diasRes.data : []}
        porMes={"data" in mesesRes ? mesesRes.data : []}
        patentes={"data" in patListRes ? patListRes.data : []}
      />
    </div>
  )
}
