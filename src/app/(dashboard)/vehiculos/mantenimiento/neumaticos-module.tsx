"use client"

import { useMemo, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  CircleDollarSign,
  CircleDot,
  ClipboardPlus,
  Crosshair,
  Gauge,
  Layers,
  FileDown,
  Paperclip,
  Pencil,
  Plus,
  RotateCw,
  Ruler,
  Scale,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  actualizarNeumatico,
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
  setIntervaloNeumaticos,
  type KmFlotaUnidad,
} from "@/actions/neumaticos"
import {
  createMantenimiento,
  subirFacturasMantenimiento,
} from "@/actions/mantenimiento-vehiculos"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import {
  type AccionNeumaticos,
  type Alineacion,
  type IntervaloNeumaticos,
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
import {
  VEHICULO_TIPO_LABELS,
  type MantenimientoPlanTarea,
  type MantenimientoRealizado,
  type MantenimientoTareaReprogramada,
  type VehiculoTipo,
} from "@/types/database"
import { DetalleOrdenDialog } from "./_components/detalle-orden-dialog"
import {
  ESTADO_MANT_BADGE,
  TIPO_MANT_BADGE,
  TIPO_MANT_LABEL,
  costoTotalOt,
} from "./_components/ot-formato"
import { MANTENIMIENTO_ESTADO_LABELS } from "@/types/database"
import type { LecturaSugerida } from "@/lib/vehiculos/lecturas"
import { HistorialLecturasMes } from "./_components/historial-lecturas-mes"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"

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
  /** Intervalo global (fallback para los tipos sin intervalo propio). */
  rotacionKm: number
  /** Intervalos por tipo de unidad y acción (camión: 50.000 km). */
  intervalos: IntervaloNeumaticos[]
  /** Lecturas del último mes por unidad (para cargar con fecha retroactiva). */
  historialLecturas: Record<string, LecturaSugerida[]>
  /** OT de rubro neumáticos (rotación, alineación, balanceo, reparación, recapado). */
  ordenes: MantenimientoRealizado[]
  tareasById: Map<string, MantenimientoPlanTarea>
  reprogramadas: MantenimientoTareaReprogramada[]
  puedeEditar: boolean
}

const TIPO_LABEL: Record<string, string> = { nuevo: "Nuevo", recapado: "Recapado" }

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

// Color del relleno de una posición según el desgaste (profundidad mm).
function colorDesgaste(prof: number | null): string {
  if (prof == null) return "bg-muted-foreground"
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

// Estado de alineación/balanceo considerando fecha Y km (vence lo que ocurra
// primero). Si el registro no trae una próxima explícita, se deriva del intervalo
// del tipo de unidad (camión: 50.000 km) sobre el km del último trabajo.
function estadoAlineacionConKm(
  ultima: Alineacion | null,
  kmActual: number | null,
  intervaloKm?: number
): { label: string; clase: string; faltanKm: number | null; proximaKm: number | null } {
  const proximaKm =
    ultima?.proxima_km ??
    (ultima?.km != null && intervaloKm ? Math.round(ultima.km + intervaloKm) : null)
  const faltanKm =
    proximaKm != null && kmActual != null ? Math.round(proximaKm - kmActual) : null
  if (!ultima || (!ultima.proxima_fecha && proximaKm == null)) {
    return {
      label: "Sin programar",
      clase: "bg-muted text-muted-foreground",
      faltanKm,
      proximaKm,
    }
  }
  const hoy = new Date().toISOString().slice(0, 10)
  const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const vencidaFecha = ultima.proxima_fecha != null && ultima.proxima_fecha < hoy
  const vencidaKm = faltanKm != null && faltanKm <= 0
  if (vencidaFecha || vencidaKm)
    return { label: "Vencida", clase: "bg-destructive/10 text-destructive", faltanKm, proximaKm }
  const porFecha = ultima.proxima_fecha != null && ultima.proxima_fecha <= en30
  const porKm = faltanKm != null && faltanKm <= 2000
  if (porFecha || porKm)
    return {
      label: "Por vencer",
      clase: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      faltanKm,
      proximaKm,
    }
  return {
    label: "Al día",
    clase: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    faltanKm,
    proximaKm,
  }
}

export function NeumaticosModule({
  neumaticos,
  alineaciones,
  kmFlota,
  rotaciones,
  unidades,
  rotacionKm,
  intervalos,
  historialLecturas,
  ordenes,
  tareasById,
  reprogramadas,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [cargaOpen, setCargaOpen] = useState(false)
  const [editNeu, setEditNeu] = useState<Neumatico | null>(null)
  const [detalleResumen, setDetalleResumen] = useState<
    "stock" | "instaladas" | "criticas" | "bajas" | null
  >(null)
  const [montajeOpen, setMontajeOpen] = useState(false)
  const [unidadSel, setUnidadSel] = useState<string>(unidades[0]?.dominio ?? "")
  const [posDialog, setPosDialog] = useState<{
    pos: PosicionNeumatico
    actual: Neumatico | null
  } | null>(null)
  const [tabUnidad, setTabUnidad] = useState("diagrama")

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

  // OT de neumáticos de la unidad elegida (ya vienen cargadas contra su patente).
  const ordenesUnidad = useMemo(
    () => ordenes.filter((o) => o.dominio === unidadSel),
    [ordenes, unidadSel]
  )
  // Cubiertas de esta unidad (para sus compras y costos).
  const cubiertasUnidad = useMemo(
    () => neumaticos.filter((n) => n.dominio === unidadSel),
    [neumaticos, unidadSel]
  )

  // Rotaciones de la unidad (el estado de la próxima se calcula en el diagrama,
  // que es quien conoce el intervalo de la acción elegida).
  const rotacionesUnidad = useMemo(
    () =>
      rotaciones
        .filter((r) => r.dominio === unidadSel)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [rotaciones, unidadSel]
  )

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
      <DpoSeccionCinta seccionId="neumaticos" />

      {/* Resumen — cada tarjeta abre el detalle de sus cubiertas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="En stock"
          valor={resumen.stock}
          sub="Cubiertas disponibles para montar · click para ver"
          onClick={() => setDetalleResumen("stock")}
        />
        <KpiCard
          label="Instaladas"
          valor={resumen.instalados}
          sub="Cubiertas rodando en la flota · click para ver"
          onClick={() => setDetalleResumen("instaladas")}
        />
        <KpiCard
          label="Desgaste crítico"
          valor={resumen.criticos}
          sub={`Profundidad ≤ ${PROFUNDIDAD_CRITICA_MM} mm · click para ver`}
          estado={resumen.criticos > 0 ? "critico" : "ok"}
          dpo="3.4"
          onClick={() => setDetalleResumen("criticas")}
        />
        <KpiCard
          label="Bajas (total)"
          valor={resumen.bajas}
          sub="Cubiertas dadas de baja · click para ver"
          onClick={() => setDetalleResumen("bajas")}
        />
      </div>

      {puedeEditar && (
        <div className="flex flex-wrap justify-end gap-2">
          {/* Un solo acceso: adentro se elige qué hacer con cada posición
              (montar del stock, cargar una nueva o desmontar). */}
          <Button variant="outline" onClick={() => setMontajeOpen(true)}>
            <ArrowDownToLine className="mr-1 size-4" /> Montar / desmontar
          </Button>
          <Button onClick={() => setCargaOpen(true)}>
            <Plus className="mr-1 size-4" /> Cargar cubiertas
          </Button>
        </div>
      )}

      {/* Inspección mensual: ronda de profundidad + presión de toda la flota */}
      <InspeccionMensualCard
        neumaticos={neumaticos}
        unidades={unidades}
        dominioSel={unidadSel}
        onIrAUnidad={(dominio) => {
          setUnidadSel(dominio)
          document
            .getElementById("diagrama-unidad")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }}
      />

      {/* Diagrama por unidad */}
      <Card id="diagrama-unidad">
        {/* La unidad se elige en "Inspección mensual" (arriba): ahí están todas
            listadas y el click trae hasta acá, así que no hace falta un segundo
            selector. */}
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDot className="size-4 text-muted-foreground" /> Diagrama de la unidad
            {unidad && <span className="text-muted-foreground">· {unidad.dominio}</span>}
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Elegí la unidad en <span className="font-medium text-foreground">Inspección mensual</span>.
          </p>
        </CardHeader>
        <CardContent>
          {!unidad ? (
            <p className="text-sm text-muted-foreground">Elegí una unidad.</p>
          ) : (
            <div className="space-y-4">
              {/* Datos del vehículo (estilo Cloudfleet) */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
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

              {/* Todo lo de la unidad en pestañas: el diagrama, sus OT de
                  neumáticos y sus compras. Antes esas dos eran tablas globales al
                  pie de la página y la hacían larguísima. */}
              <Tabs value={tabUnidad} onValueChange={setTabUnidad}>
                <TabsList>
                  <TabsTrigger value="diagrama">Diagrama</TabsTrigger>
                  <TabsTrigger value="ot">
                    Órdenes de trabajo ({ordenesUnidad.length})
                  </TabsTrigger>
                  <TabsTrigger value="compras">
                    Compras y costos ({cubiertasUnidad.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="diagrama" className="pt-4">
                  <DiagramaConAcciones
                    unidad={unidad}
                    layout={layout}
                    porPosicion={porPosicion}
                    kmActual={kmUnidad.kmActual}
                    kmDia={kmUnidad.kmDia}
                    rotaciones={rotacionesUnidad}
                    alineaciones={alineacionesUnidad}
                    intervalos={intervalos}
                    intervaloGlobalKm={rotacionKm}
                    puedeEditar={puedeEditar}
                    onPos={(pos) =>
                      puedeEditar &&
                      setPosDialog({ pos, actual: porPosicion.get(pos.code) ?? null })
                    }
                    onRefresh={refresh}
                  />
                </TabsContent>

                <TabsContent value="ot" className="pt-4">
                  <OrdenesNeumaticosPanel
                    ordenes={ordenesUnidad}
                    tareasById={tareasById}
                    reprogramadas={reprogramadas}
                  />
                </TabsContent>

                <TabsContent value="compras" className="pt-4">
                  <ComprasCubiertasPanel neumaticos={cubiertasUnidad} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle de cubiertas instaladas en la unidad */}
      {unidad && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Gauge className="size-4 text-muted-foreground" /> Cubiertas instaladas ·{" "}
              {unidad.dominio} ({instaladasOrden.length})
              {kmUnidad.kmActual != null && (
                <span className="text-xs font-normal text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                Esta unidad no tiene cubiertas instaladas.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
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
                        className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/40")}
                      >
                        <td className="py-2 font-medium">{n.posicion || "—"}</td>
                        <td>{n.numero || "—"}</td>
                        <td>{TIPO_LABEL[n.tipo]}</td>
                        <td className="text-muted-foreground">{n.marca || "—"}</td>
                        <td className="text-muted-foreground">{n.medida || "—"}</td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {n.profundidad_inicial_mm ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "text-right tabular-nums font-medium",
                            n.profundidad_actual_mm != null &&
                              n.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM
                              ? "text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {n.profundidad_actual_mm ?? "—"}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {mmGastados ?? "—"}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {kmPorMm != null ? fmtNum(kmPorMm) : "—"}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {pres != null ? `${pres} psi` : "—"}
                        </td>
                        <td className="text-muted-foreground">{fmtFecha(n.fecha_instalacion)}</td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {fmtNum(n.km_instalacion)}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {v?.kmRodados != null ? `${fmtNum(v.kmRodados)} km` : "—"}
                        </td>
                        <td
                          className={cn(
                            "text-right tabular-nums",
                            v && v.kmRestante != null && v.kmRestante <= 0
                              ? "font-medium text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {v?.kmRestante != null ? `${fmtNum(v.kmRestante)} km` : "—"}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
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

      {/* Stock */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-muted-foreground" /> Stock de cubiertas ({stock.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {stock.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cubiertas en stock.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Código</th>
                  <th>Tipo</th>
                  <th>Marca</th>
                  <th>Medida</th>
                  <th className="text-right">Prof. (mm)</th>
                  <th>Proveedor</th>
                  <th className="text-right">Costo</th>
                  <th>Ingreso</th>
                  <th>Factura</th>
                  {puedeEditar && <th className="w-16" />}
                </tr>
              </thead>
              <tbody>
                {stock.map((n, i) => (
                  <tr
                    key={n.id}
                    className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/40")}
                  >
                    <td className="py-2 font-medium">{n.numero || "—"}</td>
                    <td>{TIPO_LABEL[n.tipo]}</td>
                    <td className="text-muted-foreground">{n.marca || "—"}</td>
                    <td className="text-muted-foreground">{n.medida || "—"}</td>
                    <td className="text-right tabular-nums">
                      {n.profundidad_actual_mm ?? "—"}
                    </td>
                    <td className="text-muted-foreground">{n.proveedor || "—"}</td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {n.costo_unitario != null ? fmtMoney(Number(n.costo_unitario)) : "—"}
                    </td>
                    <td className="text-muted-foreground">
                      {fmtFecha(n.fecha_compra ?? n.fecha_ingreso)}
                    </td>
                    <td>
                      {(n.factura_urls?.length ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          {n.factura_urls!.map((url, fi) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                              title="Ver factura"
                            >
                              <Paperclip className="size-3" />
                              {n.factura_urls!.length > 1 ? fi + 1 : "Ver"}
                            </a>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </td>
                    {puedeEditar && (
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title="Editar cubierta / adjuntar factura"
                          onClick={() => setEditNeu(n)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
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
              <tfoot>
                <tr className="border-t-2 font-medium">
                  <td className="py-2" colSpan={6}>
                    Invertido en stock
                  </td>
                  <td className="text-right tabular-nums">
                    {fmtMoney(
                      stock.reduce((a, n) => a + Number(n.costo_unitario ?? 0), 0)
                    )}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
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
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
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
                    className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/40")}
                  >
                    <td className="py-2 font-medium">{n.numero || "—"}</td>
                    <td>{TIPO_LABEL[n.tipo]}</td>
                    <td className="text-muted-foreground">{n.medida || "—"}</td>
                    <td className="text-muted-foreground">{fmtFecha(n.fecha_baja)}</td>
                    <td className="text-muted-foreground">{n.motivo_baja || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {cargaOpen && (
        <CargarCubiertasDialog
          onClose={() => setCargaOpen(false)}
          onDone={() => {
            setCargaOpen(false)
            refresh()
          }}
        />
      )}
      {editNeu && (
        <EditarCubiertaDialog
          neumatico={editNeu}
          onClose={() => setEditNeu(null)}
          onDone={() => {
            setEditNeu(null)
            refresh()
          }}
        />
      )}
      {detalleResumen && (
        <ResumenDetalleDialog
          categoria={detalleResumen}
          neumaticos={neumaticos}
          puedeEditar={puedeEditar}
          onEditar={(n) => {
            setDetalleResumen(null)
            setEditNeu(n)
          }}
          onClose={() => setDetalleResumen(null)}
        />
      )}
      {montajeOpen && (
        <MontajeDialog
          unidades={unidades}
          unidadInicial={unidadSel}
          neumaticos={neumaticos}
          kmFlota={kmFlota}
          historialLecturas={historialLecturas}
          onClose={() => setMontajeOpen(false)}
          onRefresh={refresh}
        />
      )}
      {posDialog && unidad && (
        <PosicionDialog
          unidad={unidad}
          historial={historialLecturas[unidad.dominio] ?? []}
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
          onEditar={(n) => {
            setPosDialog(null)
            setEditNeu(n)
          }}
        />
      )}
    </div>
  )
}

// ==================== Inspección mensual ====================
// Ronda mensual de la flota entera: una vez por mes se mide profundidad y
// presión de TODAS las cubiertas instaladas. Esta card controla el avance de
// la ronda del mes: qué unidades ya se midieron y cuáles faltan.

const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const fmtMesLargo = (ym: string) =>
  `${MESES_LARGO[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`

function InspeccionMensualCard({
  neumaticos,
  unidades,
  dominioSel,
  onIrAUnidad,
}: {
  neumaticos: Neumatico[]
  unidades: UnidadFlota[]
  /** Unidad abierta en el diagrama, para marcarla en el listado. */
  dominioSel: string
  onIrAUnidad: (dominio: string) => void
}) {
  const mesActual = hoyLocalISO().slice(0, 7)

  // Meses elegibles: el actual + los últimos 5 (para revisar rondas pasadas).
  const meses = useMemo(() => {
    const [y, m] = mesActual.split("-").map(Number)
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(y, m - 1 - i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    })
  }, [mesActual])
  const [mesSel, setMesSel] = useState(mesActual)

  const filas = useMemo(() => {
    const instaladasPorUnidad = new Map<string, Neumatico[]>()
    for (const n of neumaticos) {
      if (n.estado !== "instalado" || !n.dominio) continue
      const arr = instaladasPorUnidad.get(n.dominio) ?? []
      arr.push(n)
      instaladasPorUnidad.set(n.dominio, arr)
    }
    return unidades
      .filter((u) => (instaladasPorUnidad.get(u.dominio)?.length ?? 0) > 0)
      .map((u) => {
        const cubiertas = instaladasPorUnidad.get(u.dominio)!
        let medidas = 0
        let ultima: string | null = null
        for (const n of cubiertas) {
          const med = (n.mediciones ?? []).find(
            (m) =>
              m.fecha.slice(0, 7) === mesSel &&
              (m.profundidad_mm != null || m.presion_psi != null)
          )
          if (med) {
            medidas++
            if (!ultima || med.fecha > ultima) ultima = med.fecha
          }
        }
        return {
          dominio: u.dominio,
          total: cubiertas.length,
          medidas,
          ultima,
          estado:
            medidas === 0 ? "pendiente" : medidas < cubiertas.length ? "parcial" : "completa",
        }
      })
      .sort((a, b) => a.dominio.localeCompare(b.dominio))
  }, [neumaticos, unidades, mesSel])

  const completas = filas.filter((f) => f.estado === "completa").length
  const pct = filas.length > 0 ? Math.round((completas / filas.length) * 100) : 0

  // Unidades sin cubiertas cargadas: no cuentan para el avance de la ronda (no
  // hay nada que medir), pero se listan igual porque desde acá se elige la unidad
  // del diagrama — si no, no habría forma de entrar a montarle la primera.
  const sinCubiertas = useMemo(() => {
    const conCubiertas = new Set(filas.map((f) => f.dominio))
    return unidades
      .filter((u) => !conCubiertas.has(u.dominio))
      .map((u) => u.dominio)
      .sort((a, b) => a.localeCompare(b))
  }, [filas, unidades])

  const BADGE: Record<string, string> = {
    completa: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    parcial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    pendiente: "bg-muted text-muted-foreground",
  }
  const LABEL: Record<string, string> = {
    completa: "Completa",
    parcial: "Parcial",
    pendiente: "Pendiente",
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="size-4 text-muted-foreground" /> Inspección mensual
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Una vez por mes se mide profundidad y presión de todas las cubiertas de la
            flota. Clickeá una unidad para abrirla en el diagrama de abajo y cargar las
            mediciones.
          </p>
        </div>
        <Select value={mesSel} onValueChange={(v) => v && setMesSel(v)}>
          <SelectTrigger className="w-44 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meses.map((ym) => (
              <SelectItem key={ym} value={ym} className="capitalize">
                {fmtMesLargo(ym)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Avance de la ronda */}
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                pct === 100 ? "bg-emerald-500" : "bg-sky-500"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-sm font-medium text-foreground">
            {completas}/{filas.length} unidades · {pct}%
          </span>
        </div>

        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay cubiertas instaladas cargadas en el módulo.
          </p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {filas.map((f) => (
              <button
                key={f.dominio}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-left transition-colors hover:bg-muted",
                  dominioSel === f.dominio && "border-primary bg-primary/5"
                )}
                onClick={() => onIrAUnidad(f.dominio)}
                title="Ir al diagrama de la unidad para cargar mediciones"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{f.dominio}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {f.medidas}/{f.total} cubiertas
                    {f.ultima && ` · ${fmtFecha(f.ultima)}`}
                  </p>
                </div>
                <Badge variant="outline" className={cn("shrink-0", BADGE[f.estado])}>
                  {LABEL[f.estado]}
                </Badge>
              </button>
            ))}
            {sinCubiertas.map((dominio) => (
              <button
                key={dominio}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left transition-colors hover:bg-muted",
                  dominioSel === dominio && "border-solid border-primary bg-primary/5"
                )}
                onClick={() => onIrAUnidad(dominio)}
                title="Ir al diagrama de la unidad para montar cubiertas"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{dominio}</p>
                  <p className="text-xs text-muted-foreground">sin cubiertas cargadas</p>
                </div>
                <Badge variant="outline" className="shrink-0 bg-muted text-muted-foreground">
                  Sin cargar
                </Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ==================== OT de neumáticos ====================

/**
 * Órdenes de trabajo de cubiertas DE LA UNIDAD: las que se generan desde acá
 * (rotación, alineación, balanceo) y cualquier trabajo de neumáticos —reparación,
 * recapado, gomería—. No hay filtro de unidad: ya se cargan contra su patente y
 * este panel vive dentro de la unidad elegida.
 */
function OrdenesNeumaticosPanel({
  ordenes,
  tareasById,
  reprogramadas,
}: {
  ordenes: MantenimientoRealizado[]
  tareasById: Map<string, MantenimientoPlanTarea>
  reprogramadas: MantenimientoTareaReprogramada[]
}) {
  const [ver, setVer] = useState<MantenimientoRealizado | null>(null)
  const [fMes, setFMes] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")

  const meses = useMemo(
    () =>
      Array.from(new Set(ordenes.map((o) => o.fecha.slice(0, 7)))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [ordenes]
  )

  const filtradas = useMemo(
    () =>
      ordenes
        .filter(
          (o) =>
            (fMes === "todos" || o.fecha.slice(0, 7) === fMes) &&
            (fTipo === "todos" || o.tipo === fTipo)
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [ordenes, fMes, fTipo]
  )
  const total = useMemo(() => filtradas.reduce((a, o) => a + costoTotalOt(o), 0), [filtradas])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Rotación, alineación, balanceo, reparaciones y recapados de esta unidad. El resto del
          mantenimiento está en la solapa{" "}
          <span className="font-medium text-foreground">Órdenes de Trabajo</span>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={fMes} onValueChange={(v) => setFMes(v ?? "todos")}>
            <SelectTrigger className="w-40 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las fechas</SelectItem>
              {meses.map((ym) => (
                <SelectItem key={ym} value={ym} className="capitalize">
                  {fmtMesLargo(ym)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fTipo} onValueChange={(v) => setFTipo(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todo tipo</SelectItem>
              <SelectItem value="preventivo">Preventivo</SelectItem>
              <SelectItem value="correctivo">Correctivo</SelectItem>
              <SelectItem value="proactivo">Proactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {ordenes.length === 0
            ? "Esta unidad no tiene órdenes de trabajo de neumáticos."
            : "Ninguna orden coincide con los filtros."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Fecha</th>
                  <th>N° OT</th>
                  <th>Trabajo</th>
                  <th>Taller</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Factura</th>
                  <th className="text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((o, i) => (
                  <tr
                    key={o.id}
                    onClick={() => setVer(o)}
                    title="Ver la orden de trabajo"
                    className={cn(
                      "cursor-pointer border-b last:border-0 hover:bg-sky-50",
                      i % 2 === 1 && "bg-muted/40"
                    )}
                  >
                    <td className="py-2 font-medium">{fmtFecha(o.fecha)}</td>
                    <td className="text-muted-foreground">{o.numero_ot || "—"}</td>
                    <td className="max-w-[18rem] truncate text-muted-foreground">
                      {o.observaciones ||
                        o.tareas
                          ?.map((t) =>
                            t.tarea_id ? tareasById.get(t.tarea_id)?.nombre : t.descripcion
                          )
                          .filter(Boolean)
                          .join(", ") ||
                        "—"}
                    </td>
                    <td className="text-muted-foreground">{o.taller || "—"}</td>
                    <td>
                      <Badge variant="outline" className={cn("text-xs", TIPO_MANT_BADGE[o.tipo])}>
                        {TIPO_MANT_LABEL[o.tipo]}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", ESTADO_MANT_BADGE[o.estado])}
                      >
                        {MANTENIMIENTO_ESTADO_LABELS[o.estado]}
                      </Badge>
                    </td>
                    <td>
                      {(o.evidencia_urls?.length ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <Paperclip className="size-3" />
                          {o.evidencia_urls!.length > 1
                            ? `${o.evidencia_urls!.length} adj.`
                            : "Sí"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">sin factura</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(costoTotalOt(o))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-medium">
                  <td className="py-2" colSpan={7}>
                    Total
                  </td>
                  <td className="text-right tabular-nums">{fmtMoney(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            Click en una fila para ver la orden completa: tareas, repuestos, la factura adjunta,
            Excel y PDF. Para editarla, entrá desde la solapa Órdenes de Trabajo.
          </p>
        </>
      )}

      {ver && (
        <DetalleOrdenDialog
          mantenimiento={ver}
          tareasById={tareasById}
          reprogramadas={reprogramadas.filter((r) => r.mantenimiento_id === ver.id)}
          puedeEditar={false}
          onClose={() => setVer(null)}
          onEditar={() => setVer(null)}
        />
      )}
    </div>
  )
}

// ==================== Compras y costos de cubiertas ====================

interface CompraCubiertas {
  clave: string
  fecha: string | null
  proveedor: string | null
  marca: string | null
  medida: string | null
  tipo: NeumaticoTipo
  costoUnitario: number | null
  cantidad: number
  total: number | null
  facturas: string[]
  codigos: string[]
}

/**
 * Agrupa las cubiertas por compra (misma fecha + proveedor + tipo/marca/medida +
 * costo unitario) y muestra el total de cada una: el costo se carga por unidad,
 * así que si la compra fue de 4 el total es 4 × unitario, y si fue de una el
 * total es el precio de esa cubierta.
 *
 * Toma TODAS las cubiertas (en stock, instaladas y de baja): la compra existió
 * igual, no importa dónde esté hoy la cubierta.
 */
function agruparCompras(neumaticos: Neumatico[]): CompraCubiertas[] {
  const mapa = new Map<string, CompraCubiertas>()
  for (const n of neumaticos) {
    const costo = n.costo_unitario != null ? Number(n.costo_unitario) : null
    const fecha = n.fecha_compra ?? null
    const clave = [
      fecha ?? "sin-fecha",
      (n.proveedor ?? "").toLowerCase().trim(),
      n.tipo,
      (n.marca ?? "").toLowerCase().trim(),
      (n.medida ?? "").toLowerCase().trim(),
      costo ?? "sin-costo",
    ].join("|")
    const previa = mapa.get(clave)
    if (previa) {
      previa.cantidad++
      previa.total = previa.costoUnitario != null ? previa.costoUnitario * previa.cantidad : null
      if (n.numero) previa.codigos.push(n.numero)
      for (const f of n.factura_urls ?? []) {
        if (!previa.facturas.includes(f)) previa.facturas.push(f)
      }
      continue
    }
    mapa.set(clave, {
      clave,
      fecha,
      proveedor: n.proveedor,
      marca: n.marca,
      medida: n.medida,
      tipo: n.tipo,
      costoUnitario: costo,
      cantidad: 1,
      total: costo,
      facturas: [...(n.factura_urls ?? [])],
      codigos: n.numero ? [n.numero] : [],
    })
  }
  // Más recientes primero; las sin fecha al final.
  return Array.from(mapa.values()).sort((a, b) =>
    (b.fecha ?? "").localeCompare(a.fecha ?? "")
  )
}

function ComprasCubiertasPanel({ neumaticos }: { neumaticos: Neumatico[] }) {
  const [fMes, setFMes] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")
  const [ver, setVer] = useState<CompraCubiertas | null>(null)

  const todas = useMemo(() => agruparCompras(neumaticos), [neumaticos])

  const meses = useMemo(
    () =>
      Array.from(
        new Set(todas.filter((c) => c.fecha).map((c) => c.fecha!.slice(0, 7)))
      ).sort((a, b) => b.localeCompare(a)),
    [todas]
  )

  const compras = useMemo(
    () =>
      todas.filter(
        (c) =>
          (fMes === "todos" || c.fecha?.slice(0, 7) === fMes) &&
          (fTipo === "todos" || c.tipo === fTipo)
      ),
    [todas, fMes, fTipo]
  )

  const mesActual = hoyLocalISO().slice(0, 7)
  const anioActual = hoyLocalISO().slice(0, 4)
  const resumen = useMemo(() => {
    let mes = 0
    let anio = 0
    let totalFiltrado = 0
    let cubiertasConCosto = 0
    for (const c of compras) {
      if (c.total == null) continue
      totalFiltrado += c.total
      cubiertasConCosto += c.cantidad
      if (c.fecha?.slice(0, 7) === mesActual) mes += c.total
      if (c.fecha?.slice(0, 4) === anioActual) anio += c.total
    }
    return {
      mes,
      anio,
      totalFiltrado,
      promedio: cubiertasConCosto > 0 ? totalFiltrado / cubiertasConCosto : null,
      cubiertasConCosto,
    }
  }, [compras, mesActual, anioActual])

  const sinCosto = compras.reduce((a, c) => a + (c.total == null ? c.cantidad : 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Cubiertas de esta unidad. El costo se carga por unidad; cada compra muestra su total
          (precio unitario × cantidad).
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={fMes} onValueChange={(v) => setFMes(v ?? "todos")}>
            <SelectTrigger className="w-40 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las fechas</SelectItem>
              {meses.map((ym) => (
                <SelectItem key={ym} value={ym} className="capitalize">
                  {fmtMesLargo(ym)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fTipo} onValueChange={(v) => setFTipo(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Nuevas y recapadas</SelectItem>
              <SelectItem value="nuevo">Nuevas</SelectItem>
              <SelectItem value="recapado">Recapadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {compras.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {todas.length === 0
            ? "Esta unidad no tiene cubiertas cargadas."
            : "Ninguna compra coincide con los filtros."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResumenCosto label="Gasto del mes" valor={fmtMoney(resumen.mes)} />
            <ResumenCosto label={`Gasto ${anioActual}`} valor={fmtMoney(resumen.anio)} />
            <ResumenCosto label="Total (filtrado)" valor={fmtMoney(resumen.totalFiltrado)} />
            <ResumenCosto
              label="Promedio por cubierta"
              valor={resumen.promedio != null ? fmtMoney(resumen.promedio) : "—"}
              sub={`${resumen.cubiertasConCosto} con costo${
                sinCosto > 0 ? ` · ${sinCosto} sin cargar` : ""
              }`}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Fecha</th>
                  <th>Proveedor</th>
                  <th>Cubierta</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-right">Precio unitario</th>
                  <th className="text-right">Total</th>
                  <th>Factura</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c, i) => (
                  <tr
                    key={c.clave}
                    onClick={() => setVer(c)}
                    title="Ver la compra"
                    className={cn(
                      "cursor-pointer border-b last:border-0 hover:bg-sky-50",
                      i % 2 === 1 && "bg-muted/40"
                    )}
                  >
                    <td className="py-2 font-medium">{fmtFecha(c.fecha)}</td>
                    <td className="text-muted-foreground">{c.proveedor || "—"}</td>
                    <td className="text-muted-foreground">
                      {[TIPO_LABEL[c.tipo], c.marca, c.medida].filter(Boolean).join(" · ")}
                    </td>
                    <td className="text-right tabular-nums">{c.cantidad}</td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {c.costoUnitario != null ? fmtMoney(c.costoUnitario) : "—"}
                    </td>
                    <td className="text-right font-medium tabular-nums text-foreground">
                      {c.total != null ? fmtMoney(c.total) : "—"}
                    </td>
                    <td>
                      {c.facturas.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <Paperclip className="size-3" />
                          {c.facturas.length > 1 ? `${c.facturas.length} adj.` : "Sí"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">sin factura</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-medium">
                  <td className="py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="text-right tabular-nums">
                    {compras.reduce((a, c) => a + c.cantidad, 0)}
                  </td>
                  <td />
                  <td className="text-right tabular-nums">{fmtMoney(resumen.totalFiltrado)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            Click en una fila para ver la compra completa: códigos de las cubiertas y la factura
            cargada.
          </p>
        </>
      )}

      {ver && <DetalleCompraDialog compra={ver} onClose={() => setVer(null)} />}
    </div>
  )
}

// Detalle de una compra: qué se compró, a quién, cuánto y con qué factura.
function DetalleCompraDialog({
  compra: c,
  onClose,
}: {
  compra: CompraCubiertas
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-muted-foreground" /> Compra de cubiertas
          </DialogTitle>
          <DialogDescription>{fmtFecha(c.fecha)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Proveedor</dt>
              <dd className="font-medium text-foreground">{c.proveedor || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Cubiertas</dt>
              <dd className="text-foreground">
                {c.cantidad} · {TIPO_LABEL[c.tipo]}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Marca / medida</dt>
              <dd className="text-foreground">
                {[c.marca, c.medida].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Precio unitario</dt>
              <dd className="tabular-nums text-foreground">
                {c.costoUnitario != null ? fmtMoney(c.costoUnitario) : "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                Total de la compra ({c.cantidad} × precio unitario)
              </dt>
              <dd className="text-lg font-bold tabular-nums text-foreground">
                {c.total != null ? fmtMoney(c.total) : "—"}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Códigos de las cubiertas
            </p>
            {c.codigos.length === 0 ? (
              <p className="text-muted-foreground/70">Se cargaron sin código.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {c.codigos.map((cod) => (
                  <Badge key={cod} variant="outline" className="text-[11px]">
                    {cod}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Factura</p>
            {c.facturas.length === 0 ? (
              <p className="text-muted-foreground/70">No tiene factura cargada.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {c.facturas.map((url) => (
                  <span
                    key={url}
                    className="inline-flex items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs"
                  >
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Paperclip className="size-3" />
                      {nombreDeFacturaUrl(url)}
                    </a>
                    <LinkFacturaPdf url={url} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResumenCosto({
  label,
  valor,
  sub,
}: {
  label: string
  valor: string
  sub?: string
}) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground/80">{sub}</p>}
    </div>
  )
}

// ==================== Subcomponentes ====================

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
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm text-foreground", destacado ? "font-bold" : "font-medium")}>
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
  libre: "border-border",
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
        className="absolute inset-x-[34%] rounded-md border-2 border-border bg-white"
        style={{ top: `${bastidorTop}%`, height: `${bastidorBottom - bastidorTop}%` }}
      >
        {/* Largueros */}
        <div className="absolute inset-y-1 left-[18%] w-px bg-muted" />
        <div className="absolute inset-y-1 right-[18%] w-px bg-muted" />
        {/* Travesaños en cada eje */}
        {filas.map((f) => (
          <div
            key={f.y}
            className="absolute inset-x-0 h-1 -translate-y-1/2 bg-muted"
            style={{ top: `${((f.y - bastidorTop) / (bastidorBottom - bastidorTop)) * 100}%` }}
          />
        ))}
      </div>
      {/* Cabina (frente) con parabrisas */}
      {conCabina && (
        <div className="absolute inset-x-[30%] top-[4%] h-[11%] rounded-lg border border-border bg-muted/50 shadow-sm">
          <div className="absolute inset-x-1.5 top-1 h-1.5 rounded-full bg-sky-200/80" />
        </div>
      )}
      {/* Lanza de enganche (acoplado) */}
      {!conCabina && (
        <div className="absolute left-1/2 top-0 h-[10%] w-1 -translate-x-1/2 rounded-full bg-muted" />
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
            ? "border-2 border-dashed border-border bg-white"
            : "shadow-md ring-1 ring-foreground/20"
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
              ? "bg-muted/50 text-muted-foreground/70 ring-white"
              : cn(wearClass, "text-white shadow ring-white/90")
          )}
        >
          {label}
        </span>
      </div>
      {sub && (
        <span className="mt-0.5 max-w-[60px] truncate text-[10px] font-medium leading-tight text-muted-foreground">
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

/**
 * ÚNICO diagrama de la unidad. Antes había tres siluetas iguales (cubiertas,
 * rotación y alineación); ahora es una sola y lo que se superpone depende de la
 * acción elegida en el selector de al lado:
 *   - `badges`: destino sugerido de cada cubierta (rotación).
 *   - `soloEjes`: resalta los ejes que toca la acción (alineación / balanceo) y
 *     apaga el resto.
 * `onPos` solo se pasa en la vista de cubiertas: ahí el diagrama es clickeable
 * para asignar / medir / dar de baja.
 */
function Diagrama({
  layout,
  porPosicion,
  onPos,
  tipo,
  badges,
  soloEjes,
}: {
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  onPos?: (pos: PosicionNeumatico) => void
  tipo: VehiculoTipo | null
  badges?: Record<string, string>
  soloEjes?: PosicionNeumatico["eje"][]
}) {
  return (
    <div className="relative aspect-[3/4] w-72 shrink-0">
      <SiluetaUnidad layout={layout} tipo={tipo} />
      {layout.map((p) => {
        const n = porPosicion.get(p.code)
        const dest = badges?.[p.code]
        const enFoco = !soloEjes || soloEjes.includes(p.eje)
        const glyph = (
          <TireGlyph
            label={p.label}
            sub={n ? n.numero || "s/n" : null}
            eje={p.eje}
            wearClass={n ? colorDesgaste(n.profundidad_actual_mm) : "bg-muted-foreground"}
            empty={!n}
            badge={dest ? `→${dest}` : null}
          />
        )
        const title = `${p.label} · ${p.eje ?? "libre"}${n ? ` · ${n.numero || "s/n"} (${n.profundidad_actual_mm ?? "?"} mm${ultimaPresion(n) != null ? `, ${ultimaPresion(n)} psi` : ""})` : " · vacía"}${dest ? ` → ${dest}` : ""}`
        const pos = { left: `${p.x}%`, top: `${p.y}%` }
        return onPos ? (
          <button
            key={p.code}
            type="button"
            onClick={() => onPos(p)}
            title={title}
            style={pos}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
          >
            <div className="transition-transform group-hover:scale-110">{glyph}</div>
          </button>
        ) : (
          <div
            key={p.code}
            title={title}
            style={pos}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 transition-opacity",
              !enFoco && "opacity-30"
            )}
          >
            {glyph}
          </div>
        )
      })}
    </div>
  )
}

// ==================== Detalle de las tarjetas del resumen ====================

type CategoriaResumen = "stock" | "instaladas" | "criticas" | "bajas"

const CATEGORIA_TITULO: Record<CategoriaResumen, string> = {
  stock: "Cubiertas en stock",
  instaladas: "Cubiertas instaladas",
  criticas: "Cubiertas con desgaste crítico",
  bajas: "Cubiertas dadas de baja",
}

function ResumenDetalleDialog({
  categoria,
  neumaticos,
  puedeEditar,
  onEditar,
  onClose,
}: {
  categoria: CategoriaResumen
  neumaticos: Neumatico[]
  puedeEditar: boolean
  onEditar: (n: Neumatico) => void
  onClose: () => void
}) {
  const lista = useMemo(() => {
    switch (categoria) {
      case "stock":
        return neumaticos.filter((n) => n.estado === "stock")
      case "instaladas":
        return [...neumaticos]
          .filter((n) => n.estado === "instalado")
          .sort(
            (a, b) =>
              (a.dominio ?? "").localeCompare(b.dominio ?? "") ||
              (a.posicion ?? "").localeCompare(b.posicion ?? ""),
          )
      case "criticas":
        return [...neumaticos]
          .filter(
            (n) =>
              n.estado === "instalado" &&
              n.profundidad_actual_mm != null &&
              n.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM,
          )
          .sort(
            (a, b) => (a.profundidad_actual_mm ?? 0) - (b.profundidad_actual_mm ?? 0),
          )
      case "bajas":
        return [...neumaticos]
          .filter((n) => n.estado === "baja")
          .sort((a, b) => (b.fecha_baja ?? "").localeCompare(a.fecha_baja ?? ""))
    }
  }, [categoria, neumaticos])

  const conUnidad = categoria === "instaladas" || categoria === "criticas"

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {CATEGORIA_TITULO[categoria]} ({lista.length})
          </DialogTitle>
          <DialogDescription>
            {conUnidad
              ? "Cada cubierta con la unidad y la posición en la que está rodando."
              : categoria === "stock"
                ? "Disponibles para montar."
                : "Historial de bajas con su motivo."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          {lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay cubiertas en esta categoría.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Número</th>
                  <th>Tipo</th>
                  <th>Medida</th>
                  <th className="text-right">Prof. (mm)</th>
                  {conUnidad && <th className="pl-3">Unidad</th>}
                  {conUnidad && <th>Posición</th>}
                  {categoria === "bajas" && <th className="pl-3">Fecha baja</th>}
                  {categoria === "bajas" && <th>Motivo</th>}
                  {categoria === "stock" && <th className="pl-3">Ingreso</th>}
                  {puedeEditar && categoria !== "bajas" && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {lista.map((n, i) => (
                  <tr
                    key={n.id}
                    className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/40")}
                  >
                    <td className="py-1.5 font-medium">{n.numero || "s/n"}</td>
                    <td className="text-muted-foreground">{TIPO_LABEL[n.tipo]}</td>
                    <td className="text-muted-foreground">{n.medida || "—"}</td>
                    <td
                      className={cn(
                        "text-right tabular-nums",
                        n.profundidad_actual_mm != null &&
                          n.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM
                          ? "font-semibold text-destructive"
                          : "text-foreground",
                      )}
                    >
                      {n.profundidad_actual_mm ?? "—"}
                    </td>
                    {conUnidad && (
                      <td className="pl-3 font-semibold">{n.dominio ?? "—"}</td>
                    )}
                    {conUnidad && (
                      <td className="text-muted-foreground">{n.posicion ?? "—"}</td>
                    )}
                    {categoria === "bajas" && (
                      <td className="pl-3 text-muted-foreground">{fmtFecha(n.fecha_baja)}</td>
                    )}
                    {categoria === "bajas" && (
                      <td className="text-muted-foreground">{n.motivo_baja || "—"}</td>
                    )}
                    {categoria === "stock" && (
                      <td className="pl-3 text-muted-foreground">{fmtFecha(n.fecha_ingreso)}</td>
                    )}
                    {puedeEditar && categoria !== "bajas" && (
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-foreground"
                          title="Editar cubierta / factura"
                          onClick={() => onEditar(n)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Factura de compra (foto/PDF) ====================

const ACCEPT_FACTURA_NEU = "image/*,application/pdf,.pdf"

/** Sube las facturas al bucket (imágenes comprimidas client-side por el 413
 *  de Vercel). Devuelve las URLs, o null si falló (ya tosteado). */
async function subirFacturasNeumaticos(files: File[]): Promise<string[] | null> {
  if (files.length === 0) return []
  const fd = new FormData()
  fd.append("dominio", "NEUMATICOS")
  for (const f of files) {
    let archivo = f
    if (f.type.startsWith("image/")) {
      try {
        archivo = await comprimirImagen(f)
      } catch {
        archivo = f
      }
    }
    fd.append("facturas", archivo)
  }
  const res = await subirFacturasMantenimiento(fd)
  if ("error" in res) {
    toast.error(res.error)
    return null
  }
  return res.data
}

function FacturaField({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">
        Factura de compra (foto o PDF, opcional)
      </Label>
      <Input
        type="file"
        accept={ACCEPT_FACTURA_NEU}
        multiple
        onChange={(e) => onChange([...files, ...Array.from(e.target.files ?? [])])}
      />
      {files.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Paperclip className="size-3 shrink-0" />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className="text-destructive hover:underline"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Link para bajar un adjunto como PDF (si es una foto, el endpoint la mete en
// una página A4; si ya es PDF lo pasa tal cual).
function LinkFacturaPdf({ url }: { url: string }) {
  return (
    <a
      href={`/api/vehiculos/neumaticos/factura-pdf?url=${encodeURIComponent(url)}`}
      target="_blank"
      rel="noreferrer"
      title="Descargar en PDF"
      className="inline-flex items-center gap-0.5 text-red-600 hover:underline"
    >
      <FileDown className="size-3" /> PDF
    </a>
  )
}

function EditarCubiertaDialog({
  neumatico,
  onClose,
  onDone,
}: {
  neumatico: Neumatico
  onClose: () => void
  onDone: () => void
}) {
  const [numero, setNumero] = useState(neumatico.numero ?? "")
  const [marca, setMarca] = useState(neumatico.marca ?? "")
  const [medida, setMedida] = useState(neumatico.medida ?? "")
  const [fechaCompra, setFechaCompra] = useState(neumatico.fecha_compra ?? "")
  const [proveedor, setProveedor] = useState(neumatico.proveedor ?? "")
  const [costo, setCosto] = useState(
    neumatico.costo_unitario != null ? String(neumatico.costo_unitario) : ""
  )
  const [urlsExistentes, setUrlsExistentes] = useState<string[]>(
    neumatico.factura_urls ?? [],
  )
  const [facturas, setFacturas] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    setSaving(true)
    const nuevas = await subirFacturasNeumaticos(facturas)
    if (nuevas === null) {
      setSaving(false)
      return
    }
    const res = await actualizarNeumatico({
      id: neumatico.id,
      numero,
      marca,
      medida,
      fecha_compra: fechaCompra || null,
      proveedor,
      costo_unitario: costo ? Number(costo) : null,
      factura_urls: [...urlsExistentes, ...nuevas],
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Cubierta actualizada")
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Editar cubierta {neumatico.numero ? `· ${neumatico.numero}` : ""}
          </DialogTitle>
          <DialogDescription>
            Corregí los datos o adjuntá la factura de compra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Código</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Marca</Label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Medida</Label>
              <Input value={medida} onChange={(e) => setMedida(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">Compra</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Fecha</Label>
                <Input
                  type="date"
                  value={fechaCompra}
                  onChange={(e) => setFechaCompra(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Proveedor</Label>
                <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Costo ($)</Label>
                <Input
                  type="number"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                />
              </div>
            </div>
          </div>

          {urlsExistentes.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Facturas cargadas</Label>
              <ul className="mt-1 space-y-0.5">
                {urlsExistentes.map((url) => (
                  <li key={url} className="flex items-center gap-1.5 text-xs">
                    <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium text-primary hover:underline"
                    >
                      {nombreDeFacturaUrl(url)}
                    </a>
                    <LinkFacturaPdf url={url} />
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      onClick={() =>
                        setUrlsExistentes((prev) => prev.filter((u) => u !== url))
                      }
                    >
                      quitar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <FacturaField files={facturas} onChange={setFacturas} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
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

function nombreDeFacturaUrl(url: string): string {
  try {
    const last = url.split("/").pop() || "factura"
    return decodeURIComponent(last.replace(/^\d+-\d+-/, ""))
  } catch {
    return "factura"
  }
}

/**
 * Carga de cubiertas al stock — UNA sola pantalla para una o varias.
 *
 * Antes eran dos diálogos casi iguales ("Carga individual" y "Carga masiva") y el
 * código de la cubierta aparecía con distinto nombre en cada uno. Ahora se elige
 * cuántas se cargan y el resto del formulario es el mismo: datos de la cubierta,
 * códigos, datos de la compra (fecha, proveedor y costo, que antes no se podían
 * cargar) y la factura.
 */
function CargarCubiertasDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [cuantas, setCuantas] = useState<"una" | "varias">("una")
  // Datos de la/s cubierta/s
  const [tipo, setTipo] = useState<NeumaticoTipo>("nuevo")
  const [marca, setMarca] = useState("")
  const [medida, setMedida] = useState("")
  const [prof, setProf] = useState("")
  const [presion, setPresion] = useState("")
  // Códigos: uno en modo "una", varios (o solo cantidad) en modo "varias"
  const [codigo, setCodigo] = useState("")
  const [porCodigos, setPorCodigos] = useState(true)
  const [codigos, setCodigos] = useState("")
  const [cantidad, setCantidad] = useState("4")
  // Compra
  const [fechaCompra, setFechaCompra] = useState(hoyLocalISO())
  const [proveedor, setProveedor] = useState("")
  const [costo, setCosto] = useState("")
  const [facturas, setFacturas] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  // Códigos tipeados (uno por línea o separados por coma), sin vacíos ni repetidos.
  const listaCodigos = useMemo(() => {
    if (cuantas === "una") return codigo.trim() ? [codigo.trim()] : []
    return Array.from(
      new Set(
        codigos
          .split(/[\n,;]+/)
          .map((c) => c.trim())
          .filter(Boolean)
      )
    )
  }, [cuantas, codigo, codigos])

  const usaCodigos = cuantas === "una" || porCodigos
  const total =
    cuantas === "una"
      ? 1
      : usaCodigos
        ? listaCodigos.length
        : Math.max(0, Math.floor(Number(cantidad) || 0))
  const costoNum = costo ? Number(costo) : null
  const totalCompra = costoNum != null && total > 0 ? costoNum * total : null

  const guardar = async () => {
    if (total < 1) {
      toast.error(usaCodigos ? "Ingresá al menos un código" : "Ingresá la cantidad")
      return
    }
    setSaving(true)
    const facturaUrls = await subirFacturasNeumaticos(facturas)
    if (facturaUrls === null) {
      setSaving(false)
      return
    }
    const res = await crearNeumaticosMasivo({
      tipo,
      marca,
      medida,
      profundidad_inicial_mm: prof ? Number(prof) : null,
      presion_psi: presion ? Number(presion) : null,
      // Con códigos se crea una por código; sin códigos, por cantidad.
      numeros: usaCodigos && listaCodigos.length > 0 ? listaCodigos : undefined,
      cantidad: usaCodigos && listaCodigos.length > 0 ? undefined : total,
      factura_urls: facturaUrls,
      fecha_compra: fechaCompra || null,
      proveedor,
      costo_unitario: costoNum,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(
      res.creados === 1 ? "Cubierta cargada al stock" : `${res.creados} cubiertas cargadas al stock`
    )
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Cargar cubiertas al stock</DialogTitle>
          <DialogDescription>
            Ingresan al stock; después se montan en una unidad desde el diagrama.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cuántas se cargan */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "una", label: "Una cubierta", sub: "con su código" },
                { id: "varias", label: "Varias", sub: "un lote de la misma compra" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setCuantas(o.id)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors",
                  cuantas === o.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted"
                )}
              >
                <p className="text-sm font-medium text-foreground">{o.label}</p>
                <p className="text-xs text-muted-foreground">{o.sub}</p>
              </button>
            ))}
          </div>

          {/* Códigos */}
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              {cuantas === "una" ? "Código de la cubierta" : "Códigos del lote"}
            </p>
            {cuantas === "una" ? (
              <div>
                <Input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="ej. AB1234"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Opcional: si no lo tenés, la cubierta entra sin código y se lo podés poner
                  después (al editarla o al montarla).
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={porCodigos ? "default" : "outline"}
                    onClick={() => setPorCodigos(true)}
                  >
                    Con códigos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!porCodigos ? "default" : "outline"}
                    onClick={() => setPorCodigos(false)}
                  >
                    Solo cantidad
                  </Button>
                </div>
                {porCodigos ? (
                  <div>
                    <Textarea
                      rows={4}
                      value={codigos}
                      onChange={(e) => setCodigos(e.target.value)}
                      placeholder={"AB123\nAB124\nAB125"}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Uno por línea o separados por coma. Se crea una cubierta por código.
                    </p>
                    {listaCodigos.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {listaCodigos.map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs text-muted-foreground">Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Entran sin código; se los cargás cuando las montés.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Datos de la cubierta */}
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              Datos de la cubierta
              {cuantas === "varias" && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  (iguales para todo el lote)
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Estado</Label>
                <Select value={tipo} onValueChange={(v) => setTipo((v as NeumaticoTipo) ?? "nuevo")}>
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
                <Label className="text-xs text-muted-foreground">Marca</Label>
                <Input
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Bridgestone"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Medida</Label>
                <Input
                  value={medida}
                  onChange={(e) => setMedida(e.target.value)}
                  placeholder="295/80R22.5"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Prof. inicial (mm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={prof}
                  onChange={(e) => setProf(e.target.value)}
                  placeholder="14"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Presión (psi)</Label>
                <Input
                  type="number"
                  value={presion}
                  onChange={(e) => setPresion(e.target.value)}
                  placeholder="110"
                />
              </div>
            </div>
          </div>

          {/* Compra */}
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              Compra
              <span className="ml-1 text-xs font-normal text-muted-foreground">(opcional)</span>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Fecha</Label>
                <Input
                  type="date"
                  value={fechaCompra}
                  onChange={(e) => setFechaCompra(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Proveedor / gomería</Label>
                <Input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Gomería del Centro"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Costo por cubierta ($)</Label>
                <Input
                  type="number"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  placeholder="520000"
                />
              </div>
            </div>
            <div className="mt-3">
              <FacturaField files={facturas} onChange={setFacturas} />
            </div>
          </div>

          {/* Resumen de lo que se va a cargar */}
          <div className="rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2 text-sm">
            <span className="font-medium text-sky-900">
              {total} {total === 1 ? "cubierta" : "cubiertas"}
            </span>
            <span className="text-sky-800">
              {" · "}
              {tipo === "recapado" ? "Recapado" : "Nuevo"}
              {marca ? ` · ${marca}` : ""}
              {medida ? ` · ${medida}` : ""}
              {prof ? ` · ${prof} mm` : ""}
              {totalCompra != null ? ` · ${fmtMoney(totalCompra)} en total` : ""}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving || total < 1}>
            {saving ? "Guardando…" : `Cargar ${total > 1 ? `${total} al stock` : "al stock"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// desmontar al stock).
type MontajeItem =
  | { origen: "stock"; n: Neumatico }
  | { origen: "diagrama"; n: Neumatico; pos: PosicionNeumatico }

// Pantalla de montaje/desmontaje: diagrama de la unidad + panel de stock al
// costado. Se opera arrastrando (mouse o dedo) o tocando cubierta y destino.
function MontajeDialog({
  unidades,
  unidadInicial,
  neumaticos,
  kmFlota,
  historialLecturas,
  onClose,
  onRefresh,
}: {
  unidades: UnidadFlota[]
  unidadInicial: string
  neumaticos: Neumatico[]
  kmFlota: Record<string, KmFlotaUnidad>
  historialLecturas: Record<string, LecturaSugerida[]>
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
  // Posición tocada → diálogo de acciones (montar del stock / cargar una nueva /
  // medir / desmontar). Es el MISMO diálogo del diagrama principal, así no hay
  // dos formularios distintos para lo mismo.
  const [posDialog, setPosDialog] = useState<{
    pos: PosicionNeumatico
    actual: Neumatico | null
  } | null>(null)
  // "Editar" desde el diálogo de la posición (datos de la cubierta / factura).
  const [editNeu, setEditNeu] = useState<Neumatico | null>(null)

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
        // Toque en una cubierta ya montada: abre el diálogo de acciones de esa
        // posición. En el stock sigue siendo "seleccionar y tocar el destino".
        if (item.origen === "diagrama" && item.pos) {
          setSel(null)
          setPosDialog({ pos: item.pos, actual: item.n })
          return
        }
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
            Montar / desmontar neumáticos{unidad ? ` · ${unidad.dominio}` : ""}
          </DialogTitle>
          <DialogDescription>
            Tocá una posición del diagrama y elegí qué hacer: montar una del stock,
            cargar una nueva comprada en el momento o desmontar la que está puesta.
            También podés arrastrar una cubierta del stock a una posición (o al revés,
            hacia el panel de stock, para desmontarla).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Unidad</Label>
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
            <span className="text-xs text-muted-foreground">
              {fmtNum(Math.round(kmU.kmActual))} km — al montar se usa este km de
              instalación y la vida útil default por tipo
            </span>
          )}
        </div>

        {!unidad ? (
          <p className="text-sm text-muted-foreground">Elegí una unidad.</p>
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
                      else if (!sel) setPosDialog({ pos: p, actual: null })
                    }}
                    title={`${p.label} · vacía — tocá para elegir qué montar, o soltá una cubierta del stock`}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg",
                      resaltaPosiciones && "ring-2 ring-emerald-500 ring-offset-1"
                    )}
                  >
                    <TireGlyph label={p.label} eje={p.eje} wearClass="bg-muted-foreground" empty />
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
                "min-h-48 w-full min-w-0 flex-1 rounded-lg border border-border bg-muted/40 p-3 transition-colors",
                resaltaStock && "border-sky-400 bg-sky-50 ring-2 ring-sky-400"
              )}
            >
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Layers className="size-4 text-muted-foreground" /> Stock ({stock.length})
                {resaltaStock && (
                  <span className="text-xs font-normal text-sky-600">
                    — soltá acá para desmontar
                  </span>
                )}
              </p>
              {stock.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay cubiertas en stock. Tocá una posición vacía del diagrama para
                  cargar una comprada en el momento, o usá “Carga individual” / “Carga
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
                        "flex cursor-grab touch-none select-none flex-col items-center rounded-md border border-border bg-card p-1.5 shadow-sm",
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
                      <span className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
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
          <span className="mr-auto text-xs text-muted-foreground">
            {saving ? "Guardando…" : sel ? `Seleccionada: ${sel.n.numero || "s/n"} — tocá el destino` : ""}
          </span>
          <Button variant="outline" onClick={onClose}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Acciones de la posición tocada (montar / cargar / medir / desmontar) */}
      {posDialog && unidad && (
        <PosicionDialog
          unidad={unidad}
          historial={historialLecturas[unidadSel] ?? []}
          pos={posDialog.pos}
          actual={posDialog.actual}
          stock={stock}
          kmActual={kmU.kmActual}
          vida={
            posDialog.actual
              ? vidaNeumatico(posDialog.actual, kmU.kmActual, kmU.kmDia)
              : null
          }
          onClose={() => setPosDialog(null)}
          onDone={() => {
            setPosDialog(null)
            onRefresh()
          }}
          onEditar={(n) => {
            setPosDialog(null)
            setEditNeu(n)
          }}
        />
      )}

      {editNeu && (
        <EditarCubiertaDialog
          neumatico={editNeu}
          onClose={() => setEditNeu(null)}
          onDone={() => {
            setEditNeu(null)
            onRefresh()
          }}
        />
      )}

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
      rubro: "neumaticos",
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
            <Label className="text-xs text-muted-foreground">Trabajo a realizar</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Km (odómetro)</Label>
              <Input value={kmActual != null ? fmtNum(Math.round(kmActual)) : "—"} disabled />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Taller (opcional)</Label>
              <Input
                value={taller}
                onChange={(e) => setTaller(e.target.value)}
                placeholder="ej. Gomería Pozzi"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Mano de obra $ (opcional)</Label>
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
  historial,
  pos,
  actual,
  stock,
  kmActual,
  vida,
  onClose,
  onDone,
  onEditar,
}: {
  unidad: UnidadFlota
  /** Lecturas del último mes de la unidad (una por día). */
  historial: LecturaSugerida[]
  pos: PosicionNeumatico
  actual: Neumatico | null
  stock: Neumatico[]
  kmActual: number | null
  vida: VidaNeumatico | null
  onClose: () => void
  onDone: () => void
  onEditar: (n: Neumatico) => void
}) {
  const [saving, setSaving] = useState(false)
  // Asignación (posición vacía) — km de instalación prefijado con el km actual.
  const [modo, setModo] = useState<"nueva" | "stock">(stock.length > 0 ? "stock" : "nueva")
  const [stockSel, setStockSel] = useState("")
  const [kmInst, setKmInst] = useState(kmActual != null ? String(Math.round(kmActual)) : "")
  const [vidaUtil, setVidaUtil] = useState("")
  // Fecha del montaje: las cubiertas se cargan seguido con fecha retroactiva
  // (la factura del gomero llega después), así que es editable.
  const [fechaInst, setFechaInst] = useState(hoyLocalISO())
  // Datos que muchas veces se conocen recién cuando el gomero la coloca.
  const [medidaStock, setMedidaStock] = useState("")
  const [numeroStock, setNumeroStock] = useState("")
  const [facturas, setFacturas] = useState<File[]>([])
  const [historialOpen, setHistorialOpen] = useState(false)
  // Los autoelevadores miden horas, no km (igual que en el resto del módulo).
  const mideHoras = unidad.tipo === "autoelevador"
  const labelLectura = mideHoras ? "Horómetro (hs)" : "Odómetro (km)"
  // Para autoelevadores el horómetro se toma en el checklist.
  const historialUnidad = mideHoras
    ? historial.filter((h) => h.fuente === "checklist")
    : historial
  // Carga directa (compra y colocación, sin pasar por stock)
  const [tipoNueva, setTipoNueva] = useState<NeumaticoTipo>("nuevo")
  const [numeroNueva, setNumeroNueva] = useState("")
  const [marcaNueva, setMarcaNueva] = useState("")
  const [medidaNueva, setMedidaNueva] = useState("")
  const [profNueva, setProfNueva] = useState("")
  // Presión con la que se monta (queda como medición de ese día).
  const [presionMontaje, setPresionMontaje] = useState("")
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

  // Igual que wrap, pero sube primero la factura adjunta (si hay) y le pasa las
  // URLs a la acción. Si la subida falla, no se guarda nada.
  const wrapConFactura = async (
    fn: (facturaUrls: string[] | null) => Promise<{ success: true } | { error: string }>,
    ok: string
  ) => {
    setSaving(true)
    let urls: string[] | null = null
    if (facturas.length > 0) {
      const subidas = await subirFacturasNeumaticos(facturas)
      if (subidas === null) {
        setSaving(false)
        return
      }
      urls = subidas
    }
    const res = await fn(urls)
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
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Estado</Label>
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
                    <Label className="text-xs text-muted-foreground">Marca</Label>
                    <Input value={marcaNueva} onChange={(e) => setMarcaNueva(e.target.value)} placeholder="Fate" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Prof. (mm)</Label>
                    <Input type="number" step="0.1" value={profNueva} onChange={(e) => setProfNueva(e.target.value)} />
                  </div>
                </div>
              </>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground">Cubierta del stock</Label>
                <Select
                  value={stockSel}
                  onValueChange={(v) => {
                    const id = v ?? ""
                    setStockSel(id)
                    const n = stock.find((x) => x.id === id)
                    setMedidaStock(n?.medida ?? "")
                    setNumeroStock(n?.numero ?? "")
                  }}
                >
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

            {/* Código y medida de la cubierta que se está montando. Al stock
                entran sin estos datos y se conocen cuando el gomero la coloca,
                así que se completan/corrigen acá, en los dos modos. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Código de la cubierta (opcional)
                </Label>
                <Input
                  value={modo === "nueva" ? numeroNueva : numeroStock}
                  onChange={(e) =>
                    modo === "nueva"
                      ? setNumeroNueva(e.target.value)
                      : setNumeroStock(e.target.value)
                  }
                  placeholder="Ej: 45"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Medida</Label>
                <Input
                  value={modo === "nueva" ? medidaNueva : medidaStock}
                  onChange={(e) =>
                    modo === "nueva"
                      ? setMedidaNueva(e.target.value)
                      : setMedidaStock(e.target.value)
                  }
                  placeholder="295/80R22.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Fecha</Label>
                <Input
                  type="date"
                  value={fechaInst}
                  onChange={(e) => setFechaInst(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{labelLectura} (opcional)</Label>
                <Input
                  type="number"
                  value={kmInst}
                  onChange={(e) => setKmInst(e.target.value)}
                  onFocus={() => setHistorialOpen(true)}
                  placeholder="opcional"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vida útil objetivo (km)</Label>
                <Input
                  type="number"
                  value={vidaUtil}
                  onChange={(e) => setVidaUtil(e.target.value)}
                  placeholder={vidaDefault != null ? `${vidaDefault} (default)` : "—"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Presión (psi)</Label>
                <Input
                  type="number"
                  value={presionMontaje}
                  onChange={(e) => setPresionMontaje(e.target.value)}
                  placeholder="110"
                />
              </div>
            </div>
            {/* Mismo historial de lecturas que en el alta de OT: al elegir un
                día completa la fecha y el odómetro/horómetro. */}
            <HistorialLecturasMes
              open={historialOpen}
              onToggle={() => setHistorialOpen((o) => !o)}
              historial={historialUnidad}
              unidad={mideHoras ? "hs" : "km"}
              onElegir={(valor, fecha) => {
                setKmInst(valor)
                setFechaInst(fecha)
              }}
              destino="del montaje"
            />

            <FacturaField files={facturas} onChange={setFacturas} />
            <p className="text-[11px] text-muted-foreground">
              Desde el {mideHoras ? "horómetro" : "km"} de instalación se estima cuánto falta para
              el cambio. Si dejás la vida útil vacía, usa el default por tipo (nuevo{" "}
              {VIDA_UTIL_DEFAULT_KM.nuevo} / recapado {VIDA_UTIL_DEFAULT_KM.recapado} km).
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              {modo === "nueva" ? (
                <Button
                  disabled={saving}
                  onClick={() =>
                    wrapConFactura(
                      (facturaUrls) =>
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
                          fecha_instalacion: fechaInst || undefined,
                          factura_urls: facturaUrls,
                          presion_psi: presionMontaje ? Number(presionMontaje) : null,
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
                    wrapConFactura(
                      (facturaUrls) =>
                        asignarNeumatico({
                          id: stockSel,
                          dominio: unidad.dominio,
                          posicion: pos.code,
                          eje: pos.eje,
                          km_instalacion: kmInst ? Number(kmInst) : null,
                          vida_util_km: vidaUtil ? Number(vidaUtil) : vidaDefault,
                          fecha_instalacion: fechaInst || undefined,
                          numero: numeroStock,
                          medida: medidaStock,
                          factura_urls: facturaUrls,
                          presion_psi: presionMontaje ? Number(presionMontaje) : null,
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
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Ruler className="size-4 text-muted-foreground" />
                Profundidad actual: <span className="font-semibold">{actual.profundidad_actual_mm ?? "—"} mm</span>
                {vida && (
                  <Badge variant="outline" className={cn("text-xs", VIDA_BADGE[vida.estado].clase)}>
                    {VIDA_BADGE[vida.estado].label}
                  </Badge>
                )}
              </div>
              {vida && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Vida útil objetivo {fmtNum(vida.vidaKm)} km ·{" "}
                  {vida.kmRodados != null ? `recorridos ${fmtNum(vida.kmRodados)} km · ` : ""}
                  {vida.kmRestante != null
                    ? `restante ~${fmtNum(vida.kmRestante)} km`
                    : "sin km para estimar"}
                  {vida.diasRestantes != null ? ` · ~${fmtNum(vida.diasRestantes)} días` : ""}
                </p>
              )}
              {actual.mediciones && actual.mediciones.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground/80">
                  Últimas mediciones:{" "}
                  {actual.mediciones
                    .slice(0, 4)
                    .map((m) => `${m.profundidad_mm ?? "?"}mm (${fmtFecha(m.fecha)})`)
                    .join(" · ")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(actual.factura_urls?.length ?? 0) > 0 &&
                  actual.factura_urls!.map((url, fi) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Paperclip className="size-3" /> Factura
                      {actual.factura_urls!.length > 1 ? ` ${fi + 1}` : ""}
                    </a>
                  ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => onEditar(actual)}
                >
                  <Pencil className="mr-1 size-3" /> Editar cubierta / factura
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">Registrar desgaste</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Prof. (mm)</Label>
                  <Input type="number" step="0.1" value={profMed} onChange={(e) => setProfMed(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Km</Label>
                  <Input type="number" value={kmMed} onChange={(e) => setKmMed(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Presión</Label>
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

            <div className="space-y-2 rounded-md border border-destructive/30 p-3">
              <p className="text-xs font-medium text-foreground">Dar de baja</p>
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

            {/* Comprobante del último movimiento de esta cubierta (montaje /
                desmontaje / baja). Si no hay movimiento registrado, sale con los
                datos actuales de la cubierta. */}
            <Button
              variant="outline"
              className="w-full"
              render={
                <a
                  href={`/api/vehiculos/neumaticos/${actual.id}/comprobante`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <FileDown className="mr-1 size-4 text-red-600" /> Comprobante en PDF
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
  ok: { label: "Al día", clase: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  proximo: { label: "Próxima", clase: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  vencido: { label: "Vencida", clase: "bg-destructive/10 text-destructive" },
  sin_datos: { label: "Sin datos", clase: "bg-muted text-muted-foreground" },
}

// ==================== Diagrama único + selector de acción ====================

// Vistas del diagrama de la unidad. "Cubiertas" es el inventario montado (el
// diagrama es clickeable); las otras tres son las acciones programables, cada una
// con su intervalo de km por tipo de unidad.
type VistaDiagrama = "cubiertas" | AccionNeumaticos

const VISTAS: { id: VistaDiagrama; label: string; Icono: typeof CircleDot }[] = [
  { id: "cubiertas", label: "Cubiertas", Icono: CircleDot },
  { id: "rotacion", label: "Rotación", Icono: RotateCw },
  { id: "alineacion", label: "Alineación", Icono: Crosshair },
  { id: "balanceo", label: "Balanceo", Icono: Scale },
]

const ACCION_LABEL: Record<AccionNeumaticos, string> = {
  rotacion: "Rotación",
  alineacion: "Alineación",
  balanceo: "Balanceo",
}

/**
 * Una sola silueta de la unidad con un selector de acción al costado. Antes esto
 * eran tres diagramas idénticos repartidos en dos tarjetas (cubiertas, rotación
 * sugerida y numeración para alineación/balanceo).
 *
 * Cada acción muestra su propio estado (intervalo editable, última, próxima), sus
 * botones de registro / generación de OT y su historial. Alineación y balanceo
 * comparten tabla (`mantenimiento_alineaciones`) y se distinguen por `tipo`; los
 * registros cargados como "ambos" cuentan para las dos.
 */
function DiagramaConAcciones({
  unidad,
  layout,
  porPosicion,
  kmActual,
  kmDia,
  rotaciones,
  alineaciones,
  intervalos,
  intervaloGlobalKm,
  puedeEditar,
  onPos,
  onRefresh,
}: {
  unidad: UnidadFlota
  layout: PosicionNeumatico[]
  porPosicion: Map<string, Neumatico>
  kmActual: number | null
  kmDia: number | null
  rotaciones: Rotacion[]
  alineaciones: Alineacion[]
  intervalos: IntervaloNeumaticos[]
  intervaloGlobalKm: number
  puedeEditar: boolean
  onPos: (pos: PosicionNeumatico) => void
  onRefresh: () => void
}) {
  const [vista, setVista] = useState<VistaDiagrama>("cubiertas")
  const [rotOpen, setRotOpen] = useState(false)
  // Diálogo de alineación/balanceo: guarda qué se está registrando.
  const [alinTipo, setAlinTipo] = useState<"alineacion" | "balanceo" | null>(null)
  const [intervaloAccion, setIntervaloAccion] = useState<AccionNeumaticos | null>(null)
  const [genOtDesc, setGenOtDesc] = useState<string | null>(null)

  const tipoUnidad = unidad.tipo ?? "camion"
  const intervaloDe = (accion: AccionNeumaticos) =>
    intervalos.find((i) => i.tipo_vehiculo === tipoUnidad && i.accion === accion)?.km ??
    intervaloGlobalKm

  const sugerida = useMemo(() => rotacionSugerida(unidad.tipo), [unidad.tipo])

  // Historial por acción. 'ambos' = se hicieron las dos juntas.
  const historialAlin = useMemo(
    () => alineaciones.filter((a) => a.tipo === "alineacion" || a.tipo === "ambos"),
    [alineaciones]
  )
  const historialBal = useMemo(
    () => alineaciones.filter((a) => a.tipo === "balanceo" || a.tipo === "ambos"),
    [alineaciones]
  )

  const ultimaRotacion = rotaciones[0] ?? null
  // La próxima rotación se cuenta SOLO desde la última rotación registrada; sin
  // registro queda "sin datos" (no se infiere del km de instalación).
  const rotEstado = rotacionEstado(
    ultimaRotacion?.km ?? null,
    kmActual,
    kmDia,
    intervaloDe("rotacion")
  )
  const estadoAlin = estadoAlineacionConKm(
    historialAlin[0] ?? null,
    kmActual,
    intervaloDe("alineacion")
  )
  const estadoBal = estadoAlineacionConKm(
    historialBal[0] ?? null,
    kmActual,
    intervaloDe("balanceo")
  )

  // Badge resumen de cada opción, para elegir viendo cuál está vencida.
  const badgeDeVista = (id: VistaDiagrama) => {
    if (id === "rotacion") return ROT_BADGE[rotEstado.estado] ?? ROT_BADGE.sin_datos
    if (id === "alineacion") return { label: estadoAlin.label, clase: estadoAlin.clase }
    if (id === "balanceo") return { label: estadoBal.label, clase: estadoBal.clase }
    return null
  }

  const accion = vista === "cubiertas" ? null : vista
  const ultimaDeAccion =
    accion === "rotacion"
      ? ultimaRotacion
      : accion === "alineacion"
        ? (historialAlin[0] ?? null)
        : accion === "balanceo"
          ? (historialBal[0] ?? null)
          : null
  const estadoDeAccion =
    accion === "rotacion"
      ? {
          label: (ROT_BADGE[rotEstado.estado] ?? ROT_BADGE.sin_datos).label,
          clase: (ROT_BADGE[rotEstado.estado] ?? ROT_BADGE.sin_datos).clase,
          proximaKm: rotEstado.proximaKm,
          faltanKm: rotEstado.kmRestante,
        }
      : accion === "alineacion"
        ? { ...estadoAlin, faltanKm: estadoAlin.faltanKm }
        : accion === "balanceo"
          ? { ...estadoBal, faltanKm: estadoBal.faltanKm }
          : null

  const registrar = () => {
    if (accion === "rotacion") setRotOpen(true)
    else if (accion === "alineacion" || accion === "balanceo") setAlinTipo(accion)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ---- El único diagrama ---- */}
        <div className="flex justify-center lg:justify-start">
          <Diagrama
            layout={layout}
            porPosicion={porPosicion}
            tipo={unidad.tipo}
            onPos={vista === "cubiertas" ? onPos : undefined}
            badges={vista === "rotacion" ? sugerida : undefined}
            soloEjes={vista === "alineacion" ? ["direccional"] : undefined}
          />
        </div>

        {/* ---- Selector de acción + panel de la elegida ---- */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {VISTAS.map((v) => {
              const b = badgeDeVista(v.id)
              const activa = vista === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVista(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                    activa
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <v.Icono className="size-4" />
                  {v.label}
                  {b && (
                    <Badge className={cn("border-0 px-1.5 py-0 text-[10px]", b.clase)}>
                      {b.label}
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>

          {/* Vista de cubiertas: convenciones del diagrama */}
          {vista === "cubiertas" && (
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Convenciones</p>
              <div className="space-y-1">
                <LeyendaEje clase="border-amber-400" txt="Eje direccional" />
                <LeyendaEje clase="border-emerald-500" txt="Eje de tracción" />
                <LeyendaEje clase="border-border" txt="Eje libre" />
              </div>
              <p className="pt-1 font-medium text-foreground">Desgaste (chip de posición)</p>
              <Leyenda color="bg-emerald-500" txt="Profundidad OK (> 5 mm)" />
              <Leyenda color="bg-amber-400" txt="A vigilar (≤ 5 mm)" />
              <Leyenda color="bg-red-500" txt={`Crítico (≤${PROFUNDIDAD_CRITICA_MM} mm)`} />
              <Leyenda color="bg-muted-foreground" txt="Sin medición" />
              <p className="pt-1 text-muted-foreground/80">
                {puedeEditar
                  ? "Hacé clic en una posición para asignar / medir / dar de baja."
                  : "Vista de solo lectura."}
              </p>
            </div>
          )}

          {/* Vista de una acción: estado + botones */}
          {accion && estadoDeAccion && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <Badge className={cn("border-0", estadoDeAccion.clase)}>
                  {estadoDeAccion.label}
                </Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  Cada{" "}
                  <span className="font-medium text-foreground">
                    {fmtNum(intervaloDe(accion))} km
                  </span>
                  <span className="text-muted-foreground/70">
                    ({unidad.tipo ? VEHICULO_TIPO_LABELS[unidad.tipo] : "unidad"})
                  </span>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setIntervaloAccion(accion)}
                      title={`Editar cada cuántos km se hace la ${ACCION_LABEL[accion].toLowerCase()} en este tipo de unidad`}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </span>
                <span className="text-muted-foreground">
                  Última:{" "}
                  <span className="font-medium text-foreground">
                    {ultimaDeAccion ? fmtFecha(ultimaDeAccion.fecha) : "sin registro"}
                  </span>
                  {ultimaDeAccion?.km != null && <span> · {fmtNum(ultimaDeAccion.km)} km</span>}
                </span>
                <span className="text-muted-foreground">
                  Próxima:{" "}
                  <span className="font-medium text-foreground">
                    {estadoDeAccion.proximaKm != null
                      ? `${fmtNum(estadoDeAccion.proximaKm)} km`
                      : "—"}
                  </span>
                  {estadoDeAccion.faltanKm != null && (
                    <span
                      className={cn(
                        estadoDeAccion.faltanKm <= 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {" "}
                      (
                      {estadoDeAccion.faltanKm <= 0
                        ? "vencida"
                        : `faltan ${fmtNum(estadoDeAccion.faltanKm)} km`}
                      )
                    </span>
                  )}
                </span>
              </div>

              {puedeEditar && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={registrar}>
                    <Plus className="mr-1 size-4" /> Registrar {ACCION_LABEL[accion].toLowerCase()}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      setGenOtDesc(
                        accion === "rotacion"
                          ? "Rotación de neumáticos"
                          : accion === "alineacion"
                            ? "Alineación de neumáticos"
                            : "Balanceo de neumáticos"
                      )
                    }
                  >
                    <ClipboardPlus className="mr-1 size-4" /> OT {ACCION_LABEL[accion].toLowerCase()}
                  </Button>
                </div>
              )}

              {/* Rotación: a dónde va cada cubierta (lo que muestra el diagrama) */}
              {accion === "rotacion" && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Rotación sugerida</p>
                  {Object.keys(sugerida).length === 0 ? (
                    <p>No hay un patrón sugerido para este tipo de unidad.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {layout
                          .filter((p) => sugerida[p.code])
                          .map((p) => (
                            <span key={p.code} className="flex items-center gap-1">
                              <span className="font-medium text-foreground">{p.label}</span>
                              <ArrowRight className="size-3" />
                              <span className="font-medium text-foreground">
                                {sugerida[p.code]}
                              </span>
                            </span>
                          ))}
                      </div>
                      <p className="text-muted-foreground/80">
                        Sugerencia para emparejar el desgaste. Ajustala según el estado real de
                        cada cubierta.
                      </p>
                    </>
                  )}
                </div>
              )}
              {accion === "alineacion" && (
                <p className="text-xs text-muted-foreground/80">
                  El diagrama resalta el eje direccional, que es el que define la alineación.
                </p>
              )}
              {accion === "balanceo" && (
                <p className="text-xs text-muted-foreground/80">
                  El balanceo se controla por rueda: el diagrama muestra la numeración de cada
                  posición.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Historial de la acción elegida ---- */}
      {accion === "rotacion" && rotaciones.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Fecha</th>
                <th className="text-right">Km</th>
                <th>Observaciones</th>
                {puedeEditar && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {rotaciones.map((r, i) => (
                <tr key={r.id} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/40")}>
                  <td className="py-2 font-medium">{fmtFecha(r.fecha)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{fmtNum(r.km)}</td>
                  <td className="text-muted-foreground">{r.observaciones || "—"}</td>
                  {puedeEditar && (
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
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

      {(accion === "alineacion" || accion === "balanceo") && (
        <HistorialAlineaciones
          filas={accion === "alineacion" ? historialAlin : historialBal}
          puedeEditar={puedeEditar}
          onRefresh={onRefresh}
        />
      )}

      {rotOpen && (
        <RegistrarRotacionDialog
          dominio={unidad.dominio}
          kmActual={kmActual}
          rotacionKm={intervaloDe("rotacion")}
          onClose={() => setRotOpen(false)}
          onDone={() => {
            setRotOpen(false)
            onRefresh()
          }}
        />
      )}
      {alinTipo && (
        <AlineacionDialog
          dominio={unidad.dominio}
          tipo={alinTipo}
          kmActual={kmActual}
          intervaloKm={intervaloDe(alinTipo)}
          onClose={() => setAlinTipo(null)}
          onDone={() => {
            setAlinTipo(null)
            onRefresh()
          }}
        />
      )}
      {intervaloAccion && (
        <IntervaloDialog
          actual={intervaloDe(intervaloAccion)}
          accion={intervaloAccion}
          tipoVehiculo={tipoUnidad}
          onClose={() => setIntervaloAccion(null)}
          onDone={() => {
            setIntervaloAccion(null)
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
    </div>
  )
}

// Historial de alineaciones / balanceos (misma tabla, filtrada por tipo).
function HistorialAlineaciones({
  filas,
  puedeEditar,
  onRefresh,
}: {
  filas: Alineacion[]
  puedeEditar: boolean
  onRefresh: () => void
}) {
  if (filas.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2">Fecha</th>
            <th className="text-right">Km</th>
            <th>Se hizo</th>
            <th>Próxima</th>
            <th className="text-right">Próx. km</th>
            <th>Proveedor</th>
            <th className="text-right">Costo</th>
            <th>Observaciones</th>
            {puedeEditar && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {filas.map((a, i) => (
            <tr key={a.id} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/40")}>
              <td className="py-2 font-medium">{fmtFecha(a.fecha)}</td>
              <td className="text-right tabular-nums text-muted-foreground">{fmtNum(a.km)}</td>
              <td className="text-muted-foreground">
                {a.tipo === "ambos"
                  ? "Alineación + balanceo"
                  : a.tipo === "balanceo"
                    ? "Balanceo"
                    : "Alineación"}
              </td>
              <td className="text-muted-foreground">{fmtFecha(a.proxima_fecha)}</td>
              <td className="text-right tabular-nums text-muted-foreground">
                {fmtNum(a.proxima_km)}
              </td>
              <td className="text-muted-foreground">{a.proveedor || "—"}</td>
              <td className="text-right tabular-nums text-muted-foreground">
                {a.costo != null ? fmtMoney(Number(a.costo)) : "—"}
              </td>
              <td className="text-muted-foreground">{a.observaciones || "—"}</td>
              {puedeEditar && (
                <td className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      const res = await eliminarAlineacion({ id: a.id })
                      if ("error" in res) toast.error(res.error)
                      else {
                        toast.success("Registro eliminado")
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
  )
}

// Edita cada cuántos km se hace una acción en un tipo de unidad.
function IntervaloDialog({
  actual,
  accion,
  tipoVehiculo,
  onClose,
  onDone,
}: {
  actual: number
  accion: AccionNeumaticos
  tipoVehiculo: string
  onClose: () => void
  onDone: () => void
}) {
  const [km, setKm] = useState(String(actual))
  const [saving, setSaving] = useState(false)
  const tipoLabel =
    VEHICULO_TIPO_LABELS[tipoVehiculo as VehiculoTipo] ?? tipoVehiculo

  const guardar = async () => {
    const valor = Number(km)
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Ingresá un intervalo de km válido")
      return
    }
    setSaving(true)
    const res = await setIntervaloNeumaticos({
      tipo_vehiculo: tipoVehiculo,
      accion,
      km: valor,
    })
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
          <DialogTitle>Intervalo de {ACCION_LABEL[accion].toLowerCase()}</DialogTitle>
          <DialogDescription>
            Cada cuántos km se programa la {ACCION_LABEL[accion].toLowerCase()} en las unidades del
            tipo <span className="font-medium text-foreground">{tipoLabel}</span>. No afecta a los
            otros tipos de unidad.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs text-muted-foreground">Intervalo (km)</Label>
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
            <Label className="text-xs text-muted-foreground">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Km</Label>
            <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Observaciones</Label>
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
  tipo,
  kmActual,
  intervaloKm,
  onClose,
  onDone,
}: {
  dominio: string
  /** Qué se está registrando (define el título y el filtro del historial). */
  tipo: "alineacion" | "balanceo"
  kmActual: number | null
  intervaloKm: number
  onClose: () => void
  onDone: () => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  // Km prellenado con el odómetro actual de la unidad (como en la rotación).
  const [km, setKm] = useState(kmActual != null ? String(Math.round(kmActual)) : "")
  const [proximaFecha, setProximaFecha] = useState("")
  const [proximaKm, setProximaKm] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [costo, setCosto] = useState("")
  const [observaciones, setObservaciones] = useState("")
  // Se hicieron las dos cosas en la misma visita a la gomería (caso habitual).
  const [ambos, setAmbos] = useState(false)
  const [saving, setSaving] = useState(false)

  const otra = tipo === "alineacion" ? "balanceo" : "alineación"
  const label = tipo === "alineacion" ? "alineación" : "balanceo"

  const guardar = async () => {
    setSaving(true)
    const res = await registrarAlineacion({
      dominio,
      tipo: ambos ? "ambos" : tipo,
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
    toast.success(ambos ? "Alineación y balanceo registrados" : `${label} registrada`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Registrar {label} · {dominio}
          </DialogTitle>
          <DialogDescription>
            Si no cargás la próxima, se cuenta cada {fmtNum(intervaloKm)} km desde estos km.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Km</Label>
            <Input
              type="number"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="ej. 155000"
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 rounded-md border border-border p-2.5 text-sm">
            <Checkbox checked={ambos} onCheckedChange={(c) => setAmbos(c === true)} />
            <span>
              Se hizo también el {otra} en la misma visita
              <span className="ml-1 text-xs text-muted-foreground">
                (cuenta para las dos)
              </span>
            </span>
          </label>
          <div>
            <Label className="text-xs text-muted-foreground">Próxima (fecha)</Label>
            <Input
              type="date"
              value={proximaFecha}
              onChange={(e) => setProximaFecha(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Próxima (km)</Label>
            <Input
              type="number"
              value={proximaKm}
              onChange={(e) => setProximaKm(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Proveedor / gomería</Label>
            <Input
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="ej. Gomería del Centro"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Costo ($)</Label>
            <Input
              type="number"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="ej. 45000"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Observaciones</Label>
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
