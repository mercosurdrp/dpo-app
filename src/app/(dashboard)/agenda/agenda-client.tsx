"use client"

import * as React from "react"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { es } from "date-fns/locale"
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Repeat,
  Trash2,
  User,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { CalendarMonth, type CalendarEvento } from "@/components/ui/calendar-month"
import { cn } from "@/lib/utils"
import {
  CATEGORIAS,
  CATEGORIAS_ORDEN,
  RECURRENCIAS,
  labelRecurrencia,
  metaCategoria,
  hhmm,
  type AgendaEvento,
  type AgendaEventoInput,
  type CategoriaAgenda,
  type Recurrencia,
} from "@/lib/agenda"
import {
  actualizarEvento,
  crearEvento,
  eliminarEvento,
  listarEventosEnRango,
} from "@/actions/agenda"

interface Props {
  mesInicialISO: string
  eventosIniciales: AgendaEvento[]
}

interface FormState {
  id: string | null
  titulo: string
  categoria: CategoriaAgenda
  fecha: string
  todo_el_dia: boolean
  hora_inicio: string
  hora_fin: string
  responsable: string
  ubicacion: string
  descripcion: string
  recurrencia: Recurrencia
  recurrencia_hasta: string
}

const FILTRO_TODAS = "todas"

function parseISO(iso: string): Date {
  return parse(iso, "yyyy-MM-dd", new Date())
}

function rangoGrilla(ref: Date): { desde: string; hasta: string } {
  const inicio = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 })
  const fin = endOfWeek(endOfMonth(ref), { weekStartsOn: 1 })
  eachDayOfInterval({ start: inicio, end: fin })
  return { desde: format(inicio, "yyyy-MM-dd"), hasta: format(fin, "yyyy-MM-dd") }
}

function formVacio(fecha: string): FormState {
  return {
    id: null,
    titulo: "",
    categoria: "reunion",
    fecha,
    todo_el_dia: false,
    hora_inicio: "09:00",
    hora_fin: "10:00",
    responsable: "",
    ubicacion: "",
    descripcion: "",
    recurrencia: "ninguna",
    recurrencia_hasta: "",
  }
}

function rangoHorario(ev: AgendaEvento): string | null {
  if (ev.todo_el_dia) return null
  const ini = hhmm(ev.hora_inicio)
  const fin = hhmm(ev.hora_fin)
  if (ini && fin) return `${ini} – ${fin}`
  return ini
}

export function AgendaClient({ mesInicialISO, eventosIniciales }: Props) {
  const [mesRef, setMesRef] = React.useState<Date>(() =>
    startOfMonth(parseISO(mesInicialISO)),
  )
  const [eventos, setEventos] = React.useState<AgendaEvento[]>(eventosIniciales)
  const [cargando, setCargando] = React.useState(false)
  const [filtroCat, setFiltroCat] = React.useState<string>(FILTRO_TODAS)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(() => formVacio(mesInicialISO))
  const [guardando, setGuardando] = React.useState(false)
  const [eliminando, setEliminando] = React.useState(false)

  const hoyISO = format(new Date(), "yyyy-MM-dd")

  // ── Carga del mes visible ────────────────────────────────────────────────
  const cargarMes = React.useCallback(async (ref: Date) => {
    const { desde, hasta } = rangoGrilla(ref)
    setCargando(true)
    const res = await listarEventosEnRango(desde, hasta)
    setCargando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setEventos(res.data)
  }, [])

  const irAMes = React.useCallback(
    (ref: Date) => {
      const nuevo = startOfMonth(ref)
      setMesRef(nuevo)
      void cargarMes(nuevo)
    },
    [cargarMes],
  )

  // ── Filtro de categoría ──────────────────────────────────────────────────
  const eventosFiltrados = React.useMemo(
    () =>
      filtroCat === FILTRO_TODAS
        ? eventos
        : eventos.filter((e) => e.categoria === filtroCat),
    [eventos, filtroCat],
  )

  const eventosCalendario: CalendarEvento[] = React.useMemo(
    () =>
      eventosFiltrados.map((e) => {
        const meta = metaCategoria(e.categoria)
        const prefijo = !e.todo_el_dia && hhmm(e.hora_inicio) ? `${hhmm(e.hora_inicio)} ` : ""
        return {
          id: e.id,
          fecha: e.fecha,
          titulo: `${prefijo}${e.titulo}`,
          dot: meta.dot,
          chip: meta.chip,
        }
      }),
    [eventosFiltrados],
  )

  // Lista: agrupada por fecha, ordenada ascendente.
  const grupos = React.useMemo(() => {
    const ordenados = [...eventosFiltrados].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      return (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "")
    })
    const map = new Map<string, AgendaEvento[]>()
    for (const ev of ordenados) {
      const arr = map.get(ev.fecha)
      if (arr) arr.push(ev)
      else map.set(ev.fecha, [ev])
    }
    return Array.from(map.entries())
  }, [eventosFiltrados])

  // ── Diálogo ──────────────────────────────────────────────────────────────
  function abrirNuevo(fecha?: string) {
    setForm(formVacio(fecha ?? hoyISO))
    setDialogOpen(true)
  }

  function abrirEditar(id: string) {
    const ev = eventos.find((e) => e.id === id)
    if (!ev) return
    setForm({
      id: ev.id,
      titulo: ev.titulo,
      categoria: ev.categoria,
      // En instancias recurrentes editamos la serie → fecha del maestro.
      fecha: ev.fecha_base ?? ev.fecha,
      todo_el_dia: ev.todo_el_dia,
      hora_inicio: hhmm(ev.hora_inicio) ?? "",
      hora_fin: hhmm(ev.hora_fin) ?? "",
      responsable: ev.responsable ?? "",
      ubicacion: ev.ubicacion ?? "",
      descripcion: ev.descripcion ?? "",
      recurrencia: ev.recurrencia,
      recurrencia_hasta: ev.recurrencia_hasta ?? "",
    })
    setDialogOpen(true)
  }

  async function guardar() {
    if (!form.titulo.trim()) {
      toast.error("El título es obligatorio.")
      return
    }
    const input: AgendaEventoInput = {
      titulo: form.titulo,
      descripcion: form.descripcion,
      fecha: form.fecha,
      todo_el_dia: form.todo_el_dia,
      hora_inicio: form.hora_inicio || null,
      hora_fin: form.hora_fin || null,
      categoria: form.categoria,
      responsable: form.responsable,
      ubicacion: form.ubicacion,
      recurrencia: form.recurrencia,
      recurrencia_hasta: form.recurrencia_hasta || null,
    }

    setGuardando(true)
    const res = form.id
      ? await actualizarEvento(form.id, input)
      : await crearEvento(input)
    setGuardando(false)

    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(form.id ? "Evento actualizado." : "Evento creado.")
    setDialogOpen(false)
    // Saltar al mes del evento guardado y refrescar.
    irAMes(parseISO(input.fecha))
  }

  async function borrar() {
    if (!form.id) return
    const msg =
      form.recurrencia !== "ninguna"
        ? "¿Eliminar TODA la serie de eventos repetidos? Esta acción no se puede deshacer."
        : "¿Eliminar este evento? Esta acción no se puede deshacer."
    if (!window.confirm(msg)) return
    setEliminando(true)
    const res = await eliminarEvento(form.id)
    setEliminando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Evento eliminado.")
    setDialogOpen(false)
    void cargarMes(mesRef)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Eventos, reuniones y recordatorios del equipo.
          </p>
        </div>
        <Button onClick={() => abrirNuevo()}>
          <CalendarPlus className="size-4" />
          Nuevo evento
        </Button>
      </div>

      <Tabs defaultValue="calendario" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="calendario">Calendario</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
          </TabsList>

          {/* Filtro por categoría */}
          <Select
            value={filtroCat}
            onValueChange={(v) => setFiltroCat(v ?? FILTRO_TODAS)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTRO_TODAS}>Todas las categorías</SelectItem>
              {CATEGORIAS_ORDEN.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORIAS[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Vista calendario ── */}
        <TabsContent value="calendario" className="space-y-3">
          {/* Barra de navegación de mes */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => irAMes(addMonths(mesRef, -1))}
                aria-label="Mes anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => irAMes(addMonths(mesRef, 1))}
                aria-label="Mes siguiente"
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => irAMes(new Date())}>
                Hoy
              </Button>
              <span className="ml-2 text-sm font-medium capitalize text-foreground">
                {format(mesRef, "LLLL yyyy", { locale: es })}
              </span>
              {cargando && (
                <Loader2 className="ml-1 size-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {CATEGORIAS_ORDEN.map((c) => (
                <span
                  key={c}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span className={cn("size-2 rounded-full", CATEGORIAS[c].dot)} />
                  {CATEGORIAS[c].label}
                </span>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden p-0">
            <CalendarMonth
              mes={mesRef}
              eventos={eventosCalendario}
              onSelectDay={(iso) => abrirNuevo(iso)}
              onSelectEvento={(id) => abrirEditar(id)}
            />
          </Card>
        </TabsContent>

        {/* ── Vista lista ── */}
        <TabsContent value="lista">
          <Card>
            <CardContent className="p-0">
              {grupos.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No hay eventos para este mes
                  {filtroCat !== FILTRO_TODAS ? " con esta categoría" : ""}.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {grupos.map(([fecha, evs]) => (
                    <li key={fecha} className="p-3 md:p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {format(parseISO(fecha), "EEEE d 'de' LLLL", { locale: es })}
                      </p>
                      <div className="space-y-2">
                        {evs.map((ev) => {
                          const meta = metaCategoria(ev.categoria)
                          const horario = rangoHorario(ev)
                          return (
                            <button
                              key={`${ev.id}-${ev.fecha}`}
                              type="button"
                              onClick={() => abrirEditar(ev.id)}
                              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                            >
                              <span
                                className={cn("mt-1 size-2.5 shrink-0 rounded-full", meta.dot)}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">
                                    {ev.titulo}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                      meta.badge,
                                    )}
                                  >
                                    {meta.label}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="size-3" />
                                    {horario ?? "Todo el día"}
                                  </span>
                                  {ev.recurrencia !== "ninguna" && (
                                    <span className="flex items-center gap-1">
                                      <Repeat className="size-3" />
                                      {labelRecurrencia(ev.recurrencia)}
                                    </span>
                                  )}
                                  {ev.responsable && (
                                    <span className="flex items-center gap-1">
                                      <User className="size-3" />
                                      {ev.responsable}
                                    </span>
                                  )}
                                  {ev.ubicacion && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="size-3" />
                                      {ev.ubicacion}
                                    </span>
                                  )}
                                </div>
                                {ev.descripcion && (
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                    {ev.descripcion}
                                  </p>
                                )}
                              </div>
                              <Pencil className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                            </button>
                          )
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Diálogo crear / editar ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !guardando && setDialogOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar evento" : "Nuevo evento"}</DialogTitle>
            <DialogDescription>
              Completá los datos del evento. Los campos con * son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ag-titulo">Título *</Label>
              <Input
                id="ag-titulo"
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ej: Reunión de logística"
                autoFocus
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ag-fecha">Fecha *</Label>
                <Input
                  id="ag-fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={form.categoria}
                  onValueChange={(v) =>
                    v && setForm((f) => ({ ...f, categoria: v as CategoriaAgenda }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_ORDEN.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", CATEGORIAS[c].dot)} />
                          {CATEGORIAS[c].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Horario: siempre visible; se deshabilita si es "todo el día". */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Horario</Label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={form.todo_el_dia}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, todo_el_dia: checked === true }))
                    }
                  />
                  Todo el día
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ag-ini" className="text-xs text-muted-foreground">
                    Hora inicio
                  </Label>
                  <Input
                    id="ag-ini"
                    type="time"
                    value={form.hora_inicio}
                    disabled={form.todo_el_dia}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hora_inicio: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ag-fin" className="text-xs text-muted-foreground">
                    Hora fin
                  </Label>
                  <Input
                    id="ag-fin"
                    type="time"
                    value={form.hora_fin}
                    disabled={form.todo_el_dia}
                    onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Repetición */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Repeat className="size-3.5" /> Repetición
                </Label>
                <Select
                  value={form.recurrencia}
                  onValueChange={(v) =>
                    v && setForm((f) => ({ ...f, recurrencia: v as Recurrencia }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCIAS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.recurrencia !== "ninguna" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ag-rec-hasta">Repetir hasta</Label>
                  <Input
                    id="ag-rec-hasta"
                    type="date"
                    value={form.recurrencia_hasta}
                    min={form.fecha}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, recurrencia_hasta: e.target.value }))
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Dejá vacío para repetir sin fecha de fin.
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ag-resp">Responsable</Label>
                <Input
                  id="ag-resp"
                  value={form.responsable}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, responsable: e.target.value }))
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ag-ubic">Ubicación</Label>
                <Input
                  id="ag-ubic"
                  value={form.ubicacion}
                  onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ag-desc">Descripción</Label>
              <Textarea
                id="ag-desc"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                placeholder="Notas, detalles, agenda del día…"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {form.id ? (
              <Button
                variant="destructive"
                onClick={borrar}
                disabled={guardando || eliminando}
              >
                {eliminando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {form.recurrencia !== "ninguna" ? "Eliminar serie" : "Eliminar"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={guardando || eliminando}
              >
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={guardando || eliminando}>
                {guardando && <Loader2 className="size-4 animate-spin" />}
                {form.id ? "Guardar cambios" : "Crear evento"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
