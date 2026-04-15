"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
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
import type {
  ChecklistVehiculo,
  RegistroCombustible,
  CatalogoChofer,
  CatalogoVehiculo,
  KmFlotaResumen,
  AlertaVehiculo,
} from "@/types/database"
import {
  Truck,
  MapPin,
  Home,
  RotateCcw,
  ClipboardCheck,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  Fuel,
  Gauge,
  Bell,
  Info,
  AlertTriangle,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
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
import { updateChecklist } from "@/actions/checklist-vehiculos"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import { deleteChecklist } from "@/actions/checklist-vehiculos"
import { deleteRegistroCombustible } from "@/actions/combustible"

interface EstadoVehiculo {
  dominio: string
  descripcion: string | null
  estado: "en_base" | "en_ruta" | "retornado"
  ultimoChecklist: ChecklistVehiculo | null
}

interface Props {
  estadoVehiculos: EstadoVehiculo[]
  checklists: ChecklistVehiculo[]
  combustible: RegistroCombustible[]
  vehiculos: CatalogoVehiculo[]
  choferes: CatalogoChofer[]
  kmFlotaResumen: KmFlotaResumen | null
  alertas: AlertaVehiculo[]
}

function formatFechaCorta(fechaIso: string) {
  const d = new Date(fechaIso)
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
}

const severidadConfig = {
  info: {
    Icon: Info,
    border: "border-l-blue-500",
    iconColor: "text-blue-500",
  },
  warning: {
    Icon: AlertTriangle,
    border: "border-l-amber-500",
    iconColor: "text-amber-500",
  },
  danger: {
    Icon: ShieldAlert,
    border: "border-l-red-500",
    iconColor: "text-red-500",
  },
} as const

const estadoConfig = {
  en_base: { label: "En Base", color: "bg-slate-100 text-slate-700", icon: Home },
  en_ruta: { label: "En Ruta", color: "bg-blue-100 text-blue-700", icon: MapPin },
  retornado: { label: "Retornado", color: "bg-green-100 text-green-700", icon: RotateCcw },
}

function formatHora(isoStr: string) {
  const d = new Date(isoStr)
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

function formatTiempoRuta(minutos: number) {
  const hh = Math.floor(minutos / 60)
  const mm = minutos % 60
  return `${hh}h ${mm.toString().padStart(2, "0")}m`
}

function TiempoRutaBadge({ minutos }: { minutos: number }) {
  const text = formatTiempoRuta(minutos)
  if (minutos <= 480) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{text}</Badge>
  if (minutos <= 540) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{text}</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{text}</Badge>
}

function ResultadoBadge({ resultado }: { resultado: string }) {
  if (resultado === "aprobado")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Aprobado</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rechazado</Badge>
}

export function VehiculosClient({ estadoVehiculos, checklists, combustible, vehiculos, choferes, kmFlotaResumen, alertas }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteType, setDeleteType] = useState<"checklist" | "combustible">("checklist")
  const [deleting, setDeleting] = useState(false)
  const [alertasExpanded, setAlertasExpanded] = useState(false)
  const [editChk, setEditChk] = useState<ChecklistVehiculo | null>(null)
  const [editFecha, setEditFecha] = useState("")
  const [editHora, setEditHora] = useState("")
  const [editDominio, setEditDominio] = useState("")
  const [editChofer, setEditChofer] = useState("")
  const [editResultado, setEditResultado] = useState<"aprobado" | "rechazado">("aprobado")
  const [editOdometro, setEditOdometro] = useState("")
  const [editObs, setEditObs] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  function openEditChk(c: ChecklistVehiculo) {
    setEditChk(c)
    setEditFecha(c.fecha)
    const d = new Date(c.hora)
    const hh = d.getHours().toString().padStart(2, "0")
    const mm = d.getMinutes().toString().padStart(2, "0")
    setEditHora(`${hh}:${mm}`)
    setEditDominio(c.dominio)
    setEditChofer(c.chofer)
    setEditResultado(c.resultado as "aprobado" | "rechazado")
    setEditOdometro(c.odometro?.toString() || "")
    setEditObs(c.observaciones || "")
  }

  async function handleSaveEditChk() {
    if (!editChk) return
    setEditSaving(true)
    const result = await updateChecklist({
      id: editChk.id,
      fecha: editFecha,
      dominio: editDominio,
      chofer: editChofer,
      hora: editHora,
      resultado: editResultado,
      odometro: editOdometro ? parseInt(editOdometro) : null,
      observaciones: editObs || null,
    })
    setEditSaving(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Checklist actualizado")
    setEditChk(null)
    startTransition(() => router.refresh())
  }

  const personasOpts = choferes.map((c) => c.nombre)

  const enBase = estadoVehiculos.filter((v) => v.estado === "en_base").length
  const enRuta = estadoVehiculos.filter((v) => v.estado === "en_ruta").length
  const retornados = estadoVehiculos.filter((v) => v.estado === "retornado").length

  const kmDelta = kmFlotaResumen && kmFlotaResumen.kmAyer > 0
    ? ((kmFlotaResumen.kmHoy - kmFlotaResumen.kmAyer) / kmFlotaResumen.kmAyer) * 100
    : null
  const kmSube = kmDelta != null && kmDelta >= 0

  const alertasVisibles = alertasExpanded ? alertas : alertas.slice(0, 3)

  const serieDiariaChart = (kmFlotaResumen?.serieDiariaMes ?? []).map((d) => ({
    fecha: formatFechaCorta(d.fecha),
    km: d.km,
  }))

  const topMaxKm = kmFlotaResumen?.topVehiculosMes?.[0]?.km ?? 0
  const bottomMaxKm = kmFlotaResumen?.bottomVehiculosMes?.reduce((a, b) => Math.max(a, b.km), 0) ?? 0

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    const result = deleteType === "combustible"
      ? await deleteRegistroCombustible(deleteId)
      : await deleteChecklist(deleteId)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(deleteType === "combustible" ? "Registro eliminado" : "Checklist eliminado")
      setDeleteId(null)
      startTransition(() => router.refresh())
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vehículos</h1>
          <p className="text-sm text-muted-foreground">
            Estado de flota, checklists de liberación y retorno
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/vehiculos/combustible">
            <Button variant="outline">
              <Fuel className="mr-2 h-4 w-4" /> Cargar Combustible
            </Button>
          </Link>
          <Link href="/vehiculos/checklist">
            <Button>
              <ClipboardCheck className="mr-2 h-4 w-4" /> Nuevo Checklist
            </Button>
          </Link>
        </div>
      </div>

      {/* Banner de alertas */}
      {alertas.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Alertas de flota ({alertas.length})</CardTitle>
            </div>
            {alertas.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAlertasExpanded((v) => !v)}
              >
                {alertasExpanded ? "Ver menos" : `Ver todas (${alertas.length})`}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {alertasVisibles.map((a) => {
              const cfg = severidadConfig[a.severidad]
              const SevIcon = cfg.Icon
              return (
                <Link key={a.id} href={`/vehiculos/${encodeURIComponent(a.dominio)}`}>
                  <div
                    className={`flex items-start gap-3 rounded-md border-l-4 bg-slate-50 p-3 hover:bg-slate-100 transition-colors ${cfg.border}`}
                  >
                    <SevIcon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${cfg.iconColor}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {a.dominio}
                        </span>
                        <span className="text-sm font-medium text-slate-700">
                          {a.titulo}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{a.descripcion}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Vehículos</p>
                <p className="text-3xl font-bold text-slate-900">{estadoVehiculos.length}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Truck className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En Base</p>
                <p className="text-3xl font-bold text-slate-600">{enBase}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Home className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En Ruta</p>
                <p className="text-3xl font-bold text-blue-600">{enRuta}</p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <MapPin className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Km Hoy</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kmFlotaResumen ? kmFlotaResumen.kmHoy.toLocaleString("es-AR") : "—"}
                </p>
              </div>
              <div className="rounded-full bg-indigo-100 p-3">
                <Gauge className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              {kmDelta != null ? (
                <>
                  {kmSube ? (
                    <ArrowUp className="h-3 w-3 text-green-600" />
                  ) : (
                    <ArrowDown className="h-3 w-3 text-red-600" />
                  )}
                  <span className={kmSube ? "text-green-600" : "text-red-600"}>
                    {Math.abs(kmDelta).toFixed(0)}%
                  </span>{" "}
                  vs ayer
                </>
              ) : (
                "Sin comparación"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Km Mes</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kmFlotaResumen ? kmFlotaResumen.kmMesActual.toLocaleString("es-AR") : "—"}
                </p>
              </div>
              <div className="rounded-full bg-cyan-100 p-3">
                <MapPin className="h-5 w-5 text-cyan-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {kmFlotaResumen
                ? `Promedio: ${kmFlotaResumen.promedioDiarioMes.toLocaleString("es-AR")} km/día`
                : "Sin datos"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Retornados</p>
                <p className="text-3xl font-bold text-green-600">{retornados}</p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <RotateCcw className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="flota">
        <TabsList>
          <TabsTrigger value="flota">Estado Flota Hoy</TabsTrigger>
          <TabsTrigger value="km">Km Recorridos</TabsTrigger>
          <TabsTrigger value="historial">Historial Checklists</TabsTrigger>
          <TabsTrigger value="combustible">Combustible</TabsTrigger>
        </TabsList>

        {/* Tab: Estado Flota */}
        <TabsContent value="flota">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado de Vehículos — Hoy</CardTitle>
            </CardHeader>
            <CardContent>
              {estadoVehiculos.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay vehículos registrados en el catálogo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dominio</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Último Checklist</TableHead>
                        <TableHead>Resultado</TableHead>
                        <TableHead className="text-right">Tiempo Ruta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estadoVehiculos.map((v) => {
                        const cfg = estadoConfig[v.estado]
                        const Icon = cfg.icon
                        return (
                          <TableRow key={v.dominio}>
                            <TableCell>
                              <Link
                                href={`/vehiculos/${encodeURIComponent(v.dominio)}`}
                                className="font-mono font-semibold text-blue-600 hover:underline"
                              >
                                {v.dominio}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {v.descripcion || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${cfg.color} hover:${cfg.color}`}>
                                <Icon className="mr-1 h-3 w-3" />
                                {cfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {v.ultimoChecklist ? (
                                <span>
                                  {v.ultimoChecklist.tipo === "liberacion" ? "Liberación" : "Retorno"}{" "}
                                  {formatHora(v.ultimoChecklist.hora)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {v.ultimoChecklist ? (
                                <ResultadoBadge resultado={v.ultimoChecklist.resultado} />
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {v.ultimoChecklist?.tiempo_ruta_minutos != null ? (
                                <TiempoRutaBadge minutos={v.ultimoChecklist.tiempo_ruta_minutos} />
                              ) : v.estado === "en_ruta" ? (
                                <span className="flex items-center justify-end gap-1 text-sm text-blue-600">
                                  <Clock className="h-3.5 w-3.5" /> En curso
                                </span>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Km Recorridos */}
        <TabsContent value="km" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Km por día — últimos 30 días</CardTitle>
            </CardHeader>
            <CardContent>
              {serieDiariaChart.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Sin datos de km en los últimos 30 días.
                </p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serieDiariaChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="fecha" fontSize={11} />
                      <YAxis fontSize={11} unit=" km" />
                      <RechartsTooltip
                        formatter={(v) => [`${Number(v).toLocaleString("es-AR")} km`, "Km"]}
                      />
                      <Bar dataKey="km" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 5 vehículos del mes</CardTitle>
              </CardHeader>
              <CardContent>
                {!kmFlotaResumen || kmFlotaResumen.topVehiculosMes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Sin datos.</p>
                ) : (
                  <div className="space-y-3">
                    {kmFlotaResumen.topVehiculosMes.map((v) => {
                      const pct = topMaxKm > 0 ? (v.km / topMaxKm) * 100 : 0
                      return (
                        <Link
                          key={v.dominio}
                          href={`/vehiculos/${encodeURIComponent(v.dominio)}`}
                          className="block"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-mono font-semibold text-blue-600 hover:underline">
                                {v.dominio}
                              </span>
                              <span className="font-mono">
                                {v.km.toLocaleString("es-AR")} km
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bottom 5 vehículos del mes</CardTitle>
              </CardHeader>
              <CardContent>
                {!kmFlotaResumen || kmFlotaResumen.bottomVehiculosMes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Sin datos.</p>
                ) : (
                  <div className="space-y-3">
                    {kmFlotaResumen.bottomVehiculosMes.map((v) => {
                      const pct = bottomMaxKm > 0 ? (v.km / bottomMaxKm) * 100 : 0
                      return (
                        <Link
                          key={v.dominio}
                          href={`/vehiculos/${encodeURIComponent(v.dominio)}`}
                          className="block"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-mono font-semibold text-blue-600 hover:underline">
                                {v.dominio}
                              </span>
                              <span className="font-mono">
                                {v.km.toLocaleString("es-AR")} km
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-amber-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Historial */}
        <TabsContent value="historial">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Últimos Checklists</CardTitle>
              <Link href="/vehiculos/checklist">
                <Button variant="outline" size="sm">
                  <ClipboardCheck className="mr-1 h-4 w-4" /> Nuevo
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {checklists.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay checklists registrados.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Dominio</TableHead>
                        <TableHead>Chofer</TableHead>
                        <TableHead>Resultado</TableHead>
                        <TableHead className="text-right">T. Ruta</TableHead>
                        <TableHead className="text-right w-28">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checklists.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{c.fecha}</TableCell>
                          <TableCell className="text-sm font-mono">{formatHora(c.hora)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              c.tipo === "liberacion"
                                ? "border-blue-200 text-blue-700"
                                : "border-green-200 text-green-700"
                            }>
                              {c.tipo === "liberacion" ? "Liberación" : "Retorno"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/vehiculos/${encodeURIComponent(c.dominio)}`}
                              className="font-mono font-semibold text-blue-600 hover:underline"
                            >
                              {c.dominio}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{c.chofer}</TableCell>
                          <TableCell>
                            <ResultadoBadge resultado={c.resultado} />
                          </TableCell>
                          <TableCell className="text-right">
                            {c.tiempo_ruta_minutos != null ? (
                              <TiempoRutaBadge minutos={c.tiempo_ruta_minutos} />
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Link href={`/vehiculos/checklist/${c.id}`}>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openEditChk(c)}
                                disabled={isPending}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                onClick={() => { setDeleteId(c.id); setDeleteType("checklist") }}
                                disabled={isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Combustible */}
        <TabsContent value="combustible">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Últimas Cargas de Combustible</CardTitle>
              <Link href="/vehiculos/combustible">
                <Button variant="outline" size="sm">
                  <Fuel className="mr-1 h-4 w-4" /> Nueva Carga
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {combustible.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay cargas de combustible registradas.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Dominio</TableHead>
                        <TableHead>Chofer</TableHead>
                        <TableHead className="text-right">Odómetro</TableHead>
                        <TableHead className="text-right">Litros</TableHead>
                        <TableHead className="text-right">Km Rec.</TableHead>
                        <TableHead className="text-right">Rendimiento</TableHead>
                        <TableHead className="text-right w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combustible.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{c.fecha}</TableCell>
                          <TableCell>
                            <Link
                              href={`/vehiculos/${encodeURIComponent(c.dominio)}`}
                              className="font-mono font-semibold text-blue-600 hover:underline"
                            >
                              {c.dominio}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{c.chofer}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{c.odometro.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{Number(c.litros).toFixed(1)} L</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {c.km_recorridos != null ? `${c.km_recorridos} km` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {c.rendimiento != null ? (
                              <Badge className={
                                Number(c.rendimiento) >= 3 ? "bg-green-100 text-green-700 hover:bg-green-100" :
                                Number(c.rendimiento) >= 2 ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                                "bg-red-100 text-red-700 hover:bg-red-100"
                              }>
                                {Number(c.rendimiento).toFixed(1)} km/l
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">1° carga</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                              onClick={() => { setDeleteId(c.id); setDeleteType("combustible") }}
                              disabled={isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Checklist Dialog */}
      <Dialog open={!!editChk} onOpenChange={(open) => !open && setEditChk(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Checklist</DialogTitle>
            <DialogDescription>
              {editChk?.tipo === "liberacion" ? "Liberación" : "Retorno"} · {editChk?.fecha}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={editFecha}
                  onChange={(e) => setEditFecha(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={editHora}
                  onChange={(e) => setEditHora(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dominio</Label>
                <Select value={editDominio} onValueChange={(v: string | null) => setEditDominio(v ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehiculos.map((v) => (
                      <SelectItem key={v.id} value={v.dominio}>{v.dominio}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Chofer</Label>
                <Select value={editChofer} onValueChange={(v: string | null) => setEditChofer(v ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {personasOpts.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Resultado</Label>
                <Select
                  value={editResultado}
                  onValueChange={(v: string | null) =>
                    setEditResultado((v as "aprobado" | "rechazado") ?? "aprobado")
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aprobado">Aprobado</SelectItem>
                    <SelectItem value="rechazado">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Odómetro</Label>
                <Input
                  type="number"
                  placeholder="Km"
                  value={editOdometro}
                  onChange={(e) => setEditOdometro(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observaciones</Label>
              <Textarea
                rows={3}
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChk(null)}>Cancelar</Button>
            <Button onClick={handleSaveEditChk} disabled={editSaving}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Registro</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
