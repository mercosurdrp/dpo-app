"use client"

import Link from "next/link"
import { ExternalLink, Truck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { CostoLogisticoReunionData } from "@/actions/reuniones-costo-logistico"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

const fmtMoney = (n: number) =>
  "$" +
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(
    Math.round(n || 0),
  )
const fmtNum = (n: number, d = 0) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n || 0)

function Tile({
  label,
  valor,
  detalle,
  tono = "neutro",
}: {
  label: string
  valor: string
  detalle?: React.ReactNode
  tono?: "neutro" | "bien" | "atencion" | "mal"
}) {
  const color =
    tono === "bien"
      ? "text-emerald-700"
      : tono === "atencion"
        ? "text-amber-700"
        : tono === "mal"
          ? "text-red-700"
          : "text-slate-900"
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  )
}

/** Variación % entre el mes y el anterior, como badge. null si falta alguno. */
function Variacion({ actual, anterior }: { actual: number; anterior: number | null }) {
  if (anterior === null || anterior <= 0) return null
  const pct = (100 * (actual - anterior)) / anterior
  const sube = pct > 0
  return (
    <Badge
      variant="secondary"
      className={
        Math.abs(pct) < 0.5
          ? "bg-slate-100 text-slate-600"
          : sube
            ? "bg-red-100 text-red-700"
            : "bg-emerald-100 text-emerald-700"
      }
    >
      {sube ? "+" : ""}
      {fmtNum(pct, 1)}%
    </Badge>
  )
}

/**
 * Costo logístico del mes cerrado para la 1ª Reunión de Presupuesto: $/HL del
 * mes (pool ÷ HL vendidos, el mismo VLC/HL del Sueño), tendencia contra el mes
 * anterior y el YTD, y el peso de cada ciudad en el costo. La lectura y el
 * armado están en la action; acá sólo se muestra.
 */
export function SeccionCostoLogistico({
  data,
}: {
  data: CostoLogisticoReunionData
}) {
  const nombreMes = `${MESES[data.mes - 1]} ${data.anio}`
  const nombreAnterior = `${MESES[data.anterior.mes - 1]} ${data.anterior.anio}`
  // VLC/HL: mejor menor. Rojo si pasó la meta (15.000 en 2026), ámbar si pasó
  // el gatillo (14.500) sin llegar a la meta, verde por debajo del gatillo.
  const ytdTono =
    data.ytd.valor === null
      ? "neutro"
      : data.ytd.meta !== null && data.ytd.valor > data.ytd.meta
        ? "mal"
        : data.ytd.gatillo !== null && data.ytd.valor > data.ytd.gatillo
          ? "atencion"
          : data.ytd.meta !== null || data.ytd.gatillo !== null
            ? "bien"
            : "neutro"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Truck className="size-5 text-slate-500" />
            Costo logístico de {nombreMes}
          </span>
          <Link
            href="/planeamiento/costo-por-pdv"
            className="flex items-center gap-1 text-xs font-normal text-blue-600 hover:underline"
          >
            Ver Costo por PDV
            <ExternalLink className="size-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.pool || data.costoXHl === null ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No hay costo logístico cargado para {nombreMes}. Se carga en
            Planeamiento → Costo por PDV (Distribución + Almacén del mes) y esta
            sección se completa sola.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile
                label={`$/HL de ${MESES[data.mes - 1]}`}
                valor={fmtMoney(data.costoXHl)}
                detalle={
                  <span className="flex items-center gap-1.5">
                    <Variacion
                      actual={data.costoXHl}
                      anterior={data.anterior.costoXHl}
                    />
                    vs. {nombreAnterior}
                    {data.anterior.costoXHl !== null
                      ? ` (${fmtMoney(data.anterior.costoXHl)})`
                      : " (sin costo cargado)"}
                  </span>
                }
              />
              <Tile
                label={`VLC/HL YTD ${data.anio}`}
                valor={data.ytd.valor !== null ? fmtMoney(data.ytd.valor) : "—"}
                tono={ytdTono}
                detalle={
                  data.ytd.meta !== null
                    ? `meta ${fmtMoney(data.ytd.meta)}${
                        data.ytd.gatillo !== null
                          ? ` · gatillo ${fmtMoney(data.ytd.gatillo)}`
                          : ""
                      }`
                    : "Árbol del Sueño"
                }
              />
              <Tile
                label="Costo del mes"
                valor={fmtMoney(data.pool.total)}
                detalle={`Distribución ${fmtMoney(data.pool.distribucion)} · Almacén ${fmtMoney(data.pool.almacen)}`}
              />
              <Tile
                label="Costo / venta"
                valor={data.pctVenta !== null ? `${fmtNum(data.pctVenta, 1)}%` : "—"}
                detalle={`${fmtNum(data.hlVendidos)} HL vendidos · ${fmtNum(data.hlDistribuidos)} HL a reparto`}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-1.5 text-left font-medium">Ciudad</th>
                    <th className="py-1.5 text-right font-medium">km (CD)</th>
                    <th className="py-1.5 text-right font-medium">PDV</th>
                    <th className="py-1.5 text-right font-medium">HL</th>
                    <th className="py-1.5 text-right font-medium">Costo logístico</th>
                    <th className="py-1.5 text-right font-medium">Peso en el costo</th>
                    <th className="py-1.5 text-right font-medium">$/HL</th>
                    <th className="py-1.5 text-right font-medium">vs. mes ant.</th>
                    <th className="py-1.5 text-right font-medium">Costo / venta</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ciudades.map((c) => (
                    <tr key={c.ciudad} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-800">{c.ciudad}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {c.km !== null ? `${fmtNum(c.km)} km` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">{fmtNum(c.pdv)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtNum(c.hl)}
                        <span className="ml-1 text-xs text-slate-500">
                          ({fmtNum(c.pctHl, 1)}%)
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{fmtMoney(c.costo)}</td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-2 rounded bg-slate-400"
                            style={{ width: `${Math.max(4, Math.round(c.pctCosto * 1.6))}px` }}
                            aria-hidden
                          />
                          <span className="tabular-nums font-medium">
                            {fmtNum(c.pctCosto, 1)}%
                          </span>
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {fmtMoney(c.costoXHl)}
                      </td>
                      <td className="py-2 text-right">
                        <Variacion actual={c.costoXHl} anterior={c.costoXHlAnterior} />
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtNum(c.pctVenta, 1)}%
                      </td>
                    </tr>
                  ))}
                  {data.bolsa && (
                    <tr className="border-b border-slate-100 text-slate-500">
                      <td className="py-2 italic">Venta por depósito (no sale a reparto)</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right tabular-nums">{fmtNum(data.bolsa.hl)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtMoney(data.bolsa.costo)}</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right tabular-nums">{fmtMoney(data.bolsa.costoXHl)}</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              El $/HL del mes es Distribución + Almacén ÷ HL vendidos (PDV más
              venta por depósito), el mismo VLC/HL del Árbol del Sueño. El peso
              por ciudad es su parte del costo repartido entre los PDV a reparto;
              el $/HL de cada ciudad incluye el costo de llegar (km desde el CD).
              Rojo sube, verde baja contra {nombreAnterior}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
