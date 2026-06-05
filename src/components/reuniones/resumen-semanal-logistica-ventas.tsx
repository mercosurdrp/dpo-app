"use client"

import { Fragment, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, CalendarRange } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getResumenSemanalLogisticaVentas } from "@/actions/reuniones"

type Indicador = {
  key: string
  nombre: string
  unidad: string
  resumen: number | null
  meta: number | null
  mejor_si: "mayor" | "menor" | null
  dias: Record<string, number | null>
}

type Data = {
  semana: { desde: string; hasta: string }
  fechas: string[]
  indicadores: Indicador[]
}

type Sucursal = "todo" | "eldorado" | "iguazu"

function fmtValor(v: number | null, unidad: string): string {
  if (v == null || !Number.isFinite(v)) return "—"
  if (unidad === "bultos") return Math.round(v).toLocaleString("es-AR")
  if (unidad === "%") return `${v.toFixed(1)}%`
  if (unidad === "min") return `${v.toFixed(0)} min`
  return String(v)
}

function fmtFechaCorta(iso: string): string {
  const partes = iso.split("-")
  return `${partes[2]}/${partes[1]}`
}

function diaSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][dt.getUTCDay()]
}

export function ResumenSemanalLogisticaVentas({
  reunionId,
  sucursal = "todo",
}: {
  reunionId: string
  sucursal?: Sucursal
}) {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  useEffect(() => {
    let activo = true
    setCargando(true)
    getResumenSemanalLogisticaVentas(reunionId, { sucursal }).then((res) => {
      if (!activo) return
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setData(res.data)
        setError(null)
      }
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [reunionId, sucursal])

  function toggle(key: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="size-5 text-violet-600" />
          Resumen de la semana anterior
          {data && (
            <span className="text-sm font-normal text-muted-foreground">
              ({fmtFechaCorta(data.semana.desde)} al {fmtFechaCorta(data.semana.hasta)})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : error ? (
          <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2 text-left font-semibold">Indicador</th>
                  <th className="px-2 py-2 text-right font-semibold">Resumen semana</th>
                  <th className="w-8 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.indicadores.map((ind) => {
                  const abierto = expandidos.has(ind.key)
                  return (
                    <Fragment key={ind.key}>
                      <tr
                        className="cursor-pointer border-b hover:bg-slate-50"
                        onClick={() => toggle(ind.key)}
                      >
                        <td className="py-2 pr-2 font-medium text-slate-800">
                          {ind.nombre}
                          <span className="ml-1 text-xs text-slate-400">
                            ({ind.unidad})
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {fmtValor(ind.resumen, ind.unidad)}
                        </td>
                        <td className="py-2 text-slate-400">
                          {abierto ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </td>
                      </tr>
                      {abierto && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={3} className="px-2 py-2">
                            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-7">
                              {data.fechas.map((f) => (
                                <div
                                  key={f}
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-center"
                                >
                                  <div className="text-[10px] uppercase text-slate-400">
                                    {diaSemana(f)} {fmtFechaCorta(f)}
                                  </div>
                                  <div className="text-xs font-semibold tabular-nums text-slate-700">
                                    {fmtValor(ind.dias[f] ?? null, ind.unidad)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
