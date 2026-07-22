"use client"

// Vista del EMPLEADO — mobile-first (R2.1.3/R2.1.4): sus horas extras del mes
// (al 50% y al 100% por separado) y los bultos de su camión, sin pedirle nada
// a nadie.

import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Clock, Package, Trophy, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { OBJETIVO_VISIBILIDAD } from "@/lib/visibilidad/objetivos"
import { MisHabilidadesCard } from "./mis-habilidades-card"
import type { VisibilidadEmpleadoData, VisibilidadDia } from "@/actions/visibilidad-resultados"
import type { SkapEmpleadoData } from "@/types/database"

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function nombreMesLargo(mes: string): string {
  const [a, m] = mes.split("-")
  return `${NOMBRES_MES[Number(m) - 1]} ${a}`
}

const fmtHs = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const fmtInt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })

function Delta({ actual, anterior, unidad }: { actual: number; anterior: number; unidad: string }) {
  if (anterior <= 0) return null
  const dif = actual - anterior
  if (dif === 0) return null
  const Icono = dif > 0 ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${dif > 0 ? "text-emerald-600" : "text-slate-500"}`}>
      <Icono className="size-3.5" />
      {dif > 0 ? "+" : "−"}{fmtHs(Math.abs(dif))} {unidad} vs mes anterior
    </span>
  )
}

export function VisibilidadEmpleadoClient({
  data,
  skap,
}: {
  data: VisibilidadEmpleadoData
  skap?: SkapEmpleadoData | null
}) {
  const router = useRouter()
  const { mes, meses_disponibles, hhee, bultos, dias } = data
  const idx = meses_disponibles.indexOf(mes)
  const objetivo = OBJETIVO_VISIBILIDAD

  const irA = (m: string) => router.push(`/visibilidad-resultados?mes=${m}`)

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {/* Header + selector de mes */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mis Resultados</h1>
          <p className="text-sm text-muted-foreground">
            {data.empleado.nombre} · Legajo {data.empleado.legajo}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-white px-2 py-1.5">
        <button
          onClick={() => idx > 0 && irA(meses_disponibles[idx - 1])}
          disabled={idx <= 0}
          className="rounded-md p-2 text-slate-600 disabled:opacity-30"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-sm font-semibold text-slate-800">{nombreMesLargo(mes)}</span>
        <button
          onClick={() => idx >= 0 && idx < meses_disponibles.length - 1 && irA(meses_disponibles[idx + 1])}
          disabled={idx < 0 || idx >= meses_disponibles.length - 1}
          className="rounded-md p-2 text-slate-600 disabled:opacity-30"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Horas extras */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-5 text-blue-600" /> Horas extras del mes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold tabular-nums text-slate-900">
              {fmtHs(hhee.total)}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">hs acumuladas</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-lg font-semibold tabular-nums text-slate-800">{fmtHs(hhee.hs_50)} hs</p>
              <p className="text-xs text-muted-foreground">al 50% (lun a vie)</p>
            </div>
            <div className="rounded-lg bg-violet-50 p-3">
              <p className="text-lg font-semibold tabular-nums text-violet-800">{fmtHs(hhee.hs_100)} hs</p>
              <p className="text-xs text-muted-foreground">al 100% (sábados)</p>
            </div>
          </div>
          <Delta actual={hhee.total} anterior={hhee.total_mes_anterior} unidad="hs" />
        </CardContent>
      </Card>

      {/* Bultos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="size-5 text-emerald-600" /> Bultos de tu camión
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bultos.vinculado ? (
            <>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tabular-nums text-slate-900">
                  {fmtInt(bultos.total_mes)}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">bultos en el mes</span>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{fmtInt(bultos.promedio_dia)} bultos/día</span>
                <span>{bultos.dias_con_entrega} días con reparto</span>
              </div>
              {objetivo.objetivo_bultos_mes && objetivo.objetivo_bultos_mes > 0 && (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (bultos.total_mes / objetivo.objetivo_bultos_mes) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Objetivo del mes: {fmtInt(objetivo.objetivo_bultos_mes)} bultos
                  </p>
                </div>
              )}
              <Delta actual={bultos.total_mes} anterior={bultos.total_mes_anterior} unidad="bultos" />
            </>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              Tu usuario todavía no está vinculado a un camión — pedile a tu
              supervisor que te vincule para ver tus bultos.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Matriz de habilidades (SKAP) — cómo lo evaluó su supervisor */}
      {skap && <MisHabilidadesCard data={skap} />}

      {/* Incentivo / cómo se calcula */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-5 text-amber-500" /> {objetivo.titulo}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-slate-600">{objetivo.descripcion}</p>
        </CardContent>
      </Card>

      {/* Historial diario */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Día por día</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {dias.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">Sin actividad registrada este mes.</p>
          )}
          {dias.map((d) => (
            <DiaRow key={d.fecha} dia={d} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function DiaRow({ dia }: { dia: VisibilidadDia }) {
  const fecha = new Date(`${dia.fecha}T00:00:00-03:00`)
  const label = fecha.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
  const extras = dia.hs_50 + dia.hs_100
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium capitalize text-slate-800">{label}</p>
        <p className="text-xs text-muted-foreground">
          {dia.salida ? `Salida ${dia.salida}` : "Sin fichada de salida"}
          {dia.bultos > 0 ? ` · ${dia.bultos.toLocaleString("es-AR")} bultos` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {dia.tipo === "sabado" && dia.hs_100 > 0 && (
          <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">
            +{fmtHs(dia.hs_100)} hs al 100%
          </Badge>
        )}
        {dia.tipo !== "sabado" && dia.hs_50 > 0 && (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            +{fmtHs(dia.hs_50)} hs al 50%
          </Badge>
        )}
        {dia.tipo === "sin_salida" && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">sin salida</Badge>
        )}
        {dia.tipo === "revisar" && (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">revisar</Badge>
        )}
        {dia.tipo === "normal" && extras === 0 && dia.salida && (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
    </div>
  )
}
