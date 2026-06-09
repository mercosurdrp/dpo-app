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
  Target,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import type {
  PeriodoKey,
  RankingPatente,
  RechazosEmpleadoData,
} from "@/actions/rechazos-empleado"
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
function fmtPct(n: number): string {
  return `${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`
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

  // Escala de las barras de tasa: que la línea de meta quede visible (~mitad).
  const maxTasa = Math.max(data.meta * 2, ...data.ranking.map((r) => r.tasa), ...data.por_dia.map((d) => d.tasa))
  const escala = maxTasa > 0 ? maxTasa : data.meta * 2
  const metaPct = (data.meta / escala) * 100

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
          Objetivo y ranking de devoluciones · {data.label}
        </p>
      </div>

      {/* Banner de OBJETIVO */}
      <Card
        className={cn(
          "flex items-center gap-3 border-l-4 p-4",
          data.cumple_meta ? "border-l-emerald-500 bg-emerald-50/60" : "border-l-rose-500 bg-rose-50/60",
        )}
      >
        <Target className={cn("size-8 shrink-0", data.cumple_meta ? "text-emerald-600" : "text-rose-600")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700">
            Objetivo: máximo <span className="font-bold">{fmtPct(data.meta)}</span> de rechazo
          </p>
          <p className="flex items-center gap-1.5 text-sm">
            {data.cumple_meta ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="size-4 text-rose-600" />
            )}
            <span className="text-slate-600">
              Tasa del período:{" "}
              <span className={cn("font-bold", data.cumple_meta ? "text-emerald-700" : "text-rose-700")}>
                {fmtPct(data.tasa_global)}
              </span>{" "}
              {data.cumple_meta ? "— ¡dentro del objetivo!" : "— por encima del objetivo"}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-center">
          <div className={cn("text-3xl font-extrabold", data.cumple_meta ? "text-emerald-600" : "text-rose-600")}>
            {fmtPct(data.tasa_global)}
          </div>
        </div>
      </Card>

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
                active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100",
              )}
            >
              {p.label}
            </button>
          )
        })}
        {pending && <Loader2 className="size-4 animate-spin text-slate-400" />}
      </div>

      {/* Resumen secundario */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="flex flex-col gap-0.5 p-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rechazos</span>
          <span className="text-2xl font-bold text-slate-900">{fmt(data.total_eventos)}</span>
        </Card>
        <Card className="flex flex-col gap-0.5 p-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bultos</span>
          <span className="text-2xl font-bold text-slate-900">{fmt(data.total_bultos)}</span>
        </Card>
        <Card className="flex flex-col gap-0.5 p-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Exceden meta</span>
          <span className={cn("text-2xl font-bold", data.camiones_exceden > 0 ? "text-rose-600" : "text-emerald-600")}>
            {data.camiones_exceden}
          </span>
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
          {/* Ranking por chofer — del que MENOS rechaza al que más */}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Truck className="size-5 text-slate-500" />
              Ranking por chofer
            </h2>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              Del que menos rechaza (premio 🏆) al que más. La línea marca el objetivo de {fmtPct(data.meta)}.
            </p>
            {data.ranking.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Sin datos de entrega suficientes para calcular la tasa.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data.ranking.map((p, i) => (
                  <FilaRanking key={p.patente} p={p} pos={i} metaPct={metaPct} escala={escala} meta={data.meta} />
                ))}
              </ul>
            )}
          </Card>

          {/* Por día */}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <CalendarDays className="size-5 text-slate-500" />
              Tasa por día
            </h2>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              La línea marca el objetivo de {fmtPct(data.meta)}.
            </p>
            <ul className="space-y-2">
              {data.por_dia.map((d) => {
                const excede = d.tasa > data.meta
                return (
                  <li key={d.fecha} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs capitalize text-slate-600">{fechaCorta(d.fecha)}</span>
                    <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className={cn("h-full rounded", excede ? "bg-rose-500" : "bg-emerald-500")}
                        style={{ width: `${Math.min(100, Math.max(3, (d.tasa / escala) * 100))}%` }}
                      />
                      <div className="absolute inset-y-0 w-0.5 bg-slate-700/70" style={{ left: `${metaPct}%` }} />
                    </div>
                    <span className={cn("w-12 shrink-0 text-right text-xs font-semibold tabular-nums", excede ? "text-rose-600" : "text-emerald-700")}>
                      {fmtPct(d.tasa)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>

          {/* Camiones sin dato de entrega (no rankeables) */}
          {data.sin_dato.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <AlertTriangle className="size-4 text-amber-500" />
                Sin dato de entrega ({data.sin_dato.length})
              </h2>
              <p className="mb-2 text-xs text-muted-foreground">
                Tienen rechazos pero falta el dato de lo entregado, no se les calcula tasa.
              </p>
              <ul className="flex flex-wrap gap-2">
                {data.sin_dato.map((p) => (
                  <li key={p.patente} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                    {p.display} · {fmt(p.bultos)} blt
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Motivos */}
          {data.por_motivo.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
                <ListChecks className="size-5 text-slate-500" />
                Motivos más comunes
              </h2>
              <ul className="space-y-1.5">
                {data.por_motivo.slice(0, 8).map((m) => (
                  <li key={m.ds_rechazo} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
                    <span className="truncate text-sm text-slate-700">{m.ds_rechazo}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{m.eventos}</span>
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

function FilaRanking({
  p,
  pos,
  metaPct,
  escala,
  meta,
}: {
  p: RankingPatente
  pos: number
  metaPct: number
  escala: number
  meta: number
}) {
  const esMejor = pos === 0
  return (
    <li className={cn("rounded-lg p-2", esMejor && "bg-amber-50 ring-1 ring-amber-200")}>
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-500">
          {pos < 3 ? MEDALLAS[pos] : pos + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-medium text-slate-800">{p.display}</span>
              {esMejor && <span className="shrink-0 text-xs font-semibold text-amber-600">🏆 Mejor</span>}
            </span>
            <span className="shrink-0 text-sm font-bold tabular-nums">
              <span className={p.excede ? "text-rose-600" : "text-emerald-700"}>{fmtPct(p.tasa)}</span>
            </span>
          </div>
          <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn("h-full rounded-full", p.excede ? "bg-rose-500" : "bg-emerald-500")}
              style={{ width: `${Math.min(100, Math.max(3, (p.tasa / escala) * 100))}%` }}
            />
            {/* Línea de objetivo */}
            <div className="absolute inset-y-0 w-0.5 bg-slate-700/70" style={{ left: `${metaPct}%` }} />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{p.eventos} rech. · {fmt(p.bultos)} blt</span>
            {p.excede ? (
              <span className="font-medium text-rose-600">⚠ excede el {fmtPct(meta)}</span>
            ) : (
              <span className="text-emerald-600">✓ dentro del objetivo</span>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
