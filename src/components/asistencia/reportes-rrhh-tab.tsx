"use client"

import { useState, useTransition } from "react"
import {
  reporteInasistenciasMes,
  reportePausasLaborales,
  reporteTotalHoras,
} from "@/actions/asistencia"
import type {
  RrhhInasistenciaRow,
  RrhhPausaRow,
  RrhhTotalHorasRow,
} from "@/types/database"

type SubTab = "inasistencias" | "horas" | "pausas"

function rangoMes(mes: number, anio: number): { desde: string; hasta: string } {
  const desde = new Date(Date.UTC(anio, mes - 1, 1))
  const hasta = new Date(Date.UTC(anio, mes, 0))
  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
  }
}

interface Props {
  mesInicial: number
  anioInicial: number
}

export function ReportesRrhhTab({ mesInicial, anioInicial }: Props) {
  const [sub, setSub] = useState<SubTab>("inasistencias")
  const [mes, setMes] = useState(mesInicial)
  const [anio, setAnio] = useState(anioInicial)
  const [legajo, setLegajo] = useState<string>("")
  const [pending, startTransition] = useTransition()

  const [inasistencias, setInasistencias] = useState<RrhhInasistenciaRow[]>([])
  const [horas, setHoras] = useState<RrhhTotalHorasRow[]>([])
  const [pausas, setPausas] = useState<RrhhPausaRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)

  function cargar() {
    setError(null)
    const { desde, hasta } = rangoMes(mes, anio)
    const filtros = {
      desde,
      hasta,
      legajo: legajo ? parseInt(legajo, 10) : undefined,
    }
    startTransition(async () => {
      if (sub === "inasistencias") {
        const res = await reporteInasistenciasMes(filtros)
        if ("error" in res) setError(res.error)
        else setInasistencias(res.data)
      } else if (sub === "horas") {
        const res = await reporteTotalHoras(filtros)
        if ("error" in res) setError(res.error)
        else setHoras(res.data)
      } else {
        const res = await reportePausasLaborales(filtros)
        if ("error" in res) setError(res.error)
        else setPausas(res.data)
      }
      setCargado(true)
    })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="inline-flex rounded-md border border-slate-200 bg-white">
          {(["inasistencias", "horas", "pausas"] as SubTab[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSub(s)
                setCargado(false)
              }}
              className={`px-3 py-1.5 text-xs font-medium first:rounded-l-md last:rounded-r-md ${
                sub === s ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              {s === "inasistencias" && "Inasistencias"}
              {s === "horas" && "Total horas"}
              {s === "pausas" && "Pausas"}
            </button>
          ))}
        </div>

        <label className="text-xs">
          Mes
          <select
            value={mes}
            onChange={(e) => setMes(parseInt(e.target.value, 10))}
            className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Año
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(parseInt(e.target.value, 10))}
            className="ml-1 w-20 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          Legajo (opcional)
          <input
            type="number"
            value={legajo}
            onChange={(e) => setLegajo(e.target.value)}
            className="ml-1 w-24 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={cargar}
          disabled={pending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Calculando…" : "Generar"}
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!cargado && !pending && (
        <p className="py-6 text-center text-sm text-slate-500">
          Elegí un mes y presioná Generar.
        </p>
      )}

      {cargado && sub === "inasistencias" && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Legajo</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Novedad</th>
              </tr>
            </thead>
            <tbody>
              {inasistencias.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Sin inasistencias.
                  </td>
                </tr>
              )}
              {inasistencias.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{r.legajo}</td>
                  <td className="px-3 py-1.5">{r.nombre}</td>
                  <td className="px-3 py-1.5">{r.fecha}</td>
                  <td className="px-3 py-1.5">
                    {r.motivo === "sin_marca" ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        Sin marca
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        Con novedad
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{r.novedad_tipo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cargado && sub === "horas" && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Legajo</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Días</th>
                <th className="px-3 py-2">Horas trabajadas</th>
                <th className="px-3 py-2">Horas esperadas</th>
                <th className="px-3 py-2">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {horas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Sin datos.
                  </td>
                </tr>
              )}
              {horas.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{r.legajo}</td>
                  <td className="px-3 py-1.5">{r.nombre}</td>
                  <td className="px-3 py-1.5">{r.dias_trabajados}</td>
                  <td className="px-3 py-1.5">{r.horas_trabajadas}</td>
                  <td className="px-3 py-1.5">{r.horas_esperadas}</td>
                  <td
                    className={`px-3 py-1.5 font-medium ${
                      r.diferencia_horas < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {r.diferencia_horas > 0 ? "+" : ""}
                    {r.diferencia_horas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cargado && sub === "pausas" && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Legajo</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Inicio pausa</th>
                <th className="px-3 py-2">Fin pausa</th>
                <th className="px-3 py-2">Duración (min)</th>
              </tr>
            </thead>
            <tbody>
              {pausas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Sin pausas mayores a 30 min.
                  </td>
                </tr>
              )}
              {pausas.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{r.legajo}</td>
                  <td className="px-3 py-1.5">{r.fecha}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {new Date(r.pausa_inicio).toLocaleTimeString("es-AR", {
                      timeZone: "America/Argentina/Buenos_Aires",
                    })}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {new Date(r.pausa_fin).toLocaleTimeString("es-AR", {
                      timeZone: "America/Argentina/Buenos_Aires",
                    })}
                  </td>
                  <td className="px-3 py-1.5 font-medium">{r.duracion_minutos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
