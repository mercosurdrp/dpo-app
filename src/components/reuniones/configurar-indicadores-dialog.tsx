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
  getIndicadoresMes,
  listIndicadoresConfig,
  setGatilloIndicador,
} from "@/actions/reuniones"
import type { ReunionIndicadorConfig, TipoReunion } from "@/types/database"

type Polaridad = "mayor" | "menor" | "sin"
type Agregacion = "suma" | "promedio"

// Fila mínima para el editor rápido de gatillo (auto + manuales).
interface GatilloFila {
  nombre: string
  unidad: string | null
  gatillo: number | null
  mejor_si: "mayor" | "menor" | null
  auto: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipo: TipoReunion
  tipoLabel: string
  onSaved: () => void
  /** Si se pasa, habilita el editor rápido de gatillo para TODOS los
   *  indicadores de esa reunión (incluidos los automáticos). */
  reunionId?: string
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
  reunionId,
}: Props) {
  const [items, setItems] = useState<ReunionIndicadorConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Editor rápido de gatillo (todos los indicadores de la reunión, auto incl.)
  const [gatilloFilas, setGatilloFilas] = useState<GatilloFila[]>([])
  const [loadingGatillos, setLoadingGatillos] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listIndicadoresConfig(tipo)
    if ("data" in result) setItems(result.data)
    else setError(result.error)
    setLoading(false)
  }, [tipo])

  const cargarGatillos = useCallback(async () => {
    if (!reunionId) return
    setLoadingGatillos(true)
    const res = await getIndicadoresMes(reunionId)
    if ("data" in res) {
      setGatilloFilas(
        res.data.indicadores.map((ind) => ({
          nombre: ind.nombre,
          unidad: ind.unidad ?? null,
          gatillo: ind.gatillo ?? null,
          mejor_si: ind.mejor_si ?? null,
          auto: ind.auto ?? false,
        })),
      )
    }
    setLoadingGatillos(false)
  }, [reunionId])

  useEffect(() => {
    if (open) {
      cargar()
      cargarGatillos()
      setEditingId(null)
    }
  }, [open, cargar, cargarGatillos])

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

        {reunionId && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
            <p className="mb-2 text-sm font-semibold text-rose-800">
              Gatillo por indicador
            </p>
            <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">
              Umbral rojo de referencia. Funciona también para los indicadores{" "}
              <b>automáticos</b> (WQI, Precisión, Errores, etc.), cuyo valor lo
              calcula el sistema pero el gatillo lo cargás vos acá.
            </p>
            {loadingGatillos ? (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Cargando indicadores…
              </div>
            ) : gatilloFilas.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Sin indicadores en esta reunión.
              </p>
            ) : (
              <div className="space-y-1">
                {gatilloFilas.map((f) => (
                  <GatilloFilaRow
                    key={f.nombre}
                    fila={f}
                    onSave={(valor, onErr) =>
                      startTransition(async () => {
                        const r = await setGatilloIndicador(
                          tipo,
                          f.nombre,
                          valor,
                          { unidad: f.unidad, mejor_si: f.mejor_si },
                        )
                        if ("error" in r) return onErr(r.error)
                        cargarGatillos()
                        onSaved()
                      })
                    }
                    pending={pending}
                  />
                ))}
              </div>
            )}
          </div>
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

// --- Fila del editor rápido de gatillo (un indicador, auto o manual) ---
function GatilloFilaRow({
  fila,
  onSave,
  pending,
}: {
  fila: GatilloFila
  onSave: (valor: number | null, onError: (msg: string) => void) => void
  pending: boolean
}) {
  const [val, setVal] = useState(fila.gatillo == null ? "" : String(fila.gatillo))
  const [err, setErr] = useState<string | null>(null)

  // Re-sincronizar si la fila se recarga con un valor nuevo.
  useEffect(() => {
    setVal(fila.gatillo == null ? "" : String(fila.gatillo))
  }, [fila.gatillo])

  const sucio = val.trim() !== (fila.gatillo == null ? "" : String(fila.gatillo))
  const u = fila.unidad ? ` ${fila.unidad}` : ""

  function guardar() {
    setErr(null)
    const t = val.trim()
    if (t === "") return onSave(null, setErr)
    const n = Number(t)
    if (!Number.isFinite(n)) {
      setErr("Valor inválido")
      return
    }
    onSave(n, setErr)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-slate-800">
            {fila.nombre}
          </span>
          {fila.auto && (
            <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
              auto
            </span>
          )}
          {fila.unidad && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {fila.unidad}
            </span>
          )}
        </div>
        {err && <p className="text-[10px] text-red-700">{err}</p>}
      </div>
      <Input
        type="number"
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="—"
        className="h-7 w-24 text-right text-xs"
        title={`Gatillo${u}`}
      />
      <Button
        type="button"
        size="sm"
        variant={sucio ? "default" : "outline"}
        className="h-7 px-2"
        disabled={pending || !sucio}
        onClick={guardar}
        title="Guardar gatillo"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
      </Button>
    </div>
  )
}
