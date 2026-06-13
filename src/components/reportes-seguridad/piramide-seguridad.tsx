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
  // El FAT termina en punta continuando EXACTAMENTE el ángulo de los lados de la
  // pirámide: el vértice cae donde la línea lateral, prolongada hacia arriba,
  // llega al centro. Esa es la altura extra que reservamos arriba del lienzo, así
  // el FAT y su punta se ven como un solo bloque del mismo color.
  const PUNTA_H = (TOP_W * VIEW_H) / (1 - TOP_W)

  function widths(n: number): { top: number; bottom: number } {
    const top = TOP_W + (1 - TOP_W) * (n / NIV)
    const bottom = TOP_W + (1 - TOP_W) * ((n + 1) / NIV)
    return { top, bottom }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mx-auto max-w-3xl">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H + PUNTA_H}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* La pirámide se dibuja desplazada hacia abajo: el espacio superior
              (PUNTA_H) lo ocupa el vértice del FAT, que sube hasta la punta. */}
          <g transform={`translate(0, ${PUNTA_H})`}>
          {/* === Braces SIF a la izquierda === */}
          {SIF_GROUPS.map((g) => {
            // El grupo "actual" arranca en el FAT, que ahora sube hasta la punta.
            const yTop = g.fromIdx === 0 ? -PUNTA_H : g.fromIdx * ALTO_NIV
            const yBot = (g.toIdx + 1) * ALTO_NIV
            const yMid = (yTop + yBot) / 2
            const xRight = PYR_LEFT - 4 - g.col * 22 // dónde apunta el brace (más cerca/lejos de pirámide)
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
            // FAT (i=0) termina en punta: en vez de su borde superior plano,
            // un único vértice en el centro a -PUNTA_H, continuando el ángulo
            // lateral → FAT + punta quedan como un solo triángulo del mismo color.
            const points =
              i === 0
                ? `${PYR_CX},${-PUNTA_H} ${xBotR},${yBot} ${xBotL},${yBot}`
                : `${xTopL},${yTop} ${xTopR},${yTop} ${xBotR},${yBot} ${xBotL},${yBot}`
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
                  y={cy + 6}
                  textAnchor="middle"
                  fontSize={i === 0 ? 15 : 21}
                  fontWeight={900}
                  fill="#FFFFFF"
                  style={{
                    paintOrder: "stroke",
                    stroke: "rgba(0,0,0,0.45)",
                    strokeWidth: 3,
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
          </g>
        </svg>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-[11px] italic text-muted-foreground">
          La clasificación se basa en la gravedad de la lesión, no en los días de
          baja que da la ART.
        </p>
        <p className="whitespace-nowrap text-xs text-muted-foreground">
          Conteos según los reportes cargados
        </p>
      </div>
    </div>
  )
}
