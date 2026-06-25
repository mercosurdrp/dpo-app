"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowRight,
  CircleDot,
  ClipboardPlus,
  Crosshair,
  Gauge,
  Layers,
  Plus,
  RotateCw,
  Ruler,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  asignarNeumatico,
  crearNeumaticosMasivo,
  darDeBajaNeumatico,
  eliminarAlineacion,
  eliminarNeumatico,
  generarOrdenNeumaticos,
  quitarNeumatico,
  registrarAlineacion,
  registrarMedicionNeumatico,
  registrarRotacion,
  eliminarRotacion,
  type KmFlotaUnidad,
} from "@/actions/neumaticos"
import {
  type Alineacion,
  type Neumatico,
  type Rotacion,
  PROFUNDIDAD_CRITICA_MM,
} from "@/lib/vehiculos/neumaticos-tipos"
import {
  layoutDeTipo,
  type PosicionNeumatico,
} from "@/lib/vehiculos/neumaticos-layout"
import {
  vidaNeumatico,
  rotacionEstado,
  rotacionSugerida,
  VIDA_BADGE,
  VIDA_UTIL_DEFAULT_KM,
  ROTACION_KM,
  type VidaNeumatico,
} from "@/lib/vehiculos/vida-neumaticos"
import type { VehiculoTipo } from "@/types/database"

interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
}

interface Props {
  neumaticos: Neumatico[]
  alineaciones: Alineacion[]
  kmFlota: Record<string, KmFlotaUnidad>
  rotaciones: Rotacion[]
  unidades: UnidadFlota[]
  puedeEditar: boolean
}

const TIPO_LABEL: Record<string, string> = { nuevo: "Nuevo", recapado: "Recapado" }

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

// Color del relleno de una posición según el desgaste (profundidad mm).
function colorDesgaste(prof: number | null): string {
  if (prof == null) return "bg-slate-400"
  if (prof <= PROFUNDIDAD_CRITICA_MM) return "bg-red-500"
  if (prof <= 5) return "bg-amber-400"
  return "bg-emerald-500"
}

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR").format(n)

// Última presión registrada de una cubierta (de su historial de mediciones).
function ultimaPresion(n: Neumatico): number | null {
  return n.mediciones?.find((m) => m.presion_psi != null)?.presion_psi ?? null
}

// Estado de la alineación según la próxima fecha programada.
function estadoAlineacion(proximaFecha: string | null): {
  label: string
  clase: string
} {
  if (!proximaFecha) return { label: "Sin programar", clase: "bg-slate-100 text-slate-600" }
  const hoy = new Date().toISOString().slice(0, 10)
  const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  if (proximaFecha < hoy) return { label: "Vencida", clase: "bg-red-100 text-red-700" }
  if (proximaFecha <= en30) return { label: "Por vencer", clase: "bg-amber-100 text-amber-700" }
  return { label: "Al día", clase: "bg-emerald-100 text-emerald-700" }
}

export function NeumaticosModule({
  neumaticos,
  alineaciones,
  kmFlota,
  rotaciones,
  unidades,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [cargaOpen, setCargaOpen] = useState(false)
  const [individualOpen, setIndividualOpen] = useState(false)
  const [alinOpen, setAlinOpen] = useState(false)
  const [unidadSel, setUnidadSel] = useState<string>(unidades[0]?.dominio ?? "")
  const [posDialog, setPosDialog] = useState<{
    pos: PosicionNeumatico
    actual: Neumatico | null
  } | null>(null)

  const stock = useMemo(
    () => neumaticos.filter((n) => n.estado === "stock"),
    [neumaticos]
  )
  const bajas = useMemo(
    () =>
      neumaticos
        .filter((n) => n.estado === "baja")
        .sort((a, b) => (b.fecha_baja ?? "").localeCompare(a.fecha_baja ?? "")),
    [neumaticos]
  )

  const unidad = unidades.find((u) => u.dominio === unidadSel) ?? null
  const layout = layoutDeTipo(unidad?.tipo ?? null)
  const instaladasEnUnidad = useMemo(
    () => neumaticos.filter((n) => n.estado === "instalado" && n.dominio === unidadSel),
    [neumaticos, unidadSel]
  )
  const porPosicion = useMemo(() => {
    const m = new Map<string, Neumatico>()
    for (const n of instaladasEnUnidad) if (n.posicion) m.set(n.posicion, n)
    return m
  }, [instaladasEnUnidad])

  // Cubiertas instaladas ordenadas según el layout del diagrama de la unidad.
  const instaladasOrden = useMemo(() => {
    const orden = new Map(layout.map((p, i) => [p.code, i]))
    return [...instaladasEnUnidad].sort(
      (a, b) =>
        (orden.get(a.posicion ?? "") ?? 99) - (orden.get(b.posicion ?? "") ?? 99)
    )
  }, [instaladasEnUnidad, layout])

  const alineacionesUnidad = useMemo(
    () =>
      alineaciones
        .filter((a) => a.dominio === unidadSel)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [alineaciones, unidadSel]
  )
  const ultimaAlineacion = alineacionesUnidad[0] ?? null

  // Km actual / tasa de la unidad (de las lecturas diarias) para la vida útil.
  const kmUnidad = kmFlota[unidadSel] ?? { kmActual: null, kmDia: null, fecha: null }

  // Vida útil estimada por cubierta instalada en la unidad.
  const vidaPorId = useMemo(() => {
    const m = new Map<string, VidaNeumatico>()
    for (const n of instaladasEnUnidad)
      m.set(n.id, vidaNeumatico(n, kmUnidad.kmActual, kmUnidad.kmDia))
    return m
  }, [instaladasEnUnidad, kmUnidad.kmActual, kmUnidad.kmDia])

  const vidaResumenUnidad = useMemo(() => {
    let cambiar = 0
    let proximo = 0
    for (const v of vidaPorId.values()) {
      if (v.estado === "cambiar") cambiar++
      else if (v.estado === "proximo") proximo++
    }
    return { cambiar, proximo }
  }, [vidaPorId])

  // Rotaciones de la unidad + estado de la próxima rotación.
  const rotacionesUnidad = useMemo(
    () =>
      rotaciones
        .filter((r) => r.dominio === unidadSel)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [rotaciones, unidadSel]
  )
  const ultimaRotacion = rotacionesUnidad[0] ?? null
  // Km base para contar la próxima rotación: última rotación, o el km de
  // instalación más reciente de las cubiertas instaladas, o el km actual.
  const baseRotacionKm = useMemo(() => {
    if (ultimaRotacion?.km != null) return ultimaRotacion.km
    const kmsInst = instaladasEnUnidad
      .map((n) => n.km_instalacion)
      .filter((k): k is number => k != null)
    if (kmsInst.length > 0) return Math.max(...kmsInst)
    return kmUnidad.kmActual
  }, [ultimaRotacion, instaladasEnUnidad, kmUnidad.kmActual])
  const rotEstado = rotacionEstado(baseRotacionKm, kmUnidad.kmActual, kmUnidad.kmDia)

  const resumen = useMemo(() => {
    let instalados = 0
    let criticos = 0
    for (const n of neumaticos) {
      if (n.estado !== "instalado") continue
      instalados++
      if (n.profundidad_actual_mm != null && n.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM)
        criticos++
    }
    return { stock: stock.length, instalados, criticos, bajas: bajas.length }
  }, [neumaticos, stock.length, bajas.length])

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ResumenCard label="En stock" value={resumen.stock} tono="info" />
        <ResumenCard label="Instaladas" value={resumen.instalados} tono="info" />
        <ResumenCard label="Desgaste crítico" value={resumen.criticos} tono="danger" />
        <ResumenCard label="Bajas (total)" value={resumen.bajas} tono="muted" />
      </div>

      {puedeEditar && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIndividualOpen(true)}>
            <Plus className="mr-1 size-4" /> Carga individual
          </Button>
          <Button onClick={() => setCargaOpen(true)}>
            <Plus className="mr-1 size-4" /> Carga masiva
          </Button>
        </div>
      )}

      {/* Diagrama por unidad */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDot className="size-4 text-slate-500" /> Diagrama de la unidad
          </CardTitle>
          <Select value={unidadSel} onValueChange={(v) => setUnidadSel(v ?? "")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Unidad" />
            </SelectTrigger>
            <SelectContent>
              {unidades.map((u) => (
                <SelectItem key={u.dominio} value={u.dominio}>
                  {u.dominio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!unidad ? (
            <p className="text-sm text-slate-500">Elegí una unidad.</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Diagrama
                layout={layout}
                porPosicion={porPosicion}
                onPos={(pos) =>
                  puedeEditar &&
                  setPosDialog({ pos, actual: porPosicion.get(pos.code) ?? null })
                }
              />
              <div className="space-y-2 text-xs text-slate-500">
                <p className="font-medium text-slate-600">Referencias</p>
                <Leyenda color="bg-emerald-500" txt="Profundidad OK (> 5 mm)" />
                <Leyenda color="bg-amber-400" txt="A vigilar (≤ 5 mm)" />
                <Leyenda color="bg-red-500" txt={`Crítico (≤${PROFUNDIDAD_CRITICA_MM} mm)`} />
                <Leyenda color="bg-slate-400" txt="Sin medición" />
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-3 rounded-full ring-2 ring-blue-500" /> Direccional
                  </span>
                  <span className="ml-3 inline-flex items-center gap-1">
                    <span className="size-3 rounded-full ring-2 ring-slate-400" /> Tracción
                  </span>
                </div>
                <p className="pt-1 text-slate-400">
                  {puedeEditar
                    ? "Hacé clic en una posición para asignar / medir / dar de baja."
                    : "Vista de solo lectura."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle de cubiertas instaladas en la unidad */}
      {unidad && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Gauge className="size-4 text-slate-500" /> Cubiertas instaladas ·{" "}
              {unidad.dominio} ({instaladasOrden.length})
              {kmUnidad.kmActual != null && (
                <span className="text-xs font-normal text-slate-400">
                  · {fmtNum(kmUnidad.kmActual)} km actual
                  {kmUnidad.kmDia ? ` · ~${fmtNum(kmUnidad.kmDia)} km/día` : ""}
                </span>
              )}
              {vidaResumenUnidad.cambiar > 0 && (
                <Badge variant="outline" className={cn("text-xs", VIDA_BADGE.cambiar.clase)}>
                  {vidaResumenUnidad.cambiar} a cambiar
                </Badge>
              )}
              {vidaResumenUnidad.proximo > 0 && (
                <Badge variant="outline" className={cn("text-xs", VIDA_BADGE.proximo.clase)}>
                  {vidaResumenUnidad.proximo} próx.
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {instaladasOrden.length === 0 ? (
              <p className="text-sm text-slate-500">
                Esta unidad no tiene cubiertas instaladas.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2">Pos.</th>
                    <th>Número</th>
                    <th>Tipo</th>
                    <th>Marca</th>
                    <th>Medida</th>
                    <th className="text-right">Prof. inic.</th>
                    <th className="text-right">Prof. act.</th>
                    <th className="text-right">Presión</th>
                    <th>Instalación</th>
                    <th className="text-right">Km inst.</th>
                    <th className="text-right">Recorridos</th>
                    <th className="text-right">Restante (est.)</th>
                    <th className="text-right">Días (est.)</th>
                    <th>Vida útil</th>
                  </tr>
                </thead>
                <tbody>
                  {instaladasOrden.map((n, i) => {
                    const pres = ultimaPresion(n)
                    const v = vidaPorId.get(n.id)
                    return (
                      <tr
                        key={n.id}
                        className={cn("border-b last:border-0", i % 2 === 1 && "bg-slate-50/60")}
                      >
                        <td className="py-2 font-medium">{n.posicion || "—"}</td>
                        <td>{n.numero || "—"}</td>
                        <td>{TIPO_LABEL[n.tipo]}</td>
                        <td className="text-slate-600">{n.marca || "—"}</td>
                        <td className="text-slate-600">{n.medida || "—"}</td>
                        <td className="text-right tabular-nums text-slate-600">
                          {n.profundidad_inicial_mm ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "text-right tabular-nums font-medium",
                            n.profundidad_actual_mm != null &&
                              n.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM
                              ? "text-red-600"
                              : "text-slate-700"
                          )}
                        >
                          {n.profundidad_actual_mm ?? "—"}
                        </td>
                        <td className="text-right tabular-nums text-slate-600">
                          {pres != null ? `${pres} psi` : "—"}
                        </td>
                        <td className="text-slate-600">{fmtFecha(n.fecha_instalacion)}</td>
                        <td className="text-right tabular-nums text-slate-600">
                          {fmtNum(n.km_instalacion)}
                        </td>
                        <td className="text-right tabular-nums text-slate-600">
                          {v?.kmRodados != null ? `${fmtNum(v.kmRodados)} km` : "—"}
                        </td>
                        <td
                          className={cn(
                            "text-right tabular-nums",
                            v && v.kmRestante != null && v.kmRestante <= 0
                              ? "font-medium text-red-600"
                              : "text-slate-700"
                          )}
                        >
                          {v?.kmRestante != null ? `${fmtNum(v.kmRestante)} km` : "—"}
                        </td>
                        <td className="text-right tabular-nums text-slate-600">
                          {v?.diasRestantes != null ? `${fmtNum(v.diasRestantes)} d` : "—"}
                        </td>
                        <td>
                          {v && (
                            <Badge
                              variant="outline"
                              className={cn("text-xs", VIDA_BADGE[v.estado].clase)}
                            >
                              {VIDA_BADGE[v.estado].label}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alineación de la unidad */}
      {unidad && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crosshair className="size-4 text-slate-500" /> Alineación · {unidad.dominio}
            </CardTitle>
            {puedeEditar && (
              <Button variant="outline" size="sm" onClick={() => setAlinOpen(true)}>
                <Plus className="mr-1 size-4" /> Registrar alineación
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const est = estadoAlineacion(ultimaAlineacion?.proxima_fecha ?? null)
              return (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <Badge className={cn("border-0", est.clase)}>{est.label}</Badge>
                  <span className="text-slate-500">
                    Última:{" "}
                    <span className="font-medium text-slate-700">
                      {ultimaAlineacion ? fmtFecha(ultimaAlineacion.fecha) : "sin registro"}
                    </span>
                    {ultimaAlineacion?.km != null && (
                      <span className="text-slate-500">
                        {" "}
                        · {fmtNum(ultimaAlineacion.km)} km
                      </span>
                    )}
                  </span>
                  {ultimaAlineacion?.proxima_fecha && (
                    <span className="text-slate-500">
                      Próxima:{" "}
                      <span className="font-medium text-slate-700">
                        {fmtFecha(ultimaAlineacion.proxima_fecha)}
                      </span>
                      {ultimaAlineacion.proxima_km != null && (
                        <span> · {fmtNum(ultimaAlineacion.proxima_km)} km</span>
                      )}
                    </span>
                  )}
                </div>
              )
            })()}

            {alineacionesUnidad.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2">Fecha</th>
                      <th className="text-right">Km</th>
                      <th>Próxima</th>
                      <th className="text-right">Próx. km</th>
                      <th>Observaciones</th>
                      {puedeEditar && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody>
                    {alineacionesUnidad.map((a, i) => (
                      <tr
                        key={a.id}
                        className={cn("border-b last:border-0", i % 2 === 1 && "bg-slate-50/60")}
                      >
                        <td className="py-2 font-medium">{fmtFecha(a.fecha)}</td>
                        <td className="text-right tabular-nums text-slate-600">
                          {fmtNum(a.km)}
                        </td>
                        <td className="text-slate-600">{fmtFecha(a.proxima_fecha)}</td>
                        <td className="text-right tabular-nums text-slate-600">
                          {fmtNum(a.proxima_km)}
                        </td>
                        <td className="text-slate-600">{a.observaciones || "—"}</td>
                        {puedeEditar && (
                          <td className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-400 hover:text-red-600"
                              onClick={async () => {
                                const res = await eliminarAlineacion({ id: a.id })
                                if ("error" in res) toast.error(res.error)
                                else {
                                  toast.success("Alineación eliminada")
                                  refresh()
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rotación de neumáticos */}
      {unidad && (
        <RotacionCard
          unidad={unidad}
          layout={layout}
          porPosicion={porPosicion}
          rotEstado={rotEstado}
          ultimaRotacion={ultimaRotacion}
          rotaciones={rotacionesUnidad}
          kmActual={kmUnidad.kmActual}
          puedeEditar={puedeEditar}
          onRefresh={refresh}
        />
      )}

      {/* Stock */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-slate-500" /> Stock de cubiertas ({stock.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {stock.length === 0 ? (
            <p className="text-sm text-slate-500">No hay cubiertas en stock.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2">Número</th>
                  <th>Tipo</th>
                  <th>Marca</th>
                  <th>Medida</th>
                  <th className="text-right">Prof. (mm)</th>
                  <th>Ingreso</th>
                  {puedeEditar && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {stock.map((n, i) => (
                  <tr
                    key={n.id}
                    className={cn("border-b last:border-0", i % 2 === 1 && "bg-slate-50/60")}
                  >
                    <td className="py-2 font-medium">{n.numero || "—"}</td>
                    <td>{TIPO_LABEL[n.tipo]}</td>
                    <td className="text-slate-600">{n.marca || "—"}</td>
                    <td className="text-slate-600">{n.medida || "—"}</td>
                    <td className="text-right tabular-nums">
                      {n.profundidad_actual_mm ?? "—"}
                    </td>
                    <td className="text-slate-600">{fmtFecha(n.fecha_ingreso)}</td>
                    {puedeEditar && (
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-slate-400 hover:text-red-600"
                          onClick={async () => {
                            const res = await eliminarNeumatico({ id: n.id })
                            if ("error" in res) toast.error(res.error)
                            else {
                              toast.success("Cubierta eliminada")
                              refresh()
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Bajas */}
      {bajas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cubiertas dadas de baja ({bajas.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2">Número</th>
                  <th>Tipo</th>
                  <th>Medida</th>
                  <th>Fecha baja</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {bajas.map((n, i) => (
                  <tr
                    key={n.id}
                    className={cn("border-b last:border-0", i % 2 === 1 && "bg-slate-50/60")}
                  >
                    <td className="py-2 font-medium">{n.numero || "—"}</td>
                    <td>{TIPO_LABEL[n.tipo]}</td>
                    <td className="text-slate-600">{n.medida || "—"}</td>
                    <td className="text-slate-600">{fmtFecha(n.fecha_baja)}</td>
                    <td className="text-slate-600">{n.motivo_baja || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {cargaOpen && (
        <CargaMasivaDialog onClose={() => setCargaOpen(false)} onDone={refresh} />
      )}
      {individualOpen && (
        <CargaIndividualDialog
          onClose={() => setIndividualOpen(false)}
          onDone={refresh}
        />
      )}
      {alinOpen && unidad && (
        <AlineacionDialog
          dominio={unidad.dominio}
          onClose={() => setAlinOpen(false)}
          onDone={() => {
            setAlinOpen(false)
            refresh()
          }}
        />
      )}
      {posDialog && unidad && (
        <PosicionDialog
          unidad={unidad}
          pos={posDialog.pos}
          actual={posDialog.actual}
          stock={stock}
          kmActual={kmUnidad.kmActual}
          vida={posDialog.actual ? (vidaPorId.get(posDialog.actual.id) ?? null) : null}
          onClose={() => setPosDialog(null)}
          onDone={() => {
            setPosDialog(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ==================== Subcomponentes ====================

function ResumenCard({
  label,
  value,
  tono,
}: {
  label: string
  value: number
  tono: "info" | "danger" | "muted"
}) {
  const color =
    tono === "danger" && value > 0
      ? "text-red-600"
      : tono === "muted"
        ? "text-slate-500"
        : "text-slate-900"
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold", color)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function Leyenda({ color, txt }: { color: string; txt: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-full", color)} />
      <span>{txt}</span>
    </span>
  )
}

function Diagrama({
  layout,
  porPosicion,
  onPos,
}: {
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  onPos: (pos: PosicionNeumatico) => void
}) {
  return (
    <div className="relative aspect-[3/4] w-52 shrink-0">
      {/* Silueta de la unidad */}
      <div className="absolute inset-x-6 inset-y-2 rounded-2xl border-2 border-slate-300 bg-slate-50" />
      {/* Cabina (frente) */}
      <div className="absolute inset-x-12 top-3 h-8 rounded-lg border-2 border-slate-300 bg-white" />
      {layout.map((p) => {
        const n = porPosicion.get(p.code)
        const ring = p.eje === "direccional" ? "ring-blue-500" : "ring-slate-400"
        return (
          <button
            key={p.code}
            type="button"
            onClick={() => onPos(p)}
            title={`${p.label} · ${p.eje ?? "libre"}${n ? ` · ${n.numero || "s/n"} (${n.profundidad_actual_mm ?? "?"} mm${ultimaPresion(n) != null ? `, ${ultimaPresion(n)} psi` : ""})` : " · vacía"}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className={cn(
              "absolute flex size-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md text-[10px] font-semibold text-white ring-2 transition-transform hover:scale-110",
              ring,
              n ? colorDesgaste(n.profundidad_actual_mm) : "border-2 border-dashed border-slate-300 bg-white text-slate-400 ring-transparent"
            )}
          >
            <span>{p.label}</span>
            {n && (
              <span className="text-[8px] font-normal opacity-90">
                {n.profundidad_actual_mm ?? "?"}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CargaMasivaDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [tipo, setTipo] = useState<"nuevo" | "recapado">("nuevo")
  const [marca, setMarca] = useState("")
  const [medida, setMedida] = useState("")
  const [prof, setProf] = useState("")
  const [modo, setModo] = useState<"cantidad" | "numeros">("cantidad")
  const [cantidad, setCantidad] = useState("4")
  const [numeros, setNumeros] = useState("")
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    setSaving(true)
    const res = await crearNeumaticosMasivo({
      tipo,
      marca,
      medida,
      profundidad_inicial_mm: prof ? Number(prof) : null,
      cantidad: modo === "cantidad" ? Number(cantidad) : undefined,
      numeros: modo === "numeros" ? numeros.split(/[\n,]+/) : undefined,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(`${res.creados} cubierta(s) cargada(s) al stock`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carga masiva de cubiertas</DialogTitle>
          <DialogDescription>
            Ingresan al stock. Después las asignás a una unidad desde el diagrama.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "nuevo" | "recapado")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nuevo">Nuevo</SelectItem>
                  <SelectItem value="recapado">Recapado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Profundidad inicial (mm)</Label>
              <Input
                type="number"
                step="0.1"
                value={prof}
                onChange={(e) => setProf(e.target.value)}
                placeholder="ej. 14"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Marca</Label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="ej. Firestone" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Medida</Label>
              <Input value={medida} onChange={(e) => setMedida(e.target.value)} placeholder="ej. 295/80 R22.5" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant={modo === "cantidad" ? "default" : "outline"}
              onClick={() => setModo("cantidad")}
            >
              Por cantidad
            </Button>
            <Button
              type="button"
              size="sm"
              variant={modo === "numeros" ? "default" : "outline"}
              onClick={() => setModo("numeros")}
            >
              Por números
            </Button>
          </div>

          {modo === "cantidad" ? (
            <div>
              <Label className="text-xs text-slate-500">Cantidad de cubiertas</Label>
              <Input
                type="number"
                min="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <Label className="text-xs text-slate-500">
                Numeración (una por línea o separadas por coma)
              </Label>
              <Textarea
                rows={4}
                value={numeros}
                onChange={(e) => setNumeros(e.target.value)}
                placeholder={"AB123\nAB124\nAB125"}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Cargar al stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CargaIndividualDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [numero, setNumero] = useState("")
  const [tipo, setTipo] = useState<"nuevo" | "recapado">("nuevo")
  const [marca, setMarca] = useState("")
  const [medida, setMedida] = useState("")
  const [prof, setProf] = useState("")
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    setSaving(true)
    const res = await crearNeumaticosMasivo({
      tipo,
      marca,
      medida,
      profundidad_inicial_mm: prof ? Number(prof) : null,
      numeros: numero.trim() ? [numero.trim()] : undefined,
      cantidad: numero.trim() ? undefined : 1,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Cubierta cargada al stock")
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carga individual de cubierta</DialogTitle>
          <DialogDescription>
            Ingresa al stock. Después la asignás a una unidad desde el diagrama.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-slate-500">Número / serie</Label>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="ej. 1234"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "nuevo" | "recapado")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nuevo">Nuevo</SelectItem>
                <SelectItem value="recapado">Recapado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Marca</Label>
            <Input
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="ej. Bridgestone M736"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Medida</Label>
            <Input
              value={medida}
              onChange={(e) => setMedida(e.target.value)}
              placeholder="ej. 275/80R22.5"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-slate-500">Profundidad inicial (mm)</Label>
            <Input
              type="number"
              step="0.1"
              value={prof}
              onChange={(e) => setProf(e.target.value)}
              placeholder="ej. 14"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Cargar al stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PosicionDialog({
  unidad,
  pos,
  actual,
  stock,
  kmActual,
  vida,
  onClose,
  onDone,
}: {
  unidad: UnidadFlota
  pos: PosicionNeumatico
  actual: Neumatico | null
  stock: Neumatico[]
  kmActual: number | null
  vida: VidaNeumatico | null
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  // Asignación (posición vacía) — km de instalación prefijado con el km actual.
  const [stockSel, setStockSel] = useState("")
  const [kmInst, setKmInst] = useState(kmActual != null ? String(Math.round(kmActual)) : "")
  const [vidaUtil, setVidaUtil] = useState("")
  // Medición (posición ocupada)
  const [profMed, setProfMed] = useState("")
  const [kmMed, setKmMed] = useState(kmActual != null ? String(Math.round(kmActual)) : "")
  const [presion, setPresion] = useState("")
  // Baja
  const [motivoBaja, setMotivoBaja] = useState("")

  const stockTire = stock.find((s) => s.id === stockSel) ?? null
  const vidaDefault = stockTire ? VIDA_UTIL_DEFAULT_KM[stockTire.tipo] : null

  const wrap = async (fn: () => Promise<{ success: true } | { error: string }>, ok: string) => {
    setSaving(true)
    const res = await fn()
    setSaving(false)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(ok)
      onDone()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {unidad.dominio} · posición {pos.label}{" "}
            <Badge variant="outline" className="ml-1 align-middle text-[10px]">
              {pos.eje ?? "libre"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {actual
              ? `Cubierta ${actual.numero || "s/n"} (${TIPO_LABEL[actual.tipo]})`
              : "Posición vacía — asigná una cubierta del stock."}
          </DialogDescription>
        </DialogHeader>

        {!actual ? (
          // ----- Asignar desde stock -----
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500">Cubierta del stock</Label>
              <Select value={stockSel} onValueChange={(v) => setStockSel(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder={stock.length ? "Elegí una cubierta" : "Sin stock"} />
                </SelectTrigger>
                <SelectContent>
                  {stock.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {(n.numero || "s/n") +
                        ` · ${TIPO_LABEL[n.tipo]}` +
                        (n.medida ? ` · ${n.medida}` : "") +
                        (n.profundidad_actual_mm != null ? ` · ${n.profundidad_actual_mm}mm` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Km de instalación</Label>
                <Input type="number" value={kmInst} onChange={(e) => setKmInst(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Vida útil objetivo (km)</Label>
                <Input
                  type="number"
                  value={vidaUtil}
                  onChange={(e) => setVidaUtil(e.target.value)}
                  placeholder={vidaDefault != null ? `${vidaDefault} (default)` : "—"}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Desde el km de instalación se estima cuánto falta para el cambio. Si dejás la vida
              útil vacía, usa el default por tipo (nuevo {VIDA_UTIL_DEFAULT_KM.nuevo} / recapado{" "}
              {VIDA_UTIL_DEFAULT_KM.recapado} km).
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                disabled={saving || !stockSel}
                onClick={() =>
                  wrap(
                    () =>
                      asignarNeumatico({
                        id: stockSel,
                        dominio: unidad.dominio,
                        posicion: pos.code,
                        eje: pos.eje,
                        km_instalacion: kmInst ? Number(kmInst) : null,
                        vida_util_km: vidaUtil ? Number(vidaUtil) : vidaDefault,
                      }),
                    "Cubierta instalada"
                  )
                }
              >
                Instalar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // ----- Cubierta instalada: medir / quitar / baja -----
          <div className="space-y-4">
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <Ruler className="size-4 text-slate-400" />
                Profundidad actual: <span className="font-semibold">{actual.profundidad_actual_mm ?? "—"} mm</span>
                {vida && (
                  <Badge variant="outline" className={cn("text-xs", VIDA_BADGE[vida.estado].clase)}>
                    {VIDA_BADGE[vida.estado].label}
                  </Badge>
                )}
              </div>
              {vida && (
                <p className="mt-1 text-xs text-slate-500">
                  Vida útil objetivo {fmtNum(vida.vidaKm)} km ·{" "}
                  {vida.kmRodados != null ? `recorridos ${fmtNum(vida.kmRodados)} km · ` : ""}
                  {vida.kmRestante != null
                    ? `restante ~${fmtNum(vida.kmRestante)} km`
                    : "sin km para estimar"}
                  {vida.diasRestantes != null ? ` · ~${fmtNum(vida.diasRestantes)} días` : ""}
                </p>
              )}
              {actual.mediciones && actual.mediciones.length > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Últimas mediciones:{" "}
                  {actual.mediciones
                    .slice(0, 4)
                    .map((m) => `${m.profundidad_mm ?? "?"}mm (${fmtFecha(m.fecha)})`)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium text-slate-600">Registrar desgaste</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-500">Prof. (mm)</Label>
                  <Input type="number" step="0.1" value={profMed} onChange={(e) => setProfMed(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-500">Km</Label>
                  <Input type="number" value={kmMed} onChange={(e) => setKmMed(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-500">Presión</Label>
                  <Input type="number" value={presion} onChange={(e) => setPresion(e.target.value)} />
                </div>
              </div>
              <Button
                size="sm"
                disabled={saving || (!profMed && !kmMed && !presion)}
                onClick={() =>
                  wrap(
                    () =>
                      registrarMedicionNeumatico({
                        neumatico_id: actual.id,
                        profundidad_mm: profMed ? Number(profMed) : null,
                        km: kmMed ? Number(kmMed) : null,
                        presion_psi: presion ? Number(presion) : null,
                      }),
                    "Medición registrada"
                  )
                }
              >
                Guardar medición
              </Button>
            </div>

            <div className="space-y-2 rounded-md border border-red-100 p-3">
              <p className="text-xs font-medium text-slate-600">Dar de baja</p>
              <Input
                placeholder="Motivo (desgaste, pinchadura, etc.)"
                value={motivoBaja}
                onChange={(e) => setMotivoBaja(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={saving || !motivoBaja.trim()}
                onClick={() =>
                  wrap(
                    () => darDeBajaNeumatico({ id: actual.id, motivo: motivoBaja }),
                    "Cubierta dada de baja"
                  )
                }
              >
                Dar de baja
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1"
              disabled={saving}
              onClick={() =>
                wrap(
                  () =>
                    generarOrdenNeumaticos({
                      dominio: unidad.dominio,
                      descripcion: `Cambio de neumático posición ${pos.label}${actual.numero ? ` (N° ${actual.numero})` : ""}`,
                      km: kmActual,
                    }),
                  "OT de cambio generada (programada)"
                )
              }
            >
              <ClipboardPlus className="size-4" /> Generar OT de cambio
            </Button>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => wrap(() => quitarNeumatico({ id: actual.id }), "Cubierta enviada al stock")}
              >
                Quitar (al stock)
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const ROT_BADGE: Record<string, { label: string; clase: string }> = {
  ok: { label: "Al día", clase: "bg-emerald-100 text-emerald-700" },
  proximo: { label: "Próxima", clase: "bg-amber-100 text-amber-700" },
  vencido: { label: "Vencida", clase: "bg-red-100 text-red-700" },
  sin_datos: { label: "Sin datos", clase: "bg-slate-100 text-slate-600" },
}

function RotacionCard({
  unidad,
  layout,
  porPosicion,
  rotEstado,
  ultimaRotacion,
  rotaciones,
  kmActual,
  puedeEditar,
  onRefresh,
}: {
  unidad: UnidadFlota
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  rotEstado: ReturnType<typeof rotacionEstado>
  ultimaRotacion: Rotacion | null
  rotaciones: Rotacion[]
  kmActual: number | null
  puedeEditar: boolean
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const sugerida = rotacionSugerida(unidad.tipo)
  const badge = ROT_BADGE[rotEstado.estado] ?? ROT_BADGE.sin_datos

  const generarOT = async () => {
    setSaving(true)
    const res = await generarOrdenNeumaticos({
      dominio: unidad.dominio,
      descripcion: "Rotación de neumáticos",
      km: kmActual,
    })
    setSaving(false)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("OT de rotación generada (programada)")
      onRefresh()
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCw className="size-4 text-slate-500" /> Rotación de neumáticos · {unidad.dominio}
        </CardTitle>
        {puedeEditar && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 size-4" /> Registrar rotación
            </Button>
            <Button size="sm" disabled={saving} onClick={generarOT}>
              <ClipboardPlus className="mr-1 size-4" /> Generar OT
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contador de próxima rotación */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Badge className={cn("border-0", badge.clase)}>{badge.label}</Badge>
          <span className="text-slate-500">
            Cada <span className="font-medium text-slate-700">{fmtNum(ROTACION_KM)} km</span>
          </span>
          <span className="text-slate-500">
            Última:{" "}
            <span className="font-medium text-slate-700">
              {ultimaRotacion ? fmtFecha(ultimaRotacion.fecha) : "sin registro"}
            </span>
            {ultimaRotacion?.km != null && <span> · {fmtNum(ultimaRotacion.km)} km</span>}
          </span>
          <span className="text-slate-500">
            Próxima:{" "}
            <span className="font-medium text-slate-700">
              {rotEstado.proximaKm != null ? `${fmtNum(rotEstado.proximaKm)} km` : "—"}
            </span>
            {rotEstado.kmRestante != null && (
              <span
                className={cn(
                  rotEstado.kmRestante <= 0 ? "text-red-600" : "text-slate-500"
                )}
              >
                {" "}
                ({rotEstado.kmRestante <= 0 ? "vencida" : `faltan ${fmtNum(rotEstado.kmRestante)} km`}
                {rotEstado.diasRestantes != null && rotEstado.kmRestante > 0
                  ? ` · ~${fmtNum(rotEstado.diasRestantes)} días`
                  : ""}
                )
              </span>
            )}
          </span>
        </div>

        {/* Diagrama de rotación sugerida */}
        {Object.keys(sugerida).length > 0 ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <RotacionDiagrama layout={layout} porPosicion={porPosicion} sugerida={sugerida} />
            <div className="space-y-1 text-xs text-slate-500">
              <p className="font-medium text-slate-600">Rotación sugerida</p>
              {layout
                .filter((p) => sugerida[p.code])
                .map((p) => (
                  <p key={p.code} className="flex items-center gap-1">
                    <span className="font-medium text-slate-700">{p.label}</span>
                    <ArrowRight className="size-3 text-slate-400" />
                    <span className="font-medium text-slate-700">{sugerida[p.code]}</span>
                  </p>
                ))}
              <p className="pt-1 text-slate-400">
                Sugerencia para emparejar el desgaste. Ajustala según el estado real de cada
                cubierta.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            No hay un patrón de rotación sugerido para este tipo de unidad.
          </p>
        )}

        {/* Historial */}
        {rotaciones.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2">Fecha</th>
                  <th className="text-right">Km</th>
                  <th>Observaciones</th>
                  {puedeEditar && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {rotaciones.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn("border-b last:border-0", i % 2 === 1 && "bg-slate-50/60")}
                  >
                    <td className="py-2 font-medium">{fmtFecha(r.fecha)}</td>
                    <td className="text-right tabular-nums text-slate-600">{fmtNum(r.km)}</td>
                    <td className="text-slate-600">{r.observaciones || "—"}</td>
                    {puedeEditar && (
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-slate-400 hover:text-red-600"
                          onClick={async () => {
                            const res = await eliminarRotacion({ id: r.id })
                            if ("error" in res) toast.error(res.error)
                            else {
                              toast.success("Rotación eliminada")
                              onRefresh()
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {open && (
        <RegistrarRotacionDialog
          dominio={unidad.dominio}
          kmActual={kmActual}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            onRefresh()
          }}
        />
      )}
    </Card>
  )
}

function RotacionDiagrama({
  layout,
  porPosicion,
  sugerida,
}: {
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  sugerida: Record<string, string>
}) {
  return (
    <div className="relative aspect-[3/4] w-52 shrink-0">
      <div className="absolute inset-x-6 inset-y-2 rounded-2xl border-2 border-slate-300 bg-slate-50" />
      <div className="absolute inset-x-12 top-3 h-8 rounded-lg border-2 border-slate-300 bg-white" />
      {layout.map((p) => {
        const n = porPosicion.get(p.code)
        const dest = sugerida[p.code]
        return (
          <div
            key={p.code}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={`${p.label}${n ? ` · ${n.numero || "s/n"}` : " · vacía"}${dest ? ` → ${dest}` : ""}`}
            className={cn(
              "absolute flex size-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border-2 text-[10px] font-semibold",
              n
                ? "border-slate-300 bg-white text-slate-700"
                : "border-dashed border-slate-300 bg-white text-slate-400"
            )}
          >
            <span>{p.label}</span>
            {dest && (
              <span className="flex items-center text-[8px] font-normal text-sky-600">
                →{dest}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RegistrarRotacionDialog({
  dominio,
  kmActual,
  onClose,
  onDone,
}: {
  dominio: string
  kmActual: number | null
  onClose: () => void
  onDone: () => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [km, setKm] = useState(kmActual != null ? String(Math.round(kmActual)) : "")
  const [observaciones, setObservaciones] = useState("")
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    setSaving(true)
    const res = await registrarRotacion({
      dominio,
      fecha,
      km: km ? Number(km) : null,
      observaciones,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Rotación registrada")
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar rotación · {dominio}</DialogTitle>
          <DialogDescription>
            Queda como última rotación; desde su km se cuenta la próxima (cada{" "}
            {fmtNum(ROTACION_KM)} km).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-slate-500">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Km</Label>
            <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-slate-500">Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="ej. se cruzaron las traseras"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AlineacionDialog({
  dominio,
  onClose,
  onDone,
}: {
  dominio: string
  onClose: () => void
  onDone: () => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [km, setKm] = useState("")
  const [proximaFecha, setProximaFecha] = useState("")
  const [proximaKm, setProximaKm] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    setSaving(true)
    const res = await registrarAlineacion({
      dominio,
      fecha,
      km: km ? Number(km) : null,
      proxima_fecha: proximaFecha || null,
      proxima_km: proximaKm ? Number(proximaKm) : null,
      observaciones,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Alineación registrada")
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar alineación · {dominio}</DialogTitle>
          <DialogDescription>
            Cargá la alineación realizada y, opcionalmente, la próxima programada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-slate-500">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Km</Label>
            <Input
              type="number"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="ej. 155000"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Próxima alineación (fecha)</Label>
            <Input
              type="date"
              value={proximaFecha}
              onChange={(e) => setProximaFecha(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Próxima (km)</Label>
            <Input
              type="number"
              value={proximaKm}
              onChange={(e) => setProximaKm(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-slate-500">Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="ej. desgaste irregular en eje delantero"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
