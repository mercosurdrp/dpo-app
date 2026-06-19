"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { setSuenoValor } from "@/actions/sueno"
import type { MejorSi, SuenoNodo } from "@/lib/sueno/arbol-config"

function numOrNull(s: string): number | null {
  const t = s.trim().replace(",", ".")
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Form interno: inicializa estado desde props (se remonta vía `key`). */
function SuenoEditForm({
  nodo,
  onClose,
  onSaved,
}: {
  nodo: SuenoNodo
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [valor, setValor] = useState(nodo.valorYtd?.toString() ?? "")
  const [meta, setMeta] = useState(nodo.meta?.toString() ?? "")
  const [gatillo, setGatillo] = useState(nodo.gatillo?.toString() ?? "")
  const [mejorSi, setMejorSi] = useState<MejorSi>(nodo.mejorSi)
  const [nota, setNota] = useState(nodo.nota ?? "")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await setSuenoValor({
        kpi_key: nodo.key,
        anio: nodo.anio,
        valor_ytd: numOrNull(valor),
        meta: numOrNull(meta),
        gatillo: numOrNull(gatillo),
        mejor_si: mejorSi,
        nota: nota.trim() || null,
      })
      if ("error" in res) {
        setError(res.error)
      } else {
        onClose()
        onSaved()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sueno-valor">Valor YTD ({nodo.unidad})</Label>
          <Input
            id="sueno-valor"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sueno-meta">Meta ({nodo.unidad})</Label>
          <Input
            id="sueno-meta"
            inputMode="decimal"
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            placeholder="—"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sueno-gatillo">Gatillo (rojo) · opcional</Label>
          <Input
            id="sueno-gatillo"
            inputMode="decimal"
            value={gatillo}
            onChange={(e) => setGatillo(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Mejor si es</Label>
          <Select value={mejorSi} onValueChange={(v) => setMejorSi(v as MejorSi)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mayor">Mayor (más es mejor)</SelectItem>
              <SelectItem value="menor">Menor (menos es mejor)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sueno-nota">Nota · opcional</Label>
        <Textarea
          id="sueno-nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

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
  )
}

export function SuenoEditDialog({
  nodo,
  open,
  onOpenChange,
  onSaved,
}: {
  nodo: SuenoNodo | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{nodo ? nodo.label : "KPI"}</DialogTitle>
          <DialogDescription>
            Cargá el valor YTD real y la meta. El semáforo se calcula solo.
          </DialogDescription>
        </DialogHeader>
        {nodo && (
          <SuenoEditForm
            key={nodo.key}
            nodo={nodo}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
