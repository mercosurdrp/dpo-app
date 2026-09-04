import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import {
  intensidadMax,
  type Intensidad,
} from "@/app/(dashboard)/planeamiento/periodos-criticos/_lib/intensidad"

export const dynamic = "force-dynamic"

// GET → próximos períodos de FOCO (los que el equipo definió en Períodos
// Críticos) que aún no terminaron, para la reunión logística-ventas.
//
// Cada foco viene con lo observado en la misma ventana del año anterior
// (cuántos días superaron la capacidad, cuántos quedaron al límite, el pico) y
// con el PLAN DE ACCIÓN de su escalón, para que la reunión tenga la sugerencia
// a mano y no haya que ir a buscarla a Planeamiento. Devuelve también `hoy`
// (fecha ARG) para que el front calcule "en X días".

export type PlanAccion = { codigo: string; descripcion: string; plan_texto: string }

export type FocoProximo = {
  id: string
  anio: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  prioridad: string | null
  foco: string | null
  /** Escalón del período según el año anterior (el peor día de la ventana). */
  intensidad: Intensidad
  base: { criticos: number; limite: number; hl_max: number; pct_max: number } | null
  plan: PlanAccion | null
}

type Fila = { fecha: string; hl: number; pct_capacidad: number; trigger_vol: boolean }

// Misma fecha del año anterior (29/2 → 28/2 si hace falta).
function proyectar(f: string, anio: number): string {
  const [, mm, dd] = f.split("-")
  const d = mm === "02" && dd === "29" ? "28" : dd
  return `${anio}-${mm}-${d}`
}

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  // hoy en horario Argentina (UTC-3)
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

  const supabase = await createClient()
  const [{ data: focos, error }, { data: planesRaw }] = await Promise.all([
    supabase
      .from("pc_periodos_foco")
      .select("id, anio, nombre, fecha_inicio, fecha_fin, prioridad, foco")
      .gte("fecha_fin", hoy)
      .order("fecha_inicio", { ascending: true })
      .limit(12),
    supabase.from("pc_planes_accion").select("codigo, descripcion, plan_texto"),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const planes = new Map<string, PlanAccion>()
  for (const p of (planesRaw ?? []) as PlanAccion[]) planes.set(p.codigo, p)

  // Días del año anterior de todas las ventanas, en una sola consulta.
  const lista = (focos ?? []) as Omit<FocoProximo, "intensidad" | "base" | "plan">[]
  const anios = [...new Set(lista.map((f) => f.anio - 1))]
  const base = new Map<string, Fila>()
  for (const a of anios) {
    const { data } = await supabase
      .from("v_pc_calendario_dia_multianio")
      .select("fecha, hl, pct_capacidad, trigger_vol")
      .eq("anio", a)
      .neq("dow", 0)
    for (const f of (data ?? []) as unknown as Fila[]) base.set(f.fecha, f)
  }

  const periodos: FocoProximo[] = lista.map((f) => {
    const ini = proyectar(f.fecha_inicio, f.anio - 1)
    const fin = proyectar(f.fecha_fin, f.anio - 1)
    const dias = [...base.values()].filter((d) => d.fecha >= ini && d.fecha <= fin)
    const intensidad: Intensidad = dias.length
      ? intensidadMax(dias.map((d) => ({ trigger_vol: !!d.trigger_vol, pct_capacidad: Number(d.pct_capacidad) })))
      : "NORMAL"
    return {
      ...f,
      intensidad,
      base: dias.length
        ? {
            criticos: dias.filter((d) => d.trigger_vol).length,
            limite: dias.filter((d) => !d.trigger_vol && Number(d.pct_capacidad) >= 0.9).length,
            hl_max: Math.max(...dias.map((d) => Number(d.hl))),
            pct_max: Math.max(...dias.map((d) => Number(d.pct_capacidad))),
          }
        : null,
      plan: planes.get(intensidad) ?? null,
    }
  })

  return NextResponse.json({ hoy, periodos })
}
