"use client"

import { Check } from "lucide-react"

/**
 * Cuadro del tablero de Capacitaciones: muestra el número principal de una
 * sección y, al tocarlo, la abre/cierra (se pueden tildar varios a la vez).
 */
export function Cuadro({
  activo,
  onClick,
  icono,
  titulo,
  valor,
  color,
  detalle,
  pie,
  pieColor,
  barra,
}: {
  activo: boolean
  onClick: () => void
  icono: React.ReactNode
  titulo: string
  valor: string
  color?: string
  detalle: string
  pie: string
  pieColor?: string
  /** 0-100+, dibuja una barrita de avance. */
  barra?: number | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`group relative flex min-h-[9.5rem] min-w-0 flex-col justify-between gap-2 rounded-xl border p-3 text-left transition sm:min-h-40 ${
        activo
          ? "border-slate-900 bg-slate-900 text-white shadow-md"
          : "border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${activo ? "text-slate-300" : "text-slate-500"}`}
        >
          {icono}
          {titulo}
        </span>
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded border ${
            activo ? "border-white bg-white text-slate-900" : "border-slate-300 bg-white text-transparent group-hover:border-slate-500"
          }`}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      </div>
      <div>
        <p
          className="truncate text-lg font-bold leading-tight tabular-nums sm:text-2xl"
          style={{ color: activo ? "#FFFFFF" : (color ?? "#0F172A") }}
        >
          {valor}
        </p>
        <p className={`mt-1 text-[11px] leading-snug ${activo ? "text-slate-300" : "text-slate-500"}`}>{detalle}</p>
      </div>
      <div className="space-y-1.5">
        {barra !== undefined && barra !== null && (
          <div className={`h-1 overflow-hidden rounded-full ${activo ? "bg-white/20" : "bg-slate-100"}`}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, barra))}%`,
                backgroundColor: activo ? "#FFFFFF" : (color ?? "#334155"),
              }}
            />
          </div>
        )}
        <p
          className={`line-clamp-2 text-[11px] font-semibold ${activo ? "text-white" : ""}`}
          style={activo ? undefined : { color: pieColor ?? "#475569" }}
        >
          {pie}
        </p>
      </div>
    </button>
  )
}
