"use client"

import { useEffect, useState } from "react"
import {
  PackageX,
  Loader2,
  Maximize2,
  ChevronRight,
  Pin,
  PinOff,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatHl } from "@/lib/format/rechazos"
import {
  getRechazosResumenDia,
  type RechazosResumenDia,
} from "@/actions/rechazos-resumen-dia"
import {
  getRechazosClientesPorMotivo,
  type RechazoClienteMotivo,
} from "@/actions/rechazos-clientes-motivo"
import {
  getRechazosSnapshotData,
  fijarRechazosSnapshot,
  borrarRechazosSnapshot,
  type RechazosSnapshot,
  type RechazosComparacion,
} from "@/actions/reuniones-rechazos-snapshot"
import { RechazosDetalleDiaDialog } from "./rechazos-detalle-dia-dialog"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable } from "@/types/database"

// Meta de tasa de rechazo (HL). Mismo umbral que el detalle del día.
const META_TASA = 1.7

// Clave de sección para el action log (debe coincidir con el filtro en el detalle).
export const SECCION_RECHAZOS = "rechazos"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

// KPIs y motivos unificados, vengan de la foto fijada o de la consulta en vivo.
interface VistaKpis {
  tasa: number | null
  tasa_bultos: number | null
  hl_rechazados: number
  ventas_total_hl: number
  bultos_rechazados: number
  ventas_total_bultos: number
  eventos: number
  patentes_con_rechazo: number
}
interface VistaMotivo {
  id_rechazo: number
  ds_rechazo: string
  categoria: string
  hl: number
  bultos: number
  eventos: number
}

/**
 * Sección "Rechazos" de la Reunión Ventas-Logística.
 * Trae datos reales del día (tabla rechazos): % de rechazo, bultos rechazados
 * y desglose por motivos. La fecha arranca en la fecha de la reunión y se puede
 * filtrar a una fecha anterior. "Ver detalle completo" abre el drill-down
 * (clientes / productos / patentes) reutilizando el diálogo existente.
 *
 * Además permite "fijar" (congelar) el rango filtrado como foto de la reunión:
 * se guardan los KPIs y la tabla de motivos para que al reabrir la reunión se
 * vea siempre lo que se discutió, con comparación contra la reunión anterior.
 * Incluye su propio Action Log acotado a la sección.
 */
export function SeccionRechazos({
  fechaReunion,
  reunionId,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  fechaReunion: string
  reunionId: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [desde, setDesde] = useState(fechaReunion)
  const [hasta, setHasta] = useState(fechaReunion)
  const [data, setData] = useState<RechazosResumenDia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Foto fijada de la reunión + comparación contra la reunión anterior.
  const [snapshot, setSnapshot] = useState<RechazosSnapshot | null>(null)
  const [comparacion, setComparacion] = useState<RechazosComparacion | null>(null)
  const [snapInit, setSnapInit] = useState(false)
  const [fijando, setFijando] = useState(false)

  // Drill-down de clientes por motivo
  const [motivoSel, setMotivoSel] = useState<{ id: number; ds: string } | null>(null)
  const [clientes, setClientes] = useState<RechazoClienteMotivo[] | null>(null)
  const [cargandoClientes, setCargandoClientes] = useState(false)

  function abrirClientesMotivo(idRechazo: number, ds: string) {
    setMotivoSel({ id: idRechazo, ds })
    setClientes(null)
    setCargandoClientes(true)
    void getRechazosClientesPorMotivo(desde, hasta, idRechazo).then((res) => {
      setCargandoClientes(false)
      if ("error" in res) {
        setClientes([])
        return
      }
      setClientes(res.data)
    })
  }

  // Carga la foto fijada al abrir la reunión y posiciona el filtro en su rango.
  useEffect(() => {
    let cancel = false
    void getRechazosSnapshotData(reunionId).then((res) => {
      if (cancel) return
      if (!("error" in res)) {
        const snap = res.data.snapshot
        setSnapshot(snap)
        setComparacion(res.data.comparacion)
        if (snap?.desde) {
          setDesde(snap.desde)
          setHasta(snap.hasta ?? snap.desde)
        }
      }
      setSnapInit(true)
    })
    return () => {
      cancel = true
    }
  }, [reunionId])

  // Datos en vivo del rango actual (se usan cuando NO se está viendo la foto).
  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    // Cuando desde === hasta es un solo día; si difieren, rango inclusivo.
    void getRechazosResumenDia(desde, desde === hasta ? undefined : hasta).then(
      (res) => {
        if (cancel) return
        if ("error" in res) {
          setError(res.error)
          setData(null)
        } else {
          setData(res.data)
        }
        setLoading(false)
      },
    )
    return () => {
      cancel = true
    }
  }, [desde, hasta])

  // ¿El rango actual coincide con el de la foto fijada? Si sí, mostramos la foto.
  const viendoFijado =
    !!snapshot &&
    desde === snapshot.desde &&
    hasta === (snapshot.hasta ?? snapshot.desde)

  // KPIs y motivos a renderizar: de la foto si la estamos viendo, si no en vivo.
  const kpis: VistaKpis | null = viendoFijado
    ? {
        tasa: snapshot.tasa,
        tasa_bultos: snapshot.tasa_bultos,
        hl_rechazados: snapshot.hl_rechazados,
        ventas_total_hl: snapshot.ventas_total_hl,
        bultos_rechazados: snapshot.bultos_rechazados,
        ventas_total_bultos: snapshot.ventas_total_bultos,
        eventos: snapshot.eventos,
        patentes_con_rechazo: snapshot.patentes_con_rechazo,
      }
    : (data?.kpis ?? null)
  const motivos: VistaMotivo[] = viendoFijado
    ? snapshot.motivos
    : (data?.top_motivos ?? [])

  const tasa = kpis?.tasa ?? null
  const cumple = tasa != null && tasa <= META_TASA
  const esRango = desde !== hasta
  const esOtroPeriodo = desde !== fechaReunion || hasta !== fechaReunion

  // Mostrar loading mientras no terminó la carga inicial de la foto, o mientras
  // se consulta en vivo (salvo que ya estemos mostrando la foto fijada).
  const cargando = !snapInit || (!viendoFijado && loading)

  // Handlers que mantienen desde <= hasta.
  function onDesde(v: string) {
    const nv = v || fechaReunion
    setDesde(nv)
    if (nv > hasta) setHasta(nv)
  }
  function onHasta(v: string) {
    const nv = v || fechaReunion
    setHasta(nv)
    if (nv < desde) setDesde(nv)
  }

  async function onFijar() {
    setFijando(true)
    setError(null)
    const res = await fijarRechazosSnapshot(reunionId, desde, hasta)
    setFijando(false)
    if ("error" in res) {
      setError(res.error)
      return
    }
    setSnapshot(res.data)
  }

  async function onQuitar() {
    if (!snapshot) return
    setFijando(true)
    setError(null)
    const res = await borrarRechazosSnapshot(reunionId)
    setFijando(false)
    if ("error" in res) {
      setError(res.error)
      return
    }
    setSnapshot(null)
  }

  const fijarLabel = viendoFijado ? "Re-fijar" : "Fijar este rango"

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-amber-900">
          <PackageX className="size-5 text-amber-600" />
          Rechazos
          {viendoFijado ? (
            <Badge className="gap-1 bg-emerald-600 text-[10px] font-normal hover:bg-emerald-600">
              <Pin className="size-3" />
              Fijado {fmtFechaCorta(snapshot.updated_at)}
            </Badge>
          ) : snapshot ? (
            <Badge variant="outline" className="text-[10px] font-normal text-amber-700">
              sin fijar · vista en vivo
            </Badge>
          ) : esRango ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              rango
            </Badge>
          ) : (
            esOtroPeriodo && (
              <Badge variant="outline" className="text-[10px] font-normal">
                fecha anterior
              </Badge>
            )
          )}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="rechazos-desde">
            Desde
          </label>
          <input
            id="rechazos-desde"
            type="date"
            value={desde}
            max={fechaReunion}
            onChange={(e) => onDesde(e.target.value)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <label className="text-xs text-muted-foreground" htmlFor="rechazos-hasta">
            Hasta
          </label>
          <input
            id="rechazos-hasta"
            type="date"
            value={hasta}
            min={desde}
            max={fechaReunion}
            onChange={(e) => onHasta(e.target.value)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {puedeEditar && (
            <>
              <Button
                size="sm"
                onClick={onFijar}
                disabled={fijando || cargando}
                className="bg-amber-600 hover:bg-amber-700"
                title="Congelar el rango filtrado como foto de esta reunión"
              >
                {fijando ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Pin className="mr-1.5 size-4" />
                )}
                {fijarLabel}
              </Button>
              {snapshot && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onQuitar}
                  disabled={fijando}
                  title="Quitar la foto fijada (volver a vista en vivo)"
                >
                  <PinOff className="size-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {cargando && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando rechazos…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!cargando && !error && kpis && (
          <>
            {/* KPIs principales: % de rechazo + bultos rechazados */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="% de rechazo (HL)"
                value={tasa == null ? "—" : `${tasa.toFixed(2)}%`}
                valueClassName={
                  tasa == null
                    ? "text-slate-400"
                    : cumple
                      ? "text-emerald-700"
                      : "text-red-700"
                }
                sub={
                  tasa == null
                    ? "sin ventas en el período"
                    : `${cumple ? "cumple" : "supera"} meta ${META_TASA}%` +
                      (kpis.tasa_bultos == null
                        ? ""
                        : ` · bultos ${kpis.tasa_bultos.toFixed(2)}%`)
                }
              />
              <KpiCard
                label="Bultos rechazados"
                value={formatInt(kpis.bultos_rechazados)}
                sub={`${formatInt(kpis.ventas_total_bultos)} bultos entregados`}
              />
              <KpiCard
                label="HL rechazados"
                value={formatHl(kpis.hl_rechazados)}
                sub={`${formatInt(kpis.eventos)} eventos · ${formatInt(
                  kpis.patentes_con_rechazo,
                )} patentes`}
              />
              <KpiCard
                label="HL entregados"
                value={formatHl(kpis.ventas_total_hl)}
                sub={esRango ? "total del período" : "total del día"}
              />
            </div>

            {/* Comparación contra la reunión Ventas-Logística anterior */}
            {comparacion && comparacion.anterior_tasa != null && (
              <ComparacionLinea
                actual={tasa}
                anterior={comparacion.anterior_tasa}
                fechaAnterior={comparacion.anterior_fecha}
              />
            )}

            {/* Por motivos */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Rechazos por motivo
                </h3>
                <span className="text-xs text-muted-foreground">
                  Top {motivos.length}
                </span>
              </div>
              <div className="rounded-md border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="w-24 text-right">Bultos</TableHead>
                      <TableHead className="w-24 text-right">HL</TableHead>
                      <TableHead className="w-20 text-right">Eventos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motivos.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground"
                        >
                          Sin rechazos para este período
                        </TableCell>
                      </TableRow>
                    )}
                    {motivos.map((m, i) => (
                      <TableRow
                        key={m.id_rechazo}
                        className="cursor-pointer hover:bg-amber-50/60"
                        onClick={() => abrirClientesMotivo(m.id_rechazo, m.ds_rechazo)}
                        title="Ver clientes que rechazaron por este motivo"
                      >
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight className="size-3.5 text-amber-500" />
                            {m.ds_rechazo}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {prettyCategoria(m.categoria)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatInt(m.bultos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatHl(m.hl)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(m.eventos)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {!esRango && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                >
                  <Maximize2 className="mr-1.5 size-4" />
                  Ver detalle completo
                </Button>
              </div>
            )}
          </>
        )}

        {/* Action Log acotado a Rechazos */}
        <ActionLogSeccion
          reunionId={reunionId}
          reunionTipo="logistica-ventas"
          seccion={SECCION_RECHAZOS}
          titulo="Rechazos"
          actividades={actividades}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onChanged={onActividadesChanged}
        />
      </CardContent>

      <RechazosDetalleDiaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fecha={desde}
      />

      {/* Drill-down: clientes que rechazaron por el motivo clickeado */}
      <Dialog
        open={motivoSel !== null}
        onOpenChange={(o) => {
          if (!o) {
            setMotivoSel(null)
            setClientes(null)
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Clientes que rechazaron — {motivoSel?.ds}
            </DialogTitle>
          </DialogHeader>
          {cargandoClientes ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Cargando clientes…
            </div>
          ) : (
            <div className="rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-20 text-right">Cód.</TableHead>
                    <TableHead className="w-24 text-right">Bultos</TableHead>
                    <TableHead className="w-24 text-right">HL</TableHead>
                    <TableHead className="w-20 text-right">Eventos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!clientes || clientes.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        Sin clientes para este motivo en el período.
                      </TableCell>
                    </TableRow>
                  )}
                  {(clientes ?? []).map((c, i) => (
                    <TableRow key={`${c.id_cliente ?? "x"}-${i}`}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.nombre_cliente}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.id_cliente ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatInt(c.bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatHl(c.hl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(c.eventos)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ComparacionLinea({
  actual,
  anterior,
  fechaAnterior,
}: {
  actual: number | null
  anterior: number
  fechaAnterior: string
}) {
  // Menos rechazo = mejor.
  const delta = actual == null ? null : actual - anterior
  const mejora = delta != null && delta <= 0
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        vs. reunión anterior ({fmtFechaCorta(fechaAnterior)}):
      </span>
      <span className="font-semibold tabular-nums">{anterior.toFixed(2)}%</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-semibold tabular-nums">
        {actual == null ? "—" : `${actual.toFixed(2)}%`}
      </span>
      {delta != null && (
        <Badge
          variant="outline"
          className={cn(
            "tabular-nums",
            mejora ? "text-emerald-700" : "text-red-700",
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(2)} pp {mejora ? "▼ mejora" : "▲ empeora"}
        </Badge>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          valueClassName ?? "text-slate-900",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
      )}
    </div>
  )
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}

function fmtFechaCorta(iso: string): string {
  // Acepta 'YYYY-MM-DD' o ISO con hora; devuelve dd/mm.
  const d = iso?.slice(0, 10)
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return ""
  const [, m, day] = d.split("-")
  return `${day}/${m}`
}

function prettyCategoria(c: string): string {
  return c
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (m) => m.toUpperCase())
}
