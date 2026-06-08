"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Lock,
  MessageSquare,
  Paperclip,
  Send,
  Upload,
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
import { createClient } from "@/lib/supabase/client"
import {
  cambiarEstadoTicket,
  asignarTicket,
  addComentario,
} from "@/actions/portal-servicios"
import {
  SG_CATEGORIA_LABELS,
  SG_ESTADO_LABELS,
  SG_ESTADO_COLORS,
  SG_ESTADO_ORDEN,
  type SgTicketDetalle,
  type SgEstado,
} from "@/types/database"

const BUCKET = "portal-servicios"

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120)
}

export function TicketDetailClient({
  ticket,
  canManage,
  asignables,
}: {
  ticket: SgTicketDetalle
  canManage: boolean
  asignables: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [comentario, setComentario] = useState("")
  const [interno, setInterno] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const evidenciaRef = useRef<HTMLInputElement | null>(null)

  const imagenes = ticket.adjuntos.filter((a) => !a.es_evidencia)
  const evidencias = ticket.adjuntos.filter((a) => a.es_evidencia)

  function cambiarEstado(estado: SgEstado) {
    startTransition(async () => {
      const res = await cambiarEstadoTicket(ticket.id, estado)
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
      const res = await asignarTicket(ticket.id, asignadoA)
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
      const res = await addComentario(ticket.id, comentario, interno)
      if ("error" in res) toast.error(res.error)
      else {
        setComentario("")
        setInterno(false)
        router.refresh()
      }
    })
  }

  async function subirEvidencia(files: FileList | null) {
    if (!files || files.length === 0) return
    setSubiendo(true)
    try {
      const supabase = createClient()
      const rows: Record<string, unknown>[] = []
      const paths: string[] = []
      for (const file of Array.from(files)) {
        const path = `${ticket.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name || "evidencia")}`
        const mime = file.type || "application/octet-stream"
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: mime,
          upsert: false,
        })
        if (error) {
          if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
          throw new Error(error.message)
        }
        paths.push(path)
        rows.push({
          ticket_id: ticket.id,
          storage_path: path,
          nombre_original: file.name || "evidencia",
          mime_type: mime,
          "tamaño_bytes": file.size,
          es_evidencia: true,
        })
      }
      const { error } = await supabase.from("sg_ticket_adjuntos").insert(rows)
      if (error) {
        await supabase.storage.from(BUCKET).remove(paths)
        throw new Error(error.message)
      }
      toast.success("Evidencia subida")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error subiendo evidencia")
    } finally {
      setSubiendo(false)
      if (evidenciaRef.current) evidenciaRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/portal/servicios" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" />
        Volver
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-400">#{ticket.numero}</span>
                <Badge variant="secondary">{SG_CATEGORIA_LABELS[ticket.categoria]}</Badge>
                <Badge
                  variant="secondary"
                  style={{
                    backgroundColor: SG_ESTADO_COLORS[ticket.estado] + "20",
                    color: SG_ESTADO_COLORS[ticket.estado],
                  }}
                >
                  {SG_ESTADO_LABELS[ticket.estado]}
                </Badge>
              </div>
              <CardTitle className="mt-2 text-xl">{ticket.titulo}</CardTitle>
              <p className="text-xs text-slate-400">
                Creada el {new Date(ticket.created_at).toLocaleString("es-AR")} · {ticket.autor_nombre}
                {ticket.sector ? ` · ${ticket.sector}` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {ticket.descripcion}
              </p>

              {imagenes.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Paperclip className="size-4" /> Imágenes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {imagenes.map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                        {a.mime_type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt={a.nombre_original} className="size-24 rounded-md border object-cover" />
                        ) : (
                          <span className="flex size-24 items-center justify-center rounded-md border bg-muted/30 p-2 text-center text-xs text-slate-500">
                            {a.nombre_original}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {evidencias.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Evidencias de resolución</p>
                  <div className="flex flex-wrap gap-2">
                    {evidencias.map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                        {a.mime_type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt={a.nombre_original} className="size-24 rounded-md border object-cover" />
                        ) : (
                          <span className="flex size-24 items-center justify-center rounded-md border bg-muted/30 p-2 text-center text-xs text-slate-500">
                            {a.nombre_original}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comentarios */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4" /> Seguimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.comentarios.length === 0 ? (
                <p className="text-sm text-slate-400">Sin comentarios todavía.</p>
              ) : (
                <ul className="space-y-3">
                  {ticket.comentarios.map((c) => (
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
                  placeholder="Escribí un comentario..."
                />
                <div className="flex items-center justify-between">
                  {canManage ? (
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <Checkbox checked={interno} onCheckedChange={(v) => setInterno(!!v)} />
                      Comentario interno (no visible al solicitante)
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
          {/* Gestión admin */}
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gestión</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Estado</Label>
                  <Select value={ticket.estado} onValueChange={(v) => cambiarEstado((v ?? ticket.estado) as SgEstado)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SG_ESTADO_ORDEN.map((e) => (
                        <SelectItem key={e} value={e}>
                          {SG_ESTADO_LABELS[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Responsable</Label>
                  <Select value={ticket.asignado_a ?? "none"} onValueChange={asignar}>
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
                <div>
                  <Label>Evidencia de resolución</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 w-full"
                    onClick={() => evidenciaRef.current?.click()}
                    disabled={subiendo}
                  >
                    <Upload className="mr-2 size-4" />
                    {subiendo ? "Subiendo..." : "Subir evidencia"}
                  </Button>
                  <input
                    ref={evidenciaRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => subirEvidencia(e.target.files)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historial */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" /> Historial
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.historial.length === 0 ? (
                <p className="text-sm text-slate-400">Sin cambios de estado registrados.</p>
              ) : (
                <ol className="space-y-3">
                  {ticket.historial.map((h) => (
                    <li key={h.id} className="flex items-start gap-2 text-sm">
                      <span
                        className="mt-1 size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: SG_ESTADO_COLORS[h.estado_nuevo] }}
                      />
                      <div>
                        <p className="text-slate-700">
                          {h.estado_anterior ? `${SG_ESTADO_LABELS[h.estado_anterior]} → ` : ""}
                          <span className="font-medium">{SG_ESTADO_LABELS[h.estado_nuevo]}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(h.changed_at).toLocaleString("es-AR")}
                        </p>
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
