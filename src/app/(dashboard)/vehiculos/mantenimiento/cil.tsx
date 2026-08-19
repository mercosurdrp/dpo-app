"use client"

// Solapa CIL — Limpieza, Inspección y Lubricación (CIL/ATO) y los artículos de
// limpieza que se le entregan a cada unidad.
//
// Esto vivía adentro de la solapa "Check lists" y no es un checklist: el
// checklist es la verificación diaria previa a la salida (DPO 1.3), mientras
// que el CIL es mantenimiento autónomo del conductor sobre su propia unidad
// (DPO 4.1) y los artículos de limpieza son el insumo que lo hace posible.
// Mezclados, la solapa de checklist se leía como un cajón de sastre y las tres
// secciones de abajo quedaban sepultadas debajo de las tablas de defectos.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ImageIcon,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { DpoPuntoBadge, DpoSeccionCinta } from "./_components/dpo-badge"
import { ScrollX } from "./_components/scroll-x"
import { CoberturaCil } from "./cobertura-cil"
import { ArticulosLimpiezaSection } from "./articulos-limpieza"
import {
  createTareaCil,
  deleteTareaCil,
  subirFotoTareaCil,
  type TareaCil,
} from "@/actions/mantenimiento-vehiculos"
import { TAREAS_CIL, labelTareaCil } from "@/lib/flota/cil-tareas"
import { FotoInput } from "@/components/foto/foto-input"
import { toast } from "sonner"

function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
}

/** El mes en curso en hora argentina: el servidor puede estar en UTC. */
function mesActualArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7)
}

interface Props {
  tareasCil: TareaCil[]
  /** Flota activa completa (para el alta de tareas CIL y de entregas). */
  dominiosFlota: string[]
  puedeEditar: boolean
}

export function Cil({ tareasCil, dominiosFlota, puedeEditar }: Props) {
  return (
    <div className="space-y-6">
      <DpoSeccionCinta seccionId="cil" />

      {/* ===== Cobertura del CIL: qué unidad está al día y cuál falta (DPO 4.1) ===== */}
      <CoberturaCil mesActual={mesActualArgentina()} />

      {/* ===== Tareas CIL / ATO (DPO 4.1) ===== */}
      <TareasCilSection
        tareasCil={tareasCil}
        dominios={dominiosFlota}
        puedeEditar={puedeEditar}
      />

      {/* ===== Artículos de limpieza: qué se le entregó a cada unidad ===== */}
      <ArticulosLimpiezaSection dominios={dominiosFlota} puedeEditar={puedeEditar} />
    </div>
  )
}

// ==================== Tareas CIL / ATO ====================

// 🚨 Acá había una copia del catálogo de tareas. Al sacar `limpieza` del catálogo
// real (07/08/2026) esta copia lo habría seguido ofreciendo del lado del
// supervisor, que es justo la duplicación que causó el error `23514` de agosto.
// Ahora sale todo de `lib/flota/cil-tareas`.

function TareasCilSection({
  tareasCil,
  dominios,
  puedeEditar,
}: {
  tareasCil: TareaCil[]
  dominios: string[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())
  const [abrirCarga, setAbrirCarga] = useState(false)
  // 🚨 Arranca CERRADO: es el detalle fila por fila de todo el histórico y
  // empujaba para abajo la lectura que importa —la Cobertura del CIL, que está
  // justo arriba—. El conteo queda a la vista en el título, así que cerrado
  // igual se sabe cuántas hay.
  const [verDetalle, setVerDetalle] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-muted-foreground" /> Tareas CIL / ATO
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            {tareasCil.length}
          </Badge>
          <DpoPuntoBadge numero="4.1" />
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            aria-expanded={verDetalle}
            onClick={() => setVerDetalle((v) => !v)}
          >
            {verDetalle ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {verDetalle ? "Ocultar detalle" : "Ver detalle"}
          </Button>
          {puedeEditar && (
            <Button size="sm" onClick={() => setAbrirCarga(true)}>
              <Plus className="mr-1 size-4" /> Registrar tarea
            </Button>
          )}
        </div>
      </CardHeader>
      {verDetalle && (
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Limpieza, inspección y lubricación autónomas hechas por los operarios
            (incrementales al checklist diario).
          </p>
          {tareasCil.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin tareas CIL registradas.
            </p>
          ) : (
            /*
              🚨 `ScrollX` + `min-w` en la tabla, y NO un `overflow-x-auto` en el
              CardContent: con la tabla libre de comprimirse, el Detalle largo
              desbordaba su celda y se PISABA con «Ver»/«Subir» y con el botón de
              borrar (se leía "…se hizo eVerel"). El ancho mínimo la deja
              scrollear en vez de aplastarse, con la barra arriba como en las
              otras tablas de esta pantalla.
            */
            <ScrollX>
              <Table className="min-w-[60rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Operario</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Evidencia</TableHead>
                    {puedeEditar && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tareasCil.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="align-top whitespace-nowrap">
                        {fmtFecha(t.fecha)}
                      </TableCell>
                      <TableCell className="align-top font-medium">{t.dominio}</TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                        >
                          {labelTareaCil(t.tarea)}
                        </Badge>
                      </TableCell>
                      {/* El operario puede ser más de uno: se deja quebrar. */}
                      <TableCell className="w-44 align-top break-words whitespace-normal text-muted-foreground">
                        {t.operario}
                      </TableCell>
                      {/* 🚨 `whitespace-normal break-words` con ancho fijo: sin
                          esto el texto largo salía de la celda en vez de bajar de
                          renglón, y tapaba las columnas de la derecha. */}
                      <TableCell className="w-80 max-w-80 align-top break-words whitespace-normal text-muted-foreground">
                        {t.descripcion ?? "—"}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        {t.foto_url ? (
                          <MiniaturaEvidencia
                            url={t.foto_url}
                            pie={`${t.dominio} · ${labelTareaCil(t.tarea)} · ${fmtFecha(t.fecha)}`}
                          />
                        ) : puedeEditar ? (
                          <SubirFotoCil id={t.id} onSubida={refresh} />
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="align-top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={async () => {
                              const res = await deleteTareaCil(t.id)
                              if ("error" in res) toast.error(res.error)
                              else {
                                toast.success("Eliminada")
                                refresh()
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollX>
          )}
        </CardContent>
      )}
      {abrirCarga && (
        <TareaCilDialog
          dominios={dominios}
          onClose={() => setAbrirCarga(false)}
          onSaved={() => {
            setAbrirCarga(false)
            refresh()
          }}
        />
      )}
    </Card>
  )
}

/**
 * La evidencia, como miniatura en la fila, que se agranda al tocarla.
 *
 * 🚨 Antes era un link «Ver» que abría otra pestaña: para revisar el mes había
 * que salir y volver por cada foto. Con la miniatura se reconoce la unidad sin
 * abrir nada, y el visor deja mirarlas sin perder la tabla. El link a la imagen
 * original sigue estando adentro, que es lo que se le pasa al auditor.
 */
function MiniaturaEvidencia({ url, pie }: { url: string; pie: string }) {
  const [abierta, setAbierta] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        title={`Ver la foto — ${pie}`}
        className="block overflow-hidden rounded-md border transition-opacity hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Evidencia de ${pie}`}
          loading="lazy"
          className="size-12 object-cover"
        />
      </button>

      {abierta && (
        <Dialog open onOpenChange={(o) => !o && setAbierta(false)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-medium">{pie}</DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Evidencia de ${pie}`}
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ImageIcon className="size-3.5" /> Abrir la original en otra pestaña
            </a>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

/**
 * Adjunta la evidencia a una tarea CIL que quedó sin foto. La tarea y la foto no
 * siempre se pueden cargar juntas (ver `subirFotoTareaCil`), y sin esto la única
 * salida era borrar la fila y rehacerla.
 */
function SubirFotoCil({ id, onSubida }: { id: string; onSubida: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)

  async function enviar(file: File | null) {
    if (!file) return
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.set("foto", file)
      const res = await subirFotoTareaCil(id, fd)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Evidencia cargada")
        setAbierto(false)
        onSubida()
      }
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={subiendo}
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline disabled:opacity-50"
      >
        <Upload className="size-3.5" /> {subiendo ? "Subiendo…" : "Subir"}
      </button>

      {/* Se abre un diálogo en vez de disparar el input directo: desde el celular
          la evidencia se saca en el momento, y con un input suelto no había forma
          de llegar a la cámara. */}
      {abierto && (
        <Dialog open onOpenChange={(o) => !o && !subiendo && setAbierto(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Adjuntar la evidencia</DialogTitle>
            </DialogHeader>
            <FotoInput
              foto={null}
              onFoto={(f) => void enviar(f)}
              nombreBase="cil-evidencia"
            />
            {subiendo && (
              <p className="text-sm text-muted-foreground">Subiendo…</p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function TareaCilDialog({
  dominios,
  onClose,
  onSaved,
}: {
  dominios: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [dominio, setDominio] = useState("")
  // Varios trabajos en una sola carga: la misma parada suele cerrar más de una
  // letra del CIL. Ver `createTareaCil`.
  const [tareas, setTareas] = useState<string[]>([])
  const [operario, setOperario] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [foto, setFoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!dominio) return toast.error("Elegí la unidad")
    if (tareas.length === 0) return toast.error("Marcá qué trabajos se hicieron")
    if (!operario.trim()) return toast.error("Indicá el operario")
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set("fecha", fecha)
      fd.set("dominio", dominio)
      for (const t of tareas) fd.append("tarea", t)
      fd.set("operario", operario)
      fd.set("descripcion", descripcion)
      if (foto) fd.set("foto", foto)
      const res = await createTareaCil(fd)
      if ("error" in res) return toast.error(res.error)
      toast.success(
        res.creadas === 1 ? "Tarea CIL registrada" : `${res.creadas} tareas CIL registradas`,
      )
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar tarea CIL</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Unidad</Label>
              <Select value={dominio || undefined} onValueChange={(v) => v && setDominio(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir" />
                </SelectTrigger>
                <SelectContent>
                  {dominios.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Trabajos hechos</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Marcá todos los que se le hicieron a la unidad ese día: se registran de
              una sola vez.
            </p>
            <div className="mt-2 space-y-1.5">
              {TAREAS_CIL.map((t) => {
                const marcada = tareas.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() =>
                      setTareas((prev) =>
                        prev.includes(t.id)
                          ? prev.filter((x) => x !== t.id)
                          : [...prev, t.id],
                      )
                    }
                    className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                      marcada
                        ? "border-primary bg-primary/10"
                        : "hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border-2 ${
                        marcada
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {marcada && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label>Operario</Label>
            <Input
              value={operario}
              onChange={(e) => setOperario(e.target.value)}
              placeholder="Nombre"
            />
          </div>
          <div>
            <Label>Detalle</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Opcional: qué se hizo / qué se encontró"
            />
          </div>
          <div>
            <Label>Foto (opcional)</Label>
            {/* Con cámara propia: desde el celular el `<input type="file">` sólo
                llegaba a la galería. Una foto para todos los trabajos marcados. */}
            <FotoInput
              foto={foto}
              onFoto={setFoto}
              nombreBase={`cil-${dominio || "unidad"}`}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Tiempo de respuesta del foco: desde que el chofer cargó el checklist hasta
 * que se cerró el plan de acción. Mientras el plan sigue abierto muestra cuánto
 * lleva esperando, para que se vea qué está corriendo.
 */
