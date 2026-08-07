"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  crearEntrega,
  eliminarEntrega,
  guardarTallesEmpleado,
  resolverReclamo,
} from "@/actions/epp"
import {
  EPP_TIPOS_ITEM,
  EPP_TIPO_LABELS,
  TALLE_CAMPOS,
  type TalleCampo,
} from "@/lib/epp"
import {
  ENTREGA_EPP_ESTADO_COLORS,
  ENTREGA_EPP_ESTADO_LABELS,
  type EmpleadoConTalles,
  type EntregaEppConDetalle,
  type EntregaEppEstado,
} from "@/types/database"

interface Props {
  entregas: EntregaEppConDetalle[]
  empleados: EmpleadoConTalles[]
}

interface ItemForm {
  tipo_item: string
  talle: string
  cantidad: string
  descripcion: string
}

const EMPTY_ITEM: ItemForm = { tipo_item: "", talle: "", cantidad: "1", descripcion: "" }

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

export function EppClient({ entregas, empleados }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<"entregas" | "talles">("entregas")
  const [pending, startTransition] = useTransition()

  // ── Nueva entrega ──
  const [openEntrega, setOpenEntrega] = useState(false)
  const [empleadoId, setEmpleadoId] = useState("")
  const [fecha, setFecha] = useState(hoy())
  const [observaciones, setObservaciones] = useState("")
  const [items, setItems] = useState<ItemForm[]>([{ ...EMPTY_ITEM }])

  // ── Filtro y reclamos ──
  const [filtroEstado, setFiltroEstado] = useState<"" | EntregaEppEstado>("")
  const [resolverId, setResolverId] = useState<string | null>(null)
  const [resolucion, setResolucion] = useState("")

  // ── Talles ──
  const [searchTalles, setSearchTalles] = useState("")
  const [editTallesId, setEditTallesId] = useState<string | null>(null)
  const [tallesForm, setTallesForm] = useState<Record<TalleCampo, string>>({
    talle_pantalon: "",
    talle_remera: "",
    talle_campera: "",
    talle_buzo: "",
    talle_botines: "",
  })

  const empleadoSel = empleados.find((e) => e.id === empleadoId)

  const entregasFiltradas = useMemo(
    () => (filtroEstado ? entregas.filter((e) => e.estado === filtroEstado) : entregas),
    [entregas, filtroEstado]
  )

  const empleadosFiltrados = useMemo(() => {
    const s = searchTalles.trim().toLowerCase()
    if (!s) return empleados
    return empleados.filter(
      (e) => e.nombre.toLowerCase().includes(s) || String(e.legajo).includes(s)
    )
  }, [empleados, searchTalles])

  // Resumen para compras: por prenda, cuántas personas hay de cada talle.
  const resumen = useMemo(() => {
    return TALLE_CAMPOS.map((c) => {
      const counts = new Map<string, number>()
      let sinTalle = 0
      for (const e of empleados) {
        const v = e.talles?.[c.campo]
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
        else sinTalle++
      }
      const orden = [...counts.entries()].sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { numeric: true })
      )
      return { ...c, orden, sinTalle }
    })
  }, [empleados])

  const reclamadas = entregas.filter((e) => e.estado === "reclamada").length

  function abrirNuevaEntrega() {
    setEmpleadoId("")
    setFecha(hoy())
    setObservaciones("")
    setItems([{ ...EMPTY_ITEM }])
    setOpenEntrega(true)
  }

  function setItem(idx: number, patch: Partial<ItemForm>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function talleSugerido(tipo: string, emp?: EmpleadoConTalles): string {
    const def = EPP_TIPOS_ITEM.find((t) => t.value === tipo)
    if (!def?.talleCampo || !emp?.talles) return ""
    return emp.talles[def.talleCampo] ?? ""
  }

  function cambiarTipo(idx: number, tipo: string) {
    setItem(idx, { tipo_item: tipo, talle: talleSugerido(tipo, empleadoSel) })
  }

  function cambiarEmpleado(id: string) {
    setEmpleadoId(id)
    const emp = empleados.find((e) => e.id === id)
    // Re-prellenar el talle de los ítems ya elegidos con los del nuevo empleado.
    setItems((prev) =>
      prev.map((it) =>
        it.tipo_item ? { ...it, talle: talleSugerido(it.tipo_item, emp) } : it
      )
    )
  }

  function submitEntrega(ev: React.FormEvent) {
    ev.preventDefault()
    startTransition(async () => {
      const res = await crearEntrega({
        empleado_id: empleadoId,
        fecha_entrega: fecha,
        observaciones,
        items: items
          .filter((i) => i.tipo_item)
          .map((i) => ({
            tipo_item: i.tipo_item,
            talle: i.talle || undefined,
            descripcion: i.descripcion || undefined,
            cantidad: parseInt(i.cantidad, 10) || 1,
          })),
      })
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Entrega registrada. El empleado va a recibir el aviso.")
        setOpenEntrega(false)
        router.refresh()
      }
    })
  }

  function borrarEntrega(id: string) {
    if (!confirm("¿Eliminar esta entrega pendiente?")) return
    startTransition(async () => {
      const res = await eliminarEntrega(id)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Entrega eliminada")
        router.refresh()
      }
    })
  }

  function submitResolucion(ev: React.FormEvent) {
    ev.preventDefault()
    if (!resolverId) return
    startTransition(async () => {
      const res = await resolverReclamo(resolverId, resolucion)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Reclamo resuelto")
        setResolverId(null)
        setResolucion("")
        router.refresh()
      }
    })
  }

  function abrirEditTalles(e: EmpleadoConTalles) {
    setEditTallesId(e.id)
    setTallesForm({
      talle_pantalon: e.talles?.talle_pantalon ?? "",
      talle_remera: e.talles?.talle_remera ?? "",
      talle_campera: e.talles?.talle_campera ?? "",
      talle_buzo: e.talles?.talle_buzo ?? "",
      talle_botines: e.talles?.talle_botines ?? "",
    })
  }

  function submitTalles(ev: React.FormEvent) {
    ev.preventDefault()
    if (!editTallesId) return
    startTransition(async () => {
      const res = await guardarTallesEmpleado(editTallesId, tallesForm)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Talles guardados")
        setEditTallesId(null)
        router.refresh()
      }
    })
  }

  const empleadoEdit = empleados.find((e) => e.id === editTallesId)

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Ropa y EPP</h1>
        <button
          type="button"
          onClick={abrirNuevaEntrega}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nueva entrega
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("entregas")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "entregas"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Entregas
          {reclamadas > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {reclamadas}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("talles")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "talles"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Talles del personal
        </button>
      </div>

      {/* ───── Tab Entregas ───── */}
      {tab === "entregas" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as "" | EntregaEppEstado)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todos los estados</option>
              {(Object.keys(ENTREGA_EPP_ESTADO_LABELS) as EntregaEppEstado[]).map((k) => (
                <option key={k} value={k}>
                  {ENTREGA_EPP_ESTADO_LABELS[k]}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              {entregasFiltradas.length} de {entregas.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">#</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Empleado</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Fecha</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Ítems</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Estado</th>
                  <th className="px-3 py-2 font-medium text-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {entregasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No hay entregas registradas.
                    </td>
                  </tr>
                )}
                {entregasFiltradas.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 tabular-nums">{e.numero}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {e.empleado_nombre}
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        · {e.empleado_legajo}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {new Date(`${e.fecha_entrega}T00:00:00`).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-3 py-2">
                      {e.items.map((i) => (
                        <div key={i.id}>
                          {i.cantidad} × {EPP_TIPO_LABELS[i.tipo_item] ?? i.tipo_item}
                          {i.talle && <span className="text-slate-500"> ({i.talle})</span>}
                          {i.descripcion && (
                            <span className="text-slate-500"> · {i.descripcion}</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${ENTREGA_EPP_ESTADO_COLORS[e.estado]}1A`,
                          color: ENTREGA_EPP_ESTADO_COLORS[e.estado],
                        }}
                      >
                        {ENTREGA_EPP_ESTADO_LABELS[e.estado]}
                      </span>
                      {e.estado === "reclamada" && e.reclamo_motivo && (
                        <p className="mt-1 max-w-56 text-xs text-red-700">{e.reclamo_motivo}</p>
                      )}
                      {e.estado === "resuelta" && e.resolucion && (
                        <p className="mt-1 max-w-56 text-xs text-slate-500">{e.resolucion}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {e.estado === "reclamada" && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolverId(e.id)
                            setResolucion("")
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Resolver
                        </button>
                      )}
                      {e.estado === "pendiente" && (
                        <button
                          type="button"
                          onClick={() => borrarEntrega(e.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Eliminar
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

      {/* ───── Tab Talles ───── */}
      {tab === "talles" && (
        <>
          {/* Resumen para compras */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {resumen.map((r) => (
              <div key={r.campo} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                {r.orden.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-400">Sin talles cargados</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.orden.map(([talle, count]) => (
                      <span
                        key={talle}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-700"
                      >
                        {talle} × {count}
                      </span>
                    ))}
                  </div>
                )}
                {r.sinTalle > 0 && (
                  <p className="mt-1.5 text-xs text-amber-600">{r.sinTalle} sin cargar</p>
                )}
              </div>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Buscar por nombre o legajo…"
              value={searchTalles}
              onChange={(e) => setSearchTalles(e.target.value)}
              className="w-72 rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">
              {empleadosFiltrados.length} de {empleados.length} activos
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-700">Legajo</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Nombre</th>
                  <th className="px-3 py-2 font-medium text-slate-700">Sector</th>
                  {TALLE_CAMPOS.map((c) => (
                    <th key={c.campo} className="px-3 py-2 font-medium text-slate-700">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium text-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {empleadosFiltrados.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 tabular-nums">{e.legajo}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.nombre}</td>
                    <td className="px-3 py-2">{e.sector ?? "—"}</td>
                    {TALLE_CAMPOS.map((c) => (
                      <td key={c.campo} className="px-3 py-2 tabular-nums">
                        {e.talles?.[c.campo] ?? (
                          <span className="text-amber-500">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => abrirEditTalles(e)}
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
        </>
      )}

      {/* ───── Dialog nueva entrega ───── */}
      {openEntrega && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={submitEntrega}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="mb-3 text-lg font-bold text-slate-900">Nueva entrega</h2>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Empleado <span className="text-red-500">*</span>
                </span>
                <select
                  required
                  value={empleadoId}
                  onChange={(e) => cambiarEmpleado(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="">— elegir —</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.legajo} · {e.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Fecha de entrega <span className="text-red-500">*</span>
                </span>
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">Ítems</p>
              <div className="mt-2 space-y-2">
                {items.map((it, idx) => {
                  const def = EPP_TIPOS_ITEM.find((t) => t.value === it.tipo_item)
                  return (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <select
                        value={it.tipo_item}
                        onChange={(e) => cambiarTipo(idx, e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">— ítem —</option>
                        {EPP_TIPOS_ITEM.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Talle"
                        value={it.talle}
                        onChange={(e) => setItem(idx, { talle: e.target.value })}
                        disabled={!!def && !def.llevaTalle}
                        className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                      />
                      <input
                        type="number"
                        min={1}
                        value={it.cantidad}
                        onChange={(e) => setItem(idx, { cantidad: e.target.value })}
                        className="w-16 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Detalle (opcional)"
                        value={it.descripcion}
                        onChange={(e) => setItem(idx, { descripcion: e.target.value })}
                        className="min-w-32 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-sm text-red-500 hover:text-red-700"
                          aria-label="Quitar ítem"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                + Agregar ítem
              </button>
              {empleadoSel && (
                <p className="mt-1 text-xs text-slate-500">
                  Los talles se prellenan con los que cargó {empleadoSel.nombre}; se pueden pisar.
                </p>
              )}
            </div>

            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-700">Observaciones</span>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenEntrega(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Registrar entrega"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ───── Dialog resolver reclamo ───── */}
      {resolverId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={submitResolucion}
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="text-lg font-bold text-slate-900">Resolver reclamo</h2>
            {(() => {
              const ent = entregas.find((e) => e.id === resolverId)
              return ent?.reclamo_motivo ? (
                <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                  {ent.empleado_nombre}: {ent.reclamo_motivo}
                </p>
              ) : null
            })()}
            <textarea
              required
              value={resolucion}
              onChange={(e) => setResolucion(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ej: se cambió el pantalón por talle 48, entregado el 10/8"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolverId(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Marcar resuelto"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ───── Dialog editar talles ───── */}
      {editTallesId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={submitTalles}
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="text-lg font-bold text-slate-900">
              Talles de {empleadoEdit?.nombre ?? "empleado"}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TALLE_CAMPOS.map((c) => (
                <label key={c.campo} className="block text-sm">
                  <span className="font-medium text-slate-700">{c.label}</span>
                  <select
                    value={tallesForm[c.campo]}
                    onChange={(e) => setTallesForm({ ...tallesForm, [c.campo]: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
                  >
                    <option value="">—</option>
                    {c.opciones.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTallesId(null)}
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
