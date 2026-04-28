"use client"

import { useMemo, useState, useTransition } from "react"
import { actualizarEmpleado, crearEmpleado } from "@/actions/rrhh-personal"
import {
  TIPO_CONTRATO_LABELS,
  type EmpleadoConSupervisor,
  type TipoContrato,
} from "@/types/database"

interface Props {
  empleados: EmpleadoConSupervisor[]
}

const EMPTY_FORM = {
  legajo: "",
  nombre: "",
  numero_id: "",
  sector: "",
  area: "",
  departamento: "",
  puesto: "",
  fecha_ingreso: "",
  tipo_contrato: "" as "" | TipoContrato,
  cuil: "",
  telefono: "",
  email_personal: "",
  supervisor_id: "",
  activo: true,
}

export function PersonalClient({ empleados }: Props) {
  const [search, setSearch] = useState("")
  const [showInactivos, setShowInactivos] = useState(false)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return empleados.filter((e) => {
      if (!showInactivos && !e.activo) return false
      if (!s) return true
      return (
        e.nombre.toLowerCase().includes(s) ||
        String(e.legajo).includes(s) ||
        (e.area ?? "").toLowerCase().includes(s) ||
        (e.puesto ?? "").toLowerCase().includes(s)
      )
    })
  }, [empleados, search, showInactivos])

  function startEdit(e: EmpleadoConSupervisor) {
    setEditId(e.id)
    setForm({
      legajo: String(e.legajo),
      nombre: e.nombre,
      numero_id: e.numero_id ?? "",
      sector: e.sector ?? "",
      area: e.area ?? "",
      departamento: e.departamento ?? "",
      puesto: e.puesto ?? "",
      fecha_ingreso: e.fecha_ingreso ?? "",
      tipo_contrato: (e.tipo_contrato ?? "") as "" | TipoContrato,
      cuil: e.cuil ?? "",
      telefono: e.telefono ?? "",
      email_personal: e.email_personal ?? "",
      supervisor_id: e.supervisor_id ?? "",
      activo: e.activo,
    })
    setOpen(true)
  }

  function startNew() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    const legajo = parseInt(form.legajo, 10)
    if (!legajo || !form.nombre.trim()) {
      setError("Legajo y nombre son obligatorios")
      return
    }
    const payload = {
      legajo,
      nombre: form.nombre.trim(),
      numero_id: form.numero_id || null,
      sector: form.sector || null,
      area: form.area || null,
      departamento: form.departamento || null,
      puesto: form.puesto || null,
      fecha_ingreso: form.fecha_ingreso || null,
      tipo_contrato: form.tipo_contrato || null,
      cuil: form.cuil || null,
      telefono: form.telefono || null,
      email_personal: form.email_personal || null,
      supervisor_id: form.supervisor_id || null,
      activo: form.activo,
    }
    startTransition(async () => {
      const res = editId
        ? await actualizarEmpleado(editId, payload)
        : await crearEmpleado(payload)
      if ("error" in res) setError(res.error)
      else window.location.reload()
    })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Personal</h1>
        <button
          type="button"
          onClick={startNew}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nuevo empleado
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre, legajo, área…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showInactivos}
            onChange={(e) => setShowInactivos(e.target.checked)}
          />
          Incluir inactivos
        </label>
        <span className="text-xs text-slate-500">
          {filtered.length} de {empleados.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-slate-700">Legajo</th>
              <th className="px-3 py-2 font-medium text-slate-700">Nombre</th>
              <th className="px-3 py-2 font-medium text-slate-700">Puesto</th>
              <th className="px-3 py-2 font-medium text-slate-700">Área</th>
              <th className="px-3 py-2 font-medium text-slate-700">Supervisor</th>
              <th className="px-3 py-2 font-medium text-slate-700">Contrato</th>
              <th className="px-3 py-2 font-medium text-slate-700">Activo</th>
              <th className="px-3 py-2 font-medium text-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{e.legajo}</td>
                <td className="px-3 py-2 font-medium">{e.nombre}</td>
                <td className="px-3 py-2">{e.puesto ?? "—"}</td>
                <td className="px-3 py-2">{e.area ?? "—"}</td>
                <td className="px-3 py-2">
                  {e.supervisor_nombre ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  {e.tipo_contrato ? TIPO_CONTRATO_LABELS[e.tipo_contrato] : "—"}
                </td>
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
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => startEdit(e)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="mb-3 text-lg font-bold text-slate-900">
              {editId ? "Editar empleado" : "Nuevo empleado"}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Legajo" required>
                <input
                  type="number"
                  required
                  value={form.legajo}
                  onChange={(e) => setForm({ ...form, legajo: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Nombre" required>
                <input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="DNI / Nº ID">
                <input
                  value={form.numero_id}
                  onChange={(e) => setForm({ ...form, numero_id: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="CUIL">
                <input
                  value={form.cuil}
                  onChange={(e) => setForm({ ...form, cuil: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Puesto">
                <input
                  value={form.puesto}
                  onChange={(e) => setForm({ ...form, puesto: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Área">
                <input
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Departamento">
                <input
                  value={form.departamento}
                  onChange={(e) => setForm({ ...form, departamento: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Sector">
                <input
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Fecha ingreso">
                <input
                  type="date"
                  value={form.fecha_ingreso}
                  onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Tipo de contrato">
                <select
                  value={form.tipo_contrato}
                  onChange={(e) =>
                    setForm({ ...form, tipo_contrato: e.target.value as "" | TipoContrato })
                  }
                  className="w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="">—</option>
                  {(Object.keys(TIPO_CONTRATO_LABELS) as TipoContrato[]).map((k) => (
                    <option key={k} value={k}>
                      {TIPO_CONTRATO_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Teléfono">
                <input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Email personal">
                <input
                  type="email"
                  value={form.email_personal}
                  onChange={(e) => setForm({ ...form, email_personal: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </Field>
              <Field label="Supervisor (legajo o id)">
                <select
                  value={form.supervisor_id}
                  onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="">— sin supervisor —</option>
                  {empleados
                    .filter((e) => e.id !== editId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.legajo} · {e.nombre}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Activo">
                <select
                  value={form.activo ? "1" : "0"}
                  onChange={(e) => setForm({ ...form, activo: e.target.value === "1" })}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="1">Sí</option>
                  <option value="0">No</option>
                </select>
              </Field>
            </div>

            {error && (
              <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
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
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
