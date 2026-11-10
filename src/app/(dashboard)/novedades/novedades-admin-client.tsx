"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pin, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { crearNovedad, borrarNovedad } from "@/actions/novedades"
import { NOVEDAD_IMAGEN_MAX_BYTES, type Novedad } from "@/lib/novedades"

function hoyArg(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

function fmt(fecha: string): string {
  const [y, m, d] = fecha.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function NovedadesAdminClient({ novedades }: { novedades: Novedad[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const hoy = hoyArg()

  const publicar = (fd: FormData) => {
    const img = fd.get("imagen")
    if (img instanceof File && img.size > NOVEDAD_IMAGEN_MAX_BYTES) {
      toast.error("La imagen pesa más de 4 MB.")
      return
    }
    fd.set("fijada", fd.get("fijada") === "on" ? "true" : "false")
    startTransition(async () => {
      const res = await crearNovedad(fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Novedad publicada: ya la ven todos en su Inicio")
      formRef.current?.reset()
      setPreview(null)
      router.refresh()
    })
  }

  const borrar = (n: Novedad) => {
    if (!window.confirm(`¿Borrar «${n.titulo}»? Deja de verse para todos.`)) return
    startTransition(async () => {
      const res = await borrarNovedad(n.id)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Novedad borrada")
        router.refresh()
      }
    })
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Publicar una novedad</h2>
          <form ref={formRef} action={publicar} className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-3">
              <div>
                <Label htmlFor="nov-titulo">Título</Label>
                <Input id="nov-titulo" name="titulo" required placeholder="Ej: Cumpleaños de noviembre" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="nov-texto">Texto (opcional)</Label>
                <Textarea id="nov-texto" name="texto" rows={3} className="mt-1" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nov-imagen">Imagen (hasta 4 MB)</Label>
                  <Input
                    id="nov-imagen"
                    name="imagen"
                    type="file"
                    accept="image/*"
                    className="mt-1"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      setPreview(f ? URL.createObjectURL(f) : null)
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="nov-hasta">Se muestra hasta (opcional)</Label>
                  <Input id="nov-hasta" name="vigente_hasta" type="date" min={hoy} className="mt-1" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="fijada" className="size-4 accent-emerald-600" />
                Fijarla primera
              </label>
              <Button type="submit" disabled={pending}>
                {pending ? "Publicando…" : "Publicar para todos"}
              </Button>
            </div>
            <div className="flex items-start justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa" className="max-h-72 rounded" />
              ) : (
                <p className="py-16 text-center text-xs text-muted-foreground">Vista previa de la imagen</p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {novedades.map((n) => {
          const vencida = n.vigente_hasta != null && n.vigente_hasta < hoy
          return (
            <Card key={n.id} className={vencida ? "opacity-60" : ""}>
              {n.imagen_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.imagen_url} alt={n.titulo} className="h-48 w-full rounded-t-xl bg-slate-100 object-cover object-top" />
              )}
              <CardContent className="space-y-1 pt-4">
                <p className="flex items-center gap-1 font-semibold text-slate-900">
                  {n.fijada && <Pin className="size-3.5 text-amber-500" />}
                  {n.titulo}
                </p>
                {n.texto && <p className="line-clamp-3 text-sm text-slate-600">{n.texto}</p>}
                <p className="text-xs text-muted-foreground">
                  {fmt(n.created_at)}
                  {n.autor ? ` · ${n.autor}` : ""}
                  {n.vigente_hasta ? ` · ${vencida ? "venció" : "hasta"} el ${fmt(n.vigente_hasta)}` : " · sin vencimiento"}
                </p>
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => borrar(n)} disabled={pending}>
                    <Trash2 className="mr-1 size-3.5" /> Borrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {novedades.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay novedades publicadas.</p>
        )}
      </div>
    </>
  )
}
