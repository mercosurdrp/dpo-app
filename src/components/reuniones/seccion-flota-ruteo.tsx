"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, Truck } from "lucide-react"
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

/**
 * Desde cuándo el VRL se registra de verdad. Hasta esta fecha, entrega_cortes no
 * podía escribirse (su RLS sólo admitía service_role y registrarCorte() usa la
 * sesión del usuario), así que los cortes previos nunca se guardaron: esos días
 * valen 0 por falta de registro, no porque no se haya reprogramado nada. Se
 * aclara al pie para que nadie lea esos ceros como un logro.
 */
const VRL_REGISTRO_DESDE = "2026-07-16"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

function formatFecha(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}
function diaSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  return DIAS_CORTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}
/** HL con un decimal; el guion largo distingue "no hay dato" de un cero real. */
function hl(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
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
 * Bloque de Flota y Ruteo de la reunión de logística de los lunes.
 *
 * Dos ventanas distintas a propósito: el ruteo (VRL/VRC) mira los 7 días
 * previos día por día, y la flota mira el mes en curso, que es la ventana con
 * la que están definidos los objetivos y la que se ve en Indicadores de Flota.
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
          Flota y Ruteo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando flota y ruteo…
          </p>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && !loading && (
          <>
            {/* ── Ruteo: VRL y VRC de los 7 días previos ── */}
            <section>
              <h3 className="text-sm font-semibold text-slate-900">
                Volumen reprogramado — últimos 7 días
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Del {formatFecha(data.ruteo.desde)} al {formatFecha(data.ruteo.hasta)}, en HL.
                VRL = reprogramado por capacidad de reparto · VRC = por crédito.
              </p>

              {data.ruteo.vrcError && (
                <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-px size-4 shrink-0" />
                  <span>
                    {data.ruteo.vrcError} Las celdas de VRC quedan vacías: no son
                    cero reprogramado, es un dato que no se pudo leer.
                  </span>
                </p>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-1.5 text-left font-medium">Día</th>
                      <th className="py-1.5 text-right font-medium">VRL (HL)</th>
                      <th className="py-1.5 text-right font-medium">Pedidos</th>
                      <th className="py-1.5 text-right font-medium">VRC (HL)</th>
                      <th className="py-1.5 text-right font-medium">Total (HL)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ruteo.dias.map((d) => (
                      <tr key={d.fecha} className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-700">
                          {diaSemana(d.fecha)} {formatFecha(d.fecha)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {hl(d.vrlHl)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                          {d.vrlPedidos}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {hl(d.vrcHl)}
                        </td>
                        <td className="py-1.5 text-right font-medium tabular-nums">
                          {d.vrcHl == null ? hl(d.vrlHl) : hl(d.vrlHl + d.vrcHl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="py-2 text-slate-900">Total semana</td>
                      <td className="py-2 text-right tabular-nums">
                        {hl(data.ruteo.totalVrlHl)}
                      </td>
                      <td />
                      <td className="py-2 text-right tabular-nums">
                        {hl(data.ruteo.totalVrcHl)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {data.ruteo.totalVrcHl == null
                          ? hl(data.ruteo.totalVrlHl)
                          : hl(data.ruteo.totalVrlHl + data.ruteo.totalVrcHl)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {data.ruteo.desde < VRL_REGISTRO_DESDE && (
                <p className="mt-2 text-xs text-slate-500">
                  El registro del VRL arrancó el{" "}
                  {formatFecha(VRL_REGISTRO_DESDE)}: los días anteriores figuran
                  en 0 porque el corte no se guardaba, no porque no se haya
                  reprogramado.
                </p>
              )}
            </section>

            {/* ── Flota: indicadores del mes en curso ── */}
            <section className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900">
                Flota — {nombreMes(data.flota.mes)}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Acumulado del mes, misma ventana y mismos objetivos que el tablero
                de Indicadores de Flota.
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
              titulo="Flota y Ruteo"
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
