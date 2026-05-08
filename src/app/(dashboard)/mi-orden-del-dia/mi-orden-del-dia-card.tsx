"use client"

import type { MiOrdenDelDia } from "@/types/database"

const MOTIVO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  deposito:   { label: "Depósito",   color: "text-blue-700",    bg: "bg-blue-100" },
  vacaciones: { label: "Vacaciones", color: "text-amber-700",   bg: "bg-amber-100" },
  licencia:   { label: "Licencia",   color: "text-rose-700",    bg: "bg-rose-100" },
  ausente:    { label: "Ausente",    color: "text-red-700",     bg: "bg-red-100" },
  suspendido: { label: "Suspendido", color: "text-fuchsia-700", bg: "bg-fuchsia-100" },
  franco:     { label: "Franco",     color: "text-slate-700",   bg: "bg-slate-200" },
  otro:       { label: "Otro",       color: "text-zinc-700",    bg: "bg-zinc-200" },
}

export function MiOrdenDelDiaCard({
  data,
  fecha,
}: {
  data: MiOrdenDelDia
  fecha: string
}) {
  const fechaTxt = formatearFechaLarga(fecha)
  const esManana = data.fecha !== new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {esManana ? "Mañana" : "Hoy"}
        </p>
        <h1 className="text-2xl font-bold text-slate-900">{fechaTxt}</h1>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {data.tipo === "asignacion" && (
          <>
            <p className="text-xs uppercase tracking-wide text-slate-500">Salís en</p>
            <p className="mt-1 font-mono text-3xl font-bold text-emerald-700">
              {data.camion_patente}
            </p>
            <p className="mt-2 text-base text-slate-700">
              Como <span className="font-semibold capitalize">{data.rol}</span>
              {data.zona ? (
                <>
                  {" · "}
                  <span className="text-slate-600">Zona: </span>
                  <span className="font-medium">{data.zona}</span>
                </>
              ) : null}
            </p>
            {data.observacion && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">
                {data.observacion}
              </p>
            )}
          </>
        )}

        {data.tipo === "no_sale" && (
          <>
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado del día</p>
            {(() => {
              const meta = MOTIVO_LABEL[data.motivo] ?? MOTIVO_LABEL.otro
              return (
                <span
                  className={`mt-2 inline-flex rounded-full px-4 py-1.5 text-base font-semibold ${meta.bg} ${meta.color}`}
                >
                  {meta.label}
                </span>
              )
            })()}
            {data.detalle && (
              <p className="mt-4 text-sm text-slate-700">{data.detalle}</p>
            )}
          </>
        )}

        {data.tipo === "sin_definir" && (
          <>
            <p className="text-xs uppercase tracking-wide text-slate-500">Sin asignación</p>
            <p className="mt-2 text-base text-slate-600">
              Todavía no se cargó tu orden del día. Consultá con tu supervisor.
            </p>
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Desde las 19:00 hs (ARG) verás la salida del día siguiente.
      </p>
    </div>
  )
}

function formatearFechaLarga(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}
