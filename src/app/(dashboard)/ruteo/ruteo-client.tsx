"use client"

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import {
  Loader2,
  Play,
  Flag,
  Route,
  MapPin,
  CheckCircle2,
  Clock,
  Pencil,
  PackageX,
  Truck,
  X,
  Package,
  Users,
  Gauge,
  Target,
  AlertTriangle,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  iniciarRuteo,
  finalizarRuteo,
  setFinPreventa,
  setComentarioRuteo,
  listarRuteoHistorial,
  type RuteoCierre,
} from "@/actions/ruteo"
import {
  getOcupacionBodegaResumenDia,
  type OBResumenDia,
} from "@/actions/ocupacion-bodega-resumen-dia"

// Hora HH:mm en zona Argentina a partir de un timestamptz ISO.
const horaHHmm = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "—"

// 'YYYY-MM-DD' (DATE de Postgres) -> 'DD/MM/YYYY' sin pasar por new Date (evita
// el corrimiento de día por interpretación UTC).
const fechaCorta = (f: string) => {
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y}`
}

// Número con separador de miles es-AR (sin decimales por defecto).
const nf = (v: number, dec = 0) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })

// Carga de un viaje (fin de carga en el WMS), para cruzar por patente + fecha.
export interface CargaViaje {
  fecha: string // YYYY-MM-DD
  patente: string // normalizada (trim + mayúsculas)
  hora: string // HH:mm:ss (fin de carga)
}

// Clave del índice de carga: fecha + patente normalizada.
const cargaKey = (fecha: string, patente: string) =>
  `${fecha}|${patente.trim().toUpperCase()}`

// Lista de horas de carga 'HH:mm:ss' -> 'HH:mm / HH:mm' (únicas, ordenadas).
const horasCargaFmt = (horas: string[]) =>
  Array.from(new Set(horas.map((h) => h.slice(0, 5))))
    .sort()
    .join(" / ")

// ===== Límites SLA (misma lógica que src/actions/sla.ts) ====================

// Día de semana (0=Dom..6=Sáb) de un 'YYYY-MM-DD' sin corrimiento por TZ.
const dowFromISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// Minutos desde medianoche ARG (UTC-3 fijo) de un timestamptz ISO.
const minutosARG = (iso: string) => {
  const d = new Date(iso)
  let mins = d.getUTCHours() * 60 + d.getUTCMinutes() - 180
  if (mins < 0) mins += 1440
  return mins
}

// Límite (min desde medianoche ARG) según tipo de hito, o null si no aplica.
const limiteSla = (fecha: string, tipo: "preventa" | "ruteo"): number | null => {
  const dow = dowFromISO(fecha)
  if (dow === 0) return null // domingo: no aplica
  if (tipo === "preventa") return dow === 6 ? 7 * 60 : 8 * 60 // sáb 07:00 · L-V 08:00
  return dow === 6 ? 7 * 60 + 30 : 9 * 60 // sáb 07:30 · L-V 09:00
}

// true si la hora registrada superó el límite SLA del día (null si no aplica
// o no hay hora registrada).
const fueraDeSla = (
  hora: string | null,
  fecha: string,
  tipo: "preventa" | "ruteo",
): boolean | null => {
  if (!hora) return null
  const lim = limiteSla(fecha, tipo)
  if (lim === null) return null
  return minutosARG(hora) > lim
}

const FORM_INICIAL = {
  pergamino_bultos: "",
  pergamino_clientes: "",
  ramallo_bultos: "",
  ramallo_clientes: "",
  bultos_no_ruteados: "",
  notas: "",
}

export function RuteoClient({
  diaInicial,
  historialInicial,
  errorInicial,
  cargaInicial,
}: {
  diaInicial: RuteoCierre | null
  historialInicial: RuteoCierre[]
  errorInicial: string | null
  cargaInicial: CargaViaje[]
}) {
  const [dia, setDia] = useState<RuteoCierre | null>(diaInicial)
  const [historial, setHistorial] = useState<RuteoCierre[]>(historialInicial)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_INICIAL })
  const [pending, startTransition] = useTransition()

  // Día seleccionado en la tabla + sus camiones (ocupación de bodega).
  const [sel, setSel] = useState<RuteoCierre | null>(historialInicial[0] ?? null)
  const [ocup, setOcup] = useState<OBResumenDia | null>(null)
  const [loadingOcup, startOcup] = useTransition()

  // Índice de horas de carga por (fecha + patente). Un viaje puede cargarse
  // más de una vez en el día, por eso guardamos una lista de horas.
  const cargaIndex = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of cargaInicial) {
      const k = cargaKey(c.fecha, c.patente)
      const arr = m.get(k)
      if (arr) arr.push(c.hora)
      else m.set(k, [c.hora])
    }
    return m
  }, [cargaInicial])

  // Cargar camiones del día seleccionado.
  useEffect(() => {
    if (!sel) {
      setOcup(null)
      return
    }
    startOcup(async () => {
      const res = await getOcupacionBodegaResumenDia(sel.fecha)
      setOcup("data" in res ? res.data : null)
    })
  }, [sel])

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function refrescarHistorial() {
    const res = await listarRuteoHistorial()
    if ("data" in res) setHistorial(res.data)
  }

  function handleIniciar() {
    startTransition(async () => {
      const res = await iniciarRuteo()
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Ruteo iniciado")
      setDia(res.data)
    })
  }

  function handleFinPreventa(horaManual?: string) {
    startTransition(async () => {
      const res = await setFinPreventa(horaManual)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Fin de preventa registrado")
      setDia(res.data)
    })
  }

  function handleComentario(campo: "preventa" | "ruteo", texto: string) {
    startTransition(async () => {
      const res = await setComentarioRuteo(campo, texto)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Comentario guardado")
      setDia(res.data)
      // Si el día comentado está en el historial / panel, reflejarlo también.
      setHistorial((h) => h.map((c) => (c.id === res.data.id ? res.data : c)))
      setSel((s) => (s?.id === res.data.id ? res.data : s))
    })
  }

  function handleFinalizar() {
    if (!dia) return
    startTransition(async () => {
      const res = await finalizarRuteo({
        id: dia.id,
        pergamino_bultos: Number(form.pergamino_bultos || 0),
        pergamino_clientes: Number(form.pergamino_clientes || 0),
        ramallo_bultos: Number(form.ramallo_bultos || 0),
        ramallo_clientes: Number(form.ramallo_clientes || 0),
        bultos_no_ruteados: Number(form.bultos_no_ruteados || 0),
        notas: form.notas,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Ruteo finalizado")
      setDia(res.data)
      setMostrarForm(false)
      setForm({ ...FORM_INICIAL })
      await refrescarHistorial()
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <Route className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ruteo</h1>
          <p className="text-sm text-slate-500">
            Marcá el inicio y el fin del ruteo, y consultá los cierres anteriores
            con el detalle de camiones por día.
          </p>
        </div>
      </header>

      {errorInicial && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {errorInicial}
        </div>
      )}

      {/* ===== Controles de ingreso (en fila) ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BloqueFinPreventa
          dia={dia}
          pending={pending}
          onGuardar={handleFinPreventa}
          onComentario={(t) => handleComentario("preventa", t)}
        />
        <BloqueEstado
          dia={dia}
          pending={pending}
          mostrarForm={mostrarForm}
          onIniciar={handleIniciar}
          onAbrirForm={() => setMostrarForm(true)}
          onComentario={(t) => handleComentario("ruteo", t)}
        />
      </div>

      {/* Formulario de cierre (ancho completo, al pedir FIN DE RUTEO) */}
      {dia?.estado === "en_curso" && mostrarForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Cierre del ruteo
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <CiudadBloque
              ciudad="Pergamino"
              bultos={form.pergamino_bultos}
              clientes={form.pergamino_clientes}
              onBultos={(v) => set("pergamino_bultos", v)}
              onClientes={(v) => set("pergamino_clientes", v)}
            />
            <CiudadBloque
              ciudad="Ramallo"
              bultos={form.ramallo_bultos}
              clientes={form.ramallo_clientes}
              onBultos={(v) => set("ramallo_bultos", v)}
              onClientes={(v) => set("ramallo_clientes", v)}
            />
          </div>

          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <PackageX className="size-4 text-rose-600" />
              Volumen no ruteado (Pushed)
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <div>
                <Label className="mb-1.5 text-xs">Bultos no ruteados</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.bultos_no_ruteados}
                  onChange={(e) => set("bultos_no_ruteados", e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Bultos que quedaron sin entrar en ninguna ruta. Objetivo: ≤ 5% del
              total.
            </p>
          </div>

          <div className="mt-4">
            <Label className="mb-1.5 text-xs">Notas (opcional)</Label>
            <Textarea
              rows={1}
              value={form.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Observaciones del ruteo"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Si el cierre queda después del límite SLA (L-V 09:00 · sáb 07:30),
              dejá acá el justificativo.
            </p>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setMostrarForm(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={handleFinalizar} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 size-4" />
              )}
              Cerrar ruteo
            </Button>
          </div>
        </div>
      )}

      {/* ===== Panel de detalle del día seleccionado ===== */}
      {sel && (
        <PanelDetalleDia
          dia={sel}
          ocup={ocup}
          loading={loadingOcup}
          cargaIndex={cargaIndex}
          onClose={() => setSel(null)}
        />
      )}

      {/* ===== Tabla de cierres anteriores ===== */}
      <div>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Cierres anteriores
        </h2>
        <p className="mb-2 text-xs text-slate-500">
          Hacé clic en un día para ver arriba el detalle y los camiones.
        </p>
        {historial.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
            Todavía no hay cierres registrados.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center">Fin prev.</TableHead>
                  <TableHead className="text-center">Inicio</TableHead>
                  <TableHead className="text-center">Fin</TableHead>
                  <TableHead className="text-center">Pergamino</TableHead>
                  <TableHead className="text-center">Ramallo</TableHead>
                  <TableHead className="text-center">No ruteado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((c) => (
                  <HistorialRow
                    key={c.id}
                    c={c}
                    activa={sel?.id === c.id}
                    onClick={() => setSel(c)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

// Badge dentro/fuera del horario SLA (no se muestra si el día no aplica).
function SlaBadge({ fuera }: { fuera: boolean | null }) {
  if (fuera === null) return null
  return fuera ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
      <AlertTriangle className="size-3" />
      Fuera de horario
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="size-3" />
      En horario
    </span>
  )
}

// Comentario/justificativo de una tarjeta (fin de preventa o fin de ruteo).
// Siempre se puede cargar; si la hora quedó fuera del SLA y no hay comentario,
// se pide explícitamente el justificativo.
function ComentarioJustificativo({
  valor,
  fuera,
  pending,
  onGuardar,
}: {
  valor: string | null
  fuera: boolean | null
  pending: boolean
  onGuardar: (texto: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState("")

  function abrir() {
    setTexto(valor ?? "")
    setEditando(true)
  }

  function guardar() {
    onGuardar(texto)
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="mt-3 border-t border-slate-200/60 pt-3">
        <Label className="mb-1.5 text-xs">
          {fuera ? "Justificativo (se pasó del horario)" : "Comentario"}
        </Label>
        <Textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Motivo / observaciones del día"
          autoFocus
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditando(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={pending}>
            {pending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-slate-200/60 pt-2.5">
      {valor ? (
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-start gap-1.5 text-sm text-slate-700">
            <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            <span className="italic">{valor}</span>
          </p>
          <button
            type="button"
            onClick={abrir}
            disabled={pending}
            className="shrink-0 text-xs text-slate-500 underline hover:text-slate-700"
          >
            Editar
          </button>
        </div>
      ) : fuera ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-2.5 py-1.5">
          <p className="flex items-center gap-1.5 text-xs text-rose-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            Se pasó del horario: dejá un justificativo.
          </p>
          <Button size="sm" variant="outline" onClick={abrir} disabled={pending}>
            <MessageSquare className="mr-1 size-3.5" />
            Comentar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs text-slate-500 underline hover:text-slate-700"
        >
          <MessageSquare className="size-3.5" />
          Agregar comentario
        </button>
      )}
    </div>
  )
}

function BloqueFinPreventa({
  dia,
  pending,
  onGuardar,
  onComentario,
}: {
  dia: RuteoCierre | null
  pending: boolean
  onGuardar: (horaManual?: string) => void
  onComentario: (texto: string) => void
}) {
  const registrada = dia?.hora_fin_preventa ?? null
  const fuera = dia ? fueraDeSla(registrada, dia.fecha, "preventa") : null
  const [editando, setEditando] = useState(false)
  const [hora, setHora] = useState("")

  function abrirEdicion() {
    setHora(registrada ? horaHHmm(registrada) : "")
    setEditando(true)
  }

  function guardar() {
    onGuardar(hora || undefined)
    setEditando(false)
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 size-5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Fin de preventa
            </p>
            <p className="text-xs text-slate-500">
              Horario en que Ventas entregó la preventa a Ruteo. Límite: L-V{" "}
              <b>08:00</b> · sáb <b>07:00</b>.
            </p>
            {registrada && !editando && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <span>
                  Registrado a las{" "}
                  <span className="font-semibold tabular-nums">
                    {horaHHmm(registrada)}
                  </span>
                </span>
                <SlaBadge fuera={fuera} />
              </p>
            )}
          </div>
        </div>

        {!editando &&
          (registrada ? (
            <Button
              size="sm"
              variant="outline"
              onClick={abrirEdicion}
              disabled={pending}
            >
              <Pencil className="mr-1 size-3.5" />
              Editar
            </Button>
          ) : (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Button size="sm" onClick={() => onGuardar()} disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Clock className="mr-1 size-4" />
                )}
                Registrar ahora
              </Button>
              <button
                type="button"
                onClick={abrirEdicion}
                disabled={pending}
                className="text-xs text-amber-700 underline hover:text-amber-800"
              >
                o ingresar hora
              </button>
            </div>
          ))}
      </div>

      {editando && (
        <div className="mt-3 flex items-end gap-2 border-t border-amber-100 pt-3">
          <div>
            <Label className="mb-1.5 text-xs">Horario (HH:MM)</Label>
            <Input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="w-[8rem]"
            />
          </div>
          <Button size="sm" onClick={guardar} disabled={pending || !hora}>
            Guardar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditando(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
        </div>
      )}

      {registrada && !editando && (
        <ComentarioJustificativo
          valor={dia?.comentario_preventa ?? null}
          fuera={fuera}
          pending={pending}
          onGuardar={onComentario}
        />
      )}
    </div>
  )
}

// Tarjeta de estado del ruteo del día + acción principal (iniciar / cerrar).
function BloqueEstado({
  dia,
  pending,
  mostrarForm,
  onIniciar,
  onAbrirForm,
  onComentario,
}: {
  dia: RuteoCierre | null
  pending: boolean
  mostrarForm: boolean
  onIniciar: () => void
  onAbrirForm: () => void
  onComentario: (texto: string) => void
}) {
  // Sin iniciar (o solo con fin de preventa registrado).
  if (!dia || dia.estado === "pendiente") {
    return (
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Estado de hoy
          </p>
          <p className="mt-0.5 text-sm text-slate-700">
            Todavía no se inició el ruteo.
          </p>
        </div>
        <Button size="lg" onClick={onIniciar} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-2 size-5 animate-spin" />
          ) : (
            <Play className="mr-2 size-5" />
          )}
          INICIO DE RUTEO
        </Button>
      </div>
    )
  }

  // En curso.
  if (dia.estado === "en_curso") {
    return (
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">
            Ruteo en curso
          </p>
          <p className="mt-0.5 text-sm text-slate-700">
            Iniciado a las{" "}
            <span className="font-semibold tabular-nums">
              {horaHHmm(dia.hora_inicio)}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Límite de cierre: L-V <b>09:00</b> · sáb <b>07:30</b>.
          </p>
        </div>
        {!mostrarForm && (
          <Button onClick={onAbrirForm} disabled={pending}>
            <Flag className="mr-2 size-4" />
            FIN DE RUTEO
          </Button>
        )}
      </div>
    )
  }

  // Cerrado.
  const totalBultos = dia.pergamino_bultos + dia.ramallo_bultos
  const totalClientes = dia.pergamino_clientes + dia.ramallo_clientes
  const fuera = fueraDeSla(dia.hora_fin, dia.fecha, "ruteo")
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        fuera
          ? "border-rose-200 bg-rose-50/40"
          : "border-emerald-200 bg-emerald-50/50"
      }`}
    >
      <div
        className={`flex flex-wrap items-center gap-2 ${fuera ? "text-rose-800" : "text-emerald-800"}`}
      >
        <CheckCircle2 className="size-5" />
        <p className="text-sm font-semibold">Ruteo de hoy cerrado</p>
        <SlaBadge fuera={fuera} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {horaHHmm(dia.hora_inicio)} – {horaHHmm(dia.hora_fin)} ·{" "}
        <span className="font-semibold tabular-nums">{totalBultos}</span> blt ·{" "}
        <span className="font-semibold tabular-nums">{totalClientes}</span> cli
      </p>
      <ComentarioJustificativo
        valor={dia.notas}
        fuera={fuera}
        pending={pending}
        onGuardar={onComentario}
      />
    </div>
  )
}

function CiudadBloque({
  ciudad,
  bultos,
  clientes,
  onBultos,
  onClientes,
}: {
  ciudad: string
  bultos: string
  clientes: string
  onBultos: (v: string) => void
  onClientes: (v: string) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <MapPin className="size-4 text-indigo-600" />
        {ciudad}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 text-xs">Bultos</Label>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={bultos}
            onChange={(e) => onBultos(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label className="mb-1.5 text-xs">Clientes</Label>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={clientes}
            onChange={(e) => onClientes(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  )
}

// Mini-stat para el header del panel de detalle.
function KpiDia({
  icon,
  label,
  value,
  sub,
  tone = "slate",
}: {
  icon: ReactNode
  label: string
  value: string
  sub?: string
  tone?: "slate" | "indigo" | "rose" | "emerald"
}) {
  const toneCls = {
    slate: "text-slate-700",
    indigo: "text-indigo-700",
    rose: "text-rose-700",
    emerald: "text-emerald-700",
  }[tone]
  return (
    <div className="bg-white p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        <span className={toneCls}>{icon}</span>
        {label}
      </div>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

// Badge de % de ocupación de bodega contra el target (100% = 525 CEq).
function OcupBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 100
      ? "bg-emerald-100 text-emerald-700"
      : pct >= 80
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700"
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}
    >
      {nf(pct, 0)}%
    </span>
  )
}

// Panel destacado con el detalle de un día + los camiones (ocupación de bodega).
function PanelDetalleDia({
  dia,
  ocup,
  loading,
  cargaIndex,
  onClose,
}: {
  dia: RuteoCierre
  ocup: OBResumenDia | null
  loading: boolean
  cargaIndex: Map<string, string[]>
  onClose: () => void
}) {
  const totalBultos = dia.pergamino_bultos + dia.ramallo_bultos
  const totalClientes = dia.pergamino_clientes + dia.ramallo_clientes
  const viajes = ocup?.viajes ?? []

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-4 text-white">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="size-5" />
            <h3 className="text-base font-bold">
              Detalle del {fechaCorta(dia.fecha)}
            </h3>
          </div>
          <p className="mt-0.5 text-sm text-indigo-100">
            {horaHHmm(dia.hora_inicio)} –{" "}
            <span
              className={
                fueraDeSla(dia.hora_fin, dia.fecha, "ruteo")
                  ? "font-semibold text-amber-300"
                  : undefined
              }
            >
              {horaHHmm(dia.hora_fin)}
            </span>{" "}
            · Fin preventa{" "}
            <span
              className={
                fueraDeSla(dia.hora_fin_preventa, dia.fecha, "preventa")
                  ? "font-semibold text-amber-300"
                  : undefined
              }
            >
              {horaHHmm(dia.hora_fin_preventa)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-indigo-100 transition hover:bg-white/15 hover:text-white"
          aria-label="Cerrar detalle"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* KPIs del día */}
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-6">
        <KpiDia
          icon={<Package className="size-3.5" />}
          label="Bultos"
          value={nf(totalBultos)}
          sub={`Perg ${nf(dia.pergamino_bultos)} · Ram ${nf(dia.ramallo_bultos)}`}
          tone="indigo"
        />
        <KpiDia
          icon={<Users className="size-3.5" />}
          label="Clientes"
          value={nf(totalClientes)}
          sub={`Perg ${nf(dia.pergamino_clientes)} · Ram ${nf(dia.ramallo_clientes)}`}
        />
        <KpiDia
          icon={<PackageX className="size-3.5" />}
          label="No ruteado"
          value={`${nf(dia.bultos_no_ruteados)} blt`}
          tone={dia.bultos_no_ruteados > 0 ? "rose" : "slate"}
        />
        <KpiDia
          icon={<Truck className="size-3.5" />}
          label="Camiones"
          value={ocup ? nf(ocup.total_viajes) : "—"}
        />
        <KpiDia
          icon={<Gauge className="size-3.5" />}
          label="CEq prom."
          value={ocup ? nf(ocup.ceq_promedio, 1) : "—"}
          sub={ocup ? `target ${nf(525)}` : undefined}
        />
        <KpiDia
          icon={<Target className="size-3.5" />}
          label="En meta"
          value={ocup ? `${nf(ocup.en_meta)}/${nf(ocup.total_viajes)}` : "—"}
          tone="emerald"
        />
      </div>

      {(dia.notas || dia.comentario_preventa) && (
        <div className="space-y-1 border-t border-slate-100 px-5 py-2">
          {dia.comentario_preventa && (
            <p className="text-xs italic text-slate-500">
              <span className="font-semibold not-italic text-slate-600">
                Preventa:
              </span>{" "}
              {dia.comentario_preventa}
            </p>
          )}
          {dia.notas && (
            <p className="text-xs italic text-slate-500">
              <span className="font-semibold not-italic text-slate-600">
                Ruteo:
              </span>{" "}
              {dia.notas}
            </p>
          )}
        </div>
      )}

      {/* Tabla de camiones */}
      <div className="border-t border-slate-100 p-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Truck className="size-4 text-indigo-600" />
          Camiones del día
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="size-5 animate-spin" />
            Cargando camiones…
          </div>
        ) : viajes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
            No hay datos de camiones (ocupación de bodega) para este día.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patente</TableHead>
                  <TableHead className="text-right">Bultos</TableHead>
                  <TableHead className="text-right">HL</TableHead>
                  <TableHead className="text-right">Líneas</TableHead>
                  <TableHead className="text-right">SKUs</TableHead>
                  <TableHead className="text-right">CEq</TableHead>
                  <TableHead className="text-center">Ocupación</TableHead>
                  <TableHead className="text-center">Hora de carga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viajes.map((v) => {
                  const horas = cargaIndex.get(cargaKey(dia.fecha, v.patente))
                  return (
                  <TableRow key={v.patente}>
                    <TableCell className="font-medium text-slate-900">
                      {v.patente}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {nf(v.bultos_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {nf(v.hl_total, 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {nf(v.lineas)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {nf(v.skus_distintos)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                      {nf(v.ceq_total, 1)}
                    </TableCell>
                    <TableCell className="text-center">
                      <OcupBadge pct={v.ob_pct} />
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {horas && horas.length > 0 ? (
                        <span className="font-medium text-slate-900">
                          {horasCargaFmt(horas)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  )
}

function HistorialRow({
  c,
  activa,
  onClick,
}: {
  c: RuteoCierre
  activa: boolean
  onClick: () => void
}) {
  const totalBultos = c.pergamino_bultos + c.ramallo_bultos
  const totalClientes = c.pergamino_clientes + c.ramallo_clientes
  return (
    <TableRow
      className={`cursor-pointer ${activa ? "bg-indigo-50 hover:bg-indigo-50" : "hover:bg-slate-50"}`}
      onClick={onClick}
    >
      <TableCell className="font-medium tabular-nums text-slate-900">
        {fechaCorta(c.fecha)}
      </TableCell>
      <TableCell
        className={`text-center tabular-nums ${
          fueraDeSla(c.hora_fin_preventa, c.fecha, "preventa")
            ? "font-semibold text-rose-600"
            : "text-slate-600"
        }`}
        title={c.comentario_preventa ?? undefined}
      >
        {horaHHmm(c.hora_fin_preventa)}
      </TableCell>
      <TableCell className="text-center tabular-nums text-slate-600">
        {horaHHmm(c.hora_inicio)}
      </TableCell>
      <TableCell
        className={`text-center tabular-nums ${
          fueraDeSla(c.hora_fin, c.fecha, "ruteo")
            ? "font-semibold text-rose-600"
            : "text-slate-600"
        }`}
        title={c.notas ?? undefined}
      >
        {horaHHmm(c.hora_fin)}
      </TableCell>
      <TableCell className="text-center tabular-nums text-slate-600">
        {c.pergamino_bultos} / {c.pergamino_clientes}
      </TableCell>
      <TableCell className="text-center tabular-nums text-slate-600">
        {c.ramallo_bultos} / {c.ramallo_clientes}
      </TableCell>
      <TableCell className="text-center tabular-nums">
        {c.bultos_no_ruteados > 0 ? (
          <span className="text-rose-600">{c.bultos_no_ruteados}</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <span className="font-bold tabular-nums text-slate-900">{totalBultos}</span>
        <span className="ml-1 text-xs text-slate-500">blt</span>
        <span className="ml-2 text-xs tabular-nums text-slate-500">
          {totalClientes} cli
        </span>
      </TableCell>
    </TableRow>
  )
}
