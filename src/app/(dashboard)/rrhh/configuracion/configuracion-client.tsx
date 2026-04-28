"use client"

import { useState, useTransition } from "react"
import { setSaldoVacaciones } from "@/actions/rrhh-licencias"
import type {
  EmpleadoConSupervisor,
  RrhhSaldoVacaciones,
  RrhhTipoLicencia,
} from "@/types/database"

interface Props {
  tipos: RrhhTipoLicencia[]
  empleados: EmpleadoConSupervisor[]
  saldos: RrhhSaldoVacaciones[]
  anio: number
}

export function ConfiguracionClient({ tipos, empleados, saldos, anio }: Props) {
  const [tab, setTab] = useState<"saldos" | "tipos">("saldos")
  const [pending, startTransition] = useTransition()

  const saldosMap = new Map(saldos.map((s) => [s.empleado_id, s]))

  function handleEditar(empId: string, current: number) {
    const txt = prompt(`Días otorgados ${anio}:`, String(current))
    if (txt === null) return
    const dias = parseInt(txt, 10)
    if (Number.isNaN(dias) || dias < 0) {
      alert("Valor inválido")
      return
    }
    startTransition(async () => {
      const res = await setSaldoVacaciones(empId, anio, dias)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-3 text-2xl font-bold text-slate-900">Configuración RRHH</h1>

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setTab("saldos")}
          className={`rounded-l-lg px-4 py-2 text-sm font-medium ${
            tab === "saldos" ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          Saldos {anio}
        </button>
        <button
          type="button"
          onClick={() => setTab("tipos")}
          className={`rounded-r-lg px-4 py-2 text-sm font-medium ${
            tab === "tipos" ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          Tipos de licencia
        </button>
      </div>

      {tab === "saldos" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Legajo</th>
                <th className="px-3 py-2 font-medium text-slate-700">Empleado</th>
                <th className="px-3 py-2 font-medium text-slate-700">Otorgados</th>
                <th className="px-3 py-2 font-medium text-slate-700">Usados</th>
                <th className="px-3 py-2 font-medium text-slate-700">Disponibles</th>
                <th className="px-3 py-2 font-medium text-slate-700"></th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((e) => {
                const saldo = saldosMap.get(e.id)
                const otorg = saldo?.dias_otorgados ?? 0
                const usados = saldo?.dias_usados ?? 0
                return (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{e.legajo}</td>
                    <td className="px-3 py-2 font-medium">{e.nombre}</td>
                    <td className="px-3 py-2">{otorg}</td>
                    <td className="px-3 py-2">{usados}</td>
                    <td className="px-3 py-2">
                      <strong>{otorg - usados}</strong>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleEditar(e.id, otorg)}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "tipos" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Código</th>
                <th className="px-3 py-2 font-medium text-slate-700">Nombre</th>
                <th className="px-3 py-2 font-medium text-slate-700">Computa días</th>
                <th className="px-3 py-2 font-medium text-slate-700">Cert. obligatorio</th>
                <th className="px-3 py-2 font-medium text-slate-700">Mapea a novedad</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono">{t.codigo}</td>
                  <td className="px-3 py-2">{t.nombre}</td>
                  <td className="px-3 py-2">
                    {t.computa_dias_anuales ? "Sí" : "No"}
                  </td>
                  <td className="px-3 py-2">
                    {t.requiere_certificado ? "Sí" : "No"}
                  </td>
                  <td className="px-3 py-2 text-xs">{t.novedad_asistencia_tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            Para agregar/editar tipos, contactá al equipo técnico (próxima fase).
          </p>
        </div>
      )}
    </div>
  )
}
