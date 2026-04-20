"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckCircle2,
  ClipboardList,
  Paperclip,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import {
  deleteReportePlan,
  marcarReportePlanCompletado,
  upsertReportePlan,
} from "@/actions/reportes-seguridad"
import type { ReporteSeguridadPlanConFoto } from "@/types/database"

const BUCKET = "reportes-seguridad"
const MAX_FILE_BYTES = 25 * 1024 * 1024

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PlanAccionSection({
  reporteId,
  plan,
  isAdmin,
  onChanged,
}: {
  reporteId: string
  plan: ReporteSeguridadPlanConFoto | null
  isAdmin: boolean
  onChanged: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(!plan && isAdmin)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [descripcion, setDescripcion] = useState<string>(plan?.descripcion ?? "")
  const [fechaPlanificada, setFechaPlanificada] = useState<string>(
    plan?.fecha_planificada ?? ""
  )
  const [foto, setFoto] = useState<File | null>(null)
  const [quitarFoto, setQuitarFoto] = useState(false)

  const completado = !!plan?.fecha_completado

  function openEdit() {
    setDescripcion(plan?.descripcion ?? "")
    setFechaPlanificada(plan?.fecha_planificada ?? "")
    setFoto(null)
    setQuitarFoto(false)
    setEditing(true)
  }

  function cancelEdit() {
    if (!plan) return // si no había plan, no hay nada a cancelar
    setEditing(false)
    setFoto(null)
    setQuitarFoto(false)
  }

  async function uploadFotoIfNeeded(): Promise<string | undefined> {
    if (!foto) return undefined
    const supabase = createClient()
    const safe = sanitizeFileName(foto.name || "foto")
    const path = `${reporteId}/plan/${crypto.randomUUID()}-${safe}`
    const mime = foto.type || "application/octet-stream"
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, foto, { contentType: mime, upsert: false })
    if (error) throw new Error(error.message)
    return path
  }

  function handleSave() {
    if (!descripcion.trim()) {
      toast.error("Ingresá una descripción")
      return
    }
    if (foto && foto.size > MAX_FILE_BYTES) {
      toast.error("La foto supera 25MB")
      return
    }
    startTransition(async () => {
      try {
        let foto_path: string | null | undefined
        if (foto) {
          foto_path = await uploadFotoIfNeeded()
        } else if (quitarFoto) {
          foto_path = null
        } else {
          foto_path = undefined // conservar la existente
        }

        const res = await upsertReportePlan(reporteId, {
          descripcion,
          fecha_planificada: fechaPlanificada || null,
          ...(foto_path === undefined ? {} : { foto_path }),
        })
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        toast.success("Plan guardado")
        setEditing(false)
        setFoto(null)
        setQuitarFoto(false)
        onChanged()
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error guardando plan")
      }
    })
  }

  function handleToggleCompletado() {
    if (!plan) return
    startTransition(async () => {
      const res = await marcarReportePlanCompletado(reporteId, !completado)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(completado ? "Plan reabierto" : "Plan marcado como terminado")
      onChanged()
      router.refresh()
    })
  }

  function handleDelete() {
    if (!plan) return
    if (!confirm("¿Eliminar el plan de acción?")) return
    startTransition(async () => {
      const res = await deleteReportePlan(reporteId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Plan eliminado")
      onChanged()
      router.refresh()
    })
  }

  const header = (
    <div className="flex items-center gap-2">
      <ClipboardList className="size-4 text-slate-600" />
      <h3 className="text-sm font-semibold text-slate-800">Plan de acción</h3>
      {completado && (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="mr-1 size-3" />
          Terminado
        </Badge>
      )}
      {!completado && plan && (
        <Badge variant="secondary" className="bg-amber-100 text-amber-700">
          En curso
        </Badge>
      )}
    </div>
  )

  // Vista sin plan + no editando
  if (!plan && !editing) {
    return (
      <div className="space-y-2 rounded-md border bg-muted/10 p-3">
        {header}
        <p className="text-xs text-muted-foreground">
          Sin plan de acción registrado.
        </p>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Crear plan de acción
          </Button>
        )}
      </div>
    )
  }

  // Modo edición
  if (editing && isAdmin) {
    return (
      <div className="space-y-3 rounded-md border bg-muted/10 p-3">
        {header}
        <div>
          <Label className="text-xs">¿Cómo se aborda? *</Label>
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Describí la acción que se va a tomar"
          />
        </div>
        <div>
          <Label className="text-xs">Fecha planificada de resolución</Label>
          <Input
            type="date"
            value={fechaPlanificada}
            onChange={(e) => setFechaPlanificada(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Foto (opcional, máx 25MB)</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              <Paperclip className="mr-2 size-4" />
              {foto ? "Cambiar foto" : "Seleccionar foto"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setFoto(f)
                  setQuitarFoto(false)
                }
                if (fileInputRef.current) fileInputRef.current.value = ""
              }}
            />
            {foto && (
              <span className="truncate text-xs text-muted-foreground">
                {foto.name}
              </span>
            )}
          </div>
          {plan?.foto_url && !foto && !quitarFoto && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={plan.foto_url}
                alt="Foto actual"
                className="h-20 w-20 rounded object-cover"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuitarFoto(true)}
              >
                <X className="mr-1 size-3" />
                Quitar foto actual
              </Button>
            </div>
          )}
          {quitarFoto && (
            <p className="text-xs text-amber-700">
              Se quitará la foto al guardar.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setQuitarFoto(false)}
              >
                Deshacer
              </button>
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          {plan && (
            <Button
              variant="outline"
              size="sm"
              onClick={cancelEdit}
              disabled={isPending}
            >
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    )
  }

  // Vista con plan existente (no editando)
  if (plan) {
    return (
      <div className="space-y-3 rounded-md border bg-muted/10 p-3">
        {header}

        <div>
          <Label className="text-xs text-muted-foreground">
            ¿Cómo se aborda?
          </Label>
          <p className="mt-1 whitespace-pre-wrap rounded-md bg-white p-2 text-sm">
            {plan.descripcion}
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {plan.fecha_planificada && (
            <span>Planificado para: {formatDate(plan.fecha_planificada)}</span>
          )}
          {plan.fecha_completado && (
            <span className="text-emerald-700">
              Terminado: {formatDateTime(plan.fecha_completado)}
            </span>
          )}
        </div>

        {plan.foto_url && (
          <a
            href={plan.foto_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-fit overflow-hidden rounded-md border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={plan.foto_url}
              alt="Foto del plan"
              className="h-32 w-auto object-cover"
            />
          </a>
        )}

        {isAdmin && (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={openEdit}
              disabled={isPending}
            >
              <Pencil className="mr-2 size-4" />
              Editar
            </Button>
            <Button
              variant={completado ? "outline" : "default"}
              size="sm"
              onClick={handleToggleCompletado}
              disabled={isPending}
            >
              {completado ? (
                <>
                  <RotateCcw className="mr-2 size-4" />
                  Reabrir
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  Marcar terminado
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="mr-2 size-4" />
              Eliminar
            </Button>
          </div>
        )}
      </div>
    )
  }

  return null
}
