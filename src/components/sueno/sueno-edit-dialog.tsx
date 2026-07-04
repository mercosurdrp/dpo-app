"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
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
import { getSuenoMensual, setSuenoMensual, setSuenoValor } from "@/actions/sueno"
import {
  KPI_AGREGACION_MENSUAL,
  agregarMensual,
  esKpiManualMensual,
  type MejorSi,
  type SuenoNodo,
} from "@/lib/sueno/arbol-config"

const MES_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

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

  // Carga mensual (solo KPIs manuales): 12 strings, "" = sin valor ese mes.
  const conMeses = esKpiManualMensual(nodo.key)
  const [meses, setMeses] = useState<string[]>(Array(12).fill(""))
  const [mesesDirty, setMesesDirty] = useState(false)
  const [mesesCargando, setMesesCargando] = useState(conMeses)

  useEffect(() => {
    if (!conMeses) return
    let cancelled = false
    getSuenoMensual(nodo.key, nodo.anio).then((res) => {
      if (cancelled) return
      if ("data" in res) {
        setMeses((prev) => {
          const next = [...prev]
          for (const r of res.data) next[r.mes - 1] = String(r.valor)
          return next
        })
      }
      setMesesCargando(false)
    })
    return () => {
      cancelled = true
    }
  }, [conMeses, nodo.key, nodo.anio])

  const valoresMensuales = useMemo(
    () => meses.map(numOrNull).filter((v): v is number => v != null),
    [meses],
  )
  const hayMeses = valoresMensuales.length > 0
  const ytdCalculado = hayMeses ? agregarMensual(nodo.key, valoresMensuales) : null

  function setMes(i: number, v: string) {
    setMeses((prev) => {
      const next = [...prev]
      next[i] = v
      return next
    })
    setMesesDirty(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await setSuenoValor({
        kpi_key: nodo.key,
        anio: nodo.anio,
        valor_ytd: hayMeses ? ytdCalculado : numOrNull(valor),
        meta: numOrNull(meta),
        gatillo: numOrNull(gatillo),
        mejor_si: mejorSi,
        nota: nota.trim() || null,
      })
      if ("error" in res) {
        setError(res.error)
        return
      }
      if (conMeses && mesesDirty) {
        const resMes = await setSuenoMensual({
          kpi_key: nodo.key,
          anio: nodo.anio,
          valores: meses.map((s, i) => ({ mes: i + 1, valor: numOrNull(s) })),
        })
        if ("error" in resMes) {
          setError(resMes.error)
          return
        }
      }
      onClose()
      onSaved()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {conMeses && (
        <div className="space-y-1.5">
          <Label>
            Valor de cada mes ({nodo.unidad}) · el YTD se calcula solo (
            {KPI_AGREGACION_MENSUAL[nodo.key] === "suma" ? "suma" : "promedio"})
          </Label>
          {mesesCargando ? (
            <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" /> Cargando meses…
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {MES_CORTO.map((label, i) => (
                <div key={label} className="space-y-0.5">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {label}
                  </span>
                  <Input
                    inputMode="decimal"
                    className="h-8 px-2 text-sm tabular-nums"
                    value={meses[i]}
                    onChange={(e) => setMes(i, e.target.value)}
                    placeholder="—"
                    aria-label={`${label} (${nodo.unidad})`}
                  />
                </div>
              ))}
            </div>
          )}
          {hayMeses && (
            <p className="text-sm text-slate-500">
              YTD calculado:{" "}
              <span className="font-semibold text-slate-700 tabular-nums">
                {ytdCalculado} {nodo.unidad}
              </span>{" "}
              ({valoresMensuales.length} {valoresMensuales.length === 1 ? "mes" : "meses"})
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sueno-valor">Valor YTD ({nodo.unidad})</Label>
          <Input
            id="sueno-valor"
            inputMode="decimal"
            value={hayMeses ? (ytdCalculado?.toString() ?? "") : valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="—"
            disabled={hayMeses}
            title={hayMeses ? "Se calcula desde los meses cargados" : undefined}
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
  const mensual = nodo ? esKpiManualMensual(nodo.key) : false
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{nodo ? nodo.label : "KPI"}</DialogTitle>
          <DialogDescription>
            {mensual
              ? "Cargá el valor real de cada mes (o el YTD directo) y la meta. El semáforo se calcula solo."
              : "Cargá el valor YTD real y la meta. El semáforo se calcula solo."}
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
