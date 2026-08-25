"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Info, TrendingDown, TrendingUp } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ARBOL_RECHAZO,
  NIVELES_KPI_ORDEN,
  NIVEL_KPI_LABEL,
  NODOS_SIN_FUENTE,
  type NivelKpi,
  type NodoArbolKpi,
} from "@/lib/arbol-kpi/rechazo"
import type { ArbolKpiData, NodoValor } from "@/actions/arbol-kpi"

interface Props {
  data: ArbolKpiData
}

function fmt(valor: number | null, unidad: string): string {
  if (valor == null) return "—"
  const dec = unidad === "HL" || unidad === "PPM" || unidad === "PDV" ? 0 : unidad === "CEq/km" ? 2 : 1
  return valor.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

/** Verde si el nodo va para el lado correcto de la meta; ámbar cerca; rojo lejos. */
function colorMeta(
  valor: number | null,
  meta: number | null,
  mejorSi: NodoArbolKpi["mejorSi"],
): string {
  if (valor == null || meta == null || mejorSi === "sin") return "text-slate-900"
  const cumple = mejorSi === "mayor" ? valor >= meta : valor <= meta
  if (cumple) return "text-emerald-600"
  const desvio = mejorSi === "mayor" ? meta / valor : valor / meta
  return desvio <= 1.25 ? "text-amber-600" : "text-red-600"
}

const NIVEL_ACENTO: Record<NivelKpi, string> = {
  kpi: "border-l-sky-400",
  componente: "border-l-indigo-400",
  proceso: "border-l-violet-400",
  actividad: "border-l-teal-400",
  tarea: "border-l-amber-400",
}

export function ArbolKpiClient({ data }: Props) {
  const [detalle, setDetalle] = useState<NodoArbolKpi | null>(null)

  const labelDe = (key: string | null) =>
    key ? ARBOL_RECHAZO.find((n) => n.key === key)?.label ?? null : null

  return (
    // Full-bleed sobre el navy del shell, igual que /devolucion.
    <div className="-mx-4 -mb-4 -mt-14 min-h-dvh bg-gradient-to-b from-navy-light to-navy px-4 pb-12 pt-20 md:-m-6 md:px-8 md:pt-10">
      <div className="mx-auto max-w-[1500px] space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Árbol KPI · Rechazo</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              El KPI abierto en los drivers que la operación puede mover, hasta el último
              nivel. Cada tarjeta muestra el mes en curso (MTH) y el acumulado del año (YTD).
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Período</p>
            <p className="text-lg font-semibold text-white">
              {data.mesLabel} {data.anio}
            </p>
          </div>
        </div>

        {/* Columnas del árbol */}
        <div className="grid gap-4 lg:grid-cols-5">
          {NIVELES_KPI_ORDEN.map((nivel) => {
            const nodos = ARBOL_RECHAZO.filter((n) => n.nivel === nivel)
            if (nodos.length === 0) return null
            return (
              <div key={nivel} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {NIVEL_KPI_LABEL[nivel]}
                </p>
                {nodos.map((nodo) => {
                  const v: NodoValor = data.valores[nodo.key] ?? { mth: null, ytd: null }
                  const padre = labelDe(nodo.parentKey)
                  return (
                    <button
                      key={nodo.key}
                      onClick={() => setDetalle(nodo)}
                      className={`w-full rounded-xl border border-l-4 border-slate-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md ${NIVEL_ACENTO[nodo.nivel]}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight text-slate-900">
                          {nodo.label}
                        </p>
                        <Info className="mt-0.5 size-3.5 shrink-0 text-slate-300" />
                      </div>
                      {padre && (
                        <p className="mt-0.5 text-[11px] text-slate-400">de {padre}</p>
                      )}
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">MTH</p>
                          <p
                            className={`text-xl font-bold leading-none ${colorMeta(v.mth, nodo.meta, nodo.mejorSi)}`}
                          >
                            {fmt(v.mth, nodo.unidad)}
                            <span className="ml-1 text-xs font-medium text-slate-400">
                              {nodo.unidad}
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">YTD</p>
                          <p className="text-sm font-semibold leading-none text-slate-600">
                            {fmt(v.ytd, nodo.unidad)}
                          </p>
                        </div>
                      </div>
                      {nodo.meta != null && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                          {nodo.mejorSi === "mayor" ? (
                            <TrendingUp className="size-3" />
                          ) : (
                            <TrendingDown className="size-3" />
                          )}
                          meta {fmt(nodo.meta, nodo.unidad)} {nodo.unidad}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Lo que no se mide, y por qué. La auditoría pregunta por el cascadeo
            completo: la respuesta honesta es decir qué falta. */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">
            Del árbol corporativo quedaron afuera {NODOS_SIN_FUENTE.length} nodos
          </p>
          <p className="mt-1 text-xs text-slate-400">
            No se dibujan porque hoy no tienen fuente propia en Pampeana. Un nodo
            siempre vacío le resta credibilidad al tablero.
          </p>
          <ul className="mt-3 space-y-2">
            {NODOS_SIN_FUENTE.map((n) => (
              <li key={n.label} className="text-xs text-slate-300">
                <span className="font-semibold text-slate-100">{n.label}</span>
                <span className="text-slate-500"> · {NIVEL_KPI_LABEL[n.nivel]}</span>
                <span className="block text-slate-400">{n.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Detalle del nodo: de dónde sale el número */}
      <Dialog open={!!detalle} onOpenChange={(open: boolean) => !open && setDetalle(null)}>
        <DialogContent showExpandButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detalle?.label}</DialogTitle>
            <DialogDescription>
              {detalle ? NIVEL_KPI_LABEL[detalle.nivel] : ""}
              {detalle?.parentKey ? ` · de ${labelDe(detalle.parentKey)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detalle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-muted-foreground">Mes en curso</p>
                  <p
                    className={`text-2xl font-bold ${colorMeta(
                      data.valores[detalle.key]?.mth ?? null,
                      detalle.meta,
                      detalle.mejorSi,
                    )}`}
                  >
                    {fmt(data.valores[detalle.key]?.mth ?? null, detalle.unidad)}{" "}
                    <span className="text-sm font-medium text-slate-400">{detalle.unidad}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-muted-foreground">Año a la fecha</p>
                  <p className="text-2xl font-bold text-slate-700">
                    {fmt(data.valores[detalle.key]?.ytd ?? null, detalle.unidad)}{" "}
                    <span className="text-sm font-medium text-slate-400">{detalle.unidad}</span>
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  De dónde sale
                </p>
                <p className="mt-1 text-sm text-slate-700">{detalle.fuente}</p>
              </div>
              {detalle.href && (
                <Link
                  href={detalle.href}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                >
                  Ir al módulo <ArrowUpRight className="size-4" />
                </Link>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
