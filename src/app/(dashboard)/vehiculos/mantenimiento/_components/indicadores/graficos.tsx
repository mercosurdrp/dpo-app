"use client"

// Gráficos livianos del tablero (SVG a mano, sin recharts): son 22 tarjetas con
// 3 a 6 puntos cada una, y un ResponsiveContainer por tarjeta no se justifica.
//
// Regla de lectura que comparten todos:
//  - La línea punteada es SIEMPRE la meta. No hay otra cosa punteada salvo el
//    mes en curso, que es "todavía no terminó".
//  - El color de cada punto/columna es el semáforo de SU mes. El mes en curso de
//    un acumulativo va hueco y gris: no se juzga.

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ClipboardCheck, Plus } from "lucide-react"
import type { FlotaMeta, FlotaPlanConItems } from "@/actions/flota-indicadores"
import type { CalcDisponibilidadMes } from "@/lib/vehiculos/disponibilidad-flota"
import { cn } from "@/lib/utils"
import { usePaletaViz } from "../paleta-viz"
import { MARGEN_ALERTA, MOTIVO_LABEL } from "./estado-kpi"
import { diasDelMes, fmtMesCorto, fmtMesLargo, fmtMesNombre } from "./formato"
import { ESTADO_UI } from "./semaforo"
import type { PuntoVista } from "./vistas"

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** Ancho real del contenedor, para dibujar el SVG en px (trazos y puntos nítidos). */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setAncho(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho] as const
}

const signoMeta = (m: FlotaMeta | null) => (m?.comparador === "<=" ? "≤" : "≥")

// ==================== Tendencia por mes ====================

export function TendenciaMeses({
  puntos,
  meta,
  forma,
  fmt,
  alto,
  pct,
  label,
  className,
}: {
  puntos: PuntoVista[]
  meta: FlotaMeta | null
  forma: "linea" | "columnas"
  fmt: (v: number) => string
  alto: number
  pct?: boolean
  /** Nombre del PI, para el texto accesible. */
  label: string
  className?: string
}) {
  const [ref, W] = useAncho<HTMLDivElement>()
  const N = puntos.length
  const H = alto
  const metaV = meta?.meta != null ? Number(meta.meta) : null
  const vals = puntos.map((p) => p.valor).filter((v): v is number => v != null)

  const desc = `${label}, últimos ${N} meses: ${puntos
    .map(
      (p) =>
        `${fmtMesNombre(p.ym)} ${p.valor == null ? "sin dato" : fmt(p.valor)}${
          p.parcial ? " (en curso)" : ""
        }, ${p.estado === "neutro" ? "sin juzgar" : ESTADO_UI[p.estado].label.toLowerCase()}`
    )
    .join("; ")}.${metaV != null ? ` Meta ${signoMeta(meta)} ${fmt(metaV)}.` : ""}`

  // Dominio vertical. Columnas: desde 0 (el largo significa). Línea: acotado a
  // los valores y la meta (es posición, y 94 contra 95 tiene que distinguirse).
  let lo = 0
  let hi = 1
  const conMeta = metaV != null ? [...vals, metaV] : vals
  if (forma === "columnas") {
    hi = Math.max(...conMeta, 0) * 1.12 || 1
  } else if (conMeta.length > 0) {
    lo = Math.min(...conMeta)
    hi = Math.max(...conMeta)
    const holgura = (hi - lo) * 0.25 || Math.max(Math.abs(hi) * 0.05, 1)
    lo -= holgura
    hi += holgura
    if (pct) {
      lo = Math.max(lo, 0)
      hi = Math.min(hi, 100)
    } else lo = Math.max(lo, 0)
    if (hi - lo < 1e-9) hi = lo + 1
  }
  const padTop = 6
  const padBot = forma === "columnas" ? 1 : 6
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (H - padTop - padBot)
  const x = (i: number) => ((i + 0.5) / N) * W

  return (
    <div
      ref={ref}
      className={cn("relative w-full", className)}
      style={{ height: H }}
      role="img"
      aria-label={desc}
    >
      {W > 0 && N > 0 && (
        <svg width={W} height={H} className="absolute inset-0 overflow-visible" aria-hidden>
          {forma === "columnas" && (
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-border" />
          )}
          {forma === "columnas" &&
            puntos.map((p, i) => {
              if (p.valor == null) return null
              const bw = Math.min(40, (W / N) * 0.5)
              const top = y(Math.max(p.valor, 0))
              const h = Math.max(H - padBot - top, p.valor > 0 ? 2 : 0)
              const juzgado = p.estado !== "neutro"
              return (
                <rect
                  key={p.ym}
                  x={x(i) - bw / 2}
                  y={H - padBot - h}
                  width={bw}
                  height={h}
                  rx={3}
                  className={cn(
                    p.parcial && !juzgado
                      ? "fill-muted stroke-muted-foreground/50"
                      : ESTADO_UI[p.estado].fill
                  )}
                  strokeDasharray={p.parcial && !juzgado ? "3 2" : undefined}
                />
              )
            })}
          {forma === "linea" &&
            puntos.map((p, i) => {
              const q = puntos[i + 1]
              if (p.valor == null || !q || q.valor == null) return null
              return (
                <line
                  key={p.ym}
                  x1={x(i)}
                  y1={y(p.valor)}
                  x2={x(i + 1)}
                  y2={y(q.valor)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeDasharray={q.parcial ? "4 3" : undefined}
                />
              )
            })}
          {metaV != null && metaV >= lo && metaV <= hi && (
            <g>
              <line
                x1={0}
                x2={W}
                y1={y(metaV)}
                y2={y(metaV)}
                strokeWidth={1}
                strokeDasharray="4 4"
                className="stroke-foreground/45"
              />
            </g>
          )}
          {forma === "linea" &&
            puntos.map((p, i) => {
              if (p.valor == null) return null
              const r = H >= 80 ? 5 : 3.5
              const hueco = p.parcial
              return (
                <circle
                  key={p.ym}
                  cx={x(i)}
                  cy={y(p.valor)}
                  r={r}
                  strokeWidth={2}
                  className={cn(
                    hueco ? "fill-card" : ESTADO_UI[p.estado].fill,
                    hueco ? ESTADO_UI[p.estado].stroke : "stroke-card"
                  )}
                />
              )
            })}
        </svg>
      )}
    </div>
  )
}

// ==================== Tira de meses (eje X + tabla + planes) ====================

/**
 * Debajo del gráfico, alineada con sus columnas: cada mes con su valor, su `n`
 * y el acceso a su plan de acción. Es el eje X y la tabla gemela accesible.
 */
export function MesesStrip({
  puntos,
  fmt,
  conN,
  puedeEditar,
  onVerPlan,
  onCrearPlan,
  compacta,
}: {
  puntos: PuntoVista[]
  fmt: (v: number) => string
  conN: boolean
  puedeEditar: boolean
  onVerPlan: (p: FlotaPlanConItems) => void
  onCrearPlan: (ym: string, valor: number | null) => void
  compacta?: boolean
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${puntos.length}, minmax(0, 1fr))` }}
    >
      {puntos.map((p) => {
        const fuera = p.estado === "critico" || p.estado === "alerta"
        const accion: "ver" | "crear" | null = p.plan
          ? "ver"
          : fuera && puedeEditar
            ? "crear"
            : null
        const estadoTxt =
          p.estado === "neutro"
            ? p.motivo
              ? `sin juzgar, ${MOTIVO_LABEL[p.motivo]}`
              : "sin juzgar"
            : ESTADO_UI[p.estado].label.toLowerCase()
        const nTxt =
          conN && p.n != null ? `n=${p.n}${p.nTotal != null ? `/${p.nTotal}` : ""}` : null
        const contenido = (
          <>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {fmtMesCorto(p.ym)}
              {p.parcial && <span aria-hidden>*</span>}
            </span>
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                p.estado === "neutro" ? "text-muted-foreground" : ESTADO_UI[p.estado].texto
              )}
            >
              {p.valor == null ? "—" : fmt(p.valor)}
            </span>
            {nTxt && !compacta && (
              <span className="text-[11px] leading-none tabular-nums text-muted-foreground">
                {nTxt}
              </span>
            )}
            {accion === "ver" && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary">
                <ClipboardCheck className="size-3" aria-hidden /> Plan
              </span>
            )}
            {accion === "crear" && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <Plus className="size-3" aria-hidden /> Plan
              </span>
            )}
          </>
        )
        const aria = `${fmtMesLargo(p.ym)}${p.parcial ? " (en curso)" : ""}: ${
          p.valor == null ? "sin dato" : fmt(p.valor)
        }, ${estadoTxt}${nTxt ? `, ${nTxt}` : ""}.`
        const base =
          "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-center"
        if (!accion)
          return (
            <div key={p.ym} className={base} aria-label={aria} title={nTxt ?? undefined}>
              {contenido}
            </div>
          )
        return (
          <button
            key={p.ym}
            type="button"
            className={cn(
              base,
              "transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              accion === "ver" ? "hover:bg-primary/5" : "hover:bg-amber-500/10"
            )}
            aria-label={`${aria} ${accion === "ver" ? "Ver el plan de acción." : "Crear plan de acción."}`}
            title={nTxt ?? undefined}
            onClick={() => (p.plan ? onVerPlan(p.plan) : onCrearPlan(p.ym, p.valor))}
          >
            {contenido}
          </button>
        )
      })}
    </div>
  )
}

// ==================== Regla de meta (bullet) ====================

/**
 * Dónde cae el valor respecto de la meta. La franja ámbar ES la regla del
 * amarillo (`MARGEN_ALERTA`) dibujada: a la vista se entiende por qué un 94 %
 * contra 95 % es "cerca" y un 70 % es "fuera".
 */
export function MetaRegla({
  valor,
  meta,
  estado,
  fmt,
  pct,
  grande,
}: {
  valor: number | null
  meta: FlotaMeta | null
  estado: keyof typeof ESTADO_UI
  fmt: (v: number) => string
  pct?: boolean
  grande?: boolean
}) {
  const m = meta?.meta != null ? Number(meta.meta) : null
  const menor = meta?.comparador === "<="
  let lo = 0
  let hi = 100
  if (pct) {
    const piso = Math.min(valor ?? 100, m != null ? m * (1 - MARGEN_ALERTA) : 100)
    lo = Math.max(0, Math.floor((piso - 5) / 10) * 10)
  } else {
    hi = Math.max(valor ?? 0, m != null ? m * (1 + MARGEN_ALERTA) : 0) * 1.2 || 1
  }
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))

  const banda =
    m != null && m > 0
      ? menor
        ? [pos(m), pos(m * (1 + MARGEN_ALERTA))]
        : [pos(m * (1 - MARGEN_ALERTA)), pos(m)]
      : null
  const okZona = m != null ? (menor ? [0, pos(m)] : [pos(m), 100]) : null
  const h = grande ? "h-3" : "h-2"
  const aria = `${valor == null ? "Sin dato" : fmt(valor)}${
    m != null ? `, meta ${menor ? "menor o igual a" : "mayor o igual a"} ${fmt(m)}` : ", sin meta"
  }, ${ESTADO_UI[estado].label.toLowerCase()}`

  return (
    <div role="img" aria-label={aria} className={cn(grande ? "pt-1 pb-5" : "")}>
      <div className={cn("relative w-full rounded-full bg-muted", h)}>
        {okZona && (
          <div
            className="absolute inset-y-0 rounded-full bg-emerald-500/15 dark:bg-emerald-400/15"
            style={{ left: `${okZona[0]}%`, width: `${okZona[1] - okZona[0]}%` }}
          />
        )}
        {banda && (
          <div
            className="absolute inset-y-0 bg-amber-500/30 dark:bg-amber-400/25"
            style={{ left: `${banda[0]}%`, width: `${Math.max(banda[1] - banda[0], 0.5)}%` }}
          />
        )}
        {m != null && (
          <div
            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground/70"
            style={{ left: `${pos(m)}%` }}
          />
        )}
        {valor != null && (
          <div
            className={cn(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
              grande ? "size-4" : "size-3",
              estado === "neutro"
                ? "border-2 border-muted-foreground bg-card"
                : ESTADO_UI[estado].bg
            )}
            style={{ left: `${pos(valor)}%` }}
          />
        )}
        {grande && (
          <>
            {(m == null || pos(m) > 30) && (
              <span className="absolute top-full left-0 mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                {fmt(lo)}
              </span>
            )}
            {m != null && (
              <span
                className={cn(
                  "absolute top-full mt-1.5 text-[11px] font-medium whitespace-nowrap tabular-nums text-foreground",
                  pos(m) > 80 ? "right-0" : pos(m) < 20 ? "left-0" : "-translate-x-1/2"
                )}
                style={pos(m) > 80 || pos(m) < 20 ? undefined : { left: `${pos(m)}%` }}
              >
                meta {fmt(m)}
              </span>
            )}
            {(m == null || pos(m) < 70) && (
              <span className="absolute top-full right-0 mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                {fmt(hi)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ==================== Avance del mes en curso (acumulativos) ====================

/**
 * El mes en curso de un acumulativo, sin juicio: cuánto lleva y en qué día del
 * mes estamos. Sin proyección lineal: la medición de neumáticos y el CIL van
 * por rondas, y una recta le pondría un semáforo encubierto a algo que todavía
 * no se puede juzgar.
 */
export function AvanceMes({
  punto,
  meta,
  fmt,
  hoy,
}: {
  punto: PuntoVista
  meta: FlotaMeta | null
  fmt: (v: number) => string
  hoy: string
}) {
  const m = meta?.meta != null ? Number(meta.meta) : null
  const dia = Number(hoy.slice(8, 10))
  const total = diasDelMes(punto.ym)
  const frac = punto.valor != null && m != null && m > 0 ? Math.min(punto.valor / m, 1) : null
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground first-letter:uppercase">
            {fmtMesNombre(punto.ym)}
          </span>{" "}
          en curso · día {dia} de {total}
        </span>
        <span className="font-semibold tabular-nums text-foreground">
          {punto.valor == null ? "—" : fmt(punto.valor)}
        </span>
      </div>
      {frac != null && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-slate-400/80 dark:bg-slate-500"
              style={{ width: `${frac * 100}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {Math.round((punto.valor! / m!) * 100)}% de la meta
          </span>
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Se juzga contra la meta al cierre del mes.
      </p>
    </div>
  )
}

// ==================== Causas de parada (disponibilidad) ====================

export function CausasParada({ calc, ym }: { calc: CalcDisponibilidadMes; ym: string }) {
  const pal = usePaletaViz()
  let pmc = 0
  let pmp = 0
  let ind = 0
  for (const f of calc.filas) {
    pmc += f.pmc
    pmp += f.pmp
    ind += f.ind
  }
  const total = pmc + pmp + ind
  const partes = [
    { key: "correctivo", label: "Correctivo", v: pmc, color: pal.paradas.correctivo },
    { key: "preventivo", label: "Preventivo", v: pmp, color: pal.paradas.preventivo },
    { key: "indisponible", label: "Indisponible", v: ind, color: pal.paradas.indisponible },
  ]
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Días-camión perdidos en {fmtMesNombre(ym)}
        <span className="ml-1.5 font-semibold tabular-nums text-foreground">{total}</span>
      </p>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Ninguna unidad de ruta estuvo parada.</p>
      ) : (
        <>
          <div
            className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={partes.map((p) => `${p.label} ${p.v}`).join(", ")}
          >
            {partes
              .filter((p) => p.v > 0)
              .map((p) => (
                <div
                  key={p.key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(p.v / total) * 100}%`, backgroundColor: p.color }}
                />
              ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {partes.map((p) => (
              <li key={p.key} className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.label}
                <span className="font-semibold tabular-nums text-foreground">{p.v}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
