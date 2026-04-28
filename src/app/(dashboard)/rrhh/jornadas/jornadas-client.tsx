"use client"

import { useState, useTransition } from "react"
import {
  asignarJornada,
  crearJornadaPlantilla,
  finalizarAsignacion,
} from "@/actions/rrhh-jornadas"
import type {
  EmpleadoConSupervisor,
  RrhhJornadaAsignacionConPlantilla,
  RrhhJornadaPlantilla,
} from "@/types/database"

interface Props {
  plantillas: RrhhJornadaPlantilla[]
  asignaciones: RrhhJornadaAsignacionConPlantilla[]
  empleados: EmpleadoConSupervisor[]
}

const DIAS_SEMANA = [
  { v: 1, l: "Lun" },
  { v: 2, l: "Mar" },
  { v: 3, l: "Mié" },
  { v: 4, l: "Jue" },
  { v: 5, l: "Vie" },
  { v: 6, l: "Sáb" },
  { v: 7, l: "Dom" },
]

export function JornadasClient({ plantillas, asignaciones, empleados }: Props) {
  const [tab, setTab] = useState<"plantillas" | "asignaciones">("asignaciones")
  const [pending, startTransition] = useTransition()
  const [openPlantilla, setOpenPlantilla] = useState(false)
  const [openAsignar, setOpenAsignar] = useState(false)
  const [pForm, setPForm] = useState({
    nombre: "",
    hora_entrada: "08:00",
    hora_salida: "17:00",
    horas_esperadas: 8,
    tolerancia_minutos: 10,
  })
  const [aForm, setAForm] = useState({
    empleado_id: "",
    jornada_id: plantillas[0]?.id ?? "",
    vigente_desde: new Date().toISOString().slice(0, 10),
    vigente_hasta: "",
    dias_semana: [1, 2, 3, 4, 5],
  })

  function submitPlantilla(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await crearJornadaPlantilla(pForm)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  function submitAsignar(e: React.FormEvent) {
    e.preventDefault()
    if (!aForm.empleado_id || !aForm.jornada_id) {
      alert("Empleado y jornada son obligatorios")
      return
    }
    startTransition(async () => {
      const res = await asignarJornada({
        empleado_id: aForm.empleado_id,
        jornada_id: aForm.jornada_id,
        vigente_desde: aForm.vigente_desde,
        vigente_hasta: aForm.vigente_hasta || null,
        dias_semana: aForm.dias_semana,
      })
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  function handleFinalizar(id: string) {
    const fecha = prompt("Fecha de fin (YYYY-MM-DD):")
    if (!fecha) return
    startTransition(async () => {
      const res = await finalizarAsignacion(id, fecha)
      if ("error" in res) alert(res.error)
      else window.location.reload()
    })
  }

  function toggleDia(d: number) {
    setAForm((f) => ({
      ...f,
      dias_semana: f.dias_semana.includes(d)
        ? f.dias_semana.filter((x) => x !== d)
        : [...f.dias_semana, d].sort(),
    }))
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-3 text-2xl font-bold text-slate-900">Jornadas</h1>

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setTab("asignaciones")}
          className={`rounded-l-lg px-4 py-2 text-sm font-medium ${
            tab === "asignaciones" ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          Asignaciones
        </button>
        <button
          type="button"
          onClick={() => setTab("plantillas")}
          className={`rounded-r-lg px-4 py-2 text-sm font-medium ${
            tab === "plantillas" ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          Plantillas
        </button>
      </div>

      {tab === "plantillas" && (
        <>
          <button
            type="button"
            onClick={() => setOpenPlantilla(true)}
            className="mb-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Nueva plantilla
          </button>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">Nombre</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Entrada</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Salida</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Hs esperadas</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Tolerancia</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Activa</th>
                </tr>
              </thead>
              <tbody>
                {plantillas.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{p.nombre}</td>
                    <td className="px-3 py-2">{p.hora_entrada}</td>
                    <td className="px-3 py-2">{p.hora_salida}</td>
                    <td className="px-3 py-2">{p.horas_esperadas}</td>
                    <td className="px-3 py-2">{p.tolerancia_minutos} min</td>
                    <td className="px-3 py-2">{p.activo ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "asignaciones" && (
        <>
          <button
            type="button"
            onClick={() => setOpenAsignar(true)}
            disabled={plantillas.length === 0}
            className="mb-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            + Asignar jornada
          </button>
          {plantillas.length === 0 && (
            <p className="mb-3 text-xs text-slate-500">
              Primero creá al menos una plantilla.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">Empleado</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Plantilla</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Días</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Desde</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Hasta</th>
                  <th className="px-3 py-2 font-medium text-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {asignaciones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      Sin asignaciones.
                    </td>
                  </tr>
                )}
                {asignaciones.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {a.empleado_nombre}{" "}
                      <span className="text-xs text-slate-400">#{a.empleado_legajo}</span>
                    </td>
                    <td className="px-3 py-2">{a.plantilla?.nombre ?? "?"}</td>
                    <td className="px-3 py-2 text-xs">
                      {a.dias_semana
                        .map((d) => DIAS_SEMANA.find((x) => x.v === d)?.l ?? d)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-2">{a.vigente_desde}</td>
                    <td className="px-3 py-2">
                      {a.vigente_hasta ?? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          vigente
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!a.vigente_hasta && (
                        <button
                          type="button"
                          onClick={() => handleFinalizar(a.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Finalizar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openPlantilla && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={submitPlantilla}
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="mb-3 text-lg font-bold text-slate-900">Nueva plantilla</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block text-sm">
                <span className="font-medium text-slate-700">Nombre</span>
                <input
                  required
                  value={pForm.nombre}
                  onChange={(e) => setPForm({ ...pForm, nombre: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Entrada</span>
                <input
                  type="time"
                  required
                  value={pForm.hora_entrada}
                  onChange={(e) => setPForm({ ...pForm, hora_entrada: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Salida</span>
                <input
                  type="time"
                  required
                  value={pForm.hora_salida}
                  onChange={(e) => setPForm({ ...pForm, hora_salida: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Hs esperadas</span>
                <input
                  type="number"
                  step="0.25"
                  value={pForm.horas_esperadas}
                  onChange={(e) =>
                    setPForm({ ...pForm, horas_esperadas: parseFloat(e.target.value) })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Tolerancia (min)</span>
                <input
                  type="number"
                  value={pForm.tolerancia_minutos}
                  onChange={(e) =>
                    setPForm({
                      ...pForm,
                      tolerancia_minutos: parseInt(e.target.value, 10),
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenPlantilla(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {openAsignar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={submitAsignar}
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="mb-3 text-lg font-bold text-slate-900">Asignar jornada</h2>
            <label className="mb-3 block text-sm">
              <span className="font-medium text-slate-700">Empleado</span>
              <select
                required
                value={aForm.empleado_id}
                onChange={(e) => setAForm({ ...aForm, empleado_id: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="">— elegí —</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.legajo} · {e.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-3 block text-sm">
              <span className="font-medium text-slate-700">Plantilla</span>
              <select
                required
                value={aForm.jornada_id}
                onChange={(e) => setAForm({ ...aForm, jornada_id: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.hora_entrada}–{p.hora_salida})
                  </option>
                ))}
              </select>
            </label>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Vigente desde</span>
                <input
                  type="date"
                  required
                  value={aForm.vigente_desde}
                  onChange={(e) => setAForm({ ...aForm, vigente_desde: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Vigente hasta (opcional)</span>
                <input
                  type="date"
                  value={aForm.vigente_hasta}
                  onChange={(e) => setAForm({ ...aForm, vigente_hasta: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mb-3">
              <span className="block text-sm font-medium text-slate-700">Días</span>
              <div className="mt-2 flex gap-1">
                {DIAS_SEMANA.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDia(d.v)}
                    className={`rounded border px-2 py-1 text-xs ${
                      aForm.dias_semana.includes(d.v)
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenAsignar(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Asignar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
