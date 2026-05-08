"use client"

import type { ReporteSeguridadTipoAccidente } from "@/types/database"

interface NivelPiramide {
  sigla: ReporteSeguridadTipoAccidente
  label: string
  color: string
}

// De arriba (más grave) hacia abajo (sin lesión).
// Colores tomados de la pirámide de referencia (Excel JefeLogistica).
const NIVELES: NivelPiramide[] = [
  { sigla: "fat", label: "Lesión seguida de Muerte", color: "#C0392B" },
  { sigla: "lti", label: "Lesión Muy Grave", color: "#E67E22" },
  { sigla: "mdi", label: "Lesión Grave", color: "#F39C12" },
  { sigla: "mti", label: "Lesión Moderada", color: "#F1C40F" },
  { sigla: "fai", label: "Lesión Leve", color: "#D4DE2A" },
  { sigla: "sio", label: "Sin Lesión", color: "#5DADE2" },
  { sigla: "sho", label: "Sin Lesión", color: "#2E86C1" },
]

export type PiramideConteos = Record<ReporteSeguridadTipoAccidente, number>

export function PiramideSeguridad({
  conteos,
}: {
  conteos: PiramideConteos
}) {
  // Geometría: pirámide de 7 niveles. Ancho del top = 18%, base = 100%.
  // Cada nivel ocupa el mismo alto. Cada trapecio se construye con polygon.
  const ANCHO = 600
  const ALTO = 360
  const NIV = NIVELES.length // 7
  const ALTO_NIV = ALTO / NIV
  const TOP_W = 0.18 // fracción del ancho total para el vértice superior
  const FULL_W = 1.0

  // Devuelve los % de ancho del nivel n (top y bottom)
  function widths(n: number): { top: number; bottom: number } {
    const tFracTop = n / NIV
    const tFracBottom = (n + 1) / NIV
    const top = TOP_W + (FULL_W - TOP_W) * tFracTop
    const bottom = TOP_W + (FULL_W - TOP_W) * tFracBottom
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

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:items-stretch sm:gap-4">
        {/* SIF aside */}
        <div className="flex w-full max-w-[140px] flex-col items-center justify-center self-stretch rounded-md border border-red-300 bg-red-50 p-2 text-center sm:w-32">
          <span className="text-lg font-extrabold text-red-700">SIF</span>
          <p className="mt-1 text-[10px] leading-snug text-red-900">
            Evento de Seguridad en el cual una persona podría haber perdido la
            vida o sufrido lesiones permanentes.
          </p>
        </div>

        {/* Pirámide SVG */}
        <div className="flex-1 max-w-xl">
          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {NIVELES.map((n, i) => {
              const { top, bottom } = widths(i)
              const yTop = i * ALTO_NIV
              const yBot = (i + 1) * ALTO_NIV
              const cxTop = ANCHO / 2
              const cxBot = ANCHO / 2
              const xTopL = cxTop - (top * ANCHO) / 2
              const xTopR = cxTop + (top * ANCHO) / 2
              const xBotL = cxBot - (bottom * ANCHO) / 2
              const xBotR = cxBot + (bottom * ANCHO) / 2
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
                  {/* Sigla a la izquierda */}
                  <text
                    x={xTopL - 6}
                    y={cy + 4}
                    textAnchor="end"
                    fontSize={i === 0 ? 11 : 13}
                    fontWeight={700}
                    fill="#1F2937"
                  >
                    {n.sigla.toUpperCase()}
                  </text>
                  {/* Conteo grande en el centro */}
                  <text
                    x={ANCHO / 2}
                    y={cy + 5}
                    textAnchor="middle"
                    fontSize={i === 0 ? 12 : 16}
                    fontWeight={800}
                    fill="#FFFFFF"
                    style={{
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.35)",
                      strokeWidth: 2,
                    }}
                  >
                    {count}
                  </text>
                  {/* Etiqueta a la derecha */}
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
          </svg>
        </div>
      </div>

      <p className="mt-3 text-[11px] italic text-muted-foreground">
        La clasificación se basa en la gravedad de la lesión, no en los días de
        baja que da la ART.
      </p>
    </div>
  )
}
