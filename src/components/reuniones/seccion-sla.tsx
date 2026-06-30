"use client"

import { useEffect, useState, useTransition } from "react"
import { Gauge, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getSlas, getCumplimientoRango, getDetalleDiaSla } from "@/actions/sla"
import { SlaDetalleDiaBody } from "@/components/sla/sla-cumplimientos"
import type {
  CumplimientoRango,
  CumplimientoRangoFila,
  DetalleDiaSla,
  EstadoCumplimiento,
} from "@/lib/sla-cumplimiento"
import { ActionLogSeccion } from "./action-log-seccion"
import type {
  ReunionActividadConResponsable,
  TipoReunion,
} from "@/types/database"

export const SECCION_SLA = "sla"

// SLA que se revisan en las reuniones operativas (logística, matinal,
// warehouse): los 5 acordados — quedan afuera capacidad del camión y demás.
export const SLA_CODIGOS_REUNION_OPERATIVA = [
  "plan_syop",
  "plan_ruteo_tiempo",
  "alm_carga",
  "alm_recepcion",
  "plan_ruteo_pushed",
]

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface SlaLite {
  id: string
  codigo: string
  nombre: string
  pilar: string
  estado: string
}

function primerDiaMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}
function formatFecha(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
/** Día del mes (sin ceros a la izquierda) y día de semana (0=dom..6=sáb). */
function diaDe(iso: string): number {
  return parseInt(iso.slice(8, 10), 10)
}
function dowDe(iso: string): number {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

const ESTADO_CELL: Record<EstadoCumplimiento, string> = {
  si: "bg-emerald-500",
  no: "bg-red-500",
  na: "bg-slate-200",
  sd: "bg-slate-100 border border-dashed border-slate-300",
}
const ESTADO_LABEL: Record<EstadoCumplimiento, string> = {
  si: "Cumple",
  no: "No cumple",
  na: "No aplica",
  sd: "Sin dato",
}

const SLA_ESTADO_BADGE: Record<string, string> = {
  firmado: "bg-emerald-100 text-emerald-700",
  pendiente: "bg-amber-100 text-amber-700",
  no_aplica: "bg-slate-100 text-slate-600",
}

export function SeccionSla({
  fechaReunion,
  reunionId,
  reunionTipo,
  titulo = "Cumplimiento de SLA",
  codigos,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  fechaReunion: string
  reunionId: string
  reunionTipo: TipoReunion
  titulo?: string
  /** Si está presente, solo se muestran los SLA con estos códigos (y en este orden). */
  codigos?: string[]
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [desde, setDesde] = useState(primerDiaMes(fechaReunion))
  const [hasta, setHasta] = useState(fechaReunion)
  const [cumpl, setCumpl] = useState<CumplimientoRango | null>(null)
  const [slas, setSlas] = useState<SlaLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal de detalle del día (mismo cuerpo que el tablero /sla).
  const [detalleOpen, setDetalleOpen] = useState(false)
  const [detalleDia, setDetalleDia] = useState<DetalleDiaSla | null>(null)
  const [pendingDet, startDet] = useTransition()

  function abrirDetalleDia(codigo: string, fecha: string) {
    setDetalleDia(null)
    setDetalleOpen(true)
    startDet(async () => {
      const r = await getDetalleDiaSla(codigo, fecha)
      if ("error" in r) {
        setDetalleOpen(false)
        alert(`Error cargando el detalle: ${r.error}`)
        return
      }
      setDetalleDia(r.data)
    })
  }

  function onDesde(v: string) {
    const nv = v || primerDiaMes(fechaReunion)
    setDesde(nv)
    if (nv > hasta) setHasta(nv)
  }
  function onHasta(v: string) {
    const nv = v || fechaReunion
    setHasta(nv)
    if (nv < desde) setDesde(nv)
  }

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    void Promise.all([getCumplimientoRango(desde, hasta), getSlas()]).then(
      ([resCumpl, resSlas]) => {
        if (cancel) return
        if ("error" in resCumpl) {
          setError(resCumpl.error)
          setCumpl(null)
        } else {
          setCumpl(resCumpl.data)
        }
        if ("data" in resSlas) {
          setSlas(
            resSlas.data.map((s) => ({
              id: s.id,
              codigo: s.codigo,
              nombre: s.nombre,
              pilar: s.pilar,
              estado: s.estado,
            })),
          )
        }
        setLoading(false)
      },
    )
    return () => {
      cancel = true
    }
  }, [desde, hasta])

  // Con filtro de códigos se muestran solo esos SLA, en el orden pedido.
  const filasVisibles: CumplimientoRangoFila[] = codigos
    ? codigos
        .map((c) => (cumpl?.filas ?? []).find((f) => f.codigo === c))
        .filter((f): f is CumplimientoRangoFila => f != null)
    : (cumpl?.filas ?? [])
  const slasVisibles = codigos
    ? slas.filter((s) => codigos.includes(s.codigo))
    : slas

  // Fechas que encabezan las columnas. Todas las filas comparten el mismo rango;
  // tomamos la fila con más días por robustez.
  const fechasCols = filasVisibles
    .reduce<CumplimientoRangoFila["dias"]>(
      (best, f) => (f.dias.length > best.length ? f.dias : best),
      [],
    )
    .map((d) => d.fecha)

  return (
    <Card className="border-violet-200 bg-violet-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-violet-900">
          <Gauge className="size-5 text-violet-600" />
          {titulo}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => onDesde(e.target.value)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm"
          />
          <label className="text-xs text-muted-foreground">Hasta</label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={fechaReunion}
            onChange={(e) => onHasta(e.target.value)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando cumplimiento…
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <>
            {/* Cumplimiento día a día por SLA medible — matriz alineada: una
                fila por SLA, una columna por fecha. La cabecera muestra el día y
                líneas verticales finas guían cada columna de cuadrados. */}
            {filasVisibles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin SLAs medibles en el período.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[12rem] border-b border-r border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold text-slate-600">
                        SLA
                      </th>
                      {fechasCols.map((fecha) => {
                        const finde = dowDe(fecha) === 0 || dowDe(fecha) === 6
                        return (
                          <th
                            key={fecha}
                            title={formatFecha(fecha)}
                            className={cn(
                              "w-7 border-b border-l border-slate-100 px-0 py-1 text-center text-[11px] font-medium tabular-nums",
                              finde
                                ? "bg-slate-50 text-slate-300"
                                : "text-slate-400",
                            )}
                          >
                            {diaDe(fecha)}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filasVisibles.map((f) => {
                      const cumple =
                        f.porcentaje != null && f.porcentaje >= f.target
                      return (
                        <tr key={f.codigo}>
                          <td className="sticky left-0 z-10 min-w-[12rem] border-t border-r border-slate-200 bg-white px-3 py-1.5 align-middle">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-800">
                                {f.nombre}
                              </span>
                              <Badge
                                className={cn(
                                  "shrink-0 tabular-nums",
                                  f.porcentaje == null
                                    ? "bg-slate-100 text-slate-600"
                                    : cumple
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-red-100 text-red-700",
                                )}
                              >
                                {f.porcentaje == null ? "s/d" : `${f.porcentaje}%`}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              meta {f.target}% · {f.cumplidos}/{f.totalAplica} días
                            </p>
                          </td>
                          {f.dias.map((d) => {
                            const finde =
                              dowDe(d.fecha) === 0 || dowDe(d.fecha) === 6
                            const clickable =
                              d.estado === "si" || d.estado === "no"
                            return (
                              <td
                                key={d.fecha}
                                className={cn(
                                  "border-t border-l border-slate-100 px-0 py-1 text-center align-middle",
                                  finde && "bg-slate-50/60",
                                )}
                              >
                                {clickable ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      abrirDetalleDia(f.codigo, d.fecha)
                                    }
                                    title={`${formatFecha(d.fecha)} · ${ESTADO_LABEL[d.estado]} — ver detalle`}
                                    className={cn(
                                      "mx-auto block h-5 w-5 cursor-pointer rounded-sm transition hover:ring-2 hover:ring-violet-400 hover:ring-offset-1",
                                      ESTADO_CELL[d.estado],
                                    )}
                                  />
                                ) : (
                                  <span
                                    title={`${formatFecha(d.fecha)} · ${ESTADO_LABEL[d.estado]}`}
                                    className={cn(
                                      "mx-auto block h-5 w-5 rounded-sm",
                                      ESTADO_CELL[d.estado],
                                    )}
                                  />
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Referencia de colores */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-emerald-500" /> Cumple
              </span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-red-500" /> No cumple
              </span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-slate-200" /> No aplica
              </span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm border border-dashed border-slate-300 bg-slate-100" />{" "}
                Sin dato
              </span>
            </div>

            {/* SLAs cargados (acuerdos) */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                SLAs cargados ({slasVisibles.length})
              </h3>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {slasVisibles.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5"
                  >
                    <span className="truncate text-xs text-slate-700" title={s.nombre}>
                      <span className="text-muted-foreground">{s.codigo}</span> · {s.nombre}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 text-[10px]",
                        SLA_ESTADO_BADGE[s.estado] ?? "bg-slate-100 text-slate-600",
                      )}
                    >
                      {s.estado.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Log de la sección */}
            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo={reunionTipo}
              seccion={SECCION_SLA}
              titulo="SLA"
              actividades={actividades}
              responsables={responsables}
              puedeEditar={puedeEditar}
              onChanged={onActividadesChanged}
            />
          </>
        )}
      </CardContent>

      {/* Modal de detalle del día (qué pasó: horarios, motivo, desglose) */}
      <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detalleDia?.nombre ?? "Detalle del día"}</DialogTitle>
            <DialogDescription>
              {detalleDia
                ? `${detalleDia.diaSemana} ${fechaLarga(detalleDia.fecha)}`
                : "Cargando…"}
            </DialogDescription>
          </DialogHeader>
          {pendingDet || !detalleDia ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <SlaDetalleDiaBody d={detalleDia} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
