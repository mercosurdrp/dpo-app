"use client"

import { Pencil } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { RAMA_COLOR, type SuenoNodo } from "@/lib/sueno/arbol-config"
import { SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/sueno/semaforo"

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 })

export function formatValor(v: number | null | undefined, unidad: string): string {
  if (v == null) return "—"
  if (unidad === "%") return `${nf.format(v)}%`
  if (unidad === "$/HL") return `$${nf.format(v)}`
  return nf.format(v)
}

export function SuenoKpiCard({
  nodo,
  editable,
  destacado = false,
  onEdit,
}: {
  nodo: SuenoNodo
  editable: boolean
  destacado?: boolean
  onEdit?: (nodo: SuenoNodo) => void
}) {
  const ramaColor = RAMA_COLOR[nodo.rama]
  const semColor = SEMAFORO_COLOR[nodo.estado]

  return (
    <Card className="relative overflow-hidden rounded-none border-slate-200 p-0 gap-0 shadow-md">
      {/* barra de color de la rama */}
      <div className="h-1.5 w-full" style={{ backgroundColor: ramaColor }} />

      <div className={cn("flex flex-col gap-1.5", destacado ? "p-3" : "p-2.5")}>
        <div className="flex items-start justify-between gap-1.5">
          <span
            className={cn(
              "font-semibold leading-tight text-slate-800",
              destacado ? "text-sm" : "text-[13px]",
            )}
          >
            {nodo.label}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {/* punto de semáforo */}
            <span
              className="inline-block size-3 rounded-full ring-2 ring-white"
              style={{ backgroundColor: semColor }}
              title={SEMAFORO_LABEL[nodo.estado]}
            />
            {editable && (
              <button
                type="button"
                onClick={() => onEdit?.(nodo)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={`Editar ${nodo.label}`}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </span>
        </div>

        <div className="flex items-baseline gap-1">
          <span
            className={cn("font-bold tabular-nums", destacado ? "text-2xl" : "text-xl")}
            style={{ color: nodo.valorYtd == null ? "#94A3B8" : semColor }}
          >
            {formatValor(nodo.valorYtd, nodo.unidad)}
          </span>
          {nodo.valorYtd != null && nodo.unidad !== "%" && nodo.unidad !== "$/HL" && (
            <span className="text-xs text-slate-400">{nodo.unidad}</span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Meta:{" "}
            <span className="font-medium text-slate-700">
              {nodo.meta == null ? "—" : formatValor(nodo.meta, nodo.unidad)}
            </span>
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            YTD
          </span>
        </div>
      </div>
    </Card>
  )
}
