"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import {
  Megaphone,
  Loader2,
  Upload,
  Trash2,
  ImageIcon,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
  CopyPlus,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getAccionesComerciales,
  subirAccionesComerciales,
  copiarAccionesComercialesSemanaAnterior,
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
  // Índice de la foto abierta en el visor a pantalla completa (null = cerrado)
  const [viewer, setViewer] = useState<number | null>(null)

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
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const fd = new FormData()
    fd.set("reunion_id", reunionId)
    fd.set("descripcion", descripcion)
    for (const f of files) fd.append("fotos", f)
    startPend(async () => {
      const res = await subirAccionesComerciales(fd)
      if (fileRef.current) fileRef.current.value = ""
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      const { subidas, errores } = res.data
      toast.success(subidas === 1 ? "Foto subida" : `${subidas} fotos subidas`)
      if (errores.length > 0) {
        toast.error(
          errores.length === 1
            ? errores[0]
            : `${errores.length} no se pudieron subir`,
        )
      }
      setDescripcion("")
      setReload((k) => k + 1)
    })
  }

  function traerSemanaAnterior() {
    if (
      !confirm(
        "¿Traer las fotos de Acciones Comerciales de la reunión anterior? Se agregan a las que ya tenés (no borra nada).",
      )
    )
      return
    startPend(async () => {
      const res = await copiarAccionesComercialesSemanaAnterior(reunionId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      const { copiadas } = res.data
      toast.success(
        copiadas === 1
          ? "1 foto copiada de la semana anterior"
          : `${copiadas} fotos copiadas de la semana anterior`,
      )
      setReload((k) => k + 1)
    })
  }

  const total = items?.length ?? 0
  const verAnterior = useCallback(
    () => setViewer((i) => (i == null ? null : (i - 1 + total) % total)),
    [total],
  )
  const verSiguiente = useCallback(
    () => setViewer((i) => (i == null ? null : (i + 1) % total)),
    [total],
  )

  // Navegación por teclado en el visor
  useEffect(() => {
    if (viewer == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") verAnterior()
      else if (e.key === "ArrowRight") verSiguiente()
      else if (e.key === "Escape") setViewer(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [viewer, verAnterior, verSiguiente])

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
              multiple
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={traerSemanaAnterior}
              disabled={pendiente}
              title="Copiar las fotos de la reunión anterior"
            >
              {pendiente ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <CopyPlus className="mr-1 size-3.5" />
              )}
              Traer semana anterior
            </Button>
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
              Subir fotos
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
                Sin fotos cargadas. Subí las que te pase Ventas para hablarlas acá.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((it, idx) => (
                  <figure
                    key={it.id}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    {it.url ? (
                      <button
                        type="button"
                        onClick={() => setViewer(idx)}
                        className="relative block w-full cursor-zoom-in"
                        title="Ver en pantalla completa"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.url}
                          alt={it.descripcion ?? it.foto_nombre ?? "Acción comercial"}
                          className="aspect-square w-full object-cover"
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                          <Maximize2 className="size-6 drop-shadow" />
                        </span>
                      </button>
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

      {/* Visor a pantalla completa con navegación */}
      {viewer != null && items && items[viewer] && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/90"
          onClick={() => setViewer(null)}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-white">
            <span className="truncate text-sm">
              {items[viewer].descripcion ?? items[viewer].foto_nombre ?? ""}
              <span className="ml-2 text-xs text-white/60">
                {viewer + 1} / {items.length}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={(e) => {
                e.stopPropagation()
                setViewer(null)
              }}
            >
              <X className="size-5" />
            </Button>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
            {items.length > 1 && (
              <button
                type="button"
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
                onClick={(e) => {
                  e.stopPropagation()
                  verAnterior()
                }}
                title="Anterior (←)"
              >
                <ChevronLeft className="size-6" />
              </button>
            )}
            {items[viewer].url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={items[viewer].url!}
                alt={items[viewer].descripcion ?? "Acción comercial"}
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm text-white/70">
                No se pudo cargar la imagen
              </span>
            )}
            {items.length > 1 && (
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
                onClick={(e) => {
                  e.stopPropagation()
                  verSiguiente()
                }}
                title="Siguiente (→)"
              >
                <ChevronRight className="size-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
