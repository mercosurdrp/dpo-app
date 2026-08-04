import { Suspense } from "react"
import { getDashboardData } from "@/actions/dashboard"
import { getDevolucion } from "@/actions/devolucion"
import { createClient } from "@/lib/supabase/server"
import { EMPRESA_NOMBRE, IS_MISIONES } from "@/lib/empresa"
import type { Pilar } from "@/types/database"
import { SuenoSection, SuenoSkeleton } from "@/components/sueno/sueno-section"
import { HomeClient } from "./home-client"

const META_GLOBAL_FALLBACK = 0.73

export default async function DashboardPage() {
  const supabase = await createClient()

  const [pilaresRes, data, devolucionRes] = await Promise.all([
    supabase.from("pilares").select("*").order("orden"),
    getDashboardData(),
    // Solo Pampeana tiene cargada la devolución H1; en Misiones ni se consulta.
    IS_MISIONES ? Promise.resolve(null) : getDevolucion(),
  ])

  if ("error" in data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard DPO</h1>
        <p className="mt-2 text-red-500">Error: {data.error}</p>
      </div>
    )
  }

  const pilares = (pilaresRes.data ?? []) as Pilar[]
  const metaPorPilar = new Map(pilares.map((p) => [p.id, p.meta]))
  const metaGlobal =
    pilares.length > 0
      ? pilares.reduce((a, p) => a + (p.meta || META_GLOBAL_FALLBACK), 0) / pilares.length
      : META_GLOBAL_FALLBACK

  // Punto de partida H1 de la ruta: la última auditoría ANTERIOR a la activa
  // (el history incluye la activa como último item; sin excluirla el delta
  // daría siempre 0 y la ruta colapsa a una barra de progreso).
  const ultimaCompletada =
    data.auditoriasHistory.filter((a) => a.id !== data.auditoria?.id).at(-1) ?? null

  let devolucion: { total: number; resueltas: number } | null = null
  if (devolucionRes && !("error" in devolucionRes)) {
    const tareas = devolucionRes.data.flatMap((p) => p.tareas)
    if (tareas.length > 0) {
      devolucion = {
        total: tareas.length,
        resueltas: tareas.filter((t) => t.resuelta).length,
      }
    }
  }

  return (
    <div className="-mx-4 -mb-4 -mt-14 min-h-dvh bg-gradient-to-b from-navy-light to-navy px-4 pb-12 pt-20 md:-m-6 md:px-8 md:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <HomeClient
          data={{
            empresa: EMPRESA_NOMBRE,
            overallScore: data.overallScore,
            metaGlobal,
            h1Score: ultimaCompletada?.overallScore ?? null,
            h1Nombre: ultimaCompletada?.nombre ?? null,
            pendingActions: data.pendingActions,
            lanes: data.pillarScores.map((p) => ({
              pilarId: p.pilarId,
              pilarNombre: p.pilarNombre,
              color: p.color,
              score: p.score,
              meta: metaPorPilar.get(p.pilarId) || META_GLOBAL_FALLBACK,
              mandatoryScore: p.mandatoryScore,
              answered: p.answered,
              total: p.total,
            })),
            devolucion,
          }}
        />

        {/* Árbol del Sueño (KPIs del año) — server component existente, trae su
            propia card blanca con header navy: funciona tal cual sobre el fondo */}
        <Suspense fallback={<SuenoSkeleton />}>
          <SuenoSection />
        </Suspense>
      </div>
    </div>
  )
}
