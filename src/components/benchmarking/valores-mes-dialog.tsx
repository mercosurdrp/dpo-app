"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { guardarValorMes } from "@/actions/benchmarking"
import { nombreMesCorto } from "@/lib/benchmarking-tendencia"
import type { BenchAplicacion } from "@/types/benchmarking"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  aplicacion: BenchAplicacion | null
}

function mesesAlrededor(base: string | null, serie: { mes: string }[]): string[] {
  // Desde 4 meses antes del mes base (o del primero cargado) hasta el mes actual.
  const hoy = new Date()
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`
  const candidatos = [base, ...serie.map((s) => s.mes)].filter((m): m is string => !!m).sort()
  const primero = candidatos[0] ?? actual
  let [y, m] = primero.split("-").map(Number)
  m -= 4
  while (m <= 0) {
    m += 12
    y -= 1
  }
  const out: string[] = []
  for (let i = 0; i < 36; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    out.push(key)
    if (key >= actual) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export function ValoresMesDialog({ open, onOpenChange, onSaved, aplicacion }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && aplicacion && <Valores aplicacion={aplicacion} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function Valores({ aplicacion, onSaved }: { aplicacion: BenchAplicacion; onSaved: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const mesBase = aplicacion.fecha_aplicacion?.slice(0, 7) ?? null
  const meses = useMemo(() => mesesAlrededor(mesBase, aplicacion.serie), [mesBase, aplicacion.serie])
  const porMes = useMemo(() => new Map(aplicacion.serie.map((s) => [s.mes, s])), [aplicacion.serie])
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(meses.map((m) => [m, porMes.get(m)?.valor?.toString() ?? ""])),
  )
  const [notas, setNotas] = useState<Record<string, string>>(() =>
    Object.fromEntries(meses.map((m) => [m, porMes.get(m)?.nota ?? ""])),
  )

  function guardar(mes: string, borrar = false) {
    setError(null)
    const raw = borrar ? "" : (valores[mes] ?? "").trim().replace(",", ".")
    const valor = raw === "" ? null : Number(raw)
    if (valor !== null && !Number.isFinite(valor)) {
      setError(`El valor de ${nombreMesCorto(mes)} no es un número`)
      return
    }
    setGuardando(mes)
    startTransition(async () => {
      const r = await guardarValorMes(aplicacion.id, mes, valor, notas[mes] ?? null)
      setGuardando(null)
      if ("error" in r) {
        setError(r.error)
        return
      }
      if (borrar) {
        setValores((p) => ({ ...p, [mes]: "" }))
        setNotas((p) => ({ ...p, [mes]: "" }))
      }
      onSaved()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Valores por mes · {aplicacion.indicador_nombre ?? "indicador"}</DialogTitle>
        <DialogDescription>
          {aplicacion.titulo}. Cargá el valor de cada mes
          {aplicacion.unidad ? ` (${aplicacion.unidad})` : ""}; los meses anteriores a{" "}
          {mesBase ? nombreMesCorto(mesBase) : "la aplicación"} son la base &quot;antes&quot;.
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
        {meses.map((mes) => {
          const esBase = mesBase === mes
          const cargado = porMes.has(mes)
          return (
            <div
              key={mes}
              className={
                "grid grid-cols-[72px_1fr_1fr_auto] items-center gap-2 rounded-md px-2 py-1 " +
                (esBase ? "bg-blue-50" : "")
              }
            >
              <span className="text-sm font-medium tabular-nums text-slate-700">
                {nombreMesCorto(mes)}
                {esBase && <span className="ml-1 text-[10px] uppercase text-blue-600">base</span>}
              </span>
              <Input
                type="text"
                inputMode="decimal"
                value={valores[mes] ?? ""}
                onChange={(e) => setValores((p) => ({ ...p, [mes]: e.target.value }))}
                onBlur={() => {
                  const actual = (valores[mes] ?? "").trim()
                  const previo = porMes.get(mes)?.valor?.toString() ?? ""
                  if (actual !== previo && actual !== "") guardar(mes)
                }}
                placeholder="—"
                className="h-9 tabular-nums"
              />
              <Input
                type="text"
                value={notas[mes] ?? ""}
                onChange={(e) => setNotas((p) => ({ ...p, [mes]: e.target.value }))}
                onBlur={() => {
                  if ((valores[mes] ?? "").trim() !== "" && (notas[mes] ?? "") !== (porMes.get(mes)?.nota ?? "")) guardar(mes)
                }}
                placeholder="nota"
                className="h-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 text-slate-400 hover:text-red-600"
                disabled={!cargado || pending}
                onClick={() => guardar(mes, true)}
                title="Borrar el mes"
              >
                {guardando === mes && pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-slate-500">Se guarda solo al salir de cada casillero.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  )
}
