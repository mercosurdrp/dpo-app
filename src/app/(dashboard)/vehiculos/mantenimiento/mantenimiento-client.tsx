"use client"

import { Fragment, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { GRUPOS_ORDEN, seccionesDeGrupo } from "@/lib/flota/dpo-puntos"
import { KpiCard } from "./_components/kpi-card"
import { HistorialLecturasMes } from "./_components/historial-lecturas-mes"
import { DetalleOrdenDialog } from "./_components/detalle-orden-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Ban,
  CalendarClock,
  Cloud,
  Paperclip,
  Plus,
  Pencil,
  Search,
  Trash2,
  Truck,
  Wrench,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import {
  cerrarTareaReprogramada,
  createMantenimiento,
  createPlanTarea,
  deleteMantenimiento,
  deletePlanOverride,
  setOrdenFueraServicio,
  subirFacturasMantenimiento,
  updateMantenimiento,
  updatePlanTarea,
  upsertPlanOverride,
} from "@/actions/mantenimiento-vehiculos"
import type {
  CostosMantenimiento,
  DiaRuteo,
  EstadoPlanVehiculo,
  FlotaIndisponibilidad,
  MantenimientoCategoria,
  MantenimientoEstado,
  MantenimientoPlanOverride,
  MantenimientoGasto,
  MantenimientoProveedor,
  MantenimientoPlanTarea,
  MantenimientoRealizado,
  MantenimientoTareaReprogramada,
  MantenimientoTipo,
  VehiculoTipo,
} from "@/types/database"
import {
  MANTENIMIENTO_CATEGORIA_LABELS,
  MANTENIMIENTO_ESTADO_LABELS,
} from "@/types/database"
import { TableroOperativo, type OTPendiente } from "./tablero-operativo"
import { ProgramacionOt } from "./programacion-ot"
import { ChecklistsMtto } from "./checklists-mtto"
import { NeumaticosModule } from "./neumaticos-module"
import { SeguimientoFlota } from "./seguimiento-flota"
import { PiramideDefectos } from "./piramide-defectos"
import { GastosTab } from "./gastos-tab"
import { ProveedorPicker } from "./_components/proveedor-picker"
import { GestionMtto } from "./gestion-mtto"
import { HerramientasTab } from "./herramientas-tab"
import type { Herramienta } from "@/actions/mantenimiento-herramientas"
import { IndicadoresFlota } from "./indicadores-flota"
import { EstandaresFlota } from "./estandares-flota"
import { AnalisisItemsChecklist } from "./analisis-items-checklist"
import type { AnalisisChecklist } from "@/actions/checklist-analisis"
import type { EstandaresFlota as EstandaresFlotaData } from "@/actions/flota-estandares"
import type {
  FlotaKpi,
  FlotaKpiSnapshot,
  FlotaMeta,
  FlotaPlanConItems,
  PuntoSerieKpi,
} from "@/actions/flota-indicadores"
import type {
  DocumentoVencimiento,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type {
  ChecklistComentario,
  ChecklistItemNoOk,
  ConteoResumen,
  Novedad,
  TareaCil,
  OrdenCompra,
  Repuesto,
  Residuo,
  TableroResumen,
  UnidadBaja,
} from "@/actions/mantenimiento-vehiculos"
import type {
  Neumatico,
  Alineacion,
  IntervaloNeumaticos,
  Recapado,
  RetiroCubiertas,
  Rotacion,
} from "@/lib/vehiculos/neumaticos-tipos"
import type { KmFlotaUnidad } from "@/actions/neumaticos"
import type { LecturaSugerida } from "@/lib/vehiculos/lecturas"

// ==================== Helpers ====================

const TIPO_VEHICULO_LABELS: Record<VehiculoTipo, string> = {
  camion: "Camiones",
  camioneta: "Camionetas",
  autoelevador: "Autoelevadores",
  utilitario: "Utilitarios",
  acoplado: "Acoplados",
}

const FUENTE_LECTURA_LABEL: Record<LecturaSugerida["fuente"], string> = {
  registros: "Registro de km",
  checklist: "Checklist",
  combustible: "Carga de combustible",
  mantenimiento: "Orden de trabajo",
  manual: "Lectura manual",
}

const TIPO_MANT_LABEL: Record<MantenimientoTipo, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  proactivo: "Proactivo",
}

const MESES_ABR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]
// "2026-06" -> "jun. 2026"
const fmtMes = (ym: string) => {
  const [y, m] = ym.split("-")
  return `${MESES_ABR[Number(m) - 1] ?? m}. ${y}`
}

const TIPO_MANT_BADGE: Record<MantenimientoTipo, string> = {
  preventivo: "border-sky-200 bg-sky-50 text-sky-700",
  correctivo: "border-orange-200 bg-orange-50 text-orange-700",
  proactivo: "border-violet-200 bg-violet-50 text-violet-700",
}

const ESTADO_MANT_BADGE: Record<MantenimientoEstado, string> = {
  programado: "bg-blue-100 text-blue-700",
  en_taller: "bg-amber-100 text-amber-700",
  completado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-muted text-muted-foreground",
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Fecha+hora local en formato para <input type="datetime-local"> (YYYY-MM-DDTHH:mm).
function ahoraLocal(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

// Convierte un valor de DB (ISO/timestamptz) al formato de datetime-local.
function aDatetimeLocal(v: string | null): string {
  if (!v) return ""
  // Si ya viene como fecha sola (YYYY-MM-DD), le agrego una hora por defecto.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T08:00`
  const d = new Date(v)
  if (isNaN(d.getTime())) return ""
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

function fmtFecha(f: string | null): string {
  if (!f) return "—"
  return f.slice(0, 10).split("-").reverse().join("/")
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v)

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)

// Costo total de una OT = mayor entre el costo de cabecera y el desglose
// (tareas + mano de obra + repuestos). Mismo criterio que getCostosMantenimiento:
// la cabecera de las OT cargadas por la app ya es MO + repuestos, así no se duplica.
function costoTotalOt(m: MantenimientoRealizado): number {
  const tareas = (m.tareas ?? []).reduce((a, t) => a + Number(t.costo || 0), 0)
  const repuestos = (m.repuestos ?? []).reduce(
    (a, r) => a + Number(r.cantidad || 1) * Number(r.costo_unitario || 0),
    0
  )
  const desglosado = tareas + Number(m.costo_mano_obra || 0) + repuestos
  return Math.max(Number(m.costo || 0), desglosado)
}

function parseNum(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s.replace(",", "."))
  return isNaN(n) ? null : n
}

// Comprime imágenes (deja PDFs/otros tal cual) y sube las facturas al Storage,
// devolviendo las URLs públicas. null si hubo error (ya muestra el toast).
async function subirFacturas(dominio: string, files: File[]): Promise<string[] | null> {
  if (files.length === 0) return []
  const fd = new FormData()
  fd.append("dominio", dominio)
  for (const f of files) {
    // Si la compresión falla (formato raro, canvas, etc.) se sube el original
    // en vez de cortar el guardado de la OT.
    let archivo = f
    try {
      archivo = await comprimirImagen(f)
    } catch {
      archivo = f
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

const ACCEPT_FACTURA = "image/*,application/pdf,.pdf,.doc,.docx"

function nombreArchivoDeUrl(url: string): string {
  try {
    const last = url.split("/").pop() || "archivo"
    return decodeURIComponent(last.replace(/^\d+-\d+-/, ""))
  } catch {
    return "archivo"
  }
}

// Celda/toggle de disponibilidad: marca si la OT saca la unidad de circulación
// (afecta la disponibilidad de flota vía fuera_servicio_desde/hasta).
function DisponibilidadCell({
  m,
  puedeEditar,
  onChanged,
}: {
  m: MantenimientoRealizado
  puedeEditar: boolean
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const saca = !!m.fuera_servicio_desde
  const fmtD = (f: string | null) =>
    f ? f.slice(0, 10).split("-").reverse().join("/") : ""

  function toggle() {
    startTransition(async () => {
      const res = await setOrdenFueraServicio(m.id, !saca)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        !saca
          ? "Unidad marcada como NO disponible"
          : "Unidad marcada como disponible"
      )
      onChanged()
    })
  }

  if (!puedeEditar) {
    return saca ? (
      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
        <Ban className="size-3" /> No disponible
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
        <Truck className="size-3" /> Disponible
      </Badge>
    )
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={
          saca
            ? "Esta OT tiene la unidad NO disponible (descuenta disponibilidad de flota). Click para marcarla disponible."
            : "La unidad está disponible. Click para marcarla NO disponible por esta OT."
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors disabled:opacity-50",
          saca
            ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        )}
      >
        {saca ? <Ban className="size-3" /> : <Truck className="size-3" />}
        {saca ? "No disponible" : "Disponible"}
      </button>
      {saca && m.fuera_servicio_desde && (
        <span className="text-[11px] text-muted-foreground/70">
          {fmtD(m.fuera_servicio_desde)}
          {m.fuera_servicio_hasta ? ` → ${fmtD(m.fuera_servicio_hasta)}` : " → sigue"}
        </span>
      )}
    </div>
  )
}

// ==================== Componente principal ====================

interface MantenimientoClientProps {
  estados: EstadoPlanVehiculo[]
  tareas: MantenimientoPlanTarea[]
  overrides: MantenimientoPlanOverride[]
  ultimasLecturas: Record<string, LecturaSugerida[]>
  historialLecturas: Record<string, LecturaSugerida[]>
  mantenimientos: MantenimientoRealizado[]
  /** Tareas del plan que quedaron sin hacer en un service y se reprogramaron. */
  reprogramadas: MantenimientoTareaReprogramada[]
  siguienteNumeroOt: string
  costos: CostosMantenimiento
  tablero: {
    programacion: ServiceGeneralUnidad[]
    documentos: DocumentoVencimiento[]
    resumen: TableroResumen
    unidadesBaja: UnidadBaja[]
  }
  checklists: { itemsNoOk: ChecklistItemNoOk[]; comentarios: ChecklistComentario[] }
  neumaticos: Neumatico[]
  recapados: Recapado[]
  retirosCubiertas: RetiroCubiertas[]
  alineaciones: Alineacion[]
  kmFlota: Record<string, KmFlotaUnidad>
  rotaciones: Rotacion[]
  diasRuteo: DiaRuteo[]
  indisponibilidades: FlotaIndisponibilidad[]
  gastos: MantenimientoGasto[]
  proveedores: MantenimientoProveedor[]
  gestion: {
    novedades: Novedad[]
    repuestos: Repuesto[]
    ordenesCompra: OrdenCompra[]
    residuos: Residuo[]
    conteos: ConteoResumen[]
  }
  flotaMetas: FlotaMeta[]
  flotaPlanes: FlotaPlanConItems[]
  kpiSnapshots: FlotaKpiSnapshot[]
  kpiExtraSeries: Partial<Record<FlotaKpi, PuntoSerieKpi[]>>
  tareasCil: TareaCil[]
  estandares: EstandaresFlotaData
  analisisChecklist: AnalisisChecklist
  herramientas: Herramienta[]
  rotacionKm: number
  /** Intervalos de rotación/alineación/balanceo por tipo de unidad. */
  intervalosNeumaticos: IntervaloNeumaticos[]
  puedeEditar: boolean
  esAdmin: boolean
}

export function MantenimientoClient({
  estados,
  tareas,
  overrides,
  ultimasLecturas,
  historialLecturas,
  mantenimientos,
  reprogramadas,
  siguienteNumeroOt,
  costos,
  tablero,
  checklists,
  neumaticos,
  recapados,
  retirosCubiertas,
  alineaciones,
  kmFlota,
  rotaciones,
  diasRuteo,
  indisponibilidades,
  gastos,
  proveedores,
  gestion,
  flotaMetas,
  flotaPlanes,
  kpiSnapshots,
  kpiExtraSeries,
  tareasCil,
  estandares,
  analisisChecklist,
  herramientas,
  rotacionKm,
  intervalosNeumaticos,
  puedeEditar,
  esAdmin,
}: MantenimientoClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [tab, setTab] = useState("tablero")
  // Catálogo de proveedores/talleres en memoria: si alguien agrega uno desde
  // cualquier formulario (OT, cubiertas, gastos), aparece en todos sin recargar.
  const [provList, setProvList] = useState<MantenimientoProveedor[]>(proveedores)
  const agregarProveedor = (p: MantenimientoProveedor) =>
    setProvList((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoPrefill, setNuevoPrefill] = useState<{ dominio?: string; tareaId?: string }>({})
  const [editMant, setEditMant] = useState<MantenimientoRealizado | null>(null)
  const [verMant, setVerMant] = useState<MantenimientoRealizado | null>(null)
  const [deleteMantId, setDeleteMantId] = useState<string | null>(null)
  const [tareaEdit, setTareaEdit] = useState<MantenimientoPlanTarea | null>(null)
  const [nuevaTareaOpen, setNuevaTareaOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)

  // Filtros del historial
  const [fDominio, setFDominio] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")
  const [fEstado, setFEstado] = useState("todos")
  const [fMes, setFMes] = useState("todos")
  const [fBusqueda, setFBusqueda] = useState("")

  const refresh = () => startTransition(() => router.refresh())

  const tareasById = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas])

  const tareasPorTipo = useMemo(() => {
    const map = new Map<VehiculoTipo, MantenimientoPlanTarea[]>()
    for (const t of tareas) {
      if (!t.activo) continue
      if (!map.has(t.tipo_vehiculo)) map.set(t.tipo_vehiculo, [])
      map.get(t.tipo_vehiculo)!.push(t)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.orden - b.orden)
    return map
  }, [tareas])

  // Reprogramadas que siguen abiertas: alimentan la tarjeta del tablero y el
  // aviso al cargar una OT nueva de esa unidad.
  const reprogramadasAbiertas = useMemo(
    () => reprogramadas.filter((r) => r.estado === "abierta"),
    [reprogramadas]
  )

  const kpis = useMemo(() => {
    let vencidas = 0
    let proximas = 0
    for (const e of estados) {
      for (const c of e.celdas) {
        if (c.estado === "vencido") vencidas++
        else if (c.estado === "proximo") proximas++
      }
    }
    return { vencidas, proximas }
  }, [estados])

  /**
   * Las dos tarjetas del plan preventivo daban un número y nada más: para saber
   * QUÉ tarea de QUÉ unidad estaba vencida había que recorrer el calendario a
   * ojo. Ahora abren la lista, y desde ahí se puede cargar la OT.
   */
  const [detallePlan, setDetallePlan] = useState<"vencido" | "proximo" | null>(null)

  const filasPlan = useMemo(() => {
    if (!detallePlan) return []
    const filas: {
      dominio: string
      tarea: string
      celda: EstadoPlanVehiculo["celdas"][number]
      esHoras: boolean
    }[] = []
    for (const e of estados) {
      for (const c of e.celdas) {
        if (c.estado !== detallePlan) continue
        filas.push({
          dominio: e.vehiculo.dominio,
          tarea: tareasById.get(c.tareaId)?.nombre ?? "Tarea del plan",
          celda: c,
          esHoras: e.vehiculo.tipo === "autoelevador",
        })
      }
    }
    // Lo más consumido primero: es lo que hay que programar antes.
    return filas.sort((a, b) => (b.celda.pctConsumido ?? 0) - (a.celda.pctConsumido ?? 0))
  }, [detallePlan, estados, tareasById])

  // Meses con órdenes registradas (para el selector), más reciente primero.
  const mesesDisponibles = useMemo(
    () =>
      Array.from(new Set(mantenimientos.map((m) => m.fecha.slice(0, 7))))
        .sort((a, b) => b.localeCompare(a)),
    [mantenimientos]
  )

  // Las OT de cubiertas (rotación, alineación, balanceo, reparación, recapado) se
  // listan en la solapa Neumáticos, no acá.
  const otGenerales = useMemo(
    () => mantenimientos.filter((m) => m.rubro !== "neumaticos"),
    [mantenimientos]
  )
  const otNeumaticos = useMemo(
    () => mantenimientos.filter((m) => m.rubro === "neumaticos"),
    [mantenimientos]
  )

  const mantenimientosFiltrados = useMemo(() => {
    const q = fBusqueda.trim().toLowerCase()
    return otGenerales.filter(
      (m) =>
        (fDominio === "todos" || m.dominio === fDominio) &&
        (fTipo === "todos" || m.tipo === fTipo) &&
        (fEstado === "todos" || m.estado === fEstado) &&
        (fMes === "todos" || m.fecha.slice(0, 7) === fMes) &&
        (q === "" ||
          (m.numero_ot ?? "").toLowerCase().includes(q) ||
          (m.numero_factura ?? "").toLowerCase().includes(q) ||
          (m.cloudfleet_number != null && String(m.cloudfleet_number).includes(q)))
    )
  }, [otGenerales, fDominio, fTipo, fEstado, fMes, fBusqueda])

  // Costo total de las órdenes según los filtros aplicados.
  const costoFiltrado = useMemo(
    () => mantenimientosFiltrados.reduce((a, m) => a + costoTotalOt(m), 0),
    [mantenimientosFiltrados]
  )

  // Órdenes de trabajo abiertas (programadas / en taller) para el tablero.
  const otPendientes = useMemo<OTPendiente[]>(
    () =>
      mantenimientos
        .filter((m) => m.estado === "programado" || m.estado === "en_taller")
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .map((m) => ({
          id: m.id,
          dominio: m.dominio,
          fecha: m.fecha,
          estado: m.estado as "programado" | "en_taller",
          motivo:
            m.tareas?.map((t) => t.descripcion).filter(Boolean).join(", ") ||
            m.observaciones ||
            (m.tipo === "preventivo" ? "Service / preventivo" : TIPO_MANT_LABEL[m.tipo]),
        })),
    [mantenimientos]
  )

  // Resumen de neumáticos para la tarjeta del tablero.
  const unidades = useMemo(
    () =>
      estados.map((e) => ({
        dominio: e.vehiculo.dominio,
        tipo: e.vehiculo.tipo,
        sector: e.vehiculo.sector,
        modelo: e.vehiculo.modelo,
        anio: e.vehiculo.anio,
      })),
    [estados]
  )

  const navegar = (destino: string, dominio?: string) => {
    // Sin dominio se va al historial COMPLETO: si quedaba el filtro de la
    // navegación anterior, la solapa se abría mostrando una sola unidad.
    if (destino === "historial") setFDominio(dominio ?? "todos")
    setTab(destino)
  }

  const abrirRegistro = (dominio?: string, tareaId?: string) => {
    setNuevoPrefill({ dominio, tareaId })
    setNuevoOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mantenimiento de camiones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan preventivo de la flota controlado contra el km real de cada unidad.
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Evidencia del <span className="font-medium text-foreground">pilar Flota</span> de DPO.
            Cada sección indica el punto que responde.
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={() => abrirRegistro()}>
            <Plus className="mr-1 size-4" /> Nueva orden de trabajo
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Las 12 solapas estaban planas y sin jerarquía: los tableros del día
            convivían con el back-office. Se agrupan según SECCIONES_FLOTA y la
            lista pasa a altura automática, porque a 12 no entraban en una fila. */}
        <TabsList className="h-auto flex-wrap justify-start gap-y-1">
          {GRUPOS_ORDEN.map((g, gi) => {
            const secciones = seccionesDeGrupo(g).filter(
              (s) => s.id !== "plantillas" || puedeEditar
            )
            if (!secciones.length) return null
            return (
              <Fragment key={g}>
                {gi > 0 && (
                  <span
                    role="presentation"
                    aria-hidden
                    className="mx-1 h-4 w-px shrink-0 self-center bg-border"
                  />
                )}
                {secciones.map((s) => (
                  <TabsTrigger key={s.id} value={s.id} className="flex-none">
                    {s.label}
                  </TabsTrigger>
                ))}
              </Fragment>
            )
          })}
        </TabsList>

        {/* ============ TAB: Tablero operativo ============ */}
        <TabsContent value="tablero" className="space-y-6">
          {/* KPIs (solo en el tablero operativo). El grid era de 4 columnas con
              la última celda vacía; con 3 tarjetas, 3 columnas. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Tareas vencidas"
              valor={kpis.vencidas}
              estado={kpis.vencidas > 0 ? "critico" : "ok"}
              dpo="2.2"
              sub="Adherencia al plan preventivo · click para ver cuáles"
              onClick={() => setDetallePlan("vencido")}
            />
            <KpiCard
              label="Próximas a vencer"
              valor={kpis.proximas}
              estado={kpis.proximas > 0 ? "alerta" : "ok"}
              dpo="2.2"
              sub="Se programan antes del vencimiento · click para ver cuáles"
              onClick={() => setDetallePlan("proximo")}
            />
            <KpiCard
              label="Costo del mes"
              valor={fmtMoney(costos.costoMes)}
              dpo="3.2"
              sub="Gasto de flota imputado en el mes · click para ver el libro"
              onClick={() => setTab("gastos")}
            />
          </div>

          {reprogramadasAbiertas.length > 0 && (
            <ReprogramadasCard
              reprogramadas={reprogramadasAbiertas}
              tareasById={tareasById}
              estados={estados}
              puedeEditar={puedeEditar}
              onRegistrar={(dominio, tareaId) => abrirRegistro(dominio, tareaId)}
              onChanged={refresh}
            />
          )}

          <TableroOperativo
            programacion={tablero.programacion}
            documentos={tablero.documentos}
            unidadesBaja={tablero.unidadesBaja}
            puedeEditar={puedeEditar}
            onNavigate={navegar}
          />
        </TabsContent>

        {/* ============ TAB: Check lists ============ */}
        <TabsContent value="checklists" className="space-y-6">
          <ChecklistsMtto
            itemsNoOk={checklists.itemsNoOk}
            comentarios={checklists.comentarios}
            tareasCil={tareasCil}
            dominiosFlota={unidades.map((u) => u.dominio)}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* ============ TAB: Pirámide de defectos ============ */}
        <TabsContent value="analisis-items" className="space-y-6">
          <AnalisisItemsChecklist
            analisis={analisisChecklist}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        <TabsContent value="piramide" className="space-y-6">
          <PiramideDefectos
            itemsNoOk={checklists.itemsNoOk}
            mantenimientos={mantenimientos}
          />
        </TabsContent>

        {/* ============ TAB: Seguimiento de flota ============ */}
        <TabsContent value="seguimiento" className="space-y-6">
          <SeguimientoFlota
            mantenimientos={mantenimientos}
            unidades={unidades}
            diasRuteo={diasRuteo}
            indisponibilidades={indisponibilidades}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* ============ TAB: Neumáticos ============ */}
        <TabsContent value="neumaticos" className="space-y-6">
          <NeumaticosModule
            neumaticos={neumaticos}
            recapados={recapados}
            retirosCubiertas={retirosCubiertas}
            alineaciones={alineaciones}
            kmFlota={kmFlota}
            rotaciones={rotaciones}
            unidades={unidades}
            rotacionKm={rotacionKm}
            intervalos={intervalosNeumaticos}
            historialLecturas={historialLecturas}
            ordenes={otNeumaticos}
            tareasById={tareasById}
            reprogramadas={reprogramadas}
            proveedores={provList}
            onProveedorCreado={agregarProveedor}
            onEditarOrden={(m) => setEditMant(m)}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* ============ TAB: Indicadores de flota ============ */}
        <TabsContent value="indicadores" className="space-y-6">
          <IndicadoresFlota
            estados={estados}
            programacion={tablero.programacion}
            documentos={tablero.documentos}
            costos={costos}
            mantenimientos={mantenimientos}
            unidades={unidades}
            diasRuteo={diasRuteo}
            indisponibilidades={indisponibilidades}
            metas={flotaMetas}
            planes={flotaPlanes}
            kpiSnapshots={kpiSnapshots}
            extraSeries={kpiExtraSeries}
            estandaresPct={estandares.pct}
            estandaresPctMandatorio={estandares.pctMandatorio}
            estandaresPctExcelencia={estandares.pctExcelencia}
            puedeEditar={puedeEditar}
            esAdmin={esAdmin}
          />
        </TabsContent>

        {/* ============ TAB: Estándares de flota (DPO 1.2) ============ */}
        <TabsContent value="estandares" className="space-y-6">
          <EstandaresFlota
            items={estandares.items}
            cumplimiento={estandares.cumplimiento}
            unidades={estandares.unidades}
            pct={estandares.pct}
            pctMandatorio={estandares.pctMandatorio}
            pctExcelencia={estandares.pctExcelencia}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* ============ TAB: Repuestos (inventario, OC y novedades) ============ */}
        <TabsContent value="repuestos" className="space-y-6">
          <GestionMtto
            dominios={unidades.map((u) => u.dominio)}
            novedades={gestion.novedades}
            repuestos={gestion.repuestos}
            ordenesCompra={gestion.ordenesCompra}
            residuos={gestion.residuos}
            conteos={gestion.conteos}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* ============ TAB: Herramientas (registro de pañol) ============ */}
        <TabsContent value="herramientas" className="space-y-6">
          <HerramientasTab herramientas={herramientas} puedeEditar={puedeEditar} />
        </TabsContent>

        {/* ============ TAB: Programación de OT (semana + calendario) ============ */}
        <TabsContent value="programacion" className="space-y-6">
          <ProgramacionOt
            estados={estados}
            tareas={tareas}
            historialLecturas={historialLecturas}
            programacion={tablero.programacion}
            ultimasLecturas={ultimasLecturas}
            proveedores={provList}
            onProveedorCreado={agregarProveedor}
            otPendientes={otPendientes}
            onVerHistorial={(dominio) => navegar("historial", dominio)}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* ============ TAB: Órdenes de Trabajo ============ */}
        <TabsContent value="historial" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cada intervención de la flota (preventiva o correctiva). Una OT marcada como{" "}
            <span className="font-medium text-emerald-700">service general</span> reinicia el
            contador del próximo service en el tablero operativo.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={fBusqueda}
                  onChange={(e) => setFBusqueda(e.target.value)}
                  placeholder="N° OT o factura…"
                  className="w-48 pl-8"
                />
                {fBusqueda !== "" && (
                  <button
                    type="button"
                    onClick={() => setFBusqueda("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Dominio</Label>
              <Select
                value={fDominio}
                onValueChange={(v: string | null) => setFDominio(v ?? "todos")}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {estados.map((e) => (
                    <SelectItem key={e.vehiculo.dominio} value={e.vehiculo.dominio}>
                      {e.vehiculo.dominio}
                    </SelectItem>
                  ))}
                  {tablero.unidadesBaja.map((u) => (
                    <SelectItem key={u.dominio} value={u.dominio}>
                      {u.dominio} (baja)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={fTipo} onValueChange={(v: string | null) => setFTipo(v ?? "todos")}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="preventivo">Preventivo</SelectItem>
                  <SelectItem value="correctivo">Correctivo</SelectItem>
                  <SelectItem value="proactivo">Proactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <Select
                value={fEstado}
                onValueChange={(v: string | null) => setFEstado(v ?? "todos")}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(Object.keys(MANTENIMIENTO_ESTADO_LABELS) as MantenimientoEstado[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {MANTENIMIENTO_ESTADO_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Mes</Label>
              <Select value={fMes} onValueChange={(v: string | null) => setFMes(v ?? "todos")}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los meses</SelectItem>
                  {mesesDisponibles.map((ym) => (
                    <SelectItem key={ym} value={ym}>
                      {fmtMes(ym)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto rounded-lg border bg-muted/50 px-4 py-2 text-right">
              <p className="text-xs font-medium text-muted-foreground">
                Costo total ({mantenimientosFiltrados.length}{" "}
                {mantenimientosFiltrados.length === 1 ? "orden" : "órdenes"})
              </p>
              <p className="text-xl font-bold text-foreground">{fmtMoney(costoFiltrado)}</p>
            </div>
          </div>

          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {mantenimientosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <Wrench className="size-8 text-muted-foreground/50" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Sin mantenimientos registrados todavía.
                  </p>
                  {puedeEditar && (
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Cargá el último service conocido de cada unidad para inicializar el plan.
                    </p>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>N° OT / Fact.</TableHead>
                      <TableHead>Dominio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Tareas</TableHead>
                      <TableHead className="text-right">Km/Hs</TableHead>
                      <TableHead>Taller</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Disponibilidad</TableHead>
                      {puedeEditar && <TableHead className="w-20" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mantenimientosFiltrados.map((m, i) => (
                      <TableRow
                        key={m.id}
                        onClick={() => setVerMant(m)}
                        className={cn(
                          "cursor-pointer hover:bg-sky-50",
                          i % 2 === 1 && "bg-muted/50/60"
                        )}
                      >
                        <TableCell>{fmtFecha(m.fecha)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          <span className="block">
                            {m.numero_ot ||
                              (m.cloudfleet_number != null ? `CF #${m.cloudfleet_number}` : "—")}
                          </span>
                          {m.numero_factura && (
                            <span className="block text-muted-foreground/70">Fc {m.numero_factura}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {m.dominio}
                            {m.origen === "cloudfleet" && (
                              <Cloud
                                className="size-3.5 shrink-0 text-sky-400"
                                aria-label={`OT Cloudfleet #${m.cloudfleet_number ?? ""}`}
                              />
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={TIPO_MANT_BADGE[m.tipo]}>
                              {TIPO_MANT_LABEL[m.tipo]}
                            </Badge>
                            {m.es_service_general && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                              >
                                <Wrench className="size-3" /> Service general
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ESTADO_MANT_BADGE[m.estado]}>
                            {MANTENIMIENTO_ESTADO_LABELS[m.estado]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <span className="line-clamp-2 text-xs text-muted-foreground">
                            {(m.tareas || [])
                              .map((t) =>
                                t.tarea_id
                                  ? tareasById.get(t.tarea_id)?.nombre ?? "Tarea"
                                  : t.descripcion
                              )
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </span>
                          {(m.evidencia_urls?.length ?? 0) > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {m.evidencia_urls!.map((url, i) => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-0.5 text-xs text-sky-600 hover:underline"
                                >
                                  <Paperclip className="size-3" /> Factura{i > 0 ? ` ${i + 1}` : ""}
                                </a>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {m.odometro != null
                            ? fmtNum(m.odometro)
                            : m.horometro != null
                              ? `${fmtNum(Number(m.horometro))} hs`
                              : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.taller || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {costoTotalOt(m) > 0 ? fmtMoney(costoTotalOt(m)) : "—"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DisponibilidadCell m={m} puedeEditar={puedeEditar} onChanged={refresh} />
                        </TableCell>
                        {puedeEditar && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => setEditMant(m)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              {esAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-red-500 hover:text-red-600"
                                  onClick={() => setDeleteMantId(m.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ TAB: Gastos (facturas / boletas / caja chica) ============ */}
        <TabsContent value="gastos" className="space-y-4">
          <GastosTab
            gastos={gastos}
            proveedores={provList}
            onProveedorCreado={agregarProveedor}
            dominios={estados.map((e) => e.vehiculo.dominio)}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* ============ TAB: Plantillas ============ */}
        {puedeEditar && (
          <TabsContent value="plantillas" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Tareas del plan preventivo por tipo de unidad. Vence lo que ocurra primero
                (km, meses u horas).{" "}
                <span className="text-muted-foreground/80">
                  La rotación, la alineación y el balanceo no están acá: se controlan en la solapa{" "}
                  <span className="font-medium text-foreground">Neumáticos</span>, cada una con su
                  intervalo por tipo de unidad.
                </span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOverrideOpen(true)}>
                  Excepción por unidad
                </Button>
                <Button onClick={() => setNuevaTareaOpen(true)}>
                  <Plus className="mr-1 size-4" /> Nueva tarea
                </Button>
              </div>
            </div>

            {(["camion", "camioneta", "autoelevador", "utilitario", "acoplado"] as VehiculoTipo[])
              .filter((tipo) => tareas.some((t) => t.tipo_vehiculo === tipo))
              .map((tipo) => (
                <Card key={tipo}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{TIPO_VEHICULO_LABELS[tipo]}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tarea</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead className="text-right">Km</TableHead>
                          <TableHead className="text-right">Meses</TableHead>
                          <TableHead className="text-right">Horas</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tareas
                          .filter((t) => t.tipo_vehiculo === tipo)
                          .sort((a, b) => a.orden - b.orden)
                          .map((t) => (
                            <TableRow key={t.id} className={cn(!t.activo && "opacity-50")}>
                              <TableCell className="font-medium">{t.nombre}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {MANTENIMIENTO_CATEGORIA_LABELS[t.categoria]}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {t.frecuencia_km != null ? fmtNum(t.frecuencia_km) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {t.frecuencia_meses ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {t.frecuencia_horas ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    t.activo
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-muted text-muted-foreground"
                                  }
                                >
                                  {t.activo ? "Activa" : "Inactiva"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => setTareaEdit(t)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}

            {/* Excepciones por unidad */}
            {overrides.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Excepciones por unidad</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dominio</TableHead>
                        <TableHead>Tarea</TableHead>
                        <TableHead className="text-right">Km</TableHead>
                        <TableHead className="text-right">Meses</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        <TableHead>Aplica</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overrides.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.dominio}</TableCell>
                          <TableCell>{tareasById.get(o.tarea_id)?.nombre ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {o.frecuencia_km != null ? fmtNum(o.frecuencia_km) : "hereda"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {o.frecuencia_meses ?? "hereda"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {o.frecuencia_horas ?? "hereda"}
                          </TableCell>
                          <TableCell>
                            {o.activo ? (
                              "Sí"
                            ) : (
                              <span className="text-red-600">No aplica</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-red-500 hover:text-red-600"
                              onClick={async () => {
                                const res = await deletePlanOverride(o.id)
                                if ("error" in res) toast.error(res.error)
                                else {
                                  toast.success("Excepción eliminada")
                                  refresh()
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ============ Dialogs ============ */}
      {detallePlan && (
        <Dialog open onOpenChange={(o: boolean) => !o && setDetallePlan(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {detallePlan === "vencido" ? "Tareas vencidas" : "Tareas próximas a vencer"} (
                {filasPlan.length})
              </DialogTitle>
              <DialogDescription>
                Cada fila es una tarea del plan preventivo en una unidad, de la más
                consumida a la menos.
                {puedeEditar && " Desde “Cargar OT” se abre la orden con la unidad y la tarea ya puestas."}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto">
              {filasPlan.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hay tareas en este estado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Tarea</TableHead>
                      <TableHead>Último</TableHead>
                      <TableHead>Próximo</TableHead>
                      <TableHead className="text-right">Consumido</TableHead>
                      {puedeEditar && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filasPlan.map((f) => {
                      const u = f.esHoras ? "hs" : "km"
                      const ultimo = [
                        fmtFecha(f.celda.ultimaFecha),
                        f.esHoras
                          ? f.celda.ultimoHorometro != null
                            ? `${fmtNum(f.celda.ultimoHorometro)} ${u}`
                            : null
                          : f.celda.ultimoOdometro != null
                            ? `${fmtNum(f.celda.ultimoOdometro)} ${u}`
                            : null,
                      ]
                        .filter((v) => v && v !== "—")
                        .join(" · ")
                      const proximo = [
                        fmtFecha(f.celda.proximaFecha),
                        f.esHoras
                          ? f.celda.proximasHoras != null
                            ? `${fmtNum(f.celda.proximasHoras)} ${u}`
                            : null
                          : f.celda.proximoKm != null
                            ? `${fmtNum(f.celda.proximoKm)} ${u}`
                            : null,
                      ]
                        .filter((v) => v && v !== "—")
                        .join(" · ")
                      return (
                        <TableRow key={`${f.dominio}-${f.celda.tareaId}`}>
                          <TableCell className="font-medium">{f.dominio}</TableCell>
                          <TableCell>{f.tarea}</TableCell>
                          <TableCell className="text-muted-foreground">{ultimo || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {proximo || "—"}
                            {f.celda.soloPorTiempo && (
                              <span className="ml-1 text-xs">(por tiempo)</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold tabular-nums",
                              detallePlan === "vencido" ? "text-destructive" : "text-amber-600"
                            )}
                          >
                            {f.celda.pctConsumido == null
                              ? "—"
                              : `${Math.round(f.celda.pctConsumido)}%`}
                          </TableCell>
                          {puedeEditar && (
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setDetallePlan(null)
                                  abrirRegistro(f.dominio, f.celda.tareaId)
                                }}
                              >
                                Cargar OT
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {nuevoOpen && (
        <NuevoMantenimientoDialog
          estados={estados}
          tareasPorTipo={tareasPorTipo}
          tareasById={tareasById}
          reprogramadasAbiertas={reprogramadasAbiertas}
          ultimasLecturas={ultimasLecturas}
          historialLecturas={historialLecturas}
          siguienteNumeroOt={siguienteNumeroOt}
          proveedores={provList}
          onProveedorCreado={agregarProveedor}
          prefill={nuevoPrefill}
          onClose={() => setNuevoOpen(false)}
          onSaved={() => {
            setNuevoOpen(false)
            refresh()
          }}
        />
      )}

      {verMant && (
        <DetalleOrdenDialog
          mantenimiento={verMant}
          tareasById={tareasById}
          reprogramadas={reprogramadas.filter((r) => r.mantenimiento_id === verMant.id)}
          puedeEditar={puedeEditar}
          onClose={() => setVerMant(null)}
          onEditar={() => {
            const m = verMant
            setVerMant(null)
            setEditMant(m)
          }}
        />
      )}

      {editMant && (
        <EditarMantenimientoDialog
          mantenimiento={editMant}
          proveedores={provList}
          onProveedorCreado={agregarProveedor}
          onClose={() => setEditMant(null)}
          onSaved={() => {
            setEditMant(null)
            refresh()
          }}
        />
      )}

      {deleteMantId && (
        <Dialog open onOpenChange={(o) => !o && setDeleteMantId(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Eliminar mantenimiento</DialogTitle>
              <DialogDescription>
                Se elimina el registro y sus tareas. Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteMantId(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const res = await deleteMantenimiento(deleteMantId)
                  if ("error" in res) toast.error(res.error)
                  else {
                    toast.success("Mantenimiento eliminado")
                    setDeleteMantId(null)
                    refresh()
                  }
                }}
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {(tareaEdit || nuevaTareaOpen) && (
        <TareaPlantillaDialog
          tarea={tareaEdit}
          onClose={() => {
            setTareaEdit(null)
            setNuevaTareaOpen(false)
          }}
          onSaved={() => {
            setTareaEdit(null)
            setNuevaTareaOpen(false)
            refresh()
          }}
        />
      )}

      {overrideOpen && (
        <OverrideDialog
          estados={estados}
          tareas={tareas}
          onClose={() => setOverrideOpen(false)}
          onSaved={() => {
            setOverrideOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// Chips clicables con las últimas lecturas registradas de la unidad, para
// completar odómetro/horómetro sin retipear. `unidad` solo cambia el sufijo.
function SugerenciasLectura({
  sugerencias,
  valor,
  onElegir,
  unidad,
}: {
  sugerencias: LecturaSugerida[]
  valor: string
  onElegir: (v: string) => void
  unidad: "km" | "hs"
}) {
  if (sugerencias.length === 0) return null
  return (
    <div className="mt-1.5">
      <p className="text-[11px] text-muted-foreground/70">Últimas lecturas registradas:</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {sugerencias.map((s, i) => {
          const val = String(s.odometro)
          const activa = valor === val
          return (
            <button
              key={`${s.odometro}-${s.fecha}-${i}`}
              type="button"
              onClick={() => onElegir(val)}
              title={`${FUENTE_LECTURA_LABEL[s.fuente]} · ${fmtFecha(s.fecha)}`}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] tabular-nums transition-colors",
                activa
                  ? "border-sky-300 bg-sky-100 text-sky-700"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {fmtNum(s.odometro)}
              {unidad === "hs" && " hs"}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground/70">
                {fmtFecha(s.fecha)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ==================== Dialog: nuevo mantenimiento ====================

function NuevoMantenimientoDialog({
  estados,
  tareasPorTipo,
  tareasById,
  reprogramadasAbiertas,
  ultimasLecturas,
  historialLecturas,
  siguienteNumeroOt,
  proveedores,
  onProveedorCreado,
  prefill,
  onClose,
  onSaved,
}: {
  estados: EstadoPlanVehiculo[]
  tareasPorTipo: Map<VehiculoTipo, MantenimientoPlanTarea[]>
  tareasById: Map<string, MantenimientoPlanTarea>
  reprogramadasAbiertas: MantenimientoTareaReprogramada[]
  ultimasLecturas: Record<string, LecturaSugerida[]>
  historialLecturas: Record<string, LecturaSugerida[]>
  siguienteNumeroOt: string
  proveedores: MantenimientoProveedor[]
  onProveedorCreado: (p: MantenimientoProveedor) => void
  prefill: { dominio?: string; tareaId?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const [dominio, setDominio] = useState(prefill.dominio ?? "")
  const [fecha, setFecha] = useState(hoyISO())
  const [tipo, setTipo] = useState<MantenimientoTipo>("preventivo")
  const [estado, setEstado] = useState<MantenimientoEstado>("completado")
  const [odometro, setOdometro] = useState(() => {
    if (!prefill.dominio) return ""
    const e = estados.find((x) => x.vehiculo.dominio === prefill.dominio)
    return e?.kmActual != null ? String(e.kmActual) : ""
  })
  const [horometro, setHorometro] = useState("")
  const [taller, setTaller] = useState("")
  const [factura, setFactura] = useState("")
  // N° de OT sugerido = último correlativo + 1 (editable).
  const [numeroOt, setNumeroOt] = useState(siguienteNumeroOt)
  const [obs, setObs] = useState("")
  const [esServiceGeneral, setEsServiceGeneral] = useState(false)
  // Rubro: las OT de cubiertas se listan en la solapa Neumáticos.
  const [esNeumaticos, setEsNeumaticos] = useState(false)
  // Entrada/salida del taller (fecha + hora). De acá se deriva el período fuera
  // de servicio: por defecto la OT nueva marca la unidad NO disponible desde el
  // ingreso. Si no la saca de ruta, vaciá "Entrada al taller".
  const [entradaTaller, setEntradaTaller] = useState(ahoraLocal())
  const [salidaTaller, setSalidaTaller] = useState("")
  const [tareasSel, setTareasSel] = useState<Set<string>>(
    () => new Set(prefill.tareaId ? [prefill.tareaId] : [])
  )
  // Tareas del plan que quedaron sin hacer en este service y se reprograman.
  const [reprogramadas, setReprogramadas] = useState<Map<string, ReprogramadaForm>>(new Map())
  const [libres, setLibres] = useState<string[]>([])
  const [libreInput, setLibreInput] = useState("")
  const [repuestos, setRepuestos] = useState<RepuestoForm[]>([])
  const [costoMO, setCostoMO] = useState("")
  const [facturas, setFacturas] = useState<FacturaForm[]>([])
  const [saving, setSaving] = useState(false)

  const vehiculoSel = estados.find((e) => e.vehiculo.dominio === dominio)
  const tipoVeh = (vehiculoSel?.vehiculo.tipo ?? "camion") as VehiculoTipo
  const tareasDisponibles = vehiculoSel ? (tareasPorTipo.get(tipoVeh) ?? []) : []
  const esAutoelevador = tipoVeh === "autoelevador"
  // Últimas lecturas de la unidad para sugerir al cargar la OT sin retipear.
  // - Camiones/etc.: odómetro de registros/checklist/combustible.
  // - Autoelevadores: horómetro que se toma en el checklist (se guarda en la
  //   misma columna `odometro`, pero para el autoelevador representa horas).
  const lecturasUnidad = dominio ? (ultimasLecturas[dominio] ?? []) : []
  const sugerenciasKm = esAutoelevador ? [] : lecturasUnidad
  const sugerenciasHoras = esAutoelevador
    ? lecturasUnidad.filter((s) => s.fuente === "checklist")
    : []
  // Historial de lecturas del último mes de la unidad (una por día). Referencia
  // para cargar OTs con fecha retroactiva (facturas del mes cargadas juntas).
  const historialUnidad = dominio ? (historialLecturas[dominio] ?? []) : []
  const historialKm = esAutoelevador
    ? historialUnidad.filter((s) => s.fuente === "checklist")
    : historialUnidad
  const [historialOpen, setHistorialOpen] = useState(false)

  // Tareas ya reprogramadas (abiertas) de la unidad elegida, para avisar que
  // quedaron pendientes de un service anterior.
  const abiertasUnidad = useMemo(
    () => (dominio ? reprogramadasAbiertas.filter((r) => r.dominio === dominio) : []),
    [reprogramadasAbiertas, dominio]
  )

  const onDominioChange = (d: string) => {
    setDominio(d)
    const e = estados.find((x) => x.vehiculo.dominio === d)
    setOdometro(e?.kmActual != null ? String(e.kmActual) : "")
    setTareasSel(new Set(prefill.tareaId ? [prefill.tareaId] : []))
    setReprogramadas(new Map())
  }

  const submit = async () => {
    if (!dominio) {
      toast.error("Elegí la unidad")
      return
    }
    // Las tareas del plan son opcionales; si no se marca ninguna se genera una
    // tarea descriptiva con el tipo de mantenimiento (la OT igual queda registrada).
    const tareas = [
      ...Array.from(tareasSel).map((tareaId) => ({ tareaId })),
      ...libres.map((descripcion) => ({ descripcion })),
    ]
    if (tareas.length === 0) {
      tareas.push({
        descripcion: esServiceGeneral
          ? "Service general (rodado)"
          : `Mantenimiento ${TIPO_MANT_LABEL[tipo].toLowerCase()}`,
      })
    }
    setSaving(true)
    const comprobantes = await resolverFacturas(dominio, facturas)
    if (comprobantes === null) {
      setSaving(false)
      return
    }
    const res = await createMantenimiento({
      dominio,
      fecha,
      tipo,
      estado,
      odometro: parseNum(odometro),
      horometro: parseNum(horometro),
      taller,
      // El costo total se arma solo: mano de obra + repuestos.
      costo: totalOt(repuestos, costoMO),
      numero_factura: factura,
      numero_ot: numeroOt,
      observaciones: obs,
      es_service_general: esServiceGeneral,
      rubro: esNeumaticos ? "neumaticos" : "general",
      costo_mano_obra: parseNum(costoMO),
      repuestos: repuestosPayload(repuestos),
      facturas: comprobantes.facturas,
      evidencia_urls: comprobantes.urls.length > 0 ? comprobantes.urls : null,
      entrada_taller: entradaTaller || null,
      salida_taller: salidaTaller || null,
      tareas,
      reprogramadas: reprogramadasPayload(reprogramadas),
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    if (res.warning) toast.warning(res.warning)
    else if (reprogramadas.size > 0) {
      toast.success(
        `Mantenimiento registrado · ${reprogramadas.size} ${
          reprogramadas.size === 1 ? "tarea reprogramada" : "tareas reprogramadas"
        }`
      )
    } else {
      toast.success("Mantenimiento registrado")
    }
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar mantenimiento</DialogTitle>
          <DialogDescription>
            Preventivo del plan o reparación correctiva. También podés dejarlo como turno
            programado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unidad</Label>
              <Select
                value={dominio}
                onValueChange={(v: string | null) => v && onDominioChange(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Dominio" />
                </SelectTrigger>
                <SelectContent>
                  {estados.map((e) => (
                    <SelectItem key={e.vehiculo.dominio} value={e.vehiculo.dominio}>
                      {e.vehiculo.dominio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as MantenimientoTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventivo">Preventivo</SelectItem>
                  <SelectItem value="correctivo">Correctivo</SelectItem>
                  <SelectItem value="proactivo">Proactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v as MantenimientoEstado)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MANTENIMIENTO_ESTADO_LABELS) as MantenimientoEstado[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {MANTENIMIENTO_ESTADO_LABELS[k]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            {esAutoelevador ? (
              <div>
                <Label>Horómetro (hs)</Label>
                <Input
                  type="number"
                  value={horometro}
                  onChange={(e) => setHorometro(e.target.value)}
                  onFocus={() => setHistorialOpen(true)}
                  placeholder="Horas de uso"
                />
                <SugerenciasLectura
                  sugerencias={sugerenciasHoras}
                  valor={horometro}
                  onElegir={setHorometro}
                  unidad="hs"
                />
                <HistorialLecturasMes
                  open={historialOpen}
                  onToggle={() => setHistorialOpen((o) => !o)}
                  historial={historialKm}
                  unidad="hs"
                  onElegir={(val, f) => {
                    setHorometro(val)
                    setFecha(f)
                    setHistorialOpen(false)
                  }}
                />
              </div>
            ) : (
              <div>
                <Label>Odómetro (km)</Label>
                <Input
                  type="number"
                  value={odometro}
                  onChange={(e) => setOdometro(e.target.value)}
                  onFocus={() => setHistorialOpen(true)}
                  placeholder="Km al momento"
                />
                <SugerenciasLectura
                  sugerencias={sugerenciasKm}
                  valor={odometro}
                  onElegir={setOdometro}
                  unidad="km"
                />
                <HistorialLecturasMes
                  open={historialOpen}
                  onToggle={() => setHistorialOpen((o) => !o)}
                  historial={historialKm}
                  unidad="km"
                  onElegir={(val, f) => {
                    setOdometro(val)
                    setFecha(f)
                    setHistorialOpen(false)
                  }}
                />
              </div>
            )}
            <div>
              <Label>Taller / proveedor</Label>
              <ProveedorPicker
                proveedores={proveedores}
                value={taller}
                onChange={setTaller}
                onCreado={onProveedorCreado}
              />
            </div>
            <div>
              <Label>N° de OT</Label>
              <Input
                value={numeroOt}
                onChange={(e) => setNumeroOt(e.target.value)}
                placeholder="Automático al guardar"
              />
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {siguienteNumeroOt && numeroOt !== siguienteNumeroOt ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setNumeroOt(siguienteNumeroOt)}
                      className="font-medium text-sky-600 hover:underline"
                    >
                      Usar N° {siguienteNumeroOt}
                    </button>{" "}
                    (siguiente correlativo) · vacío = se asigna solo
                  </>
                ) : (
                  <>Siguiente correlativo. Si lo dejás vacío se asigna solo al guardar.</>
                )}
              </p>
            </div>
            <div>
              <Label>N° factura</Label>
              <Input value={factura} onChange={(e) => setFactura(e.target.value)} />
            </div>
            <div>
              <Label>Mano de obra ($)</Label>
              <Input
                type="number"
                value={costoMO}
                onChange={(e) => setCostoMO(e.target.value)}
              />
            </div>
          </div>

          {/* Repuestos por un lado, mano de obra por el otro; el total se suma solo. */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <RepuestosEditor repuestos={repuestos} setRepuestos={setRepuestos} />
            <TotalOtLinea repuestos={repuestos} costoManoObra={costoMO} />
          </div>

          <FacturasEditor facturas={facturas} setFacturas={setFacturas} />

          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-sm font-medium text-amber-800">Entrada y salida del taller</p>
            <p className="mb-2 text-xs text-amber-700">
              Mientras esté en el taller la unidad cuenta como <strong>fuera de servicio</strong>{" "}
              en la disponibilidad de flota. Cargá la salida cuando vuelva a ruta. Si la orden{" "}
              <strong>no</strong> la saca de circulación, vaciá la fecha de entrada.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Entrada al taller</Label>
                <Input
                  type="datetime-local"
                  value={entradaTaller}
                  onChange={(e) => setEntradaTaller(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Salida del taller</Label>
                <Input
                  type="datetime-local"
                  value={salidaTaller}
                  onChange={(e) => setSalidaTaller(e.target.value)}
                />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={esServiceGeneral}
              onCheckedChange={(c) => setEsServiceGeneral(c === true)}
            />
            <span>
              <span className="font-medium text-emerald-800">
                Es service general (rodado)
              </span>
              <span className="mt-0.5 block text-xs text-emerald-700">
                Reinicia el contador del próximo service en el tablero: la proyección pasa a
                tomar esta fecha y estos km como punto de partida.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={esNeumaticos}
              onCheckedChange={(c) => setEsNeumaticos(c === true)}
            />
            <span>
              <span className="font-medium text-slate-800">Es trabajo de neumáticos</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Rotación, alineación, balanceo, reparación o recapado. La OT se lista en la solapa
                Neumáticos y no entre las de mantenimiento general.
              </span>
            </span>
          </label>

          {/* Detalle de tareas: qué se hizo en el service y qué quedó pendiente.
              🚨 Va ABIERTO. Estuvo plegado y rotulado "(opcional)" hasta el
              13/08/2026, y el que cargaba no lo veía: de las 122 tareas del plan
              sólo 13 tenían registro, todas de Service, porque nadie llegaba a
              esta sección. Sin la tarea tildada el sistema no sabe cuándo se hizo
              por última vez y NUNCA avisa que vence — que es justamente para lo
              que existe el plan preventivo. */}
          <details className="rounded-md border border-border p-3" open>
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Qué se le hizo — tareas del plan
              {reprogramadas.size > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-700">
                  · {reprogramadas.size} reprogramada{reprogramadas.size === 1 ? "" : "s"}
                </span>
              )}
            </summary>
            <div className="mt-3 space-y-3">
              {dominio && (
                <div>
                  <Label>Tareas del plan</Label>
                  <div className="mt-1.5">
                    <TareasPlanEditor
                      tareas={tareasDisponibles}
                      hechas={tareasSel}
                      setHechas={setTareasSel}
                      pendientes={reprogramadas}
                      setPendientes={setReprogramadas}
                      abiertasPrevias={abiertasUnidad}
                      tareasById={tareasById}
                    />
                  </div>
                </div>
              )}

              <div>
                <Label>Otras tareas (libres)</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    value={libreInput}
                    onChange={(e) => setLibreInput(e.target.value)}
                    placeholder="Ej: cambio de paragolpes"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && libreInput.trim()) {
                        e.preventDefault()
                        setLibres((l) => [...l, libreInput.trim()])
                        setLibreInput("")
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (libreInput.trim()) {
                        setLibres((l) => [...l, libreInput.trim()])
                        setLibreInput("")
                      }
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                {libres.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {libres.map((l, i) => (
                      <Badge key={i} variant="outline" className="gap-1">
                        {l}
                        <button onClick={() => setLibres((arr) => arr.filter((_, j) => j !== i))}>
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>

          <div>
            <Label>Observaciones</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Tareas del plan en la OT ====================

// Frecuencia de la tarea del plan en texto corto, para que al tildarla se vea a
// qué intervalo corresponde (el service de camión es a los 20.000 km).
function frecuenciaTarea(t: MantenimientoPlanTarea): string {
  const partes: string[] = []
  if (t.frecuencia_km != null) partes.push(`${fmtNum(t.frecuencia_km)} km`)
  if (t.frecuencia_horas != null) partes.push(`${fmtNum(t.frecuencia_horas)} hs`)
  if (t.frecuencia_meses != null) partes.push(`${t.frecuencia_meses} meses`)
  return partes.join(" / ")
}

/**
 * Tareas que van "de la mano" con el service: la tarea Service del tipo de
 * unidad y todas las del plan con la MISMA frecuencia en el mismo eje (camión
 * 20.000 km: aceite + filtro, filtro de combustible + trampa de agua, filtro de
 * aire, regulación de frenos, cardán y fluidos). Al tildar Service se tildan
 * todas juntas, así queda registrado qué se le hizo a los 20.000 km.
 */
function paqueteDelService(tareas: MantenimientoPlanTarea[]): {
  service: MantenimientoPlanTarea | null
  hermanas: MantenimientoPlanTarea[]
} {
  const service = tareas.find((t) => t.codigo === "service") ?? null
  if (!service) return { service: null, hermanas: [] }
  const hermanas = tareas.filter(
    (t) =>
      t.id !== service.id &&
      ((service.frecuencia_km != null && t.frecuencia_km === service.frecuencia_km) ||
        (service.frecuencia_horas != null && t.frecuencia_horas === service.frecuencia_horas))
  )
  return { service, hermanas }
}

/** Lo que se carga por cada tarea que quedó sin hacer. */
interface ReprogramadaForm {
  motivo: string
  km: string
  fecha: string
}

function reprogramadasPayload(pendientes: Map<string, ReprogramadaForm>) {
  return Array.from(pendientes.entries()).map(([tareaId, p]) => ({
    tareaId,
    motivo: p.motivo,
    reprogramadaKm: parseNum(p.km),
    reprogramadaFecha: p.fecha || null,
  }))
}

/**
 * Selector de tareas del plan de la OT. Cada tarea puede quedar:
 *   - tildada = se hizo (cuenta como realizada y reinicia su contador);
 *   - "no se hizo" = queda REPROGRAMADA con motivo y para cuándo (no reinicia
 *     nada y sigue apareciendo como pendiente de la unidad);
 *   - sin marcar = no formó parte de esta OT.
 */
function TareasPlanEditor({
  tareas,
  hechas,
  setHechas,
  pendientes,
  setPendientes,
  abiertasPrevias,
  tareasById,
}: {
  tareas: MantenimientoPlanTarea[]
  hechas: Set<string>
  setHechas: (s: Set<string>) => void
  pendientes: Map<string, ReprogramadaForm>
  setPendientes: (m: Map<string, ReprogramadaForm>) => void
  /** Reprogramadas abiertas de esta unidad, de OTs anteriores. */
  abiertasPrevias: MantenimientoTareaReprogramada[]
  tareasById: Map<string, MantenimientoPlanTarea>
}) {
  const { service, hermanas } = useMemo(() => paqueteDelService(tareas), [tareas])
  const hermanasIds = useMemo(() => hermanas.map((h) => h.id), [hermanas])

  // Tildar el Service arrastra las tareas del mismo intervalo; destildarlo las
  // suelta. Cada una se puede corregir después una por una.
  const marcarHecha = (id: string) => {
    const next = new Set(hechas)
    const esService = service?.id === id
    if (next.has(id)) {
      next.delete(id)
      if (esService) for (const h of hermanasIds) next.delete(h)
    } else {
      next.add(id)
      if (esService) for (const h of hermanasIds) next.add(h)
    }
    setHechas(next)
    // Lo que se marca como hecho deja de estar pendiente.
    const nextPend = new Map(pendientes)
    nextPend.delete(id)
    if (esService) for (const h of hermanasIds) nextPend.delete(h)
    setPendientes(nextPend)
  }

  const marcarPendiente = (id: string) => {
    const nextPend = new Map(pendientes)
    if (nextPend.has(id)) nextPend.delete(id)
    else nextPend.set(id, { motivo: "", km: "", fecha: "" })
    setPendientes(nextPend)
    const next = new Set(hechas)
    next.delete(id)
    setHechas(next)
  }

  const editarPendiente = (id: string, patch: Partial<ReprogramadaForm>) => {
    const actual = pendientes.get(id)
    if (!actual) return
    const nextPend = new Map(pendientes)
    nextPend.set(id, { ...actual, ...patch })
    setPendientes(nextPend)
  }

  const tomarPrevias = () => {
    const next = new Set(hechas)
    for (const p of abiertasPrevias) next.add(p.tarea_id)
    setHechas(next)
  }

  if (tareas.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/70">
        No hay tareas de plan para este tipo de unidad.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {abiertasPrevias.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-xs">
          <p className="font-medium text-amber-900">
            Esta unidad tiene {abiertasPrevias.length}{" "}
            {abiertasPrevias.length === 1 ? "tarea reprogramada" : "tareas reprogramadas"} de
            órdenes anteriores
          </p>
          <ul className="mt-1 space-y-0.5 text-amber-800">
            {abiertasPrevias.map((p) => (
              <li key={p.id}>
                • {tareasById.get(p.tarea_id)?.nombre ?? "Tarea"}
                {p.reprogramada_km != null && ` — para los ${fmtNum(p.reprogramada_km)} km`}
                {p.reprogramada_fecha && ` — para el ${fmtFecha(p.reprogramada_fecha)}`}
                {p.motivo && ` (${p.motivo})`}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs"
            onClick={tomarPrevias}
          >
            Se hicieron en esta OT
          </Button>
        </div>
      )}

      {service && (
        <p className="text-xs text-muted-foreground">
          Al tildar <span className="font-medium text-foreground">{service.nombre}</span> se marcan
          también las {hermanas.length} tareas del mismo intervalo
          {frecuenciaTarea(service) ? ` (${frecuenciaTarea(service)})` : ""}. Si alguna no se hizo,
          usá <span className="font-medium text-foreground">No se hizo</span> y queda reprogramada.
        </p>
      )}

      <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        {tareas.map((t) => {
          const pend = pendientes.get(t.id)
          return (
            <div
              key={t.id}
              className={cn(
                "rounded-md border px-2 py-1.5 text-sm",
                pend ? "border-amber-200 bg-amber-50/70" : "border-transparent"
              )}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={hechas.has(t.id)}
                  disabled={!!pend}
                  onCheckedChange={() => marcarHecha(t.id)}
                />
                <span className="flex-1 leading-tight">
                  {t.nombre}
                  {frecuenciaTarea(t) && (
                    <span className="ml-1.5 text-xs text-muted-foreground/70">
                      {frecuenciaTarea(t)}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant={pend ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => marcarPendiente(t.id)}
                >
                  <CalendarClock className="mr-1 size-3.5" />
                  {pend ? "Cancelar" : "No se hizo"}
                </Button>
              </div>

              {pend && (
                <div className="mt-2 grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <Label className="text-xs text-amber-900">Motivo</Label>
                    <Input
                      className="h-8 text-sm"
                      value={pend.motivo}
                      onChange={(e) => editarPendiente(t.id, { motivo: e.target.value })}
                      placeholder="Ej: no había filtro de aire en stock"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-amber-900">Reprogramar a (km)</Label>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      value={pend.km}
                      onChange={(e) => editarPendiente(t.id, { km: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-amber-900">o para la fecha</Label>
                    <Input
                      className="h-8 text-sm"
                      type="date"
                      value={pend.fecha}
                      onChange={(e) => editarPendiente(t.id, { fecha: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {pendientes.size > 0 && (
        <p className="text-xs text-amber-700">
          {pendientes.size} {pendientes.size === 1 ? "tarea queda" : "tareas quedan"} reprogramadas:
          NO cuentan como hechas y se van a seguir mostrando como pendientes de la unidad hasta que
          se registren.
        </p>
      )}
    </div>
  )
}

/**
 * Tarjeta del tablero con las tareas que quedaron sin hacer en un service y se
 * reprogramaron. Es el recordatorio de "faltaba el filtro": desde acá se abre la
 * OT que las registra, o se cierran a mano.
 */
function ReprogramadasCard({
  reprogramadas,
  tareasById,
  estados,
  puedeEditar,
  onRegistrar,
  onChanged,
}: {
  reprogramadas: MantenimientoTareaReprogramada[]
  tareasById: Map<string, MantenimientoPlanTarea>
  estados: EstadoPlanVehiculo[]
  puedeEditar: boolean
  onRegistrar: (dominio: string, tareaId: string) => void
  onChanged: () => void
}) {
  const [cerrando, setCerrando] = useState<string | null>(null)
  const kmPorDominio = useMemo(
    () => new Map(estados.map((e) => [e.vehiculo.dominio, e.kmActual])),
    [estados]
  )

  const cerrar = async (id: string, estado: "resuelta" | "cancelada") => {
    setCerrando(id)
    const res = await cerrarTareaReprogramada(id, estado)
    setCerrando(null)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(estado === "resuelta" ? "Tarea marcada como hecha" : "Tarea cancelada")
    onChanged()
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-amber-600" />
          Tareas reprogramadas ({reprogramadas.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Quedaron sin hacer en un service (falta de repuesto, tiempo, etc.). No cuentan como
          realizadas: el plan las sigue mostrando pendientes hasta que se registren.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {reprogramadas.map((r) => {
          const kmActual = kmPorDominio.get(r.dominio) ?? null
          // Ya llegó al km en el que había que hacerla.
          const vencida =
            (r.reprogramada_km != null && kmActual != null && kmActual >= r.reprogramada_km) ||
            (r.reprogramada_fecha != null && hoyISO() >= r.reprogramada_fecha)
          return (
            <div
              key={r.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
                vencida ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/50"
              )}
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {r.dominio} · {tareasById.get(r.tarea_id)?.nombre ?? "Tarea del plan"}
                  {vencida && (
                    <Badge
                      variant="outline"
                      className="ml-2 border-red-300 bg-red-100 text-xs text-red-700"
                    >
                      ya corresponde
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.motivo || "Sin motivo cargado"}
                  {r.reprogramada_km != null && ` · para los ${fmtNum(r.reprogramada_km)} km`}
                  {r.reprogramada_fecha && ` · para el ${fmtFecha(r.reprogramada_fecha)}`}
                  {kmActual != null && ` · hoy ${fmtNum(kmActual)} km`}
                </p>
              </div>
              {puedeEditar && (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onRegistrar(r.dominio, r.tarea_id)}
                  >
                    <Wrench className="mr-1 size-3.5" /> Registrar OT
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={cerrando === r.id}
                    onClick={() => cerrar(r.id, "resuelta")}
                  >
                    Ya se hizo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={cerrando === r.id}
                    onClick={() => cerrar(r.id, "cancelada")}
                  >
                    No corresponde
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ==================== Campos reutilizables de la OT ====================

// ===== Facturas de la OT (varias, cada una con proveedor + nº + monto) =====
//
// Una OT suele tener más de un comprobante: los repuestos los factura un
// proveedor y la mano de obra otro (ej. OT 1725 del AF664NY: repuestos de Don
// Gregorio, mano de obra de Luval y la boleta de la cañonera). Antes había un
// solo `numero_factura` para toda la OT y los archivos iban sueltos en
// `evidencia_urls`, sin saber cuál era de quién ni por cuánto.

interface FacturaForm {
  proveedor: string
  numero: string
  monto: string
  /** Adjunto ya subido (OT que se está editando). */
  adjuntoUrl: string | null
  /** Adjunto nuevo, se sube al guardar. */
  archivo: File | null
}

function nuevaFactura(): FacturaForm {
  return { proveedor: "", numero: "", monto: "", adjuntoUrl: null, archivo: null }
}

/**
 * Filas del editor a partir de la OT guardada. Las OT viejas no tienen lista de
 * facturas: se arman filas con lo que haya (`numero_factura` + los adjuntos de
 * `evidencia_urls`) para que al editarlas queden ordenadas sin recargar nada.
 */
function facturasDesde(m: MantenimientoRealizado): FacturaForm[] {
  if (m.facturas && m.facturas.length > 0) {
    return [...m.facturas]
      .sort((a, b) => a.orden - b.orden)
      .map((f) => ({
        proveedor: f.proveedor ?? "",
        numero: f.numero ?? "",
        monto: f.monto_total != null ? String(f.monto_total) : "",
        adjuntoUrl: f.adjunto_url,
        archivo: null,
      }))
  }
  const urls = m.evidencia_urls ?? []
  if (urls.length === 0 && !m.numero_factura) return []
  if (urls.length === 0) {
    return [{ ...nuevaFactura(), proveedor: m.taller ?? "", numero: m.numero_factura ?? "" }]
  }
  return urls.map((url, i) => ({
    proveedor: i === 0 ? (m.taller ?? "") : "",
    numero: i === 0 ? (m.numero_factura ?? "") : "",
    monto: "",
    adjuntoUrl: url,
    archivo: null,
  }))
}

/** Suma de los montos cargados, para contrastarla con el total de la OT. */
function totalFacturas(facturas: FacturaForm[]): number {
  return facturas.reduce((a, f) => a + (parseFloat(f.monto) || 0), 0)
}

/**
 * Sube los adjuntos nuevos y devuelve el payload para la action.
 * null = falló una subida (el toast ya se mostró) y no hay que guardar.
 */
async function resolverFacturas(
  dominio: string,
  filas: FacturaForm[]
): Promise<
  | { facturas: Array<{ proveedor: string | null; numero: string | null; montoTotal: number | null; adjuntoUrl: string | null }>; urls: string[] }
  | null
> {
  const archivos = filas.map((f) => f.archivo).filter((a): a is File => a != null)
  const subidas = await subirFacturas(dominio, archivos)
  if (subidas === null) return null

  let i = 0
  const facturas = filas.map((f) => ({
    proveedor: f.proveedor.trim() || null,
    numero: f.numero.trim() || null,
    montoTotal: f.monto.trim() ? parseFloat(f.monto) : null,
    adjuntoUrl: f.archivo ? (subidas[i++] ?? null) : f.adjuntoUrl,
  }))
  // Las URLs también van a evidencia_urls: es lo que siguen leyendo la grilla y
  // las OT viejas, así el adjunto se ve igual en todos lados.
  const urls = facturas.map((f) => f.adjuntoUrl).filter((u): u is string => !!u)
  return { facturas, urls }
}

function FacturasEditor({
  facturas,
  setFacturas,
}: {
  facturas: FacturaForm[]
  setFacturas: (f: FacturaForm[]) => void
}) {
  const set = (i: number, patch: Partial<FacturaForm>) =>
    setFacturas(facturas.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <Label>Facturas y comprobantes</Label>
          <p className="text-xs text-muted-foreground">
            Una por proveedor: los repuestos y la mano de obra suelen venir separados.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFacturas([...facturas, nuevaFactura()])}
        >
          <Plus className="mr-1 size-3.5" /> Agregar
        </Button>
      </div>

      {facturas.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Sin comprobantes cargados.
        </p>
      ) : (
        <div className="space-y-2">
          {facturas.map((f, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-4">
                <Label className="text-xs text-muted-foreground">Proveedor</Label>
                <Input
                  value={f.proveedor}
                  onChange={(e) => set(i, { proveedor: e.target.value })}
                  placeholder="Don Gregorio"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">N°</Label>
                <Input
                  value={f.numero}
                  onChange={(e) => set(i, { numero: e.target.value })}
                  placeholder="12353"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Monto</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={f.monto}
                  onChange={(e) => set(i, { monto: e.target.value })}
                />
              </div>
              <div className="col-span-3">
                <Label className="text-xs text-muted-foreground">Adjunto</Label>
                {f.archivo || f.adjuntoUrl ? (
                  <div className="flex h-9 items-center gap-1 rounded-md border px-2 text-xs">
                    <Paperclip className="size-3 shrink-0" />
                    <span className="truncate">
                      {f.archivo ? f.archivo.name : nombreArchivoDeUrl(f.adjuntoUrl!)}
                    </span>
                    <button
                      type="button"
                      className="ml-auto shrink-0 text-slate-400 hover:text-slate-700"
                      onClick={() => set(i, { archivo: null, adjuntoUrl: null })}
                      title="Quitar el adjunto"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <Input
                    type="file"
                    accept={ACCEPT_FACTURA}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) set(i, { archivo: file })
                      e.target.value = ""
                    }}
                  />
                )}
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-red-500 hover:text-red-700"
                  onClick={() => setFacturas(facturas.filter((_, j) => j !== i))}
                  title="Quitar la factura"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {totalFacturas(facturas) > 0 && (
            <p className="pt-1 text-right text-xs text-muted-foreground">
              Suma de comprobantes:{" "}
              <span className="font-mono font-medium text-slate-700">
                {fmtMoney(totalFacturas(facturas))}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}


// ===== Repuestos + mano de obra (para que queden desglosados en la OT) =====

interface RepuestoForm {
  descripcion: string
  cantidad: string
  costoUnitario: string
}

function nuevoRepuesto(): RepuestoForm {
  return { descripcion: "", cantidad: "1", costoUnitario: "" }
}

// Subtotal de repuestos = Σ (cantidad × costo unitario) de las filas con datos.
function subtotalRepuestos(reps: RepuestoForm[]): number {
  return reps.reduce((a, r) => {
    const cant = parseFloat(r.cantidad) || 0
    const cu = parseFloat(r.costoUnitario) || 0
    return a + cant * cu
  }, 0)
}

// Convierte los repuestos cargados de la BD al formato editable del formulario.
function repuestosDesde(m: MantenimientoRealizado): RepuestoForm[] {
  return (m.repuestos ?? []).map((r) => ({
    descripcion: r.descripcion,
    cantidad: r.cantidad != null ? String(r.cantidad) : "1",
    costoUnitario: r.costo_unitario != null ? String(r.costo_unitario) : "",
  }))
}

// Mapea las filas del formulario al payload de la action (descarta vacías).
function repuestosPayload(reps: RepuestoForm[]) {
  return reps
    .filter((r) => r.descripcion.trim())
    .map((r) => ({
      descripcion: r.descripcion.trim(),
      cantidad: parseFloat(r.cantidad) || 1,
      costoUnitario: r.costoUnitario.trim() ? parseFloat(r.costoUnitario) : null,
    }))
}

// Editor de la lista de repuestos (descripción + cantidad + costo unitario).
function RepuestosEditor({
  repuestos,
  setRepuestos,
}: {
  repuestos: RepuestoForm[]
  setRepuestos: (r: RepuestoForm[]) => void
}) {
  const update = (i: number, patch: Partial<RepuestoForm>) =>
    setRepuestos(repuestos.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => setRepuestos(repuestos.filter((_, j) => j !== i))
  return (
    <div>
      <Label>Repuestos</Label>
      <p className="mb-1 text-xs text-muted-foreground">
        Los repuestos comprados aparte, para que queden separados de la mano de obra.
      </p>
      {repuestos.length > 0 && (
        <div className="mt-1.5 space-y-2">
          {repuestos.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={r.descripcion}
                onChange={(e) => update(i, { descripcion: e.target.value })}
                placeholder="Repuesto"
                className="flex-1"
              />
              <Input
                type="number"
                value={r.cantidad}
                onChange={(e) => update(i, { cantidad: e.target.value })}
                placeholder="Cant."
                className="w-16"
              />
              <Input
                type="number"
                value={r.costoUnitario}
                onChange={(e) => update(i, { costoUnitario: e.target.value })}
                placeholder="$ c/u"
                className="w-24"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 text-muted-foreground/70 hover:text-red-500"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => setRepuestos([...repuestos, nuevoRepuesto()])}
      >
        <Plus className="mr-1 size-4" /> Agregar repuesto
      </Button>
      {subtotalRepuestos(repuestos) > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Subtotal repuestos: {fmtMoney(subtotalRepuestos(repuestos))}
        </p>
      )}
    </div>
  )
}

// Total de la OT = mano de obra + repuestos, cada suma por su lado y el total al pie.
function TotalOtLinea({
  repuestos,
  costoManoObra,
}: {
  repuestos: RepuestoForm[]
  costoManoObra: string
}) {
  const mo = parseFloat(costoManoObra) || 0
  const rep = subtotalRepuestos(repuestos)
  if (mo <= 0 && rep <= 0) return null
  return (
    <div className="space-y-0.5 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <p className="flex justify-between">
        <span>Mano de obra</span>
        <span className="tabular-nums">{fmtMoney(mo)}</span>
      </p>
      <p className="flex justify-between">
        <span>Repuestos</span>
        <span className="tabular-nums">{fmtMoney(rep)}</span>
      </p>
      <p className="flex justify-between border-t border-border pt-0.5 text-sm font-semibold text-foreground">
        <span>Total</span>
        <span className="tabular-nums">{fmtMoney(mo + rep)}</span>
      </p>
    </div>
  )
}

// Total que se guarda en `costo` (lo usa el reporte de costos): MO + repuestos.
function totalOt(repuestos: RepuestoForm[], costoManoObra: string): number | null {
  const mo = parseFloat(costoManoObra) || 0
  const total = mo + subtotalRepuestos(repuestos)
  return total > 0 ? total : null
}

// ==================== Dialog: editar mantenimiento ====================

function EditarMantenimientoDialog({
  mantenimiento,
  proveedores,
  onProveedorCreado,
  onClose,
  onSaved,
}: {
  mantenimiento: MantenimientoRealizado
  proveedores: MantenimientoProveedor[]
  onProveedorCreado: (p: MantenimientoProveedor) => void
  onClose: () => void
  onSaved: () => void
}) {
  const m = mantenimiento
  const [fecha, setFecha] = useState(m.fecha)
  const [estado, setEstado] = useState<MantenimientoEstado>(m.estado)
  const [odometro, setOdometro] = useState(m.odometro != null ? String(m.odometro) : "")
  const [horometro, setHorometro] = useState(m.horometro != null ? String(m.horometro) : "")
  const [taller, setTaller] = useState(m.taller ?? "")
  const [factura, setFactura] = useState(m.numero_factura ?? "")
  const [numeroOt, setNumeroOt] = useState(m.numero_ot ?? "")
  const [obs, setObs] = useState(m.observaciones ?? "")
  const [esServiceGeneral, setEsServiceGeneral] = useState(m.es_service_general)
  const [esNeumaticos, setEsNeumaticos] = useState(m.rubro === "neumaticos")
  // Entrada/salida del taller (prellenadas desde la OT o, en OT viejas, desde el
  // período fuera de servicio que se haya cargado).
  const [entradaTaller, setEntradaTaller] = useState(
    aDatetimeLocal(m.entrada_taller ?? m.fuera_servicio_desde)
  )
  const [salidaTaller, setSalidaTaller] = useState(
    aDatetimeLocal(m.salida_taller ?? m.fuera_servicio_hasta)
  )
  const [facturas, setFacturas] = useState<FacturaForm[]>(() => facturasDesde(m))
  const [repuestos, setRepuestos] = useState<RepuestoForm[]>(() => repuestosDesde(m))
  const [costoMO, setCostoMO] = useState(() => {
    if (m.costo_mano_obra != null) return String(m.costo_mano_obra)
    // OT vieja sin desglose: la mano de obra hereda el costo total menos los repuestos.
    if (m.costo != null) {
      const mo = Number(m.costo) - subtotalRepuestos(repuestosDesde(m))
      return mo > 0 ? String(mo) : ""
    }
    return ""
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const comprobantes = await resolverFacturas(m.dominio, facturas)
    if (comprobantes === null) {
      setSaving(false)
      return
    }
    const res = await updateMantenimiento({
      id: m.id,
      fecha,
      estado,
      odometro: parseNum(odometro),
      horometro: parseNum(horometro),
      taller,
      // El costo total se arma solo: mano de obra + repuestos.
      costo: totalOt(repuestos, costoMO),
      numero_factura: factura,
      numero_ot: numeroOt,
      observaciones: obs,
      es_service_general: esServiceGeneral,
      rubro: esNeumaticos ? "neumaticos" : "general",
      costo_mano_obra: parseNum(costoMO),
      repuestos: repuestosPayload(repuestos),
      facturas: comprobantes.facturas,
      evidencia_urls: comprobantes.urls,
      entrada_taller: entradaTaller || null,
      salida_taller: salidaTaller || null,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Mantenimiento actualizado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Editar mantenimiento · {m.dominio} ({fmtFecha(m.fecha)})
          </DialogTitle>
          <DialogDescription>
            Cambiá el estado a “Completado” cuando la unidad salga del taller.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as MantenimientoEstado)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MANTENIMIENTO_ESTADO_LABELS) as MantenimientoEstado[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {MANTENIMIENTO_ESTADO_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Odómetro (km)</Label>
            <Input type="number" value={odometro} onChange={(e) => setOdometro(e.target.value)} />
          </div>
          <div>
            <Label>Horómetro (hs)</Label>
            <Input
              type="number"
              value={horometro}
              onChange={(e) => setHorometro(e.target.value)}
            />
          </div>
          <div>
            <Label>Taller / proveedor</Label>
            <ProveedorPicker
              proveedores={proveedores}
              value={taller}
              onChange={setTaller}
              onCreado={onProveedorCreado}
            />
          </div>
          <div>
            <Label>Mano de obra ($)</Label>
            <Input
              type="number"
              value={costoMO}
              onChange={(e) => setCostoMO(e.target.value)}
            />
          </div>
          <div>
            <Label>N° factura</Label>
            <Input value={factura} onChange={(e) => setFactura(e.target.value)} />
          </div>
          <div>
            <Label>N° de OT</Label>
            <Input
              value={numeroOt}
              onChange={(e) => setNumeroOt(e.target.value)}
              placeholder="Orden de trabajo"
            />
          </div>
          {/* Repuestos por un lado, mano de obra por el otro; el total se suma solo. */}
          <div className="col-span-2 space-y-3 rounded-md border border-border p-3">
            <RepuestosEditor repuestos={repuestos} setRepuestos={setRepuestos} />
            <TotalOtLinea repuestos={repuestos} costoManoObra={costoMO} />
          </div>
          <div className="col-span-2">
            <Label>Observaciones</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
          <label className="col-span-2 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={esServiceGeneral}
              onCheckedChange={(c) => setEsServiceGeneral(c === true)}
            />
            <span>
              <span className="font-medium text-emerald-800">Es service general (rodado)</span>
              <span className="mt-0.5 block text-xs text-emerald-700">
                Ancla el contador del próximo service en esta fecha y estos km.
              </span>
            </span>
          </label>

          <label className="col-span-2 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={esNeumaticos}
              onCheckedChange={(c) => setEsNeumaticos(c === true)}
            />
            <span>
              <span className="font-medium text-slate-800">Es trabajo de neumáticos</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Con esto la OT pasa a listarse en la solapa Neumáticos.
              </span>
            </span>
          </label>

          <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-sm font-medium text-amber-800">Entrada y salida del taller</p>
            <p className="mb-2 text-xs text-amber-700">
              Mientras esté en el taller la unidad cuenta como fuera de servicio en la
              disponibilidad de flota. Cargá la salida cuando vuelva a ruta. Vacío = no salió de ruta.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Entrada al taller</Label>
                <Input
                  type="datetime-local"
                  value={entradaTaller}
                  onChange={(e) => setEntradaTaller(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Salida del taller</Label>
                <Input
                  type="datetime-local"
                  value={salidaTaller}
                  onChange={(e) => setSalidaTaller(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <FacturasEditor facturas={facturas} setFacturas={setFacturas} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Dialog: tarea de plantilla ====================

function TareaPlantillaDialog({
  tarea,
  onClose,
  onSaved,
}: {
  tarea: MantenimientoPlanTarea | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(tarea?.nombre ?? "")
  const [categoria, setCategoria] = useState<MantenimientoCategoria>(tarea?.categoria ?? "general")
  const [tipoVeh, setTipoVeh] = useState<VehiculoTipo>(tarea?.tipo_vehiculo ?? "camion")
  const [frecKm, setFrecKm] = useState(
    tarea?.frecuencia_km != null ? String(tarea.frecuencia_km) : ""
  )
  const [frecMeses, setFrecMeses] = useState(
    tarea?.frecuencia_meses != null ? String(tarea.frecuencia_meses) : ""
  )
  const [frecHoras, setFrecHoras] = useState(
    tarea?.frecuencia_horas != null ? String(tarea.frecuencia_horas) : ""
  )
  const [activo, setActivo] = useState(tarea?.activo ?? true)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!nombre.trim()) {
      toast.error("Ingresá el nombre de la tarea")
      return
    }
    const km = parseNum(frecKm)
    const meses = parseNum(frecMeses)
    const horas = parseNum(frecHoras)
    if (km == null && meses == null && horas == null) {
      toast.error("Definí al menos una frecuencia (km, meses u horas)")
      return
    }
    setSaving(true)
    const res = tarea
      ? await updatePlanTarea(tarea.id, {
          nombre,
          categoria,
          frecuencia_km: km,
          frecuencia_meses: meses,
          frecuencia_horas: horas,
          activo,
        })
      : await createPlanTarea({
          codigo: nombre,
          nombre,
          categoria,
          tipo_vehiculo: tipoVeh,
          frecuencia_km: km,
          frecuencia_meses: meses,
          frecuencia_horas: horas,
          orden: 500,
        })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(tarea ? "Tarea actualizada" : "Tarea creada")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tarea ? "Editar tarea del plan" : "Nueva tarea del plan"}</DialogTitle>
          <DialogDescription>
            La frecuencia que ocurra primero define el vencimiento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoría</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as MantenimientoCategoria)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(MANTENIMIENTO_CATEGORIA_LABELS) as MantenimientoCategoria[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {MANTENIMIENTO_CATEGORIA_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de unidad</Label>
              <Select
                value={tipoVeh}
                onValueChange={(v) => setTipoVeh(v as VehiculoTipo)}
                disabled={!!tarea}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_VEHICULO_LABELS) as VehiculoTipo[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TIPO_VEHICULO_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Cada (km)</Label>
              <Input type="number" value={frecKm} onChange={(e) => setFrecKm(e.target.value)} />
            </div>
            <div>
              <Label>Cada (meses)</Label>
              <Input
                type="number"
                value={frecMeses}
                onChange={(e) => setFrecMeses(e.target.value)}
              />
            </div>
            <div>
              <Label>Cada (horas)</Label>
              <Input
                type="number"
                value={frecHoras}
                onChange={(e) => setFrecHoras(e.target.value)}
              />
            </div>
          </div>
          {tarea && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={activo} onCheckedChange={(c) => setActivo(c === true)} />
              Tarea activa en el plan
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Dialog: excepción por unidad ====================

function OverrideDialog({
  estados,
  tareas,
  onClose,
  onSaved,
}: {
  estados: EstadoPlanVehiculo[]
  tareas: MantenimientoPlanTarea[]
  onClose: () => void
  onSaved: () => void
}) {
  const [dominio, setDominio] = useState("")
  const [tareaId, setTareaId] = useState("")
  const [frecKm, setFrecKm] = useState("")
  const [frecMeses, setFrecMeses] = useState("")
  const [frecHoras, setFrecHoras] = useState("")
  const [noAplica, setNoAplica] = useState(false)
  const [saving, setSaving] = useState(false)

  const vehiculoSel = estados.find((e) => e.vehiculo.dominio === dominio)
  const tareasDelTipo = tareas.filter(
    (t) => t.activo && t.tipo_vehiculo === (vehiculoSel?.vehiculo.tipo ?? "camion")
  )

  const submit = async () => {
    if (!dominio || !tareaId) {
      toast.error("Elegí la unidad y la tarea")
      return
    }
    setSaving(true)
    const res = await upsertPlanOverride({
      dominio,
      tareaId,
      frecuencia_km: parseNum(frecKm),
      frecuencia_meses: parseNum(frecMeses),
      frecuencia_horas: parseNum(frecHoras),
      activo: !noAplica,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Excepción guardada")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excepción por unidad</DialogTitle>
          <DialogDescription>
            Ajustá la frecuencia de una tarea para una unidad puntual, o marcala como “no
            aplica”. Los campos vacíos heredan de la plantilla.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unidad</Label>
              <Select
                value={dominio}
                onValueChange={(d: string | null) => {
                  setDominio(d ?? "")
                  setTareaId("")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Dominio" />
                </SelectTrigger>
                <SelectContent>
                  {estados.map((e) => (
                    <SelectItem key={e.vehiculo.dominio} value={e.vehiculo.dominio}>
                      {e.vehiculo.dominio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tarea</Label>
              <Select
                value={tareaId}
                onValueChange={(v: string | null) => setTareaId(v ?? "")}
                disabled={!dominio}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tarea del plan" />
                </SelectTrigger>
                <SelectContent>
                  {tareasDelTipo.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Cada (km)</Label>
              <Input
                type="number"
                value={frecKm}
                onChange={(e) => setFrecKm(e.target.value)}
                disabled={noAplica}
              />
            </div>
            <div>
              <Label>Cada (meses)</Label>
              <Input
                type="number"
                value={frecMeses}
                onChange={(e) => setFrecMeses(e.target.value)}
                disabled={noAplica}
              />
            </div>
            <div>
              <Label>Cada (horas)</Label>
              <Input
                type="number"
                value={frecHoras}
                onChange={(e) => setFrecHoras(e.target.value)}
                disabled={noAplica}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={noAplica} onCheckedChange={(c) => setNoAplica(c === true)} />
            La tarea no aplica a esta unidad
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
