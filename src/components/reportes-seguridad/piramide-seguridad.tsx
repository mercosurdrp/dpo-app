"use client"

import { useState } from "react"
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

/** Apertura por área de cada nivel, para el popup al pasar por un escalón. */
export type PiramideDesglose = Record<
  ReporteSeguridadTipoAccidente,
  { almacen: number; distribucion: number; otras: number }
>

/** Una pirámide del panel: su rótulo y sus conteos. */
export interface PiramideItem {
  titulo: string
  conteos: PiramideConteos
  /** Si se pasa, cada escalón muestra el popup con la apertura por área. */
  desglose?: PiramideDesglose
}

const NOTA_ART =
  "La clasificación se basa en la gravedad de la lesión, no en los días de baja que da la ART."

function totalDe(conteos: PiramideConteos): number {
  return NIVELES.reduce((acc, n) => acc + (conteos[n.sigla] ?? 0), 0)
}

function plural(n: number): string {
  return `${n} reporte${n === 1 ? "" : "s"}`
}

/**
 * El dibujo solo. `compacta` = versión reducida para las pirámides por área
 * (Almacén / Distribución): sin braces SIF ni etiquetas de gravedad, que ya se
 * leen en la pirámide grande — va arriba, con el mismo orden de niveles.
 */
function PiramideSvg({
  conteos,
  compacta = false,
  onNivel,
}: {
  conteos: PiramideConteos
  compacta?: boolean
  /** Hover sobre un escalón (null al salir), con la posición dentro del contenedor. */
  onNivel?: (
    nivel: { sigla: ReporteSeguridadTipoAccidente; label: string } | null,
    pos?: { xPct: number; yPct: number },
  ) => void
}) {
  const NIV = NIVELES.length // 7
  const VIEW_W = compacta ? 420 : 900
  const VIEW_H = compacta ? 300 : 380
  const ALTO_NIV = VIEW_H / NIV

  // Layout horizontal
  const BRACE_AREA_W = compacta ? 0 : 180
  const PYR_LEFT = compacta ? 30 : BRACE_AREA_W + 20
  const PYR_W = compacta ? 360 : 460
  const PYR_RIGHT = PYR_LEFT + PYR_W
  const PYR_CX = PYR_LEFT + PYR_W / 2
  const TOP_W = 0.18

  function widths(n: number): { top: number; bottom: number } {
    const top = TOP_W + (1 - TOP_W) * (n / NIV)
    const bottom = TOP_W + (1 - TOP_W) * ((n + 1) / NIV)
    return { top, bottom }
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
      onMouseLeave={onNivel ? () => onNivel(null) : undefined}
    >
      {/* === Braces SIF a la izquierda === */}
      {(compacta ? [] : SIF_GROUPS).map((g) => {
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
              style={onNivel ? { cursor: "pointer" } : undefined}
              onMouseEnter={
                onNivel
                  ? () =>
                      onNivel(
                        { sigla: n.sigla, label: n.label },
                        { xPct: (PYR_CX / VIEW_W) * 100, yPct: (yBot / VIEW_H) * 100 },
                      )
                  : undefined
              }
            />
            {/* Sigla dentro del trapecio, lado izquierdo */}
            <text
              x={xTopL + (xBotL - xTopL) / 2 + 22}
              y={cy + 4}
              textAnchor="middle"
              fontSize={compacta ? (i === 0 ? 12 : 15) : i === 0 ? 11 : 13}
              fontWeight={800}
              fill="#1F2937"
              pointerEvents="none"
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
              fontSize={compacta ? (i === 0 ? 14 : 20) : i === 0 ? 12 : 17}
              fontWeight={900}
              fill="#FFFFFF"
              pointerEvents="none"
              style={{
                paintOrder: "stroke",
                stroke: "rgba(0,0,0,0.4)",
                strokeWidth: 2.5,
              }}
            >
              {count}
            </text>
            {/* Etiqueta gravedad a la derecha del trapecio */}
            {!compacta && (
              <text
                x={xBotR + 8}
                y={cy + 4}
                textAnchor="start"
                fontSize={11}
                fontWeight={500}
                fill="#374151"
                pointerEvents="none"
              >
                {n.label}
              </text>
            )}
          </g>
        )
      })}

      {/* === Brace "INCIDENTES" a la derecha sobre SIO === */}
      {!compacta && (() => {
        const idx = 5 // SIO
        const yTop = idx * ALTO_NIV
        const yBot = (idx + 1) * ALTO_NIV
        const yMid = (yTop + yBot) / 2
        const xLeft = PYR_RIGHT + 100 // suficiente para no pisar el label
        const xLine = xLeft + 8
        const xLabel = xLine + 14
        const d = `M ${xLeft} ${yTop} L ${xLine} ${yTop} L ${xLine} ${yBot} L ${xLeft} ${yBot}`
        return (
          <g pointerEvents="none">
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
  )
}

/**
 * Pirámide + popup: al pasar por un escalón muestra cuántos de esos reportes
 * son de Almacén y cuántos de Distribución (lo que se mira en la reunión de
 * Logística, donde la pirámide sigue siendo una sola).
 */
function PiramideDibujo({
  conteos,
  desglose,
  compacta = false,
}: {
  conteos: PiramideConteos
  desglose?: PiramideDesglose
  compacta?: boolean
}) {
  const [hover, setHover] = useState<{
    sigla: ReporteSeguridadTipoAccidente
    label: string
    xPct: number
    yPct: number
  } | null>(null)

  const d = hover && desglose ? desglose[hover.sigla] : null

  return (
    <div className="relative">
      <PiramideSvg
        conteos={conteos}
        compacta={compacta}
        onNivel={
          desglose
            ? (nivel, pos) =>
                setHover(
                  nivel && pos
                    ? { ...nivel, xPct: pos.xPct, yPct: pos.yPct }
                    : null,
                )
            : undefined
        }
      />
      {hover && d && (
        <div
          className="pointer-events-none absolute z-20 w-max -translate-x-1/2 rounded-md border bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{ left: `${hover.xPct}%`, top: `${hover.yPct}%` }}
        >
          <p className="font-semibold text-slate-900">
            {hover.sigla.toUpperCase()} · {hover.label}
          </p>
          <p className="mt-1 text-slate-700">
            Almacén <span className="font-bold">{d.almacen}</span> ·
            Distribución <span className="font-bold">{d.distribucion}</span>
            {d.otras > 0 ? (
              <>
                {" "}
                · Otras áreas <span className="font-bold">{d.otras}</span>
              </>
            ) : null}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Una pirámide "protagonista" y, si se pasan, las secundarias en chico debajo,
 * todo en el mismo marco. Sirve para los tres usos:
 * - Reportes de Seguridad y reunión de Logística: total + Almacén y Distribución.
 * - Reunión de Almacén / Matinal de Distribución: la del área + el total en chico.
 */
export function PiramideSeguridadPanel({
  titulo,
  periodoLabel,
  principal,
  secundarias = [],
  nota,
}: {
  /** Encabezado del marco. Si no se pasa, no se dibuja (la sección ya tiene el suyo). */
  titulo?: string
  periodoLabel?: string
  principal: PiramideItem
  secundarias?: PiramideItem[]
  /** Aviso opcional al pie (p. ej. reportes que no caen en ninguna de las dos áreas). */
  nota?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      {titulo && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{titulo}</h3>
          {periodoLabel && (
            <p className="text-xs text-muted-foreground">{periodoLabel}</p>
          )}
        </div>
      )}

      <p className="text-center text-sm font-semibold text-slate-900">
        {principal.titulo}{" "}
        <span className="font-normal text-muted-foreground">
          · {plural(totalDe(principal.conteos))}
        </span>
      </p>
      <div className="mx-auto max-w-3xl">
        <PiramideDibujo
          conteos={principal.conteos}
          desglose={principal.desglose}
        />
      </div>

      {secundarias.length > 0 && (
        <div
          className={`mt-4 grid gap-4 border-t pt-4 ${
            secundarias.length > 1 ? "sm:grid-cols-2" : ""
          }`}
        >
          {secundarias.map((s) => (
            <div key={s.titulo}>
              <p className="text-center text-sm font-semibold text-slate-900">
                {s.titulo}{" "}
                <span className="font-normal text-muted-foreground">
                  · {plural(totalDe(s.conteos))}
                </span>
              </p>
              <div
                className={`mx-auto mt-1 ${
                  secundarias.length > 1 ? "max-w-[260px]" : "max-w-[320px]"
                }`}
              >
                <PiramideDibujo compacta conteos={s.conteos} desglose={s.desglose} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] italic text-muted-foreground">
        {NOTA_ART}
        {nota ? ` ${nota}` : ""}
      </p>
    </div>
  )
}
