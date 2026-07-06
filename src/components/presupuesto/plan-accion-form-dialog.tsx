"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Loader2, Paperclip, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import {
  crearPlanAccion,
  actualizarPlanAccion,
} from "@/actions/presupuesto-planes-accion"
import type {
  EstadoPlanAccion,
  PlanAccionPresupuestoConDetalle,
  PresupuestoTareaConResponsable,
} from "@/types/database"
import { ESTADO_PLAN_OPCIONES, MESES_CORTOS } from "./planes-accion-constantes"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  anio: number
  plan?: PlanAccionPresupuestoConDetalle | null
  responsables: ResponsableOpt[]
  tareas: PresupuestoTareaConResponsable[]
  onSaved: () => void
}

const SIN_TAREA = "__sin__"

/** Nombre legible de un adjunto ya subido (quita el prefijo timestamp del path). */
function nombreAdjunto(url: string): string {
  const base = decodeURIComponent(url.split("/").pop() ?? "adjunto")
  return base.replace(/^\d{10,}-/, "")
}

export function PlanAccionFormDialog({
  open,
  onOpenChange,
  anio,
  plan,
  responsables,
  tareas,
  onSaved,
}: Props) {
  const editing = !!plan
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [estado, setEstado] = useState<EstadoPlanAccion>(
    plan?.estado ?? "abierto",
  )
  const [responsableId, setResponsableId] = useState<string>(
    plan?.responsable_id ?? "",
  )
  const [tareaId, setTareaId] = useState<string>(plan?.tarea_id ?? SIN_TAREA)

  // Adjuntos: los ya subidos que se conservan + los nuevos a subir
  const [adjuntosExistentes, setAdjuntosExistentes] = useState<string[]>(
    plan?.adjunto_urls ?? [],
  )
  const [nuevosAdjuntos, setNuevosAdjuntos] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setEstado(plan?.estado ?? "abierto")
      setResponsableId(plan?.responsable_id ?? "")
      setTareaId(plan?.tarea_id ?? SIN_TAREA)
      setAdjuntosExistentes(plan?.adjunto_urls ?? [])
      setNuevosAdjuntos([])
      setError(null)
    }
  }, [open, plan])

  function agregarArchivos(files: File[]) {
    if (!files.length) return
    setNuevosAdjuntos((prev) => [...prev, ...files])
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imagenes: File[] = []
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue
      const file = item.getAsFile()
      if (!file) continue
      const ext = file.type.split("/")[1] || "png"
      const stamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14)
      imagenes.push(
        new File([file], `captura-${stamp}.${ext}`, { type: file.type }),
      )
    }
    if (imagenes.length) {
      e.preventDefault()
      agregarArchivos(imagenes)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("anio", String(anio))
    formData.set("estado", estado)
    if (responsableId) formData.set("responsable_id", responsableId)
    else formData.delete("responsable_id")
    if (tareaId && tareaId !== SIN_TAREA) formData.set("tarea_id", tareaId)
    else formData.delete("tarea_id")

    for (const file of nuevosAdjuntos) formData.append("adjuntos", file)
    if (editing)
      formData.set("adjuntos_existentes", JSON.stringify(adjuntosExistentes))

    startTransition(async () => {
      const result = editing
        ? await actualizarPlanAccion(plan!.id, formData)
        : await crearPlanAccion(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Editar plan de acción"
              : `Nuevo plan de acción — ${anio}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              name="titulo"
              defaultValue={plan?.titulo ?? ""}
              placeholder="Ej. Sobrecosto en contratación de flota"
              required
            />
          </div>

          {/* Vínculo a la tarea de análisis del desvío */}
          <div className="space-y-1.5">
            <Label>Tarea de análisis vinculada</Label>
            <Select
              value={tareaId}
              onValueChange={(v: string | null) => setTareaId(v ?? SIN_TAREA)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin vincular" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_TAREA}>Sin vincular</SelectItem>
                {tareas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {MESES_CORTOS[t.mes - 1]} · {t.rubro}
                    {t.desvio_pct !== null
                      ? ` (${t.desvio_pct > 0 ? "+" : ""}${t.desvio_pct.toFixed(1)}%)`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Colgá el plan del desvío que se está analizando en el presupuesto
              del año {anio}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desvio_detectado">Desvío detectado</Label>
            <Textarea
              id="desvio_detectado"
              name="desvio_detectado"
              rows={2}
              defaultValue={plan?.desvio_detectado ?? ""}
              placeholder="Qué desvío significativo se detectó y por qué hay que trabajarlo…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="causa_raiz">Causa raíz</Label>
            <Textarea
              id="causa_raiz"
              name="causa_raiz"
              rows={2}
              defaultValue={plan?.causa_raiz ?? ""}
              placeholder="Por qué se produjo el desvío (análisis de causa)…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v: string | null) => setResponsableId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha_limite">Fecha límite</Label>
              <Input
                id="fecha_limite"
                name="fecha_limite"
                type="date"
                defaultValue={plan?.fecha_limite ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              value={estado}
              onValueChange={(v: string | null) =>
                setEstado((v as EstadoPlanAccion) ?? "abierto")
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADO_PLAN_OPCIONES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              rows={2}
              defaultValue={plan?.observaciones ?? ""}
            />
          </div>

          {/* Adjuntos */}
          <div className="space-y-1.5">
            <Label>Archivos adjuntos</Label>
            <div
              tabIndex={0}
              onPaste={handlePaste}
              className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {(adjuntosExistentes.length > 0 || nuevosAdjuntos.length > 0) && (
                <ul className="space-y-1">
                  {adjuntosExistentes.map((url) => (
                    <li
                      key={url}
                      className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm"
                    >
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-1.5 text-blue-600 hover:underline"
                      >
                        <Paperclip className="size-3.5 shrink-0" />
                        <span className="truncate">{nombreAdjunto(url)}</span>
                      </a>
                      <button
                        type="button"
                        title="Quitar adjunto"
                        onClick={() =>
                          setAdjuntosExistentes((prev) =>
                            prev.filter((u) => u !== url),
                          )
                        }
                        className="shrink-0 text-slate-400 hover:text-red-600"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                  {nuevosAdjuntos.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-blue-50 px-2 py-1 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                        <Paperclip className="size-3.5 shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          (nuevo)
                        </span>
                      </span>
                      <button
                        type="button"
                        title="Quitar adjunto"
                        onClick={() =>
                          setNuevosAdjuntos((prev) =>
                            prev.filter((_, j) => j !== i),
                          )
                        }
                        className="shrink-0 text-slate-400 hover:text-red-600"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="mr-1.5 size-3.5" />
                  Agregar archivos
                </Button>
                <span className="text-xs text-muted-foreground">
                  o pegá una captura con Ctrl+V
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  agregarArchivos(Array.from(e.target.files ?? []))
                  e.target.value = ""
                }}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {editing ? "Guardar cambios" : "Crear plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
