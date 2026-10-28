"use client"

// Drill de la modulación de rechazos de un día: qué clientes rechazaron, qué
// respondió el vendedor en el seguimiento del bot y si se entregó ese día.
// Lo abren la Matinal de Distribución y la página de alertas.

import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { getModulacionDia, type AlertaModulacionDetalle } from "@/actions/foxtrot-alertas"
import { esModulado, resumirModulacion } from "@/lib/foxtrot-alertas/modulacion"
import type { ResultadoSeguimiento } from "@/lib/foxtrot-alertas/types"

export type FiltroModulacion = "todos" | "modulados" | "exitosos" | "rechazados" | "sin_gestion"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  filtroInicial?: FiltroModulacion
}

const RESPUESTA_LABEL: Record<ResultadoSeguimiento, string> = {
  evitado: "Evitado",
  reprogramado: "Reprogramado",
  perdido: "Perdido",
  sin_respuesta: "Sin respuesta",
}

const RESPUESTA_BADGE: Record<ResultadoSeguimiento, string> = {
  evitado: "bg-emerald-100 text-emerald-800",
  reprogramado: "bg-sky-100 text-sky-800",
  perdido: "bg-red-100 text-red-800",
  sin_respuesta: "bg-slate-100 text-slate-600",
}

type Estado = "exitoso" | "rechazado" | "sin_gestion"

function estadoDe(a: AlertaModulacionDetalle): Estado {
  if (!esModulado(a)) return "sin_gestion"
  return a.outcome === "recuperado_mismo_dia" ? "exitoso" : "rechazado"
}

const ESTADO_ORDEN: Record<Estado, number> = { exitoso: 0, rechazado: 1, sin_gestion: 2 }

function horaArt(ts: string | null): string {
  if (!ts) return "s/d"
  return new Date(new Date(ts).getTime() - 3 * 3600_000).toISOString().slice(11, 16)
}

function fechaLarga(f: string): string {
  return new Date(`${f}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

export function ModulacionDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
  filtroInicial = "todos",
}: Props) {
  const [data, setData] = useState<AlertaModulacionDetalle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroModulacion>(filtroInicial)
  const [expandida, setExpandida] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !fecha) {
      setData(null)
      setError(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    setFiltro(filtroInicial)
    setExpandida(null)
    void getModulacionDia(fecha).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancelado = true
    }
  }, [open, fecha, filtroInicial])

  const resumen = useMemo(() => resumirModulacion(data ?? []), [data])

  const filas = useMemo(() => {
    const todas = (data ?? []).map((a) => ({ a, estado: estadoDe(a) }))
    return todas
      .filter(({ estado }) =>
        filtro === "todos"
          ? true
          : filtro === "modulados"
            ? estado !== "sin_gestion"
            : filtro === "exitosos"
              ? estado === "exitoso"
              : filtro === "rechazados"
                ? estado === "rechazado"
                : estado === "sin_gestion",
      )
      .sort((x, y) => ESTADO_ORDEN[x.estado] - ESTADO_ORDEN[y.estado])
  }, [data, filtro])

  const chips: { id: FiltroModulacion; label: string; n: number; sub?: string; color: string }[] = [
    { id: "todos", label: "Rechazos", n: resumen.rechazos, color: "border-slate-300" },
    {
      id: "modulados",
      label: "Modulados",
      n: resumen.modulados,
      sub: resumen.pct_modulacion === null ? undefined : `${resumen.pct_modulacion}%`,
      color: "border-sky-300",
    },
    {
      id: "exitosos",
      label: "Entregados",
      n: resumen.exitosos,
      sub: resumen.pct_exito === null ? undefined : `${resumen.pct_exito}% de modulados`,
      color: "border-emerald-300",
    },
    { id: "rechazados", label: "Rechazados", n: resumen.rechazados, color: "border-red-300" },
    { id: "sin_gestion", label: "Sin gestión", n: resumen.sin_gestion, color: "border-amber-300" },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Modulación de rechazos
            {fecha && (
              <span className="text-base font-normal text-muted-foreground">
                · {fechaLarga(fecha)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Modulado = el vendedor respondió el seguimiento del bot. Entregado = el
            sistema vio la entrega ese mismo día. Tocá una fila para ver los
            productos y lo que contestó el vendedor.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando detalle…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFiltro(c.id)}
                  className={cn(
                    "rounded-lg border bg-white p-2.5 text-left transition-colors hover:bg-slate-50",
                    filtro === c.id ? `${c.color} ring-2 ring-offset-1 ring-slate-300` : "border-slate-200",
                  )}
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {c.label}
                  </div>
                  <div className="text-xl font-bold tabular-nums text-slate-900">{c.n}</div>
                  {c.sub && <div className="text-[11px] text-muted-foreground">{c.sub}</div>}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-6" />
                    <TableHead className="w-14">Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Chofer / Ruta</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Bultos</TableHead>
                    <TableHead>Respuesta del vendedor</TableHead>
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                        Sin rechazos en este grupo.
                      </TableCell>
                    </TableRow>
                  )}
                  {filas.map(({ a, estado }) => (
                    <Fragment key={a.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpandida(expandida === a.id ? null : a.id)}
                      >
                        <TableCell className="pr-0">
                          {expandida === a.id ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{horaArt(a.rechazo_ts)}</TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium text-slate-900">
                            {a.cliente_nombre ?? "(sin nombre)"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            <span className="font-mono">{a.id_cliente ?? a.cliente_id_foxtrot ?? "s/d"}</span>
                            {a.cliente_localidad ? ` · ${a.cliente_localidad}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{a.promotor_nombre ?? "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {a.chofer_nombre ?? "—"}
                          <span className="text-muted-foreground"> · R{a.ruta}</span>
                        </TableCell>
                        <TableCell className="max-w-44 text-xs">
                          <span className="line-clamp-2">{a.motivos.join(" / ") || "Sin motivo"}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">
                          {Number(a.bultos)}
                          {a.parcial ? " (p)" : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.seguimiento_resultado ? (
                            <Badge className={`${RESPUESTA_BADGE[a.seguimiento_resultado]} text-[10px]`}>
                              {RESPUESTA_LABEL[a.seguimiento_resultado]}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Sin preguntar aún</span>
                          )}
                          {a.categoria_label && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">{a.categoria_label}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              estado === "exitoso"
                                ? "bg-emerald-100 text-emerald-800"
                                : estado === "rechazado"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800",
                            )}
                          >
                            {estado === "exitoso"
                              ? "Entregado"
                              : estado === "rechazado"
                                ? "Rechazado"
                                : "Sin gestión"}
                          </Badge>
                          {/* Vendedor y sistema no coinciden: vale lo que vio el
                              sistema, pero se marca para revisarlo en la reunión. */}
                          {estado === "rechazado" && a.seguimiento_resultado === "evitado" && (
                            <div className="mt-0.5 text-[11px] text-amber-700">
                              El vendedor dice entregado, Foxtrot no lo registra
                            </div>
                          )}
                          {estado === "sin_gestion" && a.outcome === "recuperado_mismo_dia" && (
                            <div className="mt-0.5 text-[11px] text-emerald-700">
                              Se entregó igual en el día
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {expandida === a.id && (
                        <TableRow className="bg-slate-50">
                          <TableCell colSpan={9} className="py-3 text-xs">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="mb-1 font-semibold text-slate-700">Productos rechazados</div>
                                <ul className="space-y-0.5">
                                  {a.items.map((i, idx) => (
                                    <li key={idx}>
                                      • {i.producto}
                                      {i.cantidad > 0 ? ` x${i.cantidad}` : " (parcial)"}
                                      {i.notas ? (
                                        <span className="text-muted-foreground"> — {i.notas}</span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="space-y-1.5">
                                {(a.seguimiento_como || a.seguimiento_resumen) && (
                                  <div>
                                    <span className="font-semibold text-slate-700">
                                      Qué dijo {a.seguimiento_por_nombre ?? "el vendedor"}
                                      {a.seguimiento_at ? ` (${horaArt(a.seguimiento_at)} hs)` : ""}:{" "}
                                    </span>
                                    <span className="italic">
                                      “{a.seguimiento_como ?? a.seguimiento_resumen}”
                                    </span>
                                  </div>
                                )}
                                {a.outcome_detalle && (
                                  <div>
                                    <span className="font-semibold text-slate-700">Sistema: </span>
                                    {a.outcome_detalle}
                                  </div>
                                )}
                                {a.supervisor_nombre && (
                                  <div>
                                    <span className="font-semibold text-slate-700">Supervisor: </span>
                                    {a.supervisor_nombre}
                                  </div>
                                )}
                                {a.cliente_telefono && (
                                  <div>
                                    <span className="font-semibold text-slate-700">Tel cliente: </span>
                                    {a.cliente_telefono}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
