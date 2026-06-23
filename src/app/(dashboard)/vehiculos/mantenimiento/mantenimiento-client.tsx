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
  CalendarClock,
  CircleDollarSign,
  Paperclip,
  Plus,
  Pencil,
  Trash2,
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
  subirFacturasMantenimiento,
  updateMantenimiento,
  updatePlanTarea,
  upsertPlanOverride,
} from "@/actions/mantenimiento-vehiculos"
import type {
  CostosMantenimiento,
  EstadoPlanVehiculo,
  MantenimientoCategoria,
  MantenimientoEstado,
  MantenimientoPlanOverride,
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
import { PiramideDefectos } from "./piramide-defectos"
import type {
  DocumentoVencimiento,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type {
  ChecklistComentario,
  ChecklistItemNoOk,
  TableroResumen,
} from "@/actions/mantenimiento-vehiculos"
import type { Neumatico, Alineacion } from "@/lib/vehiculos/neumaticos-tipos"

// ==================== Helpers ====================

const TIPO_VEHICULO_LABELS: Record<VehiculoTipo, string> = {
  camion: "Camiones",
  camioneta: "Camionetas",
  autoelevador: "Autoelevadores",
  utilitario: "Utilitarios",
  acoplado: "Acoplados",
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
  for (const f of files) fd.append("facturas", await comprimirImagen(f))
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

// ==================== Componente principal ====================

interface MantenimientoClientProps {
  estados: EstadoPlanVehiculo[]
  tareas: MantenimientoPlanTarea[]
  overrides: MantenimientoPlanOverride[]
  mantenimientos: MantenimientoRealizado[]
  costos: CostosMantenimiento
  tablero: {
    programacion: ServiceGeneralUnidad[]
    documentos: DocumentoVencimiento[]
    resumen: TableroResumen
  }
  checklists: { itemsNoOk: ChecklistItemNoOk[]; comentarios: ChecklistComentario[] }
  neumaticos: Neumatico[]
  alineaciones: Alineacion[]
  puedeEditar: boolean
  esAdmin: boolean
}

export function MantenimientoClient({
  estados,
  tareas,
  overrides,
  mantenimientos,
  costos,
  tablero,
  checklists,
  neumaticos,
  alineaciones,
  puedeEditar,
  esAdmin,
}: MantenimientoClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [tab, setTab] = useState("tablero")
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoPrefill, setNuevoPrefill] = useState<{ dominio?: string; tareaId?: string }>({})
  const [editMant, setEditMant] = useState<MantenimientoRealizado | null>(null)
  const [deleteMantId, setDeleteMantId] = useState<string | null>(null)
  const [tareaEdit, setTareaEdit] = useState<MantenimientoPlanTarea | null>(null)
  const [nuevaTareaOpen, setNuevaTareaOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)

  // Filtros del historial
  const [fDominio, setFDominio] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")
  const [fEstado, setFEstado] = useState("todos")

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

  const mantenimientosFiltrados = useMemo(
    () =>
      mantenimientos.filter(
        (m) =>
          (fDominio === "todos" || m.dominio === fDominio) &&
          (fTipo === "todos" || m.tipo === fTipo) &&
          (fEstado === "todos" || m.estado === fEstado)
      ),
    [mantenimientos, fDominio, fTipo, fEstado]
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
            (m.tipo === "preventivo" ? "Service / preventivo" : "Correctivo"),
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
    () => estados.map((e) => ({ dominio: e.vehiculo.dominio, tipo: e.vehiculo.tipo })),
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

      {/* KPIs */}
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <CircleDollarSign className="size-4 text-slate-400" /> Costo del año
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{fmtMoney(costos.costoYTD)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tablero">Tablero operativo</TabsTrigger>
          <TabsTrigger value="checklists">Check lists</TabsTrigger>
          <TabsTrigger value="piramide">Pirámide de defectos</TabsTrigger>
          <TabsTrigger value="historial">Órdenes de Trabajo</TabsTrigger>
          <TabsTrigger value="neumaticos">Neumáticos</TabsTrigger>
          {puedeEditar && <TabsTrigger value="plantillas">Plan / Plantillas</TabsTrigger>}
        </TabsList>

        {/* ============ TAB: Tablero operativo ============ */}
        <TabsContent value="tablero" className="space-y-6">
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
          />
        </TabsContent>

        {/* ============ TAB: Pirámide de defectos ============ */}
        <TabsContent value="piramide" className="space-y-6">
          <PiramideDefectos
            itemsNoOk={checklists.itemsNoOk}
            mantenimientos={mantenimientos}
          />
        </TabsContent>

        {/* ============ TAB: Neumáticos ============ */}
        <TabsContent value="neumaticos" className="space-y-6">
          <NeumaticosModule
            neumaticos={neumaticos}
            alineaciones={alineaciones}
            unidades={unidades}
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
                      <TableHead>Dominio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Tareas</TableHead>
                      <TableHead className="text-right">Km/Hs</TableHead>
                      <TableHead>Taller</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      {puedeEditar && <TableHead className="w-20" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mantenimientosFiltrados.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{fmtFecha(m.fecha)}</TableCell>
                        <TableCell className="font-medium">{m.dominio}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={
                                m.tipo === "correctivo"
                                  ? "border-orange-200 bg-orange-50 text-orange-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700"
                              }
                            >
                              {m.tipo === "correctivo" ? "Correctivo" : "Preventivo"}
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
                        {puedeEditar && (
                          <TableCell>
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
          prefill={nuevoPrefill}
          onClose={() => setNuevoOpen(false)}
          onSaved={() => {
            setNuevoOpen(false)
            refresh()
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

// ==================== Dialog: nuevo mantenimiento ====================

function NuevoMantenimientoDialog({
  estados,
  tareasPorTipo,
  prefill,
  onClose,
  onSaved,
}: {
  estados: EstadoPlanVehiculo[]
  tareasPorTipo: Map<VehiculoTipo, MantenimientoPlanTarea[]>
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
  const [obs, setObs] = useState("")
  const [esServiceGeneral, setEsServiceGeneral] = useState(false)
  const [tareasSel, setTareasSel] = useState<Set<string>>(
    () => new Set(prefill.tareaId ? [prefill.tareaId] : [])
  )
  const [libres, setLibres] = useState<string[]>([])
  const [libreInput, setLibreInput] = useState("")
  const [facturas, setFacturas] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const vehiculoSel = estados.find((e) => e.vehiculo.dominio === dominio)
  const tipoVeh = (vehiculoSel?.vehiculo.tipo ?? "camion") as VehiculoTipo
  const tareasDisponibles = vehiculoSel ? (tareasPorTipo.get(tipoVeh) ?? []) : []
  const esAutoelevador = tipoVeh === "autoelevador"

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
    if (tareasSel.size === 0 && libres.length === 0 && !esServiceGeneral) {
      toast.error("Marcá al menos una tarea realizada")
      return
    }
    // Un service general puede registrarse sin desglose de tareas del plan.
    const tareas = [
      ...Array.from(tareasSel).map((tareaId) => ({ tareaId })),
      ...libres.map((descripcion) => ({ descripcion })),
    ]
    if (tareas.length === 0) tareas.push({ descripcion: "Service general (rodado)" })
    setSaving(true)
    const urls = await subirFacturas(dominio, facturas)
    if (urls === null) {
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
      costo: parseNum(costo),
      numero_factura: factura,
      observaciones: obs,
      es_service_general: esServiceGeneral,
      evidencia_urls: urls.length ? urls : null,
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
              </div>
            )}
            <div>
              <Label>Taller / proveedor</Label>
              <Input value={taller} onChange={(e) => setTaller(e.target.value)} />
            </div>
            <div>
              <Label>Costo total ($)</Label>
              <Input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} />
            </div>
            <div>
              <Label>N° factura</Label>
              <Input value={factura} onChange={(e) => setFactura(e.target.value)} />
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

          <div>
            <Label>Observaciones</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>

          <FacturasInput facturas={facturas} setFacturas={setFacturas} />
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

// Campo reutilizable para adjuntar facturas/comprobantes (imágenes o PDF).
function FacturasInput({
  facturas,
  setFacturas,
}: {
  facturas: File[]
  setFacturas: (f: File[]) => void
}) {
  return (
    <div>
      <Label>Factura / comprobante</Label>
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
  const [obs, setObs] = useState(m.observaciones ?? "")
  const [esServiceGeneral, setEsServiceGeneral] = useState(m.es_service_general)
  const [urlsExistentes, setUrlsExistentes] = useState<string[]>(m.evidencia_urls ?? [])
  const [facturas, setFacturas] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const nuevas = await subirFacturas(m.dominio, facturas)
    if (nuevas === null) {
      setSaving(false)
      return
    }
    const evidencia = [...urlsExistentes, ...nuevas]
    const res = await updateMantenimiento({
      id: m.id,
      fecha,
      estado,
      odometro: parseNum(odometro),
      horometro: parseNum(horometro),
      taller,
      costo: parseNum(costo),
      numero_factura: factura,
      observaciones: obs,
      es_service_general: esServiceGeneral,
      evidencia_urls: evidencia,
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
            <Label>Costo total ($)</Label>
            <Input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </div>
          <div>
            <Label>N° factura</Label>
            <Input value={factura} onChange={(e) => setFactura(e.target.value)} />
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

          <div className="col-span-2">
            {urlsExistentes.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
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
            )}
            <FacturasInput facturas={facturas} setFacturas={setFacturas} />
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
