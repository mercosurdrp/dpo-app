"use client"

import { History } from "lucide-react"
import type { LecturaSugerida } from "@/lib/vehiculos/lecturas"

// Historial de lecturas del último mes de la unidad (una fila por día), como
// referencia al cargar con fecha retroactiva: las facturas del mes se cargan
// todas juntas y hay poca referencia de días/km. Al elegir un día completa el
// odómetro/horómetro Y la fecha. Muestra la variación de km/hs y de días
// respecto de la lectura anterior.
//
// Vive acá porque lo usan el alta de OT (mantenimiento-client) y el montaje de
// cubiertas (neumaticos-module).

const fmtFecha = (f: string | null) =>
  !f ? "—" : f.slice(0, 10).split("-").reverse().join("/")

const fmtNum = (n: number) => new Intl.NumberFormat("es-AR").format(n)

// Días entre dos fechas ISO (YYYY-MM-DD), positivo si b es posterior a a.
export function diffDiasISO(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime()
  const db = new Date(b + "T12:00:00").getTime()
  return Math.round((db - da) / 86_400_000)
}

export function HistorialLecturasMes({
  open,
  onToggle,
  historial,
  unidad,
  onElegir,
  /** Qué completa al elegir un día. Por defecto, los campos de la OT. */
  destino = "de la OT",
}: {
  open: boolean
  onToggle: () => void
  historial: LecturaSugerida[]
  unidad: "km" | "hs"
  onElegir: (valor: string, fecha: string) => void
  destino?: string
}) {
  if (historial.length === 0) return null
  const suf = unidad === "hs" ? "hs" : "km"
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700"
      >
        <History className="size-3" />
        {open ? "Ocultar historial del mes" : `Ver historial del mes (${historial.length})`}
      </button>
      {open && (
        <div className="mt-1 overflow-hidden rounded-md border border-border">
          <p className="border-b border-border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
            Elegí el día: completa fecha y {suf} {destino}.
          </p>
          <div className="max-h-52 divide-y divide-border overflow-y-auto">
            {historial.map((s, i) => {
              const prev = historial[i + 1] // lectura anterior (más vieja)
              const dKm = prev ? s.odometro - prev.odometro : null
              const dDias = prev ? diffDiasISO(prev.fecha, s.fecha) : null
              return (
                <button
                  key={`${s.fecha}-${s.odometro}-${i}`}
                  type="button"
                  onClick={() => onElegir(String(s.odometro), s.fecha)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-sky-50"
                >
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                    {fmtFecha(s.fecha)}
                  </span>
                  <span className="flex-1 text-right font-medium tabular-nums text-foreground">
                    {fmtNum(s.odometro)} {suf}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                    {dKm != null && dDias != null
                      ? `${dKm >= 0 ? "+" : ""}${fmtNum(dKm)} ${suf} · ${dDias}d`
                      : ""}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
