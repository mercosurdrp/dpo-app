"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ChevronDown,
  Gauge,
  Target,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { HAY_PAC, META_CUMPLIMIENTO, PAC_2026_ORIGEN, PAC_2026_TOTAL } from "@/lib/pac-2026"
import {
  calcularAdherencia,
  type ItemAdherencia,
} from "@/lib/capacitacion-adherencia"

interface Props {
  capacitaciones: ItemAdherencia[]
  /** YYYY-MM-DD. Se pasa desde el cliente para no depender del huso del server. */
  hoy: string
}

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const METAPCT = Math.round(META_CUMPLIMIENTO * 100)

const VERDE = "#10B981"
const AMARILLO = "#F59E0B"
const ROJO = "#EF4444"

/** Semáforo contra la meta: en meta / cerca (a menos de 20 pts) / lejos. */
function colorSemaforo(pct: number | null): string {
  if (pct === null) return "#94A3B8"
  if (pct >= METAPCT) return VERDE
  if (pct >= METAPCT - 20) return AMARILLO
  return ROJO
}

export function CapacitacionesAdherencia({ capacitaciones, hoy }: Props) {
  const a = useMemo(() => calcularAdherencia(capacitaciones, hoy), [capacitaciones, hoy])

  const [abierto, setAbierto] = useState(true)
  const [verAtrasadas, setVerAtrasadas] = useState(false)
  const [verPilares, setVerPilares] = useState(false)

  if (a.totalAnual === 0) return null

  const colorYtd = colorSemaforo(a.adherenciaYtd)
  const enMeta = a.cumplimientoAnual >= METAPCT

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex items-center gap-2 text-left outline-none"
            title={abierto ? "Ocultar adherencia" : "Ver adherencia"}
          >
            <ChevronDown
              className={`size-4 text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`}
            />
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-slate-400" />
              Adherencia al Cronograma {a.anio}
            </CardTitle>
          </button>
          <Badge
            variant="secondary"
            className="gap-1.5"
            style={{
              backgroundColor: (enMeta ? VERDE : AMARILLO) + "1A",
              color: enMeta ? VERDE : AMARILLO,
            }}
          >
            <Target className="size-3.5" />
            Meta {METAPCT} % a fin de año
          </Badge>
        </div>
      </CardHeader>

      {abierto && (
        <CardContent className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              valor={a.adherenciaYtd === null ? "—" : `${a.adherenciaYtd} %`}
              label="Adherencia YTD"
              detalle={`${a.cumplidasVencidas} de ${a.vencidas} ya vencidas`}
              color={colorYtd}
              destacado
            />
            <button
              type="button"
              onClick={() => setVerAtrasadas((v) => !v)}
              className="text-left outline-none"
              title="Ver las capacitaciones atrasadas"
            >
              <Kpi
                valor={String(a.atrasadas.length)}
                label="Atrasadas"
                detalle={a.atrasadas.length > 0 ? "Vencidas sin cerrar · ver listado" : "Ninguna vencida sin cerrar"}
                color={a.atrasadas.length > 0 ? ROJO : VERDE}
                icono={a.atrasadas.length > 0 ? <AlertTriangle className="size-3.5" /> : undefined}
              />
            </button>
            <Kpi
              valor={`${a.cumplimientoAnual} %`}
              label="Cumplimiento anual"
              detalle={`${a.cumplidasAnual} de ${a.totalAnual} calendarizadas`}
              color={colorSemaforo(a.cumplimientoAnual)}
            />
            <Kpi
              valor={a.faltanParaMeta === 0 ? "✓" : String(a.faltanParaMeta)}
              label={`Faltan para el ${METAPCT} %`}
              detalle={
                a.faltanParaMeta === 0
                  ? "Meta alcanzada"
                  : `${a.ritmoRequerido}/mes hasta ${MESES_CORTOS[a.ultimoMesCalendarizado]}`
              }
              color={a.faltanParaMeta === 0 ? VERDE : "#0EA5E9"}
              icono={<TrendingUp className="size-3.5" />}
            />
          </div>

          {/* Camino a la meta */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">
                Camino al {METAPCT} %: {a.cumplidasAnual} cumplidas de {a.metaCantidad} necesarias
              </span>
              <span className="text-xs text-slate-500">
                {a.margen >= 0 ? (
                  <>
                    Margen: se pueden caer{" "}
                    <span className="font-semibold text-slate-900">{a.margen}</span> de las{" "}
                    {a.totalAnual - a.cumplidasAnual} pendientes
                  </>
                ) : (
                  <span className="font-semibold text-red-600">
                    Meta inalcanzable con lo calendarizado: faltan {-a.margen} fechas
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
              {/* cumplidas sobre el total calendarizado */}
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (a.cumplidasAnual / a.totalAnual) * 100)}%`,
                  backgroundColor: colorSemaforo(a.cumplimientoAnual),
                }}
              />
              {/* marca de la meta */}
              <div
                className="absolute inset-y-0 w-0.5 bg-slate-900"
                style={{ left: `${METAPCT}%` }}
                title={`Meta ${METAPCT} % = ${a.metaCantidad} capacitaciones`}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>0</span>
              <span>{a.totalAnual} calendarizadas</span>
            </div>
          </div>

          {/* Atrasadas */}
          {verAtrasadas && a.atrasadas.length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                Atrasadas — vencidas sin cerrar ({a.atrasadas.length})
              </p>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {a.atrasadas.map((c) => (
                  <Link
                    key={c.id}
                    href={`/capacitaciones/${c.id}`}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-white"
                  >
                    <span className="truncate font-medium text-slate-700">{c.titulo}</span>
                    <span className="flex shrink-0 items-center gap-2 text-slate-500">
                      {c.pilar && <span className="text-slate-400">{c.pilar}</span>}
                      <span>{new Date(c.fecha + "T12:00:00").toLocaleDateString("es-AR")}</span>
                      <span className="font-semibold text-red-600">
                        {diasDeAtraso(c.fecha, hoy)} d
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Avance mes a mes */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Avance mes a mes — plan vs. cumplido
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-2">Mes</th>
                    {HAY_PAC && (
                      <th className="py-1.5 pr-2 text-right" title={`Plan Anual de Capacitación aprobado — ${PAC_2026_ORIGEN}`}>
                        PAC
                      </th>
                    )}
                    <th className="py-1.5 pr-2 text-right">Calend.</th>
                    <th className="py-1.5 pr-2 text-right">Vencidas</th>
                    <th className="py-1.5 pr-2 text-right">Cumplidas</th>
                    <th className="py-1.5 pl-2">Adherencia</th>
                  </tr>
                </thead>
                <tbody>
                  {a.porMes.map((m) => {
                    const color = colorSemaforo(m.adherencia)
                    return (
                      <tr key={m.mes} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-700">
                          {MESES_CORTOS[m.mes]}
                        </td>
                        {HAY_PAC && (
                          <td className="py-1.5 pr-2 text-right text-slate-400">
                            {m.pac || "—"}
                          </td>
                        )}
                        <td className="py-1.5 pr-2 text-right text-slate-600">
                          {m.calendarizadas || "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-slate-600">
                          {m.vencidas || "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">
                          {m.vencidas > 0 ? m.cumplidas : "—"}
                          {m.adelantadas > 0 && (
                            <span
                              className="ml-1 text-xs font-normal text-emerald-600"
                              title="Cumplidas antes de su fecha: no entran en la adherencia todavía"
                            >
                              +{m.adelantadas}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${m.adherencia ?? 0}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                            <span
                              className="w-10 shrink-0 text-right text-xs font-semibold"
                              style={{ color: m.adherencia === null ? "#94A3B8" : color }}
                            >
                              {m.adherencia === null ? "—" : `${m.adherencia} %`}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              {HAY_PAC && (
                <>
                  PAC = plan aprobado ({PAC_2026_TOTAL} capacitaciones, {PAC_2026_ORIGEN}).
                  Calendarizado en el sistema: {a.totalAnual}. Hasta{" "}
                  {MESES_CORTOS[a.ultimoMesCerrado] ?? "—"} (último mes cerrado) el PAC preveía{" "}
                  {a.pacYtd} y el sistema tiene {a.calendarizadasHastaMesCerrado} cargadas,{" "}
                  {a.cumplidasHastaMesCerrado} cumplidas.{" "}
                </>
              )}
              La adherencia se mide contra el calendarizado del sistema, que es la evidencia
              auditable. En verde, las cumplidas antes de su fecha: suman al cumplimiento anual pero
              todavía no a la adherencia.
              {a.cumplidasManuales > 0 && (
                <>
                  {" "}
                  De las {a.cumplidasAnual} cumplidas, <b>{a.cumplidasManuales}</b> tienen el
                  estado cargado a mano (cursos externos).
                </>
              )}
            </p>
          </div>

          {/* Por pilar */}
          <div>
            <button
              type="button"
              onClick={() => setVerPilares((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 outline-none hover:text-slate-700"
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${verPilares ? "" : "-rotate-90"}`}
              />
              Adherencia por pilar
            </button>
            {verPilares && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-2">Pilar</th>
                      {HAY_PAC && <th className="py-1.5 pr-2 text-right">PAC</th>}
                      <th className="py-1.5 pr-2 text-right">Calend.</th>
                      <th className="py-1.5 pr-2 text-right">Atrasadas</th>
                      <th className="py-1.5 pr-2 text-right">Cumplidas</th>
                      <th className="py-1.5 text-right">Adherencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.porPilar.map((p) => (
                      <tr key={p.pilar} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-700">{p.pilar}</td>
                        {HAY_PAC && (
                          <td className="py-1.5 pr-2 text-right text-slate-400">{p.pac || "—"}</td>
                        )}
                        <td className="py-1.5 pr-2 text-right text-slate-600">
                          {p.calendarizadas || "—"}
                        </td>
                        <td
                          className={`py-1.5 pr-2 text-right ${p.atrasadas > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}
                        >
                          {p.atrasadas || "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">
                          {p.vencidas > 0 ? p.cumplidas : "—"}
                          {p.adelantadas > 0 && (
                            <span
                              className="ml-1 text-xs font-normal text-emerald-600"
                              title="Cumplidas antes de su fecha: no entran en la adherencia todavía"
                            >
                              +{p.adelantadas}
                            </span>
                          )}
                        </td>
                        <td
                          className="py-1.5 text-right font-semibold"
                          style={{ color: colorSemaforo(p.adherencia) }}
                        >
                          {p.adherencia === null ? "—" : `${p.adherencia} %`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function diasDeAtraso(fecha: string, hoy: string): number {
  const ms = Date.parse(hoy + "T12:00:00") - Date.parse(fecha + "T12:00:00")
  return Math.max(0, Math.round(ms / 86400000))
}

function Kpi({
  valor,
  label,
  detalle,
  color,
  icono,
  destacado,
}: {
  valor: string
  label: string
  detalle: string
  color: string
  icono?: React.ReactNode
  destacado?: boolean
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: color + "40",
        backgroundColor: destacado ? color + "0D" : undefined,
      }}
    >
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icono}
        <span className={`font-bold ${destacado ? "text-3xl" : "text-2xl"}`}>{valor}</span>
      </div>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">{detalle}</p>
    </div>
  )
}
