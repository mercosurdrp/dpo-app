"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpRight as IrAlModulo,
  Loader2,
  Minus,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SerieMensualChart } from "@/components/arbol-kpi/serie-mensual-chart"
import { getArbolKpiRechazoSeries, type ArbolKpiSeries } from "@/actions/arbol-kpi"
import {
  NIVEL_KPI_LABEL,
  type NodoArbolKpi,
} from "@/lib/arbol-kpi/rechazo"

interface Props {
  nodo: NodoArbolKpi | null
  /** Nombre del padre, para ubicar el nodo en el cascadeo. */
  padreLabel: string | null
  mth: number | null
  ytd: number | null
  mesLabel: string
  onClose: () => void
}

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

function decimalesDe(unidad: string): number {
  if (unidad === "HL" || unidad === "PPM" || unidad === "PDV") return 0
  if (unidad === "CEq/km" || unidad === "HL/PDV") return 2
  return 1
}

/**
 * Detalle de un nodo: su historia, su objetivo y de dónde sale el número.
 *
 * La serie se pide al ABRIR (no viene con la página): son 15 series de hasta
 * doce meses y cargarlas de entrada infla el payload de una pantalla que casi
 * siempre se mira sin abrir ningún nodo.
 */
export function NodoDetalleDialog({
  nodo,
  padreLabel,
  mth,
  ytd,
  mesLabel,
  onClose,
}: Props) {
  const [series, setSeries] = useState<ArbolKpiSeries | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!nodo) {
      setSeries(null)
      setError(null)
      return
    }
    let cancelado = false
    setCargando(true)
    setError(null)
    void getArbolKpiRechazoSeries().then((res) => {
      if (cancelado) return
      if ("error" in res) {
        setError(res.error)
        setSeries(null)
      } else {
        setSeries(res.data)
      }
      setCargando(false)
    })
    return () => {
      cancelado = true
    }
  }, [nodo])

  const serie = nodo && series ? (series.series[nodo.key] ?? null) : null
  const sinSerie = nodo && series ? series.sinSerie[nodo.key] : undefined

  // Variación contra el mes anterior COMPLETO. El mes en curso todavía no
  // terminó, así que se dice explícitamente en vez de dar una falsa precisión.
  const conDato = (serie ?? []).map((v, i) => ({ v, i })).filter((x) => x.v != null)
  const actual = conDato.at(-1)?.v ?? null
  const previo = conDato.at(-2)?.v ?? null
  const delta = actual != null && previo != null ? actual - previo : null
  const mejora =
    delta == null || nodo == null || nodo.mejorSi === "sin"
      ? null
      : nodo.mejorSi === "mayor"
        ? delta >= 0
        : delta <= 0
  const promedioAnio =
    conDato.length > 0
      ? conDato.reduce((a, x) => a + Number(x.v), 0) / conDato.length
      : null

  return (
    <Dialog open={!!nodo} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent
        showExpandButton={false}
        className="max-h-[92vh] w-[95vw] max-w-2xl overflow-y-auto"
      >
        {nodo && (
          <>
            <DialogHeader>
              <DialogTitle>{nodo.label}</DialogTitle>
              <DialogDescription>
                {NIVEL_KPI_LABEL[nodo.nivel]}
                {padreLabel ? ` · cuelga de ${padreLabel}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {/* Los tres números que se discuten en la reunión */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-muted-foreground">{mesLabel}</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">
                    {fmt(mth, nodo.unidad)}
                    <span className="ml-1 text-sm font-medium text-slate-400">
                      {nodo.unidad}
                    </span>
                  </p>
                  {delta != null && (
                    <p
                      className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${
                        mejora == null
                          ? "text-slate-500"
                          : mejora
                            ? "text-emerald-600"
                            : "text-red-600"
                      }`}
                    >
                      {delta === 0 ? (
                        <Minus className="size-3" />
                      ) : delta > 0 ? (
                        <ArrowUpRight className="size-3" />
                      ) : (
                        <ArrowDownRight className="size-3" />
                      )}
                      {fmt(Math.abs(delta), nodo.unidad)} vs. mes anterior
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-muted-foreground">Año a la fecha</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-700">
                    {fmt(ytd, nodo.unidad)}
                  </p>
                  {promedioAnio != null && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      prom. mensual {fmt(promedioAnio, nodo.unidad)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-muted-foreground">Meta</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-700">
                    {nodo.meta == null ? "—" : fmt(nodo.meta, nodo.unidad)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {nodo.meta == null
                      ? "sin objetivo definido"
                      : nodo.mejorSi === "mayor"
                        ? "cuanto más alto, mejor"
                        : "cuanto más bajo, mejor"}
                  </p>
                </div>
              </div>

              {/* Histórico */}
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Mes a mes
                </p>
                {cargando && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Cargando histórico…
                  </div>
                )}
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}
                {!cargando && !error && sinSerie && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {sinSerie}
                  </p>
                )}
                {!cargando && !error && !sinSerie && series && serie && (
                  <SerieMensualChart
                    meses={series.meses}
                    valores={serie}
                    unidad={nodo.unidad}
                    meta={nodo.meta}
                    decimales={decimalesDe(nodo.unidad)}
                  />
                )}
              </div>

              {/* De dónde sale el número: sin esto el árbol no se discute */}
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  De dónde sale
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{nodo.fuente}</p>
                {nodo.href && (
                  <Link
                    href={nodo.href}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                  >
                    Ir al módulo <IrAlModulo className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
