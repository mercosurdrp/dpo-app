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
import { AdjuntosInput } from "@/components/adjuntos-input"
import { borrarGasto, guardarGasto } from "@/actions/mudanza"
import type { MudanzaGasto, MudanzaPartida, MudanzaTarea } from "@/types/mudanza"
import { isoHoy } from "./formato"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  gasto: MudanzaGasto | null
  partidas: MudanzaPartida[]
  tareas: MudanzaTarea[]
  partidaInicial?: string
}

const SIN = "__sin__"

export function GastoFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        {props.open && <GastoForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function GastoForm({
  onOpenChange,
  onSaved,
  gasto,
  partidas,
  tareas,
  partidaInicial,
}: Omit<Props, "open">) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [partidaId, setPartidaId] = useState<string>(gasto?.partida_id ?? partidaInicial ?? SIN)
  const [tareaId, setTareaId] = useState<string>(gasto?.tarea_id ?? SIN)
  const [estado, setEstado] = useState<string>(gasto?.estado ?? "pagado")
  const [archivos, setArchivos] = useState<File[]>([])
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)

  const partida = partidas.find((p) => p.id === partidaId) ?? null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (gasto) fd.set("id", gasto.id)
    if (partidaId !== SIN) {
      fd.set("partida_id", partidaId)
      fd.set("rubro", partida?.rubro ?? "")
    } else {
      fd.delete("partida_id")
    }
    if (tareaId !== SIN) fd.set("tarea_id", tareaId)
    else fd.delete("tarea_id")
    fd.set("estado", estado)
    for (const f of archivos) fd.append("archivo", f)
    startTransition(async () => {
      const r = await guardarGasto(fd)
      if ("error" in r) {
        setError(r.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  function handleBorrar() {
    if (!gasto) return
    if (!confirmarBorrar) {
      setConfirmarBorrar(true)
      return
    }
    startTransition(async () => {
      const r = await borrarGasto(gasto.id)
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
          <DialogTitle>{gasto ? "Editar gasto" : "Cargar gasto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Partida del presupuesto</Label>
            <Select value={partidaId} onValueChange={(v: string | null) => setPartidaId(v ?? SIN)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin partida" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN}>Sin partida (fuera de presupuesto)</SelectItem>
                {partidas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.rubro} · {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {partidaId === SIN && (
            <div className="space-y-1.5">
              <Label htmlFor="mg-rubro">Rubro</Label>
              <Input
                id="mg-rubro"
                name="rubro"
                defaultValue={gasto?.rubro ?? ""}
                placeholder="Ej.: Obra civil"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mg-fecha">Fecha</Label>
              <Input
                id="mg-fecha"
                name="fecha"
                type="date"
                required
                defaultValue={gasto?.fecha ?? isoHoy()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v: string | null) => setEstado(v ?? "pagado")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprometido">Comprometido (orden o factura pendiente)</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mg-proveedor">Proveedor</Label>
              <Input id="mg-proveedor" name="proveedor" defaultValue={gasto?.proveedor ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mg-monto">Monto ($) *</Label>
              <Input
                id="mg-monto"
                name="monto"
                required
                inputMode="decimal"
                defaultValue={gasto ? String(gasto.monto) : ""}
                placeholder="1.250.000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mg-concepto">Concepto *</Label>
            <Input
              id="mg-concepto"
              name="concepto"
              required
              maxLength={160}
              defaultValue={gasto?.concepto ?? ""}
              placeholder="Ej.: Anticipo 50 % durlock tesorería"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tarea relacionada (opcional)</Label>
            <Select value={tareaId} onValueChange={(v: string | null) => setTareaId(v ?? SIN)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin tarea" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN}>Sin tarea</SelectItem>
                {tareas
                  .filter((t) => !t.hito)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Comprobante (factura, remito, foto; Ctrl+V para pegar)</Label>
            <AdjuntosInput
              archivos={archivos}
              onChange={setArchivos}
              disabled={pending}
              accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
            />
            {gasto && gasto.archivos.length > 0 && (
              <p className="text-xs text-slate-500">
                Ya tiene {gasto.archivos.length} archivo(s). Los nuevos se agregan.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mg-notas">Notas</Label>
            <Textarea id="mg-notas" name="notas" rows={2} defaultValue={gasto?.notas ?? ""} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div>
              {gasto && (
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
