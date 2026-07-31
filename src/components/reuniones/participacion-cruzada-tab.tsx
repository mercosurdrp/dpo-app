"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Handshake,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CalendarMonth,
  type CalendarEvento,
} from "@/components/ui/calendar-month"
import { getSignedUrl, listReunionesRango, puedeEditarReuniones } from "@/actions/reuniones"
import {
  actualizarPlanParticipacionCruzada,
  eliminarParticipacionCruzada,
  generarPlanCruces,
  listParticipacionesCruzadas,
  marcarCruceNoRealizado,
  programarParticipacionCruzada,
  registrarCruceExterno,
} from "@/actions/participaciones-cruzadas"
import { DetalleCruceDialog } from "@/components/reuniones/detalle-cruce-dialog"
import { labelDeFoto } from "@/lib/participacion-cruzada-fotos"
import { prepararFotos } from "@/lib/preparar-fotos-cruce"
import {
  PARTICIPACION_CRUZADA_SENTIDO_LABELS,
  type ParticipacionCruzada,
  type ParticipacionCruzadaSentido,
  type Reunion,
  type TipoReunion,
} from "@/types/database"

const TIPO_LABEL: Record<TipoReunion, string> = {
  logistica: "Logística",
  "logistica-ventas": "Logística-Ventas",
  "matinal-distribucion": "Matinal Distribución",
  warehouse: "Warehouse",
  presupuesto: "Presupuesto",
  mantenimiento: "Mantenimiento",
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function formatFechaCorta(s: string | null): string {
  if (!s) return "—"
  const [y, m, d] = s.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

export function ParticipacionCruzadaTab() {
  const router = useRouter()
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(() => new Date())
  const [cruces, setCruces] = useState<ParticipacionCruzada[]>([])
  const [reuniones, setReuniones] = useState<Reunion[]>([])
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [abrirGenerar, setAbrirGenerar] = useState(false)
  const [abrirProgramar, setAbrirProgramar] = useState(false)
  const [editando, setEditando] = useState<ParticipacionCruzada | null>(null)
  const [viendo, setViendo] = useState<ParticipacionCruzada | null>(null)
  const [registrando, setRegistrando] = useState<ParticipacionCruzada | null>(null)
  const [registrandoNuevo, setRegistrandoNuevo] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [resCruces, resReuniones, editor] = await Promise.all([
      listParticipacionesCruzadas(anio),
      listReunionesRango(`${anio}-01-01`, `${anio}-12-31`),
      puedeEditarReuniones(),
    ])
    if ("error" in resCruces) setError(resCruces.error)
    else setCruces(resCruces.data)
    if (!("error" in resReuniones)) setReuniones(resReuniones.data)
    setPuedeEditar(editor)
    setCargando(false)
  }, [anio])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const resumen = useMemo(() => {
    const realizadas = cruces.filter((c) => c.estado === "realizada").length
    const programadas = cruces.filter((c) => c.estado === "programada").length
    const noRealizadas = cruces.filter((c) => c.estado === "no_realizada").length
    const planificadas = realizadas + programadas + noRealizadas
    const pct = planificadas > 0 ? Math.round((realizadas / planificadas) * 100) : null
    return { realizadas, programadas, noRealizadas, planificadas, pct }
  }, [cruces])

  /** El calendario muestra las reuniones del mes + los cruces (encima). */
  const eventos = useMemo<CalendarEvento[]>(() => {
    const out: CalendarEvento[] = []
    for (const r of reuniones) {
      out.push({
        id: `r:${r.id}`,
        fecha: r.fecha,
        titulo: TIPO_LABEL[r.tipo as TipoReunion] ?? r.tipo,
        chip: "bg-slate-100 text-slate-700",
      })
    }
    for (const c of cruces) {
      const fecha = c.fecha_real ?? c.fecha_plan
      if (!fecha) continue
      const chip =
        c.estado === "realizada"
          ? "bg-emerald-100 text-emerald-800"
          : c.estado === "no_realizada"
            ? "bg-red-100 text-red-800"
            : "bg-amber-100 text-amber-800"
      out.push({
        id: `c:${c.id}`,
        fecha,
        titulo: `⇄ ${c.sentido === "ventas_a_operaciones" ? "Ventas→Op." : "Op.→Ventas"}`,
        chip,
      })
    }
    return out
  }, [reuniones, cruces])

  function onSelectEvento(id: string) {
    if (id.startsWith("r:")) {
      router.push(`/reuniones/${id.slice(2)}`)
      return
    }
    // Cruce: se abre la ficha con lo que se planificó y lo que pasó.
    const cruce = cruces.find((c) => c.id === id.slice(2))
    if (cruce) setViendo(cruce)
  }

  function cambiarMes(delta: number) {
    setMes((m) => {
      const n = new Date(m)
      n.setMonth(n.getMonth() + delta)
      if (n.getFullYear() !== anio) setAnio(n.getFullYear())
      return n
    })
  }

  function noRealizada(c: ParticipacionCruzada) {
    const motivo = prompt("¿Por qué no se hizo?")
    if (!motivo) return
    startTransition(async () => {
      const result = await marcarCruceNoRealizado(c.id, motivo)
      if ("error" in result) setError(result.error)
      else void cargar()
    })
  }

  function eliminar(c: ParticipacionCruzada) {
    if (!confirm("¿Eliminar esta fecha del plan?")) return
    startTransition(async () => {
      const result = await eliminarParticipacionCruzada(c.id)
      if ("error" in result) setError(result.error)
      else void cargar()
    })
  }

  async function verFoto(path: string) {
    const result = await getSignedUrl(path)
    if ("error" in result) {
      setError(result.error)
      return
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer")
  }

  const anios = useMemo(() => {
    const actual = new Date().getFullYear()
    return [actual + 1, actual, actual - 1]
  }, [])

  return (
    <div className="space-y-4">
      {/* Encabezado + resumen */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Handshake className="size-5 text-emerald-600" />
            Participación cruzada Ventas ↔ Operaciones
          </h2>
          <p className="text-sm text-muted-foreground">
            Plan de participaciones y su evidencia (pilar Planeamiento).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Año</Label>
            <Select
              value={String(anio)}
              onValueChange={(v) => {
                const y = Number(v)
                setAnio(y)
                setMes(new Date(y, new Date().getMonth(), 1))
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anios.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {puedeEditar && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAbrirGenerar(true)}>
                <Wand2 className="mr-2 size-4" />
                Generar plan
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAbrirProgramar(true)}>
                <Plus className="mr-2 size-4" />
                Programar
              </Button>
              <Button size="sm" onClick={() => setRegistrandoNuevo(true)}>
                <Camera className="mr-2 size-4" />
                Registrar participación
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Planificadas", valor: resumen.planificadas, color: "text-slate-900" },
          { label: "Realizadas", valor: resumen.realizadas, color: "text-emerald-700" },
          { label: "Pendientes", valor: resumen.programadas, color: "text-amber-700" },
          {
            label: "Cumplimiento",
            valor: resumen.pct === null ? "—" : `${resumen.pct}%`,
            color: "text-slate-900",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {k.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${k.color}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {/* Calendario del mes: TODAS las reuniones + los cruces */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {MESES[mes.getMonth()]} {mes.getFullYear()}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => cambiarMes(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMes(new Date())}>
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={() => cambiarMes(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando…
            </p>
          ) : (
            <>
              <CalendarMonth
                mes={mes}
                eventos={eventos}
                onSelectEvento={onSelectEvento}
                maxPorDia={4}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Clic en un ⇄ para ver qué se planificó y qué pasó; en una
                reunión gris, para abrirla. Verde: cruce realizado · Ámbar:
                cruce planificado · Rojo: no se hizo.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Plan del año */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan {anio}</CardTitle>
        </CardHeader>
        <CardContent>
          {cruces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay participaciones cruzadas.{" "}
              {puedeEditar
                ? "Usá «Generar plan» para armar el calendario del año (una por mes o cada 15 días, alternando el sentido)."
                : ""}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {cruces.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <button
                    type="button"
                    className="min-w-0 rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    onClick={() => setViendo(c)}
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {formatFechaCorta(c.fecha_real ?? c.fecha_plan)} ·{" "}
                      {PARTICIPACION_CRUZADA_SENTIDO_LABELS[c.sentido]}
                      {c.destino ? ` · ${c.destino}` : ""}
                    </p>
                    {c.tema && (
                      <p className="text-xs text-slate-700">
                        <span className="text-muted-foreground">Tema: </span>
                        {c.tema}
                      </p>
                    )}
                    {c.estado === "programada" && c.participantes_previstos && (
                      <p className="text-xs text-muted-foreground">
                        Deberían participar: {c.participantes_previstos}
                      </p>
                    )}
                    {c.participantes && (
                      <p className="text-xs text-muted-foreground">
                        Participaron: {c.participantes}
                      </p>
                    )}
                    {c.minuta && (
                      <p className="text-xs text-muted-foreground">{c.minuta}</p>
                    )}
                    {c.motivo && (
                      <p className="text-xs text-red-700">No se hizo: {c.motivo}</p>
                    )}
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        c.estado === "realizada"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : c.estado === "no_realizada"
                            ? "border-red-300 bg-red-50 text-red-800"
                            : "border-amber-300 bg-amber-50 text-amber-800"
                      }
                    >
                      {c.estado === "realizada"
                        ? "Realizada"
                        : c.estado === "no_realizada"
                          ? "No realizada"
                          : "Programada"}
                    </Badge>
                    {c.fotos.map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant="outline"
                        onClick={() => verFoto(f)}
                      >
                        <Camera className="mr-1.5 size-4" />
                        {labelDeFoto(f)}
                      </Button>
                    ))}
                    {c.reunion_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/reuniones/${c.reunion_id}`)}
                      >
                        Ver reunión
                      </Button>
                    )}
                    {puedeEditar && c.estado === "programada" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditando(c)}
                          aria-label="Editar lo programado"
                        >
                          <Pencil className="mr-2 size-4" />
                          Editar
                        </Button>
                        <Button size="sm" onClick={() => setRegistrando(c)}>
                          <Camera className="mr-2 size-4" />
                          Marcar hecha
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => noRealizada(c)}
                        >
                          No se hizo
                        </Button>
                      </>
                    )}
                    {puedeEditar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => eliminar(c)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <GenerarPlanDialog
        open={abrirGenerar}
        onOpenChange={setAbrirGenerar}
        anio={anio}
        onSaved={cargar}
      />
      <ProgramarDialog
        /* remonta el form al cambiar de fila: refresca sentido y defaultValue */
        key={editando?.id ?? "nuevo"}
        open={abrirProgramar || editando !== null}
        editando={editando}
        onOpenChange={(v) => {
          if (v) return
          setAbrirProgramar(false)
          setEditando(null)
        }}
        onSaved={cargar}
      />
      <DetalleCruceDialog
        key={viendo?.id ?? "ninguno"}
        cruce={viendo}
        puedeEditar={puedeEditar}
        onClose={() => setViendo(null)}
        onEditar={(c) => {
          setViendo(null)
          setEditando(c)
        }}
        onRegistrar={(c) => {
          setViendo(null)
          setRegistrando(c)
        }}
        onVerReunion={(id) => router.push(`/reuniones/${id}`)}
      />
      <RegistrarDialog
        cruce={registrando}
        nuevo={registrandoNuevo}
        onClose={() => {
          setRegistrando(null)
          setRegistrandoNuevo(false)
        }}
        onSaved={cargar}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function GenerarPlanDialog({
  open,
  onOpenChange,
  anio,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  anio: number
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [frecuencia, setFrecuencia] = useState<"mensual" | "quincenal">("mensual")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const desde = String(fd.get("desde") ?? "")
    const hasta = String(fd.get("hasta") ?? "")
    startTransition(async () => {
      const result = await generarPlanCruces({ desde, hasta, frecuencia })
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generar plan de participaciones</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen_desde">Desde *</Label>
              <Input
                id="gen_desde"
                name="desde"
                type="date"
                defaultValue={iso(new Date())}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen_hasta">Hasta *</Label>
              <Input
                id="gen_hasta"
                name="hasta"
                type="date"
                defaultValue={`${anio}-12-31`}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Frecuencia *</Label>
            <Select
              value={frecuencia}
              onValueChange={(v) =>
                setFrecuencia((v ?? "mensual") as "mensual" | "quincenal")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">Una por mes</SelectItem>
                <SelectItem value="quincenal">Cada 15 días</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se alterna el sentido: una vez va Ventas a Operaciones y la
              siguiente, Operaciones a Ventas. Las fechas que ya tengan algo
              cargado no se tocan.
            </p>
          </div>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Generar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Alta y edición de una fecha del plan. Además de la fecha y el sentido se
 * define de antemano QUÉ TEMA se va a tratar y QUIÉNES deberían ir: es lo que
 * después se compara contra lo que realmente pasó.
 */
function ProgramarDialog({
  open,
  editando,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  /** Si viene, se edita esa fecha del plan en vez de crear una nueva. */
  editando?: ParticipacionCruzada | null
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // El padre remonta este diálogo con `key` al cambiar de fila, así que el
  // estado inicial alcanza: no hace falta sincronizarlo con un efecto.
  const [sentido, setSentido] = useState<ParticipacionCruzadaSentido>(
    editando?.sentido ?? "ventas_a_operaciones",
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const campos = {
      fecha_plan: String(fd.get("fecha") ?? ""),
      sentido,
      destino: String(fd.get("destino") ?? ""),
      tema: String(fd.get("tema") ?? ""),
      participantes_previstos: String(fd.get("participantes_previstos") ?? ""),
    }
    startTransition(async () => {
      const result = editando
        ? await actualizarPlanParticipacionCruzada({ id: editando.id, ...campos })
        : await programarParticipacionCruzada(campos)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editando
              ? "Editar la participación programada"
              : "Programar una participación cruzada"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prog_fecha">Fecha *</Label>
            <Input
              id="prog_fecha"
              name="fecha"
              type="date"
              defaultValue={editando?.fecha_plan ?? ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sentido *</Label>
            <Select
              value={sentido}
              onValueChange={(v) =>
                setSentido((v ?? "ventas_a_operaciones") as ParticipacionCruzadaSentido)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ventas_a_operaciones">
                  Ventas participa en Operaciones
                </SelectItem>
                <SelectItem value="operaciones_a_ventas">
                  Operaciones participa en Ventas
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prog_destino">A qué reunión</Label>
            <Input
              id="prog_destino"
              name="destino"
              defaultValue={editando?.destino ?? ""}
              placeholder="Matinal Distribución, Matinal de Ventas…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prog_tema">Tema a tratar</Label>
            <Textarea
              id="prog_tema"
              name="tema"
              rows={3}
              defaultValue={editando?.tema ?? ""}
              placeholder="Qué se va a llevar a esa reunión: quiebres de stock, rechazos del mes, ventana horaria de entrega…"
            />
            <p className="text-xs text-muted-foreground">
              Queda escrito de antemano: es la evidencia de que la participación
              se planificó con un objetivo.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prog_previstos">Quiénes deberían participar</Label>
            <Input
              id="prog_previstos"
              name="participantes_previstos"
              defaultValue={editando?.participantes_previstos ?? ""}
              placeholder="Nombre y apellido, separados por coma"
            />
          </div>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {editando ? "Guardar" : "Programar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RegistrarDialog({
  cruce,
  nuevo,
  onClose,
  onSaved,
}: {
  cruce: ParticipacionCruzada | null
  nuevo: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sentido, setSentido] = useState<ParticipacionCruzadaSentido>(
    "ventas_a_operaciones",
  )

  const open = nuevo || cruce !== null

  useEffect(() => {
    if (cruce) setSentido(cruce.sentido)
  }, [cruce])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (cruce) fd.set("id", cruce.id)
    fd.set("sentido", sentido)

    startTransition(async () => {
      const preparado = await prepararFotos(fd)
      if ("error" in preparado) {
        setError(preparado.error)
        return
      }
      const result = await registrarCruceExterno(preparado.formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar la participación</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sentido *</Label>
            <Select
              value={sentido}
              onValueChange={(v) =>
                setSentido((v ?? "ventas_a_operaciones") as ParticipacionCruzadaSentido)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ventas_a_operaciones">
                  Ventas participó en Operaciones
                </SelectItem>
                <SelectItem value="operaciones_a_ventas">
                  Operaciones participó en Ventas
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg_fecha">Fecha *</Label>
              <Input
                id="reg_fecha"
                name="fecha_real"
                type="date"
                defaultValue={cruce?.fecha_plan ?? iso(new Date())}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg_destino">Reunión</Label>
              <Input
                id="reg_destino"
                name="destino"
                defaultValue={cruce?.destino ?? ""}
                placeholder="Matinal de Ventas…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg_tema">Tema tratado</Label>
            <Textarea
              id="reg_tema"
              name="tema"
              rows={2}
              defaultValue={cruce?.tema ?? ""}
              placeholder="Qué tema se llevó a la reunión…"
            />
            {cruce?.tema && (
              <p className="text-xs text-muted-foreground">
                Viene del plan. Si terminó tratándose otra cosa, corregilo.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg_part">Quiénes participaron *</Label>
            <Input
              id="reg_part"
              name="participantes"
              defaultValue={cruce?.participantes_previstos ?? ""}
              placeholder="Nombre y apellido, separados por coma"
              required
            />
            {cruce?.participantes_previstos && (
              <p className="text-xs text-muted-foreground">
                Previstos: {cruce.participantes_previstos}. Dejá sólo los que
                fueron de verdad.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg_minuta">Breve minuta</Label>
            <Textarea
              id="reg_minuta"
              name="minuta"
              rows={3}
              placeholder="Qué se habló…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg_foto_tema">Captura del tema tratado</Label>
            <Input
              id="reg_foto_tema"
              name="foto_tema"
              type="file"
              accept="image/*"
              multiple
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg_foto_part">Foto de los participantes</Label>
            <Input
              id="reg_foto_part"
              name="foto_participantes"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
            />
            <p className="text-xs text-muted-foreground">
              Podés subir varias de cada tipo. Al menos una foto es obligatoria:
              es la evidencia.
            </p>
          </div>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
