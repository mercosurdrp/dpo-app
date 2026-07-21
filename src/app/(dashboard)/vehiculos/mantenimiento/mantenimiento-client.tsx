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
  AlertTriangle,
  Ban,
  CalendarClock,
  CircleDollarSign,
  Cloud,
  FileDown,
  FileSpreadsheet,
  History,
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
  MantenimientoRealizadoRepuesto,
  MantenimientoTipo,
  VehiculoTipo,
} from "@/types/database"
import { montoFactura } from "@/lib/vehiculos/costo-ot"
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
import { GestionMtto } from "./gestion-mtto"
import { HerramientasTab } from "./herramientas-tab"
import type { Herramienta } from "@/actions/mantenimiento-herramientas"
import { IndicadoresFlota } from "./indicadores-flota"
import { EstandaresFlota } from "./estandares-flota"
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
import type { Neumatico, Alineacion, Rotacion } from "@/lib/vehiculos/neumaticos-tipos"
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

// Fecha + hora legible (para entrada/salida del taller).
function fmtFechaHora(f: string | null): string {
  if (!f) return "—"
  const d = new Date(f)
  if (isNaN(d.getTime())) return fmtFecha(f)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
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
  herramientas: Herramienta[]
  rotacionKm: number
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
  siguienteNumeroOt,
  costos,
  tablero,
  checklists,
  neumaticos,
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
  herramientas,
  rotacionKm,
  puedeEditar,
  esAdmin,
}: MantenimientoClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [tab, setTab] = useState("tablero")
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

  // Meses con órdenes registradas (para el selector), más reciente primero.
  const mesesDisponibles = useMemo(
    () =>
      Array.from(new Set(mantenimientos.map((m) => m.fecha.slice(0, 7))))
        .sort((a, b) => b.localeCompare(a)),
    [mantenimientos]
  )

  const mantenimientosFiltrados = useMemo(() => {
    const q = fBusqueda.trim().toLowerCase()
    return mantenimientos.filter(
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
  }, [mantenimientos, fDominio, fTipo, fEstado, fMes, fBusqueda])

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
    if (dominio && destino === "historial") setFDominio(dominio)
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
              sub="Adherencia al plan preventivo"
            />
            <KpiCard
              label="Próximas a vencer"
              valor={kpis.proximas}
              estado={kpis.proximas > 0 ? "alerta" : "ok"}
              dpo="2.2"
              sub="Se programan antes del vencimiento"
            />
            <KpiCard
              label="Costo del mes"
              valor={fmtMoney(costos.costoMes)}
              dpo="3.2"
              sub="Gasto de flota imputado en el mes"
            />
          </div>

          <TableroOperativo
            programacion={tablero.programacion}
            documentos={tablero.documentos}
            otPendientes={otPendientes}
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
            alineaciones={alineaciones}
            kmFlota={kmFlota}
            rotaciones={rotaciones}
            unidades={unidades}
            rotacionKm={rotacionKm}
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

        {/* ============ TAB: Programación de OT (semana) ============ */}
        <TabsContent value="programacion" className="space-y-6">
          <ProgramacionOt estados={estados} tareas={tareas} puedeEditar={puedeEditar} />
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
            proveedores={proveedores}
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
                (km, meses u horas).
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

            {(["camion", "camioneta", "autoelevador", "utilitario"] as VehiculoTipo[])
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
      {nuevoOpen && (
        <NuevoMantenimientoDialog
          estados={estados}
          tareasPorTipo={tareasPorTipo}
          ultimasLecturas={ultimasLecturas}
          historialLecturas={historialLecturas}
          siguienteNumeroOt={siguienteNumeroOt}
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

// Días entre dos fechas ISO (YYYY-MM-DD), positivo si b es posterior a a.
function diffDiasISO(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime()
  const db = new Date(b + "T12:00:00").getTime()
  return Math.round((db - da) / 86_400_000)
}

// Historial de lecturas del último mes de la unidad (una fila por día), como
// referencia al cargar una OT con fecha retroactiva. Al elegir un día completa
// el odómetro/horómetro Y la fecha de la OT con ese día. Muestra la variación
// de km/hs y de días respecto de la lectura anterior.
function HistorialLecturasMes({
  open,
  onToggle,
  historial,
  unidad,
  onElegir,
}: {
  open: boolean
  onToggle: () => void
  historial: LecturaSugerida[]
  unidad: "km" | "hs"
  onElegir: (valor: string, fecha: string) => void
}) {
  if (historial.length === 0) return null
  const suf = unidad === "hs" ? "hs" : "km"
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700"
      >
        <History className="size-3" />
        {open ? "Ocultar historial del mes" : `Ver historial del mes (${historial.length})`}
      </button>
      {open && (
        <div className="mt-1 overflow-hidden rounded-md border border-border">
          <p className="border-b border-border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
            Elegí el día de la factura: completa fecha y {suf} de la OT.
          </p>
          <div className="max-h-52 overflow-y-auto divide-y divide-border">
            {historial.map((s, i) => {
              const prev = historial[i + 1] // lectura anterior (más vieja)
              const dKm = prev ? s.odometro - prev.odometro : null
              const dDias = prev ? diffDiasISO(prev.fecha, s.fecha) : null
              return (
                <button
                  key={`${s.fecha}-${s.odometro}-${i}`}
                  type="button"
                  onClick={() => onElegir(String(s.odometro), s.fecha)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50"
                >
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                    {fmtFecha(s.fecha)}
                  </span>
                  <span className="flex-1 text-right font-medium tabular-nums text-foreground">
                    {fmtNum(s.odometro)} {suf}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                    {dKm != null && dDias != null
                      ? `${dKm >= 0 ? "+" : ""}${fmtNum(dKm)} ${suf} · ${dDias}d`
                      : ""}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Dialog: nuevo mantenimiento ====================

function NuevoMantenimientoDialog({
  estados,
  tareasPorTipo,
  ultimasLecturas,
  historialLecturas,
  siguienteNumeroOt,
  prefill,
  onClose,
  onSaved,
}: {
  estados: EstadoPlanVehiculo[]
  tareasPorTipo: Map<VehiculoTipo, MantenimientoPlanTarea[]>
  ultimasLecturas: Record<string, LecturaSugerida[]>
  historialLecturas: Record<string, LecturaSugerida[]>
  siguienteNumeroOt: string
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
  // Entrada/salida del taller (fecha + hora). De acá se deriva el período fuera
  // de servicio: por defecto la OT nueva marca la unidad NO disponible desde el
  // ingreso. Si no la saca de ruta, vaciá "Entrada al taller".
  const [entradaTaller, setEntradaTaller] = useState(ahoraLocal())
  const [salidaTaller, setSalidaTaller] = useState("")
  const [tareasSel, setTareasSel] = useState<Set<string>>(
    () => new Set(prefill.tareaId ? [prefill.tareaId] : [])
  )
  const [libres, setLibres] = useState<string[]>([])
  const [libreInput, setLibreInput] = useState("")
  const [facturasRep, setFacturasRep] = useState<FacturaForm[]>(() => [nuevaFactura()])
  const [costoMO, setCostoMO] = useState("")
  const [facturas, setFacturas] = useState<File[]>([])
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

  const onDominioChange = (d: string) => {
    setDominio(d)
    const e = estados.find((x) => x.vehiculo.dominio === d)
    setOdometro(e?.kmActual != null ? String(e.kmActual) : "")
    setTareasSel(new Set(prefill.tareaId ? [prefill.tareaId] : []))
  }

  const toggleTarea = (id: string) => {
    setTareasSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
    const evidencia = await subirFacturas(dominio, facturas)
    if (evidencia === null) {
      setSaving(false)
      return
    }
    const rep = await facturasPayload(dominio, facturasRep)
    if (rep === null) {
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
      costo: totalOt(facturasRep, costoMO),
      numero_factura: factura,
      numero_ot: numeroOt,
      observaciones: obs,
      es_service_general: esServiceGeneral,
      costo_mano_obra: parseNum(costoMO),
      repuestos: rep.repuestos,
      facturas: rep.facturas,
      evidencia_urls: evidencia.length > 0 ? evidencia : null,
      entrada_taller: entradaTaller || null,
      salida_taller: salidaTaller || null,
      tareas,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Mantenimiento registrado")
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
              <Input value={taller} onChange={(e) => setTaller(e.target.value)} />
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
            <FacturasRepuestosEditor facturas={facturasRep} setFacturas={setFacturasRep} />
            <TotalOtLinea facturas={facturasRep} costoManoObra={costoMO} />
          </div>

          <FacturasInput facturas={facturas} setFacturas={setFacturas} />

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

          {/* Detalle de tareas (opcional): para registrar un service del plan. */}
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              Detalle de tareas del plan (opcional)
            </summary>
            <div className="mt-3 space-y-3">
              {dominio && (
                <div>
                  <Label>Tareas del plan realizadas</Label>
                  <div className="mt-1.5 grid max-h-48 gap-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
                    {tareasDisponibles.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={tareasSel.has(t.id)}
                          onCheckedChange={() => toggleTarea(t.id)}
                        />
                        <span className="leading-tight">{t.nombre}</span>
                      </label>
                    ))}
                    {tareasDisponibles.length === 0 && (
                      <p className="text-xs text-muted-foreground/70">
                        No hay tareas de plan para este tipo de unidad.
                      </p>
                    )}
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

// ==================== Campos reutilizables de la OT ====================

// Campo para adjuntar la foto de la factura / comprobantes (imágenes o PDF).
function FacturasInput({
  facturas,
  setFacturas,
}: {
  facturas: File[]
  setFacturas: (f: File[]) => void
}) {
  return (
    <div>
      <Label>Foto de la factura / comprobante</Label>
      <Input
        type="file"
        accept={ACCEPT_FACTURA}
        multiple
        onChange={(e) => {
          const nuevos = Array.from(e.target.files ?? [])
          if (nuevos.length) setFacturas([...facturas, ...nuevos])
          e.target.value = ""
        }}
      />
      {facturas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {facturas.map((f, i) => (
            <Badge key={i} variant="outline" className="gap-1">
              <Paperclip className="size-3" />
              {f.name.length > 24 ? f.name.slice(0, 22) + "…" : f.name}
              <button onClick={() => setFacturas(facturas.filter((_, j) => j !== i))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// Líneas de repuesto en la vista de detalle (solo lectura).
function LineasRepuestoDetalle({ lineas }: { lineas: MantenimientoRealizadoRepuesto[] }) {
  if (lineas.length === 0) return null
  return (
    <ul className="space-y-1">
      {lineas.map((r) => {
        const sub =
          r.costo_unitario != null ? Number(r.costo_unitario) * Number(r.cantidad) : null
        return (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5"
          >
            <span className="text-foreground">
              {r.descripcion}
              {Number(r.cantidad) !== 1 && (
                <span className="text-muted-foreground/70"> ×{fmtNum(Number(r.cantidad))}</span>
              )}
            </span>
            {sub != null && (
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {fmtMoney(sub)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
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

/**
 * Una factura de repuestos del formulario: proveedor + comprobante + sus líneas.
 * Todos los datos de cabecera son opcionales. Si `montoTotal` está cargado, ése
 * es el monto de la factura y las líneas quedan como detalle.
 *
 * `adjuntoUrl` es un comprobante ya subido (al editar); `adjuntoFile` es uno
 * nuevo elegido en esta edición, que se sube recién al guardar.
 */
interface FacturaForm {
  proveedor: string
  numero: string
  montoTotal: string
  adjuntoUrl: string | null
  adjuntoFile: File | null
  repuestos: RepuestoForm[]
}

function nuevaFactura(): FacturaForm {
  return {
    proveedor: "",
    numero: "",
    montoTotal: "",
    adjuntoUrl: null,
    adjuntoFile: null,
    repuestos: [nuevoRepuesto()],
  }
}

/** true si la factura no tiene ningún dato de cabecera cargado. */
function facturaSinCabecera(f: FacturaForm): boolean {
  return !f.proveedor.trim() && !f.numero.trim() && !f.montoTotal.trim() && !f.adjuntoUrl && !f.adjuntoFile
}

/** Monto de una factura: el total cargado a mano, o la suma de sus líneas. */
function montoFacturaForm(f: FacturaForm): number {
  const total = parseFloat(f.montoTotal)
  if (f.montoTotal.trim() && Number.isFinite(total)) return total
  return subtotalRepuestos(f.repuestos)
}

/** Σ de todas las facturas cargadas. */
function totalFacturas(fs: FacturaForm[]): number {
  return fs.reduce((a, f) => a + montoFacturaForm(f), 0)
}

/**
 * Reconstruye las facturas del formulario desde la OT guardada. Los repuestos
 * sin factura (los de la carga anterior) van a una primera factura sin cabecera,
 * que al guardar vuelve a salir como repuestos sueltos.
 */
function facturasDesde(m: MantenimientoRealizado): FacturaForm[] {
  const linea = (r: MantenimientoRealizadoRepuesto): RepuestoForm => ({
    descripcion: r.descripcion,
    cantidad: r.cantidad != null ? String(r.cantidad) : "1",
    costoUnitario: r.costo_unitario != null ? String(r.costo_unitario) : "",
  })
  const todos = m.repuestos ?? []
  const out: FacturaForm[] = []

  const sueltos = todos.filter((r) => !r.factura_id)
  if (sueltos.length > 0) {
    out.push({ ...nuevaFactura(), repuestos: sueltos.map(linea) })
  }
  for (const f of [...(m.facturas ?? [])].sort((a, b) => a.orden - b.orden)) {
    const lineas = todos.filter((r) => r.factura_id === f.id).map(linea)
    out.push({
      proveedor: f.proveedor ?? "",
      numero: f.numero ?? "",
      montoTotal: f.monto_total != null ? String(f.monto_total) : "",
      adjuntoUrl: f.adjunto_url,
      adjuntoFile: null,
      repuestos: lineas.length > 0 ? lineas : [nuevoRepuesto()],
    })
  }
  return out
}

/**
 * Arma el payload de las actions. Sube los comprobantes nuevos y separa las
 * facturas de verdad de los repuestos sueltos (grupo sin cabecera), para no
 * crear filas de factura vacías.
 *
 * Devuelve null si falló la subida de algún adjunto (el error ya se avisó).
 */
async function facturasPayload(
  dominio: string,
  fs: FacturaForm[]
): Promise<{
  facturas: Array<{
    proveedor: string
    numero: string
    montoTotal: number | null
    adjuntoUrl: string | null
    repuestos: ReturnType<typeof repuestosPayload>
  }>
  repuestos: ReturnType<typeof repuestosPayload>
} | null> {
  const facturas: Array<{
    proveedor: string
    numero: string
    montoTotal: number | null
    adjuntoUrl: string | null
    repuestos: ReturnType<typeof repuestosPayload>
  }> = []
  let sueltos: ReturnType<typeof repuestosPayload> = []

  for (const f of fs) {
    const lineas = repuestosPayload(f.repuestos)
    if (facturaSinCabecera(f)) {
      sueltos = [...sueltos, ...lineas]
      continue
    }
    let url = f.adjuntoUrl
    if (f.adjuntoFile) {
      const subidas = await subirFacturas(dominio, [f.adjuntoFile])
      if (subidas === null) return null
      url = subidas[0] ?? url
    }
    facturas.push({
      proveedor: f.proveedor.trim(),
      numero: f.numero.trim(),
      montoTotal: f.montoTotal.trim() ? parseFloat(f.montoTotal) : null,
      adjuntoUrl: url,
      repuestos: lineas,
    })
  }
  return { facturas, repuestos: sueltos }
}

// Subtotal de repuestos = Σ (cantidad × costo unitario) de las filas con datos.
function subtotalRepuestos(reps: RepuestoForm[]): number {
  return reps.reduce((a, r) => {
    const cant = parseFloat(r.cantidad) || 0
    const cu = parseFloat(r.costoUnitario) || 0
    return a + cant * cu
  }, 0)
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

// Líneas de repuesto de una factura (descripción + cantidad + costo unitario).
function LineasRepuesto({
  repuestos,
  setRepuestos,
  atenuado,
}: {
  repuestos: RepuestoForm[]
  setRepuestos: (r: RepuestoForm[]) => void
  atenuado: boolean
}) {
  const update = (i: number, patch: Partial<RepuestoForm>) =>
    setRepuestos(repuestos.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => setRepuestos(repuestos.filter((_, j) => j !== i))
  return (
    <div>
      {repuestos.length > 0 && (
        <div className="space-y-2">
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
                className={cn("w-24", atenuado && "opacity-60")}
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
    </div>
  )
}

/**
 * Editor de repuestos agrupados por factura. Los repuestos suelen comprarse
 * aparte del mecánico que hace la mano de obra, así que cada factura lleva su
 * propio proveedor, número y comprobante, y se pueden cargar varias.
 */
function FacturasRepuestosEditor({
  facturas,
  setFacturas,
}: {
  facturas: FacturaForm[]
  setFacturas: (f: FacturaForm[]) => void
}) {
  const update = (i: number, patch: Partial<FacturaForm>) =>
    setFacturas(facturas.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const remove = (i: number) => setFacturas(facturas.filter((_, j) => j !== i))

  return (
    <div>
      <Label>Repuestos</Label>
      <p className="mb-1.5 text-xs text-muted-foreground">
        Los repuestos comprados aparte, con su propio proveedor y factura. Podés cargar
        más de una si los compraste en distintos lados.
      </p>

      <div className="space-y-3">
        {facturas.map((f, i) => {
          const detalle = subtotalRepuestos(f.repuestos)
          const total = parseFloat(f.montoTotal)
          const tieneTotal = f.montoTotal.trim() !== "" && Number.isFinite(total)
          // Aviso (no bloqueante) si el monto cargado no coincide con el detalle.
          const discrepa = tieneTotal && detalle > 0 && Math.abs(total - detalle) >= 0.5
          return (
            <div key={i} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {facturas.length > 1 ? `Factura ${i + 1}` : "Factura"}
                </p>
                {facturas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-xs text-muted-foreground/70 hover:text-red-500"
                  >
                    Quitar factura
                  </button>
                )}
              </div>

              <div className="mb-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs font-normal text-muted-foreground">
                    Proveedor
                  </Label>
                  <Input
                    value={f.proveedor}
                    onChange={(e) => update(i, { proveedor: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <Label className="text-xs font-normal text-muted-foreground">
                    N° factura
                  </Label>
                  <Input
                    value={f.numero}
                    onChange={(e) => update(i, { numero: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <Label className="text-xs font-normal text-muted-foreground">
                    Monto total
                  </Label>
                  <Input
                    type="number"
                    value={f.montoTotal}
                    onChange={(e) => update(i, { montoTotal: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <AdjuntoFactura
                url={f.adjuntoUrl}
                file={f.adjuntoFile}
                onFile={(file) => update(i, { adjuntoFile: file })}
                onQuitar={() => update(i, { adjuntoUrl: null, adjuntoFile: null })}
              />

              <div className="mt-2.5">
                <LineasRepuesto
                  repuestos={f.repuestos}
                  setRepuestos={(r) => update(i, { repuestos: r })}
                  atenuado={tieneTotal}
                />
              </div>

              {tieneTotal ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cuenta el monto total: <span className="tabular-nums">{fmtMoney(total)}</span>
                  {detalle > 0 && <> · el detalle queda como referencia</>}
                </p>
              ) : (
                detalle > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Subtotal: <span className="tabular-nums">{fmtMoney(detalle)}</span>
                  </p>
                )
              )}
              {discrepa && (
                <p className="mt-1 text-xs text-amber-600">
                  El detalle suma {fmtMoney(detalle)} y no coincide con el monto total.
                  Se guarda el monto total igual.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => setFacturas([...facturas, nuevaFactura()])}
      >
        <Plus className="mr-1 size-4" /> Agregar otra factura de repuestos
      </Button>
    </div>
  )
}

// Comprobante (foto o PDF) de una factura de repuestos.
function AdjuntoFactura({
  url,
  file,
  onFile,
  onQuitar,
}: {
  url: string | null
  file: File | null
  onFile: (f: File | null) => void
  onQuitar: () => void
}) {
  if (file || url) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs">
        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
        {file ? (
          <span className="truncate text-foreground">{file.name}</span>
        ) : (
          <a
            href={url!}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sky-600 hover:underline"
          >
            {nombreArchivoDeUrl(url!)}
          </a>
        )}
        <button
          type="button"
          onClick={onQuitar}
          className="ml-auto shrink-0 text-muted-foreground/70 hover:text-red-500"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }
  return (
    <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-sky-600 hover:underline">
      <Paperclip className="size-3.5" />
      Adjuntar comprobante (foto o PDF)
      <input
        type="file"
        accept={ACCEPT_FACTURA}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}

// Total de la OT = mano de obra + repuestos, cada suma por su lado y el total al pie.
function TotalOtLinea({
  facturas,
  costoManoObra,
}: {
  facturas: FacturaForm[]
  costoManoObra: string
}) {
  const mo = parseFloat(costoManoObra) || 0
  const rep = totalFacturas(facturas)
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
function totalOt(facturas: FacturaForm[], costoManoObra: string): number | null {
  const mo = parseFloat(costoManoObra) || 0
  const total = mo + totalFacturas(facturas)
  return total > 0 ? total : null
}

// ==================== Dialog: ver orden de trabajo ====================

function DetalleOrdenDialog({
  mantenimiento: m,
  tareasById,
  puedeEditar,
  onClose,
  onEditar,
}: {
  mantenimiento: MantenimientoRealizado
  tareasById: Map<string, MantenimientoPlanTarea>
  puedeEditar: boolean
  onClose: () => void
  onEditar: () => void
}) {
  const tareas = m.tareas || []
  const fueraServicio = !!m.fuera_servicio_desde
  const facturas = m.evidencia_urls ?? []

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Wrench className="size-4 text-muted-foreground/70" />
            Orden de trabajo · {m.dominio}
          </DialogTitle>
          <DialogDescription>
            {fmtFecha(m.fecha)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Estado / tipo */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={TIPO_MANT_BADGE[m.tipo]}>
              {TIPO_MANT_LABEL[m.tipo]}
            </Badge>
            <Badge variant="outline" className={ESTADO_MANT_BADGE[m.estado]}>
              {MANTENIMIENTO_ESTADO_LABELS[m.estado]}
            </Badge>
            {m.es_service_general && (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <Wrench className="size-3" /> Service general
              </Badge>
            )}
            {m.origen === "cloudfleet" && (
              <Badge
                variant="outline"
                className="gap-1 border-sky-200 bg-sky-50 text-sky-700"
              >
                <Cloud className="size-3" /> Cloudfleet
              </Badge>
            )}
            {fueraServicio ? (
              <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
                <Ban className="size-3" /> No disponible
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <Truck className="size-3" /> Disponible
              </Badge>
            )}
          </div>

          {/* Datos */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Dominio</dt>
              <dd className="font-medium text-foreground">{m.dominio}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Fecha</dt>
              <dd className="text-foreground">{fmtFecha(m.fecha)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Km / Horas</dt>
              <dd className="tabular-nums text-foreground">
                {m.odometro != null
                  ? `${fmtNum(m.odometro)} km`
                  : m.horometro != null
                    ? `${fmtNum(Number(m.horometro))} hs`
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Taller</dt>
              <dd className="text-foreground">{m.taller || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Costo total (mano de obra + repuestos)
              </dt>
              <dd className="tabular-nums text-foreground">
                {m.costo != null ? fmtMoney(Number(m.costo)) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">N° de factura</dt>
              <dd className="text-foreground">{m.numero_factura || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">N° de OT</dt>
              <dd className="text-foreground">{m.numero_ot || "—"}</dd>
            </div>
            {m.entrada_taller ? (
              <div className="col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Taller (entrada / salida)</dt>
                <dd className="text-foreground">
                  {fmtFechaHora(m.entrada_taller)}
                  {m.salida_taller ? ` → ${fmtFechaHora(m.salida_taller)}` : " → en el taller"}
                </dd>
              </div>
            ) : (
              fueraServicio && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">Fuera de servicio</dt>
                  <dd className="text-foreground">
                    {fmtFecha(m.fuera_servicio_desde)}
                    {m.fuera_servicio_hasta
                      ? ` → ${fmtFecha(m.fuera_servicio_hasta)}`
                      : " → sigue"}
                  </dd>
                </div>
              )
            )}
          </dl>

          {/* Trabajo realizado: tareas cargadas y/o el detalle escrito en observaciones */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Trabajo realizado en la unidad
            </p>
            {tareas.length === 0 && !m.observaciones ? (
              <p className="text-muted-foreground/70">Sin detalle del trabajo cargado.</p>
            ) : (
              <div className="space-y-2">
                {tareas.length > 0 && (
                  <ul className="space-y-1">
                    {tareas.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5"
                      >
                        <span className="text-foreground">
                          {t.tarea_id
                            ? tareasById.get(t.tarea_id)?.nombre ?? "Tarea"
                            : t.descripcion || "Tarea"}
                        </span>
                        {t.costo != null && (
                          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                            {fmtMoney(Number(t.costo))}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {m.observaciones && (
                  <p className="whitespace-pre-wrap rounded-md border bg-muted/50 px-2.5 py-1.5 text-foreground">
                    {m.observaciones}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Repuestos, agrupados por factura (los sueltos van sin encabezado) */}
          {(m.repuestos?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Repuestos</p>
              <div className="space-y-2">
                <LineasRepuestoDetalle lineas={(m.repuestos ?? []).filter((r) => !r.factura_id)} />
                {[...(m.facturas ?? [])]
                  .sort((a, b) => a.orden - b.orden)
                  .map((f) => {
                    const lineas = (m.repuestos ?? []).filter((r) => r.factura_id === f.id)
                    const monto = montoFactura(f, m.repuestos ?? [])
                    return (
                      <div key={f.id} className="rounded-md border">
                        <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-2.5 py-1.5 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {f.adjunto_url && (
                              <a
                                href={f.adjunto_url}
                                target="_blank"
                                rel="noreferrer"
                                title="Ver comprobante"
                                className="shrink-0 text-sky-600 hover:text-sky-700"
                              >
                                <Paperclip className="size-3.5" />
                              </a>
                            )}
                            <span className="truncate text-foreground">
                              {f.proveedor || "Proveedor sin especificar"}
                            </span>
                            {f.numero && (
                              <span className="shrink-0 text-muted-foreground/70">
                                · fact. {f.numero}
                              </span>
                            )}
                          </span>
                          {monto > 0 && (
                            <span className="shrink-0 tabular-nums font-medium text-foreground">
                              {fmtMoney(monto)}
                            </span>
                          )}
                        </div>
                        <div className="p-1.5">
                          <LineasRepuestoDetalle lineas={lineas} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Mano de obra */}
          {(m.horas_mano_obra != null || m.costo_mano_obra != null) && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Mano de obra</p>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5">
                <span className="text-foreground">
                  {m.horas_mano_obra != null ? `${fmtNum(Number(m.horas_mano_obra))} hs` : "—"}
                </span>
                {m.costo_mano_obra != null && (
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {fmtMoney(Number(m.costo_mano_obra))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Facturas / adjuntos */}
          {facturas.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Adjuntos</p>
              <div className="flex flex-wrap gap-2">
                {facturas.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-sky-600 hover:bg-sky-50"
                  >
                    <Paperclip className="size-3" />
                    {nombreArchivoDeUrl(url)}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            title="Descargar esta orden de trabajo en Excel"
            render={<a href={`/api/vehiculos/ordenes/${m.id}/export`} download />}
          >
            <FileSpreadsheet className="mr-1 size-4 text-emerald-600" /> Excel
          </Button>
          <Button
            variant="outline"
            title="Descargar esta orden de trabajo en PDF"
            render={
              <a
                href={`/api/vehiculos/ordenes/${m.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <FileDown className="mr-1 size-4 text-red-600" /> PDF
          </Button>
          {puedeEditar && (
            <Button variant="outline" onClick={onEditar}>
              <Pencil className="mr-1 size-3.5" /> Editar
            </Button>
          )}
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Dialog: editar mantenimiento ====================

function EditarMantenimientoDialog({
  mantenimiento,
  onClose,
  onSaved,
}: {
  mantenimiento: MantenimientoRealizado
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
  // Entrada/salida del taller (prellenadas desde la OT o, en OT viejas, desde el
  // período fuera de servicio que se haya cargado).
  const [entradaTaller, setEntradaTaller] = useState(
    aDatetimeLocal(m.entrada_taller ?? m.fuera_servicio_desde)
  )
  const [salidaTaller, setSalidaTaller] = useState(
    aDatetimeLocal(m.salida_taller ?? m.fuera_servicio_hasta)
  )
  const [urlsExistentes, setUrlsExistentes] = useState<string[]>(m.evidencia_urls ?? [])
  const [facturasNuevas, setFacturasNuevas] = useState<File[]>([])
  const [facturasRep, setFacturasRep] = useState<FacturaForm[]>(() => {
    const fs = facturasDesde(m)
    return fs.length > 0 ? fs : [nuevaFactura()]
  })
  const [costoMO, setCostoMO] = useState(() => {
    if (m.costo_mano_obra != null) return String(m.costo_mano_obra)
    // OT vieja sin desglose: la mano de obra hereda el costo total menos los repuestos.
    if (m.costo != null) {
      const mo = Number(m.costo) - totalFacturas(facturasDesde(m))
      return mo > 0 ? String(mo) : ""
    }
    return ""
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const nuevas = await subirFacturas(m.dominio, facturasNuevas)
    if (nuevas === null) {
      setSaving(false)
      return
    }
    const evidencia = [...urlsExistentes, ...nuevas]
    const rep = await facturasPayload(m.dominio, facturasRep)
    if (rep === null) {
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
      costo: totalOt(facturasRep, costoMO),
      numero_factura: factura,
      numero_ot: numeroOt,
      observaciones: obs,
      es_service_general: esServiceGeneral,
      costo_mano_obra: parseNum(costoMO),
      repuestos: rep.repuestos,
      facturas: rep.facturas,
      evidencia_urls: evidencia,
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
            <Input value={taller} onChange={(e) => setTaller(e.target.value)} />
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
            <FacturasRepuestosEditor facturas={facturasRep} setFacturas={setFacturasRep} />
            <TotalOtLinea facturas={facturasRep} costoManoObra={costoMO} />
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
            <FacturasInput facturas={facturasNuevas} setFacturas={setFacturasNuevas} />
          </div>
          {urlsExistentes.length > 0 && (
            <div className="col-span-2">
              <Label>Facturas ya adjuntas</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {urlsExistentes.map((url, i) => (
                  <Badge key={url} variant="outline" className="gap-1">
                    <Paperclip className="size-3" />
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {nombreArchivoDeUrl(url)}
                    </a>
                    <button onClick={() => setUrlsExistentes(urlsExistentes.filter((_, j) => j !== i))}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
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
