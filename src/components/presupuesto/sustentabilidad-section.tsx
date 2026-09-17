"use client"

import { Leaf } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
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
                  Roturas y derrames + producto vencido + diferencias de
                  inventario, sin faltantes de entrega (Handbook Almacén 3.4).
                  El presupuesto fija cuánto se prevé perder: la Q de la hoja
                  ALMACEN PXQ pasada a HL sobre los HL que prevé vender.
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
              {/* Los tres números */}
              <div className="grid gap-3 sm:grid-cols-3">
                <Tile
                  titulo={`Real ${fgli.anio - 1}`}
                  valor={ppm(fgli.anteriorPpm)}
                  nota={
                    fgli.anteriorIncluye.length < 3
                      ? "roturas + vencidos (sin diferencias: el depósito no las reporta para ese año)"
                      : "año completo"
                  }
                />
                <Tile
                  titulo={`Presupuesto ${fgli.anio}`}
                  valor={ppm(fgli.pptoAnualPpm)}
                  nota={
                    pct(fgli.pptoAnualPpm, fgli.anteriorPpm)
                      ? `${pct(fgli.pptoAnualPpm, fgli.anteriorPpm)} contra el real ${fgli.anio - 1} · año completo`
                      : "año completo"
                  }
                  tono={
                    fgli.pptoAnualPpm !== null && fgli.anteriorPpm !== null
                      ? fgli.pptoAnualPpm <= fgli.anteriorPpm
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

              {/* Serie mensual */}
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={fgli.meses.map((m) => ({
                      mes: MES_CORTO[m.mes],
                      presupuesto: m.pptoPpm !== null ? Math.round(m.pptoPpm) : null,
                      real: m.realPpm !== null ? Math.round(m.realPpm) : null,
                      anterior: m.anteriorPpm !== null ? Math.round(m.anteriorPpm) : null,
                    }))}
                    margin={{ top: 5, right: 14, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="capitalize" />
                    <YAxis tick={{ fontSize: 11 }} width={48} domain={[0, "auto"]} />
                    <Tooltip
                      formatter={(v, n) => [
                        v === null ? "—" : `${ppm(Number(v))} ppm`,
                        n === "presupuesto"
                          ? `Presupuesto ${fgli.anio}`
                          : n === "real"
                            ? `Real ${fgli.anio}`
                            : `Real ${fgli.anio - 1}`,
                      ]}
                      labelClassName="capitalize"
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="anterior" name="anterior" stroke="#cbd5e1" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="presupuesto" name="presupuesto" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="real" name="real" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground">
                Línea punteada: lo que el presupuesto prevé perder cada mes.
                Verde: el real del año. Gris claro: el mismo mes del año
                anterior. Los meses de verde por debajo de la punteada son los
                que le ganaron al presupuesto.
                {fgli.meta !== null && (
                  <>
                    {" "}
                    Meta del Sueño: <strong>{ppm(fgli.meta)}</strong>
                    {fgli.gatillo !== null && <> · gatillo {ppm(fgli.gatillo)}</>} ppm.
                  </>
                )}
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
                reporta bultos para esa pata. El real {fgli.anio} es el FGLI
                del Árbol del Sueño (HL entregados como base); el presupuesto
                divide por los HL que preveía vender.
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
