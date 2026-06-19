import { NextResponse } from "next/server"
import { guard } from "@/lib/mantenimiento/guard"

export const dynamic = "force-dynamic"

// Regla DPO: 5/3 = OK (1.0), 1 = parcial (1/3), 0 = NOK, N/A excluye.
const SCORE_MAP: Record<string, number> = { "5": 1, "3": 1, "1": 1 / 3, "0": 0 }

interface Pregunta {
  id: number
  seccion_num: number
  seccion_titulo: string
  peso_item: number
  es_critico: boolean
}
interface Puntaje {
  revision_id: number
  pregunta_id: number
  puntaje: string | null
}
interface Revision {
  id: number
  periodo: string
  fecha: string
}
interface Pda {
  estado: string
  costo_estimado: number | null
  costo_ejecutado: number | null
}

function adherencia(rev: Revision, puntajes: Puntaje[], byId: Map<number, Pregunta>) {
  const sec = new Map<number, { titulo: string; w: number; s: number; n: number }>()
  const total = { w: 0, s: 0, n: 0 }
  const crit = { w: 0, s: 0, n: 0 }
  for (const pt of puntajes) {
    if (pt.revision_id !== rev.id) continue
    const pr = byId.get(pt.pregunta_id)
    if (!pr) continue
    const v = pt.puntaje == null ? "" : String(pt.puntaje).trim()
    if (v === "" || v.toUpperCase() === "N/A") continue
    const norm = SCORE_MAP[v]
    if (norm == null) continue
    const w = Number(pr.peso_item) || 1
    total.w += w; total.s += w * norm; total.n += 1
    const s = sec.get(pr.seccion_num) ?? { titulo: pr.seccion_titulo, w: 0, s: 0, n: 0 }
    s.w += w; s.s += w * norm; s.n += 1
    sec.set(pr.seccion_num, s)
    if (pr.es_critico) { crit.w += w; crit.s += w * norm; crit.n += 1 }
  }
  const pct = (a: { w: number; s: number }) => (a.w ? (a.s / a.w) * 100 : 0)
  return {
    total_pct: pct(total),
    criticos_pct: pct(crit),
    secciones: [...sec.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, v]) => ({
        seccion_num: num,
        seccion_titulo: v.titulo,
        adherencia_pct: pct(v),
        items: v.n,
      })),
  }
}

// GET /api/mantenimiento-instalaciones/dashboard — KPIs, serie por trimestre,
// adherencia por sección, estado de PDAs y alertas de umbral DPO.
export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  const sb = g.supabase

  const [pq, rq, ptq, pdq] = await Promise.all([
    sb.from("mant_preguntas").select("id, seccion_num, seccion_titulo, peso_item, es_critico"),
    sb.from("mant_revisiones").select("id, periodo, fecha").order("fecha", { ascending: true }),
    sb.from("mant_puntajes").select("revision_id, pregunta_id, puntaje"),
    sb.from("mant_pdas").select("estado, costo_estimado, costo_ejecutado"),
  ])
  const err = pq.error || rq.error || ptq.error || pdq.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const byId = new Map<number, Pregunta>((pq.data as Pregunta[]).map((p) => [p.id, p]))
  const puntajes = (ptq.data ?? []) as Puntaje[]
  const revs = (rq.data ?? []) as Revision[]

  const serie = revs.map((r) => {
    const a = adherencia(r, puntajes, byId)
    return { revision_id: r.id, periodo: r.periodo, fecha: r.fecha, ...a }
  })
  const ultima = serie.length ? serie[serie.length - 1] : null

  const pdas = (pdq.data ?? []) as Pda[]
  const pda_stats = {
    total: pdas.length,
    planificado: pdas.filter((p) => p.estado === "planificado").length,
    en_curso: pdas.filter((p) => p.estado === "en_curso").length,
    ejecutado: pdas.filter((p) => p.estado === "ejecutado").length,
    cerrado: pdas.filter((p) => p.estado === "cerrado").length,
    costo_estimado_total: pdas.reduce((a, p) => a + (Number(p.costo_estimado) || 0), 0),
    costo_ejecutado_total: pdas.reduce((a, p) => a + (Number(p.costo_ejecutado) || 0), 0),
  }

  const alertas: string[] = []
  if (ultima) {
    if (ultima.total_pct < 64)
      alertas.push(`Adherencia total ${ultima.total_pct.toFixed(1)}% por debajo del umbral DPO de 64%`)
    if (ultima.criticos_pct < 89)
      alertas.push(`Items críticos ${ultima.criticos_pct.toFixed(1)}% por debajo del umbral DPO de 89%`)
  }

  return NextResponse.json({
    serie,
    ultima,
    pdas: pda_stats,
    alertas,
    umbrales: { total_min: 64, criticos_min: 89 },
  })
}
