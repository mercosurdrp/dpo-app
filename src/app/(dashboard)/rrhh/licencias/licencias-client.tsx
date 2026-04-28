"use client"

import { useMemo, useState, useTransition } from "react"
import { aprobarPorRRHH, rechazarPorRRHH } from "@/actions/rrhh-licencias"
import {
  RRHH_SOLICITUD_ESTADO_COLORS,
  RRHH_SOLICITUD_ESTADO_LABELS,
  type RrhhSolicitudConDetalle,
  type RrhhSolicitudEstado,
} from "@/types/database"

interface Props {
  solicitudes: RrhhSolicitudConDetalle[]
}

const ESTADOS_FILTRO: { value: RrhhSolicitudEstado | "todos"; label: string }[] = [
  { value: "pendiente_rrhh", label: "Pendientes RRHH" },
  { value: "pendiente_supervisor", label: "Pendiente supervisor" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "cancelada", label: "Canceladas" },
  { value: "todos", label: "Todas" },
]

export function LicenciasClient({ solicitudes }: Props) {
  const [filtro, setFiltro] = useState<RrhhSolicitudEstado | "todos">(
    "pendiente_rrhh"
  )
  const [pending, startTransition] = useTransition()

  const filtradas = useMemo(() => {
    if (filtro === "todos") return solicitudes
    return solicitudes.filter((s) => s.estado === filtro)
  }, [solicitudes, filtro])

  function handleAprobar(id: string) {
    const obs = prompt("Observación (opcional):") ?? undefined
    startTransition(async () => {
      const res = await aprobarPorRRHH(id, obs)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  function handleRechazar(id: string) {
    const obs = prompt("Motivo del rechazo:")
    if (!obs) return
    startTransition(async () => {
      const res = await rechazarPorRRHH(id, obs)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-3 text-2xl font-bold text-slate-900">
        Licencias y vacaciones
      </h1>

      <div className="mb-3 flex flex-wrap gap-2">
        {ESTADOS_FILTRO.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltro(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filtro === f.value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-slate-700">Empleado</th>
              <th className="px-3 py-2 font-medium text-slate-700">Tipo</th>
              <th className="px-3 py-2 font-medium text-slate-700">Desde</th>
              <th className="px-3 py-2 font-medium text-slate-700">Hasta</th>
              <th className="px-3 py-2 font-medium text-slate-700">Días</th>
              <th className="px-3 py-2 font-medium text-slate-700">Estado</th>
              <th className="px-3 py-2 font-medium text-slate-700">Cert.</th>
              <th className="px-3 py-2 font-medium text-slate-700">Motivo</th>
              <th className="px-3 py-2 font-medium text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  Sin solicitudes en este filtro.
                </td>
              </tr>
            )}
            {filtradas.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {s.empleado_nombre}{" "}
                  <span className="text-xs text-slate-400">#{s.empleado_legajo}</span>
                </td>
                <td className="px-3 py-2">{s.tipo_licencia_nombre}</td>
                <td className="px-3 py-2">{s.fecha_desde}</td>
                <td className="px-3 py-2">{s.fecha_hasta}</td>
                <td className="px-3 py-2">{s.dias_solicitados}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: RRHH_SOLICITUD_ESTADO_COLORS[s.estado] }}
                  >
                    {RRHH_SOLICITUD_ESTADO_LABELS[s.estado]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {s.certificado_url ? (
                    <a
                      href={s.certificado_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600">
                  {s.motivo ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {s.estado === "pendiente_rrhh" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleAprobar(s.id)}
                        className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleRechazar(s.id)}
                        className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
