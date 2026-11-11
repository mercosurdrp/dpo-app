"use client"

import { Fragment, useEffect, useMemo, useState, useTransition } from "react"
import { Boxes, ChevronDown, ChevronRight, ClipboardPlus, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getDqiPorTipoSku } from "@/actions/dqi"
import {
  ENVASE_SKU_COLOR,
  ENVASE_SKU_LABEL,
  FAMILIA_SKU_LABEL,
  type DqiGrupoEnvase,
  type DqiTipoSkuData,
  type FamiliaSku,
} from "@/lib/dqi/tipo-sku"

const MESES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const fmtHL = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtPPM = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
const fmtPct = (n: number | null) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)} %`

/** Recalcula los grupos dejando sólo los SKUs de una familia. El % se sigue
 * expresando sobre el DQI total del mes, para que se lea "cuánto del DQI es esto". */
function filtrarPorFamilia(data: DqiTipoSkuData, familia: FamiliaSku | "todas"): DqiGrupoEnvase[] {
  if (familia === "todas") return data.envases
  const den = data.hl_entregados
  const ppm = (hl: number) => (den ? (hl / den) * 1_000_000 : null)
  const tot = data.total.hl_total
  return data.envases
    .map((e) => {
      const calibres = e.calibres
        .map((c) => {
          const skus = c.skus.filter((s) => s.tipo.familia === familia)
          const hl_ruta = skus.reduce((a, s) => a + s.hl_ruta, 0)
          const hl_reempaque = skus.reduce((a, s) => a + s.hl_reempaque, 0)
          const hl_total = hl_ruta + hl_reempaque
          return { ...c, skus, hl_ruta, hl_reempaque, hl_total, ppm: ppm(hl_total) }
        })
        .filter((c) => c.skus.length > 0)
      const hl_ruta = calibres.reduce((a, c) => a + c.hl_ruta, 0)
      const hl_reempaque = calibres.reduce((a, c) => a + c.hl_reempaque, 0)
      const hl_total = hl_ruta + hl_reempaque
      return {
        ...e,
        calibres,
        hl_ruta,
        hl_reempaque,
        hl_total,
        ppm: ppm(hl_total),
        pct_dqi: tot > 0 ? (hl_total / tot) * 100 : null,
      }
    })
    .filter((e) => e.calibres.length > 0)
    .sort((x, y) => y.hl_total - x.hl_total)
}

/** Barras horizontales por envase, partidas en rotura en ruta (llena) y
 * reempaque (rayada): son dos mecanismos de rotura distintos. */
function BarrasEnvase({ envases, max }: { envases: DqiGrupoEnvase[]; max: number }) {
  return (
    <div className="space-y-1.5">
      {envases.map((e) => {
        const color = ENVASE_SKU_COLOR[e.envase]
        const wRuta = max > 0 ? (e.hl_ruta / max) * 100 : 0
        const wReemp = max > 0 ? (e.hl_reempaque / max) * 100 : 0
        return (
          <div key={e.envase} className="flex items-center gap-2 text-xs">
            <span className="w-32 shrink-0 truncate text-slate-600">{ENVASE_SKU_LABEL[e.envase]}</span>
            <div className="flex h-4 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
              <div style={{ width: `${wRuta}%`, background: color }} title={`Rotura en ruta: ${fmtHL(e.hl_ruta)} HL`} />
              <div
                style={{
                  width: `${wReemp}%`,
                  background: `repeating-linear-gradient(45deg, ${color}, ${color} 3px, ${color}66 3px, ${color}66 6px)`,
                }}
                title={`Reempaque: ${fmtHL(e.hl_reempaque)} HL`}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-slate-700">{fmtPct(e.pct_dqi)}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Tabla envase › calibre › SKU. Se usa en /indicadores/dqi y, compacta, en el
 * detalle del nodo DQI del Árbol de KPI.
 */
export function DqiTipoSkuTabla({
  envases,
  compacta = false,
  onCrearPlan,
}: {
  envases: DqiGrupoEnvase[]
  compacta?: boolean
  onCrearPlan?: (descripcion: string) => void
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const toggle = (k: string) =>
    setAbiertos((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  if (envases.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-400">Sin roturas ni reempaque con detalle por SKU.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-500">
            <th className="px-2 py-2 text-left font-medium">Envase › calibre › SKU</th>
            <th className="px-2 py-2 text-right font-medium" title="HL rotos en distribución">Ruta HL</th>
            <th className="px-2 py-2 text-right font-medium" title="HL que volvieron a reempaque">Reemp. HL</th>
            <th className="px-2 py-2 text-right font-medium">PPM</th>
            {!compacta && <th className="px-2 py-2 text-right font-medium">% DQI</th>}
            {onCrearPlan && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {envases.map((e) => {
            const kE = e.envase
            const abiertoE = abiertos.has(kE)
            return (
              <Fragment key={kE}>
                <tr className="cursor-pointer border-b border-slate-100 bg-slate-50/60 hover:bg-slate-100" onClick={() => toggle(kE)}>
                  <td className="px-2 py-2 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      {abiertoE ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ENVASE_SKU_COLOR[e.envase] }} />
                      {ENVASE_SKU_LABEL[e.envase]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-700">{fmtHL(e.hl_ruta)}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-700">{fmtHL(e.hl_reempaque)}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-slate-800">{fmtPPM(e.ppm)}</td>
                  {!compacta && <td className="px-2 py-2 text-right font-mono text-slate-700">{fmtPct(e.pct_dqi)}</td>}
                  {onCrearPlan && (
                    <td className="px-1 py-2 text-right">
                      <button
                        type="button"
                        title="Crear plan de acción para este envase"
                        className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          const top = e.calibres[0]
                          onCrearPlan(
                            `Reducir roturas de ${ENVASE_SKU_LABEL[e.envase]} (${fmtPPM(e.ppm)} PPM, ${fmtPct(e.pct_dqi)} del DQI)` +
                              (top ? `; principal calibre ${top.calibre} (${top.skus[0]?.descripcion ?? ""}).` : "."),
                          )
                        }}
                      >
                        <ClipboardPlus className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
                {abiertoE &&
                  e.calibres.map((c) => {
                    const kC = `${kE}|${c.calibre}`
                    const abiertoC = abiertos.has(kC)
                    return (
                      <Fragment key={kC}>
                        <tr className="cursor-pointer border-b border-slate-50 hover:bg-slate-50" onClick={() => toggle(kC)}>
                          <td className="py-1.5 pl-8 pr-2 text-slate-700">
                            <span className="inline-flex items-center gap-1">
                              {abiertoC ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {c.calibre}
                              <span className="text-xs text-slate-400">· {c.skus.length} SKU</span>
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-600">{fmtHL(c.hl_ruta)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-600">{fmtHL(c.hl_reempaque)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-700">{fmtPPM(c.ppm)}</td>
                          {!compacta && <td />}
                          {onCrearPlan && (
                            <td className="px-1 py-1.5 text-right">
                              <button
                                type="button"
                                title="Crear plan de acción para este calibre"
                                className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  onCrearPlan(
                                    `Reducir roturas de ${ENVASE_SKU_LABEL[e.envase]} ${c.calibre} (${fmtPPM(c.ppm)} PPM): ` +
                                      c.skus.slice(0, 3).map((s) => s.descripcion).join(", ") +
                                      ".",
                                  )
                                }}
                              >
                                <ClipboardPlus className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                        {abiertoC &&
                          c.skus.map((s) => (
                            <tr key={`${kC}|${s.codigo}`} className="border-b border-slate-50 text-xs">
                              <td className="py-1.5 pl-14 pr-2 text-slate-600">
                                <div>
                                  {s.descripcion}{" "}
                                  <span className="text-slate-400">
                                    · {s.codigo} · {FAMILIA_SKU_LABEL[s.tipo.familia]}
                                  </span>
                                </div>
                                {(s.patentes.length > 0 || s.motivos_chofer.length > 0) && (
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    {s.patentes.map((p) => (
                                      <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                        {p}
                                      </span>
                                    ))}
                                    {s.motivos_chofer.map((m) => (
                                      <span key={m} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800" title="Motivo cargado por el chofer en Mis roturas">
                                        {m}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-500">{fmtHL(s.hl_ruta)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-500">{fmtHL(s.hl_reempaque)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-600">{fmtPPM(s.ppm)}</td>
                              {!compacta && <td />}
                              {onCrearPlan && <td />}
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Hook compartido: carga la apertura por SKU del mes. */
export function useDqiTipoSku(year: number, month: number) {
  const [data, setData] = useState<DqiTipoSkuData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    startTransition(async () => {
      const res = await getDqiPorTipoSku(year, month)
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setError(null)
        setData(res.data)
      }
    })
  }, [year, month])
  return { data, error, pending }
}

export function DqiTipoSkuCard({
  year,
  month,
  onCrearPlan,
}: {
  year: number
  month: number
  onCrearPlan?: (descripcion: string) => void
}) {
  const { data, error, pending } = useDqiTipoSku(year, month)
  const [familia, setFamilia] = useState<FamiliaSku | "todas">("todas")

  const envases = useMemo(() => (data ? filtrarPorFamilia(data, familia) : []), [data, familia])
  const familias = useMemo(() => {
    const s = new Set<FamiliaSku>()
    for (const e of data?.envases ?? []) for (const c of e.calibres) for (const k of c.skus) s.add(k.tipo.familia)
    return [...s]
  }, [data])
  const max = Math.max(0, ...envases.map((e) => e.hl_total))
  const top = envases[0]

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-700">
              ¿Qué se rompe? · DQI por tipo de SKU · {MESES_FULL[month - 1]} {year}
            </h2>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          {familias.length > 1 && (
            <select
              value={familia}
              onChange={(e) => setFamilia(e.target.value as FamiliaSku | "todas")}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              aria-label="Filtrar por familia"
            >
              <option value="todas">Todas las familias</option>
              {familias.map((f) => (
                <option key={f} value={f}>
                  {FAMILIA_SKU_LABEL[f]}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {data && (
          <div className="space-y-4">
            {top && (
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{ENVASE_SKU_LABEL[top.envase]}</span> explica el{" "}
                <span className="font-semibold text-slate-800">{fmtPct(top.pct_dqi)}</span> del DQI del mes
                {top.hl_reempaque > top.hl_ruta
                  ? " — sobre todo por producto que vuelve a reempaque (packaging dañado)."
                  : " — sobre todo por roturas en ruta."}
              </p>
            )}

            <div>
              <BarrasEnvase envases={envases} max={max} />
              <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-4 rounded-sm bg-slate-500" /> Rotura en ruta
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-2.5 w-4 rounded-sm"
                    style={{ background: "repeating-linear-gradient(45deg,#64748b,#64748b 3px,#64748b66 3px,#64748b66 6px)" }}
                  />{" "}
                  Reempaque
                </span>
                <span>% = parte del DQI corregido del mes</span>
              </div>
            </div>

            <DqiTipoSkuTabla envases={envases} onCrearPlan={onCrearPlan} />

            {familia === "todas" && data.sin_detalle.hl > 0.0005 && (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Roturas en ruta sin detalle por SKU: {fmtHL(data.sin_detalle.hl)} HL ({fmtPPM(data.sin_detalle.ppm)} PPM).
                El DQI oficial las cuenta pero el tablero de pérdidas no las publica por artículo; se muestran aparte
                para que la suma cierre con el DQI corregido ({fmtPPM(data.total.ppm)} PPM).
              </p>
            )}

            <p className="text-[11px] text-slate-400">
              Fuente: detalle diario del tablero de pérdidas (roturas de distribución + reempaque) sobre los HL
              entregados del mes. Envase y calibre se leen de la descripción del artículo en Chess; la familia, del
              maestro de artículos. En amarillo, el motivo que cargó el chofer en Mis roturas.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
