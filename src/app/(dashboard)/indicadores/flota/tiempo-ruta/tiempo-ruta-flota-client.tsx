"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getTiempoRutaFlota,
  TIEMPO_RUTA_GATILLO,
  TIEMPO_RUTA_META,
  type TiempoRutaResumen,
} from "@/actions/tiempo-ruta-flota"
import { estadoSemaforo } from "@/lib/sueno/semaforo"

const MES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

const fmt = (n: number, dec = 2) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n)

/** 7,05 hs → "7h 03m", que es como se lee un tiempo de ruta. */
const hhmm = (horas: number) => {
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  return `${h}h ${String(m).padStart(2, "0")}m`
}

const color = (horas: number | null) => {
  const e = estadoSemaforo(horas, TIEMPO_RUTA_META, TIEMPO_RUTA_GATILLO, "menor")
  if (e === "verde") return "text-emerald-600"
  if (e === "amarillo") return "text-amber-600"
  if (e === "rojo") return "text-red-600"
  return "text-slate-900"
}

export function TiempoRutaFlotaClient({ anio }: { anio: number }) {
  const [data, setData] = useState<TiempoRutaResumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    getTiempoRutaFlota(anio).then((r) => {
      if (!vivo) return
      if ("error" in r) setError(r.error)
      else setData(r.data)
      setCargando(false)
    })
    return () => {
      vivo = false
    }
  }, [anio])

  if (cargando) return <p className="text-sm text-muted-foreground">Calculando…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!data) return null

  const totalRutas = data.rutas + data.descartadas

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 pt-6">
          <div className="rounded-xl bg-purple-100 p-3 text-purple-600">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Promedio {data.anio}
            </p>
            <p className={`text-3xl font-bold ${color(data.ytd)}`}>
              {data.ytd == null ? "—" : hhmm(data.ytd)}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.ytd == null ? "" : `${fmt(data.ytd)} hs · `}meta {TIEMPO_RUTA_META} hs
            </p>
          </div>
          <div className="border-l pl-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Rutas limpias</p>
            <p className="text-2xl font-semibold text-slate-900">{data.rutas}</p>
            <p className="text-xs text-muted-foreground">de {totalRutas} rutas de Foxtrot</p>
          </div>
          <div className="border-l pl-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Descartadas</p>
            <p className="text-2xl font-semibold text-slate-900">{data.descartadas}</p>
            <p className="text-xs text-muted-foreground">no se cerraron en el día</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mes a mes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Mes</th>
                  <th className="py-2 pr-4 text-right font-medium">Promedio</th>
                  <th className="py-2 pr-4 text-right font-medium">Horas</th>
                  <th className="py-2 text-right font-medium">Rutas limpias</th>
                </tr>
              </thead>
              <tbody>
                {data.meses.map((m) => (
                  <tr key={m.mes} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium text-slate-900">{MES[m.mes - 1]}</td>
                    <td className={`py-2 pr-4 text-right font-semibold ${color(m.horas)}`}>
                      {hhmm(m.horas)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {fmt(m.horas)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{m.rutas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Solo cuentan las <strong>rutas limpias</strong>: las que Foxtrot cerró el mismo día que
          arrancaron. Cuando el chofer no finaliza la ruta en la app, Foxtrot la cierra horas o días
          después y esa duración deja de ser tiempo de trabajo — tomando todas, enero daría 11h 48m
          de promedio. El promedio es <strong>ponderado</strong> (suma de minutos ÷ suma de rutas),
          así una salida pesa igual venga de la ciudad que venga. Es el mismo número que publica el
          nodo <strong>Tiempo en Ruta</strong> del Árbol del Sueño.
        </p>
      </div>
    </div>
  )
}
