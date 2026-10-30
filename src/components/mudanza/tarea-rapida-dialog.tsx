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
import { AdjuntosInput } from "@/components/adjuntos-input"
import { guardarGasto, setFechasRealesTarea } from "@/actions/mudanza"
import type { MudanzaGasto, MudanzaTarea } from "@/types/mudanza"
import { formatFecha, formatMoney, isoHoy } from "./formato"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  tarea: MudanzaTarea | null
  gastos: MudanzaGasto[]
  /** Puede cargar gastos (editor). El responsable sólo carga fechas. */
  puedeGastar: boolean
  /** Abre el formulario completo de la tarea. */
  onEditarCompleto?: (t: MudanzaTarea) => void
  onEditarGasto?: (g: MudanzaGasto) => void
}

/**
 * Diálogo rápido al clickear una tarea: cuándo arrancó / terminó de verdad y
 * cuánto se gastó (parcial o total). Un solo botón guarda las dos cosas.
 */
export function TareaRapidaDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        {props.open && props.tarea && <TareaRapida {...props} tarea={props.tarea} />}
      </DialogContent>
    </Dialog>
  )
}

function TareaRapida({
  onOpenChange,
  onSaved,
  tarea,
  gastos,
  puedeGastar,
  onEditarCompleto,
  onEditarGasto,
}: Omit<Props, "open" | "tarea"> & { tarea: MudanzaTarea }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [inicioReal, setInicioReal] = useState(tarea.inicio_real ?? "")
  const [finReal, setFinReal] = useState(tarea.fin_real ?? "")
  const [monto, setMonto] = useState("")
  const [fechaGasto, setFechaGasto] = useState(isoHoy())
  const [concepto, setConcepto] = useState("")
  const [pagado, setPagado] = useState(true)
  const [archivos, setArchivos] = useState<File[]>([])

  const deTarea = gastos.filter((g) => g.tarea_id === tarea.id)
  const pagadoTot = deTarea.filter((g) => g.estado === "pagado").reduce((a, g) => a + g.monto, 0)
  const compromTot = deTarea
    .filter((g) => g.estado === "comprometido")
    .reduce((a, g) => a + g.monto, 0)
  const usado = pagadoTot + compromTot
  const resto = tarea.presupuesto != null ? tarea.presupuesto - usado : null

  const cambioFechas =
    inicioReal !== (tarea.inicio_real ?? "") || finReal !== (tarea.fin_real ?? "")
  const hayMonto = monto.trim() !== ""

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!cambioFechas && !hayMonto) {
      onOpenChange(false)
      return
    }
    startTransition(async () => {
      if (cambioFechas) {
        const r = await setFechasRealesTarea(tarea.id, inicioReal || null, finReal || null)
        if ("error" in r) {
          setError(r.error)
          return
        }
      }
      if (hayMonto && puedeGastar) {
        const fd = new FormData()
        fd.set("tarea_id", tarea.id)
        fd.set("rubro", tarea.rubro)
        fd.set("fecha", fechaGasto)
        fd.set("monto", monto)
        fd.set("concepto", concepto.trim() || tarea.nombre)
        fd.set("estado", pagado ? "pagado" : "comprometido")
        for (const f of archivos) fd.append("archivo", f)
        const r = await guardarGasto(fd)
        if ("error" in r) {
          setError(r.error)
          return
        }
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{tarea.nombre}</DialogTitle>
        <DialogDescription>
          {tarea.rubro}
          {tarea.inicio && tarea.fin && (
            <>
              {" · "}plan {formatFecha(tarea.inicio)}
              {!tarea.hito && <> – {formatFecha(tarea.fin)}</>}
            </>
          )}
          {tarea.responsable_nombre && <> · {tarea.responsable_nombre}</>}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cuándo se hizo
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr-inicio">
                {tarea.hito ? "Fecha en que se cumplió" : "Arrancó el"}
              </Label>
              <Input
                id="tr-inicio"
                type="date"
                value={inicioReal}
                onChange={(e) => setInicioReal(e.target.value)}
              />
            </div>
            {!tarea.hito && (
              <div className="space-y-1.5">
                <Label htmlFor="tr-fin">Terminó el (si ya terminó)</Label>
                <Input
                  id="tr-fin"
                  type="date"
                  value={finReal}
                  onChange={(e) => setFinReal(e.target.value)}
                  disabled={!inicioReal}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Con la fecha de inicio la tarea pasa a &quot;en curso&quot;; con la de fin queda hecha
            al 100 %.
          </p>
        </div>

        {puedeGastar && !tarea.hito && (
          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cuánto se gastó
              </p>
              <p className="text-xs tabular-nums text-slate-600">
                {tarea.presupuesto != null ? (
                  <>
                    Presupuesto {formatMoney(tarea.presupuesto)} · gastado {formatMoney(usado)} ·{" "}
                    <span
                      className={
                        resto != null && resto < 0 ? "font-semibold text-red-600" : "text-emerald-700"
                      }
                    >
                      {resto != null && resto < 0 ? "excedido " : "resta "}
                      {formatMoney(Math.abs(resto ?? 0))}
                    </span>
                  </>
                ) : (
                  <>Sin presupuesto · gastado {formatMoney(usado)}</>
                )}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tr-monto">Monto ($)</Label>
                <Input
                  id="tr-monto"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="parcial o total"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-fecha">Fecha</Label>
                <Input
                  id="tr-fecha"
                  type="date"
                  value={fechaGasto}
                  onChange={(e) => setFechaGasto(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <div className="flex h-9 items-center gap-3 text-sm">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="tr-estado"
                      checked={pagado}
                      onChange={() => setPagado(true)}
                    />
                    Pagado
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="tr-estado"
                      checked={!pagado}
                      onChange={() => setPagado(false)}
                    />
                    A pagar
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tr-concepto">Concepto (opcional)</Label>
                <Input
                  id="tr-concepto"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  maxLength={160}
                  placeholder="Ej.: anticipo 50 %"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Comprobante (opcional)</Label>
                <AdjuntosInput
                  archivos={archivos}
                  onChange={setArchivos}
                  disabled={pending}
                  accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
                />
              </div>
            </div>

            {deTarea.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2">
                <p className="mb-1 text-xs text-slate-500">Ya cargado en esta tarea</p>
                <ul className="space-y-0.5 text-xs">
                  {deTarea.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {formatFecha(g.fecha)} · {g.concepto}
                        {g.estado === "comprometido" && (
                          <span className="ml-1 text-amber-600">(a pagar)</span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 whitespace-nowrap tabular-nums">
                        {formatMoney(g.monto)}
                        {onEditarGasto && (
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-700 hover:underline"
                            onClick={() => {
                              onOpenChange(false)
                              onEditarGasto(g)
                            }}
                          >
                            editar
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div>
            {onEditarCompleto && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onEditarCompleto(tarea)
                }}
              >
                Editar todos los datos…
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
