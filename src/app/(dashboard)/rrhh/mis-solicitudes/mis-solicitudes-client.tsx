"use client"

import { useState, useTransition } from "react"
import {
  cancelarSolicitud,
  crearSolicitud,
} from "@/actions/rrhh-licencias"
import {
  RRHH_SOLICITUD_ESTADO_COLORS,
  RRHH_SOLICITUD_ESTADO_LABELS,
  type RrhhSaldoVacaciones,
  type RrhhSolicitudConDetalle,
  type RrhhTipoLicencia,
} from "@/types/database"

interface Props {
  solicitudes: RrhhSolicitudConDetalle[]
  tipos: RrhhTipoLicencia[]
  saldo: RrhhSaldoVacaciones | null
  anio: number
}

export function MisSolicitudesClient({ solicitudes, tipos, saldo, anio }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    tipo_licencia_id: tipos[0]?.id ?? "",
    fecha_desde: "",
    fecha_hasta: "",
    motivo: "",
  })

  const saldoDisponible = saldo
    ? saldo.dias_otorgados - saldo.dias_usados
    : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await crearSolicitud({
        tipo_licencia_id: form.tipo_licencia_id,
        fecha_desde: form.fecha_desde,
        fecha_hasta: form.fecha_hasta,
        motivo: form.motivo || undefined,
      })
      if ("error" in res) {
        setError(res.error)
      } else {
        setOpen(false)
        setForm({
          tipo_licencia_id: tipos[0]?.id ?? "",
          fecha_desde: "",
          fecha_hasta: "",
          motivo: "",
        })
        window.location.reload()
      }
    })
  }

  function handleCancelar(id: string) {
    if (!confirm("¿Cancelar esta solicitud?")) return
    startTransition(async () => {
      const res = await cancelarSolicitud(id)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Mis vacaciones y licencias</h1>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nueva solicitud
        </button>
      </div>

      {/* Saldo */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Saldo de vacaciones {anio}
        </p>
        {saldo ? (
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {saldoDisponible} días disponibles
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({saldo.dias_usados} usados de {saldo.dias_otorgados})
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Saldo no asignado para este año. Consultá con RRHH.
          </p>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
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
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No tenés solicitudes registradas.
                </td>
              </tr>
            )}
            {solicitudes.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
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
                  {s.estado === "pendiente_supervisor" && (
                    <button
                      type="button"
                      onClick={() => handleCancelar(s.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog nueva solicitud */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="mb-3 text-lg font-bold text-slate-900">Nueva solicitud</h2>

            <label className="mb-3 block text-sm">
              <span className="font-medium text-slate-700">Tipo</span>
              <select
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                value={form.tipo_licencia_id}
                onChange={(e) => setForm({ ...form, tipo_licencia_id: e.target.value })}
              >
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Desde</span>
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={form.fecha_desde}
                  onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Hasta</span>
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={form.fecha_hasta}
                  onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })}
                />
              </label>
            </div>

            <label className="mb-3 block text-sm">
              <span className="font-medium text-slate-700">Motivo (opcional)</span>
              <textarea
                rows={3}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            </label>

            {error && (
              <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
