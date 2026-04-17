import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getProfile } from "@/lib/session"
import {
  getPeriodoActual,
  getS5KpisMes,
  getS5TendenciaMensual,
  getS5Ranking,
  getS5TopItemsCriticos,
} from "@/actions/s5"
import type { S5Tipo } from "@/types/database"
import { IndicadoresClient } from "./indicadores-client"

export default async function IndicadoresS5Page({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const profile = await getProfile()

  if (!profile) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Indicadores 5S</h1>
        <p className="mt-2 text-red-500">No se pudo cargar tu perfil.</p>
      </div>
    )
  }

  const sp = await searchParams
  const tipoInicial: S5Tipo =
    sp.tipo === "almacen" ? "almacen" : "flota"

  const periodoActual = await getPeriodoActual()

  const [kpis, tendencia, ranking, criticos] = await Promise.all([
    getS5KpisMes(tipoInicial, periodoActual),
    getS5TendenciaMensual(tipoInicial, periodoActual, 12),
    getS5Ranking(tipoInicial, periodoActual),
    getS5TopItemsCriticos(tipoInicial, periodoActual, 5),
  ])

  return (
    <div className="space-y-4">
      <Link
        href={`/5s?tipo=${tipoInicial}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a 5S
      </Link>
      <IndicadoresClient
        tipoInicial={tipoInicial}
        periodoInicial={periodoActual}
        kpisInicial={"error" in kpis ? null : kpis.data}
        tendenciaInicial={"error" in tendencia ? [] : tendencia.data}
        rankingInicial={"error" in ranking ? [] : ranking.data}
        criticosInicial={"error" in criticos ? [] : criticos.data}
      />
    </div>
  )
}
