"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
import {
  createMantenimiento,
  createPlanTarea,
  deleteMantenimiento,
  deletePlanOverride,
  setOrdenFueraServicio,
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
  MantenimientoTipo,
  VehiculoTipo,
} from "@/types/database"
import {
  MANTENIMIENTO_CATEGORIA_LABELS,
  MANTENIMIENTO_ESTADO_LABELS,
} from "@/types/database"
import { TableroOperativo, type OTPendiente } from "./tablero-operativo"
import { ChecklistsMtto } from "./checklists-mtto"
import { NeumaticosModule } from "./neumaticos-module"
import { SeguimientoFlota } from "./seguimiento-flota"
import { PiramideDefectos } from "./piramide-defectos"
import { GastosTab } from "./gastos-tab"
import type {
  DocumentoVencimiento,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type {
  ChecklistComentario,
  ChecklistItemNoOk,
  TableroResumen,
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
  cancelado: "bg-slate-100 text-slate-500",
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

function parseNum(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s.replace(",", "."))
  return isNaN(n) ? null : n
}

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
        <span className="text-[11px] text-slate-400">
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
  mantenimientos: MantenimientoRealizado[]
  siguienteNumeroOt: string
  costos: CostosMantenimiento
  tablero: {
    programacion: ServiceGeneralUnidad[]
    documentos: DocumentoVencimiento[]
    resumen: TableroResumen
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
  rotacionKm: number
  puedeEditar: boolean
  esAdmin: boolean
}

export function MantenimientoClient({
  estados,
  tareas,
  overrides,
  ultimasLecturas,
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
    () => mantenimientosFiltrados.reduce((a, m) => a + Number(m.costo || 0), 0),
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
  const neumaticosResumen = useMemo(() => {
    const ahora = new Date()
    const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`
    let stock = 0
    let instalados = 0
    let criticos = 0
    let bajasMes = 0
    for (const n of neumaticos) {
      if (n.estado === "stock") stock++
      else if (n.estado === "instalado") {
        instalados++
        if (n.profundidad_actual_mm != null && n.profundidad_actual_mm <= 3) criticos++
      } else if (n.estado === "baja" && n.fecha_baja?.slice(0, 7) === mes) bajasMes++
    }
    return { stock, instalados, criticos, bajasMes }
  }, [neumaticos])

  const unidades = useMemo(
    () =>
      estados.map((e) => ({
        dominio: e.vehiculo.dominio,
        tipo: e.vehiculo.tipo,
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
          <h1 className="text-2xl font-bold text-slate-900">Mantenimiento de camiones</h1>
          <p className="mt-1 text-sm text-slate-500">
            Plan preventivo de la flota controlado contra el km real de cada unidad.
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={() => abrirRegistro()}>
            <Plus className="mr-1 size-4" /> Nueva orden de trabajo
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tablero">Tablero operativo</TabsTrigger>
          <TabsTrigger value="checklists">Check lists</TabsTrigger>
          <TabsTrigger value="piramide">Pirámide de defectos</TabsTrigger>
          <TabsTrigger value="historial">Órdenes de Trabajo</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento de flota</TabsTrigger>
          <TabsTrigger value="neumaticos">Neumáticos</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          {puedeEditar && <TabsTrigger value="plantillas">Plan / Plantillas</TabsTrigger>}
        </TabsList>

        {/* ============ TAB: Tablero operativo ============ */}
        <TabsContent value="tablero" className="space-y-6">
          {/* KPIs (solo en el tablero operativo) */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <AlertTriangle className="size-4 text-red-500" /> Tareas vencidas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn("text-2xl font-bold", kpis.vencidas > 0 ? "text-red-600" : "text-slate-900")}>
                  {kpis.vencidas}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <CalendarClock className="size-4 text-amber-500" /> Próximas a vencer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-slate-900">{kpis.proximas}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <CircleDollarSign className="size-4 text-emerald-600" /> Costo del mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-slate-900">{fmtMoney(costos.costoMes)}</p>
              </CardContent>
            </Card>
          </div>

          <TableroOperativo
            programacion={tablero.programacion}
            otPendientes={otPendientes}
            neumaticos={neumaticosResumen}
            onNavigate={navegar}
          />
        </TabsContent>

        {/* ============ TAB: Check lists ============ */}
        <TabsContent value="checklists" className="space-y-6">
          <ChecklistsMtto
            itemsNoOk={checklists.itemsNoOk}
            comentarios={checklists.comentarios}
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


        {/* ============ TAB: Órdenes de Trabajo ============ */}
        <TabsContent value="historial" className="space-y-4">
          <p className="text-sm text-slate-500">
            Cada intervención de la flota (preventiva o correctiva). Una OT marcada como{" "}
            <span className="font-medium text-emerald-700">service general</span> reinicia el
            contador del próximo service en el tablero operativo.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-slate-500">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Dominio</Label>
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
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Tipo</Label>
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
              <Label className="text-xs text-slate-500">Estado</Label>
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
              <Label className="text-xs text-slate-500">Mes</Label>
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

            <div className="ml-auto rounded-lg border bg-slate-50 px-4 py-2 text-right">
              <p className="text-xs font-medium text-slate-500">
                Costo total ({mantenimientosFiltrados.length}{" "}
                {mantenimientosFiltrados.length === 1 ? "orden" : "órdenes"})
              </p>
              <p className="text-xl font-bold text-slate-900">{fmtMoney(costoFiltrado)}</p>
            </div>
          </div>

          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {mantenimientosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <Wrench className="size-8 text-slate-300" />
                  <p className="mt-3 text-sm text-slate-500">
                    Sin mantenimientos registrados todavía.
                  </p>
                  {puedeEditar && (
                    <p className="mt-1 text-xs text-slate-400">
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
                          i % 2 === 1 && "bg-slate-50/60"
                        )}
                      >
                        <TableCell>{fmtFecha(m.fecha)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums text-slate-600">
                          <span className="block">
                            {m.numero_ot ||
                              (m.cloudfleet_number != null ? `CF #${m.cloudfleet_number}` : "—")}
                          </span>
                          {m.numero_factura && (
                            <span className="block text-slate-400">Fc {m.numero_factura}</span>
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
                          <span className="line-clamp-2 text-xs text-slate-600">
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
                        <TableCell className="text-right tabular-nums text-slate-600">
                          {m.odometro != null
                            ? fmtNum(m.odometro)
                            : m.horometro != null
                              ? `${fmtNum(Number(m.horometro))} hs`
                              : "—"}
                        </TableCell>
                        <TableCell className="text-slate-600">{m.taller || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.costo != null ? fmtMoney(Number(m.costo)) : "—"}
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
              <p className="text-sm text-slate-500">
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
                              <TableCell className="text-slate-600">
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
                                      : "bg-slate-100 text-slate-500"
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
      <p className="text-[11px] text-slate-400">Últimas lecturas registradas:</p>
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
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              {fmtNum(s.odometro)}
              {unidad === "hs" && " hs"}
              <span className="ml-1 text-[10px] font-normal text-slate-400">
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
  ultimasLecturas,
  siguienteNumeroOt,
  prefill,
  onClose,
  onSaved,
}: {
  estados: EstadoPlanVehiculo[]
  tareasPorTipo: Map<VehiculoTipo, MantenimientoPlanTarea[]>
  ultimasLecturas: Record<string, LecturaSugerida[]>
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
  const [costo, setCosto] = useState("")
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
    const res = await createMantenimiento({
      dominio,
      fecha,
      tipo,
      estado,
      odometro: parseNum(odometro),
      horometro: parseNum(horometro),
      taller,
      costo: parseNum(costo),
      numero_factura: factura,
      numero_ot: numeroOt,
      observaciones: obs,
      es_service_general: esServiceGeneral,
      evidencia_urls: null,
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
                  placeholder="Horas de uso"
                />
                <SugerenciasLectura
                  sugerencias={sugerenciasHoras}
                  valor={horometro}
                  onElegir={setHorometro}
                  unidad="hs"
                />
              </div>
            ) : (
              <div>
                <Label>Odómetro (km)</Label>
                <Input
                  type="number"
                  value={odometro}
                  onChange={(e) => setOdometro(e.target.value)}
                  placeholder="Km al momento"
                />
                <SugerenciasLectura
                  sugerencias={sugerenciasKm}
                  valor={odometro}
                  onElegir={setOdometro}
                  unidad="km"
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
                placeholder="Orden de trabajo"
              />
              {siguienteNumeroOt && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Sugerido: {siguienteNumeroOt} (siguiente correlativo)
                </p>
              )}
            </div>
            <div>
              <Label>N° factura</Label>
              <Input value={factura} onChange={(e) => setFactura(e.target.value)} />
            </div>
            <div>
              <Label>Costo ($)</Label>
              <Input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-sm font-medium text-amber-800">Entrada y salida del taller</p>
            <p className="mb-2 text-xs text-amber-700">
              Mientras esté en el taller la unidad cuenta como <strong>fuera de servicio</strong>{" "}
              en la disponibilidad de flota. Cargá la salida cuando vuelva a ruta. Si la orden{" "}
              <strong>no</strong> la saca de circulación, vaciá la fecha de entrada.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Entrada al taller</Label>
                <Input
                  type="datetime-local"
                  value={entradaTaller}
                  onChange={(e) => setEntradaTaller(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Salida del taller</Label>
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
          <details className="rounded-md border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-600">
              Detalle de tareas del plan (opcional)
            </summary>
            <div className="mt-3 space-y-3">
              {dominio && (
                <div>
                  <Label>Tareas del plan realizadas</Label>
                  <div className="mt-1.5 grid max-h-48 gap-1.5 overflow-y-auto rounded-md border border-slate-200 p-3 sm:grid-cols-2">
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
                      <p className="text-xs text-slate-400">
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
            <Wrench className="size-4 text-slate-400" />
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
              <dt className="text-xs font-medium text-slate-500">Dominio</dt>
              <dd className="font-medium text-slate-900">{m.dominio}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Fecha</dt>
              <dd className="text-slate-900">{fmtFecha(m.fecha)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Km / Horas</dt>
              <dd className="tabular-nums text-slate-900">
                {m.odometro != null
                  ? `${fmtNum(m.odometro)} km`
                  : m.horometro != null
                    ? `${fmtNum(Number(m.horometro))} hs`
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Taller</dt>
              <dd className="text-slate-900">{m.taller || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Costo</dt>
              <dd className="tabular-nums text-slate-900">
                {m.costo != null ? fmtMoney(Number(m.costo)) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">N° de factura</dt>
              <dd className="text-slate-900">{m.numero_factura || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">N° de OT</dt>
              <dd className="text-slate-900">{m.numero_ot || "—"}</dd>
            </div>
            {m.entrada_taller ? (
              <div className="col-span-2">
                <dt className="text-xs font-medium text-slate-500">Taller (entrada / salida)</dt>
                <dd className="text-slate-900">
                  {fmtFechaHora(m.entrada_taller)}
                  {m.salida_taller ? ` → ${fmtFechaHora(m.salida_taller)}` : " → en el taller"}
                </dd>
              </div>
            ) : (
              fueraServicio && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-slate-500">Fuera de servicio</dt>
                  <dd className="text-slate-900">
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
            <p className="mb-1 text-xs font-medium text-slate-500">
              Trabajo realizado en la unidad
            </p>
            {tareas.length === 0 && !m.observaciones ? (
              <p className="text-slate-400">Sin detalle del trabajo cargado.</p>
            ) : (
              <div className="space-y-2">
                {tareas.length > 0 && (
                  <ul className="space-y-1">
                    {tareas.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5"
                      >
                        <span className="text-slate-700">
                          {t.tarea_id
                            ? tareasById.get(t.tarea_id)?.nombre ?? "Tarea"
                            : t.descripcion || "Tarea"}
                        </span>
                        {t.costo != null && (
                          <span className="shrink-0 tabular-nums text-xs text-slate-500">
                            {fmtMoney(Number(t.costo))}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {m.observaciones && (
                  <p className="whitespace-pre-wrap rounded-md border bg-slate-50 px-2.5 py-1.5 text-slate-700">
                    {m.observaciones}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Repuestos */}
          {(m.repuestos?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Repuestos</p>
              <ul className="space-y-1">
                {m.repuestos!.map((r) => {
                  const sub = r.costo_unitario != null ? Number(r.costo_unitario) * Number(r.cantidad) : null
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5"
                    >
                      <span className="text-slate-700">
                        {r.descripcion}
                        {Number(r.cantidad) !== 1 && (
                          <span className="text-slate-400"> ×{fmtNum(Number(r.cantidad))}</span>
                        )}
                      </span>
                      {sub != null && (
                        <span className="shrink-0 tabular-nums text-xs text-slate-500">
                          {fmtMoney(sub)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Mano de obra */}
          {(m.horas_mano_obra != null || m.costo_mano_obra != null) && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Mano de obra</p>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5">
                <span className="text-slate-700">
                  {m.horas_mano_obra != null ? `${fmtNum(Number(m.horas_mano_obra))} hs` : "—"}
                </span>
                {m.costo_mano_obra != null && (
                  <span className="shrink-0 tabular-nums text-xs text-slate-500">
                    {fmtMoney(Number(m.costo_mano_obra))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Facturas / adjuntos */}
          {facturas.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Adjuntos</p>
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

        <DialogFooter>
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
  const [costo, setCosto] = useState(m.costo != null ? String(m.costo) : "")
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
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const evidencia = urlsExistentes
    const res = await updateMantenimiento({
      id: m.id,
      fecha,
      estado,
      odometro: parseNum(odometro),
      horometro: parseNum(horometro),
      taller,
      costo: parseNum(costo),
      numero_factura: factura,
      numero_ot: numeroOt,
      observaciones: obs,
      es_service_general: esServiceGeneral,
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
      <DialogContent className="sm:max-w-lg">
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
            <Label>Costo ($)</Label>
            <Input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} />
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
                <Label className="text-xs text-slate-600">Entrada al taller</Label>
                <Input
                  type="datetime-local"
                  value={entradaTaller}
                  onChange={(e) => setEntradaTaller(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Salida del taller</Label>
                <Input
                  type="datetime-local"
                  value={salidaTaller}
                  onChange={(e) => setSalidaTaller(e.target.value)}
                />
              </div>
            </div>
          </div>

          {urlsExistentes.length > 0 && (
            <div className="col-span-2">
              <Label>Facturas adjuntas</Label>
              <p className="mb-2 text-xs text-slate-500">
                Las nuevas facturas se cargan en la pestaña Gastos.
              </p>
              <div className="flex flex-wrap gap-1.5">
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
