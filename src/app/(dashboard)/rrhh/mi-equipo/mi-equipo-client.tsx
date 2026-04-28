"use client"

import { useState, useTransition } from "react"
import {
  aprobarPorSupervisor,
  rechazarPorSupervisor,
} from "@/actions/rrhh-licencias"
import {
  RRHH_SOLICITUD_ESTADO_COLORS,
  RRHH_SOLICITUD_ESTADO_LABELS,
  type EmpleadoConSupervisor,
  type RrhhSolicitudConDetalle,
  type UserRole,
} from "@/types/database"

interface Props {
  role: UserRole
  equipo: EmpleadoConSupervisor[]
  solicitudes: RrhhSolicitudConDetalle[]
}

export function MiEquipoClient({ equipo, solicitudes }: Props) {
  const [tab, setTab] = useState<"equipo" | "solicitudes">("solicitudes")
  const [pending, startTransition] = useTransition()

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente_supervisor")

  function handleAprobar(id: string) {
    const obs = prompt("Observación (opcional):") ?? undefined
    startTransition(async () => {
      const res = await aprobarPorSupervisor(id, obs)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  function handleRechazar(id: string) {
    const obs = prompt("Motivo del rechazo:")
    if (!obs) return
    startTransition(async () => {
      const res = await rechazarPorSupervisor(id, obs)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-3 text-2xl font-bold text-slate-900">Personal a cargo</h1>

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setTab("solicitudes")}
          className={`rounded-l-lg px-4 py-2 text-sm font-medium ${
            tab === "solicitudes" ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          Solicitudes
          {pendientes.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">
              {pendientes.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("equipo")}
          className={`rounded-r-lg px-4 py-2 text-sm font-medium ${
            tab === "equipo" ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          Equipo ({equipo.length})
        </button>
      </div>

      {tab === "solicitudes" && (
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
                <th className="px-3 py-2 font-medium text-slate-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No hay solicitudes en tu equipo.
                  </td>
                </tr>
              )}
              {solicitudes.map((s) => (
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
                      style={{
                        backgroundColor: RRHH_SOLICITUD_ESTADO_COLORS[s.estado],
                      }}
                    >
                      {RRHH_SOLICITUD_ESTADO_LABELS[s.estado]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {s.estado === "pendiente_supervisor" && (
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
      )}

      {tab === "equipo" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Legajo</th>
                <th className="px-3 py-2 font-medium text-slate-700">Nombre</th>
                <th className="px-3 py-2 font-medium text-slate-700">Puesto</th>
                <th className="px-3 py-2 font-medium text-slate-700">Área</th>
                <th className="px-3 py-2 font-medium text-slate-700">Activo</th>
              </tr>
            </thead>
            <tbody>
              {equipo.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No tenés personal asignado.
                  </td>
                </tr>
              )}
              {equipo.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{e.legajo}</td>
                  <td className="px-3 py-2">{e.nombre}</td>
                  <td className="px-3 py-2">{e.puesto ?? "—"}</td>
                  <td className="px-3 py-2">{e.area ?? "—"}</td>
                  <td className="px-3 py-2">
                    {e.activo ? (
                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        Sí
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        No
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
