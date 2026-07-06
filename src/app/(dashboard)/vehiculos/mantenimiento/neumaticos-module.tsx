"use client"

import { useMemo, useState, useTransition } from "react"
import { createPortal } from "react-dom"
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
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CircleDot,
  ClipboardPlus,
  Crosshair,
  Gauge,
  Layers,
  Pencil,
  Plus,
  RotateCw,
  Ruler,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  asignarNeumatico,
  crearNeumaticosMasivo,
  crearYColocarNeumatico,
  darDeBajaNeumatico,
  eliminarAlineacion,
  eliminarNeumatico,
  quitarNeumatico,
  registrarAlineacion,
  registrarMedicionNeumatico,
  registrarRotacion,
  eliminarRotacion,
  setRotacionKm,
  type KmFlotaUnidad,
} from "@/actions/neumaticos"
import { createMantenimiento } from "@/actions/mantenimiento-vehiculos"
import {
  type Alineacion,
  type Neumatico,
  type NeumaticoTipo,
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
  type VidaNeumatico,
} from "@/lib/vehiculos/vida-neumaticos"
import { VEHICULO_TIPO_LABELS, type VehiculoTipo } from "@/types/database"

interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
  modelo?: string | null
  anio?: number | null
}

interface Props {
  neumaticos: Neumatico[]
  alineaciones: Alineacion[]
  kmFlota: Record<string, KmFlotaUnidad>
  rotaciones: Rotacion[]
  unidades: UnidadFlota[]
  rotacionKm: number
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

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)

// Última presión registrada de una cubierta (de su historial de mediciones).
function ultimaPresion(n: Neumatico): number | null {
  return n.mediciones?.find((m) => m.presion_psi != null)?.presion_psi ?? null
}

// Estado de la alineación según la próxima fecha programada.
// Estado de alineación considerando fecha Y km (vence lo que ocurra primero).
function estadoAlineacionConKm(
  ultima: Alineacion | null,
  kmActual: number | null
): { label: string; clase: string; faltanKm: number | null } {
  const faltanKm =
    ultima?.proxima_km != null && kmActual != null
      ? Math.round(ultima.proxima_km - kmActual)
      : null
  if (!ultima || (!ultima.proxima_fecha && ultima.proxima_km == null)) {
    return { label: "Sin programar", clase: "bg-slate-100 text-slate-600", faltanKm }
  }
  const hoy = new Date().toISOString().slice(0, 10)
  const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const vencidaFecha = ultima.proxima_fecha != null && ultima.proxima_fecha < hoy
  const vencidaKm = faltanKm != null && faltanKm <= 0
  if (vencidaFecha || vencidaKm)
    return { label: "Vencida", clase: "bg-red-100 text-red-700", faltanKm }
  const porFecha = ultima.proxima_fecha != null && ultima.proxima_fecha <= en30
  const porKm = faltanKm != null && faltanKm <= 2000
  if (porFecha || porKm)
    return { label: "Por vencer", clase: "bg-amber-100 text-amber-700", faltanKm }
  return { label: "Al día", clase: "bg-emerald-100 text-emerald-700", faltanKm }
}

export function NeumaticosModule({
  neumaticos,
  alineaciones,
  kmFlota,
  rotaciones,
  unidades,
  rotacionKm,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [cargaOpen, setCargaOpen] = useState(false)
  const [individualOpen, setIndividualOpen] = useState(false)
  const [montajeModo, setMontajeModo] = useState<"montar" | "desmontar" | null>(null)
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
  // Km base para contar la próxima rotación: SOLO desde la última rotación
  // registrada. Si no hay ninguna, la rotación queda "sin datos" (no se infiere
  // del km de instalación) y empieza a contar recién cuando se registra la
  // primera rotación.
  const baseRotacionKm = useMemo(() => {
    return ultimaRotacion?.km ?? null
  }, [ultimaRotacion])
  const rotEstado = rotacionEstado(baseRotacionKm, kmUnidad.kmActual, kmUnidad.kmDia, rotacionKm)

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
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setMontajeModo("montar")}>
            <ArrowDownToLine className="mr-1 size-4" /> Montar neumáticos
          </Button>
          <Button variant="outline" onClick={() => setMontajeModo("desmontar")}>
            <ArrowUpFromLine className="mr-1 size-4" /> Desmontar
          </Button>
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
            <div className="space-y-4">
              {/* Datos del vehículo (estilo Cloudfleet) */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-slate-50/60 p-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                <DatoVehiculo label="Vehículo" valor={unidad.dominio} destacado />
                <DatoVehiculo
                  label="Tipo"
                  valor={unidad.tipo ? VEHICULO_TIPO_LABELS[unidad.tipo] : "—"}
                />
                <DatoVehiculo label="Modelo" valor={unidad.modelo || "—"} />
                <DatoVehiculo label="Año" valor={unidad.anio != null ? String(unidad.anio) : "—"} />
                <DatoVehiculo
                  label="Odómetro actual"
                  valor={
                    kmUnidad.kmActual != null
                      ? `${fmtNum(Math.round(kmUnidad.kmActual))} km${kmUnidad.fecha ? ` [${fmtFecha(kmUnidad.fecha)}]` : ""}`
                      : "—"
                  }
                />
              </div>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <Diagrama
                  layout={layout}
                  porPosicion={porPosicion}
                  tipo={unidad?.tipo ?? null}
                  onPos={(pos) =>
                    puedeEditar &&
                    setPosDialog({ pos, actual: porPosicion.get(pos.code) ?? null })
                  }
                />
                <div className="space-y-2 text-xs text-slate-500">
                  <p className="font-medium text-slate-600">Convenciones</p>
                  <div className="space-y-1">
                    <LeyendaEje clase="border-amber-400" txt="Eje direccional" />
                    <LeyendaEje clase="border-emerald-500" txt="Eje de tracción" />
                    <LeyendaEje clase="border-slate-300" txt="Eje libre" />
                  </div>
                  <p className="pt-1 font-medium text-slate-600">Desgaste (chip de posición)</p>
                  <Leyenda color="bg-emerald-500" txt="Profundidad OK (> 5 mm)" />
                  <Leyenda color="bg-amber-400" txt="A vigilar (≤ 5 mm)" />
                  <Leyenda color="bg-red-500" txt={`Crítico (≤${PROFUNDIDAD_CRITICA_MM} mm)`} />
                  <Leyenda color="bg-slate-400" txt="Sin medición" />
                  <p className="pt-1 text-slate-400">
                    {puedeEditar
                      ? "Hacé clic en una posición para asignar / medir / dar de baja."
                      : "Vista de solo lectura."}
                  </p>
                </div>
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
                    <th className="text-right">mm gast.</th>
                    <th className="text-right">Km/mm</th>
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
                    // Desgaste acumulado y rendimiento km por mm (estilo Cloudfleet).
                    const mmGastados =
                      n.profundidad_inicial_mm != null && n.profundidad_actual_mm != null
                        ? Math.max(
                            Math.round((n.profundidad_inicial_mm - n.profundidad_actual_mm) * 10) / 10,
                            0
                          )
                        : null
                    const kmPorMm =
                      mmGastados != null && mmGastados > 0 && v?.kmRodados != null
                        ? Math.round(v.kmRodados / mmGastados)
                        : null
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
                          {mmGastados ?? "—"}
                        </td>
                        <td className="text-right tabular-nums text-slate-600">
                          {kmPorMm != null ? fmtNum(kmPorMm) : "—"}
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

      {/* Rotación + alineación de neumáticos (unificado) */}
      {unidad && (
        <RotacionCard
          unidad={unidad}
          layout={layout}
          porPosicion={porPosicion}
          rotEstado={rotEstado}
          ultimaRotacion={ultimaRotacion}
          rotaciones={rotacionesUnidad}
          alineaciones={alineacionesUnidad}
          ultimaAlineacion={ultimaAlineacion}
          kmActual={kmUnidad.kmActual}
          rotacionKm={rotacionKm}
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
      {montajeModo && (
        <MontajeDialog
          modo={montajeModo}
          unidades={unidades}
          unidadInicial={unidadSel}
          neumaticos={neumaticos}
          kmFlota={kmFlota}
          onClose={() => setMontajeModo(null)}
          onRefresh={refresh}
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

// Línea punteada de la leyenda de convenciones de ejes.
function LeyendaEje({ clase, txt }: { clase: string; txt: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("w-6 border-t-[3px] border-dashed", clase)} />
      <span>{txt}</span>
    </span>
  )
}

function DatoVehiculo({
  label,
  valor,
  destacado,
}: {
  label: string
  valor: string
  destacado?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("text-sm", destacado ? "font-bold text-slate-900" : "font-medium text-slate-700")}>
        {valor}
      </p>
    </div>
  )
}

// Color de la línea de eje según su función (convención estilo Cloudfleet:
// amarillo = direccional, verde = tracción, gris = eje libre).
const EJE_LINEA: Record<string, string> = {
  direccional: "border-amber-400",
  traccion: "border-emerald-500",
  libre: "border-slate-300",
}

// Silueta de la unidad vista desde arriba, estilo Cloudfleet: bastidor central
// rectangular con travesaños y una línea de eje punteada por cada fila de
// ruedas, coloreada según la función del eje.
function SiluetaUnidad({
  layout,
  tipo,
}: {
  layout: PosicionNeumatico[]
  tipo: VehiculoTipo | null
}) {
  // Filas de ruedas (ejes) con su función y el ancho que abarcan.
  const filas = [...new Set(layout.map((p) => p.y))]
    .sort((a, b) => a - b)
    .map((y) => {
      const enFila = layout.filter((p) => p.y === y)
      return {
        y,
        eje: enFila[0]?.eje ?? null,
        x1: Math.min(...enFila.map((p) => p.x)),
        x2: Math.max(...enFila.map((p) => p.x)),
      }
    })
  const conCabina = tipo !== "acoplado"
  // El bastidor termina poco después del último eje (no sigue hasta abajo).
  const bastidorTop = 2
  const bastidorBottom = Math.min((filas[filas.length - 1]?.y ?? 84) + 14, 98)
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Bastidor */}
      <div
        className="absolute inset-x-[34%] rounded-md border-2 border-slate-300 bg-white"
        style={{ top: `${bastidorTop}%`, height: `${bastidorBottom - bastidorTop}%` }}
      >
        {/* Largueros */}
        <div className="absolute inset-y-1 left-[18%] w-px bg-slate-200" />
        <div className="absolute inset-y-1 right-[18%] w-px bg-slate-200" />
        {/* Travesaños en cada eje */}
        {filas.map((f) => (
          <div
            key={f.y}
            className="absolute inset-x-0 h-1 -translate-y-1/2 bg-slate-200"
            style={{ top: `${((f.y - bastidorTop) / (bastidorBottom - bastidorTop)) * 100}%` }}
          />
        ))}
      </div>
      {/* Cabina (frente) con parabrisas */}
      {conCabina && (
        <div className="absolute inset-x-[30%] top-[4%] h-[11%] rounded-lg border border-slate-300 bg-slate-50 shadow-sm">
          <div className="absolute inset-x-1.5 top-1 h-1.5 rounded-full bg-sky-200/80" />
        </div>
      )}
      {/* Lanza de enganche (acoplado) */}
      {!conCabina && (
        <div className="absolute left-1/2 top-0 h-[10%] w-1 -translate-x-1/2 rounded-full bg-slate-300" />
      )}
      {/* Línea de eje punteada por fila de ruedas, coloreada por función */}
      {filas.map((f) => (
        <div
          key={f.y}
          className={cn(
            "absolute -translate-y-1/2 border-t-[3px] border-dashed",
            EJE_LINEA[f.eje ?? "libre"]
          )}
          style={{ top: `${f.y}%`, left: `${f.x1}%`, width: `${f.x2 - f.x1}%` }}
        />
      ))}
    </div>
  )
}

// Glifo de una cubierta vista desde arriba, estilo Cloudfleet: goma oscura con
// tacos de banda de rodamiento y canales, y un chip con la posición coloreado
// según el desgaste.
function TireGlyph({
  label,
  sub,
  eje,
  wearClass,
  empty,
  badge,
}: {
  label: string
  sub?: string | null
  eje: PosicionNeumatico["eje"]
  wearClass: string
  empty: boolean
  badge?: string | null
}) {
  const direccional = eje === "direccional"
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "relative h-16 w-11 rounded-[9px] transition-transform",
          empty
            ? "border-2 border-dashed border-slate-300 bg-white"
            : "shadow-md ring-1 ring-slate-900/40"
        )}
      >
        {!empty && (
          <svg viewBox="0 0 32 48" className="absolute inset-0 h-full w-full" aria-hidden>
            {/* Goma con sombreado cilíndrico (flancos más oscuros) */}
            <defs>
              <linearGradient id="tire-body" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#0f172a" />
                <stop offset="0.18" stopColor="#334155" />
                <stop offset="0.5" stopColor="#475569" />
                <stop offset="0.82" stopColor="#334155" />
                <stop offset="1" stopColor="#0f172a" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="32" height="48" rx="7" fill="url(#tire-body)" />
            {/* Tacos de la banda de rodamiento */}
            {Array.from({ length: 8 }, (_, i) => (
              <rect
                key={i}
                x="4"
                y={2.5 + i * 5.6}
                width="24"
                height="3.4"
                rx="1.2"
                fill="#1e293b"
                {...(direccional
                  ? { transform: `skewX(-12) translate(${(2.5 + i * 5.6 + 1.7) * 0.21} 0)` }
                  : {})}
              />
            ))}
            {/* Canales longitudinales */}
            <rect x="10.5" y="1" width="1.6" height="46" fill="#0f172a" opacity="0.85" />
            <rect x="19.9" y="1" width="1.6" height="46" fill="#0f172a" opacity="0.85" />
            {/* Brillo superior */}
            <rect x="3" y="1.5" width="26" height="4" rx="2" fill="#fff" opacity="0.10" />
          </svg>
        )}
        {/* Chip de posición coloreado por desgaste */}
        <span
          className={cn(
            "absolute left-1/2 top-1/2 flex h-[28px] min-w-[28px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1 text-[12px] font-bold leading-none ring-2",
            empty
              ? "bg-slate-50 text-slate-400 ring-white"
              : cn(wearClass, "text-white shadow ring-white/90")
          )}
        >
          {label}
        </span>
      </div>
      {sub && (
        <span className="mt-0.5 max-w-[60px] truncate text-[10px] font-medium leading-tight text-slate-600">
          {sub}
        </span>
      )}
      {badge && (
        <span className="mt-px rounded bg-sky-100 px-1 text-[8px] font-semibold leading-none text-sky-700">
          {badge}
        </span>
      )}
    </div>
  )
}

function Diagrama({
  layout,
  porPosicion,
  onPos,
  tipo,
}: {
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  onPos: (pos: PosicionNeumatico) => void
  tipo: VehiculoTipo | null
}) {
  return (
    <div className="relative aspect-[3/4] w-72 shrink-0">
      <SiluetaUnidad layout={layout} tipo={tipo} />
      {layout.map((p) => {
        const n = porPosicion.get(p.code)
        return (
          <button
            key={p.code}
            type="button"
            onClick={() => onPos(p)}
            title={`${p.label} · ${p.eje ?? "libre"}${n ? ` · ${n.numero || "s/n"} (${n.profundidad_actual_mm ?? "?"} mm${ultimaPresion(n) != null ? `, ${ultimaPresion(n)} psi` : ""})` : " · vacía"}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
          >
            <div className="transition-transform group-hover:scale-110">
              <TireGlyph
                label={p.label}
                sub={n ? n.numero || "s/n" : null}
                eje={p.eje}
                wearClass={n ? colorDesgaste(n.profundidad_actual_mm) : "bg-slate-400"}
                empty={!n}
              />
            </div>
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

// ==================== Montaje / Desmontaje con arrastre ====================

// Elemento que se está arrastrando (o quedó seleccionado con un toque):
// una cubierta del stock (para montar) o una instalada en el diagrama (para
// desmontar al stock).
type MontajeItem =
  | { origen: "stock"; n: Neumatico }
  | { origen: "diagrama"; n: Neumatico; pos: PosicionNeumatico }

// Pantalla de montaje/desmontaje: diagrama de la unidad + panel de stock al
// costado. Se opera arrastrando (mouse o dedo) o tocando cubierta y destino.
function MontajeDialog({
  modo,
  unidades,
  unidadInicial,
  neumaticos,
  kmFlota,
  onClose,
  onRefresh,
}: {
  modo: "montar" | "desmontar"
  unidades: UnidadFlota[]
  unidadInicial: string
  neumaticos: Neumatico[]
  kmFlota: Record<string, KmFlotaUnidad>
  onClose: () => void
  onRefresh: () => void
}) {
  const [unidadSel, setUnidadSel] = useState(unidadInicial)
  const unidad = unidades.find((u) => u.dominio === unidadSel) ?? null
  const layout = layoutDeTipo(unidad?.tipo ?? null)
  const stock = useMemo(
    () => neumaticos.filter((n) => n.estado === "stock"),
    [neumaticos]
  )
  const porPosicion = useMemo(() => {
    const m = new Map<string, Neumatico>()
    for (const n of neumaticos)
      if (n.estado === "instalado" && n.dominio === unidadSel && n.posicion)
        m.set(n.posicion, n)
    return m
  }, [neumaticos, unidadSel])
  const kmU = kmFlota[unidadSel] ?? { kmActual: null, kmDia: null, fecha: null }

  const [saving, setSaving] = useState(false)
  const [drag, setDrag] = useState<MontajeItem | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const [sel, setSel] = useState<MontajeItem | null>(null)

  const montar = async (n: Neumatico, pos: PosicionNeumatico) => {
    if (!unidad || saving) return
    if (porPosicion.get(pos.code)) {
      toast.error("Esa posición ya tiene una cubierta instalada")
      return
    }
    setSaving(true)
    const res = await asignarNeumatico({
      id: n.id,
      dominio: unidad.dominio,
      posicion: pos.code,
      eje: pos.eje,
      km_instalacion: kmU.kmActual != null ? Math.round(kmU.kmActual) : null,
      vida_util_km: VIDA_UTIL_DEFAULT_KM[n.tipo] ?? null,
    })
    setSaving(false)
    setSel(null)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(`Cubierta ${n.numero || "s/n"} montada en ${pos.label}`)
      onRefresh()
    }
  }

  const desmontar = async (n: Neumatico) => {
    if (saving) return
    setSaving(true)
    const res = await quitarNeumatico({ id: n.id })
    setSaving(false)
    setSel(null)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(`Cubierta ${n.numero || "s/n"} desmontada al stock`)
      onRefresh()
    }
  }

  // Arrastre con Pointer Events (funciona con mouse y touch). Si el puntero
  // no se mueve, el gesto cuenta como toque: selecciona / deselecciona.
  const startDrag = (item: MontajeItem) => (e: React.PointerEvent) => {
    if (saving) return
    e.preventDefault()
    const x0 = e.clientX
    const y0 = e.clientY
    let dragging = false
    const limpiar = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      setDrag(null)
      setGhost(null)
    }
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
        dragging = true
        setDrag(item)
      }
      if (dragging) setGhost({ x: ev.clientX, y: ev.clientY })
    }
    const up = (ev: PointerEvent) => {
      limpiar()
      if (!dragging) {
        // Toque: seleccionar (o deseleccionar si ya estaba)
        setSel((prev) => (prev && prev.n.id === item.n.id ? null : item))
        return
      }
      setSel(null)
      const drop =
        document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest?.("[data-drop]")
          ?.getAttribute("data-drop") ?? null
      if (drop === "stock" && item.origen === "diagrama") {
        void desmontar(item.n)
      } else if (drop?.startsWith("pos:") && item.origen === "stock") {
        const pos = layout.find((p) => p.code === drop.slice(4))
        if (pos) void montar(item.n, pos)
      }
    }
    const cancel = () => limpiar()
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
  }

  // Destinos resaltados según lo que se arrastra / seleccionó.
  const resaltaPosiciones = drag?.origen === "stock" || sel?.origen === "stock"
  const resaltaStock = drag?.origen === "diagrama" || sel?.origen === "diagrama"

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {modo === "montar" ? "Montar neumáticos" : "Desmontar neumáticos"}
            {unidad ? ` · ${unidad.dominio}` : ""}
          </DialogTitle>
          <DialogDescription>
            Deslizá una cubierta del stock a una posición vacía para montarla, o una del
            camión hacia el panel de stock para desmontarla. También podés tocar la
            cubierta y después tocar el destino.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-slate-500">Unidad</Label>
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
          {kmU.kmActual != null && (
            <span className="text-xs text-slate-400">
              {fmtNum(Math.round(kmU.kmActual))} km — al montar se usa este km de
              instalación y la vida útil default por tipo
            </span>
          )}
        </div>

        {!unidad ? (
          <p className="text-sm text-slate-500">Elegí una unidad.</p>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* Diagrama de la unidad */}
            <div className="relative aspect-[3/4] w-64 shrink-0 sm:w-72">
              <SiluetaUnidad layout={layout} tipo={unidad.tipo ?? null} />
              {layout.map((p) => {
                const n = porPosicion.get(p.code)
                if (n) {
                  return (
                    <div
                      key={p.code}
                      data-draggable
                      onPointerDown={startDrag({ origen: "diagrama", n, pos: p })}
                      title={`${p.label} · ${n.numero || "s/n"} — arrastrá al stock para desmontar`}
                      style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      className={cn(
                        "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none rounded-lg",
                        sel?.n.id === n.id && "ring-2 ring-sky-500 ring-offset-1",
                        drag?.n.id === n.id && "opacity-40"
                      )}
                    >
                      <TireGlyph
                        label={p.label}
                        sub={n.numero || "s/n"}
                        eje={p.eje}
                        wearClass={colorDesgaste(n.profundidad_actual_mm)}
                        empty={false}
                      />
                    </div>
                  )
                }
                return (
                  <button
                    key={p.code}
                    type="button"
                    data-drop={`pos:${p.code}`}
                    onClick={() => {
                      if (sel?.origen === "stock") void montar(sel.n, p)
                    }}
                    title={`${p.label} · vacía — soltá acá una cubierta del stock`}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg",
                      resaltaPosiciones && "ring-2 ring-emerald-500 ring-offset-1"
                    )}
                  >
                    <TireGlyph label={p.label} eje={p.eje} wearClass="bg-slate-400" empty />
                  </button>
                )
              })}
            </div>

            {/* Panel de stock (zona para soltar al desmontar) */}
            <div
              data-drop="stock"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-draggable]")) return
                if (sel?.origen === "diagrama") void desmontar(sel.n)
              }}
              className={cn(
                "min-h-48 w-full min-w-0 flex-1 rounded-lg border bg-slate-50/60 p-3 transition-colors",
                resaltaStock && "border-sky-400 bg-sky-50 ring-2 ring-sky-400"
              )}
            >
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <Layers className="size-4 text-slate-400" /> Stock ({stock.length})
                {resaltaStock && (
                  <span className="text-xs font-normal text-sky-600">
                    — soltá acá para desmontar
                  </span>
                )}
              </p>
              {stock.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No hay cubiertas en stock. Cargalas con “Carga individual” o “Carga
                  masiva”.
                </p>
              ) : (
                <div className="grid max-h-[48vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {stock.map((n) => (
                    <div
                      key={n.id}
                      data-draggable
                      onPointerDown={startDrag({ origen: "stock", n })}
                      title={`${n.numero || "s/n"} — arrastrá a una posición vacía para montar`}
                      className={cn(
                        "flex cursor-grab touch-none select-none flex-col items-center rounded-md border bg-white p-1.5 shadow-sm",
                        sel?.n.id === n.id && "ring-2 ring-emerald-500",
                        drag?.n.id === n.id && "opacity-40"
                      )}
                    >
                      <TireGlyph
                        label={n.numero || "s/n"}
                        sub={[TIPO_LABEL[n.tipo], n.medida].filter(Boolean).join(" · ")}
                        eje={null}
                        wearClass={colorDesgaste(n.profundidad_actual_mm)}
                        empty={false}
                      />
                      <span className="mt-0.5 text-[10px] tabular-nums text-slate-500">
                        {n.profundidad_actual_mm != null
                          ? `${n.profundidad_actual_mm} mm`
                          : "sin medición"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <span className="mr-auto text-xs text-slate-400">
            {saving ? "Guardando…" : sel ? `Seleccionada: ${sel.n.numero || "s/n"} — tocá el destino` : ""}
          </span>
          <Button variant="outline" onClick={onClose}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Fantasma que sigue al puntero durante el arrastre (portal al body:
          DialogContent tiene transform y rompería position:fixed) */}
      {drag &&
        ghost &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg"
            style={{ left: ghost.x, top: ghost.y }}
          >
            <TireGlyph
              label={drag.n.numero || "s/n"}
              eje={null}
              wearClass={colorDesgaste(drag.n.profundidad_actual_mm)}
              empty={false}
            />
          </div>,
          document.body
        )}
    </Dialog>
  )
}

// Fecha de HOY en horario local (evita el corrimiento de día de toISOString,
// que es UTC: a la noche en Argentina ya marca el día siguiente).
function hoyLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

// Genera una OT real (la misma que se crea en la pestaña Órdenes de Trabajo:
// N° correlativo automático, taller/costo opcionales). Al completarse esa OT,
// la rotación/alineación se registra sola en este módulo — carga única.
function GenerarOtNeumaticosDialog({
  dominio,
  kmActual,
  descripcionInicial,
  onClose,
  onDone,
}: {
  dominio: string
  kmActual: number | null
  descripcionInicial: string
  onClose: () => void
  onDone: () => void
}) {
  const [descripcion, setDescripcion] = useState(descripcionInicial)
  const [fecha, setFecha] = useState(hoyLocalISO())
  const [taller, setTaller] = useState("")
  const [costoMo, setCostoMo] = useState("")
  const [saving, setSaving] = useState(false)

  const generar = async () => {
    if (!descripcion.trim()) {
      toast.error("Falta la descripción del trabajo")
      return
    }
    setSaving(true)
    const res = await createMantenimiento({
      dominio,
      fecha,
      tipo: "preventivo",
      estado: "programado",
      odometro: kmActual != null ? Math.round(kmActual) : null,
      taller: taller.trim() || undefined,
      costo_mano_obra: costoMo ? Number(costoMo) : null,
      costo: costoMo ? Number(costoMo) : null,
      observaciones: "Generada desde Neumáticos",
      tareas: [{ descripcion: descripcion.trim() }],
    })
    setSaving(false)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(`OT #${res.data.numero_ot} generada (programada)`)
      onDone()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar OT · {dominio}</DialogTitle>
          <DialogDescription>
            Crea la orden en Órdenes de Trabajo con N° automático. Cuando la completes ahí,
            la rotación/alineación se registra sola en Neumáticos (no hace falta cargarla dos
            veces).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Trabajo a realizar</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Km (odómetro)</Label>
              <Input value={kmActual != null ? fmtNum(Math.round(kmActual)) : "—"} disabled />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Taller (opcional)</Label>
              <Input
                value={taller}
                onChange={(e) => setTaller(e.target.value)}
                placeholder="ej. Gomería Pozzi"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Mano de obra $ (opcional)</Label>
              <Input
                type="number"
                value={costoMo}
                onChange={(e) => setCostoMo(e.target.value)}
                placeholder="se puede cargar después"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={generar} disabled={saving}>
            {saving ? "Generando…" : "Generar OT"}
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
  const [modo, setModo] = useState<"nueva" | "stock">(stock.length > 0 ? "stock" : "nueva")
  const [stockSel, setStockSel] = useState("")
  const [kmInst, setKmInst] = useState(kmActual != null ? String(Math.round(kmActual)) : "")
  const [vidaUtil, setVidaUtil] = useState("")
  // Carga directa (compra y colocación, sin pasar por stock)
  const [tipoNueva, setTipoNueva] = useState<NeumaticoTipo>("nuevo")
  const [numeroNueva, setNumeroNueva] = useState("")
  const [marcaNueva, setMarcaNueva] = useState("")
  const [medidaNueva, setMedidaNueva] = useState("")
  const [profNueva, setProfNueva] = useState("")
  // Medición (posición ocupada)
  const [profMed, setProfMed] = useState("")
  const [kmMed, setKmMed] = useState(kmActual != null ? String(Math.round(kmActual)) : "")
  const [presion, setPresion] = useState("")
  // Baja
  const [motivoBaja, setMotivoBaja] = useState("")
  // OT de cambio anticipada
  const [genOtOpen, setGenOtOpen] = useState(false)

  const stockTire = stock.find((s) => s.id === stockSel) ?? null
  const vidaDefault =
    modo === "nueva"
      ? VIDA_UTIL_DEFAULT_KM[tipoNueva]
      : stockTire
        ? VIDA_UTIL_DEFAULT_KM[stockTire.tipo]
        : null

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
              : "Posición vacía — cargá una cubierta acá mismo o asigná una del stock."}
          </DialogDescription>
        </DialogHeader>

        {!actual ? (
          // ----- Posición vacía: cargar directo o asignar desde stock -----
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={modo === "nueva" ? "default" : "outline"}
                onClick={() => setModo("nueva")}
              >
                Cargar cubierta acá
              </Button>
              <Button
                type="button"
                size="sm"
                variant={modo === "stock" ? "default" : "outline"}
                onClick={() => setModo("stock")}
                disabled={stock.length === 0}
              >
                Del stock ({stock.length})
              </Button>
            </div>

            {modo === "nueva" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Estado</Label>
                    <Select value={tipoNueva} onValueChange={(v) => setTipoNueva((v as NeumaticoTipo) ?? "nuevo")}>
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
                    <Label className="text-xs text-slate-500">N° de cubierta (opcional)</Label>
                    <Input value={numeroNueva} onChange={(e) => setNumeroNueva(e.target.value)} placeholder="Ej: 45" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Marca</Label>
                    <Input value={marcaNueva} onChange={(e) => setMarcaNueva(e.target.value)} placeholder="Fate" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Medida</Label>
                    <Input value={medidaNueva} onChange={(e) => setMedidaNueva(e.target.value)} placeholder="295/80R22.5" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Prof. (mm)</Label>
                    <Input type="number" step="0.1" value={profNueva} onChange={(e) => setProfNueva(e.target.value)} />
                  </div>
                </div>
              </>
            ) : (
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
            )}

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
              {modo === "nueva" ? (
                <Button
                  disabled={saving}
                  onClick={() =>
                    wrap(
                      () =>
                        crearYColocarNeumatico({
                          dominio: unidad.dominio,
                          posicion: pos.code,
                          eje: pos.eje,
                          tipo: tipoNueva,
                          numero: numeroNueva,
                          marca: marcaNueva,
                          medida: medidaNueva,
                          profundidad_inicial_mm: profNueva ? Number(profNueva) : null,
                          km_instalacion: kmInst ? Number(kmInst) : null,
                          vida_util_km: vidaUtil ? Number(vidaUtil) : vidaDefault,
                        }),
                      "Cubierta cargada e instalada"
                    )
                  }
                >
                  Cargar e instalar
                </Button>
              ) : (
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
              )}
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
              onClick={() => setGenOtOpen(true)}
            >
              <ClipboardPlus className="size-4" /> Generar OT de cambio
            </Button>
            {genOtOpen && (
              <GenerarOtNeumaticosDialog
                dominio={unidad.dominio}
                kmActual={kmActual}
                descripcionInicial={`Cambio de neumático posición ${pos.label}${actual.numero ? ` (N° ${actual.numero})` : ""}`}
                onClose={() => setGenOtOpen(false)}
                onDone={() => {
                  setGenOtOpen(false)
                  onDone()
                }}
              />
            )}

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
  alineaciones,
  ultimaAlineacion,
  kmActual,
  rotacionKm,
  puedeEditar,
  onRefresh,
}: {
  unidad: UnidadFlota
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  rotEstado: ReturnType<typeof rotacionEstado>
  ultimaRotacion: Rotacion | null
  rotaciones: Rotacion[]
  alineaciones: Alineacion[]
  ultimaAlineacion: Alineacion | null
  kmActual: number | null
  rotacionKm: number
  puedeEditar: boolean
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [alinOpen, setAlinOpen] = useState(false)
  const [intervaloOpen, setIntervaloOpen] = useState(false)
  // Descripción prellenada de la OT a generar (null = diálogo cerrado)
  const [genOtDesc, setGenOtDesc] = useState<string | null>(null)
  const sugerida = rotacionSugerida(unidad.tipo)
  const badge = ROT_BADGE[rotEstado.estado] ?? ROT_BADGE.sin_datos
  const alin = estadoAlineacionConKm(ultimaAlineacion, kmActual)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCw className="size-4 text-slate-500" /> Rotación y alineación · {unidad.dominio}
        </CardTitle>
        {puedeEditar && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 size-4" /> Registrar rotación
            </Button>
            <Button size="sm" onClick={() => setGenOtDesc("Rotación de neumáticos")}>
              <ClipboardPlus className="mr-1 size-4" /> OT rotación
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contador de próxima rotación */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Badge className={cn("border-0", badge.clase)}>{badge.label}</Badge>
          <span className="flex items-center gap-1 text-slate-500">
            Cada <span className="font-medium text-slate-700">{fmtNum(rotacionKm)} km</span>
            {puedeEditar && (
              <button
                type="button"
                onClick={() => setIntervaloOpen(true)}
                title="Editar el intervalo de km (rotación y alineación)"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
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
            <RotacionDiagrama
              layout={layout}
              porPosicion={porPosicion}
              sugerida={sugerida}
              tipo={unidad.tipo}
            />
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

        {/* ---- Alineación ---- */}
        <div className="border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Crosshair className="size-4 text-slate-500" /> Alineación y balanceo
            </p>
            {puedeEditar && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAlinOpen(true)}>
                  <Plus className="mr-1 size-4" /> Registrar alineación
                </Button>
                <Button
                  size="sm"
                  onClick={() => setGenOtDesc("Alineación y balanceo de neumáticos")}
                >
                  <ClipboardPlus className="mr-1 size-4" /> OT alineación
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* Numeración de las cubiertas de la unidad (igual al diagrama de arriba) */}
            <DiagramaNumeracion layout={layout} porPosicion={porPosicion} tipo={unidad.tipo} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <Badge className={cn("border-0", alin.clase)}>{alin.label}</Badge>
              <span className="text-slate-500">
                Última:{" "}
                <span className="font-medium text-slate-700">
                  {ultimaAlineacion ? fmtFecha(ultimaAlineacion.fecha) : "sin registro"}
                </span>
                {ultimaAlineacion?.km != null && <span> · {fmtNum(ultimaAlineacion.km)} km</span>}
              </span>
              {(ultimaAlineacion?.proxima_fecha || ultimaAlineacion?.proxima_km != null) && (
                <span className="text-slate-500">
                  Próxima:{" "}
                  <span className="font-medium text-slate-700">
                    {fmtFecha(ultimaAlineacion?.proxima_fecha ?? null)}
                  </span>
                  {ultimaAlineacion?.proxima_km != null && (
                    <span> · {fmtNum(ultimaAlineacion.proxima_km)} km</span>
                  )}
                  {alin.faltanKm != null && (
                    <span className={cn(alin.faltanKm <= 0 ? "text-red-600" : "text-slate-500")}>
                      {" "}
                      ({alin.faltanKm <= 0 ? "vencida" : `faltan ${fmtNum(alin.faltanKm)} km`})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {alineaciones.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2">Fecha</th>
                    <th className="text-right">Km</th>
                    <th>Próxima</th>
                    <th className="text-right">Próx. km</th>
                    <th>Proveedor</th>
                    <th className="text-right">Costo</th>
                    <th>Observaciones</th>
                    {puedeEditar && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {alineaciones.map((a, i) => (
                    <tr
                      key={a.id}
                      className={cn("border-b last:border-0", i % 2 === 1 && "bg-slate-50/60")}
                    >
                      <td className="py-2 font-medium">{fmtFecha(a.fecha)}</td>
                      <td className="text-right tabular-nums text-slate-600">{fmtNum(a.km)}</td>
                      <td className="text-slate-600">{fmtFecha(a.proxima_fecha)}</td>
                      <td className="text-right tabular-nums text-slate-600">
                        {fmtNum(a.proxima_km)}
                      </td>
                      <td className="text-slate-600">{a.proveedor || "—"}</td>
                      <td className="text-right tabular-nums text-slate-600">
                        {a.costo != null ? fmtMoney(Number(a.costo)) : "—"}
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
        </div>
      </CardContent>

      {open && (
        <RegistrarRotacionDialog
          dominio={unidad.dominio}
          kmActual={kmActual}
          rotacionKm={rotacionKm}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            onRefresh()
          }}
        />
      )}
      {alinOpen && (
        <AlineacionDialog
          dominio={unidad.dominio}
          onClose={() => setAlinOpen(false)}
          onDone={() => {
            setAlinOpen(false)
            onRefresh()
          }}
        />
      )}
      {intervaloOpen && (
        <IntervaloDialog
          actual={rotacionKm}
          onClose={() => setIntervaloOpen(false)}
          onDone={() => {
            setIntervaloOpen(false)
            onRefresh()
          }}
        />
      )}
      {genOtDesc != null && (
        <GenerarOtNeumaticosDialog
          dominio={unidad.dominio}
          kmActual={kmActual}
          descripcionInicial={genOtDesc}
          onClose={() => setGenOtDesc(null)}
          onDone={() => {
            setGenOtDesc(null)
            onRefresh()
          }}
        />
      )}
    </Card>
  )
}

// Diagrama de solo lectura: muestra cada posición con el número de su cubierta
// (igual al diagrama principal de la unidad, sin acciones).
function DiagramaNumeracion({
  layout,
  porPosicion,
  tipo,
}: {
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  tipo: VehiculoTipo | null
}) {
  return (
    <div className="relative aspect-[3/4] w-60 shrink-0">
      <SiluetaUnidad layout={layout} tipo={tipo} />
      {layout.map((p) => {
        const n = porPosicion.get(p.code)
        return (
          <div
            key={p.code}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={`${p.label}${n ? ` · ${n.numero || "s/n"}` : " · vacía"}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <TireGlyph
              label={p.label}
              sub={n ? n.numero || "s/n" : null}
              eje={p.eje}
              wearClass={n ? colorDesgaste(n.profundidad_actual_mm) : "bg-slate-400"}
              empty={!n}
            />
          </div>
        )
      })}
    </div>
  )
}

// Edita el intervalo de km global (rotación y alineación).
function IntervaloDialog({
  actual,
  onClose,
  onDone,
}: {
  actual: number
  onClose: () => void
  onDone: () => void
}) {
  const [km, setKm] = useState(String(actual))
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    const valor = Number(km)
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Ingresá un intervalo de km válido")
      return
    }
    setSaving(true)
    const res = await setRotacionKm({ rotacion_km: valor })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Intervalo actualizado")
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Intervalo de rotación y alineación</DialogTitle>
          <DialogDescription>
            Cada cuántos km se programa la rotación y la alineación/balanceo de la flota.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs text-slate-500">Intervalo (km)</Label>
          <Input
            type="number"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="ej. 20000"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RotacionDiagrama({
  layout,
  porPosicion,
  sugerida,
  tipo,
}: {
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  sugerida: Record<string, string>
  tipo: VehiculoTipo | null
}) {
  return (
    <div className="relative aspect-[3/4] w-72 shrink-0">
      <SiluetaUnidad layout={layout} tipo={tipo} />
      {layout.map((p) => {
        const n = porPosicion.get(p.code)
        const dest = sugerida[p.code]
        return (
          <div
            key={p.code}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={`${p.label}${n ? ` · ${n.numero || "s/n"}` : " · vacía"}${dest ? ` → ${dest}` : ""}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <TireGlyph
              label={p.label}
              eje={p.eje}
              wearClass="bg-slate-500"
              empty={!n}
              badge={dest ? `→${dest}` : null}
            />
          </div>
        )
      })}
    </div>
  )
}

function RegistrarRotacionDialog({
  dominio,
  kmActual,
  rotacionKm,
  onClose,
  onDone,
}: {
  dominio: string
  kmActual: number | null
  rotacionKm: number
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
            {fmtNum(rotacionKm)} km).
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
  const [proveedor, setProveedor] = useState("")
  const [costo, setCosto] = useState("")
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
      proveedor,
      costo: costo ? Number(costo) : null,
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
          <div>
            <Label className="text-xs text-slate-500">Proveedor / gomería</Label>
            <Input
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="ej. Gomería del Centro"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Costo ($)</Label>
            <Input
              type="number"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="ej. 45000"
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
