"use client"

import type { ReporteSeguridadTipoAccidente } from "@/types/database"

interface NivelPiramide {
  sigla: ReporteSeguridadTipoAccidente
  label: string
  color: string
}

// De arriba (más grave) hacia abajo (sin lesión).
const NIVELES: NivelPiramide[] = [
  { sigla: "fat", label: "Lesión seguida de Muerte", color: "#C0392B" },
  { sigla: "lti", label: "Lesión Muy Grave", color: "#E67E22" },
  { sigla: "mdi", label: "Lesión Grave", color: "#F39C12" },
  { sigla: "mti", label: "Lesión Moderada", color: "#F1C40F" },
  { sigla: "fai", label: "Lesión Leve", color: "#D4DE2A" },
  { sigla: "sio", label: "Sin Lesión (Incidente)", color: "#5DADE2" },
  { sigla: "sho", label: "Sin Lesión (Cond/Comp)", color: "#2E86C1" },
]

// Agrupaciones SIF: cada grupo cubre un rango de niveles (índices inclusive).
// Nota: SIF Actual y SIF Potencial se solapan en LTI (índice 1).
const SIF_GROUPS: {
  key: "actual" | "potencial" | "precursor"
  label: string
  fromIdx: number
  toIdx: number
  /** Columna del brace, 0 = más cerca de la pirámide */
  col: number
}[] = [
  { key: "actual", label: "SIF ACTUAL", fromIdx: 0, toIdx: 1, col: 0 },
  { key: "potencial", label: "SIF POTENCIAL", fromIdx: 1, toIdx: 5, col: 1 },
  { key: "precursor", label: "SIF PRECURSOR", fromIdx: 6, toIdx: 6, col: 2 },
]

export type PiramideConteos = Record<ReporteSeguridadTipoAccidente, number>

export function PiramideSeguridad({
  conteos,
}: {
  conteos: PiramideConteos
}) {
  const NIV = NIVELES.length // 7
  const VIEW_W = 900
  const VIEW_H = 380
  const ALTO_NIV = VIEW_H / NIV

  // Layout horizontal
  const BRACE_AREA_W = 180
  const PYR_LEFT = BRACE_AREA_W + 20
  const PYR_W = 460
  const PYR_RIGHT = PYR_LEFT + PYR_W
  const PYR_CX = PYR_LEFT + PYR_W / 2
  const TOP_W = 0.18

  function widths(n: number): { top: number; bottom: number } {
    const top = TOP_W + (1 - TOP_W) * (n / NIV)
    const bottom = TOP_W + (1 - TOP_W) * ((n + 1) / NIV)
    return { top, bottom }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          Pirámide de Seguridad
        </h3>
        <p className="text-xs text-muted-foreground">
          Conteos según los reportes cargados
        </p>
      </div>

      <div className="mx-auto max-w-3xl">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* === Braces SIF a la izquierda === */}
          {SIF_GROUPS.map((g) => {
            const yTop = g.fromIdx * ALTO_NIV
            const yBot = (g.toIdx + 1) * ALTO_NIV
            const yMid = (yTop + yBot) / 2
            const xRight = PYR_LEFT - 10 - g.col * 55 // dónde apunta el brace (más cerca/lejos de pirámide)
            const xLine = xRight - 10 // línea vertical del brace
            const xLabel = xLine - 14
            // Path tipo brace [ horizontal-vertical-horizontal ]
            const d = `M ${xRight} ${yTop} L ${xLine} ${yTop} L ${xLine} ${yBot} L ${xRight} ${yBot}`
            return (
              <g key={g.key}>
                <path
                  d={d}
                  fill="none"
                  stroke="#1F2937"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
                {/* Label rotada -90 */}
                <text
                  x={xLabel}
                  y={yMid}
                  textAnchor="middle"
                  transform={`rotate(-90 ${xLabel} ${yMid})`}
                  fontSize={12}
                  fontWeight={800}
                  fill="#0C4A6E"
                  style={{
                    paintOrder: "stroke",
                    stroke: "#BAE6FD",
                    strokeWidth: 6,
                  }}
                >
                  {g.label}
                </text>
              </g>
            )
          })}

          {/* === Pirámide (7 niveles) === */}
          {NIVELES.map((n, i) => {
            const { top, bottom } = widths(i)
            const yTop = i * ALTO_NIV
            const yBot = (i + 1) * ALTO_NIV
            const xTopL = PYR_CX - (top * PYR_W) / 2
            const xTopR = PYR_CX + (top * PYR_W) / 2
            const xBotL = PYR_CX - (bottom * PYR_W) / 2
            const xBotR = PYR_CX + (bottom * PYR_W) / 2
            const points = `${xTopL},${yTop} ${xTopR},${yTop} ${xBotR},${yBot} ${xBotL},${yBot}`
            const count = conteos[n.sigla] ?? 0
            const cy = yTop + ALTO_NIV / 2

            return (
              <g key={n.sigla}>
                <polygon
                  points={points}
                  fill={n.color}
                  stroke="#ffffff"
                  strokeWidth={1.2}
                />
                {/* Sigla dentro del trapecio, lado izquierdo */}
                <text
                  x={xTopL + (xBotL - xTopL) / 2 + 22}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={i === 0 ? 11 : 13}
                  fontWeight={800}
                  fill="#1F2937"
                  style={{
                    paintOrder: "stroke",
                    stroke: "rgba(255,255,255,0.6)",
                    strokeWidth: 2.5,
                  }}
                >
                  {n.sigla.toUpperCase()}
                </text>
                {/* Conteo grande en el centro */}
                <text
                  x={PYR_CX}
                  y={cy + 5}
                  textAnchor="middle"
                  fontSize={i === 0 ? 12 : 17}
                  fontWeight={900}
                  fill="#FFFFFF"
                  style={{
                    paintOrder: "stroke",
                    stroke: "rgba(0,0,0,0.4)",
                    strokeWidth: 2.5,
                  }}
                >
                  {count}
                </text>
                {/* Etiqueta gravedad a la derecha del trapecio */}
                <text
                  x={xBotR + 8}
                  y={cy + 4}
                  textAnchor="start"
                  fontSize={11}
                  fontWeight={500}
                  fill="#374151"
                >
                  {n.label}
                </text>
              </g>
            )
          })}

          {/* === Brace "INCIDENTES" a la derecha sobre SIO === */}
          {(() => {
            const idx = 5 // SIO
            const yTop = idx * ALTO_NIV
            const yBot = (idx + 1) * ALTO_NIV
            const yMid = (yTop + yBot) / 2
            const xLeft = PYR_RIGHT + 100 // suficiente para no pisar el label
            const xLine = xLeft + 8
            const xLabel = xLine + 14
            const d = `M ${xLeft} ${yTop} L ${xLine} ${yTop} L ${xLine} ${yBot} L ${xLeft} ${yBot}`
            return (
              <g>
                <path
                  d={d}
                  fill="none"
                  stroke="#1F2937"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
                <text
                  x={xLabel}
                  y={yMid + 4}
                  textAnchor="start"
                  fontSize={12}
                  fontWeight={800}
                  fill="#1F2937"
                >
                  INCIDENTES
                </text>
              </g>
            )
          })()}
        </svg>
      </div>

      <p className="mt-3 text-[11px] italic text-muted-foreground">
        La clasificación se basa en la gravedad de la lesión, no en los días de
        baja que da la ART.
      </p>
    </div>
  )
}
