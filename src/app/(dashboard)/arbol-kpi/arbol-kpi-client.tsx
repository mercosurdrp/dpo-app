"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { Maximize2, Minus, Plus } from "lucide-react"
import {
  ARBOL_RECHAZO,
  NIVELES_KPI_ORDEN,
  NIVEL_KPI_LABEL,
  NODOS_SIN_FUENTE,
  RAIZ_RECHAZO,
  hijosDe,
  type NodoArbolKpi,
} from "@/lib/arbol-kpi/rechazo"
import type { ArbolKpiData, NodoValor } from "@/actions/arbol-kpi"
import { NodoDetalleDialog } from "./_components/nodo-detalle-dialog"
import "./arbol-kpi.css"

interface Props {
  data: ArbolKpiData
}

/** Ancho de nodo y corredor entre niveles: fijos, para que cada nivel caiga
 *  en la misma columna y los encabezados de arriba digan la verdad. */
const ANCHO_NODO = 196
const CORREDOR = 44 // 2 × --akpi-gap del CSS

function fmt(valor: number | null, unidad: string): string {
  if (valor == null) return "—"
  const dec =
    unidad === "HL" || unidad === "PPM" || unidad === "PDV"
      ? 0
      : unidad === "CEq/km" || unidad === "HL/PDV"
        ? 2
        : 1
  return valor.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

type Estado = "bien" | "cerca" | "mal" | "neutro"

function estadoDe(
  valor: number | null,
  meta: number | null,
  mejorSi: NodoArbolKpi["mejorSi"],
): Estado {
  if (valor == null || meta == null || mejorSi === "sin") return "neutro"
  const cumple = mejorSi === "mayor" ? valor >= meta : valor <= meta
  if (cumple) return "bien"
  const lejos = mejorSi === "mayor" ? meta / valor : valor / meta
  return lejos <= 1.25 ? "cerca" : "mal"
}

const COLOR_VALOR: Record<Estado, string> = {
  bien: "text-emerald-600",
  cerca: "text-amber-600",
  mal: "text-red-600",
  neutro: "text-slate-900",
}

/** Punto de estado: el semáforo tiene que leerse sin decodificar el número. */
const COLOR_PUNTO: Record<Estado, string> = {
  bien: "bg-emerald-500",
  cerca: "bg-amber-500",
  mal: "bg-red-500",
  neutro: "bg-slate-300",
}

export function ArbolKpiClient({ data }: Props) {
  const [detalle, setDetalle] = useState<NodoArbolKpi | null>(null)
  const [zoom, setZoom] = useState(1)
  const [auto, setAuto] = useState(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const lienzoRef = useRef<HTMLDivElement>(null)

  /** Escala para que el árbol entre entero: es el punto del pedido. */
  const ajustar = useCallback(() => {
    const vp = viewportRef.current
    const ct = lienzoRef.current
    if (!vp || !ct) return
    // scrollWidth/Height del lienzo SIN escalar (la escala vive en un hijo).
    const w = ct.scrollWidth
    const h = ct.scrollHeight
    if (!w || !h) return
    // En mobile el árbol se lee scrolleando a tamaño real: encogerlo no ayuda.
    if (window.innerWidth < 1024) {
      setZoom(1)
      return
    }
    const s = Math.min(vp.clientWidth / w, vp.clientHeight / h, 1)
    setZoom(Math.min(1, Math.max(0.4, Math.round(s * 100) / 100)))
  }, [])

  useLayoutEffect(() => {
    if (!auto) return
    ajustar()
    const vp = viewportRef.current
    if (!vp || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => ajustar())
    ro.observe(vp)
    return () => ro.disconnect()
  }, [auto, ajustar])

  const nodo = (key: string) => ARBOL_RECHAZO.find((n) => n.key === key)
  const valorDe = (key: string): NodoValor => data.valores[key] ?? { mth: null, ytd: null }

  function Tarjeta({ n, raiz = false }: { n: NodoArbolKpi; raiz?: boolean }) {
    const v = valorDe(n.key)
    const est = estadoDe(v.mth, n.meta, n.mejorSi)
    return (
      <button
        onClick={() => setDetalle(n)}
        style={{ width: ANCHO_NODO }}
        className={`group shrink-0 rounded-lg bg-white px-3 text-left shadow-md shadow-black/25 ring-1 ring-slate-200 transition-shadow hover:shadow-lg hover:shadow-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
          raiz ? "py-3" : "py-2"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className={`size-1.5 shrink-0 rounded-full ${COLOR_PUNTO[est]}`} />
          <span
            className={`truncate font-semibold leading-tight text-slate-700 ${
              raiz ? "text-[13px]" : "text-[12px]"
            }`}
            title={n.label}
          >
            {n.label}
          </span>
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-2">
          <span
            className={`font-bold tabular-nums leading-none ${COLOR_VALOR[est]} ${
              raiz ? "text-[26px]" : "text-[17px]"
            }`}
          >
            {fmt(v.mth, n.unidad)}
            <span className="ml-0.5 text-[10px] font-semibold text-slate-400">
              {n.unidad}
            </span>
          </span>
          <span className="text-[10px] tabular-nums leading-none text-slate-400">
            año {fmt(v.ytd, n.unidad)}
          </span>
        </span>
      </button>
    )
  }

  /** Rama recursiva: <li>[nodo][hijos]</li>. El centrado lo hace el CSS. */
  function Rama({ n, raiz = false }: { n: NodoArbolKpi; raiz?: boolean }) {
    const hijos = hijosDe(n.key)
    return (
      <li>
        <Tarjeta n={n} raiz={raiz} />
        {hijos.length > 0 && (
          <ul>
            {hijos.map((h) => (
              <Rama key={h.key} n={h} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const pct = Math.round(zoom * 100)

  return (
    <div className="-mx-4 -mb-4 -mt-14 flex min-h-dvh flex-col bg-gradient-to-b from-navy-light to-navy px-4 pb-8 pt-20 md:-m-6 md:px-8 md:pt-8">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Árbol KPI · Rechazo
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-blue-200/80">
            El KPI abierto en los drivers que la operación puede mover. Cada tarjeta
            muestra el mes en curso y, en chico, el acumulado del año.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-200/60">
              Período
            </p>
            <p className="text-sm font-semibold text-white">
              {data.mesLabel} {data.anio}
            </p>
          </div>
          {/* Zoom: 20 nodos no siempre entran en cualquier pantalla. */}
          <div className="hidden items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-1 lg:flex">
            <button
              onClick={() => {
                setAuto(false)
                setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))
              }}
              className="grid size-8 place-items-center rounded text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Alejar"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-11 text-center text-xs font-semibold tabular-nums text-blue-100">
              {pct}%
            </span>
            <button
              onClick={() => {
                setAuto(false)
                setZoom((z) => Math.min(1.4, Math.round((z + 0.1) * 100) / 100))
              }}
              className="grid size-8 place-items-center rounded text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Acercar"
            >
              <Plus className="size-4" />
            </button>
            <button
              onClick={() => {
                setAuto(true)
                ajustar()
              }}
              className={`ml-0.5 grid size-8 place-items-center rounded transition-colors hover:bg-white/10 hover:text-white ${
                auto ? "bg-blue-600 text-white" : "text-blue-100"
              }`}
              aria-label="Ajustar a la pantalla"
              title="Ajustar a la pantalla"
            >
              <Maximize2 className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Encabezados de columna: los niveles caen en x fijas porque todos los
          nodos miden lo mismo, así que estas etiquetas son exactas. */}
      <div
        className="mt-5 hidden shrink-0 overflow-hidden lg:block"
        style={{ height: 18 }}
        aria-hidden="true"
      >
        <div
          className="flex"
          style={{
            gap: CORREDOR,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            width: "max-content",
          }}
        >
          {NIVELES_KPI_ORDEN.map((nivel) => (
            <span
              key={nivel}
              style={{ width: ANCHO_NODO }}
              className="text-[10px] font-semibold uppercase tracking-wider text-blue-200/50"
            >
              {NIVEL_KPI_LABEL[nivel]}
            </span>
          ))}
        </div>
      </div>

      {/* Lienzo del árbol */}
      <div
        ref={viewportRef}
        className="mt-2 min-h-[420px] flex-1 overflow-auto lg:overflow-hidden"
      >
        <div
          className="akpi-zoom origin-top-left transition-transform duration-200 ease-out"
          style={{ transform: `scale(${zoom})`, width: "max-content" }}
        >
          <div ref={lienzoRef} className="akpi-tree w-max">
            <ul>
              <Rama n={RAIZ_RECHAZO} raiz />
            </ul>
          </div>
        </div>
      </div>

      {/* Lo que no se mide, y por qué. La auditoría pregunta por el cascadeo
          completo: la respuesta honesta es decir qué falta. */}
      <details className="group mt-4 shrink-0 rounded-lg border border-white/10 bg-white/5">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-[13px] font-semibold text-white marker:content-none">
          <span className="text-blue-200/60">▸</span> Del árbol corporativo quedaron
          afuera {NODOS_SIN_FUENTE.length} nodos
          <span className="ml-2 font-normal text-blue-200/60">
            — no tienen fuente propia en Pampeana
          </span>
        </summary>
        <ul className="grid gap-x-8 gap-y-2 border-t border-white/10 px-4 py-3 md:grid-cols-2 xl:grid-cols-3">
          {NODOS_SIN_FUENTE.map((n) => (
            <li key={n.label} className="text-[12px] leading-snug">
              <span className="font-semibold text-white">{n.label}</span>
              <span className="text-blue-200/40"> · {NIVEL_KPI_LABEL[n.nivel]}</span>
              <span className="mt-0.5 block text-blue-200/70">{n.motivo}</span>
            </li>
          ))}
        </ul>
      </details>

      <NodoDetalleDialog
        nodo={detalle}
        padreLabel={detalle?.parentKey ? (nodo(detalle.parentKey)?.label ?? null) : null}
        mth={detalle ? valorDe(detalle.key).mth : null}
        ytd={detalle ? valorDe(detalle.key).ytd : null}
        mesLabel={data.mesLabel}
        onClose={() => setDetalle(null)}
      />
    </div>
  )
}
