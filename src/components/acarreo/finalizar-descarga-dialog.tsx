"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { MAQUINISTAS_DESCARGA } from "@/lib/acarreo-operadores"

/**
 * Al finalizar la descarga se elige QUIÉNES la hicieron. Antes se asumía que
 * era quien había apretado "Iniciar", y eso escondía las descargas de a dos
 * (que tardan mucho menos) y dejaba fuera de toda estadística al que
 * acompañaba.
 *
 * Pantalla de depósito: se opera de parado y a veces desde el celular, así que
 * los targets son grandes y no hay más de un paso.
 */
export function FinalizarDescargaDialog({
  abierto,
  patente,
  iniciadoPor,
  pendiente,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean
  patente: string
  /** Email de quien inició la descarga: se pre-tilda para el caso más común. */
  iniciadoPor: string | null
  pendiente: boolean
  onCerrar: () => void
  onConfirmar: (maquinistas: string[]) => void
}) {
  const [elegidos, setElegidos] = useState<string[]>([])

  // Al abrir, arrancar con quien inició ya tildado (si es un maquinista de la
  // lista). Si inició un admin/auxiliar, no se tilda a nadie y hay que elegir.
  useEffect(() => {
    if (!abierto) return
    const esMaquinista = MAQUINISTAS_DESCARGA.some((m) => m.email === iniciadoPor)
    setElegidos(esMaquinista && iniciadoPor ? [iniciadoPor] : [])
  }, [abierto, iniciadoPor])

  function alternar(email: string) {
    setElegidos((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    )
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Quién descargó {patente}?</DialogTitle>
          <DialogDescription>
            Marcá a todos los que descargaron. Si fueron dos, marcá los dos.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto py-1">
          {MAQUINISTAS_DESCARGA.map((m) => {
            const tildado = elegidos.includes(m.email)
            return (
              <button
                key={m.email}
                type="button"
                onClick={() => alternar(m.email)}
                aria-pressed={tildado}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition",
                  tildado
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
                    tildado ? "border-emerald-500 bg-emerald-500" : "border-slate-300",
                  )}
                >
                  {tildado && <CheckCircle2 className="size-4 text-white" />}
                </span>
                <span
                  className={cn(
                    "text-base font-medium",
                    tildado ? "text-emerald-900" : "text-slate-700",
                  )}
                >
                  {m.nombre}
                </span>
              </button>
            )
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(elegidos)}
            disabled={pendiente || elegidos.length === 0}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <CheckCircle2 className="size-4" />
            {elegidos.length === 0
              ? "Elegí quién descargó"
              : `Finalizar (${elegidos.length === 1 ? "1 maquinista" : `${elegidos.length} maquinistas`})`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
