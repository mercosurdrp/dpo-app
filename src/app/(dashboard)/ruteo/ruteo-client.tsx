"use client"

import { useState, useTransition } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  iniciarRuteo,
  finalizarRuteo,
  setFinPreventa,
  listarRuteoHistorial,
  type RuteoCierre,
} from "@/actions/ruteo"

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
}: {
  diaInicial: RuteoCierre | null
  historialInicial: RuteoCierre[]
  errorInicial: string | null
}) {
  const [dia, setDia] = useState<RuteoCierre | null>(diaInicial)
  const [historial, setHistorial] = useState<RuteoCierre[]>(historialInicial)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_INICIAL })
  const [pending, startTransition] = useTransition()

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
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <Route className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ruteo</h1>
          <p className="text-sm text-slate-500">
            Marcá el inicio y el fin del ruteo, y registrá bultos y clientes por ciudad.
          </p>
        </div>
      </header>

      {errorInicial && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {errorInicial}
        </div>
      )}

      {/* ----- Fin de preventa ----- */}
      <BloqueFinPreventa
        dia={dia}
        pending={pending}
        onGuardar={handleFinPreventa}
      />

      {/* ----- Estado del día ----- */}
      {!dia || dia.estado === "pendiente" ? (
        // Sin iniciar (o solo con fin de preventa registrado)
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-4 text-sm text-slate-500">
            Todavía no se inició el ruteo de hoy.
          </p>
          <Button size="lg" onClick={handleIniciar} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-2 size-5 animate-spin" />
            ) : (
              <Play className="mr-2 size-5" />
            )}
            INICIO DE RUTEO
          </Button>
        </div>
      ) : dia.estado === "en_curso" ? (
        // En curso
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Ruteo en curso
              </p>
              <p className="mt-0.5 text-sm text-slate-700">
                Iniciado a las{" "}
                <span className="font-semibold tabular-nums">
                  {horaHHmm(dia.hora_inicio)}
                </span>
              </p>
            </div>
            {!mostrarForm && (
              <Button onClick={() => setMostrarForm(true)} disabled={pending}>
                <Flag className="mr-2 size-4" />
                FIN DE RUTEO
              </Button>
            )}
          </div>

          {mostrarForm && (
            <div className="border-t border-slate-100 pt-4">
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
                  Bultos que quedaron sin entrar en ninguna ruta. Objetivo: ≤ 5%
                  del total.
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
        </div>
      ) : (
        // Cerrado
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="size-5" />
            <p className="text-sm font-semibold">Ruteo de hoy cerrado</p>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            {horaHHmm(dia.hora_inicio)} – {horaHHmm(dia.hora_fin)}
          </p>
          <ResumenCiudades dia={dia} />
          {dia.notas && (
            <p className="mt-3 text-xs italic text-slate-500">{dia.notas}</p>
          )}
        </div>
      )}

      {/* ----- Historial ----- */}
      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Cierres anteriores
        </h2>
        {historial.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
            Todavía no hay cierres registrados.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {historial.map((c) => (
              <HistorialRow key={c.id} c={c} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function BloqueFinPreventa({
  dia,
  pending,
  onGuardar,
}: {
  dia: RuteoCierre | null
  pending: boolean
  onGuardar: (horaManual?: string) => void
}) {
  const registrada = dia?.hora_fin_preventa ?? null
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
              <p className="mt-1 text-sm text-slate-700">
                Registrado a las{" "}
                <span className="font-semibold tabular-nums">
                  {horaHHmm(registrada)}
                </span>
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

function ResumenCiudades({ dia }: { dia: RuteoCierre }) {
  const totalBultos = dia.pergamino_bultos + dia.ramallo_bultos
  const totalClientes = dia.pergamino_clientes + dia.ramallo_clientes
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat label="Pergamino" value={`${dia.pergamino_bultos} blt · ${dia.pergamino_clientes} cli`} />
      <Stat label="Ramallo" value={`${dia.ramallo_bultos} blt · ${dia.ramallo_clientes} cli`} />
      <Stat label="Total" value={`${totalBultos} blt · ${totalClientes} cli`} highlight />
      {dia.bultos_no_ruteados > 0 && (
        <Stat label="No ruteado" value={`${dia.bultos_no_ruteados} blt`} />
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight
          ? "border-indigo-200 bg-indigo-50/70"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  )
}

function HistorialRow({ c }: { c: RuteoCierre }) {
  const totalBultos = c.pergamino_bultos + c.ramallo_bultos
  const totalClientes = c.pergamino_clientes + c.ramallo_clientes
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium tabular-nums text-slate-900">
          {fechaCorta(c.fecha)}{" "}
          <span className="font-normal text-slate-500">
            ({horaHHmm(c.hora_inicio)}–{horaHHmm(c.hora_fin)})
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          <span>Pergamino: {c.pergamino_bultos} blt / {c.pergamino_clientes} cli</span>
          <span>Ramallo: {c.ramallo_bultos} blt / {c.ramallo_clientes} cli</span>
          {c.bultos_no_ruteados > 0 && (
            <span className="text-rose-600">No ruteado: {c.bultos_no_ruteados} blt</span>
          )}
        </div>
        {c.notas && <p className="mt-1 text-xs italic text-slate-500">{c.notas}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-slate-900">{totalBultos}</p>
        <p className="text-[10px] uppercase tracking-wide text-slate-400">bultos</p>
        <p className="text-xs tabular-nums text-slate-500">{totalClientes} cli</p>
      </div>
    </li>
  )
}
