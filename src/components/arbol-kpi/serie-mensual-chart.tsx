"use client"

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

const MES_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const AZUL = "#2563eb"
const VERDE = "#059669"
const ROJO = "#dc2626"

export interface SerieMensualChartProps {
  /** Claves "YYYY-MM", de enero al mes en curso. */
  meses: string[]
  valores: (number | null)[]
  unidad: string
  meta?: number | null
  /** Umbral rojo. Si viene, el gráfico dibuja las dos referencias. */
  gatillo?: number | null
  /** Cuántos decimales mostrar en el tooltip. */
  decimales?: number
}

function etiquetaMes(clave: string): string {
  const m = Number(clave.slice(5, 7))
  return MES_CORTO[m - 1] ?? clave
}

/**
 * Serie mensual de un nodo del árbol, con la meta y el gatillo dibujados.
 *
 * El último punto es el mes EN CURSO y por lo tanto está incompleto: se marca
 * con un punto hueco y el tooltip lo aclara. Sin esa marca, un mes que recién
 * empieza parece una caída.
 */
export function SerieMensualChart({
  meses,
  valores,
  unidad,
  meta,
  gatillo,
  decimales = 1,
}: SerieMensualChartProps) {
  const puntos = meses.map((clave, i) => ({
    mes: etiquetaMes(clave),
    clave,
    valor: valores[i] ?? null,
    parcial: i === meses.length - 1,
  }))

  const conDato = puntos.filter((p) => p.valor != null)
  if (conDato.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay datos mensuales para este indicador.
      </p>
    )
  }

  const fmt = (v: number) =>
    v.toLocaleString("es-AR", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={puntos} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis fontSize={11} width={52} tickLine={false} axisLine={false} />
          <Tooltip
            // recharts 3.x tipa estos callbacks con ReactNode: se normaliza acá.
            formatter={(v) => [`${fmt(Number(v))} ${unidad}`, "Valor"]}
            labelFormatter={(label, payload) => {
              const fila = (payload as unknown as
                | readonly { payload?: { parcial?: boolean } }[]
                | undefined)?.[0]
              return fila?.payload?.parcial ? `${String(label)} · mes en curso` : String(label)
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
          />
          {meta != null && (
            <ReferenceLine
              y={meta}
              stroke={VERDE}
              strokeDasharray="5 5"
              label={{ value: `Meta ${fmt(meta)}`, position: "right", fontSize: 10, fill: VERDE }}
            />
          )}
          {gatillo != null && (
            <ReferenceLine
              y={gatillo}
              stroke={ROJO}
              strokeDasharray="2 4"
              label={{ value: `Gatillo ${fmt(gatillo)}`, position: "right", fontSize: 10, fill: ROJO }}
            />
          )}
          <Line
            type="monotone"
            dataKey="valor"
            stroke={AZUL}
            strokeWidth={2}
            connectNulls
            dot={(props) => {
              const { cx, cy, payload, index } = props as {
                cx?: number
                cy?: number
                index: number
                payload: { valor: number | null; parcial: boolean }
              }
              if (cx == null || cy == null || payload.valor == null) {
                return <g key={index} />
              }
              // El mes en curso va hueco: todavía le faltan días.
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={payload.parcial ? 5 : 4}
                  fill={payload.parcial ? "#fff" : AZUL}
                  stroke={AZUL}
                  strokeWidth={2}
                />
              )
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
