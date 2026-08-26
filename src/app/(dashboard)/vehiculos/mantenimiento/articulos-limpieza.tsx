"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Brush,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  getEntregasArticulos,
  registrarEntregaArticulos,
  eliminarEntregaArticulos,
  desmarcarArticuloUnidad,
  type EntregaArticulos,
} from "@/actions/articulos-limpieza"
import { ARTICULOS_LIMPIEZA, labelArticulo } from "@/lib/flota/articulos-limpieza"

const fmtFecha = (f: string) => f.split("-").reverse().join("/")

/**
 * Hoy en hora argentina. El servidor puede estar en UTC y a la noche marcaría
 * la entrega con la fecha del día siguiente.
 */
function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * Entrega de artículos de limpieza por unidad (escoba, rejilla, franela).
 *
 * La lectura que importa es el resumen: la ÚLTIMA fecha en que cada unidad
 * recibió cada artículo — con eso se ve de un vistazo a quién le toca. El
 * historial entrega por entrega queda plegado abajo, como en Tareas CIL.
 */
export function ArticulosLimpiezaSection({
  dominios,
  puedeEditar,
}: {
  dominios: string[]
  puedeEditar: boolean
}) {
  const [entregas, setEntregas] = useState<EntregaArticulos[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abrirCarga, setAbrirCarga] = useState(false)
  const [verDetalle, setVerDetalle] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)

  const cargar = async () => {
    const res = await getEntregasArticulos()
    if ("error" in res) setError(res.error)
    else {
      setError(null)
      setEntregas(res.data)
    }
  }

  useEffect(() => {
    void (async () => {
      const res = await getEntregasArticulos()
      if ("error" in res) setError(res.error)
      else setEntregas(res.data)
    })()
  }, [])

  // Última entrega de cada artículo por unidad. Las unidades vienen del
  // catálogo (prop) para que también se vean las que nunca recibieron nada;
  // si el historial trae un dominio que ya no está activo, se muestra igual.
  const dominiosConDatos = new Set(entregas?.map((e) => e.dominio) ?? [])
  const filas = Array.from(new Set([...dominios, ...dominiosConDatos])).sort()
  const ultima = new Map<string, string>()
  for (const e of entregas ?? []) {
    for (const a of e.articulos) {
      const k = `${e.dominio}|${a}`
      const prev = ultima.get(k)
      if (!prev || e.fecha > prev) ultima.set(k, e.fecha)
    }
  }

  const borrar = async (id: string) => {
    setBorrando(id)
    const res = await eliminarEntregaArticulos(id)
    setBorrando(null)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Entrega eliminada")
      void cargar()
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Brush className="size-4 text-muted-foreground" /> Artículos de limpieza
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            {entregas?.length ?? "…"}
          </Badge>
        </CardTitle>
        {puedeEditar && (
          <Button size="sm" onClick={() => setAbrirCarga(true)}>
            <Plus className="mr-1 size-4" /> Registrar entrega
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Qué artículo se le entregó a cada unidad y cuándo. Cada artículo es un
          botón: tocalo y queda <strong>verde</strong> con la entrega del día.
          Volviendo a tocarlo se deshace.
        </p>

        {error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : entregas === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </p>
        ) : (
          <>
            <CuadroArticulos
              filas={filas}
              ultima={ultima}
              puedeEditar={puedeEditar}
              onCambio={cargar}
            />

            <Button
              variant="ghost"
              size="sm"
              className="mt-3 h-8 gap-1 text-xs"
              aria-expanded={verDetalle}
              onClick={() => setVerDetalle((v) => !v)}
            >
              {verDetalle ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              {verDetalle ? "Ocultar historial" : "Ver historial"}
            </Button>

            {verDetalle &&
              (entregas.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Sin entregas registradas.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[40rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Unidad</TableHead>
                        <TableHead>Artículos</TableHead>
                        <TableHead>Observación</TableHead>
                        <TableHead>Registró</TableHead>
                        {puedeEditar && <TableHead className="w-10" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entregas.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="align-top whitespace-nowrap">
                            {fmtFecha(e.fecha)}
                          </TableCell>
                          <TableCell className="align-top font-medium">
                            {e.dominio}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-1">
                              {e.articulos.map((a) => (
                                <Badge
                                  key={a}
                                  variant="outline"
                                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                >
                                  {labelArticulo(a)}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="w-72 max-w-72 align-top break-words whitespace-normal text-muted-foreground">
                            {e.observaciones ?? "—"}
                          </TableCell>
                          <TableCell className="align-top text-muted-foreground">
                            {e.cargado_por ?? "—"}
                          </TableCell>
                          {puedeEditar && (
                            <TableCell className="align-top">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive"
                                disabled={borrando === e.id}
                                onClick={() => borrar(e.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
          </>
        )}
      </CardContent>
      {abrirCarga && (
        <EntregaDialog
          dominios={dominios}
          onClose={() => setAbrirCarga(false)}
          onSaved={() => {
            setAbrirCarga(false)
            void cargar()
          }}
        />
      )}
    </Card>
  )
}

function EntregaDialog({
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
  // Varios artículos en una sola carga: si a la unidad se le dan escoba y
  // franela juntas, es UNA entrega.
  const [articulos, setArticulos] = useState<string[]>([])
  const [observaciones, setObservaciones] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!dominio) return toast.error("Elegí la unidad")
    if (articulos.length === 0) return toast.error("Marcá qué artículos se entregaron")
    setSaving(true)
    const res = await registrarEntregaArticulos({
      fecha,
      dominio,
      articulos,
      observaciones,
    })
    setSaving(false)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Entrega registrada")
      onSaved()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar entrega de artículos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
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
            <Label>Artículos entregados</Label>
            <div className="mt-2 space-y-1.5">
              {ARTICULOS_LIMPIEZA.map((a) => {
                const marcado = articulos.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() =>
                      setArticulos((prev) =>
                        prev.includes(a.id)
                          ? prev.filter((x) => x !== a.id)
                          : [...prev, a.id],
                      )
                    }
                    className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                      marcado ? "border-primary bg-primary/10" : "hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border-2 ${
                        marcado
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {marcado && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {a.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label>Observación</Label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="Opcional: a quién se le entregó, reposición, etc."
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
 * El cuadro de entregas: una tarjeta por unidad y, adentro, un botón por
 * artículo que se pone VERDE cuando esa unidad lo recibió, con la fecha de la
 * última entrega debajo.
 *
 * 🚨 Antes era una tabla de fechas de sólo lectura: para marcar una escoba
 * había que abrir el diálogo, elegir unidad, marcar el artículo y guardar. Se
 * entrega recorriendo la flota, así que el registro tiene que ser un toque por
 * unidad. El diálogo sigue estando para lo que el botón no puede: cargar con
 * fecha vieja o dejar una observación.
 */
function CuadroArticulos({
  filas,
  ultima,
  puedeEditar,
  onCambio,
}: {
  filas: string[]
  /** `${dominio}|${articuloId}` → fecha de la última entrega. */
  ultima: Map<string, string>
  puedeEditar: boolean
  onCambio: () => Promise<void>
}) {
  // Qué botón está esperando al servidor, para que no se toque dos veces y se
  // registre la entrega por duplicado.
  const [guardando, setGuardando] = useState<string | null>(null)
  // Desmarcar borra registro: se pregunta antes. Marcar no, porque un clic de
  // más se deshace con otro clic.
  const [aDesmarcar, setADesmarcar] = useState<{
    dominio: string
    articulo: string
    fecha: string
  } | null>(null)

  const marcar = async (dominio: string, articulo: string) => {
    const clave = `${dominio}|${articulo}`
    setGuardando(clave)
    const res = await registrarEntregaArticulos({
      fecha: hoyArgentina(),
      dominio,
      articulos: [articulo],
    })
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(`${labelArticulo(articulo)} · ${dominio}`)
      await onCambio()
    }
    setGuardando(null)
  }

  const desmarcar = async () => {
    if (!aDesmarcar) return
    const { dominio, articulo } = aDesmarcar
    setADesmarcar(null)
    setGuardando(`${dominio}|${articulo}`)
    const res = await desmarcarArticuloUnidad(dominio, articulo)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(`Se deshizo ${labelArticulo(articulo)} de ${dominio}`)
      await onCambio()
    }
    setGuardando(null)
  }

  if (filas.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Sin unidades en la flota.
      </p>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table className="min-w-[32rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Unidad</TableHead>
              <TableHead className="whitespace-nowrap">Última entrega</TableHead>
              <TableHead>Artículos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((d) => {
              // Las fechas son ISO: ordenan bien como texto, la última es la más nueva.
              const fechas = ARTICULOS_LIMPIEZA.map((a) => ultima.get(`${d}|${a.id}`))
                .filter((f): f is string => !!f)
                .sort()
              const ultimaDeLaUnidad = fechas[fechas.length - 1]
              return (
                <TableRow key={d}>
                  <TableCell className="font-medium whitespace-nowrap">{d}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {ultimaDeLaUnidad ? fmtFecha(ultimaDeLaUnidad) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ARTICULOS_LIMPIEZA.map((a) => {
                        const clave = `${d}|${a.id}`
                        const fecha = ultima.get(clave)
                        const ocupado = guardando === clave
                        return (
                          <button
                            key={a.id}
                            type="button"
                            aria-pressed={!!fecha}
                            disabled={!puedeEditar || ocupado}
                            title={
                              !puedeEditar
                                ? fecha
                                  ? `Entregada el ${fmtFecha(fecha)}`
                                  : "Sin entregar"
                                : fecha
                                  ? `Entregada el ${fmtFecha(fecha)} — tocar para deshacer`
                                  : `Marcar ${a.label} entregada hoy a ${d}`
                            }
                            onClick={() =>
                              fecha
                                ? setADesmarcar({ dominio: d, articulo: a.id, fecha })
                                : void marcar(d, a.id)
                            }
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors disabled:opacity-60 ${
                              fecha
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "border-muted-foreground/30 bg-background text-muted-foreground"
                            } ${
                              puedeEditar && !ocupado
                                ? "hover:border-emerald-500 hover:bg-emerald-500/20"
                                : "cursor-default"
                            }`}
                          >
                            {ocupado ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : fecha ? (
                              <Check className="size-3" strokeWidth={3} />
                            ) : null}
                            {a.label}
                          </button>
                        )
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-emerald-500/50 bg-emerald-500/40"
          />{" "}
          entregado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border border-muted-foreground/40 bg-background"
          />{" "}
          sin entregar
        </span>
        <span>La fecha es la de la última entrega de la unidad.</span>
        {puedeEditar && <span>Tocar un artículo lo marca con la fecha de hoy.</span>}
      </p>

      {aDesmarcar && (
        <Dialog open onOpenChange={(o) => !o && setADesmarcar(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Deshacer la entrega</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Se saca <strong>{labelArticulo(aDesmarcar.articulo)}</strong> de la
              entrega del <strong>{fmtFecha(aDesmarcar.fecha)}</strong> a{" "}
              <strong>{aDesmarcar.dominio}</strong>. Los otros artículos de esa
              misma entrega quedan como están.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setADesmarcar(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => void desmarcar()}>
                Deshacer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
