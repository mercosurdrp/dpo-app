"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Truck, Calendar, Package, Clock, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"

export interface CargaRow {
  fecha: string // YYYY-MM-DD (fecha de despacho/carga)
  hora: string // HH:mm:ss (fin de carga)
  viaje: number
  nro_ext: string
  patente: string
  flota: string
  maquinista: string
  pallets: number
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' sin pasar por new Date (evita corrimiento UTC).
const fechaCorta = (f: string) => {
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y}`
}
const hhmm = (h: string) => (h ? h.slice(0, 5) : "—")

export function CargaCamionesClient({
  filas,
  generadoEn,
  error,
}: {
  filas: CargaRow[]
  generadoEn: string | null
  error: string | null
}) {
  // Fechas con datos, más reciente primero.
  const fechas = useMemo(
    () =>
      Array.from(new Set(filas.map((f) => f.fecha))).sort((a, b) =>
        a < b ? 1 : -1,
      ),
    [filas],
  )

  const [fecha, setFecha] = useState<string>(fechas[0] ?? "")

  const delDia = useMemo(
    () =>
      filas
        .filter((f) => f.fecha === fecha)
        .sort((a, b) => (a.hora < b.hora ? -1 : 1)),
    [filas, fecha],
  )

  const totalPallets = delDia.reduce((s, f) => s + (f.pallets || 0), 0)
  const sinPatente = delDia.filter((f) => !f.patente).length

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Truck className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Carga de camiones
          </h1>
          <p className="text-sm text-slate-500">
            Evidencia diaria de los viajes cargados: hora de carga, quién cargó,
            pallets, patente y N° de viaje.
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Selector de día + resumen */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Calendar className="size-3.5" />
            Día de carga
          </label>
          <Input
            type="date"
            value={fecha}
            max={fechas[0] ?? undefined}
            min={fechas[fechas.length - 1] ?? undefined}
            onChange={(e) => setFecha(e.target.value)}
            className="w-[11rem]"
          />
        </div>
        <div className="flex gap-3">
          <Stat label="Camiones cargados" value={String(delDia.length)} icon={<Truck className="size-4" />} />
          <Stat label="Pallets" value={String(totalPallets)} icon={<Package className="size-4" />} highlight />
        </div>
      </div>

      {/* Tabla del día */}
      {delDia.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          {fecha
            ? `No hay viajes cargados el ${fechaCorta(fecha)}.`
            : "No hay datos de carga disponibles."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">
                  <Clock className="mr-1 inline size-3.5" />
                  Hora de carga
                </th>
                <th className="px-4 py-2.5 font-medium">N° Viaje</th>
                <th className="px-4 py-2.5 font-medium">Patente</th>
                <th className="px-4 py-2.5 font-medium">Flota</th>
                <th className="px-4 py-2.5 font-medium">Cargó</th>
                <th className="px-4 py-2.5 text-right font-medium">Pallets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {delDia.map((f) => (
                <tr key={f.viaje} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-900">
                    {hhmm(f.hora)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">
                    {f.viaje}
                    {f.nro_ext && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({f.nro_ext})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {f.patente ? (
                      <span className="font-medium tracking-wide text-slate-900">
                        {f.patente}
                      </span>
                    ) : (
                      <span className="text-xs italic text-amber-600">
                        pendiente de ruteo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {f.flota || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {f.maquinista || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {f.pallets || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          {sinPatente > 0 &&
            `${sinPatente} viaje(s) sin patente: el ruteo del día todavía no la asignó.`}
        </span>
        {generadoEn && (
          <span>
            Actualizado:{" "}
            {new Date(generadoEn).toLocaleString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon: ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-2 ${
        highlight ? "border-sky-200 bg-sky-50/70" : "border-slate-200 bg-white"
      }`}
    >
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  )
}
