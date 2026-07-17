"use client"

import { useEffect, useState } from "react"
import { Loader2, Truck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  getFlotaRuteoReunion,
  type FlotaRuteoReunion,
} from "@/actions/reuniones-flota-ruteo"
import { ActionLogSeccion } from "./action-log-seccion"
import type {
  ReunionActividadConResponsable,
  TipoReunion,
} from "@/types/database"

export const SECCION_FLOTA_RUTEO = "flota_ruteo"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

function formatFecha(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}
function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Verde si cumple el target, rojo si no. Gris cuando no hay dato ni target. */
function colorTarget(
  valor: number | null,
  target: number | null,
  mejorSi: "mayor" | "menor"
): string {
  if (valor == null || target == null) return "text-slate-400"
  const cumple = mejorSi === "mayor" ? valor >= target : valor <= target
  return cumple ? "text-emerald-600" : "text-red-600"
}

function Kpi({
  titulo,
  valor,
  unidad,
  target,
  mejorSi,
  detalle,
}: {
  titulo: string
  valor: number | null
  unidad: string
  target: number | null
  mejorSi: "mayor" | "menor"
  detalle?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className={cn("mt-1 text-2xl font-bold", colorTarget(valor, target, mejorSi))}>
        {valor == null
          ? "—"
          : valor.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
        <span className="ml-1 text-sm font-medium">{unidad}</span>
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {target == null
          ? "sin objetivo definido"
          : `objetivo ${mejorSi === "mayor" ? "≥" : "≤"} ${target.toLocaleString("es-AR")} ${unidad}`}
      </p>
      {detalle && <p className="mt-1 text-xs text-slate-400">{detalle}</p>}
    </div>
  )
}

/**
 * Bloque de Flota de la reunión de logística de los lunes, sobre el mes en
 * curso, que es la ventana con la que están definidos los objetivos y la que
 * se ve en Indicadores de Flota. El volumen reprogramado (VRL/VRC) se consulta
 * en la tarjeta de Pedidos con problemas, no acá.
 */
export function SeccionFlotaRuteo({
  fechaReunion,
  reunionId,
  reunionTipo,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  fechaReunion: string
  reunionId: string
  reunionTipo: TipoReunion
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [data, setData] = useState<FlotaRuteoReunion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    void getFlotaRuteoReunion(fechaReunion).then((r) => {
      if (cancel) return
      if ("error" in r) {
        setError(r.error)
        setData(null)
      } else {
        setData(r.data)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [fechaReunion])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-5 text-slate-500" />
          Flota
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando flota…
          </p>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && !loading && (
          <>
            {/* ── Flota: indicadores del mes en curso ── */}
            <section>
              <h3 className="text-sm font-semibold text-slate-900">
                Flota — {nombreMes(data.flota.mes)}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Acumulado del mes hasta el {formatFecha(fechaReunion)} (la fecha de
                esta reunión), con los mismos objetivos que el tablero de
                Indicadores de Flota.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Kpi
                  titulo="Disponibilidad de flota"
                  valor={data.flota.disponibilidadPct}
                  unidad="%"
                  target={data.flota.disponibilidadTarget}
                  mejorSi="mayor"
                  detalle={
                    data.flota.utilizacionPct == null
                      ? undefined
                      : `utilización ${data.flota.utilizacionPct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
                  }
                />
                <Kpi
                  titulo="Consumo de combustible"
                  valor={data.flota.combustibleKml}
                  unidad="km/l"
                  target={data.flota.combustibleTarget}
                  mejorSi="mayor"
                  detalle={
                    data.flota.combustibleLitros > 0
                      ? `${data.flota.combustibleKm.toLocaleString("es-AR")} km · ${data.flota.combustibleLitros.toLocaleString("es-AR", { maximumFractionDigits: 0 })} l`
                      : "sin cargas registradas en el mes"
                  }
                />
                <Kpi
                  titulo="Services vencidos"
                  valor={data.flota.servicesVencidos}
                  unidad=""
                  target={data.flota.servicesTarget}
                  mejorSi="menor"
                  detalle={`${data.flota.proximosServices.length} unidad(es) a 30 días o menos`}
                />
              </div>

              {/* Próximos services: proyección por tasa de uso real (km/día). */}
              {data.flota.servicesAlDia !== fechaReunion && (
                <p className="mt-3 text-xs text-slate-500">
                  Próximos services al {formatFecha(data.flota.servicesAlDia)}: se
                  proyectan desde el kilometraje de hoy de cada unidad, así que en
                  una reunión pasada son la foto actual y no la de ese día.
                </p>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-1.5 text-left font-medium">Unidad</th>
                      <th className="py-1.5 text-right font-medium">Último service</th>
                      <th className="py-1.5 text-right font-medium">Próximo</th>
                      <th className="py-1.5 text-right font-medium">Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.flota.proximosServices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-3 text-center text-slate-400">
                          Ningún service vencido ni a menos de 30 días.
                        </td>
                      </tr>
                    )}
                    {data.flota.proximosServices.map((s) => (
                      <tr key={s.dominio} className="border-b border-slate-100">
                        <td className="py-1.5 font-medium text-slate-700">
                          {s.dominio}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                          {s.ultimaFecha ? formatFecha(s.ultimaFecha) : "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                          {s.proximaFecha ? formatFecha(s.proximaFecha) : "—"}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-semibold tabular-nums",
                            s.estado === "vencido" || s.estado === "rojo"
                              ? "text-red-600"
                              : s.estado === "naranja"
                                ? "text-orange-600"
                                : s.estado === "amarillo"
                                  ? "text-amber-600"
                                  : "text-slate-500"
                          )}
                        >
                          {s.diasRestantes == null
                            ? "—"
                            : s.diasRestantes < 0
                              ? `vencido hace ${Math.abs(s.diasRestantes)}`
                              : s.diasRestantes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo={reunionTipo}
              seccion={SECCION_FLOTA_RUTEO}
              titulo="Flota"
              actividades={actividades}
              responsables={responsables}
              puedeEditar={puedeEditar}
              onChanged={onActividadesChanged}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
