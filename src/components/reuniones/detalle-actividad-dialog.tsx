"use client"

import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import { useEffect, useState, useTransition } from "react"
import {
  CalendarClock,
  CheckCircle2,
  FileDown,
  Loader2,
  Paperclip,
  Plus,
  User,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AdjuntosInput } from "@/components/adjuntos-input"
import { PlanHerramientasInline } from "@/components/herramientas-gestion/plan-herramientas-inline"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  agregarAvanceActividad,
  getHistorialActividad,
  getSignedUrl,
  reprogramarActividad,
} from "@/actions/reuniones"
import type {
  EstadoReunionActividad,
  ReunionActividadConResponsable,
  ReunionActividadEvidenciaConAutor,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  actividad: ReunionActividadConResponsable
  /** Si el usuario puede registrar avances (editor o responsable). */
  puedeResponder: boolean
  /** Estado preseleccionado al abrir (ej. al elegir "Cerrada" en la fila). */
  estadoInicial?: EstadoReunionActividad
  onSaved: () => void
}

const ESTADO_LABEL: Record<EstadoReunionActividad, string> = {
  no_comenzada: "No comenzada",
  en_curso: "En curso",
  cerrada: "Cerrada",
}

const ESTADO_CLASE: Record<EstadoReunionActividad, string> = {
  no_comenzada: "bg-slate-100 text-slate-700 border-slate-300",
  en_curso: "bg-amber-50 text-amber-700 border-amber-300",
  cerrada: "bg-emerald-50 text-emerald-700 border-emerald-300",
}

function formatFechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

function formatFecha(fecha: string): string {
  const d = new Date(fecha + "T12:00:00")
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function EstadoBadge({ estado }: { estado: EstadoReunionActividad }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ESTADO_CLASE[estado]}`}
    >
      {ESTADO_LABEL[estado]}
    </span>
  )
}

export function DetalleActividadDialog({
  open,
  onOpenChange,
  actividad,
  puedeResponder,
  estadoInicial,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [historial, setHistorial] = useState<
    ReunionActividadEvidenciaConAutor[]
  >([])
  // Arranca en `true`: el componente se monta nuevo en cada apertura (render
  // condicional + `key` por actividad) y carga el historial de inmediato.
  const [cargandoHist, setCargandoHist] = useState(true)
  const [histError, setHistError] = useState<string | null>(null)

  const [comentario, setComentario] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])
  const [nuevoEstado, setNuevoEstado] = useState<EstadoReunionActividad>(
    estadoInicial ?? actividad.estado,
  )
  const [tipoCierre, setTipoCierre] = useState<"definitivo" | "reprogramar">(
    "definitivo",
  )
  const [reprogPreset, setReprogPreset] = useState<"1w" | "1m" | "custom">(
    "1w",
  )
  const [reprogCustom, setReprogCustom] = useState(
    actividad.fecha_compromiso ?? plusDays(7),
  )

  const fechaNueva =
    reprogPreset === "1w"
      ? plusDays(7)
      : reprogPreset === "1m"
        ? plusDays(30)
        : reprogCustom
  const reprogramando =
    nuevoEstado === "cerrada" && tipoCierre === "reprogramar"

  // Carga inicial del historial de avances. El estado se actualiza dentro
  // del callback async (no de forma síncrona en el cuerpo del efecto).
  useEffect(() => {
    let cancelado = false
    void getHistorialActividad(actividad.id).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        setHistError(res.error)
        setHistorial([])
      } else {
        setHistError(null)
        setHistorial(res.data)
      }
      setCargandoHist(false)
    })
    return () => {
      cancelado = true
    }
  }, [actividad.id])

  async function abrirArchivo(path: string | null) {
    if (!path) return
    const result = await getSignedUrl(path)
    if ("error" in result) {
      alert(`Error abriendo archivo: ${result.error}`)
      return
    }
    abrirArchivoEnVisor(result.data.url)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (reprogramando) {
      if (!fechaNueva) {
        setError("Elegí la nueva fecha de compromiso.")
        return
      }
      startTransition(async () => {
        const result = await reprogramarActividad(
          actividad.id,
          fechaNueva,
          comentario.trim() || null,
        )
        if ("error" in result) {
          setError(result.error)
          return
        }
        onSaved()
        onOpenChange(false)
      })
      return
    }

    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set("nuevo_estado", nuevoEstado)

    const tieneArchivo = archivos.length > 0
    const tieneComentario = comentario.trim().length > 0

    if (nuevoEstado === "cerrada" && !tieneComentario) {
      setError("Para cerrar la actividad tenés que escribir un comentario.")
      return
    }
    if (!tieneArchivo && !tieneComentario) {
      setError("Adjuntá un archivo o escribí un comentario.")
      return
    }
    for (const f of archivos) formData.append("archivo", f)

    startTransition(async () => {
      const result = await agregarAvanceActividad(actividad.id, formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      // Avisamos a la página para que refresque la lista de actividades.
      onSaved()
      // Si se cerró la actividad, cerramos el popup.
      if (nuevoEstado === "cerrada") {
        onOpenChange(false)
        return
      }
      // Si sigue abierto, limpiamos el formulario y refrescamos el historial.
      setComentario("")
      setArchivos([])
      form.reset()
      const refrescado = await getHistorialActividad(actividad.id)
      if (!("error" in refrescado)) {
        setHistorial(refrescado.data)
      }
    })
  }

  const cerrandoTarea = nuevoEstado === "cerrada"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">
            {actividad.descripcion}
          </DialogTitle>
        </DialogHeader>

        {/* Ficha de la actividad */}
        <div className="space-y-2 rounded-md border bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={actividad.estado} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="size-3.5" />
              {actividad.responsable_nombre ?? "Sin responsable"}
            </span>
            {actividad.fecha_compromiso && (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                Vence: {formatFecha(actividad.fecha_compromiso)}
              </span>
            )}
          </div>
          {actividad.motivo && (
            <p className="text-xs text-slate-600">
              <span className="font-medium">Motivo:</span> {actividad.motivo}
            </p>
          )}
          <PlanHerramientasInline
            reunionActividadId={actividad.id}
            tituloSugerido={actividad.descripcion}
            puedeAplicar={puedeResponder}
          />
        </div>

        {/* Línea de tiempo de avances */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">
            ¿Qué se hizo?
          </h3>
          {cargandoHist ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando historial…
            </div>
          ) : histError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {histError}
            </p>
          ) : historial.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Todavía no hay avances registrados.
            </p>
          ) : (
            <ul className="space-y-2">
              {historial.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border bg-white p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <User className="size-3.5" />
                      {ev.autor_nombre ?? "—"}
                    </span>
                    <span>{formatFechaHora(ev.created_at)}</span>
                  </div>
                  {ev.comentario && (
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">
                      {ev.comentario}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {ev.archivos.map((arch) => (
                      <Button
                        key={arch.path}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => abrirArchivo(arch.path)}
                      >
                        <FileDown className="size-3.5" />
                        {arch.nombre || "Archivo"}
                      </Button>
                    ))}
                    {ev.estado_resultante === "cerrada" && (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="size-3.5" />
                        Cerró la tarea
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Formulario de nuevo avance */}
        {puedeResponder ? (
          <form
            onSubmit={handleSubmit}
            className="space-y-3 border-t pt-3"
          >
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Plus className="size-4" />
              Registrar avance
            </h3>

            <div className="space-y-1.5">
              <Label htmlFor="det_act_comentario">
                {reprogramando
                  ? "Motivo de la reprogramación"
                  : `Comentario${cerrandoTarea ? " *" : ""}`}
              </Label>
              <Textarea
                id="det_act_comentario"
                name="observaciones"
                rows={3}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder={
                  reprogramando
                    ? "¿Por qué se reprograma? (opcional)"
                    : cerrandoTarea
                      ? "Obligatorio para cerrar: contá qué se resolvió…"
                      : "Avances, plan de acción, etc."
                }
              />
            </div>

            <div className={reprogramando ? "hidden" : "space-y-1.5"}>
              <Label className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                Adjuntar archivos o fotos (podés pegar con Ctrl+V)
              </Label>
              <AdjuntosInput
                archivos={archivos}
                onChange={setArchivos}
                activo={open}
                disabled={pending}
                accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.ppt,.pptx"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Estado de la actividad *</Label>
              <Select
                value={nuevoEstado}
                onValueChange={(v: string | null) => {
                  if (
                    v === "no_comenzada" ||
                    v === "en_curso" ||
                    v === "cerrada"
                  ) {
                    setNuevoEstado(v)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_comenzada">No comenzada</SelectItem>
                  <SelectItem value="en_curso">En curso</SelectItem>
                  <SelectItem value="cerrada">Cerrada</SelectItem>
                </SelectContent>
              </Select>
              {cerrandoTarea && (
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <Label className="text-xs text-muted-foreground">
                    ¿Cómo se cierra?
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoCierre("definitivo")}
                      disabled={pending}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        tipoCierre === "definitivo"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Cierre definitivo
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoCierre("reprogramar")}
                      disabled={pending}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        tipoCierre === "reprogramar"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Reprogramar
                    </button>
                  </div>

                  {tipoCierre === "definitivo" ? (
                    <p className="text-xs text-amber-700">
                      Para cerrar la actividad es obligatorio escribir un
                      comentario.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ["1w", "+1 semana"],
                            ["1m", "+1 mes"],
                            ["custom", "Fecha"],
                          ] as const
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setReprogPreset(val)}
                            disabled={pending}
                            className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                              reprogPreset === val
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {reprogPreset === "custom" && (
                        <Input
                          type="date"
                          value={reprogCustom}
                          onChange={(e) => setReprogCustom(e.target.value)}
                          disabled={pending}
                        />
                      )}
                      <div className="flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        <CalendarClock className="size-3.5 shrink-0" />
                        <span>
                          La actividad sigue abierta y vence el{" "}
                          <span className="font-semibold">
                            {fechaNueva ? formatFecha(fechaNueva) : "—"}
                          </span>
                          . Queda registrado en el historial.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cerrar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {reprogramando
                  ? "Reprogramar actividad"
                  : cerrandoTarea
                    ? "Cerrar tarea"
                    : "Guardar avance"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
