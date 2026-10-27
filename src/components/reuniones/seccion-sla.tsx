"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Gauge, History, Loader2 } from "lucide-react"
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
import {
  getObservacionesSlaSeccion,
  type IndicadorHistorialResumen,
} from "@/actions/reuniones-indicadores-observaciones"
import {
  codigoSlaDe,
  esIndicadorSla,
  slaIndicadorId,
} from "@/lib/reuniones-sla-observaciones"
import { SlaDetalleDiaBody } from "@/components/sla/sla-cumplimientos"
import type {
  CumplimientoRango,
  CumplimientoRangoFila,
  DetalleDiaSla,
  EstadoCumplimiento,
} from "@/lib/sla-cumplimiento"
import { ActionLogSeccion } from "./action-log-seccion"
import { SlaObservaciones } from "./sla-observaciones"
import {
  IndicadorHistorialDialog,
  type IndicadorHistorialRef,
} from "./indicador-historial-dialog"
import type {
  ReunionActividadConResponsable,
  ReunionIndicadorObservacionConAutor,
  S5SectorAlmacen,
  TipoReunion,
} from "@/types/database"

export const SECCION_SLA = "sla"

// SLA que se revisan en la reunión de Logística: los acordados + el peso
// límite de camiones. Queda afuera capacidad del camión y demás.
// El orden replica el de la matriz que arma getCumplimientoMes.
export const SLA_CODIGOS_REUNION_OPERATIVA = [
  "plan_syop",
  "plan_ruteo_tiempo",
  "alm_carga",
  "alm_recepcion",
  "plan_ruteo_pushed",
  "plan_ruteo_peso",
  // Equipos de frío es un acuerdo Ventas↔Logística, pero la ventana de lunes a
  // miércoles la ejecuta la carga del camión: Logística también lo revisa.
  "plan_equipos_frio",
]

// SLA que se revisan en la reunión Ventas-Logística (pedido de Sebastián,
// 28/09/2026): los acuerdos entre Ventas y Operaciones más los cierres de
// casos NPS/RMD. Quedan afuera Pushed, Recepción de acarreos y Peso límite,
// que son internos de Logística. El orden replica el de getCumplimientoMes.
export const SLA_CODIGOS_REUNION_VENTAS_LOGISTICA = [
  "plan_syop",
  "plan_ruteo_tiempo",
  "plan_ruteo_capacidad",
  "alm_carga",
  "plan_equipos_frio",
  "ent_nps",
  "ent_rmd",
]

// SLA que se revisan en la reunión de Warehouse (pedido del 28/09/2026): los
// dos que ejecuta el almacén — carga de los camiones de distribución y
// descarga de los acarreos (puntos DPO 5.2/5.3 y 6.2/6.3).
export const SLA_CODIGOS_REUNION_WAREHOUSE = ["alm_carga", "alm_recepcion"]

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
  // Cumple con excepción autorizada: cuenta como cumplido, se distingue en ámbar.
  just: "bg-amber-400",
  no: "bg-red-500",
  na: "bg-slate-200",
  sd: "bg-slate-100 border border-dashed border-slate-300",
}
const ESTADO_LABEL: Record<EstadoCumplimiento, string> = {
  si: "Cumple",
  just: "Cumple con excepción autorizada",
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
  sectoresAlmacen,
  vehiculos,
  rubrosMantenimiento,
  puedeEditar,
  onActividadesChanged,
}: {
  fechaReunion: string
  reunionId: string
  reunionTipo: TipoReunion
  titulo?: string
  /** Si está presente, solo se muestran los SLA con estos códigos (y en este orden). */
  codigos?: string[]
  /**
   * Actividades de la sección 'sla' (las de esta reunión y, si vienen atadas a
   * un SLA, las de las otras reuniones que lo revisan). Acá se filtran a los
   * SLA visibles.
   */
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  sectoresAlmacen?: S5SectorAlmacen[]
  vehiculos?: { id: string; dominio: string }[]
  rubrosMantenimiento?: { id: string; nombre: string }[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [desde, setDesde] = useState(primerDiaMes(fechaReunion))
  const [hasta, setHasta] = useState(fechaReunion)
  const [cumpl, setCumpl] = useState<CumplimientoRango | null>(null)
  const [slas, setSlas] = useState<SlaLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Observaciones de SLA (compartidas entre reuniones) y conteo por SLA para
  // marcar en el cuadro los que tienen historial. Se recargan con el rango y
  // cada vez que se carga/edita algo (refreshObs).
  const [observaciones, setObservaciones] = useState<
    ReunionIndicadorObservacionConAutor[]
  >([])
  const [resumenSla, setResumenSla] = useState<
    Record<string, IndicadorHistorialResumen>
  >({})
  const [refreshObs, setRefreshObs] = useState(0)
  const [slaHistorial, setSlaHistorial] = useState<IndicadorHistorialRef | null>(
    null,
  )

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

  // Clave estable de los códigos para los efectos (la prop suele ser una
  // constante del módulo, pero no dependemos de su identidad).
  const codigosKey = codigos?.join(",") ?? ""

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    // El SLA de peso solo se pide cuando esta reunión lo lista (Logística).
    const incluirPeso = !!codigos?.includes("plan_ruteo_peso")
    void Promise.all([getCumplimientoRango(desde, hasta, incluirPeso), getSlas()]).then(
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

  // Observaciones de SLA del rango + resumen por SLA. Sin filtro de códigos
  // (no pasa hoy) se piden las de todos los SLA cargados.
  const slasKey = codigos ? "" : slas.map((s) => s.codigo).join(",")
  useEffect(() => {
    let cancel = false
    const cods = codigos ?? slasKey.split(",").filter(Boolean)
    if (cods.length === 0) return
    void getObservacionesSlaSeccion({ reunionId, codigos: cods, desde, hasta }).then(
      (res) => {
        if (cancel) return
        if ("error" in res) return
        setObservaciones(res.data.observaciones)
        setResumenSla(res.data.resumen)
      },
    )
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunionId, codigosKey, slasKey, desde, hasta, refreshObs])

  function onObservacionesChanged() {
    setRefreshObs((n) => n + 1)
    onActividadesChanged()
  }

  // Con filtro de códigos se muestran solo esos SLA, en el orden pedido.
  const filasVisibles: CumplimientoRangoFila[] = codigos
    ? codigos
        .map((c) => (cumpl?.filas ?? []).find((f) => f.codigo === c))
        .filter((f): f is CumplimientoRangoFila => f != null)
    : (cumpl?.filas ?? [])
  const slasVisibles = codigos
    ? slas.filter((s) => codigos.includes(s.codigo))
    : slas

  // SLA elegibles para una observación o acción: los de la matriz (con su
  // nombre corto) y, si alguno no es medible, el del acuerdo cargado.
  const slasParaObservar = useMemo(() => {
    const out: { codigo: string; nombre: string }[] = []
    const vistos = new Set<string>()
    for (const f of filasVisibles) {
      out.push({ codigo: f.codigo, nombre: f.nombre })
      vistos.add(f.codigo)
    }
    for (const s of slasVisibles) {
      if (!vistos.has(s.codigo)) out.push({ codigo: s.codigo, nombre: s.nombre })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumpl, slas, codigosKey])

  // Acciones de la sección: las propias sin SLA y las atadas a un SLA visible
  // (vengan de esta reunión o de otra que revise el mismo SLA).
  const actividadesVisibles = useMemo(() => {
    const visibles = new Set(slasParaObservar.map((s) => slaIndicadorId(s.codigo)))
    return actividades.filter(
      (a) => !esIndicadorSla(a.indicador_id) || visibles.has(a.indicador_id!),
    )
  }, [actividades, slasParaObservar])

  function abrirHistorialSla(indicadorId: string) {
    const codigo = codigoSlaDe(indicadorId)
    const fila = filasVisibles.find((f) => f.codigo === codigo)
    const sla = slas.find((s) => s.codigo === codigo)
    const obs = observaciones.find((o) => o.indicador_id === indicadorId)
    setSlaHistorial({
      id: indicadorId,
      nombre: fila?.nombre ?? sla?.nombre ?? obs?.indicador_nombre ?? "SLA",
      unidad: fila ? "%" : null,
      meta: fila?.target ?? null,
    })
  }

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
                      const h = resumenSla[slaIndicadorId(f.codigo)]
                      const totalHist = h ? h.observaciones + h.acciones : 0
                      return (
                        <tr key={f.codigo}>
                          <td className="sticky left-0 z-10 min-w-[12rem] border-t border-r border-slate-200 bg-white px-3 py-1.5 align-middle">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  abrirHistorialSla(slaIndicadorId(f.codigo))
                                }
                                className="flex min-w-0 items-center gap-1 text-left text-sm font-semibold text-slate-800 hover:text-violet-700 hover:underline"
                                title={
                                  totalHist > 0
                                    ? `Ver historial: ${h!.observaciones} observaciones, ${h!.acciones} acciones${
                                        h!.acciones_abiertas > 0
                                          ? ` (${h!.acciones_abiertas} abiertas)`
                                          : ""
                                      }`
                                    : "Ver historial de observaciones y acciones"
                                }
                              >
                                <span className="min-w-0 truncate">{f.nombre}</span>
                                {totalHist > 0 && (
                                  <span
                                    className={cn(
                                      "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 text-[10px] font-semibold leading-4",
                                      h!.acciones_abiertas > 0
                                        ? "border-amber-200 bg-amber-50 text-amber-800"
                                        : "border-violet-200 bg-violet-50 text-violet-800",
                                    )}
                                  >
                                    <History className="size-3" />
                                    {totalHist}
                                  </span>
                                )}
                              </button>
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

            {/* Observaciones por SLA (compartidas entre las reuniones que
                revisan el mismo SLA). Desde acá también nace una acción. */}
            <SlaObservaciones
              reunionId={reunionId}
              reunionTipo={reunionTipo}
              slas={slasParaObservar}
              observaciones={observaciones}
              responsables={responsables}
              sectoresAlmacen={sectoresAlmacen}
              vehiculos={vehiculos}
              rubrosMantenimiento={rubrosMantenimiento}
              puedeEditar={puedeEditar}
              seccion={SECCION_SLA}
              onChanged={onObservacionesChanged}
              onVerHistorial={abrirHistorialSla}
            />

            {/* Action Log de la sección: las acciones se crean eligiendo el
                SLA arriba («Crear acción»), así quedan atadas y se comparten. */}
            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo={reunionTipo}
              seccion={SECCION_SLA}
              titulo="SLA"
              actividades={actividadesVisibles}
              responsables={responsables}
              puedeEditar={puedeEditar}
              onChanged={onObservacionesChanged}
              ocultarNuevo
              onVerIndicador={abrirHistorialSla}
              vacioTexto="Sin acciones de SLA. Elegí un SLA arriba y tocá «Crear acción»."
            />
          </>
        )}
      </CardContent>

      {/* Historial de un SLA: observaciones y acciones de TODAS las reuniones
          que lo revisan (Logística, Ventas-Logística, Warehouse). */}
      <IndicadorHistorialDialog
        open={slaHistorial !== null}
        onOpenChange={(o) => {
          if (!o) setSlaHistorial(null)
        }}
        reunionTipo={reunionTipo}
        reunionId={reunionId}
        indicador={slaHistorial}
        todasLasReuniones
      />

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
