"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MinusCircle,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  upsertCertificacion,
  deleteCertificacion,
} from "@/actions/sop-certificaciones"
import type {
  SkapMatriz,
  SkapEmpleadoRow,
  EstadoCertificacion,
} from "@/types/database"

interface Props {
  matriz: SkapMatriz
  sopCodigo: string
  empleados: Array<{ id: string; legajo: number; nombre: string; sector: string | null }>
  isAdmin: boolean
}

const ESTADO_LABEL: Record<EstadoCertificacion, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencida: "Vencida",
  sin_certificar: "Sin certificar",
}

const ESTADO_BADGE: Record<EstadoCertificacion, string> = {
  vigente: "bg-green-100 text-green-700 hover:bg-green-100",
  por_vencer: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  vencida: "bg-red-100 text-red-700 hover:bg-red-100",
  sin_certificar: "bg-slate-100 text-slate-700 hover:bg-slate-100",
}

function todayISO() {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function plusOneYearISO(fecha: string) {
  const d = new Date(fecha + "T12:00:00")
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

interface FormState {
  empleadoId: string
  sopCodigo: string
  sopTitulo: string
  fechaCertificacion: string
  score: string
  aprobado: boolean
  vencimiento: string
  evidenciaUrl: string
  notas: string
}

function emptyForm(sopCodigo: string, sopTitulo: string): FormState {
  const fecha = todayISO()
  return {
    empleadoId: "",
    sopCodigo,
    sopTitulo,
    fechaCertificacion: fecha,
    score: "",
    aprobado: true,
    vencimiento: plusOneYearISO(fecha),
    evidenciaUrl: "",
    notas: "",
  }
}

export function MatrizSkapClient({ matriz, sopCodigo, empleados, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(sopCodigo, matriz.sop_titulo),
  )
  const [editingRow, setEditingRow] = useState<SkapEmpleadoRow | null>(null)

  const coberturaColor = useMemo(() => {
    if (matriz.pct_cobertura >= 90) return "text-green-600"
    if (matriz.pct_cobertura >= 70) return "text-amber-600"
    return "text-red-600"
  }, [matriz.pct_cobertura])

  function openNew() {
    setEditingRow(null)
    setForm(emptyForm(sopCodigo, matriz.sop_titulo))
    setDialogOpen(true)
  }

  function openEdit(row: SkapEmpleadoRow) {
    setEditingRow(row)
    const c = row.certificacion
    setForm({
      empleadoId: row.empleado_id,
      sopCodigo: c?.sop_codigo ?? sopCodigo,
      sopTitulo: c?.sop_titulo ?? matriz.sop_titulo,
      fechaCertificacion: c?.fecha_certificacion ?? todayISO(),
      score: c?.score != null ? String(c.score) : "",
      aprobado: c?.aprobado ?? true,
      vencimiento: c?.vencimiento ?? plusOneYearISO(c?.fecha_certificacion ?? todayISO()),
      evidenciaUrl: c?.evidencia_url ?? "",
      notas: c?.notas ?? "",
    })
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!form.empleadoId) {
      toast.error("Seleccioná un empleado")
      return
    }
    if (!form.sopCodigo.trim() || !form.sopTitulo.trim() || !form.fechaCertificacion) {
      toast.error("Completá los campos obligatorios")
      return
    }
    const scoreNum = form.score.trim() === "" ? null : Number(form.score)
    if (scoreNum != null && (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
      toast.error("Score inválido (0-100)")
      return
    }

    startTransition(async () => {
      const res = await upsertCertificacion({
        empleadoId: form.empleadoId,
        sopCodigo: form.sopCodigo.trim(),
        sopTitulo: form.sopTitulo.trim(),
        fechaCertificacion: form.fechaCertificacion,
        score: scoreNum,
        aprobado: form.aprobado,
        vencimiento: form.vencimiento || null,
        evidenciaUrl: form.evidenciaUrl || null,
        notas: form.notas || null,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editingRow ? "Certificación actualizada" : "Certificación creada")
      setDialogOpen(false)
      router.refresh()
    })
  }

  function handleDelete(row: SkapEmpleadoRow) {
    if (!row.certificacion) return
    if (!confirm(`Eliminar certificación de ${row.nombre}?`)) return
    startTransition(async () => {
      const res = await deleteCertificacion(row.certificacion!.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Certificación eliminada")
      router.refresh()
    })
  }

  function diasText(d: number | null) {
    if (d == null) return <span className="text-slate-400">—</span>
    if (d <= 0) return <span className="font-medium text-red-600">{d} días</span>
    if (d <= 30) return <span className="font-medium text-amber-600">{d} días</span>
    return <span className="font-medium text-green-600">{d} días</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Matriz SKAP — SOP {matriz.sop_codigo}: {matriz.sop_titulo}
          </h1>
          <p className="text-sm text-slate-500">
            Certificación de empleados en el procedimiento operativo — Pilar Entrega 1.1 R1.1.3
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" />
          Nueva certificación
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="% Cobertura"
          value={`${matriz.pct_cobertura.toFixed(0)}%`}
          icon={<Target className="size-5" />}
          valueClassName={coberturaColor}
          sub="Meta ≥90%"
        />
        <KpiCard
          label="Vigentes"
          value={matriz.vigentes}
          icon={<CheckCircle2 className="size-5 text-green-600" />}
        />
        <KpiCard
          label="Por vencer (30d)"
          value={matriz.por_vencer}
          icon={<Clock className="size-5 text-amber-600" />}
        />
        <KpiCard
          label="Vencidas"
          value={matriz.vencidas}
          icon={<AlertTriangle className="size-5 text-red-600" />}
        />
        <KpiCard
          label="Sin certificar"
          value={matriz.sin_certificar}
          icon={<MinusCircle className="size-5 text-slate-500" />}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Legajo</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha cert</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Días restantes</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matriz.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-slate-400">
                    No hay empleados activos cargados.
                  </TableCell>
                </TableRow>
              ) : (
                matriz.rows.map((row) => (
                  <TableRow
                    key={row.empleado_id}
                    className="cursor-pointer"
                    onClick={() => openEdit(row)}
                  >
                    <TableCell className="font-mono text-xs">{row.legajo}</TableCell>
                    <TableCell className="font-medium">{row.nombre}</TableCell>
                    <TableCell className="text-slate-500">{row.sector ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={ESTADO_BADGE[row.estado]} variant="secondary">
                        {ESTADO_LABEL[row.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.certificacion?.fecha_certificacion
                        ? new Date(row.certificacion.fecha_certificacion + "T12:00:00").toLocaleDateString("es-AR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.certificacion?.score != null ? `${row.certificacion.score}` : "—"}
                    </TableCell>
                    <TableCell>
                      {row.certificacion?.vencimiento
                        ? new Date(row.certificacion.vencimiento + "T12:00:00").toLocaleDateString("es-AR")
                        : "—"}
                    </TableCell>
                    <TableCell>{diasText(row.dias_para_vencer)}</TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {isAdmin && row.certificacion && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-slate-400 hover:text-red-500"
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRow ? `Certificación — ${editingRow.nombre}` : "Nueva certificación"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Empleado *</Label>
              <Select
                value={form.empleadoId || undefined}
                onValueChange={(v) => setForm({ ...form, empleadoId: v ?? "" })}
                disabled={!!editingRow}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empleado" />
                </SelectTrigger>
                <SelectContent>
                  {empleados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.legajo} — {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>SOP código *</Label>
                <Input
                  value={form.sopCodigo}
                  onChange={(e) => setForm({ ...form, sopCodigo: e.target.value })}
                />
              </div>
              <div>
                <Label>SOP título *</Label>
                <Input
                  value={form.sopTitulo}
                  onChange={(e) => setForm({ ...form, sopTitulo: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha certificación *</Label>
                <Input
                  type="date"
                  value={form.fechaCertificacion}
                  onChange={(e) => {
                    const fecha = e.target.value
                    setForm({
                      ...form,
                      fechaCertificacion: fecha,
                      vencimiento: fecha ? plusOneYearISO(fecha) : form.vencimiento,
                    })
                  }}
                />
              </div>
              <div>
                <Label>Vencimiento</Label>
                <Input
                  type="date"
                  value={form.vencimiento}
                  onChange={(e) => setForm({ ...form, vencimiento: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Score (0-100)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.score}
                  onChange={(e) => setForm({ ...form, score: e.target.value })}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant={form.aprobado ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm({ ...form, aprobado: true })}
                  >
                    Aprobado
                  </Button>
                  <Button
                    type="button"
                    variant={!form.aprobado ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm({ ...form, aprobado: false })}
                  >
                    No aprobado
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <Label>Evidencia URL</Label>
              <Input
                value={form.evidenciaUrl}
                onChange={(e) => setForm({ ...form, evidenciaUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                rows={3}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Guardando..." : editingRow ? "Actualizar" : "Crear certificación"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon,
  sub,
  valueClassName,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  sub?: string
  valueClassName?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">{label}</span>
          {icon}
        </div>
        <div className={`mt-2 text-2xl font-bold ${valueClassName ?? "text-slate-900"}`}>
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
      </CardContent>
    </Card>
  )
}
