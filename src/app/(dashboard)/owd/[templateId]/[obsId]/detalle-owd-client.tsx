"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import type { ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { CheckCircle2, XCircle, MinusCircle, Trash2, Loader2, ImagePlus } from "lucide-react"
import type { OwdObservacion, OwdRespuesta, OwdItem, OwdRespuestaFoto } from "@/types/database"
import { addOwdFotos, deleteObservacion, getOwdFotoSignedUrl } from "@/actions/owd"
import { comprimirImagen } from "@/lib/comprimir-imagen"

interface Props {
  templateId: string
  observacion: OwdObservacion
  respuestas: OwdRespuesta[]
  items: OwdItem[]
  fotos: OwdRespuestaFoto[]
}

export function DetalleOwdClient({ templateId, observacion, respuestas, items, fotos }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadingItem, setUploadingItem] = useState<string | null>(null)

  // Agregar fotos a esta observación ya guardada (con compresión en el navegador)
  async function handleAddFotos(itemId: string, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (files.length === 0) return
    setUploadingItem(itemId)
    try {
      const fd = new FormData()
      fd.append("observacionId", observacion.id)
      for (const file of files) {
        const comprimida = await comprimirImagen(file).catch(() => file)
        fd.append(`foto__${itemId}`, comprimida)
      }
      const r = await addOwdFotos(fd)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success(`${r.data.agregadas} foto${r.data.agregadas === 1 ? "" : "s"} agregada${r.data.agregadas === 1 ? "" : "s"}`)
      startTransition(() => router.refresh())
    } finally {
      setUploadingItem(null)
    }
  }

  const respMap = useMemo(() => new Map(respuestas.map((r) => [r.item_id, r])), [respuestas])
  const itemsUsados = items.filter((i) => respMap.has(i.id))

  // Fotos de evidencia agrupadas por respuesta_id
  const fotosPorRespuesta = useMemo(() => {
    const map = new Map<string, OwdRespuestaFoto[]>()
    for (const f of fotos) {
      if (!map.has(f.respuesta_id)) map.set(f.respuesta_id, [])
      map.get(f.respuesta_id)!.push(f)
    }
    return map
  }, [fotos])

  // URLs firmadas para mostrar las miniaturas (bucket privado)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const entries = await Promise.all(
        fotos.map(async (f) => {
          const r = await getOwdFotoSignedUrl(f.path)
          return [f.id, "data" in r ? r.data.url : ""] as const
        }),
      )
      if (!cancelado) {
        setSignedUrls(Object.fromEntries(entries.filter(([, url]) => url)))
      }
    })()
    return () => {
      cancelado = true
    }
  }, [fotos])

  const etapas = useMemo(() => {
    const map = new Map<string, OwdItem[]>()
    for (const i of itemsUsados) {
      if (!map.has(i.etapa)) map.set(i.etapa, [])
      map.get(i.etapa)!.push(i)
    }
    return Array.from(map.entries())
  }, [itemsUsados])

  async function handleDelete() {
    setDeleting(true)
    const r = await deleteObservacion(observacion.id)
    setDeleting(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success("OWD eliminada")
    startTransition(() => router.push(`/owd/${templateId}`))
  }

  const pct = Number(observacion.pct_cumplimiento)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Observación OWD</h1>
          <p className="text-sm text-muted-foreground">
            {observacion.fecha} · {observacion.supervisor}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700"
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Eliminar
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Empleado observado</p>
            <p className="font-medium">{observacion.empleado_observado}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rol</p>
            <p className="font-medium">{observacion.rol_empleado || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Dominio</p>
            <p className="font-mono font-medium">{observacion.dominio || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duración</p>
            <p className="font-medium">
              {observacion.duracion_minutos != null ? `${observacion.duracion_minutos} min` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">% Cumplimiento</p>
            <p
              className={`text-2xl font-bold ${
                pct >= 90 ? "text-green-600" : pct >= 75 ? "text-amber-600" : "text-red-600"
              }`}
            >
              {pct.toFixed(1)}%
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" /> {observacion.total_ok} OK
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="h-4 w-4" /> {observacion.total_nook} NO OK
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <MinusCircle className="h-4 w-4" /> {observacion.total_na} N/A
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {etapas.map(([etapa, grupo]) => (
        <Card key={etapa}>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500">{etapa}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {grupo.map((item) => {
              const r = respMap.get(item.id)
              if (!r) return null
              const color =
                r.resultado === "ok"
                  ? "bg-green-100 text-green-700"
                  : r.resultado === "nook"
                  ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-600"
              const label = r.resultado === "ok" ? "OK" : r.resultado === "nook" ? "NO OK" : "N/A"
              const fotosItem = fotosPorRespuesta.get(r.id) ?? []
              return (
                <div key={item.id} className="rounded-md border bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-sm font-medium text-slate-900">{item.texto}</p>
                    <Badge className={`${color} hover:${color}`}>{label}</Badge>
                  </div>
                  {r.comentario && (
                    <p className="mt-1 text-xs text-muted-foreground">{r.comentario}</p>
                  )}
                  {fotosItem.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {fotosItem.map((f) => {
                        const url = signedUrls[f.id]
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                            className="h-16 w-16 overflow-hidden rounded-md border bg-white transition-opacity hover:opacity-90"
                            title={f.nombre ?? "Evidencia"}
                          >
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={url}
                                alt={f.nombre ?? "Evidencia"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                                …
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                    {uploadingItem === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    {uploadingItem === item.id ? "Subiendo…" : "Agregar fotos"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploadingItem !== null}
                      onChange={(e) => handleAddFotos(item.id, e)}
                    />
                  </label>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {(observacion.accion_correctiva || observacion.observaciones) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cierre</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {observacion.accion_correctiva && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Acción correctiva
                </p>
                <p>{observacion.accion_correctiva}</p>
              </div>
            )}
            {observacion.observaciones && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Observaciones
                </p>
                <p>{observacion.observaciones}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar observación</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
