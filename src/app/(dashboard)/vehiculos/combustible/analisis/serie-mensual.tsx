"use client"

import { useMemo, useState } from "react"
import { TrendingUp } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card } from "@/components/ui/card"
import type { LabelProps } from "recharts"
import type { SerieCombustible } from "@/actions/combustible-analisis"

const MES_CORTO = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const nf2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** La flota es la referencia: tinta oscura, más gruesa, siempre visible. */
const COLOR_FLOTA = "#0f172a"
const COLOR_META = "#94a3b8"
const COLOR_PISO = "#f59e0b"
/**
 * Hasta 4 camiones a la vez, cada uno con un color fijo mientras esté elegido
 * (paleta de 4 validada para daltonismo). Un camión toma el primer color libre y
 * lo conserva aunque se saque otro: sacar uno no repinta a los demás.
 */
const SLOTS = ["#2563eb", "#d97706", "#059669", "#7c3aed"]
const MAX_CAMIONES = SLOTS.length

function fmtYm(ym: string): string {
  const [y, m] = ym.split("-")
  return `${MES_CORTO[Number(m)]} ${y.slice(2)}`
}

/** Etiqueta directa al final de cada línea (la identidad no depende del color). */
function etiquetaFinal(nombre: string, color: string, ultimo: number) {
  const Etiqueta = (p: LabelProps) => {
    if (p.index !== ultimo || p.value == null || p.x == null || p.y == null) return <g />
    return (
      <text x={Number(p.x) + 8} y={Number(p.y) + 4} fontSize={11} fontWeight={600} fill={color}>
        {nombre}
      </text>
    )
  }
  return Etiqueta
}

export function SerieMensualCombustible({ serie }: { serie: SerieCombustible | null }) {
  // dominio → slot de color; se mantiene estable mientras el camión esté elegido.
  const [slots, setSlots] = useState<Record<string, number>>({})

  const elegidos = useMemo(
    () => Object.entries(slots).sort((a, b) => a[1] - b[1]).map(([d]) => d),
    [slots],
  )

  function toggle(dominio: string) {
    setSlots((prev) => {
      if (dominio in prev) {
        const next = { ...prev }
        delete next[dominio]
        return next
      }
      if (Object.keys(prev).length >= MAX_CAMIONES) return prev
      const usados = new Set(Object.values(prev))
      const libre = SLOTS.findIndex((_, i) => !usados.has(i))
      return { ...prev, [dominio]: libre }
    })
  }

  const datos = useMemo(
    () =>
      (serie?.meses ?? []).map((m) => ({
        ym: m.ym,
        mes: fmtYm(m.ym),
        flota: m.flota,
        ...Object.fromEntries(elegidos.map((d) => [d, m.porDominio[d] ?? null])),
      })),
    [serie, elegidos],
  )

  if (!serie || serie.meses.length === 0) return null

  const valores = datos.flatMap((d) => [d.flota, ...elegidos.map((e) => d[e as keyof typeof d] as number | null)]).filter((v): v is number => v != null)
  const yMin = Math.floor(Math.min(2.5, ...valores) * 2) / 2
  const yMax = Math.ceil(Math.max(serie.meta ?? 0, ...valores) * 2) / 2 + 0.25
  const lleno = elegidos.length >= MAX_CAMIONES

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <TrendingUp className="size-4 text-sky-600" /> Rendimiento mes a mes
          </h3>
          <p className="text-xs text-muted-foreground">
            km/l de la flota de reparto desde la primera carga registrada. Elegí hasta {MAX_CAMIONES} camiones
            para compararlos con la flota en el mismo gráfico.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5 rounded" style={{ background: COLOR_FLOTA }} /> Flota</span>
          {serie.meta != null && (
            <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: COLOR_META }} /> Meta {nf2.format(serie.meta)}</span>
          )}
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dotted" style={{ borderColor: COLOR_PISO }} /> Piso {nf2.format(serie.piso)}</span>
        </div>
      </div>

      {/* Filtro por camión: una fila de chips arriba del gráfico */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSlots({})}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            elegidos.length === 0 ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Solo flota
        </button>
        {serie.dominios.map((d) => {
          const slot = slots[d]
          const activo = slot != null
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              disabled={!activo && lleno}
              title={!activo && lleno ? `Máximo ${MAX_CAMIONES} camiones a la vez` : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                activo ? "text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              style={activo ? { background: SLOTS[slot], borderColor: SLOTS[slot] } : undefined}
            >
              {d}
            </button>
          )
        })}
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 12, right: 56, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#475569" }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 11, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => nf2.format(v)}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v, name) => [v == null ? "—" : `${nf2.format(Number(v))} km/l`, String(name)]}
              labelFormatter={(l) => String(l)}
            />
            {serie.meta != null && (
              <ReferenceLine y={serie.meta} stroke={COLOR_META} strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
            )}
            <ReferenceLine y={serie.piso} stroke={COLOR_PISO} strokeDasharray="2 4" strokeWidth={1.5} />
            <Line
              type="monotone"
              dataKey="flota"
              name="Flota"
              stroke={COLOR_FLOTA}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COLOR_FLOTA, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
              label={etiquetaFinal("Flota", COLOR_FLOTA, datos.length - 1)}
            />
            {elegidos.map((d) => (
              <Line
                key={d}
                type="monotone"
                dataKey={d}
                name={d}
                stroke={SLOTS[slots[d]]}
                strokeWidth={2}
                dot={{ r: 2.5, fill: SLOTS[slots[d]], strokeWidth: 0 }}
                activeDot={{ r: 4.5 }}
                connectNulls
                isAnimationActive={false}
                label={etiquetaFinal(d, SLOTS[slots[d]], datos.length - 1)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] leading-tight text-muted-foreground">
        Cada punto es Σ km ÷ Σ litros de las cargas con medición del mes, sin los tramos con carga sin registrar.
        Un mes sin punto para un camión es un mes sin tramos válidos (primera carga, o cargas sin registrar).
      </p>
    </Card>
  )
}
