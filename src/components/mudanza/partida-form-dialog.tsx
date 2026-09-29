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
import { borrarPartida, guardarPartida } from "@/actions/mudanza"
import { MUDANZA_RUBROS, type MudanzaPartida } from "@/types/mudanza"
import { formatMoney } from "./formato"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  partida: MudanzaPartida | null
  rubros: string[]
}

function parseMonto(s: string): number {
  const raw = s.trim()
  const norm = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw
  const n = Number(norm)
  return Number.isFinite(n) ? n : 0
}

export function PartidaFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        {props.open && <PartidaForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function PartidaForm({ onOpenChange, onSaved, partida, rubros }: Omit<Props, "open">) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rubro, setRubro] = useState<string>(partida?.rubro ?? "")
  const [cantidad, setCantidad] = useState<string>(partida ? String(partida.cantidad) : "1")
  const [unitario, setUnitario] = useState<string>(partida ? String(partida.unitario) : "")
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)

  const listaRubros = Array.from(new Set([...MUDANZA_RUBROS, ...rubros])).filter(
    (r) => r !== "Hitos",
  )
  const total = parseMonto(cantidad) * parseMonto(unitario)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (partida) fd.set("id", partida.id)
    fd.set("rubro", rubro || "Sin rubro")
    startTransition(async () => {
      const r = await guardarPartida(fd)
      if ("error" in r) {
        setError(r.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  function handleBorrar() {
    if (!partida) return
    if (!confirmarBorrar) {
      setConfirmarBorrar(true)
      return
    }
    startTransition(async () => {
      const r = await borrarPartida(partida.id)
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
          <DialogTitle>{partida ? "Editar partida" : "Nueva partida"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mp-nombre">Partida *</Label>
            <Input
              id="mp-nombre"
              name="nombre"
              required
              maxLength={120}
              defaultValue={partida?.nombre ?? ""}
              placeholder="Ej.: Armado de racks"
            />
          </div>
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
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="mp-cantidad">Cantidad</Label>
              <Input
                id="mp-cantidad"
                name="cantidad"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-unitario">Unitario ($)</Label>
              <Input
                id="mp-unitario"
                name="unitario"
                inputMode="decimal"
                value={unitario}
                onChange={(e) => setUnitario(e.target.value)}
                placeholder="50.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total</Label>
              <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium tabular-nums">
                {formatMoney(total)}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-notas">Notas</Label>
            <Textarea id="mp-notas" name="notas" rows={2} defaultValue={partida?.notas ?? ""} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div>
              {partida && (
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
