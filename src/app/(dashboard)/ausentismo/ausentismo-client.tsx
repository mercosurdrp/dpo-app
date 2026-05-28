"use client"

import Link from "next/link"
import { useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  AUSENTISMO_MOTIVOS,
  AUSENTISMO_MOTIVO_COLORS,
  AUSENTISMO_MOTIVO_LABELS,
  type AusentismoEmpleadoOpcion,
  type AusentismoEventoConEmpleado,
  type AusentismoMotivo,
  type AusentismoResumenMes,
} from "@/types/database"
import {
  crearEvento,
  editarEvento,
  eliminarEvento,
  getArchivoUrl,
  listarEventos,
  resumenMes,
} from "@/actions/ausentismo"

const BUCKET = "ausentismo"
const MAX_FILE_BYTES = 25 * 1024 * 1024

interface Props {
  empleados: AusentismoEmpleadoOpcion[]
  eventosIniciales: AusentismoEventoConEmpleado[]
  resumenInicial: AusentismoResumenMes | null
  yearMonthInicial: string
}

function addDaysISO(dateStr: string, days: number): string {
  if (!dateStr || !Number.isFinite(days) || days < 1) return ""
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days - 1)
  return dt.toISOString().slice(0, 10)
}

function fmt(num: number): string {
  return num.toLocaleString("es-AR")
}

function sanitize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
}

export function AusentismoClient({
  empleados,
  eventosIniciales,
  resumenInicial,
  yearMonthInicial,
}: Props) {
  const [eventos, setEventos] = useState(eventosIniciales)
  const [resumen, setResumen] = useState(resumenInicial)
  const [yearMonth, setYearMonth] = useState(yearMonthInicial)

  const [filtroMotivo, setFiltroMotivo] = useState<AusentismoMotivo | "">("")
  const [filtroEmpleado, setFiltroEmpleado] = useState<string>("")
  const [filtroDesde, setFiltroDesde] = useState<string>("")
  const [filtroHasta, setFiltroHasta] = useState<string>("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editando, setEditando] = useState<AusentismoEventoConEmpleado | null>(null)

  const [pending, startTransition] = useTransition()

  async function recargar() {
    const filtros = {
      motivo: filtroMotivo || undefined,
      empleado_id: filtroEmpleado || undefined,
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
    }
    const [evRes, resRes] = await Promise.all([
      listarEventos(filtros),
      resumenMes(yearMonth),
    ])
    if ("data" in evRes) setEventos(evRes.data)
    if ("data" in resRes) setResumen(resRes.data)
  }

  function aplicarFiltros() {
    startTransition(async () => {
      await recargar()
    })
  }

  function nuevo() {
    setEditando(null)
    setDialogOpen(true)
  }

  function editar(e: AusentismoEventoConEmpleado) {
    setEditando(e)
    setDialogOpen(true)
  }

  function handleEliminar(e: AusentismoEventoConEmpleado) {
    if (
      !confirm(
        `¿Eliminar el evento de ${e.empleado_nombre} (${e.fecha_inicio}, ${e.dias}d)?`,
      )
    )
      return
    startTransition(async () => {
      const res = await eliminarEvento(e.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Evento eliminado")
      await recargar()
    })
  }

  async function handleVerArchivo(e: AusentismoEventoConEmpleado) {
    const res = await getArchivoUrl(e.id)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer")
  }

  function cambiarMes(delta: number) {
    const [y, m] = yearMonth.split("-").map((n) => parseInt(n, 10))
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1))
    const next = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`
    setYearMonth(next)
    startTransition(async () => {
      const r = await resumenMes(next)
      if ("data" in r) setResumen(r.data)
    })
  }

  const topMotivo = useMemo(() => {
    if (!resumen) return null
    let best: { motivo: AusentismoMotivo; dias: number } | null = null
    for (const m of resumen.por_motivo) {
      if (!best || m.dias_totales > best.dias) {
        best = { motivo: m.motivo, dias: m.dias_totales }
      }
    }
    return best && best.dias > 0 ? best : null
  }, [resumen])

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ausentismo</h1>
          <p className="text-sm text-slate-500">
            Registro línea por línea de eventos de ausentismo del personal.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/ausentismo/reportes"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reportes
          </Link>
          <button
            type="button"
            onClick={nuevo}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Nuevo evento
          </button>
        </div>
      </div>

      {/* Selector de mes para resumen */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => cambiarMes(-1)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
        >
          ◀
        </button>
        <span className="font-medium text-slate-900">Resumen del mes: {yearMonth}</span>
        <button
          type="button"
          onClick={() => cambiarMes(1)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
        >
          ▶
        </button>
      </div>

      {/* Tarjetas resumen */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ResumenCard
          label="Eventos del mes"
          value={resumen?.eventos_total ?? 0}
        />
        <ResumenCard
          label="Días totales del mes"
          value={resumen?.dias_total ?? 0}
        />
        <ResumenCard
          label="Top motivo"
          value={
            topMotivo
              ? `${AUSENTISMO_MOTIVO_LABELS[topMotivo.motivo]} (${topMotivo.dias}d)`
              : "—"
          }
          accent={topMotivo ? AUSENTISMO_MOTIVO_COLORS[topMotivo.motivo] : undefined}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        {AUSENTISMO_MOTIVOS.map((m) => {
          const r = resumen?.por_motivo.find((x) => x.motivo === m)
          return (
            <div
              key={m}
              className="rounded-lg border border-slate-200 bg-white p-3"
              style={{ borderLeftColor: AUSENTISMO_MOTIVO_COLORS[m], borderLeftWidth: 4 }}
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {AUSENTISMO_MOTIVO_LABELS[m]}
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {fmt(r?.dias_totales ?? 0)}
                <span className="ml-1 text-xs font-normal text-slate-500">días</span>
              </div>
              <div className="text-xs text-slate-500">
                {r?.eventos ?? 0} eventos
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-5">
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Motivo</label>
          <select
            value={filtroMotivo}
            onChange={(e) => setFiltroMotivo(e.target.value as AusentismoMotivo | "")}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            {AUSENTISMO_MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {AUSENTISMO_MOTIVO_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Empleado</label>
          <select
            value={filtroEmpleado}
            onChange={(e) => setFiltroEmpleado(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                #{e.legajo} {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Desde</label>
          <input
            type="date"
            value={filtroDesde}
            onChange={(e) => setFiltroDesde(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Hasta</label>
          <input
            type="date"
            value={filtroHasta}
            onChange={(e) => setFiltroHasta(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={aplicarFiltros}
            disabled={pending}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => {
              setFiltroMotivo("")
              setFiltroEmpleado("")
              setFiltroDesde("")
              setFiltroHasta("")
              startTransition(async () => {
                const evRes = await listarEventos()
                if ("data" in evRes) setEventos(evRes.data)
              })
            }}
            disabled={pending}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-slate-700">Empleado</th>
              <th className="px-3 py-2 font-medium text-slate-700">Sector</th>
              <th className="px-3 py-2 font-medium text-slate-700">Motivo</th>
              <th className="px-3 py-2 font-medium text-slate-700">Inicio</th>
              <th className="px-3 py-2 font-medium text-slate-700">Días</th>
              <th className="px-3 py-2 font-medium text-slate-700">Fin</th>
              <th className="px-3 py-2 font-medium text-slate-700">Comentario</th>
              <th className="px-3 py-2 font-medium text-slate-700">Archivo</th>
              <th className="px-3 py-2 font-medium text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {eventos.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  Sin eventos cargados.
                </td>
              </tr>
            )}
            {eventos.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {e.empleado_nombre}{" "}
                  <span className="text-xs text-slate-400">#{e.empleado_legajo}</span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {e.empleado_sector ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: AUSENTISMO_MOTIVO_COLORS[e.motivo] }}
                  >
                    {AUSENTISMO_MOTIVO_LABELS[e.motivo]}
                  </span>
                </td>
                <td className="px-3 py-2">{e.fecha_inicio}</td>
                <td className="px-3 py-2">{e.dias}</td>
                <td className="px-3 py-2">{e.fecha_fin}</td>
                <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600">
                  {e.comentario ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {e.archivo_path ? (
                    <button
                      type="button"
                      onClick={() => handleVerArchivo(e)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => editar(e)}
                      className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleEliminar(e)}
                      className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialogOpen && (
        <EventoDialog
          empleados={empleados}
          evento={editando}
          onClose={() => setDialogOpen(false)}
          onSaved={async () => {
            setDialogOpen(false)
            await recargar()
          }}
        />
      )}
    </div>
  )
}

function ResumenCard({
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

function EventoDialog({
  empleados,
  evento,
  onClose,
  onSaved,
}: {
  empleados: AusentismoEmpleadoOpcion[]
  evento: AusentismoEventoConEmpleado | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const isEdit = !!evento
  const [empleadoId, setEmpleadoId] = useState(evento?.empleado_id ?? "")
  const [fechaInicio, setFechaInicio] = useState(evento?.fecha_inicio ?? "")
  const [dias, setDias] = useState<number>(evento?.dias ?? 1)
  const [motivo, setMotivo] = useState<AusentismoMotivo>(evento?.motivo ?? "ausencia")
  const [comentario, setComentario] = useState(evento?.comentario ?? "")
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)

  const fechaFin = useMemo(
    () => addDaysISO(fechaInicio, dias),
    [fechaInicio, dias],
  )

  function handlePick(picked: FileList | null) {
    const f = picked?.[0]
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`"${f.name}" supera 25 MB`)
      return
    }
    setFile(f)
  }

  async function subirArchivoSiCorresponde(): Promise<{
    path: string
    name: string
    mime: string
    size: number
  } | null> {
    if (!file) return null
    const supabase = createClient()
    const safe = sanitize(file.name || "archivo")
    const path = `${empleadoId}/${crypto.randomUUID()}-${safe}`
    const mime = file.type || "application/octet-stream"
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: mime, upsert: false })
    if (error) throw new Error(`Subiendo archivo: ${error.message}`)
    return { path, name: file.name, mime, size: file.size }
  }

  async function handleSubmit() {
    if (!empleadoId) {
      toast.error("Seleccioná el empleado")
      return
    }
    if (!fechaInicio) {
      toast.error("Seleccioná la fecha de inicio")
      return
    }
    if (!Number.isFinite(dias) || dias < 1) {
      toast.error("Días debe ser ≥ 1")
      return
    }
    setSubmitting(true)
    try {
      const uploaded = await subirArchivoSiCorresponde()
      if (isEdit && evento) {
        const res = await editarEvento({
          id: evento.id,
          empleado_id: empleadoId,
          fecha_inicio: fechaInicio,
          dias,
          motivo,
          comentario: comentario || null,
          ...(uploaded
            ? {
                archivo_path: uploaded.path,
                archivo_nombre: uploaded.name,
                archivo_mime: uploaded.mime,
                archivo_size: uploaded.size,
                archivo_path_a_borrar: evento.archivo_path ?? null,
              }
            : {}),
        })
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        toast.success("Evento actualizado")
      } else {
        const res = await crearEvento({
          empleado_id: empleadoId,
          fecha_inicio: fechaInicio,
          dias,
          motivo,
          comentario: comentario || null,
          archivo_path: uploaded?.path ?? null,
          archivo_nombre: uploaded?.name ?? null,
          archivo_mime: uploaded?.mime ?? null,
          archivo_size: uploaded?.size ?? null,
        })
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        toast.success("Evento creado")
      }
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? "Editar evento" : "Nuevo evento de ausentismo"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="grid gap-3 p-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700">Empleado *</label>
            <select
              value={empleadoId}
              onChange={(e) => setEmpleadoId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            >
              <option value="">— Seleccionar —</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  #{e.legajo} {e.nombre}
                  {e.sector ? ` · ${e.sector}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">Fecha inicio *</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Días *</label>
              <input
                type="number"
                min={1}
                max={365}
                value={dias}
                onChange={(e) => setDias(parseInt(e.target.value || "0", 10))}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Fin (auto)</label>
              <input
                type="text"
                value={fechaFin || "—"}
                readOnly
                className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Motivo *</label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as AusentismoMotivo)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            >
              {AUSENTISMO_MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {AUSENTISMO_MOTIVO_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Comentario del motivo
            </label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              placeholder="Detalle del motivo, observaciones, etc."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Archivo (opcional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => handlePick(e.target.files)}
              className="mt-1 w-full text-xs"
            />
            {file && (
              <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                <span>
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                  className="text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            )}
            {isEdit && evento?.archivo_nombre && !file && (
              <div className="mt-1 text-xs text-slate-500">
                Archivo actual: {evento.archivo_nombre}. Subí uno nuevo para reemplazarlo.
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear evento"}
          </button>
        </div>
      </div>
    </div>
  )
}
