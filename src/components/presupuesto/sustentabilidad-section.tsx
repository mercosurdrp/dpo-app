"use client"

import { useState } from "react"
import { Leaf } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type {
  SustentabilidadFgli,
  SustentabilidadPresupuesto,
} from "@/actions/presupuesto-sustentabilidad"

const MES_CORTO = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** Colores de las series: azul = año anterior, gris punteado = presupuesto, verde = real, ámbar = meta. */
const COLOR_ANTERIOR = "#2563eb"
const COLOR_PPTO = "#94a3b8"
const COLOR_REAL = "#059669"
const COLOR_META = "#d97706"

function ppm(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}
function hl(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)
}
function pct(a: number | null, b: number | null): string | null {
  if (a === null || b === null || b <= 0) return null
  const p = ((a - b) / b) * 100
  return `${p > 0 ? "+" : ""}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(p)}%`
}

/**
 * Presupuesto y sustentabilidad: ¿el presupuesto mejora el FGLI? Tres números
 * en la misma vara (año anterior real → presupuesto → real a la fecha), la
 * serie mensual y la composición por pata.
 */
export function SustentabilidadSection({
  data,
  anio,
}: {
  data: SustentabilidadPresupuesto | null
  anio: number
}) {
  const fgli = data?.fgli ?? null
  // Mes a mes: qué pasó cada mes. Acumulado: cómo va el año (Σ HL ÷ Σ HL de
  // enero al mes), la vista que se compara con la meta y el presupuesto anual.
  const [vista, setVista] = useState<"mensual" | "acumulado">("mensual")
  const acum = vista === "acumulado"
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Presupuesto y sustentabilidad {anio}
      </h2>
      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Leaf className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  FGLI · Finished Goods Loss Index (HL perdidos por millón de HL)
                </p>
                <p className="text-xs text-muted-foreground">
                  Roturas y derrames descartados + producto vencido +
                  diferencias de inventario, sin faltantes de entrega (Handbook
                  Almacén 3.4). Es merma final, la base del presupuesto, leída
                  de la misma base del Reporte DPO que alimenta el Árbol del
                  Sueño. El FGLI del árbol mide volumen afectado (incluye lo
                  que entra a reempaque), por eso es más alto y no se compara
                  con éste. El presupuesto fija cuánto se prevé perder: la Q
                  de la hoja ALMACEN PXQ pasada a HL sobre los HL que prevé
                  vender. La meta aplica la regla del árbol en esta base: 10 %
                  mejor que el año anterior, con el año anterior de gatillo.
                </p>
              </div>
            </div>
            {fgli && <VeredictoBadge fgli={fgli} />}
          </div>

          {!fgli && (
            <p className="text-sm text-muted-foreground">
              {data?.avisos?.[0] ?? "Sin datos para este año."}
            </p>
          )}

          {fgli && (
            <>
              {/* Los cuatro números */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Tile
                  titulo={`Real ${fgli.anio - 1}`}
                  valor={ppm(fgli.anteriorPpm)}
                  nota={
                    fgli.anteriorIncluye.length < 3
                      ? "roturas + vencidos (sin diferencias: el depósito no las reporta para ese año)"
                      : "año completo · es el gatillo"
                  }
                />
                <Tile
                  titulo={`Meta ${fgli.anio}`}
                  valor={ppm(fgli.metaPpm)}
                  nota={
                    fgli.metaPpm !== null
                      ? `10 % mejor que el real ${fgli.anio - 1} (regla del Sueño)`
                      : `sin real ${fgli.anio - 1} no hay meta`
                  }
                />
                <Tile
                  titulo={`Presupuesto ${fgli.anio}`}
                  valor={ppm(fgli.pptoAnualPpm)}
                  nota={
                    pct(fgli.pptoAnualPpm, fgli.anteriorPpm)
                      ? `${pct(fgli.pptoAnualPpm, fgli.anteriorPpm)} contra el real ${fgli.anio - 1}${
                          fgli.metaPpm !== null && fgli.pptoAnualPpm !== null
                            ? fgli.pptoAnualPpm <= fgli.metaPpm
                              ? " · cumple la meta"
                              : ` · ${pct(fgli.pptoAnualPpm, fgli.metaPpm)} sobre la meta`
                            : ""
                        } · año completo`
                      : "año completo"
                  }
                  tono={
                    fgli.pptoAnualPpm !== null && fgli.anteriorPpm !== null
                      ? fgli.pptoAnualPpm <= (fgli.metaPpm ?? fgli.anteriorPpm)
                        ? "ok"
                        : "mal"
                      : undefined
                  }
                />
                <Tile
                  titulo={`Real ${fgli.anio} a la fecha`}
                  valor={ppm(fgli.realYtdPpm)}
                  nota={
                    fgli.pptoYtdPpm !== null && fgli.realYtdPpm !== null
                      ? `${pct(fgli.realYtdPpm, fgli.pptoYtdPpm)} contra el presupuesto de los mismos ${fgli.mesesConReal} meses (${ppm(fgli.pptoYtdPpm)})`
                      : `${fgli.mesesConReal} meses con dato`
                  }
                  tono={
                    fgli.pptoYtdPpm !== null && fgli.realYtdPpm !== null
                      ? fgli.realYtdPpm <= fgli.pptoYtdPpm
                        ? "ok"
                        : "mal"
                      : undefined
                  }
                />
              </div>

              {/* Serie mensual / acumulada */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-700">
                  {acum ? "Acumulado del año, de enero a cada mes" : "Mes a mes"}
                </p>
                <div className="inline-flex rounded-md border bg-slate-50 p-0.5 text-xs" role="tablist" aria-label="Vista del gráfico">
                  {(["mensual", "acumulado"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={vista === v}
                      onClick={() => setVista(v)}
                      className={`rounded px-2.5 py-1 transition-colors ${
                        vista === v ? "bg-white font-medium text-slate-900 shadow-sm" : "text-muted-foreground hover:text-slate-700"
                      }`}
                    >
                      {v === "mensual" ? "Mes a mes" : "Acumulado"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={fgli.meses.map((m) => {
                      const p = acum ? m.pptoAcumPpm : m.pptoPpm
                      const r = acum ? m.realAcumPpm : m.realPpm
                      const a = acum ? m.anteriorAcumPpm : m.anteriorPpm
                      return {
                        mes: MES_CORTO[m.mes],
                        presupuesto: p !== null ? Math.round(p) : null,
                        real: r !== null ? Math.round(r) : null,
                        anterior: a !== null ? Math.round(a) : null,
                      }
                    })}
                    margin={{ top: 5, right: 14, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="capitalize" />
                    <YAxis tick={{ fontSize: 11 }} width={48} domain={[0, "auto"]} />
                    <Tooltip
                      formatter={(v, n) => [
                        v === null ? "—" : `${ppm(Number(v))} ppm${acum ? " acum." : ""}`,
                        n === "presupuesto"
                          ? `Presupuesto ${fgli.anio}`
                          : n === "real"
                            ? `Real ${fgli.anio}`
                            : `Real ${fgli.anio - 1}`,
                      ]}
                      labelClassName="capitalize"
                      contentStyle={{ fontSize: 12 }}
                    />
                    {fgli.metaPpm !== null && (
                      <ReferenceLine
                        y={Math.round(fgli.metaPpm)}
                        stroke={COLOR_META}
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        ifOverflow="extendDomain"
                        label={{
                          value: `meta ${ppm(fgli.metaPpm)}`,
                          position: "insideTopRight",
                          fontSize: 10,
                          fill: COLOR_META,
                        }}
                      />
                    )}
                    <Line type="monotone" dataKey="anterior" name="anterior" stroke={COLOR_ANTERIOR} strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="presupuesto" name="presupuesto" stroke={COLOR_PPTO} strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="real" name="real" stroke={COLOR_REAL} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                <LeyendaItem color={COLOR_ANTERIOR} etiqueta={`Real ${fgli.anio - 1}`} />
                <LeyendaItem color={COLOR_PPTO} etiqueta={`Presupuesto ${fgli.anio}`} punteada />
                <LeyendaItem color={COLOR_REAL} etiqueta={`Real ${fgli.anio}`} />
                {fgli.metaPpm !== null && (
                  <LeyendaItem color={COLOR_META} etiqueta={`Meta ${fgli.anio} (anual)`} punteada />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {acum
                  ? `Cada punto es el FGLI de enero a ese mes (Σ HL perdidos ÷ Σ HL). Es la vista que se compara con la meta: donde termina el verde es el FGLI del año a la fecha, y donde termina la punteada gris, el presupuesto anual.`
                  : `Cada mes en la misma vara y de la misma fuente: lo que se perdió el mismo mes de ${fgli.anio - 1}, lo que el presupuesto prevé perder, el real de ${fgli.anio} y la meta anual. Los meses de verde por debajo de la punteada gris le ganaron al presupuesto; por debajo del azul, al año anterior.`}
              </p>

              {/* Composición por pata */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Pata del FGLI</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Real {fgli.anio - 1} (HL)</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Presupuesto {fgli.anio} (HL)</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Real {fgli.anio} a la fecha (HL)</th>
                      <th className="py-1.5 text-right font-medium">Conversión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fgli.patas.map((p) => (
                      <tr key={p.key} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 text-slate-800">{p.label}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{hl(p.hlAnterior)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {hl(p.hlPpto)}
                          {p.bultosPpto !== null && (
                            <span className="ml-1 text-muted-foreground">
                              ({new Intl.NumberFormat("es-AR").format(Math.round(p.bultosPpto))} bultos)
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{hl(p.hlReal)}</td>
                        <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                          {p.factorHlBulto !== null
                            ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(p.factorHlBulto)} HL/bulto${p.factorPrestado ? " (de roturas)" : ""}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                La Q del presupuesto está en bultos; se pasa a HL con el mix
                real del año reportado por el depósito. Diferencias de
                inventario usa el factor de roturas porque el depósito no
                reporta bultos para esa pata. Los reales de {fgli.anio - 1} y{" "}
                {fgli.anio} son la merma final de la base del Reporte DPO del
                depósito, sobre los HL despachados en concepto de venta; el
                presupuesto divide por los HL que preveía vender.
              </p>
              {data?.avisos && data.avisos.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                  {data.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function LeyendaItem({
  color,
  etiqueta,
  punteada,
}: {
  color: string
  etiqueta: string
  punteada?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="22" height="8" aria-hidden="true">
        <line
          x1="1"
          y1="4"
          x2="21"
          y2="4"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={punteada ? "4 3" : undefined}
        />
      </svg>
      {etiqueta}
    </span>
  )
}

function Tile({
  titulo,
  valor,
  nota,
  tono,
}: {
  titulo: string
  valor: string
  nota?: string
  tono?: "ok" | "mal"
}) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p
        className={`text-xl font-bold tabular-nums ${
          tono === "ok" ? "text-emerald-700" : tono === "mal" ? "text-red-600" : "text-slate-900"
        }`}
      >
        {valor} <span className="text-sm font-normal text-muted-foreground">ppm</span>
      </p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  )
}

/** Una frase: ¿el presupuesto mejora el indicador y se está cumpliendo? */
function VeredictoBadge({ fgli }: { fgli: SustentabilidadFgli }) {
  const mejoraPpto =
    fgli.pptoAnualPpm !== null && fgli.anteriorPpm !== null
      ? fgli.pptoAnualPpm <= fgli.anteriorPpm
      : null
  const cumple =
    fgli.realYtdPpm !== null && fgli.pptoYtdPpm !== null
      ? fgli.realYtdPpm <= fgli.pptoYtdPpm
      : null
  if (mejoraPpto === null) return null
  if (mejoraPpto && cumple === true) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        El presupuesto mejora el FGLI y se está cumpliendo
      </Badge>
    )
  }
  if (mejoraPpto && cumple === false) {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        El presupuesto mejora el FGLI, pero el real va por encima
      </Badge>
    )
  }
  if (mejoraPpto) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        El presupuesto mejora el FGLI
      </Badge>
    )
  }
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      El presupuesto prevé perder más que el año anterior
    </Badge>
  )
}
