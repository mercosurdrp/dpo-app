"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Boxes } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  crearClasificacion,
  getClasificacionDelDia,
  borrarClasificacion,
  type ClasificacionDelDia,
  type ClasificacionEnvaseItem,
} from "@/actions/clasificacion-envases"

function hoyARG(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

const hhmm = (t: string) => (t || "").slice(0, 5)

const CAMPO_INICIAL = {
  fecha: hoyARG(),
  hora_inicio: "",
  hora_fin: "",
  pallets_total: "",
  pallets_rotos: "",
  cajones_total: "",
  cajones_rotos: "",
  botellas_rotas: "",
  notas: "",
}

export function ClasificacionEnvasesClient({
  inicial,
  errorInicial,
}: {
  inicial: ClasificacionDelDia | null
  errorInicial: string | null
}) {
  const [dia, setDia] = useState<ClasificacionDelDia | null>(inicial)
  const [form, setForm] = useState({ ...CAMPO_INICIAL })
  const [saving, startSave] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function refrescar(fecha: string) {
    const res = await getClasificacionDelDia(fecha)
    if ("data" in res) setDia(res.data)
  }

  function handleGuardar() {
    startSave(async () => {
      const res = await crearClasificacion({
        fecha: form.fecha,
        hora_inicio: form.hora_inicio,
        hora_fin: form.hora_fin,
        pallets_total: Number(form.pallets_total || 0),
        pallets_rotos: Number(form.pallets_rotos || 0),
        cajones_total: Number(form.cajones_total || 0),
        cajones_rotos: Number(form.cajones_rotos || 0),
        botellas_rotas: Number(form.botellas_rotas || 0),
        notas: form.notas,
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Carga registrada")
      setForm({ ...CAMPO_INICIAL, fecha: form.fecha })
      await refrescar(form.fecha)
    })
  }

  function handleBorrar(id: string) {
    if (!confirm("¿Borrar esta carga?")) return
    setDeletingId(id)
    startSave(async () => {
      const res = await borrarClasificacion(id)
      setDeletingId(null)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Carga borrada")
      await refrescar(dia?.fecha ?? form.fecha)
    })
  }

  const r = dia?.resumen

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Boxes className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clasificar envases</h1>
          <p className="text-sm text-slate-500">
            Registrá cada tanda de clasificación. Cargá el total a clasificar y los rotos.
          </p>
        </div>
      </header>

      {errorInicial && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {errorInicial}
        </div>
      )}

      {/* Formulario de carga */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Nueva carga</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <Label className="mb-1.5 text-xs">Fecha</Label>
            <Input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Hora inicio</Label>
            <Input type="time" value={form.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 text-xs">Hora fin</Label>
            <Input type="time" value={form.hora_fin} onChange={(e) => set("hora_fin", e.target.value)} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField label="Pallets a clasificar" value={form.pallets_total} onChange={(v) => set("pallets_total", v)} />
          <NumField label="Pallets rotos" value={form.pallets_rotos} onChange={(v) => set("pallets_rotos", v)} accent="rose" />
          <NumField label="Cajones a clasificar" value={form.cajones_total} onChange={(v) => set("cajones_total", v)} />
          <NumField label="Cajones rotos" value={form.cajones_rotos} onChange={(v) => set("cajones_rotos", v)} accent="rose" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <NumField label="Botellas rotas" value={form.botellas_rotas} onChange={(v) => set("botellas_rotas", v)} accent="rose" />
          <div>
            <Label className="mb-1.5 text-xs">Notas (opcional)</Label>
            <Textarea rows={1} value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Observaciones" />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            Registrar carga
          </Button>
        </div>
      </div>

      {/* Resumen del día */}
      {r && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            Productividad de hoy ({dia?.cargas.length ?? 0} {dia?.cargas.length === 1 ? "carga" : "cargas"})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Horas" value={r.horas.toString()} />
            <Stat label="Cajones / hora" value={r.cajones_por_hora.toString()} highlight />
            <Stat label="Pallets / hora" value={r.pallets_por_hora.toString()} highlight />
            <Stat label="Botellas rotas" value={r.botellas_rotas.toString()} accent="rose" />
            <Stat label="Cajones clasif." value={`${r.cajones_clasificados} / ${r.cajones_total}`} />
            <Stat label="% rotura cajones" value={`${r.pct_rotura_cajones}%`} accent="rose" />
            <Stat label="Pallets clasif." value={`${r.pallets_clasificados} / ${r.pallets_total}`} />
            <Stat label="% rotura pallets" value={`${r.pct_rotura_pallets}%`} accent="rose" />
          </div>
        </div>
      )}

      {/* Historial del día */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Cargas del día</h2>
        {!dia || dia.cargas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
            Todavía no hay cargas registradas hoy.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {dia.cargas.map((c) => (
              <CargaRow key={c.id} c={c} onDelete={() => handleBorrar(c.id)} deleting={deletingId === c.id} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  accent,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  accent?: "rose"
}) {
  return (
    <div>
      <Label className={`mb-1.5 text-xs ${accent === "rose" ? "text-rose-700" : ""}`}>{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
  accent,
}: {
  label: string
  value: string
  highlight?: boolean
  accent?: "rose"
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight
          ? "border-sky-200 bg-sky-50/70"
          : accent === "rose"
            ? "border-rose-200 bg-rose-50/60"
            : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

function CargaRow({
  c,
  onDelete,
  deleting,
}: {
  c: ClasificacionEnvaseItem
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium tabular-nums text-slate-900">
          {hhmm(c.hora_inicio)}–{hhmm(c.hora_fin)}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          <span>Cajones: {c.cajones_total - c.cajones_rotos}/{c.cajones_total}</span>
          <span>Pallets: {c.pallets_total - c.pallets_rotos}/{c.pallets_total}</span>
          {c.cajones_rotos > 0 && <span className="text-rose-600">{c.cajones_rotos} cajones rotos</span>}
          {c.pallets_rotos > 0 && <span className="text-rose-600">{c.pallets_rotos} pallets rotos</span>}
          {c.botellas_rotas > 0 && <span className="text-rose-600">{c.botellas_rotas} botellas rotas</span>}
        </div>
        {c.notas && <p className="mt-1 text-xs italic text-slate-500">{c.notas}</p>}
      </div>
      <Button variant="ghost" size="icon" onClick={onDelete} disabled={deleting} aria-label="Borrar carga">
        {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-rose-600" />}
      </Button>
    </li>
  )
}
