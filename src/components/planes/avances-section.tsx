"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  agregarAvancePlan,
  eliminarAvancePlan,
  getAvancePlanSignedUrl,
  listarAvancesPlan,
  type PlanAvanceConAutor,
} from "@/actions/plan-avances"
import { ESTADO_PLAN_COLORS, ESTADO_PLAN_LABELS } from "@/lib/constants"
import type {
  EstadoPlan,
  HerramientaGestionConContexto,
  PlanComentarioConAutor,
  PlanHistorialConAutor,
  PlanReprogramacionConAutor,
} from "@/types/database"
import { IS_MISIONES } from "@/lib/empresa"
import { listarHerramientasPlan } from "@/actions/herramientas-gestion"
import { HerramientaGestionDialog } from "@/components/herramientas-gestion/herramienta-gestion-dialog"
import { HerramientaGestionView } from "@/components/herramientas-gestion/herramienta-gestion-view"
import { HERRAMIENTA_GESTION_LABELS } from "@/lib/herramientas-gestion"

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"]
function esImagen(mime: string | null, nombre: string | null): boolean {
  if (mime?.startsWith("image/")) return true
  if (!nombre) return false
  const ext = nombre.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_EXTS.includes(ext)
}

function initials(name: string | null | undefined): string {
  if (!name) return "??"
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return ""
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—"
  try {
    return format(new Date(iso + "T00:00:00"), "dd/MM/yyyy")
  } catch {
    return iso
  }
}

// Línea de tiempo unificada (Action Log): avances + comentarios legacy +
// cambios de estado + reprogramaciones, todo ordenado cronológicamente.
type TimelineItem =
  | { key: string; at: number; type: "avance"; a: PlanAvanceConAutor }
  | { key: string; at: number; type: "comentario"; c: PlanComentarioConAutor }
  | { key: string; at: number; type: "estado"; h: PlanHistorialConAutor }
  | { key: string; at: number; type: "reprog"; r: PlanReprogramacionConAutor }

type Resultado = "igual" | "en_progreso" | "completado"
type TipoCierre = "definitivo" | "reprogramar"
type RepetPreset = "15d" | "1m" | "custom"

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function plusDays(days: number): string {
  return ymd(new Date(Date.now() + days * 86400000))
}

interface Props {
  planId: string
  avancesIniciales: PlanAvanceConAutor[]
  comentarios?: PlanComentarioConAutor[]
  historial?: PlanHistorialConAutor[]
  reprogramaciones?: PlanReprogramacionConAutor[]
  estadoActual: EstadoPlan
  puedeIntervenir: boolean
  /** Título/descripción del plan, para prellenar la herramienta de gestión. */
  planTitulo?: string
  /** Se llama tras una respuesta que cambia el estado, para refrescar el padre. */
  onChanged?: () => void
}

export function AvancesSection({
  planId,
  avancesIniciales,
  comentarios = [],
  historial = [],
  reprogramaciones = [],
  estadoActual,
  puedeIntervenir,
  planTitulo,
  onChanged,
}: Props) {
  const router = useRouter()
  const [avances, setAvances] = useState(avancesIniciales)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, startSubmit] = useTransition()
  const [comentario, setComentario] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [resultado, setResultado] = useState<Resultado>("igual")
  const [tipoCierre, setTipoCierre] = useState<TipoCierre>("definitivo")
  const [repetPreset, setRepetPreset] = useState<RepetPreset>("15d")
  const [repetCustom, setRepetCustom] = useState<string>(plusDays(15))
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [lightbox, setLightbox] = useState<{
    url: string
    titulo: string
  } | null>(null)
  const [toolDialogOpen, setToolDialogOpen] = useState(false)
  const [herramientas, setHerramientas] = useState<
    HerramientaGestionConContexto[]
  >([])
  const [verHerramienta, setVerHerramienta] =
    useState<HerramientaGestionConContexto | null>(null)

  // Herramientas de gestión aplicadas a este plan (solo Pampeana).
  useEffect(() => {
    if (IS_MISIONES || !planId) return
    listarHerramientasPlan(planId).then((r) => {
      if ("data" in r) setHerramientas(r.data)
    })
  }, [planId])

  function recargarHerramientas() {
    listarHerramientasPlan(planId).then((r) => {
      if ("data" in r) setHerramientas(r.data)
    })
  }

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []
    for (const a of avances) {
      items.push({
        key: `a-${a.id}`,
        at: new Date(a.created_at).getTime(),
        type: "avance",
        a,
      })
    }
    for (const c of comentarios) {
      items.push({
        key: `c-${c.id}`,
        at: new Date(c.created_at).getTime(),
        type: "comentario",
        c,
      })
    }
    for (const h of historial) {
      items.push({
        key: `h-${h.id}`,
        at: new Date(h.changed_at).getTime(),
        type: "estado",
        h,
      })
    }
    for (const r of reprogramaciones) {
      items.push({
        key: `r-${r.id}`,
        at: new Date(r.reprogramado_at).getTime(),
        type: "reprog",
        r,
      })
    }
    return items.sort((x, y) => y.at - x.at)
  }, [avances, comentarios, historial, reprogramaciones])

  useEffect(() => {
    const pendientes = avances.filter(
      (a) =>
        a.archivo_path &&
        esImagen(a.archivo_mime, a.archivo_nombre) &&
        !imageUrls[a.id],
    )
    if (pendientes.length === 0) return
    let cancelled = false
    ;(async () => {
      const updates: Record<string, string> = {}
      for (const a of pendientes) {
        if (!a.archivo_path) continue
        const r = await getAvancePlanSignedUrl(a.archivo_path)
        if ("data" in r) updates[a.id] = r.data.url
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setImageUrls((prev) => ({ ...prev, ...updates }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [avances, imageUrls])

  useEffect(() => {
    if (!dialogOpen) return
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      const items = Array.from(e.clipboardData.items)
      const img = items.find((it) => it.type.startsWith("image/"))
      if (!img) return
      const blob = img.getAsFile()
      if (!blob) return
      const ext = blob.type.split("/")[1] || "png"
      const file = new File([blob], `captura-${Date.now()}.${ext}`, {
        type: blob.type,
      })
      setArchivo(file)
      toast.success("Captura pegada como archivo")
      e.preventDefault()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [dialogOpen])

  const fechaSeguimiento =
    repetPreset === "15d"
      ? plusDays(15)
      : repetPreset === "1m"
        ? plusDays(30)
        : repetCustom

  function resetForm() {
    setComentario("")
    setArchivo(null)
    setResultado("igual")
    setTipoCierre("definitivo")
    setRepetPreset("15d")
    setRepetCustom(plusDays(15))
  }

  async function handleAbrirArchivo(path: string) {
    const r = await getAvancePlanSignedUrl(path)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    window.open(r.data.url, "_blank")
  }

  async function refrescarAvances() {
    const r = await listarAvancesPlan(planId)
    if ("data" in r) setAvances(r.data)
  }

  async function handleSubmit() {
    if (!comentario.trim() && !archivo) {
      toast.error("Respondé con un comentario o adjuntá un archivo")
      return
    }
    if (resultado === "completado" && tipoCierre === "reprogramar" && !fechaSeguimiento) {
      toast.error("Elegí la fecha de la tarea repetida")
      return
    }
    const fd = new FormData()
    fd.append("comentario", comentario.trim())
    if (archivo) fd.append("archivo", archivo)
    if (resultado !== "igual") fd.append("nuevo_estado", resultado)
    if (resultado === "completado" && tipoCierre === "reprogramar" && fechaSeguimiento) {
      fd.append("seguimiento_fecha", fechaSeguimiento)
    }
    startSubmit(async () => {
      const r = await agregarAvancePlan(planId, fd)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      await refrescarAvances()
      setDialogOpen(false)
      resetForm()
      if (r.seguimientoId) {
        toast.success("Tarea cerrada · tarea repetida creada")
        router.push(`/planes/${r.seguimientoId}`)
      } else {
        toast.success(
          resultado === "completado" ? "Tarea cerrada" : "Avance registrado",
        )
        onChanged?.()
      }
    })
  }

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este avance? No se puede deshacer.")) return
    const r = await eliminarAvancePlan(id)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success("Avance eliminado")
    setAvances((prev) => prev.filter((a) => a.id !== id))
  }

  const planCerrado = estadoActual === "completado"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Respuestas ({timeline.length})
          </span>
          {puedeIntervenir && !planCerrado && (
            <span className="flex items-center gap-2">
              {!IS_MISIONES && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setToolDialogOpen(true)}
                >
                  <Wrench className="mr-1 h-4 w-4" />
                  Herramienta de gestión
                </Button>
              )}
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Responder
              </Button>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t pt-4">
        {herramientas.length > 0 && (
          <details
            className="mb-4 rounded-md border border-slate-200 bg-slate-50/60 p-3"
            open
          >
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Herramientas de gestión aplicadas ({herramientas.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {herramientas.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {HERRAMIENTA_GESTION_LABELS[h.tipo]}
                    </Badge>
                    <span className="truncate text-sm text-slate-700">
                      {h.titulo || "—"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setVerHerramienta(h)}
                  >
                    Ver
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {timeline.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Sin respuestas todavía.
            {puedeIntervenir && !planCerrado
              ? ' Usá "Responder" para sumar una observación, archivo o foto.'
              : ""}
          </p>
        ) : (
          <ol className="space-y-4">
            {timeline.map((item) => {
              if (item.type === "avance") {
                const a = item.a
                const isImg = esImagen(a.archivo_mime, a.archivo_nombre)
                const thumbUrl = imageUrls[a.id]
                return (
                  <li key={item.key} className="flex gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs">
                        {initials(a.autor_nombre)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {a.autor_nombre ?? "—"}
                        </span>
                        <span>·</span>
                        <span
                          title={format(new Date(a.created_at), "Pp", {
                            locale: es,
                          })}
                        >
                          {formatDistanceToNow(new Date(a.created_at), {
                            locale: es,
                            addSuffix: true,
                          })}
                        </span>
                        {a.estado_resultante && (
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px]"
                            style={{
                              backgroundColor:
                                ESTADO_PLAN_COLORS[a.estado_resultante] + "20",
                              color: ESTADO_PLAN_COLORS[a.estado_resultante],
                              borderColor:
                                ESTADO_PLAN_COLORS[a.estado_resultante] + "40",
                            }}
                          >
                            {a.estado_resultante === "completado" && (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            )}
                            {ESTADO_PLAN_LABELS[a.estado_resultante] ??
                              a.estado_resultante}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEliminar(a.id)}
                          className={`text-slate-400 hover:text-red-500 ${
                            a.estado_resultante ? "" : "ml-auto"
                          }`}
                          title="Eliminar avance"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {a.comentario && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                          {a.comentario}
                        </p>
                      )}
                      {a.archivo_path && (
                        <div className="mt-2 flex items-center gap-2">
                          {isImg && thumbUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightbox({
                                  url: thumbUrl,
                                  titulo: a.archivo_nombre ?? "Imagen",
                                })
                              }
                              className="overflow-hidden rounded-md border border-slate-200 transition-opacity hover:opacity-80"
                              title="Ver imagen"
                            >
                              <img
                                src={thumbUrl}
                                alt={a.archivo_nombre ?? ""}
                                className="h-20 w-20 object-cover"
                              />
                            </button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => handleAbrirArchivo(a.archivo_path!)}
                            >
                              {isImg ? (
                                <ImageIcon className="h-3.5 w-3.5" />
                              ) : (
                                <FileText className="h-3.5 w-3.5" />
                              )}
                              {a.archivo_nombre ?? "Descargar archivo"}
                              <Download className="ml-1 h-3 w-3" />
                            </Button>
                          )}
                          {isImg && thumbUrl && (
                            <div className="text-xs text-slate-500">
                              <p className="truncate">{a.archivo_nombre}</p>
                              <p>{formatBytes(a.archivo_bytes)}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                )
              }

              if (item.type === "comentario") {
                const c = item.c
                return (
                  <li key={item.key} className="flex gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs">
                        {initials(c.autor_nombre)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {c.autor_nombre}
                        </span>
                        <span>·</span>
                        <span>
                          {format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}
                        </span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          comentario
                        </Badge>
                      </div>
                      {c.texto && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                          {c.texto}
                        </p>
                      )}
                      {c.foto_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightbox({ url: c.foto_url!, titulo: "Imagen" })
                          }
                          className="mt-2 overflow-hidden rounded-md border border-slate-200 transition-opacity hover:opacity-80"
                          title="Ver imagen"
                        >
                          <img
                            src={c.foto_url}
                            alt="Foto adjunta"
                            className="h-20 w-20 object-cover"
                          />
                        </button>
                      )}
                    </div>
                  </li>
                )
              }

              if (item.type === "estado") {
                const h = item.h
                return (
                  <li key={item.key} className="flex items-center gap-3 text-xs">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <History className="h-4 w-4" />
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{
                          backgroundColor:
                            ESTADO_PLAN_COLORS[h.estado_anterior],
                        }}
                      >
                        {ESTADO_PLAN_LABELS[h.estado_anterior]}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{
                          backgroundColor: ESTADO_PLAN_COLORS[h.estado_nuevo],
                        }}
                      >
                        {ESTADO_PLAN_LABELS[h.estado_nuevo]}
                      </span>
                      <span className="text-slate-500">
                        · {h.autor_nombre} ·{" "}
                        {format(new Date(h.changed_at), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                  </li>
                )
              }

              // reprog
              const r = item.r
              return (
                <li key={item.key} className="flex items-start gap-3 text-xs">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-600">Reprogramó:</span>
                      <span className="rounded bg-white px-1.5 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">
                        {fechaCorta(r.fecha_anterior)}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700 ring-1 ring-blue-200">
                        {fechaCorta(r.fecha_nueva)}
                      </span>
                    </div>
                    {r.motivo && (
                      <p className="mt-1 whitespace-pre-line text-slate-700">
                        {r.motivo}
                      </p>
                    )}
                    <p className="mt-0.5 text-slate-500">
                      {r.autor_nombre} ·{" "}
                      {format(new Date(r.reprogramado_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) resetForm()
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Responder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="avance-comentario">Observación</Label>
              <Textarea
                id="avance-comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Qué se hizo, qué falta, contexto…"
                rows={4}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Archivo o foto (opcional — podés pegar con Ctrl+V)</Label>
              {archivo ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate">{archivo.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {formatBytes(archivo.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setArchivo(null)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 py-4 text-sm text-slate-500 hover:bg-slate-100">
                  <Upload className="h-4 w-4" />
                  Elegí un archivo o pegá una captura
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) setArchivo(f)
                    }}
                  />
                </label>
              )}
            </div>
            {/* Resultado: cambia el estado y, si cierra, definitivo o reprogramar */}
            <div className="space-y-2">
              <Label>Resultado</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["igual", "Dejar como está"],
                    ["en_progreso", "En curso"],
                    ["completado", "Cerrada"],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setResultado(val)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      resultado === val
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {resultado === "completado" && (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <Label className="text-xs text-muted-foreground">
                  ¿Cómo se cierra?
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoCierre("definitivo")}
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
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      tipoCierre === "reprogramar"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Reprogramar
                  </button>
                </div>

                {tipoCierre === "reprogramar" && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["15d", "+15 días"],
                          ["1m", "+1 mes"],
                          ["custom", "Fecha"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setRepetPreset(val)}
                          className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                            repetPreset === val
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {repetPreset === "custom" && (
                      <Input
                        type="date"
                        value={repetCustom}
                        onChange={(e) => setRepetCustom(e.target.value)}
                      />
                    )}
                    <div className="flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Se crea una tarea repetida con vencimiento{" "}
                      <span className="font-semibold">
                        {fechaCorta(fechaSeguimiento)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setDialogOpen(false)
                resetForm()
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {resultado === "completado"
                ? tipoCierre === "reprogramar"
                  ? "Cerrar y repetir"
                  : "Cerrar tarea"
                : "Guardar respuesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={lightbox !== null}
        onOpenChange={(o) => !o && setLightbox(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{lightbox?.titulo ?? "Vista previa"}</DialogTitle>
          </DialogHeader>
          {lightbox && (
            <img
              src={lightbox.url}
              alt={lightbox.titulo}
              className="h-auto max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Ver herramienta de gestión aplicada (solo lectura) */}
      <Dialog
        open={verHerramienta !== null}
        onOpenChange={(o) => !o && setVerHerramienta(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {verHerramienta
                ? HERRAMIENTA_GESTION_LABELS[verHerramienta.tipo]
                : "Herramienta de gestión"}
            </DialogTitle>
          </DialogHeader>
          {verHerramienta && (
            <HerramientaGestionView herramienta={verHerramienta} />
          )}
        </DialogContent>
      </Dialog>

      {/* Aplicar nueva herramienta de gestión (solo Pampeana) */}
      {!IS_MISIONES && (
        <HerramientaGestionDialog
          planId={planId}
          tituloSugerido={planTitulo}
          open={toolDialogOpen}
          onOpenChange={setToolDialogOpen}
          onSaved={recargarHerramientas}
        />
      )}
    </Card>
  )
}
