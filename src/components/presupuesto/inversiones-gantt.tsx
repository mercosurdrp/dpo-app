"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import type { InversionConDetalle } from "@/types/database"
import {
  barraPlan,
  barraReal,
  desvioMonto,
  desvioTiempo,
  formatFechaCorta,
  isoHoy,
  parseFecha,
  type Semaforo,
} from "@/lib/inversiones-seguimiento"
import {
  CATEGORIA_LABEL,
  ESTADO_INVERSION_BADGE_CLASS,
  ESTADO_INVERSION_LABEL,
} from "./inversiones-constantes"

const DAY = 86400000
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const ANCHO_LABEL = 280 // px de la columna fija

interface Props {
  anio: number
  inversiones: InversionConDetalle[]
  onSelect?: (inv: InversionConDetalle) => void
}

const SEMAFORO_BAR: Record<Semaforo, string> = {
  ok: "bg-emerald-500",
  atencion: "bg-amber-500",
  critico: "bg-red-500",
}
const SEMAFORO_BADGE: Record<Semaforo, string> = {
  ok: "border-emerald-200 bg-emerald-100 text-emerald-700",
  atencion: "border-amber-200 bg-amber-100 text-amber-800",
  critico: "border-red-200 bg-red-100 text-red-700",
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtDias(d: number): string {
  if (d === 0) return "en fecha"
  return `${d > 0 ? "+" : "−"}${Math.abs(d)} d`
}

function fmtPct(p: number): string {
  return `${p > 0 ? "+" : ""}${p.toFixed(1).replace(".", ",")} %`
}

function primerDiaMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function InversionesGantt({ anio, inversiones, onSelect }: Props) {
  const hoy = isoHoy()

  const filas = useMemo(() => {
    return inversiones
      .map((inv) => ({
        inv,
        plan: barraPlan(inv),
        real: barraReal(inv, hoy),
        dt: desvioTiempo(inv, hoy),
        dm: desvioMonto(inv),
      }))
      .filter((f) => f.plan || f.real)
      .sort((a, b) => {
        const ia = a.plan?.inicio ?? a.real?.inicio ?? ""
        const ib = b.plan?.inicio ?? b.real?.inicio ?? ""
        return ia.localeCompare(ib)
      })
  }, [inversiones, hoy])

  const sinFechas = inversiones.length - filas.length

  // Rango: el año entero, estirado a lo que haga falta (inversiones a 3 o 5
  // años). Siempre redondeado a meses completos.
  const rango = useMemo(() => {
    let min = `${anio}-01-01`
    let max = `${anio}-12-31`
    for (const f of filas) {
      for (const b of [f.plan, f.real]) {
        if (!b) continue
        if (b.inicio < min) min = b.inicio
        if (b.fin > max) max = b.fin
      }
    }
    if (hoy < min) min = hoy
    if (hoy > max) max = hoy
    const start = primerDiaMes(parseFecha(min))
    const endMes = parseFecha(max)
    const end = new Date(endMes.getFullYear(), endMes.getMonth() + 1, 0)
    const nDias = Math.round((end.getTime() - start.getTime()) / DAY) + 1
    const nMeses =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1
    // Un año entra cómodo; si el plan se va a 5 años, se comprime.
    const pxMes = nMeses <= 18 ? 72 : nMeses <= 36 ? 48 : 32
    const pxDia = pxMes / 30.4375
    return { start, end, nDias, nMeses, pxDia, ancho: Math.round(nDias * pxDia) }
  }, [filas, anio, hoy])

  const off = (s: string) =>
    Math.round(((parseFecha(s).getTime() - rango.start.getTime()) / DAY) * rango.pxDia)
  const largo = (a: string, b: string) =>
    Math.max(
      6,
      Math.round(
        ((parseFecha(b).getTime() - parseFecha(a).getTime()) / DAY + 1) * rango.pxDia,
      ),
    )

  const meses = useMemo(() => {
    const out: { label: string; anio: number; px: number; mes: number }[] = []
    const d = new Date(rango.start)
    while (d <= rango.end) {
      const dias = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      out.push({
        label: MESES[d.getMonth()],
        anio: d.getFullYear(),
        mes: d.getMonth(),
        px: Math.round(dias * rango.pxDia),
      })
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [rango])

  const anios = useMemo(() => {
    const out: { anio: number; px: number }[] = []
    for (const m of meses) {
      const last = out[out.length - 1]
      if (last && last.anio === m.anio) last.px += m.px
      else out.push({ anio: m.anio, px: m.px })
    }
    return out
  }, [meses])

  if (filas.length === 0) {
    return (
      <div className="rounded-lg border bg-white py-10 text-center text-sm text-muted-foreground">
        Ninguna inversión tiene fecha programada: cargá la fecha (y si podés el
        inicio) para verla en el Gantt.
      </div>
    )
  }

  const xHoy = off(hoy)

  return (
    <div className="space-y-2">
      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-sm border border-sky-400 bg-sky-100" />
          Planificado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-sm bg-emerald-500" />
          Real en plazo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-sm bg-amber-500" />
          Real hasta 30 d tarde
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-sm bg-red-500" />
          Más de 30 d tarde
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rotate-45 border border-sky-500 bg-sky-100" />
          Hito (sin inicio cargado)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-red-500" />
          Hoy
        </span>
        {sinFechas > 0 && (
          <span className="ml-auto">
            {sinFechas} sin fecha programada (no se dibujan)
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <div style={{ width: ANCHO_LABEL + rango.ancho, minWidth: "100%" }}>
          {/* Cabecera: años y meses */}
          <div className="flex border-b bg-slate-50 text-xs">
            <div
              className="sticky left-0 z-20 shrink-0 border-r bg-slate-50 px-3 py-1.5 font-semibold text-slate-700"
              style={{ width: ANCHO_LABEL }}
            >
              Inversión
            </div>
            <div className="relative" style={{ width: rango.ancho }}>
              <div className="flex">
                {anios.map((a) => (
                  <div
                    key={a.anio}
                    className="shrink-0 border-r px-1 py-0.5 text-center font-semibold text-slate-700"
                    style={{ width: a.px }}
                  >
                    {a.anio}
                  </div>
                ))}
              </div>
              <div className="flex border-t">
                {meses.map((m, i) => (
                  <div
                    key={i}
                    className="shrink-0 overflow-hidden border-r py-0.5 text-center text-[11px] text-slate-500"
                    style={{ width: m.px }}
                  >
                    {m.px >= 28 ? m.label : ""}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filas */}
          {filas.map(({ inv, plan, real, dt, dm }) => {
            const colorReal = real
              ? real.abierta
                ? dt?.vencida
                  ? SEMAFORO_BAR[dt.semaforo]
                  : "bg-sky-500"
                : SEMAFORO_BAR[dt?.semaforo ?? "ok"]
              : ""
            const tituloPlan = plan
              ? plan.hito
                ? `Programada: ${formatFechaCorta(plan.fin)} · ${formatMoney(inv.monto_estimado)}`
                : `Plan: ${formatFechaCorta(plan.inicio)} → ${formatFechaCorta(plan.fin)} · ${formatMoney(inv.monto_estimado)}`
              : ""
            const tituloReal = real
              ? real.abierta
                ? `En curso desde ${formatFechaCorta(real.inicio)}`
                : real.hito
                  ? `Realizada: ${formatFechaCorta(real.fin)} · ${formatMoney(inv.monto_real)}`
                  : `Real: ${formatFechaCorta(real.inicio)} → ${formatFechaCorta(real.fin)} · ${formatMoney(inv.monto_real)}`
              : ""
            return (
              <div
                key={inv.id}
                className={`flex border-b text-xs last:border-b-0 ${onSelect ? "cursor-pointer hover:bg-slate-50" : ""}`}
                onClick={() => onSelect?.(inv)}
                title={onSelect ? "Abrir para editar" : undefined}
              >
                <div
                  className="sticky left-0 z-10 shrink-0 border-r bg-white px-3 py-2"
                  style={{ width: ANCHO_LABEL }}
                >
                  <p className="truncate font-medium text-slate-900" title={inv.titulo}>
                    {inv.titulo}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span>{CATEGORIA_LABEL[inv.categoria]}</span>
                    <Badge
                      className={`${ESTADO_INVERSION_BADGE_CLASS[inv.estado]} px-1.5 py-0 text-[10px] hover:opacity-100`}
                    >
                      {ESTADO_INVERSION_LABEL[inv.estado]}
                    </Badge>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    {dt ? (
                      <Badge
                        className={`${SEMAFORO_BADGE[dt.semaforo]} px-1.5 py-0 text-[10px] hover:opacity-100`}
                        title={
                          dt.vencida
                            ? `Vencida: pasaron ${dt.dias} días de la fecha programada y sigue abierta`
                            : `Plazo: fin real vs programado`
                        }
                      >
                        ⏱ {dt.vencida ? `vencida ${fmtDias(dt.dias)}` : fmtDias(dt.dias)}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">⏱ —</span>
                    )}
                    {dm ? (
                      <Badge
                        className={`${SEMAFORO_BADGE[dm.semaforo]} px-1.5 py-0 text-[10px] hover:opacity-100`}
                        title={`Presupuesto: ${formatMoney(inv.monto_real)} real vs ${formatMoney(inv.monto_estimado)} estimado (${formatMoney(dm.monto)})`}
                      >
                        $ {fmtPct(dm.pct)}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">$ —</span>
                    )}
                  </p>
                </div>

                <div className="relative h-[58px]" style={{ width: rango.ancho }}>
                  {/* Grilla de meses */}
                  {meses.reduce<{ x: number; nodes: React.ReactNode[] }>(
                    (acc, m, i) => {
                      acc.nodes.push(
                        <div
                          key={i}
                          className="absolute inset-y-0 border-r border-slate-100"
                          style={{ left: acc.x, width: m.px }}
                        />,
                      )
                      acc.x += m.px
                      return acc
                    },
                    { x: 0, nodes: [] },
                  ).nodes}

                  {/* Hoy */}
                  <div
                    className="absolute inset-y-0 z-[1] w-0.5 bg-red-500/70"
                    style={{ left: xHoy }}
                  />

                  {/* Plan */}
                  {plan &&
                    (plan.hito ? (
                      <div
                        className="absolute top-[13px] size-3 rotate-45 border border-sky-500 bg-sky-100"
                        style={{ left: off(plan.fin) - 6 }}
                        title={tituloPlan}
                      />
                    ) : (
                      <div
                        className="absolute top-[10px] h-4 rounded-sm border border-sky-400 bg-sky-100"
                        style={{ left: off(plan.inicio), width: largo(plan.inicio, plan.fin) }}
                        title={tituloPlan}
                      />
                    ))}

                  {/* Real */}
                  {real &&
                    (real.hito ? (
                      <div
                        className={`absolute top-[35px] size-3 rotate-45 ${colorReal}`}
                        style={{ left: off(real.fin) - 6 }}
                        title={tituloReal}
                      />
                    ) : (
                      <div
                        className={`absolute top-[32px] h-4 rounded-sm ${colorReal} ${real.abierta ? "opacity-70" : ""}`}
                        style={{
                          left: off(real.inicio),
                          width: largo(real.inicio, real.fin),
                          backgroundImage: real.abierta
                            ? "repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,.45) 4px 8px)"
                            : undefined,
                        }}
                        title={tituloReal}
                      />
                    ))}

                  {/* Etiqueta de fechas a la derecha de la barra plan */}
                  {plan && (
                    <span
                      className="absolute top-[11px] whitespace-nowrap text-[10px] text-slate-500"
                      style={{ left: off(plan.fin) + 10 }}
                    >
                      {formatFechaCorta(plan.fin)}
                    </span>
                  )}
                  {real && !real.abierta && (
                    <span
                      className="absolute top-[33px] whitespace-nowrap text-[10px] text-slate-600"
                      style={{ left: off(real.fin) + 10 }}
                    >
                      {formatFechaCorta(real.fin)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
