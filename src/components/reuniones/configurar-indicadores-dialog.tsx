"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Loader2, Plus, Trash2, X, Check, Pencil } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  actualizarIndicadorConfig,
  crearIndicadorConfig,
  eliminarIndicadorConfig,
  listIndicadoresConfig,
} from "@/actions/reuniones"
import type { ReunionIndicadorConfig, TipoReunion } from "@/types/database"

type Polaridad = "mayor" | "menor" | "sin"
type Agregacion = "suma" | "promedio"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipo: TipoReunion
  tipoLabel: string
  onSaved: () => void
}

const POLARIDAD_LABEL: Record<"mayor" | "menor", string> = {
  mayor: "Mayor es mejor",
  menor: "Menor es mejor",
}

// Estado editable de un indicador (alta o edición comparten forma).
interface Borrador {
  nombre: string
  unidad: string
  meta: string
  gatillo: string
  orden: string
  mejor_si: Polaridad
  agregacion: Agregacion
}

const BORRADOR_VACIO: Borrador = {
  nombre: "",
  unidad: "",
  meta: "",
  gatillo: "",
  orden: "",
  mejor_si: "sin",
  agregacion: "promedio",
}

function borradorDe(it: ReunionIndicadorConfig): Borrador {
  return {
    nombre: it.nombre,
    unidad: it.unidad ?? "",
    meta: it.meta == null ? "" : String(it.meta),
    gatillo: it.gatillo == null ? "" : String(it.gatillo),
    orden: String(it.orden ?? 0),
    mejor_si: it.mejor_si ?? "sin",
    agregacion: it.agregacion === "suma" ? "suma" : "promedio",
  }
}

function aFormData(b: Borrador): FormData {
  const fd = new FormData()
  fd.set("nombre", b.nombre.trim())
  fd.set("unidad", b.unidad.trim())
  fd.set("meta", b.meta.trim())
  fd.set("gatillo", b.gatillo.trim())
  fd.set("orden", b.orden.trim())
  fd.set("mejor_si", b.mejor_si === "sin" ? "" : b.mejor_si)
  fd.set("agregacion", b.agregacion)
  return fd
}

export function ConfigurarIndicadoresDialog({
  open,
  onOpenChange,
  tipo,
  tipoLabel,
  onSaved,
}: Props) {
  const [items, setItems] = useState<ReunionIndicadorConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listIndicadoresConfig(tipo)
    if ("data" in result) setItems(result.data)
    else setError(result.error)
    setLoading(false)
  }, [tipo])

  useEffect(() => {
    if (open) {
      cargar()
      setEditingId(null)
    }
  }, [open, cargar])

  function handleEliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el indicador "${nombre}"?`)) return
    startTransition(async () => {
      const result = await eliminarIndicadorConfig(id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      cargar()
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Indicadores — {tipoLabel}</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          La <b>polaridad</b> define el semáforo: el <b>Target</b> marca el verde,
          y cruzar el <b>Gatillo</b> pinta de rojo y exige analizar el indicador
          con herramientas de mejora continua.
        </p>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Lista de indicadores como tarjetas */}
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Sin indicadores configurados.
                </p>
              ) : (
                items.map((it) =>
                  editingId === it.id ? (
                    <IndicadorForm
                      key={it.id}
                      titulo="Editar indicador"
                      inicial={borradorDe(it)}
                      pending={pending}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(borr, onErr) =>
                        startTransition(async () => {
                          const r = await actualizarIndicadorConfig(
                            it.id,
                            aFormData(borr),
                          )
                          if ("error" in r) return onErr(r.error)
                          setEditingId(null)
                          cargar()
                          onSaved()
                        })
                      }
                    />
                  ) : (
                    <IndicadorCard
                      key={it.id}
                      item={it}
                      pending={pending}
                      onEdit={() => setEditingId(it.id)}
                      onDelete={() => handleEliminar(it.id, it.nombre)}
                    />
                  ),
                )
              )}
            </div>

            {/* Alta de indicador */}
            {editingId !== "__nuevo__" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-dashed"
                onClick={() => setEditingId("__nuevo__")}
                disabled={pending}
              >
                <Plus className="mr-2 size-4" />
                Nuevo indicador
              </Button>
            ) : (
              <IndicadorForm
                titulo="Nuevo indicador"
                inicial={BORRADOR_VACIO}
                pending={pending}
                onCancel={() => setEditingId(null)}
                onSubmit={(borr, onErr) =>
                  startTransition(async () => {
                    const fd = aFormData(borr)
                    fd.set("tipo", tipo)
                    const r = await crearIndicadorConfig(fd)
                    if ("error" in r) return onErr(r.error)
                    setEditingId(null)
                    cargar()
                    onSaved()
                  })
                }
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Tarjeta read-only de un indicador ---
function IndicadorCard({
  item,
  pending,
  onEdit,
  onDelete,
}: {
  item: ReunionIndicadorConfig
  pending: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const u = item.unidad ? ` ${item.unidad}` : ""
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-white px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-900">
            {item.nombre}
          </span>
          {item.mejor_si && item.mejor_si !== "sin" && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {POLARIDAD_LABEL[item.mejor_si]}
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {item.agregacion === "suma" ? "Σ suma" : "x̄ prom"}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            Target:{" "}
            <b className="text-emerald-700">
              {item.meta == null ? "—" : `${item.meta}${u}`}
            </b>
          </span>
          <span>
            Gatillo:{" "}
            <b className="text-red-700">
              {item.gatillo == null ? "—" : `${item.gatillo}${u}`}
            </b>
          </span>
          <span>Orden: {item.orden}</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEdit}
          disabled={pending}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700"
          onClick={onDelete}
          disabled={pending}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// --- Formulario de alta/edición ---
function IndicadorForm({
  titulo,
  inicial,
  pending,
  onCancel,
  onSubmit,
}: {
  titulo: string
  inicial: Borrador
  pending: boolean
  onCancel: () => void
  onSubmit: (b: Borrador, onError: (msg: string) => void) => void
}) {
  const [b, setB] = useState<Borrador>(inicial)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setB((prev) => ({ ...prev, [k]: v }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!b.nombre.trim()) {
      setErr("El nombre es obligatorio.")
      return
    }
    onSubmit(b, setErr)
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50/40 p-3"
    >
      <p className="text-sm font-semibold text-slate-900">{titulo}</p>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-12 space-y-1 sm:col-span-7">
          <Label className="text-xs">Nombre *</Label>
          <Input
            value={b.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Ej: Productividad de picking"
            autoFocus
          />
        </div>
        <div className="col-span-12 space-y-1 sm:col-span-5">
          <Label className="text-xs">Polaridad</Label>
          <Select
            value={b.mejor_si}
            onValueChange={(v) => set("mejor_si", (v as Polaridad) ?? "sin")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mayor">Mayor es mejor</SelectItem>
              <SelectItem value="menor">Menor es mejor</SelectItem>
              <SelectItem value="sin">Sin semáforo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-6 space-y-1 sm:col-span-3">
          <Label className="text-xs text-emerald-700">Target</Label>
          <Input
            type="number"
            step="any"
            value={b.meta}
            onChange={(e) => set("meta", e.target.value)}
            placeholder="300"
          />
        </div>
        <div className="col-span-6 space-y-1 sm:col-span-3">
          <Label className="text-xs text-red-700">Gatillo</Label>
          <Input
            type="number"
            step="any"
            value={b.gatillo}
            onChange={(e) => set("gatillo", e.target.value)}
            placeholder="250"
          />
        </div>
        <div className="col-span-4 space-y-1 sm:col-span-2">
          <Label className="text-xs">Unidad</Label>
          <Input
            value={b.unidad}
            onChange={(e) => set("unidad", e.target.value)}
            placeholder="%"
          />
        </div>
        <div className="col-span-4 space-y-1 sm:col-span-2">
          <Label className="text-xs">Orden</Label>
          <Input
            type="number"
            value={b.orden}
            onChange={(e) => set("orden", e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="col-span-4 space-y-1 sm:col-span-2">
          <Label className="text-xs">MTD</Label>
          <Select
            value={b.agregacion}
            onValueChange={(v) =>
              set("agregacion", v === "suma" ? "suma" : "promedio")
            }
          >
            <SelectTrigger title="Cómo se acumula el MTD del mes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="promedio">Promedio</SelectItem>
              <SelectItem value="suma">Suma</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {b.mejor_si !== "sin" &&
        b.meta.trim() !== "" &&
        b.gatillo.trim() !== "" && (
          <p className="text-[11px] text-muted-foreground">
            {b.mejor_si === "mayor"
              ? `Verde ≥ ${b.meta} · Amarillo entre ${b.gatillo} y ${b.meta} · Rojo < ${b.gatillo}`
              : `Verde ≤ ${b.meta} · Amarillo entre ${b.meta} y ${b.gatillo} · Rojo > ${b.gatillo}`}
          </p>
        )}

      {err && <p className="text-xs text-red-700">{err}</p>}

      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          <X className="mr-1.5 size-3.5" />
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Check className="mr-1.5 size-3.5" />
          )}
          Guardar
        </Button>
      </div>
    </form>
  )
}
