"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import { borrarTarea, guardarTarea } from "@/actions/mudanza"
import {
  MUDANZA_ESTADOS,
  MUDANZA_RUBROS,
  type MudanzaMiembro,
  type MudanzaTarea,
} from "@/types/mudanza"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  tarea: MudanzaTarea | null
  equipo: MudanzaMiembro[]
  rubros: string[]
  rubroInicial?: string
}

const SIN = "__sin__"

export function TareaFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        {props.open && <TareaForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function TareaForm({
  onOpenChange,
  onSaved,
  tarea,
  equipo,
  rubros,
  rubroInicial,
}: Omit<Props, "open">) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [responsableId, setResponsableId] = useState<string>(tarea?.responsable_id ?? SIN)
  const [estado, setEstado] = useState<string>(tarea?.estado ?? "pendiente")
  const [rubro, setRubro] = useState<string>(tarea?.rubro ?? rubroInicial ?? "")
  const [hito, setHito] = useState(tarea?.hito ?? false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)

  const listaRubros = Array.from(new Set([...MUDANZA_RUBROS, ...rubros]))

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (tarea) fd.set("id", tarea.id)
    if (responsableId && responsableId !== SIN) fd.set("responsable_id", responsableId)
    else fd.delete("responsable_id")
    fd.set("estado", estado)
    fd.set("rubro", rubro || "Sin rubro")
    fd.set("hito", hito ? "true" : "false")
    startTransition(async () => {
      const r = await guardarTarea(fd)
      if ("error" in r) {
        setError(r.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  function handleBorrar() {
    if (!tarea) return
    if (!confirmarBorrar) {
      setConfirmarBorrar(true)
      return
    }
    startTransition(async () => {
      const r = await borrarTarea(tarea.id)
      if ("error" in r) {
        setError(r.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{tarea ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mt-nombre">Tarea *</Label>
            <Input
              id="mt-nombre"
              name="nombre"
              required
              maxLength={160}
              defaultValue={tarea?.nombre ?? ""}
              placeholder="Ej.: Pintura de piso y demarcación"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rubro</Label>
              <Select value={rubro} onValueChange={(v: string | null) => setRubro(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir rubro…" />
                </SelectTrigger>
                <SelectContent>
                  {listaRubros.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v: string | null) => setResponsableId(v ?? SIN)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin responsable</SelectItem>
                  {equipo.map((m) => (
                    <SelectItem key={m.profile_id} value={m.profile_id}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Planificado
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mt-inicio">Inicio</Label>
                <Input id="mt-inicio" name="inicio" type="date" defaultValue={tarea?.inicio ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt-fin">Fin</Label>
                <Input
                  id="mt-fin"
                  name="fin"
                  type="date"
                  defaultValue={tarea?.fin ?? ""}
                  disabled={hito}
                />
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={hito}
                onChange={(e) => setHito(e.target.checked)}
              />
              Es un hito (un solo día, se dibuja como rombo)
            </label>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Real (cuándo se hizo)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mt-inicio-real">Inicio real</Label>
                <Input
                  id="mt-inicio-real"
                  name="inicio_real"
                  type="date"
                  defaultValue={tarea?.inicio_real ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt-fin-real">Fin real</Label>
                <Input
                  id="mt-fin-real"
                  name="fin_real"
                  type="date"
                  defaultValue={tarea?.fin_real ?? ""}
                  disabled={hito}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Se completan solas al cargar avances: el inicio real con el primer avance y el fin real
              cuando la tarea queda hecha. Acá se pueden corregir.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v: string | null) => setEstado(v ?? "pendiente")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUDANZA_ESTADOS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mt-avance">Avance %</Label>
              <Input
                id="mt-avance"
                name="avance"
                type="number"
                min={0}
                max={100}
                step={5}
                defaultValue={tarea?.avance ?? 0}
                disabled={estado === "hecha"}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-presupuesto">Presupuesto ($)</Label>
            <Input
              id="mt-presupuesto"
              name="presupuesto"
              inputMode="numeric"
              defaultValue={tarea?.presupuesto != null ? String(tarea.presupuesto) : ""}
              placeholder="Ej.: 2.000.000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-notas">Notas</Label>
            <Textarea
              id="mt-notas"
              name="notas"
              rows={3}
              maxLength={800}
              defaultValue={tarea?.notas ?? ""}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div>
              {tarea && (
                <Button
                  type="button"
                  variant={confirmarBorrar ? "destructive" : "outline"}
                  onClick={handleBorrar}
                  disabled={pending}
                >
                  {confirmarBorrar ? "¿Borrar en serio?" : "Borrar"}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </form>
    </>
  )
}
