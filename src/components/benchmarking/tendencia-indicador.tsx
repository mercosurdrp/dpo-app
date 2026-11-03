"use client"

import { useMemo } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { calcularTendencia, formatNum, nombreMesCorto } from "@/lib/benchmarking-tendencia"
import type { BenchAplicacion } from "@/types/benchmarking"
import { cn } from "@/lib/utils"

/**
 * Serie mensual del indicador de una aplicación, con la lectura antes/después
 * del mes base. Gráfico inline en SVG: barra por mes, el mes base marcado, la
 * meta como línea punteada.
 */
export function TendenciaIndicador({ aplicacion }: { aplicacion: BenchAplicacion }) {
  const t = useMemo(
    () => calcularTendencia(aplicacion.serie, aplicacion.fecha_aplicacion, aplicacion.mejor_si, aplicacion.meta),
    [aplicacion],
  )
  const serie = useMemo(
    () => [...aplicacion.serie].sort((a, b) => a.mes.localeCompare(b.mes)),
    [aplicacion.serie],
  )
  const unidad = aplicacion.unidad

  if (serie.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {aplicacion.fuente === "manual"
          ? "Todavía no hay valores cargados. Cargá los meses para ver la evolución."
          : "El Cuadro mensual todavía no tiene foto para este indicador."}
      </p>
    )
  }

  const vals = serie.map((p) => p.valor).filter((v): v is number => v !== null)
  const metaN = aplicacion.meta
  const max = Math.max(...vals, metaN ?? -Infinity, 0)
  const min = Math.min(...vals, metaN ?? Infinity, 0)
  const rango = max - min || 1
  const W = Math.max(240, serie.length * 34)
  const H = 90
  const padB = 18
  const padT = 8
  const y = (v: number) => padT + (H - padB - padT) * (1 - (v - min) / rango)
  const y0 = y(Math.max(0, min))
  const bw = (W / serie.length) * 0.6

  const chip = (ok: boolean | null, si: string, no: string, nd: string) =>
    ok === null ? (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{nd}</span>
    ) : ok ? (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{si}</span>
    ) : (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{no}</span>
    )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-slate-500">Antes</span>{" "}
          <strong className="tabular-nums">{formatNum(t.antes, unidad)}</strong>
        </span>
        <span>
          <span className="text-slate-500">Después</span>{" "}
          <strong className="tabular-nums">{formatNum(t.despues, unidad)}</strong>
        </span>
        {t.delta !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold tabular-nums",
              t.mejora ? "text-emerald-700" : "text-red-700",
            )}
          >
            {t.delta > 0 ? <ArrowUpRight className="size-4" /> : t.delta < 0 ? <ArrowDownRight className="size-4" /> : <Minus className="size-4" />}
            {formatNum(t.delta, unidad)}
            {t.deltaPct !== null && <span className="font-normal text-slate-500"> ({t.deltaPct > 0 ? "+" : ""}{t.deltaPct.toFixed(1)} %)</span>}
          </span>
        )}
        {chip(t.mejora, "Mejoró vs. antes", "No mejoró vs. antes", "Sin base para comparar")}
        {chip(t.tendenciaPositiva, "Últimos 3 meses a favor", "Últimos 3 meses en contra", "Pocos meses")}
        {metaN !== null && chip(t.cumpleMeta, "Cumple meta", "Fuera de meta", "Sin meta")}
      </div>

      <div className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Evolución mensual">
          {metaN !== null && (
            <line x1={0} x2={W} y1={y(metaN)} y2={y(metaN)} stroke="#64748b" strokeDasharray="4 3" strokeWidth={1} />
          )}
          {serie.map((p, i) => {
            const cx = (i + 0.5) * (W / serie.length)
            const esBase = t.mesBase === p.mes
            const despues = t.mesBase !== null && p.mes >= t.mesBase
            const fill = p.valor === null ? "#e2e8f0" : despues ? (t.mejora === false ? "#f87171" : "#2563eb") : "#94a3b8"
            const top = p.valor === null ? y0 - 2 : Math.min(y(p.valor), y0)
            const h = p.valor === null ? 2 : Math.max(2, Math.abs(y(p.valor) - y0))
            return (
              <g key={p.mes}>
                {esBase && <rect x={cx - (W / serie.length) / 2} y={0} width={W / serie.length} height={H - padB + 2} fill="#dbeafe" opacity={0.6} />}
                <rect x={cx - bw / 2} y={top} width={bw} height={h} rx={2} fill={fill}>
                  <title>
                    {nombreMesCorto(p.mes)}: {formatNum(p.valor, unidad)}
                    {p.nota ? ` · ${p.nota}` : ""}
                  </title>
                </rect>
                {p.valor !== null && (
                  <text x={cx} y={Math.max(8, top - 2)} textAnchor="middle" fontSize={9} fill="#334155" className="tabular-nums">
                    {formatNum(p.valor, null)}
                  </text>
                )}
                <text x={cx} y={H - 4} textAnchor="middle" fontSize={9} fill={esBase ? "#1d4ed8" : "#64748b"} fontWeight={esBase ? 700 : 400}>
                  {nombreMesCorto(p.mes)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="text-[11px] text-slate-500">
        Gris: antes del bench · Azul: desde la aplicación ({t.mesBase ? nombreMesCorto(t.mesBase) : "sin fecha"})
        {metaN !== null ? ` · línea punteada: meta ${formatNum(metaN, unidad)}` : ""}
        {aplicacion.fuente === "cuadro" ? " · fuente: Cuadro mensual de indicadores" : " · fuente: carga manual"}
      </p>
    </div>
  )
}
