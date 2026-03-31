"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Plus,
  Search,
  Calendar,
  Clock,
  MapPin,
  User,
  GraduationCap,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  ESTADO_CAPACITACION_COLORS,
  ESTADO_CAPACITACION_LABELS,
} from "@/lib/constants"
import { createCapacitacion, deleteCapacitacion } from "@/actions/capacitaciones"
import type { Capacitacion, EstadoCapacitacion } from "@/types/database"

interface Props {
  capacitaciones: Capacitacion[]
  canEdit: boolean
}

const estadoOptions: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "programada", label: "Programada" },
  { value: "en_curso", label: "En Curso" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
]

export function CapacitacionesClient({ capacitaciones: initial, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [capacitaciones, setCapacitaciones] = useState(initial)
  const [search, setSearch] = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // New form state
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    instructor: "",
    fecha: "",
    duracion_horas: "1",
    lugar: "",
    material_url: "",
  })

  const filtered = useMemo(() => {
    let list = capacitaciones
    if (filterEstado !== "all") {
      list = list.filter((c) => c.estado === filterEstado)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.titulo.toLowerCase().includes(q) ||
          c.instructor.toLowerCase().includes(q)
      )
    }
    return list
  }, [capacitaciones, search, filterEstado])

  // Stats
  const stats = useMemo(() => {
    const programadas = capacitaciones.filter((c) => c.estado === "programada").length
    const enCurso = capacitaciones.filter((c) => c.estado === "en_curso").length
    const completadas = capacitaciones.filter((c) => c.estado === "completada").length
    return { total: capacitaciones.length, programadas, enCurso, completadas }
  }, [capacitaciones])

  async function handleCreate() {
    if (!form.titulo.trim() || !form.instructor.trim() || !form.fecha) {
      toast.error("Completa los campos obligatorios")
      return
    }

    startTransition(async () => {
      const result = await createCapacitacion({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || undefined,
        instructor: form.instructor.trim(),
        fecha: form.fecha,
        duracion_horas: parseFloat(form.duracion_horas) || 1,
        lugar: form.lugar.trim() || undefined,
        material_url: form.material_url.trim() || undefined,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Capacitacion creada")
        setCapacitaciones((prev) => [result.data, ...prev])
        setForm({
          titulo: "",
          descripcion: "",
          instructor: "",
          fecha: "",
          duracion_horas: "1",
          lugar: "",
          material_url: "",
        })
        setDialogOpen(false)
      }
    })
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminar esta capacitacion?")) return
    setDeleting(id)
    const result = await deleteCapacitacion(id)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success("Capacitacion eliminada")
      setCapacitaciones((prev) => prev.filter((c) => c.id !== id))
    }
    setDeleting(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Capacitaciones</h1>
          <p className="text-sm text-slate-500">
            Gestiona las capacitaciones del personal
          </p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="mr-2 size-4" />
                  Nueva Capacitacion
                </Button>
              }
            />
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva Capacitacion</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Titulo *</Label>
                  <Input
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ej: Seguridad e Higiene"
                  />
                </div>
                <div>
                  <Label>Descripcion</Label>
                  <Textarea
                    value={form.descripcion}
                    onChange={(e) =>
                      setForm({ ...form, descripcion: e.target.value })
                    }
                    placeholder="Descripcion de la capacitacion..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Instructor *</Label>
                    <Input
                      value={form.instructor}
                      onChange={(e) =>
                        setForm({ ...form, instructor: e.target.value })
                      }
                      placeholder="Nombre del instructor"
                    />
                  </div>
                  <div>
                    <Label>Fecha *</Label>
                    <Input
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Duracion (horas)</Label>
                    <Input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={form.duracion_horas}
                      onChange={(e) =>
                        setForm({ ...form, duracion_horas: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Lugar</Label>
                    <Input
                      value={form.lugar}
                      onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                      placeholder="Ej: Sala de reuniones"
                    />
                  </div>
                </div>
                <div>
                  <Label>Link material</Label>
                  <Input
                    value={form.material_url}
                    onChange={(e) =>
                      setForm({ ...form, material_url: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={isPending}
                >
                  {isPending ? "Creando..." : "Crear Capacitacion"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} color="#6366F1" />
        <StatCard label="Programadas" value={stats.programadas} color={ESTADO_CAPACITACION_COLORS.programada} />
        <StatCard label="En Curso" value={stats.enCurso} color={ESTADO_CAPACITACION_COLORS.en_curso} />
        <StatCard label="Completadas" value={stats.completadas} color={ESTADO_CAPACITACION_COLORS.completada} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-10"
            placeholder="Buscar por titulo o instructor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {estadoOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-slate-400">
          <GraduationCap className="mb-3 size-10" />
          <p className="font-medium">No hay capacitaciones</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cap) => (
            <Link key={cap.id} href={`/capacitaciones/${cap.id}`}>
              <Card className="group cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base leading-tight group-hover:text-blue-600">
                      {cap.titulo}
                    </CardTitle>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: ESTADO_CAPACITACION_COLORS[cap.estado] + "20",
                        color: ESTADO_CAPACITACION_COLORS[cap.estado],
                      }}
                    >
                      {ESTADO_CAPACITACION_LABELS[cap.estado]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-3.5" />
                    <span>{new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="size-3.5" />
                    <span>{cap.instructor}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="size-3.5" />
                    <span>{cap.duracion_horas}h</span>
                  </div>
                  {cap.lugar && (
                    <div className="flex items-center gap-2">
                      <MapPin className="size-3.5" />
                      <span>{cap.lugar}</span>
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex justify-end pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 text-slate-400 hover:text-red-500"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleDelete(cap.id)
                        }}
                        disabled={deleting === cap.id}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className="flex size-10 items-center justify-center rounded-lg text-lg font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {value}
        </div>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </CardContent>
    </Card>
  )
}
