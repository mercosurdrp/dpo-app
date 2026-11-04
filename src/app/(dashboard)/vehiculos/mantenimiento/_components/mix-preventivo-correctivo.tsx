"use client"

// KPI de mezcla preventivo / correctivo de las órdenes de trabajo (DPO 2.2 y
// 2.4). Dos lecturas de la misma torta:
//
//   · CANTIDAD de OT  → cuántas intervenciones son planificadas y cuántas rotura.
//   · COSTO           → a dónde se fue la plata. No da lo mismo: una sola rotura
//                       grande pesa más que veinte services.
//
// 🚨 El bloque IGNORA a propósito el filtro "Tipo" de la solapa: filtrando
// tipo=preventivo la torta daría 100 % y el indicador no diría nada. Los demás
// filtros (unidad, estado, mes, búsqueda) sí mandan.
//
// "Por camión" no son 14 tortas: la tabla de abajo da la mezcla de todas las
// unidades de un vistazo y, al clickear una fila, el filtro de la solapa deja
// la torta con esa sola unidad.

import { useMemo, useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { MantenimientoRealizado, MantenimientoTipo } from "@/types/database"
import { KpiCard, type EstadoKpi } from "./kpi-card"
import { costoTotalOt } from "./ot-formato"
import { usePaletaViz, type PaletaViz } from "./paleta-viz"
import { ScrollX } from "./scroll-x"

/** Referencia de mantenimiento clase mundial: 80 % del trabajo planificado. */
const REF_PREVENTIVO = 80

const TIPOS: MantenimientoTipo[] = ["preventivo", "correctivo", "proactivo"]

const TIPO_LABEL: Record<MantenimientoTipo, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  proactivo: "Proactivo",
}

type Metrica = "cantidad" | "costo"

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v)

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)

/** Cuenta y plata de cada tipo. */
interface Mezcla {
  n: Record<MantenimientoTipo, number>
  $: Record<MantenimientoTipo, number>
  nTotal: number
  $Total: number
}

const mezclaVacia = (): Mezcla => ({
  n: { preventivo: 0, correctivo: 0, proactivo: 0 },
  $: { preventivo: 0, correctivo: 0, proactivo: 0 },
  nTotal: 0,
  $Total: 0,
})

function sumar(m: Mezcla, ot: MantenimientoRealizado) {
  const c = costoTotalOt(ot)
  m.n[ot.tipo]++
  m.$[ot.tipo] += c
  m.nTotal++
  m.$Total += c
}

/** % del total que corresponde al tipo, con la métrica elegida. 0 OT → null. */
function pct(m: Mezcla, tipo: MantenimientoTipo, metrica: Metrica): number | null {
  const total = metrica === "cantidad" ? m.nTotal : m.$Total
  if (total <= 0) return null
  const parte = metrica === "cantidad" ? m.n[tipo] : m.$[tipo]
  return (parte / total) * 100
}

function semaforo(pctPrev: number | null): EstadoKpi {
  if (pctPrev == null) return "neutro"
  if (pctPrev >= REF_PREVENTIVO) return "ok"
  if (pctPrev >= 50) return "alerta"
  return "critico"
}

export interface MixPreventivoCorrectivoProps {
  /**
   * OT generales ya filtradas por unidad / estado / mes / búsqueda, SIN aplicar
   * el filtro de tipo.
   */
  ordenes: MantenimientoRealizado[]
  /** Valor actual del filtro de unidad de la solapa ("todos" = toda la flota). */
  dominioSel: string
  /** Clickear una fila de la tabla mueve el filtro de la solapa. */
  onDominio: (dominio: string) => void
  /** Texto del período filtrado, para que el título diga sobre qué se midió. */
  etiquetaPeriodo: string
}

export function MixPreventivoCorrectivo({
  ordenes,
  dominioSel,
  onDominio,
  etiquetaPeriodo,
}: MixPreventivoCorrectivoProps) {
  const paleta = usePaletaViz()
  const [metrica, setMetrica] = useState<Metrica>("cantidad")

  // Las canceladas no son una intervención: no entran ni a la cuenta ni a la
  // plata (si no, una OT anulada bajaría el % de preventivo de la flota).
  const base = useMemo(() => ordenes.filter((m) => m.estado !== "cancelado"), [ordenes])

  const global = useMemo(() => {
    const m = mezclaVacia()
    for (const ot of base) sumar(m, ot)
    return m
  }, [base])

  const porUnidad = useMemo(() => {
    const map = new Map<string, Mezcla>()
    for (const ot of base) {
      if (!map.has(ot.dominio)) map.set(ot.dominio, mezclaVacia())
      sumar(map.get(ot.dominio)!, ot)
    }
    // El que más plata consumió primero: es por donde se empieza a mirar.
    return [...map.entries()]
      .map(([dominio, m]) => ({ dominio, m }))
      .sort((a, b) => b.m.$Total - a.m.$Total || b.m.nTotal - a.m.nTotal)
  }, [base])

  // El proactivo existe en pocas OT: si no hay ninguna en el filtro, sus dos
  // columnas quedarían vacías ocupando ancho.
  const hayProactivo = global.n.proactivo > 0
  const tiposVisibles = useMemo(
    () => TIPOS.filter((t) => t !== "proactivo" || hayProactivo),
    [hayProactivo]
  )

  const color = (t: MantenimientoTipo) =>
    t === "preventivo"
      ? paleta.paradas.preventivo
      : t === "correctivo"
        ? paleta.paradas.correctivo
        : paleta.paradas.indisponible

  const tajadas = useMemo(
    () =>
      TIPOS.map((t) => ({
        tipo: t,
        label: TIPO_LABEL[t],
        valor: metrica === "cantidad" ? global.n[t] : global.$[t],
        n: global.n[t],
        costo: global.$[t],
        fill: color(t),
      })).filter((d) => d.valor > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [global, metrica, paleta]
  )

  const pctPrev = pct(global, "preventivo", metrica)
  const totalMetrica = metrica === "cantidad" ? global.nTotal : global.$Total

  // Relación clásica del indicador: cuántas preventivas por cada correctiva.
  const relacion =
    global.n.correctivo > 0
      ? (global.n.preventivo / global.n.correctivo).toFixed(1).replace(".", ",")
      : null

  const alcance = dominioSel === "todos" ? "toda la flota" : dominioSel

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          label="Preventivo sobre el total"
          dpo="2.2"
          valor={pctPrev == null ? "—" : `${Math.round(pctPrev)} %`}
          estado={semaforo(pctPrev)}
          sub={
            pctPrev == null
              ? "Sin órdenes en el filtro"
              : metrica === "cantidad"
                ? `${fmtNum(global.n.preventivo)} de ${fmtNum(global.nTotal)} OT · referencia 80 %`
                : `${fmtMoney(global.$.preventivo)} de ${fmtMoney(global.$Total)} · referencia 80 %`
          }
          footer={
            <p className="text-xs text-muted-foreground">
              {relacion
                ? `${relacion} OT preventivas por cada correctiva`
                : "Sin correctivas en el filtro"}
            </p>
          }
        />

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-medium">
                  Preventivo vs. correctivo — {alcance}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{etiquetaPeriodo}</p>
              </div>
              {/* Las dos lecturas: cuántas OT y cuánta plata. */}
              <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
                {(
                  [
                    ["cantidad", "Cantidad de OT"],
                    ["costo", "Costo"],
                  ] as Array<[Metrica, string]>
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={metrica === v}
                    onClick={() => setMetrica(v)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      metrica === v
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tajadas.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No hay órdenes de trabajo con los filtros aplicados.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-56 min-w-[14rem] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tajadas}
                        dataKey="valor"
                        nameKey="label"
                        innerRadius="48%"
                        outerRadius="80%"
                        paddingAngle={2}
                        isAnimationActive={false}
                        stroke="var(--color-card)"
                        strokeWidth={2}
                      >
                        {tajadas.map((d) => (
                          <Cell key={d.tipo} fill={d.fill} />
                        ))}
                      </Pie>
                      <RTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0].payload as (typeof tajadas)[number]
                          return (
                            <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                              <p className="font-medium">{d.label}</p>
                              <p className="text-muted-foreground">
                                {Math.round((d.valor / totalMetrica) * 100)}% ·{" "}
                                {fmtNum(d.n)} {d.n === 1 ? "OT" : "OT"} · {fmtMoney(d.costo)}
                              </p>
                            </div>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* La referencia con el número al lado: la identidad no queda
                    sólo en el color y se lee sin apuntar con el mouse. */}
                <ul className="min-w-56 space-y-1.5 text-xs">
                  {tajadas.map((d) => (
                    <li key={d.tipo} className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: d.fill }}
                      />
                      <span className="font-medium">{d.label}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {Math.round((d.valor / totalMetrica) * 100)}% ·{" "}
                        {metrica === "cantidad" ? `${fmtNum(d.n)} OT` : fmtMoney(d.costo)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2 border-t pt-1.5 font-medium">
                    <span>Total</span>
                    <span className="ml-auto tabular-nums">
                      {fmtNum(global.nTotal)} OT · {fmtMoney(global.$Total)}
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Por unidad — mezcla y gasto
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {porUnidad.length} {porUnidad.length === 1 ? "unidad" : "unidades"} con órdenes en el
            filtro. Clickeá una fila para dejar la torta con esa sola unidad.
          </p>
        </CardHeader>
        <CardContent>
          {porUnidad.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin órdenes de trabajo para mostrar.
            </p>
          ) : (
            <ScrollX>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    {tiposVisibles.map((t) => (
                      <TableHead key={t} className="text-right">
                        {TIPO_LABEL[t]}
                      </TableHead>
                    ))}
                    <TableHead className="w-40">Mezcla</TableHead>
                    <TableHead className="text-right">% prev.</TableHead>
                    {tiposVisibles.map((t) => (
                      <TableHead key={t} className="whitespace-nowrap text-right">
                        $ {TIPO_LABEL[t]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Gasto total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porUnidad.map(({ dominio, m }, i) => {
                    const p = pct(m, "preventivo", "cantidad")
                    return (
                      <TableRow
                        key={dominio}
                        onClick={() => onDominio(dominio === dominioSel ? "todos" : dominio)}
                        className={cn(
                          "cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/30",
                          i % 2 === 1 && "bg-muted/30",
                          dominio === dominioSel && "bg-sky-50 dark:bg-sky-950/40"
                        )}
                      >
                        <TableCell className="font-medium">{dominio}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.nTotal}</TableCell>
                        {tiposVisibles.map((t) => (
                          <TableCell key={t} className="text-right tabular-nums">
                            {m.n[t] || "—"}
                          </TableCell>
                        ))}
                        <TableCell>
                          <BarraMezcla mezcla={m} paleta={paleta} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium tabular-nums",
                            p != null && p < 50 && "text-destructive"
                          )}
                        >
                          {p == null ? "—" : `${Math.round(p)} %`}
                        </TableCell>
                        {tiposVisibles.map((t) => (
                          <TableCell
                            key={t}
                            className="whitespace-nowrap text-right tabular-nums text-muted-foreground"
                          >
                            {m.$[t] > 0 ? fmtMoney(m.$[t]) : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {fmtMoney(m.$Total)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {global.nTotal}
                    </TableCell>
                    {tiposVisibles.map((t) => (
                      <TableCell key={t} className="text-right font-semibold tabular-nums">
                        {global.n[t] || "—"}
                      </TableCell>
                    ))}
                    <TableCell>
                      <BarraMezcla mezcla={global} paleta={paleta} />
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {pct(global, "preventivo", "cantidad") == null
                        ? "—"
                        : `${Math.round(pct(global, "preventivo", "cantidad")!)} %`}
                    </TableCell>
                    {tiposVisibles.map((t) => (
                      <TableCell
                        key={t}
                        className="whitespace-nowrap text-right font-semibold tabular-nums"
                      >
                        {global.$[t] > 0 ? fmtMoney(global.$[t]) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                      {fmtMoney(global.$Total)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ScrollX>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Barra 100 % apilada de la mezcla de una unidad: es la versión legible de
 * "una torta por camión" — catorce tortas chicas no se comparan entre sí, pero
 * catorce barras alineadas sí.
 */
function BarraMezcla({ mezcla, paleta }: { mezcla: Mezcla; paleta: PaletaViz }) {
  if (mezcla.nTotal === 0) return <span className="text-xs text-muted-foreground">—</span>
  const tono: Record<MantenimientoTipo, string> = {
    preventivo: paleta.paradas.preventivo,
    correctivo: paleta.paradas.correctivo,
    proactivo: paleta.paradas.indisponible,
  }
  return (
    <div className="flex h-3 w-full min-w-28 overflow-hidden rounded-sm border bg-muted">
      {TIPOS.map((t) =>
        mezcla.n[t] > 0 ? (
          <div
            key={t}
            style={{
              width: `${(mezcla.n[t] / mezcla.nTotal) * 100}%`,
              backgroundColor: tono[t],
            }}
            title={`${TIPO_LABEL[t]}: ${mezcla.n[t]} de ${mezcla.nTotal} OT`}
          />
        ) : null
      )}
    </div>
  )
}
