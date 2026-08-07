"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { confirmarEntrega, guardarMisTalles, reclamarEntrega } from "@/actions/epp"
import { EPP_TIPO_LABELS, TALLE_CAMPOS, tallesCompletos, type TalleCampo } from "@/lib/epp"
import {
  ENTREGA_EPP_ESTADO_COLORS,
  ENTREGA_EPP_ESTADO_LABELS,
  type EmpleadoTalles,
  type EntregaEppConDetalle,
} from "@/types/database"

interface Props {
  talles: EmpleadoTalles | null
  entregas: EntregaEppConDetalle[]
}

function emptyTalles(t: EmpleadoTalles | null): Record<TalleCampo, string> {
  return {
    talle_pantalon: t?.talle_pantalon ?? "",
    talle_remera: t?.talle_remera ?? "",
    talle_campera: t?.talle_campera ?? "",
    talle_buzo: t?.talle_buzo ?? "",
    talle_botines: t?.talle_botines ?? "",
  }
}

export function MiRopaClient({ talles, entregas }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(emptyTalles(talles))
  const [reclamoId, setReclamoId] = useState<string | null>(null)
  const [reclamoMotivo, setReclamoMotivo] = useState("")
  const [pending, startTransition] = useTransition()

  const faltanTalles = !tallesCompletos(talles)
  const pendientes = entregas.filter((e) => e.estado === "pendiente").length

  function guardarTalles(ev: React.FormEvent) {
    ev.preventDefault()
    startTransition(async () => {
      const res = await guardarMisTalles(form)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Talles guardados")
        router.refresh()
      }
    })
  }

  function confirmar(id: string) {
    startTransition(async () => {
      const res = await confirmarEntrega(id)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Entrega confirmada. ¡Gracias!")
        router.refresh()
      }
    })
  }

  function enviarReclamo(ev: React.FormEvent) {
    ev.preventDefault()
    if (!reclamoId) return
    startTransition(async () => {
      const res = await reclamarEntrega(reclamoId, reclamoMotivo)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Reclamo enviado a RRHH")
        setReclamoId(null)
        setReclamoMotivo("")
        router.refresh()
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Mi ropa</h1>
      <p className="mt-1 text-sm text-slate-500">
        Cargá tus talles y confirmá las entregas de ropa y elementos de seguridad.
      </p>

      {/* ───── Mis talles ───── */}
      <form
        onSubmit={guardarTalles}
        className={`mt-5 rounded-lg border bg-white p-4 ${
          faltanTalles ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Mis talles</h2>
          {faltanTalles && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Completá tus talles
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          RRHH los usa para comprar y armar tu ropa de trabajo. Actualizalos si cambiaste de talle.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {TALLE_CAMPOS.map((c) => (
            <label key={c.campo} className="block text-sm">
              <span className="font-medium text-slate-700">{c.label}</span>
              <select
                value={form[c.campo]}
                onChange={(e) => setForm({ ...form, [c.campo]: e.target.value })}
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

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar talles"}
          </button>
        </div>
      </form>

      {/* ───── Mis entregas ───── */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Mis entregas</h2>
          {pendientes > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pendientes} por confirmar
            </span>
          )}
        </div>

        {entregas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            Todavía no tenés entregas registradas.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {entregas.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">Entrega #{e.numero}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${ENTREGA_EPP_ESTADO_COLORS[e.estado]}1A`,
                        color: ENTREGA_EPP_ESTADO_COLORS[e.estado],
                      }}
                    >
                      {ENTREGA_EPP_ESTADO_LABELS[e.estado]}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {new Date(`${e.fecha_entrega}T00:00:00`).toLocaleDateString("es-AR")}
                  </span>
                </div>

                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {e.items.map((i) => (
                    <li key={i.id}>
                      {i.cantidad} × {EPP_TIPO_LABELS[i.tipo_item] ?? i.tipo_item}
                      {i.talle && <span className="text-slate-500"> · talle {i.talle}</span>}
                      {i.descripcion && <span className="text-slate-500"> · {i.descripcion}</span>}
                    </li>
                  ))}
                </ul>

                {e.observaciones && (
                  <p className="mt-2 text-xs text-slate-500">{e.observaciones}</p>
                )}

                {e.estado === "reclamada" && e.reclamo_motivo && (
                  <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                    Tu reclamo: {e.reclamo_motivo}
                  </p>
                )}
                {e.estado === "resuelta" && (
                  <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {e.reclamo_motivo && (
                      <p className="text-slate-500">Tu reclamo: {e.reclamo_motivo}</p>
                    )}
                    <p className="mt-1">
                      <span className="font-medium">Respuesta de RRHH:</span> {e.resolucion}
                    </p>
                  </div>
                )}

                {e.estado === "pendiente" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirmar(e.id)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Recibí conforme
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setReclamoId(e.id)
                        setReclamoMotivo("")
                      }}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reclamar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ───── Dialog de reclamo ───── */}
      {reclamoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={enviarReclamo}
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
          >
            <h2 className="text-lg font-bold text-slate-900">Reclamar entrega</h2>
            <p className="mt-1 text-sm text-slate-500">
              Contanos qué salió mal (talle equivocado, faltó un ítem, vino dañado…).
            </p>
            <textarea
              required
              value={reclamoMotivo}
              onChange={(e) => setReclamoMotivo(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ej: el pantalón vino talle 44 y uso 48"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReclamoId(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "Enviando…" : "Enviar reclamo"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
