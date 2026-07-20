"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, PackageX } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  getPedidosConProblemas,
  type PedidoConProblema,
  type PedidosConProblemasReunion,
  type TotalesFuente,
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

type Filtro = "vrl" | "vrc" | "todos"

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
function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", {
    month: "long",
    timeZone: "UTC",
  })
}
// Monto compacto en pesos: $1,3 M / $850 mil / $420.
function money(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${num(abs / 1_000_000, 1)} M`
  if (abs >= 1_000) return `$${num(abs / 1_000)} mil`
  return `$${num(abs)}`
}

function Resumen({
  titulo,
  detalle,
  pedidos,
  bultos,
  hl,
  mesNombre,
  mesTotales,
  tono,
  onClick,
}: {
  titulo: string
  detalle: string
  pedidos: number | null
  bultos: number | null
  hl: number | null
  mesNombre: string
  mesTotales: TotalesFuente | null
  tono: "amber" | "sky" | "slate"
  onClick: (() => void) | null
}) {
  return (
    <button
      type="button"
      disabled={onClick == null}
      onClick={onClick ?? undefined}
      className={cn(
        "rounded-lg border p-3 text-left",
        tono === "amber" && "border-amber-200 bg-amber-50/50",
        tono === "sky" && "border-sky-200 bg-sky-50/50",
        tono === "slate" && "border-slate-200",
        onClick != null
          ? "cursor-pointer transition-shadow hover:shadow-md"
          : "cursor-default"
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
      <p className="mt-1.5 border-t border-slate-200/70 pt-1.5 text-xs text-slate-600">
        <span className="font-medium capitalize">{mesNombre}</span>
        {": "}
        {mesTotales == null
          ? "sin dato"
          : `${num(mesTotales.pedidos)} ped · ${num(mesTotales.bultos)} bultos · ${num(mesTotales.hl, 1)} HL`}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {detalle}
        {onClick != null && " — tocá para ver el detalle de la semana"}
      </p>
    </button>
  )
}

/** Tabla del detalle: quién, qué día, por qué motivo y cuánto volumen/plata. */
function TablaPedidos({ pedidos }: { pedidos: PedidoConProblema[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="sticky top-0 z-10 bg-popover">
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="py-1.5 text-left font-medium">Día</th>
            <th className="py-1.5 text-left font-medium">Cliente</th>
            <th className="py-1.5 text-left font-medium">Origen</th>
            <th className="py-1.5 text-left font-medium">Motivo</th>
            <th className="py-1.5 text-right font-medium">Bultos</th>
            <th className="py-1.5 text-right font-medium">HL</th>
            <th className="py-1.5 text-right font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p, i) => (
            <tr
              key={`${p.fuente}-${p.fecha}-${p.idCliente}-${i}`}
              className="border-b border-slate-100"
            >
              <td className="whitespace-nowrap py-1.5 text-slate-700">
                {diaSemana(p.fecha)} {formatFecha(p.fecha)}
              </td>
              <td className="py-1.5">
                <span className="font-medium text-slate-800">{p.cliente}</span>
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
              <td className="py-1.5 text-right tabular-nums">{num(p.bultos)}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">
                {num(p.hl, 1)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">
                {money(p.monto)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 z-10 bg-popover">
          <tr className="border-t border-slate-200 font-semibold">
            <td colSpan={4} className="py-2 text-slate-900">
              Total ({pedidos.length} pedido{pedidos.length === 1 ? "" : "s"})
            </td>
            <td className="py-2 text-right tabular-nums">
              {num(pedidos.reduce((s, p) => s + p.bultos, 0))}
            </td>
            <td className="py-2 text-right tabular-nums">
              {num(pedidos.reduce((s, p) => s + p.hl, 0), 1)}
            </td>
            <td className="py-2 text-right tabular-nums">
              {money(pedidos.reduce((s, p) => s + p.monto, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

const FILTRO_TITULO: Record<Filtro, string> = {
  vrl: "Pedidos fuera de ruta — VRL (logístico)",
  vrc: "Pedidos reprogramados — VRC (crédito)",
  todos: "Pedidos reprogramados de la semana",
}

/**
 * Pedidos con problemas: tarjetas con la cantidad de pedidos, bultos y HL
 * reprogramados en la semana previa a la reunión — VRL (cortes de ruteo),
 * VRC (crédito) y el total. Tocando una tarjeta se abre el detalle de
 * quiénes fueron, qué día, con qué motivo y cuánto volumen y plata.
 * Se usa igual en Logística-Ventas y en la logística de los lunes.
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
  const [filtro, setFiltro] = useState<Filtro | null>(null)

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

  const pedidosFiltrados =
    data == null || filtro == null
      ? []
      : filtro === "todos"
        ? data.pedidos
        : data.pedidos.filter((p) => p.fuente === filtro)

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
              {formatFecha(data.hasta)} (la semana previa a esta reunión), y
              abajo el acumulado de {nombreMes(data.mes)} hasta esa fecha.{" "}
              <strong>VRL</strong> = fuera de ruta por capacidad de reparto ·{" "}
              <strong>VRC</strong> = por límite de crédito.
            </p>

            {data.vrcError && (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-px size-4 shrink-0" />
                <span>
                  {data.vrcError} Los pedidos por crédito no aparecen en el
                  detalle: no es que no hubo, es un dato que no se pudo leer.
                </span>
              </p>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Resumen
                titulo="VRL — fuera de ruta"
                detalle="cortes del ruteo por capacidad"
                pedidos={data.totalVrl.pedidos}
                bultos={data.totalVrl.bultos}
                hl={data.totalVrl.hl}
                mesNombre={nombreMes(data.mes)}
                mesTotales={data.mesVrl}
                tono="amber"
                onClick={
                  data.totalVrl.pedidos > 0 ? () => setFiltro("vrl") : null
                }
              />
              <Resumen
                titulo="VRC — comercial"
                detalle="pedidos corridos por crédito"
                pedidos={data.totalVrc?.pedidos ?? null}
                bultos={data.totalVrc?.bultos ?? null}
                hl={data.totalVrc?.hl ?? null}
                mesNombre={nombreMes(data.mes)}
                mesTotales={data.mesVrc}
                tono="sky"
                onClick={
                  (data.totalVrc?.pedidos ?? 0) > 0
                    ? () => setFiltro("vrc")
                    : null
                }
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
                mesNombre={nombreMes(data.mes)}
                mesTotales={
                  data.mesVrc == null
                    ? null
                    : {
                        pedidos: data.mesVrl.pedidos + data.mesVrc.pedidos,
                        bultos: data.mesVrl.bultos + data.mesVrc.bultos,
                        hl: data.mesVrl.hl + data.mesVrc.hl,
                      }
                }
                tono="slate"
                onClick={
                  data.pedidos.length > 0 ? () => setFiltro("todos") : null
                }
              />
            </div>

            <Dialog
              open={filtro != null}
              onOpenChange={(o) => {
                if (!o) setFiltro(null)
              }}
            >
              <DialogContent
                showExpandButton
                className="max-h-[92vh] w-[96vw] max-w-[min(1600px,96vw)] overflow-y-auto sm:max-w-[min(1600px,96vw)]"
              >
                <DialogHeader>
                  <DialogTitle>
                    {filtro ? FILTRO_TITULO[filtro] : ""}
                  </DialogTitle>
                  <DialogDescription>
                    Del {formatFecha(data.desde)} al {formatFecha(data.hasta)},
                    con el motivo y el volumen de cada pedido.
                  </DialogDescription>
                </DialogHeader>
                <TablaPedidos pedidos={pedidosFiltrados} />
              </DialogContent>
            </Dialog>

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
