"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  Truck,
  PackageX,
  CalendarDays,
  Trophy,
  ListChecks,
  Loader2,
} from "lucide-react"
import type { PeriodoKey, RechazosEmpleadoData } from "@/actions/rechazos-empleado"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: "mes", label: "Este mes" },
  { key: "mes_pasado", label: "Mes pasado" },
  { key: "semana", label: "Últimos 7 días" },
]

const MEDALLAS = ["🥇", "🥈", "🥉"]

function fmt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)
}

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(d)
}

export function RechazosEmpleadoClient({ data }: { data: RechazosEmpleadoData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const cambiarPeriodo = (p: PeriodoKey) => {
    startTransition(() => router.push(`/rechazos?periodo=${p}`))
  }

  const maxBultosPat = Math.max(1, ...data.por_patente.map((p) => p.bultos))
  const maxEventosDia = Math.max(1, ...data.por_dia.map((d) => d.eventos))
  const vacio = data.total_eventos === 0

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <PackageX className="size-6 text-rose-600" />
          Rechazos
        </h1>
        <p className="text-sm text-muted-foreground">
          Ranking de devoluciones de reparto · {data.label}
        </p>
      </div>

      {/* Selector de período */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => {
          const active = p.key === data.periodo
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => cambiarPeriodo(p.key)}
              disabled={pending}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                active
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100",
              )}
            >
              {p.label}
            </button>
          )
        })}
        {pending && <Loader2 className="size-4 animate-spin text-slate-400" />}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rechazos
          </span>
          <span className="text-3xl font-bold text-slate-900">{fmt(data.total_eventos)}</span>
          <span className="text-xs text-muted-foreground">devoluciones en el período</span>
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bultos
          </span>
          <span className="text-3xl font-bold text-slate-900">{fmt(data.total_bultos)}</span>
          <span className="text-xs text-muted-foreground">bultos rechazados</span>
        </Card>
      </div>

      {vacio ? (
        <Card className="p-8 text-center">
          <Trophy className="mx-auto size-10 text-emerald-500" />
          <p className="mt-2 text-base font-semibold text-slate-900">¡Sin rechazos en el período!</p>
          <p className="text-sm text-muted-foreground">No hay devoluciones cargadas para {data.label}.</p>
        </Card>
      ) : (
        <>
          {/* Ranking por chofer / patente */}
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              <Truck className="size-5 text-slate-500" />
              Ranking por chofer
            </h2>
            <ul className="space-y-2">
              {data.por_patente.map((p, i) => (
                <li key={p.patente} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-500">
                    {i < 3 ? MEDALLAS[i] : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{p.display}</span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-600">
                        {fmt(p.bultos)} blt · {p.eventos} rech.
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          i === 0 ? "bg-rose-500" : i === 1 ? "bg-orange-400" : i === 2 ? "bg-amber-400" : "bg-slate-300",
                        )}
                        style={{ width: `${Math.max(4, (p.bultos / maxBultosPat) * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Rechazos por día */}
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              <CalendarDays className="size-5 text-slate-500" />
              Rechazos por día
            </h2>
            <ul className="space-y-2">
              {data.por_dia.map((d) => (
                <li key={d.fecha} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs capitalize text-slate-600">{fechaCorta(d.fecha)}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="flex h-full items-center justify-end rounded bg-sky-500 px-2"
                      style={{ width: `${Math.max(8, (d.eventos / maxEventosDia) * 100)}%` }}
                    >
                      <span className="text-[11px] font-semibold text-white">{d.eventos}</span>
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {fmt(d.bultos)} blt
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Motivos más comunes */}
          {data.por_motivo.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
                <ListChecks className="size-5 text-slate-500" />
                Motivos más comunes
              </h2>
              <ul className="space-y-1.5">
                {data.por_motivo.slice(0, 8).map((m) => (
                  <li
                    key={m.ds_rechazo}
                    className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2"
                  >
                    <span className="truncate text-sm text-slate-700">{m.ds_rechazo}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                      {m.eventos}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
