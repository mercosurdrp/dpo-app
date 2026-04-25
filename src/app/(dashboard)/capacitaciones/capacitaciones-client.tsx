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
  Eye,
  EyeOff,
  ClipboardCheck,
  FileDown,
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
import { createCapacitacion, deleteCapacitacion, toggleCapacitacionVisible } from "@/actions/capacitaciones"
import type { CapacitacionConResumen, EstadoCapacitacion } from "@/types/database"
import { estadoDerivado } from "@/lib/capacitacion-estado"

interface Props {
  capacitaciones: CapacitacionConResumen[]
  canEdit: boolean
}

const estadoOptions: { value: string; label: string }[] = [
  { value: "all", label: "Todos los estados" },
  { value: "programada", label: "Programada" },
  { value: "en_curso", label: "En Curso" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
]

const PILAR_OPTIONS = [
  { value: "all", label: "Todos los pilares" },
  { value: "Seguridad", label: "Seguridad" },
  { value: "Gente", label: "Gente" },
  { value: "Gestion", label: "Gestion" },
  { value: "Entrega", label: "Entrega" },
  { value: "Flota", label: "Flota" },
  { value: "Almacen", label: "Almacen" },
  { value: "Planeamiento", label: "Planeamiento" },
]

const PILAR_COLORS: Record<string, string> = {
  Seguridad: "#EF4444",
  Gente: "#3B82F6",
  Gestion: "#8B5CF6",
  Entrega: "#F59E0B",
  Flota: "#10B981",
  Almacen: "#6366F1",
  Planeamiento: "#EC4899",
}

export function CapacitacionesClient({ capacitaciones: initial, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [capacitaciones, setCapacitaciones] = useState(initial)
  const [search, setSearch] = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const [filterPilar, setFilterPilar] = useState("all")
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
    pilar: "",
  })

  const withDerived = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return capacitaciones.map((c) => ({ ...c, estadoReal: estadoDerivado(c, today) }))
  }, [capacitaciones])

  const filtered = useMemo(() => {
    let list = withDerived
    if (filterEstado !== "all") {
      list = list.filter((c) => c.estadoReal === filterEstado)
    }
    if (filterPilar !== "all") {
      list = list.filter((c) => c.pilar === filterPilar)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          (c.titulo ?? "").toLowerCase().includes(q) ||
          (c.instructor ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [withDerived, search, filterEstado, filterPilar])

  // Stats (basado en estado derivado real)
  const stats = useMemo(() => {
    const programadas = withDerived.filter((c) => c.estadoReal === "programada").length
    const enCurso = withDerived.filter((c) => c.estadoReal === "en_curso").length
    const completadas = withDerived.filter((c) => c.estadoReal === "completada").length
    const total = withDerived.length
    const pctRealizadas = total > 0 ? Math.round((completadas / total) * 100) : 0
    return { total, programadas, enCurso, completadas, pctRealizadas }
  }, [withDerived])

  const realizadasList = useMemo(
    () =>
      withDerived
        .filter((c) => c.estadoReal === "completada")
        .sort((a, b) => (b.fecha > a.fecha ? 1 : -1)),
    [withDerived]
  )

  const [realizadasOpen, setRealizadasOpen] = useState(false)

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
        pilar: form.pilar || undefined,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Capacitacion creada")
        const nueva: CapacitacionConResumen = {
          ...result.data,
          total_asistentes: 0,
          presentes: 0,
          rendidos: 0,
          pendientes: 0,
        }
        setCapacitaciones((prev) => [nueva, ...prev])
        setForm({
          titulo: "",
          descripcion: "",
          instructor: "",
          fecha: "",
          duracion_horas: "1",
          lugar: "",
          material_url: "",
          pilar: "",
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
        <div className="flex items-center gap-2">
          <Link href="/capacitaciones/matriz-skap">
            <Button variant="outline">
              <ClipboardCheck className="mr-2 size-4" />
              Matriz SKAP SOP 1.1
            </Button>
          </Link>
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/api/capacitaciones/export"
              }}
            >
              <FileDown className="mr-2 size-4" />
              Descargar Excel
            </Button>
          )}
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
                  <Label>Pilar</Label>
                  <Select
                    value={form.pilar || "none"}
                    onValueChange={(v) => setForm({ ...form, pilar: v === "none" ? "" : (v ?? "") })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar pilar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin pilar</SelectItem>
                      {PILAR_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} color="#6366F1" />
        <StatCard label="Programadas" value={stats.programadas} color={ESTADO_CAPACITACION_COLORS.programada} />
        <StatCard label="En Curso" value={stats.enCurso} color={ESTADO_CAPACITACION_COLORS.en_curso} />
        <StatCard label="Completadas" value={stats.completadas} color={ESTADO_CAPACITACION_COLORS.completada} />
        <button
          type="button"
          onClick={() => setRealizadasOpen(true)}
          className="text-left outline-none"
          aria-label="Ver capacitaciones realizadas"
        >
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className="flex size-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                {stats.pctRealizadas}%
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-600">Realizadas</span>
                <span className="text-xs text-slate-400">Ver listado</span>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Dialog: lista de capacitaciones realizadas */}
      <Dialog open={realizadasOpen} onOpenChange={setRealizadasOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Capacitaciones realizadas ({realizadasList.length} de {stats.total} · {stats.pctRealizadas}%)
            </DialogTitle>
          </DialogHeader>
          {realizadasList.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Todavía no hay capacitaciones realizadas.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">Capacitación</th>
                    <th className="py-2 pr-2">Fecha</th>
                    <th className="py-2 pr-2">Instructor</th>
                    <th className="py-2">Pilar</th>
                  </tr>
                </thead>
                <tbody>
                  {realizadasList.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium text-slate-900">
                        <Link
                          href={`/capacitaciones/${c.id}`}
                          className="hover:text-blue-600"
                          onClick={() => setRealizadasOpen(false)}
                        >
                          {c.titulo}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-slate-600">
                        {new Date(c.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                      </td>
                      <td className="py-2 pr-2 text-slate-600">{c.instructor}</td>
                      <td className="py-2">
                        {c.pilar ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium"
                            style={{ color: PILAR_COLORS[c.pilar] ?? "#64748B" }}
                          >
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: PILAR_COLORS[c.pilar] ?? "#94A3B8" }}
                            />
                            {c.pilar}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
        <Select value={filterPilar} onValueChange={(v) => setFilterPilar(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PILAR_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.value !== "all" && (
                  <span
                    className="mr-2 inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: PILAR_COLORS[o.value] }}
                  />
                )}
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                        backgroundColor: ESTADO_CAPACITACION_COLORS[cap.estadoReal] + "20",
                        color: ESTADO_CAPACITACION_COLORS[cap.estadoReal],
                      }}
                    >
                      {ESTADO_CAPACITACION_LABELS[cap.estadoReal]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-500">
                  {cap.pilar && (
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: PILAR_COLORS[cap.pilar] ?? "#94A3B8" }}
                      />
                      <span className="font-medium" style={{ color: PILAR_COLORS[cap.pilar] ?? "#94A3B8" }}>
                        {cap.pilar}
                      </span>
                    </div>
                  )}
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
                    <div className="flex justify-end gap-1 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`size-7 p-0 ${cap.visible ? "text-green-500 hover:text-green-700" : "text-slate-300 hover:text-slate-500"}`}
                        title={cap.visible ? "Visible para empleados — click para ocultar" : "Oculta — click para hacer visible"}
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const result = await toggleCapacitacionVisible(cap.id, !cap.visible)
                          if ("error" in result) {
                            toast.error(result.error)
                          } else {
                            setCapacitaciones((prev) =>
                              prev.map((c) =>
                                c.id === cap.id ? { ...c, visible: !c.visible } : c
                              )
                            )
                            toast.success(cap.visible ? "Oculta para empleados" : "Visible para empleados")
                          }
                        }}
                      >
                        {cap.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </Button>
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
