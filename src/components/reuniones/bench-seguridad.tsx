"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import {
  BookOpenCheck,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  Truck,
  Warehouse,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  adjuntarBenchSeguridad,
  eliminarBenchSeguridad,
  getBenchSeguridad,
  guardarAprendizajesBench,
  type BenchSeguridad,
} from "@/actions/seguridad-bench"

const CLASIFICACIONES = [
  "SIF Actual",
  "SIF Potencial",
  "SIF Precursor",
  "No SIF",
]

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

/**
 * Reporte Bench de Seguridad: cada día se adjunta una investigación de un
 * evento ocurrido en otro distribuidor, se trabaja en la reunión y se vuelca
 * qué aprendemos para Entrega y para Almacén. Se muestra la del día de la
 * reunión o, si ese día no se cargó, la última anterior.
 */
export function BenchSeguridadSection({
  fechaReunion,
  puedeEditar,
  areaFoco,
}: {
  fechaReunion: string
  puedeEditar: boolean
  areaFoco?: "deposito" | "distribucion"
}) {
  const [items, setItems] = useState<BenchSeguridad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const aplicar = useCallback(
    (res: Awaited<ReturnType<typeof getBenchSeguridad>>, elegir?: string) => {
      if ("error" in res) {
        setError(res.error)
        setItems([])
      } else {
        setError(null)
        setItems(res.data)
        setSeleccionId(elegir ?? res.data[0]?.id ?? null)
      }
      setCargando(false)
    },
    [],
  )

  const cargar = useCallback(
    (elegir?: string) => {
      setCargando(true)
      void getBenchSeguridad(fechaReunion).then((res) => aplicar(res, elegir))
    },
    [fechaReunion, aplicar],
  )

  useEffect(() => {
    let vivo = true
    void getBenchSeguridad(fechaReunion).then((res) => {
      if (vivo) aplicar(res)
    })
    return () => {
      vivo = false
    }
  }, [fechaReunion, aplicar])

  const actual = useMemo(
    () => items.find((i) => i.id === seleccionId) ?? items[0] ?? null,
    [items, seleccionId],
  )

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <BookOpenCheck className="size-4" />
          Reporte Bench de Seguridad
          <span className="font-normal text-amber-800/80">
            · investigación de otro distribuidor
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {items.length > 1 && (
            <Select
              value={actual?.id ?? ""}
              onValueChange={(v) => setSeleccionId(v as string)}
            >
              <SelectTrigger className="h-8 w-[220px] bg-white text-xs">
                <SelectValue>
                  {(v: string | null) => {
                    const it = items.find((i) => i.id === v)
                    return it ? `${fechaCorta(it.fecha)} · ${it.titulo}` : "Elegir"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {fechaCorta(i.fecha)} · {i.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {puedeEditar && (
            <Button
              size="sm"
              className="h-8 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => setDialogOpen(true)}
            >
              <Paperclip className="mr-1 size-4" />
              Adjuntar investigación
            </Button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Cargando bench…
        </div>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !actual ? (
        <p className="rounded-md border border-dashed border-amber-300 bg-white/60 px-3 py-4 text-center text-sm text-muted-foreground">
          Todavía no hay investigaciones cargadas.
          {puedeEditar && " Usá «Adjuntar investigación» para cargar la del día."}
        </p>
      ) : (
        <BenchDetalle
          key={actual.id}
          item={actual}
          fechaReunion={fechaReunion}
          puedeEditar={puedeEditar}
          areaFoco={areaFoco}
          onCambio={(id) => cargar(id)}
        />
      )}

      {puedeEditar && (
        <AdjuntarBenchDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          fechaDefault={fechaReunion}
          onCreado={(id) => {
            setDialogOpen(false)
            cargar(id)
          }}
        />
      )}
    </section>
  )
}

function BenchDetalle({
  item,
  fechaReunion,
  puedeEditar,
  areaFoco,
  onCambio,
}: {
  item: BenchSeguridad
  fechaReunion: string
  puedeEditar: boolean
  areaFoco?: "deposito" | "distribucion"
  onCambio: (id?: string) => void
}) {
  const [entrega, setEntrega] = useState(item.aprendizaje_entrega ?? "")
  const [almacen, setAlmacen] = useState(item.aprendizaje_almacen ?? "")
  const [pending, startTransition] = useTransition()
  const esPdf = item.archivo_tipo === "application/pdf"
  const sucio =
    entrega !== (item.aprendizaje_entrega ?? "") ||
    almacen !== (item.aprendizaje_almacen ?? "")

  function guardar() {
    startTransition(async () => {
      const res = await guardarAprendizajesBench({
        id: item.id,
        aprendizaje_entrega: entrega,
        aprendizaje_almacen: almacen,
      })
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Bench guardado")
        onCambio(item.id)
      }
    })
  }

  function eliminar() {
    if (!confirm(`¿Eliminar la investigación «${item.titulo}» y su archivo?`)) return
    startTransition(async () => {
      const res = await eliminarBenchSeguridad(item.id)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Investigación eliminada")
        onCambio()
      }
    })
  }

  const bloques: Array<{
    key: "distribucion" | "deposito"
    titulo: string
    icon: typeof Truck
    valor: string
    set: (v: string) => void
  }> = [
    { key: "distribucion", titulo: "Volcar a Entrega", icon: Truck, valor: entrega, set: setEntrega },
    { key: "deposito", titulo: "Volcar a Almacén", icon: Warehouse, valor: almacen, set: setAlmacen },
  ]
  // En la reunión de un área, su bloque va primero.
  if (areaFoco === "deposito") bloques.reverse()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold text-slate-900">{item.titulo}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <Badge variant="outline" className="bg-white">
              {fechaCorta(item.fecha)}
            </Badge>
            {item.fecha !== fechaReunion && (
              <span className="text-amber-800">(no hay carga del día de la reunión)</span>
            )}
            {item.distribuidor && (
              <Badge variant="outline" className="bg-white">
                {item.distribuidor}
              </Badge>
            )}
            {item.clasificacion && (
              <Badge
                className={cn(
                  "border-0",
                  /SIF (Actual|Potencial)/i.test(item.clasificacion)
                    ? "bg-red-600 text-white"
                    : "bg-amber-200 text-amber-900",
                )}
              >
                {item.clasificacion}
              </Badge>
            )}
          </div>
          {item.resumen && (
            <p className="whitespace-pre-wrap text-sm text-slate-700">{item.resumen}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-white px-2 text-xs font-medium hover:bg-slate-50"
            >
              <ExternalLink className="size-3.5" />
              Abrir
            </a>
          )}
          {puedeEditar && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={eliminar}
              disabled={pending}
              aria-label="Eliminar investigación"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {item.url ? (
        esPdf ? (
          <iframe
            src={`${item.url}#view=FitH`}
            title={item.titulo}
            className="h-[300px] w-full rounded-md border bg-white sm:h-[520px]"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.titulo}
            className="max-h-[560px] w-full rounded-md border bg-white object-contain"
          />
        )
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-4" />
          {item.archivo_nombre ?? "Archivo"} (no se pudo generar el enlace)
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {bloques.map((b) => {
          const Icon = b.icon
          const foco = areaFoco === b.key
          return (
            <div
              key={b.key}
              className={cn(
                "space-y-1.5 rounded-md border bg-white p-2.5",
                foco && "border-amber-500 ring-1 ring-amber-400",
              )}
            >
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Icon className="size-3.5" />
                {b.titulo}
                {foco && <span className="font-normal text-amber-700">· esta reunión</span>}
              </Label>
              {puedeEditar ? (
                <Textarea
                  value={b.valor}
                  onChange={(e) => b.set(e.target.value)}
                  rows={3}
                  placeholder="¿Qué aprendemos y qué acción tomamos acá?"
                  className="text-sm"
                />
              ) : (
                <p className="min-h-[2.5rem] whitespace-pre-wrap text-sm text-slate-700">
                  {b.valor || <span className="text-muted-foreground">Sin cargar</span>}
                </p>
              )}
            </div>
          )
        })}
      </div>
      {puedeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={guardar} disabled={!sucio || pending}>
            {pending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Save className="mr-1 size-4" />
            )}
            Guardar aprendizajes
          </Button>
        </div>
      )}
    </div>
  )
}

function AdjuntarBenchDialog({
  open,
  onOpenChange,
  fechaDefault,
  onCreado,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fechaDefault: string
  onCreado: (id: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [clasificacion, setClasificacion] = useState<string>("")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("clasificacion", clasificacion)
    startTransition(async () => {
      const res = await adjuntarBenchSeguridad(fd)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Investigación adjuntada")
        setClasificacion("")
        onCreado(res.data.id)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjuntar investigación del día</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bench-fecha">Fecha</Label>
              <Input id="bench-fecha" name="fecha" type="date" defaultValue={fechaDefault} required />
            </div>
            <div className="space-y-1">
              <Label>Clasificación</Label>
              <Select value={clasificacion} onValueChange={(v) => setClasificacion((v as string) ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elegir" />
                </SelectTrigger>
                <SelectContent>
                  {CLASIFICACIONES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bench-titulo">Título</Label>
            <Input
              id="bench-titulo"
              name="titulo"
              required
              maxLength={200}
              placeholder="Ej.: Golpe con barreta al aflojar tuercas de rueda"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bench-dist">Distribuidor / origen</Label>
            <Input id="bench-dist" name="distribuidor" maxLength={200} placeholder="Ej.: Distribuidor González Catán" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bench-resumen">Resumen (opcional)</Label>
            <Textarea id="bench-resumen" name="resumen" rows={3} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bench-archivo">Archivo (PDF o imagen)</Label>
            <Input
              id="bench-archivo"
              name="archivo"
              type="file"
              accept="application/pdf,image/*"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
              Adjuntar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
