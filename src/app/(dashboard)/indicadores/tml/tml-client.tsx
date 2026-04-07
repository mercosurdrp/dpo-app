"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import type {
  RegistroVehiculo,
  TmlSemanal,
  TmlMensual,
  CatalogoChofer,
  CatalogoVehiculo,
} from "@/types/database"
import {
  Plus,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Truck,
  BarChart3,
  Minus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react"
import { updateRegistroVehiculo, deleteRegistroVehiculo } from "@/actions/registros-vehiculos"

interface KpiData {
  totalEgresos: number
  promedioTml: number
  dentroMeta: number
  pctDentroMeta: number
  metaMinutos: number
  semanal: TmlSemanal[]
  mensual: TmlMensual[]
}

interface Props {
  kpis: KpiData
  registros: RegistroVehiculo[]
  choferes: CatalogoChofer[]
  vehiculos: CatalogoVehiculo[]
}

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function TmlBadge({ tml }: { tml: number }) {
  if (tml <= 30) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{tml} min</Badge>
  if (tml <= 45) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{tml} min</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{tml} min</Badge>
}

function Tendencia({ mensual }: { mensual: TmlMensual[] }) {
  if (mensual.length < 2) return <span className="text-sm text-muted-foreground">Sin datos suficientes</span>
  const last3 = mensual.slice(-3)
  const first = last3[0].promedio_tml
  const last = last3[last3.length - 1].promedio_tml
  const diff = last - first

  if (diff < -2) return (
    <span className="flex items-center gap-1 text-sm font-medium text-green-600">
      <TrendingDown className="h-4 w-4" /> Mejora ({Math.abs(diff)} min)
    </span>
  )
  if (diff > 2) return (
    <span className="flex items-center gap-1 text-sm font-medium text-red-600">
      <TrendingUp className="h-4 w-4" /> Deterioro (+{diff} min)
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-slate-600">
      <Minus className="h-4 w-4" /> Estable
    </span>
  )
}

export function TmlClient({ kpis, registros, choferes, vehiculos }: Props) {
  const [tab, setTab] = useState("semanal")

  const semanalData = kpis.semanal.map((s) => ({
    name: `S${s.semana}`,
    tml: s.promedio_tml,
    pctMeta: s.pct_dentro_meta,
    egresos: s.total_egresos,
  }))

  const mensualData = kpis.mensual.map((m) => ({
    name: MESES[m.mes],
    tml: m.promedio_tml,
    pctMeta: m.pct_dentro_meta,
    egresos: m.total_egresos,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Indicadores Pre Ruta
          </h1>
          <p className="text-sm text-muted-foreground">
            KPIs de Tiempo Medio de Liberación (TML) — Pilar Entrega 1.1
          </p>
        </div>
        <Link href="/indicadores/tml/registro">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Registro
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">TML Promedio</p>
                <p className={`text-3xl font-bold ${
                  kpis.promedioTml <= 30 ? "text-green-600" : kpis.promedioTml <= 45 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpis.promedioTml} min
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                kpis.promedioTml <= 30 ? "bg-green-100" : kpis.promedioTml <= 45 ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Clock className={`h-5 w-5 ${
                  kpis.promedioTml <= 30 ? "text-green-600" : kpis.promedioTml <= 45 ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Meta: ≤ 30 min</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Dentro Meta</p>
                <p className={`text-3xl font-bold ${
                  kpis.pctDentroMeta >= 65 ? "text-green-600" : kpis.pctDentroMeta >= 50 ? "text-amber-600" : "text-red-600"
                }`}>
                  {kpis.pctDentroMeta}%
                </p>
              </div>
              <div className={`rounded-full p-3 ${
                kpis.pctDentroMeta >= 65 ? "bg-green-100" : kpis.pctDentroMeta >= 50 ? "bg-amber-100" : "bg-red-100"
              }`}>
                <Target className={`h-5 w-5 ${
                  kpis.pctDentroMeta >= 65 ? "text-green-600" : kpis.pctDentroMeta >= 50 ? "text-amber-600" : "text-red-600"
                }`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Meta: ≥ 65% — {kpis.dentroMeta}/{kpis.totalEgresos} egresos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Egresos</p>
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.totalEgresos}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <Truck className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Registros cargados</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tendencia 3 meses</p>
                <div className="mt-1">
                  <Tendencia mensual={kpis.mensual} />
                </div>
              </div>
              <div className="rounded-full bg-slate-100 p-3">
                <BarChart3 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">DPO: mejora sostenida</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="semanal">Semanal</TabsTrigger>
          <TabsTrigger value="mensual">Mensual</TabsTrigger>
        </TabsList>

        <TabsContent value="semanal">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">TML Promedio por Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={semanalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit=" min" />
                      <Tooltip
                        formatter={(value) => [`${value} min`, "TML"]}
                        labelFormatter={(label) => `Semana ${label}`}
                      />
                      <ReferenceLine y={30} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta 30min", position: "right", fontSize: 10 }} />
                      <Bar dataKey="tml" radius={[4, 4, 0, 0]}>
                        {semanalData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.tml <= 30 ? "#10B981" : entry.tml <= 45 ? "#F59E0B" : "#EF4444"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">% Dentro de Meta por Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={semanalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "% Meta"]}
                      />
                      <ReferenceLine y={65} stroke="#10B981" strokeDasharray="5 5" label={{ value: "65%", position: "right", fontSize: 10 }} />
                      <Line
                        type="monotone"
                        dataKey="pctMeta"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={{ fill: "#F59E0B", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="mensual">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">TML Promedio por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mensualData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit=" min" />
                      <Tooltip
                        formatter={(value) => [`${value} min`, "TML"]}
                      />
                      <ReferenceLine y={30} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta 30min", position: "right", fontSize: 10 }} />
                      <Bar dataKey="tml" radius={[4, 4, 0, 0]}>
                        {mensualData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.tml <= 30 ? "#10B981" : entry.tml <= 45 ? "#F59E0B" : "#EF4444"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">% Dentro de Meta por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mensualData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                      <Tooltip
                        formatter={(value) => [`${value}%`, "% Meta"]}
                      />
                      <ReferenceLine y={65} stroke="#10B981" strokeDasharray="5 5" label={{ value: "65%", position: "right", fontSize: 10 }} />
                      <Line
                        type="monotone"
                        dataKey="pctMeta"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={{ fill: "#F59E0B", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Recent records table */}
      <RegistrosTable
        registros={registros}
        choferes={choferes}
        vehiculos={vehiculos}
      />
    </div>
  )
}

// ==================== REGISTROS TABLE WITH EDIT/DELETE ====================

function RegistrosTable({
  registros,
  choferes,
  vehiculos,
}: {
  registros: RegistroVehiculo[]
  choferes: CatalogoChofer[]
  vehiculos: CatalogoVehiculo[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editRecord, setEditRecord] = useState<RegistroVehiculo | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Edit form state
  const [editHora, setEditHora] = useState("")
  const [editDominio, setEditDominio] = useState("")
  const [editChofer, setEditChofer] = useState("")
  const [editAyudante1, setEditAyudante1] = useState("")
  const [editAyudante2, setEditAyudante2] = useState("")
  const [editOdometro, setEditOdometro] = useState("")
  const [editHoraEntrada, setEditHoraEntrada] = useState<6 | 7>(7)

  function openEdit(r: RegistroVehiculo) {
    setEditRecord(r)
    setEditHora(r.hora.slice(0, 5))
    setEditDominio(r.dominio)
    setEditChofer(r.chofer)
    setEditAyudante1(r.ayudante1 || "SIN AYUDANTE")
    setEditAyudante2(r.ayudante2 || "SIN AYUDANTE")
    setEditOdometro(r.odometro?.toString() || "")
    setEditHoraEntrada(r.hora_entrada as 6 | 7)
  }

  async function handleSaveEdit() {
    if (!editRecord) return
    setSaving(true)
    const result = await updateRegistroVehiculo({
      id: editRecord.id,
      hora: editHora,
      dominio: editDominio,
      chofer: editChofer,
      ayudante1: editAyudante1 !== "SIN AYUDANTE" ? editAyudante1 : null,
      ayudante2: editAyudante2 !== "SIN AYUDANTE" ? editAyudante2 : null,
      odometro: editOdometro ? parseInt(editOdometro) : null,
      horaEntrada: editHoraEntrada,
    })
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Registro actualizado")
      setEditRecord(null)
      startTransition(() => router.refresh())
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    const result = await deleteRegistroVehiculo(deleteId)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Registro eliminado")
      setDeleteId(null)
      startTransition(() => router.refresh())
    }
    setDeleting(false)
  }

  const personasOptions = choferes.map((c) => c.nombre)

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Últimos Registros</CardTitle>
          <Link href="/indicadores/tml/registro">
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Registrar
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {registros.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay registros cargados. Importá desde el Excel o registrá nuevos egresos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Ayudante 1</TableHead>
                    <TableHead>Ayudante 2</TableHead>
                    <TableHead>Odómetro</TableHead>
                    <TableHead className="text-right">TML</TableHead>
                    <TableHead className="text-right w-24">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.fecha}</TableCell>
                      <TableCell className="text-sm font-mono">{r.hora.slice(0, 5)}</TableCell>
                      <TableCell className="font-medium">{r.dominio}</TableCell>
                      <TableCell className="text-sm">{r.chofer}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.ayudante1 || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.ayudante2 || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{r.odometro || "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.tml_minutos != null ? <TmlBadge tml={r.tml_minutos} /> : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEdit(r)}
                            disabled={isPending}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={() => setDeleteId(r.id)}
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

      {/* Edit Dialog */}
      <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Registro</DialogTitle>
            <DialogDescription>
              {editRecord?.fecha} — {editRecord?.dominio}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hora salida</Label>
                <Input
                  type="time"
                  value={editHora}
                  onChange={(e) => setEditHora(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hora entrada</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={editHoraEntrada === 7 ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditHoraEntrada(7)}
                  >
                    07:00
                  </Button>
                  <Button
                    type="button"
                    variant={editHoraEntrada === 6 ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditHoraEntrada(6)}
                  >
                    06:00
                  </Button>
                </div>
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
                    {personasOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ayudante 1</Label>
                <Select value={editAyudante1} onValueChange={(v: string | null) => setEditAyudante1(v ?? "SIN AYUDANTE")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIN AYUDANTE">Sin ayudante</SelectItem>
                    {personasOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ayudante 2</Label>
                <Select value={editAyudante2} onValueChange={(v: string | null) => setEditAyudante2(v ?? "SIN AYUDANTE")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIN AYUDANTE">Sin ayudante</SelectItem>
                    {personasOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecord(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Registro</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará el registro de egreso.
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
    </>
  )
}
