"use client"

/*
 * DIRECCIÓN — Home "Camino del semestre" (seed d7753ef2, candidato 6/7, modo operate)
 *
 * THESIS: la home cuenta dónde está la operación en la ruta H1 → meta H2 (0.73);
 * refusa el grid de KPI-cards + radar que esta categoría siempre embarca.
 * OWN-WORLD: sala de control nocturna — chrome navy (#0a1628→#132040), cards
 * blancas con sombra real, color saturado solo con significado (pilar/estado),
 * números tabulares, Geist.
 * STORY: el que entra ve en 3 segundos el score de hoy, cuánto falta para la
 * meta, qué pilar lo está frenando y cuál es la palanca (devolución H1) — y
 * hace click en el carril del pilar débil.
 * FIRST VIEWPORT: hero con score gigante + ruta H1→hoy→meta como pista con
 * hitos; debajo asoman los carriles de pilares ordenados por urgencia.
 * FORM: camino/ruta con carriles; estructura 6 de mi lista ordenada, staging
 * propio (sin challenger); un solo momento de motion: la ruta se llena al montar.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  Flag,
  ListTodo,
  Presentation,
  Truck,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PilarLane {
  pilarId: string
  pilarNombre: string
  color: string
  score: number
  meta: number
  mandatoryScore: number
  answered: number
  total: number
}

interface HomeData {
  empresa: string
  overallScore: number
  metaGlobal: number
  h1Score: number | null
  h1Nombre: string | null
  pendingActions: number
  lanes: PilarLane[]
  devolucion: { total: number; resueltas: number } | null
}

const fmt = (n: number) => n.toFixed(2).replace(".", ",")

const ACCESOS = [
  { label: "Auditorías", href: "/auditorias", icon: ClipboardCheck },
  { label: "Reuniones", href: "/reuniones", icon: Presentation },
  { label: "Indicadores", href: "/indicadores", icon: BarChart3 },
  { label: "Vehículos", href: "/vehiculos", icon: Truck },
]

export function HomeClient({ data }: { data: HomeData }) {
  const {
    empresa,
    overallScore,
    metaGlobal,
    h1Score,
    h1Nombre,
    pendingActions,
    lanes,
    devolucion,
  } = data

  // Único momento de motion de la página: la ruta se llena al montar.
  const [montada, setMontada] = useState(false)
  useEffect(() => setMontada(true), [])

  const pctRuta = Math.min((overallScore / metaGlobal) * 100, 100)
  const pctH1 = h1Score !== null ? Math.min((h1Score / metaGlobal) * 100, 100) : null
  const delta = h1Score !== null ? overallScore - h1Score : null
  const falta = Math.max(metaGlobal - overallScore, 0)

  const ordenados = useMemo(
    () => [...lanes].sort((a, b) => a.score - b.score),
    [lanes]
  )
  const pctDevolucion = devolucion && devolucion.total > 0
    ? Math.round((devolucion.resueltas / devolucion.total) * 100)
    : null

  return (
    <div className="space-y-6">
      {/* ===== HERO: camino a la meta ===== */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200/60">
            DPO · {empresa}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200/60">
            Semestre {new Date().getMonth() < 6 ? "H1" : "H2"} {new Date().getFullYear()}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-6xl font-bold leading-none tracking-tight text-white tabular-nums">
              {fmt(overallScore)}
            </p>
            <p className="mt-2 text-[15px] text-blue-200/80">
              score DPO hoy
              {delta !== null && delta !== 0 && (
                <span
                  className={cn(
                    "ml-2 font-semibold tabular-nums",
                    delta > 0 ? "text-emerald-300" : "text-red-300"
                  )}
                >
                  {delta > 0 ? "+" : ""}
                  {fmt(delta)} vs H1
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-2xl font-bold tabular-nums text-white">
              <Flag className="size-5 text-emerald-300" />
              {fmt(metaGlobal)}
            </p>
            <p className="mt-1 text-sm text-blue-200/80">
              meta del semestre — faltan{" "}
              <span className="font-semibold text-white tabular-nums">{fmt(falta)}</span>
            </p>
          </div>
        </div>

        {/* La ruta: H1 → hoy → meta */}
        <div className="mt-5">
          <div className="relative h-3 overflow-visible rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-1000 ease-out"
              style={{ width: montada ? `${pctRuta}%` : "0%" }}
            />
            {/* hito H1 */}
            {pctH1 !== null && (
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-navy bg-blue-200"
                style={{ left: `${pctH1}%` }}
                title={h1Nombre ? `${h1Nombre}: ${fmt(h1Score!)}` : undefined}
              />
            )}
            {/* hoy */}
            <span
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-emerald-400 shadow-lg shadow-emerald-400/40 transition-all duration-1000 ease-out"
              style={{ left: montada ? `${pctRuta}%` : "0%" }}
            />
          </div>
          <div className="mt-2.5 flex justify-between text-xs text-blue-200/60">
            <span>
              {h1Nombre ?? "Auditoría H1"}
              {h1Score !== null && (
                <span className="ml-1 font-semibold text-blue-100 tabular-nums">{fmt(h1Score)}</span>
              )}
            </span>
            <span>
              Meta <span className="ml-1 font-semibold text-blue-100 tabular-nums">{fmt(metaGlobal)}</span>
            </span>
          </div>
        </div>

        {/* Palancas del semestre */}
        <div className="mt-4 flex flex-wrap gap-2.5">
          {pendingActions > 0 && (
            <Link
              href="/acciones"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ListTodo className="size-4 text-amber-300" />
              {pendingActions} {pendingActions === 1 ? "acción pendiente" : "acciones pendientes"}
            </Link>
          )}
          {devolucion && pctDevolucion !== null && (
            <Link
              href="/devolucion"
              className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span>
                Devolución H1: {devolucion.resueltas}/{devolucion.total} tareas
              </span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-emerald-400"
                  style={{ width: `${pctDevolucion}%` }}
                />
              </span>
              <span className="tabular-nums text-emerald-300">{pctDevolucion}%</span>
            </Link>
          )}
        </div>
      </section>

      {/* ===== CARRILES DE PILARES (ordenados por urgencia) ===== */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/20">
        <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Pilares</h2>
          <p className="text-xs text-slate-500">ordenados por urgencia — el más flojo arriba</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {ordenados.map((p) => {
            const pctPilar = Math.min((p.score / p.meta) * 100, 100)
            const gapPilar = Math.max(p.meta - p.score, 0)
            const mandCritica = p.mandatoryScore < 0.6
            return (
              <li key={p.pilarId}>
                <Link
                  href={`/pilares/${p.pilarId}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                >
                  <span
                    className="h-9 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-slate-900">{p.pilarNombre}</p>
                      {mandCritica && (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                          <AlertTriangle className="size-3" />
                          mandatorias
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${pctPilar}%`, backgroundColor: p.color }}
                        />
                      </span>
                      <span className="whitespace-nowrap text-xs text-slate-500 tabular-nums">
                        faltan {fmt(gapPilar)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xl font-bold text-slate-900 tabular-nums">{fmt(p.score)}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums">meta {fmt(p.meta)}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
                </Link>
              </li>
            )
          })}
          {ordenados.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-slate-500">
              Sin auditoría activa: creá una en{" "}
              <Link href="/auditorias" className="font-semibold text-blue-600 hover:underline">
                Auditorías
              </Link>{" "}
              para ver los pilares acá.
            </li>
          )}
        </ul>
      </section>

      {/* ===== ACCESOS RÁPIDOS ===== */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ACCESOS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 transition-colors hover:bg-white/10"
          >
            <a.icon className="size-5 shrink-0 text-blue-200/70 transition-colors group-hover:text-white" />
            <span className="text-sm font-semibold text-blue-100 transition-colors group-hover:text-white">
              {a.label}
            </span>
            <ArrowRight className="ml-auto size-4 shrink-0 text-blue-200/40 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
          </Link>
        ))}
      </section>
    </div>
  )
}
