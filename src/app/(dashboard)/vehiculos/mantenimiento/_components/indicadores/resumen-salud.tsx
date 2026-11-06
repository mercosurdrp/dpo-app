"use client"

// Arriba de todo, la respuesta a "¿cómo estamos?" en dos lecturas:
//  - la salud del tablero entero (cuántos en meta, cerca, fuera, sin juzgar),
//    los mandatorios DPO y la deuda de planes;
//  - la lista corta de lo que necesita atención, que lleva a la tarjeta.

import { useEffect, useState } from "react"
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react"
import type { FlotaPlanConItems } from "@/actions/flota-indicadores"
import { cn } from "@/lib/utils"
import type { EstadoKpi } from "./estado-kpi"
import { diasDelMes, fmtMesNombre } from "./formato"
import { ESTADO_UI } from "./semaforo"
import type { KpiVista, MesFoco } from "./vistas"

const SEGMENTOS: { estado: EstadoKpi; label: string }[] = [
  { estado: "ok", label: "en meta" },
  { estado: "alerta", label: "cerca" },
  { estado: "critico", label: "fuera de meta" },
  { estado: "neutro", label: "sin juzgar" },
]

export interface MesSinPlan {
  vista: KpiVista
  ym: string
  valor: number | null
}

/** Meses juzgados fuera de meta o cerca que no tienen plan de acción. */
export function mesesSinPlan(vistas: KpiVista[]): MesSinPlan[] {
  const out: MesSinPlan[] = []
  for (const v of vistas) {
    const puntos = v.serie.length > 0 ? v.serie : [v.punto]
    for (const p of puntos) {
      if ((p.estado === "critico" || p.estado === "alerta") && !p.plan)
        out.push({ vista: v, ym: p.ym, valor: p.valor })
    }
  }
  return out
}

export function accionesVencidas(planes: FlotaPlanConItems[], hoy: string) {
  let n = 0
  for (const p of planes) {
    if (p.estado === "cerrado") continue
    for (const it of p.items)
      if (it.estado !== "completado" && it.fecha_compromiso.slice(0, 10) < hoy) n++
  }
  return n
}

export function ResumenSalud({
  vistas,
  planes,
  hoy,
  mesActual,
  foco,
  onIrA,
  onIrPlanes,
}: {
  vistas: KpiVista[]
  planes: FlotaPlanConItems[]
  hoy: string
  mesActual: string
  foco: MesFoco
  onIrA: (kpi: string) => void
  onIrPlanes: () => void
}) {
  // La barra crece una sola vez al montar: el único movimiento de la pantalla.
  const [montado, setMontado] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMontado(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const cuenta: Record<EstadoKpi, number> = { ok: 0, alerta: 0, critico: 0, neutro: 0 }
  for (const v of vistas) cuenta[v.punto.estado]++
  const total = vistas.length

  const mand = vistas.filter((v) => v.mandatorio)
  const mandOk = mand.filter((v) => v.punto.estado === "ok").length
  const abiertos = planes.filter((p) => p.estado !== "cerrado").length
  const vencidas = accionesVencidas(planes, hoy)
  const sinPlan = mesesSinPlan(vistas).length

  const atencion = [
    ...vistas.filter((v) => v.punto.estado === "critico"),
    ...vistas.filter((v) => v.punto.estado === "alerta"),
  ]

  const dia = Number(hoy.slice(8, 10))
  const subtitulo =
    foco === "auto"
      ? `${fmtMesNombre(mesActual)}, día ${dia} de ${diasDelMes(mesActual)} · los acumulativos, con el último mes cerrado`
      : `Todos los indicadores en ${fmtMesNombre(foco)} ${foco.slice(0, 4)}${foco === mesActual ? " (en curso)" : ""}`

  return (
    <section
      aria-labelledby="salud-t"
      className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
    >
      <div className="space-y-5 p-5">
        <div>
          <h2 id="salud-t" className="text-lg font-semibold tracking-tight text-foreground">
            Salud del tablero
          </h2>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{subtitulo}</p>
        </div>

        <div className="space-y-2.5">
          <div
            className="flex h-7 w-full gap-1 overflow-hidden rounded-lg"
            role="img"
            aria-label={SEGMENTOS.map((s) => `${cuenta[s.estado]} ${s.label}`).join(", ")}
          >
            {SEGMENTOS.filter((s) => cuenta[s.estado] > 0).map((s) => (
              <div
                key={s.estado}
                className={cn(
                  "flex h-full items-center justify-center text-xs font-semibold tabular-nums transition-[width] duration-700 ease-out motion-reduce:transition-none",
                  ESTADO_UI[s.estado].bg,
                  s.estado === "neutro" ? "text-slate-700 dark:text-slate-100" : "text-white"
                )}
                style={{ width: montado ? `${(cuenta[s.estado] / total) * 100}%` : "0%" }}
              >
                {cuenta[s.estado] / total > 0.06 ? cuenta[s.estado] : ""}
              </div>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {SEGMENTOS.map((s) => (
              <li key={s.estado} className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden className={cn("size-2.5 rounded-full", ESTADO_UI[s.estado].bg)} />
                <span className="font-semibold tabular-nums text-foreground">{cuenta[s.estado]}</span>
                {s.label}
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/60 px-3 py-2.5">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden /> Mandatorios DPO
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              <span
                className={cn(
                  "text-xl font-semibold tabular-nums",
                  mandOk < mand.length ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {mandOk}
              </span>{" "}
              de {mand.length} en meta
            </dd>
          </div>
          <div className="rounded-xl bg-muted/60 px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">Planes de acción</dt>
            <dd className="mt-0.5 text-sm text-foreground">
              <span className="text-xl font-semibold tabular-nums">{abiertos}</span>{" "}
              {abiertos === 1 ? "abierto" : "abiertos"}
              {vencidas > 0 && (
                <span className="block text-xs font-semibold text-red-600 dark:text-red-400">
                  {vencidas} {vencidas === 1 ? "acción vencida" : "acciones vencidas"}
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-xl bg-muted/60 px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">Meses sin plan</dt>
            <dd className="mt-0.5 text-sm text-foreground">
              <span
                className={cn(
                  "text-xl font-semibold tabular-nums",
                  sinPlan > 0 && "text-amber-700 dark:text-amber-400"
                )}
              >
                {sinPlan}
              </span>{" "}
              fuera de meta
              {sinPlan > 0 && (
                <button
                  type="button"
                  onClick={onIrPlanes}
                  className="block text-xs font-medium text-primary hover:underline"
                >
                  Ver cuáles
                </button>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-border bg-muted/30 p-5 lg:border-t-0 lg:border-l">
        <h2 className="text-sm font-semibold text-foreground">
          Necesita atención
          {atencion.length > 0 && (
            <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
              ({atencion.length})
            </span>
          )}
        </h2>
        {atencion.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden />
            Ningún indicador fuera de meta.
          </p>
        ) : (
          <ul className="mt-2 max-h-80 space-y-0.5 overflow-y-auto">
            {atencion.map((v) => {
              const ui = ESTADO_UI[v.punto.estado]
              const Icon = ui.Icon
              return (
                <li key={v.def.kpi}>
                  <button
                    type="button"
                    onClick={() => onIrA(v.def.kpi)}
                    className="group flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Icon className={cn("size-4 shrink-0", ui.texto)} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-foreground">{v.def.label}</span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", ui.texto)}>
                      {v.punto.valor == null ? "—" : v.def.fmt(v.punto.valor)}
                    </span>
                    <span className="sr-only">, {ui.label}. Ir a la tarjeta.</span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
