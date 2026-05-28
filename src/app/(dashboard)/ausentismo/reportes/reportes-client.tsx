"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AUSENTISMO_MOTIVO_COLORS,
  AUSENTISMO_MOTIVO_LABELS,
  type AusentismoLicenciasMedicasReporte,
  type AusentismoRepitenciaEmpleado,
} from "@/types/database"
import {
  reporteLicenciasMedicas,
  reporteRepitencia,
} from "@/actions/ausentismo"

interface Props {
  desdeInicial: string
  hastaInicial: string
  repitenciaInicial: AusentismoRepitenciaEmpleado[]
  lmInicial: AusentismoLicenciasMedicasReporte | null
}

function fmt(n: number): string {
  return n.toLocaleString("es-AR")
}

export function AusentismoReportesClient({
  desdeInicial,
  hastaInicial,
  repitenciaInicial,
  lmInicial,
}: Props) {
  const [desde, setDesde] = useState(desdeInicial)
  const [hasta, setHasta] = useState(hastaInicial)
  const [repitencia, setRepitencia] = useState(repitenciaInicial)
  const [lm, setLm] = useState(lmInicial)
  const [pending, startTransition] = useTransition()

  const maxBarMes = useMemo(() => {
    if (!lm) return 0
    return Math.max(1, ...lm.por_mes.map((b) => b.dias_totales))
  }, [lm])

  function aplicar() {
    if (!desde || !hasta) {
      toast.error("Elegí desde y hasta")
      return
    }
    if (desde > hasta) {
      toast.error("Desde no puede ser mayor que hasta")
      return
    }
    startTransition(async () => {
      const [r1, r2] = await Promise.all([
        reporteRepitencia({ desde, hasta }),
        reporteLicenciasMedicas({ desde, hasta }),
      ])
      if ("error" in r1) toast.error(r1.error)
      else setRepitencia(r1.data)
      if ("error" in r2) toast.error(r2.error)
      else setLm(r2.data)
    })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Ausentismo · Reportes
          </h1>
          <p className="text-sm text-slate-500">
            Análisis de repitencia y foco en licencias médicas.
          </p>
        </div>
        <Link
          href="/ausentismo"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Volver
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={aplicar}
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Calculando..." : "Aplicar"}
        </button>
      </div>

      {/* Repitencia general */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          Repitencia general
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Empleados ordenados por cantidad de eventos. Se resaltan los que tienen
          3 eventos o más en el rango.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Empleado</th>
                <th className="px-3 py-2 font-medium text-slate-700">Sector</th>
                <th className="px-3 py-2 font-medium text-slate-700">Eventos</th>
                <th className="px-3 py-2 font-medium text-slate-700">Días totales</th>
                <th className="px-3 py-2 font-medium text-slate-700">Prom. días</th>
                <th className="px-3 py-2 font-medium text-slate-700">Último</th>
                <th className="px-3 py-2 font-medium text-slate-700">Motivo + frecuente</th>
              </tr>
            </thead>
            <tbody>
              {repitencia.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Sin datos en el rango.
                  </td>
                </tr>
              )}
              {repitencia.map((r) => {
                const alerta = r.eventos >= 3
                return (
                  <tr
                    key={r.empleado_id}
                    className={
                      "border-t border-slate-100 " +
                      (alerta ? "bg-amber-50" : "")
                    }
                  >
                    <td className="px-3 py-2">
                      {r.empleado_nombre}{" "}
                      <span className="text-xs text-slate-400">#{r.empleado_legajo}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.empleado_sector ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {fmt(r.eventos)}
                      {alerta && (
                        <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          repitencia
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{fmt(r.dias_totales)}</td>
                    <td className="px-3 py-2">{r.promedio_dias}</td>
                    <td className="px-3 py-2 text-xs">{r.ultimo_evento}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                        style={{
                          backgroundColor:
                            AUSENTISMO_MOTIVO_COLORS[r.motivo_predominante],
                        }}
                      >
                        {AUSENTISMO_MOTIVO_LABELS[r.motivo_predominante]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Foco Licencias Médicas */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          Foco · Licencias Médicas
        </h2>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <StatCard label="Eventos LM" value={lm?.total_eventos ?? 0} />
          <StatCard label="Días totales" value={lm?.total_dias ?? 0} />
          <StatCard
            label="Empleados con LM"
            value={lm?.empleados_con_lm ?? 0}
          />
          <StatCard
            label="Con repitencia (≥2)"
            value={lm?.empleados_con_repitencia ?? 0}
            accent={AUSENTISMO_MOTIVO_COLORS.licencia_medica}
          />
        </div>

        {/* Mini bar chart por mes (Tailwind, sin librería) */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Días de LM por mes
          </div>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {(lm?.por_mes ?? []).map((b) => {
              const h = Math.round((b.dias_totales / maxBarMes) * 100)
              return (
                <div
                  key={b.year_month}
                  className="flex flex-1 flex-col items-center justify-end"
                  title={`${b.year_month}: ${b.dias_totales} días · ${b.eventos} eventos`}
                >
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${h}%`,
                      backgroundColor: AUSENTISMO_MOTIVO_COLORS.licencia_medica,
                      minHeight: b.dias_totales > 0 ? 2 : 0,
                    }}
                  />
                  <div className="mt-1 text-[10px] text-slate-500">
                    {b.year_month.slice(2)}
                  </div>
                </div>
              )
            })}
            {(lm?.por_mes ?? []).length === 0 && (
              <div className="flex-1 text-center text-xs text-slate-400">
                Sin datos
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Empleado</th>
                <th className="px-3 py-2 font-medium text-slate-700">Sector</th>
                <th className="px-3 py-2 font-medium text-slate-700">LM</th>
                <th className="px-3 py-2 font-medium text-slate-700">Días</th>
                <th className="px-3 py-2 font-medium text-slate-700">Prom. días</th>
                <th className="px-3 py-2 font-medium text-slate-700">Última LM</th>
              </tr>
            </thead>
            <tbody>
              {(lm?.top_empleados ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Sin licencias médicas en el rango.
                  </td>
                </tr>
              )}
              {(lm?.top_empleados ?? []).map((r) => {
                const repite = r.eventos >= 2
                return (
                  <tr
                    key={r.empleado_id}
                    className={
                      "border-t border-slate-100 " +
                      (repite ? "bg-blue-50" : "")
                    }
                  >
                    <td className="px-3 py-2">
                      {r.empleado_nombre}{" "}
                      <span className="text-xs text-slate-400">#{r.empleado_legajo}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.empleado_sector ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {fmt(r.eventos)}
                      {repite && (
                        <span className="ml-2 rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-900">
                          repitencia
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{fmt(r.dias_totales)}</td>
                    <td className="px-3 py-2">{r.promedio_dias}</td>
                    <td className="px-3 py-2 text-xs">{r.ultimo_evento}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: string
}) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4"
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 4 } : undefined}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">
        {typeof value === "number" ? fmt(value) : value}
      </div>
    </div>
  )
}
