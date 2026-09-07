"use client"

import Link from "next/link"
import { BookOpen, ChevronRight } from "lucide-react"
import { CAMPUS_PILARES } from "@/lib/campus"
import type { CampusPilarResumen } from "@/types/database"

interface Props {
  resumen: CampusPilarResumen[]
  canEdit: boolean
}

function bajadaConteo(caps: number, mats: number): string {
  if (caps === 0) return "Sin material todavía"
  const c = caps === 1 ? "1 capacitación" : `${caps} capacitaciones`
  const m = mats === 1 ? "1 material" : `${mats} materiales`
  return `${c} · ${m}`
}

export function CampusClient({ resumen, canEdit }: Props) {
  const porPilar = new Map(resumen.map((r) => [r.pilar_codigo as string, r]))
  const totalMateriales = resumen.reduce((acc, r) => acc + r.total_materiales, 0)

  return (
    <div className="space-y-6">
      {/* Portada: pantalla de mando → navy full-bleed (DESIGN.md) */}
      <div className="rounded-2xl bg-gradient-to-b from-navy-light to-navy p-6 shadow-lg shadow-black/20 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">📚</span>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Campus de Capacitaciones
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-[15px] text-blue-200/80">
          Todo el material para aprender, consultar y reforzar nuestros conocimientos.
        </p>

        {totalMateriales === 0 && (
          <p className="mt-4 rounded-lg bg-white/10 px-4 py-3 text-sm text-blue-100">
            {canEdit
              ? "El Campus está vacío. Entrá a un pilar y cargá la primera capacitación."
              : "Todavía no hay material publicado. RRHH lo va a ir cargando acá."}
          </p>
        )}
      </div>

      {/* Los 7 pilares se muestran SIEMPRE, aunque no tengan nada cargado. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAMPUS_PILARES.map((pilar) => {
          const r = porPilar.get(pilar.codigo)
          const caps = r?.total_capacitaciones ?? 0
          const mats = r?.total_materiales ?? 0

          return (
            <Link
              key={pilar.codigo}
              href={`/campus/${pilar.codigo}`}
              className="group flex min-h-[96px] items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-xl ${pilar.fondoSuave}`}
                aria-hidden
              >
                {pilar.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${pilar.dot}`} aria-hidden />
                  <h2 className="truncate text-[17px] font-semibold text-slate-900">
                    {pilar.nombre}
                  </h2>
                </div>
                <p
                  className={`mt-1 text-sm tabular-nums ${caps === 0 ? "text-slate-400" : "text-slate-600"}`}
                >
                  {bajadaConteo(caps, mats)}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
            </Link>
          )
        })}
      </div>

      <p className="flex items-center gap-2 text-sm text-slate-500">
        <BookOpen className="size-4" />
        El material queda disponible para consulta permanente: videos, presentaciones, SOPs,
        PDFs y flyers, ordenados por pilar.
      </p>
    </div>
  )
}
