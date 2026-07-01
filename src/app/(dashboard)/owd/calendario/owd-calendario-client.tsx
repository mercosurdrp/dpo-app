"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns"
import { es } from "date-fns/locale"
import { Card, CardContent } from "@/components/ui/card"
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
import { CalendarMonth, type CalendarEvento } from "@/components/ui/calendar-month"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Trash2,
  ClipboardPlus,
  CalendarDays,
} from "lucide-react"
import {
  crearAgenda,
  actualizarAgenda,
  eliminarAgenda,
  listarAgendaEnRango,
} from "@/actions/owd-agenda"
import {
  AGENDA_COLORES,
  ESTADO_LABEL,
  type AgendaOwd,
  type AgendaEstado,
} from "@/lib/owd-agenda"

interface TemplateOpt {
  id: string
  nombre: string
  pilar: string
}
interface Props {
  templates: TemplateOpt[]
  empleados: string[]
  agendaInicial: AgendaOwd[]
  supervisorDefault: string
}

type Form = {
  template_id: string
  fecha: string
  supervisor: string
  empleado: string
  nota: string
  estado: AgendaEstado
}

function rango(mes: Date) {
  return {
    desde: format(startOfWeek(startOfMonth(mes), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    hasta: format(endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  }
}

export function OwdCalendarioClient({
  templates,
  empleados,
  agendaInicial,
  supervisorDefault,
}: Props) {
  const router = useRouter()
  const [mes, setMes] = useState(() => new Date())
  const [items, setItems] = useState<AgendaOwd[]>(agendaInicial)
  const [loading, startLoading] = useTransition()
  const [saving, setSaving] = useState(false)

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>({
    template_id: "",
    fecha: "",
    supervisor: supervisorDefault,
    empleado: "",
    nota: "",
    estado: "planificada",
  })

  // Color estable por plantilla (según su orden).
  const colorDe = useMemo(() => {
    const m = new Map<string, { dot: string; chip: string }>()
    templates.forEach((t, i) => m.set(t.id, AGENDA_COLORES[i % AGENDA_COLORES.length]))
    return m
  }, [templates])
  const nombreDe = useMemo(() => {
    const m = new Map<string, string>()
    templates.forEach((t) => m.set(t.id, t.nombre))
    return m
  }, [templates])

  // Recargar al cambiar de mes (salta la primera vez: ya vino precargado).
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) {
      primera.current = false
      return
    }
    const { desde, hasta } = rango(mes)
    startLoading(async () => {
      const r = await listarAgendaEnRango(desde, hasta)
      if ("data" in r) setItems(r.data)
      else toast.error(r.error)
    })
  }, [mes])

  async function recargar() {
    const { desde, hasta } = rango(mes)
    const r = await listarAgendaEnRango(desde, hasta)
    if ("data" in r) setItems(r.data)
  }

  const eventos: CalendarEvento[] = useMemo(
    () =>
      items.map((it) => {
        const base = nombreDe.get(it.template_id) ?? "OWD"
        const titulo = it.empleado_observado ? `${base} · ${it.empleado_observado}` : base
        let dot = colorDe.get(it.template_id)?.dot ?? "bg-slate-400"
        let chip = colorDe.get(it.template_id)?.chip ?? "bg-muted text-foreground"
        let prefijo = ""
        if (it.estado === "realizada") {
          prefijo = "✓ "
          dot = "bg-green-600"
          chip = "bg-green-100 text-green-700 hover:bg-green-200"
        } else if (it.estado === "cancelada") {
          prefijo = "✕ "
          dot = "bg-slate-400"
          chip = "bg-slate-100 text-slate-400 line-through hover:bg-slate-200"
        }
        return { id: it.id, fecha: it.fecha, titulo: prefijo + titulo, dot, chip }
      }),
    [items, colorDe, nombreDe],
  )

  const resumen = useMemo(() => {
    const c = { planificada: 0, realizada: 0, cancelada: 0 }
    for (const it of items) c[it.estado]++
    return c
  }, [items])

  function abrirNuevo(fechaISO: string) {
    setEditId(null)
    setForm({
      template_id: templates[0]?.id ?? "",
      fecha: fechaISO,
      supervisor: supervisorDefault,
      empleado: "",
      nota: "",
      estado: "planificada",
    })
    setOpen(true)
  }

  function abrirEvento(id: string) {
    const it = items.find((x) => x.id === id)
    if (!it) return
    setEditId(it.id)
    setForm({
      template_id: it.template_id,
      fecha: it.fecha,
      supervisor: it.supervisor ?? "",
      empleado: it.empleado_observado ?? "",
      nota: it.nota ?? "",
      estado: it.estado,
    })
    setOpen(true)
  }

  async function guardar() {
    if (!form.template_id) {
      toast.error("Elegí qué OWD vas a agendar.")
      return
    }
    setSaving(true)
    const input = {
      template_id: form.template_id,
      fecha: form.fecha,
      supervisor: form.supervisor,
      empleado_observado: form.empleado,
      nota: form.nota,
      estado: form.estado,
    }
    const r = editId ? await actualizarAgenda(editId, input) : await crearAgenda(input)
    setSaving(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success(editId ? "Agenda actualizada" : "OWD agendada")
    setOpen(false)
    await recargar()
  }

  async function borrar() {
    if (!editId) return
    setSaving(true)
    const r = await eliminarAgenda(editId)
    setSaving(false)
    if ("error" in r) {
      toast.error(r.error)
      return
    }
    toast.success("Agenda eliminada")
    setOpen(false)
    await recargar()
  }

  function cargarOwd() {
    if (!editId || !form.template_id) return
    const qs = new URLSearchParams({
      fecha: form.fecha,
      supervisor: form.supervisor,
      empleado: form.empleado,
      agendaId: editId,
    })
    router.push(`/owd/${form.template_id}/nueva?${qs.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Encabezado + navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <CalendarDays className="h-6 w-6 text-slate-500" /> Calendario de OWD
          </h1>
          <p className="text-sm text-muted-foreground">
            Planificá los días en que vas a hacer cada OWD. Tocá un día para agendar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMes((m) => subMonths(m, 1))} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-semibold capitalize">
            {format(mes, "LLLL yyyy", { locale: es })}
            {loading && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </span>
          <Button variant="outline" size="icon" onClick={() => setMes((m) => addMonths(m, 1))} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMes(new Date())}>
            Hoy
          </Button>
          <Button onClick={() => abrirNuevo(format(new Date(), "yyyy-MM-dd"))}>
            <Plus className="mr-1 h-4 w-4" /> Agendar
          </Button>
        </div>
      </div>

      {/* Resumen del rango visible */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">
          {resumen.planificada} planificadas
        </span>
        <span className="rounded-md bg-green-50 px-2 py-1 font-medium text-green-700">
          {resumen.realizada} realizadas
        </span>
        {resumen.cancelada > 0 && (
          <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-500">
            {resumen.cancelada} canceladas
          </span>
        )}
      </div>

      {/* Referencia de colores por plantilla */}
      <div className="flex flex-wrap gap-3">
        {templates.map((t) => (
          <span key={t.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${colorDe.get(t.id)?.dot}`} />
            {t.nombre}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="p-2 sm:p-3">
          <CalendarMonth mes={mes} eventos={eventos} onSelectDay={abrirNuevo} onSelectEvento={abrirEvento} />
        </CardContent>
      </Card>

      {/* Diálogo alta / edición */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar OWD agendada" : "Agendar OWD"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>OWD</Label>
              <Select
                value={form.template_id}
                onValueChange={(v) => setForm((f) => ({ ...f, template_id: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí la OWD" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Supervisor</Label>
                <Input
                  value={form.supervisor}
                  placeholder="Quién la hace"
                  onChange={(e) => setForm((f) => ({ ...f, supervisor: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Empleado a observar (opcional)</Label>
              <Input
                list="owd-empleados"
                value={form.empleado}
                placeholder="Chofer / ayudante"
                onChange={(e) => setForm((f) => ({ ...f, empleado: e.target.value }))}
              />
              <datalist id="owd-empleados">
                {empleados.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label>Nota (opcional)</Label>
              <Textarea
                value={form.nota}
                rows={2}
                placeholder="Ej: foco en EPP / turno mañana / cliente X…"
                onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
              />
            </div>

            {editId && (
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={form.estado}
                  onValueChange={(v) => setForm((f) => ({ ...f, estado: (v ?? "planificada") as AgendaEstado }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ESTADO_LABEL) as AgendaEstado[]).map((e) => (
                      <SelectItem key={e} value={e}>
                        {ESTADO_LABEL[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editId && (
              <Button variant="secondary" className="w-full" onClick={cargarOwd}>
                <ClipboardPlus className="mr-2 h-4 w-4" /> Cargar OWD ahora
              </Button>
            )}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editId ? (
              <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={borrar} disabled={saving}>
                <Trash2 className="mr-1 h-4 w-4" /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={guardar} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Guardar" : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
