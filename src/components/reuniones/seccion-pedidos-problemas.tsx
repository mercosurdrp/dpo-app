"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, PackageX } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getPedidosConProblemas,
  type PedidosConProblemasReunion,
} from "@/actions/reuniones-pedidos-problemas"
import { ActionLogSeccion } from "./action-log-seccion"
import type {
  ReunionActividadConResponsable,
  TipoReunion,
} from "@/types/database"

export const SECCION_PEDIDOS_PROBLEMAS = "pedidos_problemas"

/** El VRL se registra desde esta fecha (antes la RLS impedía guardar cortes). */
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
function num(v: number, dec = 0): string {
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

function Resumen({
  titulo,
  detalle,
  pedidos,
  bultos,
  hl,
  tono,
}: {
  titulo: string
  detalle: string
  pedidos: number | null
  bultos: number | null
  hl: number | null
  tono: "amber" | "sky" | "slate"
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tono === "amber" && "border-amber-200 bg-amber-50/50",
        tono === "sky" && "border-sky-200 bg-sky-50/50",
        tono === "slate" && "border-slate-200"
      )}
    >
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">
        {pedidos == null ? "—" : num(pedidos)}
        <span className="ml-1 text-sm font-medium text-slate-500">
          pedido{pedidos === 1 ? "" : "s"}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {bultos == null
          ? "sin dato"
          : `${num(bultos)} bultos · ${num(hl ?? 0, 1)} HL`}
      </p>
      <p className="mt-1 text-xs text-slate-400">{detalle}</p>
    </div>
  )
}

/**
 * Pedidos con problemas de la reunión Logística-Ventas: quiénes se quedaron sin
 * su entrega en la semana previa, por qué motivo y cuántos bultos, juntando la
 * pata logística (VRL, cortes de ruteo) y la comercial (VRC, crédito).
 */
export function SeccionPedidosProblemas({
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
  const [data, setData] = useState<PedidosConProblemasReunion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    void getPedidosConProblemas(fechaReunion).then((r) => {
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

  const totalPedidos =
    data == null
      ? null
      : data.totalVrc == null
        ? null
        : data.totalVrl.pedidos + data.totalVrc.pedidos

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageX className="size-5 text-slate-500" />
          Pedidos con problemas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Cargando pedidos reprogramados…
          </p>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && !loading && (
          <>
            <p className="text-xs text-slate-500">
              Pedidos reprogramados del {formatFecha(data.desde)} al{" "}
              {formatFecha(data.hasta)} (la semana previa a esta reunión).{" "}
              <strong>VRL</strong> = por capacidad de reparto (corte del ruteo) ·{" "}
              <strong>VRC</strong> = por límite de crédito.
            </p>

            {data.vrcError && (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-px size-4 shrink-0" />
                <span>
                  {data.vrcError} Los pedidos por crédito no aparecen en la
                  lista: no es que no hubo, es un dato que no se pudo leer.
                </span>
              </p>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Resumen
                titulo="VRL — logístico"
                detalle="cortes del ruteo por capacidad"
                pedidos={data.totalVrl.pedidos}
                bultos={data.totalVrl.bultos}
                hl={data.totalVrl.hl}
                tono="amber"
              />
              <Resumen
                titulo="VRC — comercial"
                detalle="pedidos corridos por crédito"
                pedidos={data.totalVrc?.pedidos ?? null}
                bultos={data.totalVrc?.bultos ?? null}
                hl={data.totalVrc?.hl ?? null}
                tono="sky"
              />
              <Resumen
                titulo="Total semana"
                detalle="VRL + VRC"
                pedidos={totalPedidos}
                bultos={
                  totalPedidos == null
                    ? null
                    : data.totalVrl.bultos + (data.totalVrc?.bultos ?? 0)
                }
                hl={
                  totalPedidos == null
                    ? null
                    : data.totalVrl.hl + (data.totalVrc?.hl ?? 0)
                }
                tono="slate"
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-1.5 text-left font-medium">Día</th>
                    <th className="py-1.5 text-left font-medium">Cliente</th>
                    <th className="py-1.5 text-left font-medium">Origen</th>
                    <th className="py-1.5 text-left font-medium">Motivo</th>
                    <th className="py-1.5 text-right font-medium">Bultos</th>
                    <th className="py-1.5 text-right font-medium">HL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pedidos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-400">
                        Ningún pedido reprogramado registrado en la semana.
                      </td>
                    </tr>
                  )}
                  {data.pedidos.map((p, i) => (
                    <tr
                      key={`${p.fuente}-${p.fecha}-${p.idCliente}-${i}`}
                      className="border-b border-slate-100"
                    >
                      <td className="whitespace-nowrap py-1.5 text-slate-700">
                        {diaSemana(p.fecha)} {formatFecha(p.fecha)}
                      </td>
                      <td className="py-1.5">
                        <span className="font-medium text-slate-800">
                          {p.cliente}
                        </span>
                        {p.localidad && (
                          <span className="ml-1 text-xs text-slate-500">
                            · {p.localidad}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            p.fuente === "vrl"
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-sky-300 bg-sky-50 text-sky-700"
                          )}
                        >
                          {p.fuente === "vrl" ? "VRL" : "VRC"}
                        </Badge>
                      </td>
                      <td className="py-1.5 text-slate-600">
                        {p.motivo}
                        {p.vecesPrevias != null && p.vecesPrevias > 0 && (
                          <span className="ml-1 text-xs font-medium text-red-600">
                            · ya pospuesto ×{p.vecesPrevias}
                          </span>
                        )}
                        {p.fuente === "vrc" && (
                          <span className="ml-1 text-xs text-slate-500">
                            {p.fechaNueva
                              ? `· movido al ${formatFecha(p.fechaNueva)}`
                              : "· sin fecha nueva"}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {num(p.bultos)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">
                        {num(p.hl, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.desde < VRL_REGISTRO_DESDE && (
              <p className="mt-2 text-xs text-slate-500">
                El registro del VRL arrancó el {formatFecha(VRL_REGISTRO_DESDE)}:
                antes de esa fecha los cortes no se guardaban, así que si acá no
                aparecen no significa que no haya habido.
              </p>
            )}

            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo={reunionTipo}
              seccion={SECCION_PEDIDOS_PROBLEMAS}
              titulo="Pedidos con problemas"
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
