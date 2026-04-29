"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  UserPlus,
  Plus,
  Check,
  X,
  Save,
  ExternalLink,
  Trash2,
  Upload,
  Sparkles,
  Loader2,
  Eye,
  EyeOff,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Pencil,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ESTADO_CAPACITACION_COLORS,
  ESTADO_CAPACITACION_LABELS,
  RESULTADO_COLORS,
  RESULTADO_LABELS,
} from "@/lib/constants"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  updateCapacitacion,
  toggleCapacitacionVisible,
  addAsistentes,
  removeAsistente,
  updateAsistencia,
  createCapacitacionPregunta,
  deleteCapacitacionPregunta,
  updateCapacitacionPregunta,
  saveDpoPuntos,
} from "@/actions/capacitaciones"
import type {
  CapacitacionFull,
  CapacitacionPregunta,
  CapacitacionRespuesta,
  CapacitacionDpoPuntoFull,
  Empleado,
  AsistenciaConEmpleado,
  EstadoCapacitacion,
  ResultadoCapacitacion,
} from "@/types/database"

interface DpoHierarchyPilar {
  id: string
  nombre: string
  color: string
  bloques: {
    id: string
    nombre: string
    preguntas: { id: string; numero: string; texto: string }[]
  }[]
}

interface IntentoExamen {
  empleado_id: string
  intento_n: number
  nota: number
  correctas: number | null
  total: number | null
  created_at: string
}

interface Props {
  capacitacion: CapacitacionFull
  empleados: Empleado[]
  preguntas: CapacitacionPregunta[]
  dpoPuntos: CapacitacionDpoPuntoFull[]
  dpoHierarchy: DpoHierarchyPilar[]
  intentos: IntentoExamen[]
  respuestas: CapacitacionRespuesta[]
  canEdit: boolean
}

export function CapacitacionDetailClient({
  capacitacion: initial,
  empleados,
  preguntas: initialPreguntas,
  dpoPuntos: initialDpoPuntos,
  dpoHierarchy,
  intentos,
  respuestas,
  canEdit,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cap, setCap] = useState(initial)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedEmpleados, setSelectedEmpleados] = useState<string[]>([])
  const [examPreguntas, setExamPreguntas] = useState(initialPreguntas)
  const [addPreguntaOpen, setAddPreguntaOpen] = useState(false)
  const [editingPregunta, setEditingPregunta] = useState<CapacitacionPregunta | null>(null)
  const [dpoPuntos, setDpoPuntos] = useState(initialDpoPuntos)
  const [dpoDialogOpen, setDpoDialogOpen] = useState(false)

  // Empleados not yet enrolled
  const availableEmpleados = useMemo(() => {
    const enrolled = new Set(cap.asistencias.map((a) => a.empleado_id))
    return empleados.filter((e) => !enrolled.has(e.id))
  }, [cap.asistencias, empleados])

  // Stats
  const stats = useMemo(() => {
    const total = cap.asistencias.length
    const presentes = cap.asistencias.filter((a) => a.presente).length
    const aprobados = cap.asistencias.filter((a) => a.resultado === "aprobado").length
    const desaprobados = cap.asistencias.filter((a) => a.resultado === "desaprobado").length
    return { total, presentes, aprobados, desaprobados }
  }, [cap.asistencias])

  async function handleEstadoChange(estado: EstadoCapacitacion) {
    startTransition(async () => {
      const result = await updateCapacitacion(cap.id, { estado })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setCap((prev) => ({ ...prev, estado }))
        toast.success("Estado actualizado")
      }
    })
  }

  async function handleAddAsistentes() {
    if (selectedEmpleados.length === 0) {
      toast.error("Selecciona al menos un empleado")
      return
    }

    startTransition(async () => {
      const result = await addAsistentes(cap.id, selectedEmpleados)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${selectedEmpleados.length} asistente(s) agregados`)
        setSelectedEmpleados([])
        setAddDialogOpen(false)
        router.refresh()
      }
    })
  }

  async function handleAddAll() {
    const allIds = availableEmpleados.map((e) => e.id)
    if (allIds.length === 0) return

    startTransition(async () => {
      const result = await addAsistentes(cap.id, allIds)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Todos los empleados agregados")
        setAddDialogOpen(false)
        router.refresh()
      }
    })
  }

  async function handleTogglePresencia(asistencia: AsistenciaConEmpleado) {
    const newPresente = !asistencia.presente
    startTransition(async () => {
      const result = await updateAsistencia(asistencia.id, {
        presente: newPresente,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setCap((prev) => ({
          ...prev,
          asistencias: prev.asistencias.map((a) =>
            a.id === asistencia.id ? { ...a, presente: newPresente } : a
          ),
        }))
      }
    })
  }

  async function handleRemoveAsistente(asistenciaId: string) {
    startTransition(async () => {
      const result = await removeAsistente(asistenciaId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setCap((prev) => ({
          ...prev,
          asistencias: prev.asistencias.filter((a) => a.id !== asistenciaId),
        }))
        toast.success("Asistente removido")
      }
    })
  }

  function toggleEmpleadoSelection(id: string) {
    setSelectedEmpleados((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/capacitaciones"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="size-3.5" />
            Volver
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{cap.titulo}</h1>
          {cap.descripcion && (
            <p className="mt-1 text-sm text-slate-500">{cap.descripcion}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className={cap.visible ? "border-green-300 text-green-600" : "border-slate-200 text-slate-400"}
              onClick={async () => {
                const result = await toggleCapacitacionVisible(cap.id, !cap.visible)
                if ("error" in result) {
                  toast.error(result.error)
                } else {
                  setCap((prev) => ({ ...prev, visible: !prev.visible }))
                  toast.success(cap.visible ? "Oculta para empleados" : "Visible para empleados")
                }
              }}
            >
              {cap.visible ? <Eye className="mr-2 size-4" /> : <EyeOff className="mr-2 size-4" />}
              {cap.visible ? "Visible" : "Oculta"}
            </Button>
            <Select
              value={cap.estado}
              onValueChange={(v) => handleEstadoChange(v as EstadoCapacitacion)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["programada", "en_curso", "completada", "cancelada"] as const
                ).map((e) => (
                  <SelectItem key={e} value={e}>
                    {ESTADO_CAPACITACION_LABELS[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Calendar className="size-5 text-blue-500" />
            <div>
              <p className="text-xs text-slate-500">Fecha</p>
              {canEdit ? (
                <Input
                  type="date"
                  className="h-7 w-36 text-sm"
                  value={cap.fecha}
                  onChange={async (e) => {
                    const newFecha = e.target.value
                    if (!newFecha) return
                    setCap((prev) => ({ ...prev, fecha: newFecha }))
                    const result = await updateCapacitacion(cap.id, { fecha: newFecha })
                    if ("error" in result) {
                      toast.error(result.error)
                    } else {
                      toast.success("Fecha actualizada")
                    }
                  }}
                />
              ) : (
                <p className="text-sm font-medium">
                  {new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <User className="size-5 text-purple-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">Instructor</p>
              {canEdit ? (
                <Input
                  className="h-7 text-sm"
                  defaultValue={cap.instructor}
                  placeholder="Nombre del instructor"
                  onBlur={async (e) => {
                    const newInstructor = e.target.value.trim()
                    if (!newInstructor) {
                      toast.error("El instructor no puede estar vacío")
                      e.target.value = cap.instructor
                      return
                    }
                    if (newInstructor === cap.instructor) return
                    const result = await updateCapacitacion(cap.id, {
                      instructor: newInstructor,
                    })
                    if ("error" in result) {
                      toast.error(result.error)
                      e.target.value = cap.instructor
                    } else {
                      setCap((prev) => ({ ...prev, instructor: newInstructor }))
                      toast.success("Instructor actualizado")
                    }
                  }}
                />
              ) : (
                <p className="text-sm font-medium">{cap.instructor}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="size-5 text-amber-500" />
            <div>
              <p className="text-xs text-slate-500">Duracion</p>
              <p className="text-sm font-medium">{cap.duracion_horas}h</p>
            </div>
          </CardContent>
        </Card>
        {cap.lugar && (
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <MapPin className="size-5 text-green-500" />
              <div>
                <p className="text-xs text-slate-500">Lugar</p>
                <p className="text-sm font-medium">{cap.lugar}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <ExternalLink className="size-5 text-blue-500" />
            <div className="text-xs font-medium text-slate-500">Material</div>
          </div>
          {canEdit ? (
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="url"
                placeholder="https://… enlace al sitio con el material de la capacitación"
                defaultValue={cap.material_url ?? ""}
                className="h-9 text-sm"
                onBlur={async (e) => {
                  const newUrl = e.target.value.trim()
                  if ((newUrl || null) === (cap.material_url ?? null)) return
                  const result = await updateCapacitacion(cap.id, {
                    material_url: newUrl || null,
                  })
                  if ("error" in result) {
                    toast.error(result.error)
                  } else {
                    setCap((prev) => ({ ...prev, material_url: newUrl || null }))
                    toast.success("Link de material actualizado")
                  }
                }}
              />
              {cap.material_url && (
                <a
                  href={cap.material_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  title="Abrir material"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          ) : cap.material_url ? (
            <a
              href={cap.material_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              Ver material de capacitación
              <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span className="text-sm text-slate-400">Sin material cargado</span>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Inscriptos" value={stats.total} color="#6366F1" />
        <StatCard label="Presentes" value={stats.presentes} color="#3B82F6" />
        <StatCard label="Aprobados" value={stats.aprobados} color="#10B981" />
        <StatCard label="Desaprobados" value={stats.desaprobados} color="#EF4444" />
      </div>

      {/* Puntos DPO vinculados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="size-5 text-purple-500" />
            Puntos DPO vinculados ({dpoPuntos.length})
          </CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setDpoDialogOpen(true)}>
              <Plus className="mr-2 size-4" />
              Vincular puntos
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {dpoPuntos.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">
              No hay puntos DPO vinculados. {canEdit ? "Vincula esta capacitacion a puntos del checklist DPO." : ""}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dpoPuntos.map((punto) => (
                <Link
                  key={punto.id}
                  href={`/pilares/${punto.pilar_id}/pregunta/${punto.pregunta_id}`}
                  className="group"
                >
                  <Badge
                    variant="secondary"
                    className="cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: punto.pilar_color + "15",
                      color: punto.pilar_color,
                      borderColor: punto.pilar_color + "30",
                    }}
                  >
                    <span
                      className="mr-1.5 inline-block size-2 rounded-full"
                      style={{ backgroundColor: punto.pilar_color }}
                    />
                    {punto.pilar_nombre} — {punto.pregunta_numero}
                    <span className="ml-1 max-w-48 truncate text-xs opacity-70">
                      {punto.pregunta_texto}
                    </span>
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DPO selector dialog */}
      {dpoDialogOpen && (
        <DpoPuntosSelector
          hierarchy={dpoHierarchy}
          selected={dpoPuntos.map((p) => p.pregunta_id)}
          capacitacionId={cap.id}
          onClose={() => setDpoDialogOpen(false)}
          onSaved={(newPuntos) => {
            setDpoPuntos(newPuntos)
            setDpoDialogOpen(false)
          }}
        />
      )}

      {/* Asistentes section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Asistentes</CardTitle>
          {canEdit && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger
                render={
                  <Button size="sm">
                    <UserPlus className="mr-2 size-4" />
                    Agregar
                  </Button>
                }
              />
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Agregar Asistentes</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {availableEmpleados.length === 0 ? (
                    <p className="text-center text-sm text-slate-500">
                      Todos los empleados ya estan inscriptos
                    </p>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleAddAll}
                        disabled={isPending}
                      >
                        Agregar todos ({availableEmpleados.length})
                      </Button>
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {availableEmpleados.map((emp) => (
                          <label
                            key={emp.id}
                            className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
                          >
                            <Checkbox
                              checked={selectedEmpleados.includes(emp.id)}
                              onCheckedChange={() =>
                                toggleEmpleadoSelection(emp.id)
                              }
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{emp.nombre}</p>
                              <p className="text-xs text-slate-500">
                                Legajo {emp.legajo}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleAddAsistentes}
                        disabled={
                          isPending || selectedEmpleados.length === 0
                        }
                      >
                        {isPending
                          ? "Agregando..."
                          : `Agregar seleccionados (${selectedEmpleados.length})`}
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {cap.asistencias.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">
              No hay asistentes registrados
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Legajo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-center">Presente</TableHead>
                    <TableHead className="text-center">Nota</TableHead>
                    <TableHead className="text-center">Intentos</TableHead>
                    <TableHead className="text-center">Resultado</TableHead>
                    <TableHead className="text-center">Respuestas</TableHead>
                    {canEdit && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cap.asistencias
                    .sort((a, b) =>
                      a.empleado.nombre.localeCompare(b.empleado.nombre)
                    )
                    .map((asistencia) => (
                      <AsistenciaRow
                        key={asistencia.id}
                        asistencia={asistencia}
                        intentos={intentos.filter((i) => i.empleado_id === asistencia.empleado_id)}
                        respuestas={respuestas.filter((r) => r.empleado_id === asistencia.empleado_id)}
                        preguntas={examPreguntas}
                        canEdit={canEdit}
                        isPending={isPending}
                        onTogglePresencia={() =>
                          handleTogglePresencia(asistencia)
                        }
                        onRemove={() => handleRemoveAsistente(asistencia.id)}
                      />
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen por pregunta */}
      {examPreguntas.length > 0 && respuestas.length > 0 && (
        <ResumenPreguntasCard preguntas={examPreguntas} respuestas={respuestas} />
      )}

      {/* Exam questions section */}
      {canEdit && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              Preguntas del Examen ({examPreguntas.length})
            </CardTitle>
            <div className="flex gap-2">
              <GenerarExamenButton
                capacitacionId={cap.id}
                onGenerated={(count) => {
                  toast.success(`${count} preguntas generadas con IA`)
                  router.refresh()
                }}
              />
              <Button size="sm" onClick={() => setAddPreguntaOpen(true)}>
                <Plus className="mr-2 size-4" />
                Manual
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {examPreguntas.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">
                No hay preguntas cargadas. Agrega preguntas para que los empleados puedan rendir el examen.
              </p>
            ) : (
              <div className="space-y-3">
                {examPreguntas.map((preg, idx) => {
                  const opciones = parseOpciones(preg.opciones)
                  return (
                    <div
                      key={preg.id}
                      className="rounded-lg border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                              {idx + 1}
                            </span>
                            {preg.texto}
                          </p>
                          <div className="mt-2 ml-8 space-y-1">
                            {opciones.map((op, opIdx) => (
                              <p
                                key={opIdx}
                                className={`text-sm ${
                                  opIdx === preg.respuesta_correcta
                                    ? "font-medium text-green-600"
                                    : "text-slate-500"
                                }`}
                              >
                                {String.fromCharCode(65 + opIdx)}. {op}
                                {opIdx === preg.respuesta_correcta && " ✓"}
                              </p>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-slate-400 hover:text-blue-500"
                            onClick={() => setEditingPregunta(preg)}
                            title="Editar pregunta"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-slate-400 hover:text-red-500"
                            onClick={async () => {
                              const result = await deleteCapacitacionPregunta(preg.id)
                              if ("error" in result) {
                                toast.error(result.error)
                              } else {
                                setExamPreguntas((prev) =>
                                  prev.filter((p) => p.id !== preg.id)
                                )
                                toast.success("Pregunta eliminada")
                              }
                            }}
                            title="Eliminar pregunta"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add pregunta dialog */}
      {addPreguntaOpen && (
        <AddPreguntaDialog
          capacitacionId={cap.id}
          orden={examPreguntas.length}
          onClose={() => setAddPreguntaOpen(false)}
          onSaved={(preg) => {
            setExamPreguntas((prev) => [...prev, preg])
            setAddPreguntaOpen(false)
          }}
        />
      )}

      {/* Edit pregunta dialog */}
      {editingPregunta && (
        <AddPreguntaDialog
          capacitacionId={cap.id}
          orden={editingPregunta.orden}
          pregunta={editingPregunta}
          onClose={() => setEditingPregunta(null)}
          onSaved={(preg) => {
            setExamPreguntas((prev) =>
              prev.map((p) => (p.id === preg.id ? preg : p))
            )
            setEditingPregunta(null)
          }}
        />
      )}
    </div>
  )
}

// Parse opciones helper
function parseOpciones(opciones: string[] | string): string[] {
  if (Array.isArray(opciones)) return opciones
  try {
    return JSON.parse(opciones)
  } catch {
    return []
  }
}

// Resumen agregado por pregunta: cuántos acertaron y cuántos fallaron.
function ResumenPreguntasCard({
  preguntas,
  respuestas,
}: {
  preguntas: CapacitacionPregunta[]
  respuestas: CapacitacionRespuesta[]
}) {
  const stats = preguntas
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((preg) => {
      const resps = respuestas.filter((r) => r.pregunta_id === preg.id)
      const aciertos = resps.filter((r) => r.es_correcta).length
      const fallos = resps.length - aciertos
      const total = resps.length
      const pct = total > 0 ? Math.round((aciertos / total) * 100) : 0
      return { preg, aciertos, fallos, total, pct }
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="size-5 text-purple-500" />
          Resumen por pregunta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>Pregunta</TableHead>
                <TableHead className="w-24 text-center">Aciertos</TableHead>
                <TableHead className="w-24 text-center">Errores</TableHead>
                <TableHead className="w-24 text-center">Respondieron</TableHead>
                <TableHead className="w-32 text-center">% Acierto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((s, idx) => {
                const color =
                  s.pct >= 80 ? "#10B981" : s.pct >= 50 ? "#F59E0B" : "#EF4444"
                return (
                  <TableRow key={s.preg.id}>
                    <TableCell className="text-center text-xs text-slate-500">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="text-sm">{s.preg.texto}</TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        {s.aciertos}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                        {s.fallos}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium text-slate-600">
                      {s.total}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${s.pct}%`, backgroundColor: color }}
                          />
                        </div>
                        <span
                          className="w-10 text-right text-xs font-semibold"
                          style={{ color }}
                        >
                          {s.pct}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// Dialog to add a new exam question
function AddPreguntaDialog({
  capacitacionId,
  orden,
  pregunta,
  onClose,
  onSaved,
}: {
  capacitacionId: string
  orden: number
  pregunta?: CapacitacionPregunta | null
  onClose: () => void
  onSaved: (preg: CapacitacionPregunta, mode: "create" | "update") => void
}) {
  const isEdit = !!pregunta
  const [isPending, startTransition] = useTransition()
  const [texto, setTexto] = useState(pregunta?.texto ?? "")
  const [opciones, setOpciones] = useState<string[]>(() => {
    if (!pregunta) return ["", "", "", ""]
    const parsed = parseOpciones(pregunta.opciones)
    while (parsed.length < 2) parsed.push("")
    return parsed
  })
  const [correcta, setCorrecta] = useState(pregunta?.respuesta_correcta ?? 0)

  function updateOpcion(idx: number, value: string) {
    setOpciones((prev) => prev.map((o, i) => (i === idx ? value : o)))
  }

  function addOpcion() {
    setOpciones((prev) => [...prev, ""])
  }

  function removeOpcion(idx: number) {
    if (opciones.length <= 2) return
    setOpciones((prev) => prev.filter((_, i) => i !== idx))
    if (correcta >= opciones.length - 1) setCorrecta(0)
  }

  async function handleSave() {
    if (!texto.trim()) {
      toast.error("Escribe la pregunta")
      return
    }
    const filledOpciones = opciones.filter((o) => o.trim())
    if (filledOpciones.length < 2) {
      toast.error("Agrega al menos 2 opciones")
      return
    }
    if (correcta >= filledOpciones.length) {
      toast.error("La opción correcta marcada no existe (revisá las opciones)")
      return
    }

    startTransition(async () => {
      if (isEdit && pregunta) {
        const result = await updateCapacitacionPregunta(pregunta.id, {
          texto: texto.trim(),
          opciones: filledOpciones,
          respuesta_correcta: correcta,
        })
        if ("error" in result) {
          toast.error(result.error)
        } else {
          toast.success("Pregunta actualizada")
          onSaved(result.data, "update")
        }
      } else {
        const result = await createCapacitacionPregunta({
          capacitacion_id: capacitacionId,
          texto: texto.trim(),
          opciones: filledOpciones,
          respuesta_correcta: correcta,
          orden,
        })
        if ("error" in result) {
          toast.error(result.error)
        } else {
          toast.success("Pregunta agregada")
          onSaved(result.data, "create")
        }
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">{isEdit ? "Editar Pregunta" : "Nueva Pregunta"}</h3>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Pregunta *</Label>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe la pregunta..."
              rows={2}
            />
          </div>

          <div>
            <Label>Opciones (marca la correcta)</Label>
            <div className="mt-2 space-y-2">
              {opciones.map((op, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrecta(idx)}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                      correcta === idx
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-slate-300 text-slate-400 hover:border-green-300"
                    }`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </button>
                  <Input
                    value={op}
                    onChange={(e) => updateOpcion(idx, e.target.value)}
                    placeholder={`Opcion ${String.fromCharCode(65 + idx)}`}
                    className="flex-1"
                  />
                  {opciones.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => removeOpcion(idx)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {opciones.length < 6 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={addOpcion}
              >
                + Agregar opcion
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? (isEdit ? "Guardando..." : "Creando...") : isEdit ? "Guardar Cambios" : "Crear Pregunta"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Generate exam from uploaded document via AI
function GenerarExamenButton({
  capacitacionId,
  onGenerated,
}: {
  capacitacionId: string
  onGenerated: (count: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const fileInputRef = useState<HTMLInputElement | null>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["pdf", "docx", "doc"].includes(ext ?? "")) {
      toast.error("Solo se aceptan archivos PDF o DOCX")
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("El archivo no puede superar 50MB")
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("capacitacion_id", capacitacionId)

      const res = await fetch("/api/generar-examen", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Error generando examen")
      } else {
        onGenerated(data.preguntas_generadas)
      }
    } catch {
      toast.error("Error de conexion")
    } finally {
      setLoading(false)
      // Reset input
      e.target.value = ""
    }
  }

  return (
    <div className="relative">
      <input
        type="file"
        accept=".pdf,.docx,.doc"
        onChange={handleFileSelect}
        className="absolute inset-0 cursor-pointer opacity-0"
        disabled={loading}
      />
      <Button size="sm" variant="outline" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Generando...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 size-4" />
            Generar con IA
          </>
        )}
      </Button>
    </div>
  )
}

function AsistenciaRow({
  asistencia,
  intentos,
  respuestas,
  preguntas,
  canEdit,
  isPending,
  onTogglePresencia,
  onRemove,
}: {
  asistencia: AsistenciaConEmpleado
  intentos: IntentoExamen[]
  respuestas: CapacitacionRespuesta[]
  preguntas: CapacitacionPregunta[]
  canEdit: boolean
  isPending: boolean
  onTogglePresencia: () => void
  onRemove: () => void
}) {
  const [respuestasOpen, setRespuestasOpen] = useState(false)
  const intentosTooltip = intentos
    .map((i) => `Intento #${i.intento_n}: ${i.nota}%`)
    .join("\n")
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {asistencia.empleado.legajo}
      </TableCell>
      <TableCell className="font-medium text-sm">
        {asistencia.empleado.nombre}
      </TableCell>
      <TableCell className="text-center">
        {canEdit ? (
          <Checkbox
            checked={asistencia.presente}
            onCheckedChange={onTogglePresencia}
            disabled={isPending}
          />
        ) : asistencia.presente ? (
          <Check className="mx-auto size-4 text-green-500" />
        ) : (
          <X className="mx-auto size-4 text-red-400" />
        )}
      </TableCell>
      <TableCell className="text-center">
        <span className="text-sm">
          {asistencia.nota !== null ? asistencia.nota : "-"}
        </span>
      </TableCell>
      <TableCell className="text-center">
        {intentos.length > 0 ? (
          <Badge
            variant="secondary"
            title={intentosTooltip}
            className={intentos.length > 1 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}
          >
            {intentos.length}
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant="secondary"
          style={{
            backgroundColor: RESULTADO_COLORS[asistencia.resultado] + "20",
            color: RESULTADO_COLORS[asistencia.resultado],
          }}
        >
          {RESULTADO_LABELS[asistencia.resultado]}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        {respuestas.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setRespuestasOpen(true)}
          >
            <ClipboardList className="mr-1 size-3.5" />
            Ver
          </Button>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
        <RespuestasDialog
          open={respuestasOpen}
          onOpenChange={setRespuestasOpen}
          asistencia={asistencia}
          respuestas={respuestas}
          preguntas={preguntas}
        />
      </TableCell>
      {canEdit && (
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-slate-400 hover:text-red-500"
            onClick={onRemove}
            disabled={isPending}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  )
}

// Dialog: ver respuestas de un empleado en una capacitación (último intento)
function RespuestasDialog({
  open,
  onOpenChange,
  asistencia,
  respuestas,
  preguntas,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  asistencia: AsistenciaConEmpleado
  respuestas: CapacitacionRespuesta[]
  preguntas: CapacitacionPregunta[]
}) {
  const respuestasPorPregunta = new Map(respuestas.map((r) => [r.pregunta_id, r]))
  const correctas = respuestas.filter((r) => r.es_correcta).length
  const total = preguntas.length
  const sortedPreg = [...preguntas].sort((a, b) => a.orden - b.orden)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-blue-500" />
            Respuestas — {asistencia.empleado.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">Legajo {asistencia.empleado.legajo}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">
            {correctas}/{total} correctas
          </span>
          {asistencia.nota !== null && (
            <>
              <span className="text-slate-400">·</span>
              <span className={`font-bold ${asistencia.nota >= 80 ? "text-green-600" : "text-red-600"}`}>
                {asistencia.nota}%
              </span>
            </>
          )}
          <span className="ml-auto text-xs text-slate-400">Último intento</span>
        </div>
        {respuestas.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            El empleado todavía no rindió el examen.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedPreg.map((preg, idx) => {
              const opciones = parseOpciones(preg.opciones)
              const resp = respuestasPorPregunta.get(preg.id)
              const elegidaIdx = resp?.respuesta_elegida ?? -1
              const correcta = resp?.es_correcta ?? false
              return (
                <div
                  key={preg.id}
                  className={`rounded-lg border p-3 ${correcta ? "border-green-200 bg-green-50/50" : resp ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}
                >
                  <div className="mb-2 flex items-start gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-slate-800">
                      {preg.texto}
                    </span>
                    {resp ? (
                      correcta ? (
                        <CheckCircle2 className="size-5 shrink-0 text-green-500" />
                      ) : (
                        <XCircle className="size-5 shrink-0 text-red-500" />
                      )
                    ) : (
                      <span className="shrink-0 text-xs text-slate-400">Sin responder</span>
                    )}
                  </div>
                  <div className="ml-8 space-y-1.5">
                    {opciones.map((op, opIdx) => {
                      const esCorrecta = opIdx === preg.respuesta_correcta
                      const esElegida = opIdx === elegidaIdx
                      let cls = "border-slate-200 bg-white text-slate-700"
                      if (esCorrecta) cls = "border-green-300 bg-green-100 text-green-900"
                      else if (esElegida) cls = "border-red-300 bg-red-100 text-red-900"
                      return (
                        <div
                          key={opIdx}
                          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${cls}`}
                        >
                          <span className="font-bold">{String.fromCharCode(65 + opIdx)}.</span>
                          <span className="flex-1">{op}</span>
                          {esCorrecta && (
                            <Badge className="h-5 bg-green-600 px-1.5 text-[10px] text-white hover:bg-green-600">
                              Correcta
                            </Badge>
                          )}
                          {esElegida && !esCorrecta && (
                            <Badge className="h-5 bg-red-500 px-1.5 text-[10px] text-white hover:bg-red-500">
                              Eligió
                            </Badge>
                          )}
                          {esElegida && esCorrecta && (
                            <Badge className="h-5 bg-blue-600 px-1.5 text-[10px] text-white hover:bg-blue-600">
                              Eligió
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// DPO Points hierarchical selector dialog
function DpoPuntosSelector({
  hierarchy,
  selected: initialSelected,
  capacitacionId,
  onClose,
  onSaved,
}: {
  hierarchy: DpoHierarchyPilar[]
  selected: string[]
  capacitacionId: string
  onClose: () => void
  onSaved: (puntos: CapacitacionDpoPuntoFull[]) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelected))
  const [expandedPilares, setExpandedPilares] = useState<Set<string>>(new Set())
  const [expandedBloques, setExpandedBloques] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)

  const q = search.toLowerCase().trim()

  function togglePregunta(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePilar(pilarId: string) {
    setExpandedPilares((prev) => {
      const next = new Set(prev)
      if (next.has(pilarId)) next.delete(pilarId)
      else next.add(pilarId)
      return next
    })
  }

  function toggleBloque(bloqueId: string) {
    setExpandedBloques((prev) => {
      const next = new Set(prev)
      if (next.has(bloqueId)) next.delete(bloqueId)
      else next.add(bloqueId)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    const result = await saveDpoPuntos(capacitacionId, [...selectedIds])
    if ("error" in result) {
      toast.error(result.error)
      setSaving(false)
      return
    }

    // Build the CapacitacionDpoPuntoFull array from hierarchy data
    const puntosFull: CapacitacionDpoPuntoFull[] = []
    for (const pilar of hierarchy) {
      for (const bloque of pilar.bloques) {
        for (const preg of bloque.preguntas) {
          if (selectedIds.has(preg.id)) {
            puntosFull.push({
              id: "",
              capacitacion_id: capacitacionId,
              pregunta_id: preg.id,
              created_at: new Date().toISOString(),
              pregunta_numero: preg.numero,
              pregunta_texto: preg.texto,
              bloque_nombre: bloque.nombre,
              pilar_id: pilar.id,
              pilar_nombre: pilar.nombre,
              pilar_color: pilar.color,
            })
          }
        }
      }
    }

    toast.success(`${selectedIds.size} punto(s) DPO vinculados`)
    onSaved(puntosFull)
  }

  // Filter hierarchy based on search
  const filteredHierarchy = useMemo(() => {
    if (!q) return hierarchy
    return hierarchy
      .map((pilar) => ({
        ...pilar,
        bloques: pilar.bloques
          .map((bloque) => ({
            ...bloque,
            preguntas: bloque.preguntas.filter(
              (p) =>
                p.numero.toLowerCase().includes(q) ||
                p.texto.toLowerCase().includes(q) ||
                bloque.nombre.toLowerCase().includes(q) ||
                pilar.nombre.toLowerCase().includes(q)
            ),
          }))
          .filter((b) => b.preguntas.length > 0),
      }))
      .filter((p) => p.bloques.length > 0)
  }, [hierarchy, q])

  // Auto-expand when searching
  const isSearching = q.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="border-b p-4">
          <h3 className="text-lg font-semibold">Vincular Puntos DPO</h3>
          <p className="mt-1 text-sm text-slate-500">
            Selecciona los puntos del checklist DPO que cubre esta capacitacion
          </p>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              placeholder="Buscar por numero o texto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {selectedIds.size > 0 && (
            <p className="mt-2 text-sm font-medium text-purple-600">
              {selectedIds.size} punto(s) seleccionados
            </p>
          )}
        </div>

        {/* Hierarchy tree */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredHierarchy.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No se encontraron puntos
            </p>
          ) : (
            <div className="space-y-1">
              {filteredHierarchy.map((pilar) => {
                const pilarExpanded = isSearching || expandedPilares.has(pilar.id)
                const pilarSelectedCount = pilar.bloques.reduce(
                  (acc, b) => acc + b.preguntas.filter((p) => selectedIds.has(p.id)).length,
                  0
                )

                return (
                  <div key={pilar.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                      onClick={() => togglePilar(pilar.id)}
                    >
                      {pilarExpanded ? (
                        <ChevronDown className="size-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-4 text-slate-400" />
                      )}
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: pilar.color }}
                      />
                      <span className="text-sm font-semibold" style={{ color: pilar.color }}>
                        {pilar.nombre}
                      </span>
                      {pilarSelectedCount > 0 && (
                        <span className="ml-auto rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          {pilarSelectedCount}
                        </span>
                      )}
                    </button>

                    {pilarExpanded && (
                      <div className="ml-4 space-y-0.5">
                        {pilar.bloques.map((bloque) => {
                          const bloqueExpanded = isSearching || expandedBloques.has(bloque.id)
                          const bloqueSelectedCount = bloque.preguntas.filter((p) =>
                            selectedIds.has(p.id)
                          ).length

                          return (
                            <div key={bloque.id}>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-50"
                                onClick={() => toggleBloque(bloque.id)}
                              >
                                {bloqueExpanded ? (
                                  <ChevronDown className="size-3.5 text-slate-300" />
                                ) : (
                                  <ChevronRight className="size-3.5 text-slate-300" />
                                )}
                                <span className="text-xs font-medium text-slate-600">
                                  {bloque.nombre}
                                </span>
                                {bloqueSelectedCount > 0 && (
                                  <span className="ml-auto text-xs text-purple-500">
                                    {bloqueSelectedCount}
                                  </span>
                                )}
                              </button>

                              {bloqueExpanded && (
                                <div className="ml-5 space-y-0.5">
                                  {bloque.preguntas.map((preg) => {
                                    const isSelected = selectedIds.has(preg.id)
                                    return (
                                      <label
                                        key={preg.id}
                                        className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                                          isSelected
                                            ? "bg-purple-50"
                                            : "hover:bg-slate-50"
                                        }`}
                                      >
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() => togglePregunta(preg.id)}
                                          className="mt-0.5"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <span className="text-xs font-mono font-semibold text-slate-500">
                                            {preg.numero}
                                          </span>
                                          <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">
                                            {preg.texto}
                                          </p>
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t p-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : `Guardar (${selectedIds.size} puntos)`}
          </Button>
        </div>
      </div>
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
