"use client"

import { useMemo } from "react"
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GopCambio, GopTemaResumen } from "@/actions/gops"
import { COLOR_TONO, DESTINO_LABEL, ESTADO_LABEL, MES_NOMBRE, pct, tonoPuntaje } from "./formato"

interface Props {
  resumen: GopTemaResumen[]
  cambios: GopCambio[]
  periodo: { anio: number; mes: number }
  onVerPlan: (planId: string) => void
}

const MES_CORTO: Record<number, string> = {
  1: "Ene",
  2: "Feb",
  3: "Mar",
  4: "Abr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Ago",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dic",
}

const FONDO_TONO: Record<"ok" | "cerca" | "lejos", string> = {
  ok: "bg-emerald-50",
  cerca: "bg-amber-50",
  lejos: "bg-red-50",
}

/**
 * La hoja "Resumen" del consolidado, tal cual la ve el auditor: un GOP por fila, un mes
 * por columna, real contra target. Lo que el Excel no muestra va abajo: qué punto
 * concreto se dio vuelta y qué plan de acción lo explica.
 */
export function ResumenTab({ resumen, cambios, periodo, onVerPlan }: Props) {
  // Columnas: desde enero hasta el último mes con carga (o el mes elegido, si es
  // posterior). No tiene sentido mostrar vacíos hasta diciembre.
  const meses = useMemo(() => {
    const ultimo = Math.max(periodo.mes, ...resumen.flatMap((t) => t.serie.map((s) => s.mes)))
    return Array.from({ length: ultimo }, (_, i) => i + 1)
  }, [resumen, periodo.mes])

  // Total de la región por mes: todos los Si sobre todos los Si+No de ese mes. Las
  // bimestrales entran solo en los meses que se cargan, así que el total no es
  // estrictamente comparable mes a mes: se lee como tendencia, no como KPI.
  const total = useMemo(() => {
    const porMes = new Map<number, { si: number; no: number }>()
    for (const t of resumen) {
      for (const s of t.serie) {
        const acc = porMes.get(s.mes) ?? { si: 0, no: 0 }
        acc.si += s.si
        acc.no += s.no
        porMes.set(s.mes, acc)
      }
    }
    return porMes
  }, [resumen])

  const mejoras = cambios.filter((c) => c.sentido === "mejora")
  const retrocesos = cambios.filter((c) => c.sentido === "retroceso")

  const totalActual = total.get(periodo.mes)
  const mesesPrevios = [...total.keys()].filter((m) => m < periodo.mes).sort((a, b) => b - a)
  const totalPrevio = mesesPrevios.length > 0 ? total.get(mesesPrevios[0]) : undefined
  const puntajeActual = totalActual ? puntaje(totalActual) : null
  const puntajePrevio = totalPrevio ? puntaje(totalPrevio) : null

  return (
    <div className="space-y-4">
      {/* Lectura del mes en una línea */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {MES_NOMBRE[periodo.mes]} {periodo.anio} · total región
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-slate-900">
                {pct(puntajeActual)}
              </span>
              {puntajeActual !== null && puntajePrevio !== null && (
                <Delta actual={puntajeActual} previo={puntajePrevio} />
              )}
              {totalPrevio && mesesPrevios.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  vs {MES_CORTO[mesesPrevios[0]]} {pct(puntajePrevio)}
                </span>
              )}
            </div>
            {totalActual && (
              <p className="text-xs text-muted-foreground">
                {totalActual.si} Si · {totalActual.no} No
              </p>
            )}
          </div>

          <div className="h-10 w-px bg-slate-200" />

          <div className="text-sm">
            <p className="font-semibold text-emerald-700">
              {mejoras.length} {mejoras.length === 1 ? "punto pasó" : "puntos pasaron"} a Si
            </p>
            <p className={retrocesos.length > 0 ? "font-semibold text-red-600" : "text-slate-500"}>
              {retrocesos.length}{" "}
              {retrocesos.length === 1 ? "punto retrocedió" : "puntos retrocedieron"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* La tabla del Excel */}
      <Card>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2 text-left font-semibold">Área</th>
                <th className="py-2 pr-2 text-left font-semibold">GOP / Toolkit</th>
                <th className="hidden py-2 pr-2 text-left font-semibold lg:table-cell">Dueño</th>
                <th className="py-2 pr-2 text-right font-semibold">Target</th>
                {meses.map((m) => (
                  <th
                    key={m}
                    className={`py-2 text-center font-semibold ${
                      m === periodo.mes ? "rounded-t-md bg-blue-50 text-blue-700" : ""
                    }`}
                  >
                    {MES_CORTO[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumen.map((t) => {
                const porMes = new Map(t.serie.map((s) => [s.mes, s.puntaje]))
                return (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="py-2 pr-2 text-xs text-slate-500">{t.area ?? "—"}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900">{t.nombre}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {t.tipo}
                        </Badge>
                        {t.frecuencia === "bimestral" && (
                          <span className="text-[10px] text-muted-foreground">bimestral</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden py-2 pr-2 text-xs text-slate-500 lg:table-cell">
                      {t.dueno ?? "—"}
                    </td>
                    <td className="py-2 pr-2 text-right text-xs tabular-nums text-slate-500">
                      {pct(t.target, 0)}
                    </td>
                    {meses.map((m) => {
                      const v = porMes.get(m) ?? null
                      const previo = t.serie.filter((s) => s.mes < m).at(-1)?.puntaje ?? null
                      return (
                        <Celda
                          key={m}
                          valor={v}
                          previo={previo}
                          target={t.target}
                          destacada={m === periodo.mes}
                        />
                      )
                    })}
                  </tr>
                )
              })}

              <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                <td className="py-2 pr-2" />
                <td className="py-2 pr-2 font-semibold text-slate-900">Total región</td>
                <td className="hidden py-2 pr-2 lg:table-cell" />
                <td className="py-2 pr-2 text-right text-xs tabular-nums text-slate-500">
                  {pct(resumen[0]?.target ?? 0.85, 0)}
                </td>
                {meses.map((m) => {
                  const acc = total.get(m)
                  const v = acc ? puntaje(acc) : null
                  const prevMes = [...total.keys()].filter((x) => x < m).sort((a, b) => b - a)[0]
                  const previo = prevMes !== undefined ? puntaje(total.get(prevMes)!) : null
                  return (
                    <Celda
                      key={m}
                      valor={v}
                      previo={previo}
                      target={resumen[0]?.target ?? 0.85}
                      destacada={m === periodo.mes}
                      negrita
                    />
                  )
                })}
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Verde: en target · ámbar: a menos de 15 puntos · rojo: más lejos. La flecha compara
            con el mes anterior con carga. Las bimestrales entran al total solo en los meses
            que se cargan.
          </p>
        </CardContent>
      </Card>

      {/* Qué se movió y por qué */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <p className="font-semibold text-slate-900">Mejoras de {MES_NOMBRE[periodo.mes]}</p>
              <Badge variant="secondary" className="text-xs">
                {mejoras.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Puntos que pasaron a Si. Si tenían plan, es el momento de cerrarlo con la
              evidencia.
            </p>
            {mejoras.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Ningún punto cambió a Si respecto del mes anterior.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mejoras.map((c) => (
                  <CambioItem key={c.pregunta_id} cambio={c} onVerPlan={onVerPlan} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <p className="font-semibold text-slate-900">
                Retrocesos de {MES_NOMBRE[periodo.mes]}
              </p>
              <Badge variant="secondary" className="text-xs">
                {retrocesos.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Puntos que estaban en Si y dejaron de estarlo. Aparecen también en &ldquo;A
              decidir&rdquo; si no tienen decisión.
            </p>
            {retrocesos.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nada retrocedió. Bien.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {retrocesos.map((c) => (
                  <CambioItem key={c.pregunta_id} cambio={c} onVerPlan={onVerPlan} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function puntaje(acc: { si: number; no: number }): number | null {
  const n = acc.si + acc.no
  return n === 0 ? null : acc.si / n
}

function Delta({ actual, previo }: { actual: number; previo: number }) {
  const d = actual - previo
  if (Math.abs(d) <= 0.0001) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
        <Minus className="h-3 w-3" /> igual
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        d > 0 ? "text-emerald-600" : "text-red-600"
      }`}
    >
      {d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {d > 0 ? "+" : ""}
      {pct(d)}
    </span>
  )
}

function Celda({
  valor,
  previo,
  target,
  destacada,
  negrita,
}: {
  valor: number | null
  previo: number | null
  target: number
  destacada: boolean
  negrita?: boolean
}) {
  if (valor === null) {
    return (
      <td
        className={`py-2 text-center text-xs text-slate-300 ${destacada ? "bg-blue-50/60" : ""}`}
      >
        —
      </td>
    )
  }
  const tono = tonoPuntaje(valor, target)
  const d = previo !== null ? valor - previo : null
  return (
    <td
      className={`py-1.5 text-center ${destacada ? "bg-blue-50/60" : ""}`}
      title={d !== null ? `Mes anterior con carga: ${pct(previo)}` : undefined}
    >
      <span
        className={`inline-flex min-w-[58px] items-center justify-center gap-0.5 rounded-md px-1.5 py-0.5 tabular-nums ${
          FONDO_TONO[tono]
        } ${COLOR_TONO[tono]} ${negrita ? "font-bold" : "font-semibold"}`}
      >
        {pct(valor, 0)}
        {d !== null && d > 0.0001 && <TrendingUp className="h-3 w-3" />}
        {d !== null && d < -0.0001 && <TrendingDown className="h-3 w-3" />}
      </span>
    </td>
  )
}

function CambioItem({
  cambio,
  onVerPlan,
}: {
  cambio: GopCambio
  onVerPlan: (id: string) => void
}) {
  const esMejora = cambio.sentido === "mejora"
  const d = cambio.decision
  const plan = d?.destino === "plan" && d.plan_id ? d : null

  return (
    <li className="rounded-lg border border-slate-100 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold text-slate-700">{cambio.tema_nombre}</span>
        {cambio.tema_area && <span className="text-muted-foreground">· {cambio.tema_area}</span>}
        <span className="ml-auto inline-flex items-center gap-1 tabular-nums text-muted-foreground">
          <ValorPill valor={cambio.valor_previo} />
          <ArrowRight className="h-3 w-3" />
          <ValorPill valor={cambio.valor} />
          {cambio.impacto !== null && (
            <span className={esMejora ? "text-emerald-600" : "text-red-600"}>
              {esMejora ? "+" : "−"}
              {pct(cambio.impacto)}
            </span>
          )}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-900">{cambio.texto}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        {plan ? (
          <>
            <span className="text-slate-600">
              Plan: <span className="font-medium text-slate-800">{plan.plan_titulo}</span>
              {plan.plan_estado && (
                <span className="text-muted-foreground"> · {ESTADO_LABEL[plan.plan_estado]}</span>
              )}
            </span>
            <button
              onClick={() => onVerPlan(plan.plan_id!)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 font-medium text-blue-700 hover:bg-blue-100"
            >
              Ver plan <ArrowRight className="h-3 w-3" />
            </button>
            {esMejora && plan.plan_estado !== "completado" && (
              <span className="text-amber-700">
                El punto ya está en Si: registrá el avance y pasá el plan a completado.
              </span>
            )}
          </>
        ) : d ? (
          <span className="text-slate-600">
            {DESTINO_LABEL[d.destino]}
            {d.motivo && <span className="text-muted-foreground"> · {d.motivo}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {esMejora
              ? "Sin plan registrado: se cerró sin pasar por la app."
              : "Sin decisión todavía."}
          </span>
        )}
      </div>
    </li>
  )
}

function ValorPill({ valor }: { valor: string }) {
  const estilo =
    valor === "si"
      ? "bg-emerald-100 text-emerald-700"
      : valor === "no"
        ? "bg-red-100 text-red-700"
        : "bg-slate-100 text-slate-500"
  const label = valor === "si" ? "Si" : valor === "no" ? "No" : "N/A"
  return (
    <span
      className={`inline-flex h-5 w-8 items-center justify-center rounded text-[10px] font-semibold ${estilo}`}
    >
      {label}
    </span>
  )
}
