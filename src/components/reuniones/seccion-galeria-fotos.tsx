"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import {
  Loader2,
  Upload,
  Trash2,
  ImageIcon,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Camera,
  X,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getSeccionFotos,
  subirSeccionFotos,
  eliminarSeccionFoto,
  type SeccionFoto,
} from "@/actions/reuniones-seccion-fotos"
import { capturarEvidenciaDia } from "@/actions/reuniones-evidencia-dia"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable, TipoReunion } from "@/types/database"

// Temas con clases literales para que Tailwind no las purgue.
const TEMAS = {
  rose: { card: "border-rose-200 bg-rose-50/30", title: "text-rose-900", icon: "text-rose-600", empty: "border-rose-200", emptyIcon: "text-rose-300" },
  violet: { card: "border-violet-200 bg-violet-50/30", title: "text-violet-900", icon: "text-violet-600", empty: "border-violet-200", emptyIcon: "text-violet-300" },
  sky: { card: "border-sky-200 bg-sky-50/30", title: "text-sky-900", icon: "text-sky-600", empty: "border-sky-200", emptyIcon: "text-sky-300" },
  teal: { card: "border-teal-200 bg-teal-50/30", title: "text-teal-900", icon: "text-teal-600", empty: "border-teal-200", emptyIcon: "text-teal-300" },
} as const

export type TemaGaleria = keyof typeof TEMAS

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

/**
 * Galería de fotos genérica para una sección de la Reunión Ventas-Logística.
 * Mismo comportamiento que Acciones comerciales: subir una o varias fotos,
 * verlas en un visor a pantalla completa y un Action Log acotado a la sección.
 * Reutilizable: se parametriza con `seccion`, `titulo`, ícono y tema de color.
 */
export function SeccionGaleriaFotos({
  reunionId,
  reunionTipo = "logistica-ventas",
  seccion,
  seccionesLectura,
  titulo,
  icono: Icono,
  tema = "rose",
  emptyHint,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
  verMasHref,
  verMasLabel,
  capturaDia,
}: {
  reunionId: string
  reunionTipo?: TipoReunion
  seccion: string
  /** Secciones adicionales cuyas fotos se MUESTRAN además de `seccion` (lo nuevo
   *  siempre se sube a `seccion`). Permite unificar varias etiquetas en una caja. */
  seccionesLectura?: string[]
  titulo: string
  icono: LucideIcon
  tema?: TemaGaleria
  emptyHint?: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
  /** Si se pasa, muestra un botón en el header que enlaza a esa ruta. */
  verMasHref?: string
  verMasLabel?: string
  /** Si se pasa, muestra el botón "Capturar del día" que genera una imagen-resumen
   *  con los KPIs reales del dashboard (RMD/NPS) y la guarda como evidencia. */
  capturaDia?: { seccion: "rmd" | "nps"; fecha: string }
}) {
  const t = TEMAS[tema]
  const [items, setItems] = useState<SeccionFoto[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendiente, startPend] = useTransition()
  const [descripcion, setDescripcion] = useState("")
  const [reload, setReload] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  // Índice de la foto abierta en el visor a pantalla completa (null = cerrado)
  const [viewer, setViewer] = useState<number | null>(null)

  // Clave estable de las secciones extra para deps del efecto (evita re-fetch en bucle).
  const extrasKey = (seccionesLectura ?? []).join(",")

  useEffect(() => {
    let cancel = false
    setLoading(true)
    const secciones = [seccion, ...(extrasKey ? extrasKey.split(",") : [])]
    void Promise.all(secciones.map((s) => getSeccionFotos(reunionId, s))).then(
      (resultados) => {
        if (cancel) return
        const todas: SeccionFoto[] = []
        let errorMsg: string | null = null
        for (const res of resultados) {
          if ("error" in res) errorMsg = res.error
          else todas.push(...res.data)
        }
        // Orden cronológico estable entre todas las secciones unificadas.
        todas.sort((a, b) => a.created_at.localeCompare(b.created_at))
        setItems(todas)
        if (errorMsg) toast.error(errorMsg)
        setLoading(false)
      },
    )
    return () => {
      cancel = true
    }
  }, [reunionId, seccion, extrasKey, reload])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const fd = new FormData()
    fd.set("reunion_id", reunionId)
    fd.set("seccion", seccion)
    fd.set("descripcion", descripcion)
    for (const f of files) fd.append("fotos", f)
    startPend(async () => {
      const res = await subirSeccionFotos(fd)
      if (fileRef.current) fileRef.current.value = ""
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      const { subidas, errores } = res.data
      toast.success(subidas === 1 ? "Foto subida" : `${subidas} fotos subidas`)
      if (errores.length > 0) {
        toast.error(
          errores.length === 1 ? errores[0] : `${errores.length} no se pudieron subir`,
        )
      }
      setDescripcion("")
      setReload((k) => k + 1)
    })
  }

  function onCapturarDia() {
    if (!capturaDia) return
    startPend(async () => {
      const res = await capturarEvidenciaDia(
        reunionId,
        capturaDia.seccion,
        capturaDia.fecha,
      )
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Captura del día guardada como evidencia")
      setReload((k) => k + 1)
    })
  }

  function borrar(id: string) {
    if (!confirm("¿Eliminar esta foto?")) return
    startPend(async () => {
      const res = await eliminarSeccionFoto(id)
      if (res && "error" in res) {
        toast.error(res.error)
        return
      }
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

  return (
    <Card className={t.card}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className={`flex items-center gap-2 text-lg font-bold ${t.title}`}>
          <Icono className={`size-5 ${t.icon}`} />
          {titulo}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {verMasHref && (
            <Link
              href={verMasHref}
              className={buttonVariants({ size: "sm", variant: "outline" }) + " h-8 text-xs"}
            >
              <ExternalLink className="mr-1 size-3.5" />
              {verMasLabel ?? "Ver más"}
            </Link>
          )}
          {puedeEditar && capturaDia && (
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={onCapturarDia}
              disabled={pendiente}
              title="Genera una imagen con los KPIs del día y la guarda como evidencia"
            >
              {pendiente ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Camera className="mr-1 size-3.5" />
              )}
              Capturar del día
            </Button>
          )}
          {puedeEditar && (
            <>
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
            </>
          )}
        </div>
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
              <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed ${t.empty} py-8 text-center text-sm text-muted-foreground`}>
                <ImageIcon className={`mb-2 size-6 ${t.emptyIcon}`} />
                {emptyHint ?? "Sin fotos cargadas. Subí las que quieras analizar acá."}
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
                          alt={it.descripcion ?? it.foto_nombre ?? titulo}
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
                            title="Eliminar foto"
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
              reunionTipo={reunionTipo}
              seccion={seccion}
              titulo={titulo}
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
                alt={items[viewer].descripcion ?? titulo}
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm text-white/70">No se pudo cargar la imagen</span>
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
