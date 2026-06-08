"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Megaphone, Loader2, Upload, Trash2, ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getAccionesComerciales,
  subirAccionComercial,
  eliminarAccionComercial,
  type AccionComercial,
} from "@/actions/reuniones-acciones-comerciales"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable } from "@/types/database"

export const SECCION_ACCIONES_COMERCIALES = "acciones_comerciales"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

export function SeccionAccionesComerciales({
  reunionId,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  reunionId: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [items, setItems] = useState<AccionComercial[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendiente, startPend] = useTransition()
  const [descripcion, setDescripcion] = useState("")
  const [reload, setReload] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    void getAccionesComerciales(reunionId).then((res) => {
      if (cancel) return
      setItems("error" in res ? [] : res.data)
      if ("error" in res) toast.error(res.error)
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [reunionId, reload])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.set("reunion_id", reunionId)
    fd.set("descripcion", descripcion)
    fd.set("foto", file)
    startPend(async () => {
      const res = await subirAccionComercial(fd)
      if (fileRef.current) fileRef.current.value = ""
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Slide subida")
      setDescripcion("")
      setReload((k) => k + 1)
    })
  }

  function borrar(id: string) {
    if (!confirm("¿Eliminar esta slide?")) return
    startPend(async () => {
      const res = await eliminarAccionComercial(id)
      if (res && "error" in res) {
        toast.error(res.error)
        return
      }
      setReload((k) => k + 1)
    })
  }

  return (
    <Card className="border-rose-200 bg-rose-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-rose-900">
          <Megaphone className="size-5 text-rose-600" />
          Acciones comerciales
        </CardTitle>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              className="h-8 w-48 text-sm"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={pendiente}
            >
              {pendiente ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1 size-3.5" />
              )}
              Subir slide
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <>
            {!items || items.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-rose-200 py-8 text-center text-sm text-muted-foreground">
                <ImageIcon className="mb-2 size-6 text-rose-300" />
                Sin slides cargadas. Subí la que te pase Ventas para hablarla acá.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((it) => (
                  <figure
                    key={it.id}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    {it.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={it.url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={it.url}
                          alt={it.descripcion ?? it.foto_nombre ?? "Acción comercial"}
                          className="max-h-[420px] w-full object-contain"
                        />
                      </a>
                    ) : (
                      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                        No se pudo cargar la imagen
                      </div>
                    )}
                    {(it.descripcion || puedeEditar) && (
                      <figcaption className="flex items-center justify-between gap-2 border-t px-2.5 py-1.5">
                        <span className="truncate text-xs text-slate-700">
                          {it.descripcion ?? ""}
                        </span>
                        {puedeEditar && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 shrink-0 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => borrar(it.id)}
                            disabled={pendiente}
                            title="Eliminar slide"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}

            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo="logistica-ventas"
              seccion={SECCION_ACCIONES_COMERCIALES}
              titulo="Acciones comerciales"
              actividades={actividades}
              responsables={responsables}
              puedeEditar={puedeEditar}
              onChanged={onActividadesChanged}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
