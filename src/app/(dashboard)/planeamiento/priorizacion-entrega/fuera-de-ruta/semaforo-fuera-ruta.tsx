"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarClock, MessageSquare, ListTodo, Trash2, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  crearObservacionFueraRuta,
  eliminarObservacionFueraRuta,
  crearAccionFueraRuta,
  type FueraRutaSemaforoMes,
} from "@/actions/fuera-ruta-semaforo"
import { MOTIVOS_FUERA_RUTA, TOLERANCIA_FUERA_RUTA, motivoLabel, type EstadoDiaFueraRuta } from "@/lib/fuera-ruta/semaforo"

const INICIAL_DOW = ["D", "L", "M", "X", "J", "V", "S"]
const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

const ESTILO: Record<EstadoDiaFueraRuta, { celda: string; texto: string }> = {
  verde: { celda: "bg-emerald-500 text-white", texto: "Sin fuera de ruta" },
  rojo: { celda: "bg-red-500 text-white", texto: "Fuera de ruta sin justificar" },
  justificado: { celda: "bg-amber-400 text-amber-950", texto: "Fuera de ruta justificado" },
  pendiente: { celda: "border border-dashed border-slate-300 bg-white text-slate-500", texto: "Hoy / futuro (ruteo)" },
  sin_reparto: { celda: "bg-slate-100 text-slate-300", texto: "Sin reparto (domingo / feriado)" },
}

function fechaLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DIA_LARGO[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
}

const fmtCorta = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—")

/** Semáforo del mes estilo SLA: una celda por día. Clic = ver ese día abajo. */
export function SemaforoFueraRuta({ data, fecha }: { data: FueraRutaSemaforoMes; fecha: string }) {
  const router = useRouter()
  const ir = (f: string) => router.push(`?fecha=${f}`, { scroll: false })
  const pct = data.dias_evaluados
    ? Math.round(((data.dias_verdes + data.dias_justificados) / data.dias_evaluados) * 100)
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <CalendarClock className="size-5 text-amber-600" /> Semáforo diario
          </h2>
          <p className="text-sm text-slate-500">
            ¿Hicimos fuera de ruta ese día? Tocá un día para ver los pedidos, justificarlo o crear una acción.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Mes</label>
          <Input
            type="month"
            defaultValue={data.anio_mes}
            className="w-[10rem]"
            onChange={(e) => e.target.value && ir(`${e.target.value}-01`)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {(["verde", "justificado", "rojo", "pendiente", "sin_reparto"] as const).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-3 rounded-sm ${ESTILO[e].celda}`} /> {ESTILO[e].texto}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 min-w-[9rem] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">
                Fuera de ruta
              </th>
              <th className="min-w-[5rem] border-r border-slate-200 px-2 py-2 text-center font-semibold text-slate-700">
                % mes
              </th>
              {data.dias.map((d) => {
                const dow = new Date(`${d.fecha}T12:00:00Z`).getUTCDay()
                return (
                  <th key={d.fecha} className={`w-9 px-0 py-1 text-center font-medium ${dow === 0 ? "bg-slate-100 text-slate-400" : "text-slate-500"}`}>
                    <div className="text-xs leading-tight">{Number(d.fecha.slice(8))}</div>
                    <div className="text-[10px] leading-tight text-slate-400">{INICIAL_DOW[dow]}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-200">
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">Días sin fuera de ruta</div>
                {data.dias_verdes} verdes · {data.dias_justificados} justif. · {data.dias_rojos} rojos
              </td>
              <td className="border-r border-slate-200 px-2 py-2 text-center">
                <span
                  title="Días verdes + justificados sobre los días con reparto ya cerrados"
                  className={`inline-block rounded px-2 py-0.5 text-sm font-bold tabular-nums ${
                    pct === null ? "text-slate-400" : data.dias_rojos === 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {pct === null ? "—" : `${pct}%`}
                </span>
              </td>
              {data.dias.map((d) => {
                const sel = d.fecha === fecha
                const marca = d.observaciones > 0 || d.acciones_abiertas > 0
                return (
                  <td key={d.fecha} className="px-0.5 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => ir(d.fecha)}
                      title={`${fechaLabel(d.fecha)} · ${ESTILO[d.estado].texto}${d.pedidos ? ` · ${d.pedidos} pedidos, ${d.bultos} bultos` : ""}${d.tolerancia ? ` · aceptado por Logística (≤ ${TOLERANCIA_FUERA_RUTA} pedidos)` : ""}${d.posterior_feriado ? " · día posterior a feriado" : ""}`}
                      className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded text-[11px] font-semibold tabular-nums transition ${ESTILO[d.estado].celda} ${sel ? "ring-2 ring-slate-900 ring-offset-1" : "hover:opacity-80"}`}
                    >
                      {d.estado === "verde" ? "✓" : d.pedidos > 0 ? d.pedidos : ""}
                      {marca && (
                        <span className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ring-1 ring-white ${d.acciones_abiertas ? "bg-blue-600" : "bg-slate-700"}`} />
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {data.aviso && <p className="text-xs text-amber-700">{data.aviso}</p>}
      <p className="text-xs text-slate-500">
        El número es la cantidad de pedidos entregados fuera de ruta. Hasta {TOLERANCIA_FUERA_RUTA} pedidos
        en el día, Logística lo acepta: queda justificado sin observación. Punto oscuro = tiene observación; azul = acción abierta.
      </p>
    </div>
  )
}

/** Observaciones (justificación) y acciones del día elegido. */
export function DiaFueraRuta({ data, fecha }: { data: FueraRutaSemaforoMes; fecha: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [motivo, setMotivo] = useState("")
  const [texto, setTexto] = useState("")
  const [justifica, setJustifica] = useState(true)
  const [abrirAccion, setAbrirAccion] = useState(false)

  const dia = data.dias.find((d) => d.fecha === fecha)
  const obs = data.observaciones.filter((o) => o.fecha === fecha)
  const acciones = data.acciones.filter((a) => a.fecha === fecha)

  function registrar() {
    start(async () => {
      const r = await crearObservacionFueraRuta({ fecha, motivo, texto, justifica })
      if ("error" in r) return void toast.error(r.error)
      toast.success("Observación registrada")
      setTexto("")
      setMotivo("")
      router.refresh()
    })
  }

  function borrar(id: string) {
    if (!confirm("¿Borrar esta observación?")) return
    start(async () => {
      const r = await eliminarObservacionFueraRuta(id)
      if ("error" in r) return void toast.error(r.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-800">{fechaLabel(fecha)}</h2>
        {dia && (
          <Badge className={`border-0 ${ESTILO[dia.estado].celda}`}>{ESTILO[dia.estado].texto}</Badge>
        )}
        {dia?.tolerancia && (
          <Badge variant="outline" className="border-amber-300 text-amber-800">
            Aceptado por Logística (hasta {TOLERANCIA_FUERA_RUTA} pedidos)
          </Badge>
        )}
        {dia?.posterior_feriado && (
          <Badge variant="outline" className="border-amber-300 text-amber-800">Día posterior a feriado</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Observaciones */}
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <MessageSquare className="size-4" /> Observaciones / justificación
          </h3>
          {obs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin observaciones para este día.</p>
          ) : (
            <ul className="space-y-2">
              {obs.map((o) => (
                <li key={o.id} className="rounded border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="mr-1.5 text-xs font-semibold text-slate-700">{motivoLabel(o.motivo)}</span>
                      {o.justifica ? (
                        <Badge className="h-4 border-0 bg-amber-100 px-1 text-[10px] text-amber-800">Justifica el día</Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">Sólo nota</Badge>
                      )}
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{o.texto}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {o.autor_nombre ?? "—"} ·{" "}
                        {new Date(o.created_at).toLocaleString("es-AR", {
                          day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
                          timeZone: "America/Argentina/Buenos_Aires",
                        })}
                      </p>
                    </div>
                    {data.puede_editar && (
                      <button type="button" onClick={() => borrar(o.id)} className="text-slate-400 hover:text-red-600" title="Borrar">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.puede_editar && (
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Motivo…</option>
                {MOTIVOS_FUERA_RUTA.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Qué pasó ese día (p. ej. feriado del lunes: los clientes de lunes se entregaron el martes)"
                rows={2}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={justifica} onChange={(e) => setJustifica(e.target.checked)} />
                  Justifica el día (pasa a ámbar)
                </label>
                <Button size="sm" onClick={registrar} disabled={pending || !motivo || !texto.trim()}>
                  Registrar observación
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <ListTodo className="size-4" /> Acciones
            </h3>
            {data.puede_editar && (
              <Button size="sm" variant="outline" onClick={() => setAbrirAccion(true)}>
                <Plus className="mr-1 size-3.5" /> Crear acción
              </Button>
            )}
          </div>
          {acciones.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin acciones para este día.</p>
          ) : (
            <ul className="space-y-2">
              {acciones.map((a) => (
                <li key={a.id} className="rounded border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm">
                  <Link href={`/planes/${a.id}`} className="font-medium text-slate-800 hover:underline">
                    {a.descripcion}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <EstadoAccion estado={a.estado} />
                    <span>{a.responsable ?? "—"}</span>· <span>vence {fmtCorta(a.fecha_limite)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            Las acciones quedan en Planes (punto 3.3 Planeamiento) y se siguen desde ahí.
          </p>
        </div>
      </div>

      <AccionDialog open={abrirAccion} onOpenChange={setAbrirAccion} fecha={fecha} onOk={() => router.refresh()} />
    </div>
  )
}

function EstadoAccion({ estado }: { estado: string }) {
  if (estado === "completado") return <Badge className="h-4 border-0 bg-emerald-100 px-1 text-[10px] text-emerald-800">Cerrada</Badge>
  if (estado === "en_progreso") return <Badge className="h-4 border-0 bg-blue-100 px-1 text-[10px] text-blue-800">En curso</Badge>
  return <Badge className="h-4 border-0 bg-slate-200 px-1 text-[10px] text-slate-700">No comenzada</Badge>
}

function AccionDialog({
  open, onOpenChange, fecha, onOk,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fecha: string
  onOk: () => void
}) {
  const [pending, start] = useTransition()
  const [descripcion, setDescripcion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [limite, setLimite] = useState("")
  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">("media")

  function guardar() {
    start(async () => {
      const r = await crearAccionFueraRuta({ fecha, descripcion, responsable, fecha_limite: limite, prioridad })
      if ("error" in r) return void toast.error(r.error)
      toast.success("Acción creada")
      setDescripcion("")
      setResponsable("")
      setLimite("")
      onOpenChange(false)
      onOk()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear acción</DialogTitle>
          <DialogDescription>Fuera de ruta del {fechaLabel(fecha)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué hay que hacer (p. ej. corregir el día pactado de los clientes de Pergamino en Chess)"
            rows={3}
          />
          <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Responsable" />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Vence</label>
              <Input type="date" value={limite} onChange={(e) => setLimite(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Prioridad</label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as "alta" | "media" | "baja")}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={pending || !descripcion.trim() || !responsable.trim()}>
            {pending ? "Guardando…" : "Crear acción"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
