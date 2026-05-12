"use client"

import type { MiOrdenDelDia } from "@/types/database"
import type { MisSobrecargasResumen } from "@/actions/sobrecargas"

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
  sobrecargas,
}: {
  data: MiOrdenDelDia
  fecha: string
  sobrecargas?: MisSobrecargasResumen | null
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

      {sobrecargas && <MisSobrecargasBloque resumen={sobrecargas} />}
    </div>
  )
}

function MisSobrecargasBloque({ resumen }: { resumen: MisSobrecargasResumen }) {
  const { mesActual, mesAnterior, detalleMesActual } = resumen
  const totalActual = mesActual.sobrecargas + mesActual.medias
  if (totalActual === 0 && mesAnterior.sobrecargas + mesAnterior.medias === 0) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Mis sobrecargas</p>
        <p className="mt-2 text-sm text-slate-600">
          Todavía no tenés sobrecargas registradas este mes ni el anterior.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">Mis sobrecargas</p>
        <p className="text-sm text-slate-700">
          Acumulado de tus sobrecargas y medias (1/4 cuenta como 0.5) sumando salidas como chofer y como ayudante.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MesBlock
          label={nombreMes(mesActual.mes)}
          highlight
          sobrecargas={mesActual.sobrecargas}
          medias={mesActual.medias}
          dias={mesActual.dias}
        />
        <MesBlock
          label={nombreMes(mesAnterior.mes)}
          sobrecargas={mesAnterior.sobrecargas}
          medias={mesAnterior.medias}
          dias={mesAnterior.dias}
        />
      </div>

      {detalleMesActual.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">
            Ver detalle del mes ({detalleMesActual.length} {detalleMesActual.length === 1 ? "día" : "días"})
          </summary>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/60 text-sm">
            {detalleMesActual.map((d, i) => (
              <li key={`${d.fecha}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <span className="font-medium text-slate-900">{formatearFechaCorta(d.fecha)}</span>
                  <span className="ml-2 text-xs uppercase text-slate-500">{d.rol}</span>
                  {d.patente && (
                    <span className="ml-2 font-mono text-xs text-slate-600">{d.patente}</span>
                  )}
                </div>
                <div className="flex gap-3 tabular-nums text-xs">
                  {d.sobrecargas > 0 && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
                      {fmtNum(d.sobrecargas)} sobrec.
                    </span>
                  )}
                  {d.medias > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                      {fmtNum(d.medias)} medias
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function MesBlock({
  label,
  highlight,
  sobrecargas,
  medias,
  dias,
}: {
  label: string
  highlight?: boolean
  sobrecargas: number
  medias: number
  dias: number
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{fmtNum(sobrecargas)}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">sobrecargas</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{fmtNum(medias)}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">medias</p>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        En {dias} {dias === 1 ? "día" : "días"}
      </p>
    </div>
  )
}

function nombreMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function formatearFechaCorta(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "")
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
