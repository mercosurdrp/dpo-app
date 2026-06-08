"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Lock,
  MessageSquare,
  Paperclip,
  Send,
  Download,
  History,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  cambiarEstadoComunicacion,
  asignarComunicacion,
  addComentarioComunicacion,
} from "@/actions/portal-comunicaciones"
import {
  COMUNICACION_CATEGORIA_LABELS,
  COMUNICACION_PRIORIDAD_LABELS,
  COMUNICACION_PRIORIDAD_COLORS,
  COMUNICACION_ESTADO_LABELS,
  COMUNICACION_ESTADO_COLORS,
  COMUNICACION_ESTADO_ORDEN,
  type ComunicacionDetalle,
  type ComunicacionEstado,
} from "@/types/database"

export function ComunicacionDetailClient({
  comunicacion,
  canManage,
  asignables,
}: {
  comunicacion: ComunicacionDetalle
  canManage: boolean
  asignables: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [comentario, setComentario] = useState("")
  const [interno, setInterno] = useState(false)

  function cambiarEstado(estado: ComunicacionEstado) {
    startTransition(async () => {
      const res = await cambiarEstadoComunicacion(comunicacion.id, estado)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Estado actualizado")
        router.refresh()
      }
    })
  }

  function asignar(value: string | null) {
    const asignadoA = !value || value === "none" ? null : value
    startTransition(async () => {
      const res = await asignarComunicacion(comunicacion.id, asignadoA)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Responsable actualizado")
        router.refresh()
      }
    })
  }

  function enviarComentario() {
    if (!comentario.trim()) return
    startTransition(async () => {
      const res = await addComentarioComunicacion(comunicacion.id, comentario, interno)
      if ("error" in res) toast.error(res.error)
      else {
        setComentario("")
        setInterno(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      <Link href="/portal/comunicaciones" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" />
        Volver al buzón
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-400">#{comunicacion.numero}</span>
                <Badge variant="secondary">{COMUNICACION_CATEGORIA_LABELS[comunicacion.categoria]}</Badge>
                <Badge
                  variant="secondary"
                  style={{
                    backgroundColor: COMUNICACION_PRIORIDAD_COLORS[comunicacion.prioridad] + "20",
                    color: COMUNICACION_PRIORIDAD_COLORS[comunicacion.prioridad],
                  }}
                >
                  Prioridad {COMUNICACION_PRIORIDAD_LABELS[comunicacion.prioridad]}
                </Badge>
                <Badge
                  variant="secondary"
                  style={{
                    backgroundColor: COMUNICACION_ESTADO_COLORS[comunicacion.estado] + "20",
                    color: COMUNICACION_ESTADO_COLORS[comunicacion.estado],
                  }}
                >
                  {COMUNICACION_ESTADO_LABELS[comunicacion.estado]}
                </Badge>
              </div>
              <CardTitle className="mt-2 text-xl">{comunicacion.titulo}</CardTitle>
              <p className="text-xs text-slate-400">
                Enviada el {new Date(comunicacion.created_at).toLocaleString("es-AR")} · {comunicacion.autor_nombre}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{comunicacion.cuerpo}</p>

              {comunicacion.adjuntos.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Paperclip className="size-4" /> Adjuntos
                  </p>
                  <ul className="space-y-1">
                    {comunicacion.adjuntos.map((a) => (
                      <li key={a.id}>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={a.nombre_original}
                          className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-slate-700 hover:bg-muted/40"
                        >
                          <Download className="size-4 shrink-0 text-slate-400" />
                          <span className="truncate">{a.nombre_original}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seguimiento / comentarios */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4" /> Seguimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comunicacion.comentarios.length === 0 ? (
                <p className="text-sm text-slate-400">Sin respuestas todavía.</p>
              ) : (
                <ul className="space-y-3">
                  {comunicacion.comentarios.map((c) => (
                    <li
                      key={c.id}
                      className={`rounded-md border p-3 text-sm ${c.interno ? "border-amber-200 bg-amber-50" : "bg-muted/20"}`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{c.autor_nombre}</span>
                        <span>{new Date(c.created_at).toLocaleString("es-AR")}</span>
                        {c.interno && (
                          <Badge variant="outline" className="gap-1 text-amber-600">
                            <Lock className="size-3" /> Interno
                          </Badge>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-slate-700">{c.texto}</p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 border-t pt-3">
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={2}
                  placeholder="Escribí una respuesta..."
                />
                <div className="flex items-center justify-between">
                  {canManage ? (
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <Checkbox checked={interno} onCheckedChange={(v) => setInterno(!!v)} />
                      Nota interna (no visible al autor)
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button size="sm" onClick={enviarComentario} disabled={isPending || !comentario.trim()}>
                    <Send className="mr-2 size-4" />
                    Enviar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gestión</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Estado</Label>
                  <Select value={comunicacion.estado} onValueChange={(v) => cambiarEstado((v ?? comunicacion.estado) as ComunicacionEstado)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMUNICACION_ESTADO_ORDEN.map((e) => (
                        <SelectItem key={e} value={e}>
                          {COMUNICACION_ESTADO_LABELS[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Responsable</Label>
                  <Select value={comunicacion.asignado_a ?? "none"} onValueChange={asignar}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {asignables.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" /> Historial
              </CardTitle>
            </CardHeader>
            <CardContent>
              {comunicacion.historial.length === 0 ? (
                <p className="text-sm text-slate-400">Sin cambios de estado registrados.</p>
              ) : (
                <ol className="space-y-3">
                  {comunicacion.historial.map((h) => (
                    <li key={h.id} className="flex items-start gap-2 text-sm">
                      <span
                        className="mt-1 size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: COMUNICACION_ESTADO_COLORS[h.estado_nuevo] }}
                      />
                      <div>
                        <p className="text-slate-700">
                          {h.estado_anterior ? `${COMUNICACION_ESTADO_LABELS[h.estado_anterior]} → ` : ""}
                          <span className="font-medium">{COMUNICACION_ESTADO_LABELS[h.estado_nuevo]}</span>
                        </p>
                        <p className="text-xs text-slate-400">{new Date(h.changed_at).toLocaleString("es-AR")}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
