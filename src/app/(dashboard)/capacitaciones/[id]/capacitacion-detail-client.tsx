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
  addAsistentes,
  removeAsistente,
  updateAsistencia,
  createCapacitacionPregunta,
  deleteCapacitacionPregunta,
} from "@/actions/capacitaciones"
import type {
  CapacitacionFull,
  CapacitacionPregunta,
  Empleado,
  AsistenciaConEmpleado,
  EstadoCapacitacion,
  ResultadoCapacitacion,
} from "@/types/database"

interface Props {
  capacitacion: CapacitacionFull
  empleados: Empleado[]
  preguntas: CapacitacionPregunta[]
  canEdit: boolean
}

export function CapacitacionDetailClient({
  capacitacion: initial,
  empleados,
  preguntas: initialPreguntas,
  canEdit,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cap, setCap] = useState(initial)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedEmpleados, setSelectedEmpleados] = useState<string[]>([])
  const [examPreguntas, setExamPreguntas] = useState(initialPreguntas)
  const [addPreguntaOpen, setAddPreguntaOpen] = useState(false)

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

  async function handleNotaChange(asistenciaId: string, nota: number | null) {
    startTransition(async () => {
      const resultado: ResultadoCapacitacion =
        nota === null ? "pendiente" : nota >= 60 ? "aprobado" : "desaprobado"

      const result = await updateAsistencia(asistenciaId, { nota, resultado })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        setCap((prev) => ({
          ...prev,
          asistencias: prev.asistencias.map((a) =>
            a.id === asistenciaId ? { ...a, nota, resultado } : a
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
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Calendar className="size-5 text-blue-500" />
            <div>
              <p className="text-xs text-slate-500">Fecha</p>
              <p className="text-sm font-medium">
                {new Date(cap.fecha + "T12:00:00").toLocaleDateString("es-AR")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <User className="size-5 text-purple-500" />
            <div>
              <p className="text-xs text-slate-500">Instructor</p>
              <p className="text-sm font-medium">{cap.instructor}</p>
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

      {cap.material_url && (
        <a
          href={cap.material_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ExternalLink className="size-3.5" />
          Ver material de capacitacion
        </a>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Inscriptos" value={stats.total} color="#6366F1" />
        <StatCard label="Presentes" value={stats.presentes} color="#3B82F6" />
        <StatCard label="Aprobados" value={stats.aprobados} color="#10B981" />
        <StatCard label="Desaprobados" value={stats.desaprobados} color="#EF4444" />
      </div>

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
                    <TableHead className="text-center">Resultado</TableHead>
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
                        canEdit={canEdit}
                        isPending={isPending}
                        onTogglePresencia={() =>
                          handleTogglePresencia(asistencia)
                        }
                        onNotaChange={(nota) =>
                          handleNotaChange(asistencia.id, nota)
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

      {/* Exam questions section */}
      {canEdit && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              Preguntas del Examen ({examPreguntas.length})
            </CardTitle>
            <Button size="sm" onClick={() => setAddPreguntaOpen(true)}>
              <Plus className="mr-2 size-4" />
              Agregar Pregunta
            </Button>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 shrink-0 p-0 text-slate-400 hover:text-red-500"
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
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
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
          onCreated={(preg) => {
            setExamPreguntas((prev) => [...prev, preg])
            setAddPreguntaOpen(false)
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

// Dialog to add a new exam question
function AddPreguntaDialog({
  capacitacionId,
  orden,
  onClose,
  onCreated,
}: {
  capacitacionId: string
  orden: number
  onClose: () => void
  onCreated: (preg: CapacitacionPregunta) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [texto, setTexto] = useState("")
  const [opciones, setOpciones] = useState(["", "", "", ""])
  const [correcta, setCorrecta] = useState(0)

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

  async function handleCreate() {
    if (!texto.trim()) {
      toast.error("Escribe la pregunta")
      return
    }
    const filledOpciones = opciones.filter((o) => o.trim())
    if (filledOpciones.length < 2) {
      toast.error("Agrega al menos 2 opciones")
      return
    }

    startTransition(async () => {
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
        onCreated(result.data)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Nueva Pregunta</h3>
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
              onClick={handleCreate}
              disabled={isPending}
            >
              {isPending ? "Creando..." : "Crear Pregunta"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AsistenciaRow({
  asistencia,
  canEdit,
  isPending,
  onTogglePresencia,
  onNotaChange,
  onRemove,
}: {
  asistencia: AsistenciaConEmpleado
  canEdit: boolean
  isPending: boolean
  onTogglePresencia: () => void
  onNotaChange: (nota: number | null) => void
  onRemove: () => void
}) {
  const [notaInput, setNotaInput] = useState(
    asistencia.nota !== null ? String(asistencia.nota) : ""
  )
  const [dirty, setDirty] = useState(false)

  function handleNotaBlur() {
    if (!dirty) return
    const val = notaInput.trim()
    const nota = val === "" ? null : parseFloat(val)
    if (nota !== null && (isNaN(nota) || nota < 0 || nota > 100)) {
      toast.error("La nota debe ser entre 0 y 100")
      return
    }
    onNotaChange(nota)
    setDirty(false)
  }

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
        {canEdit ? (
          <Input
            type="number"
            min="0"
            max="100"
            className="mx-auto h-8 w-20 text-center text-sm"
            value={notaInput}
            onChange={(e) => {
              setNotaInput(e.target.value)
              setDirty(true)
            }}
            onBlur={handleNotaBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNotaBlur()
            }}
            disabled={isPending}
            placeholder="-"
          />
        ) : (
          <span className="text-sm">
            {asistencia.nota !== null ? asistencia.nota : "-"}
          </span>
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
