"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

// ── Tipos del ranking Misiones (solo 5S) ──
export interface MisionesFlotaRow {
  nombre: string
  nota_5s: number // promedio de nota_total de las auditorías de flota
  auditorias: number // cantidad de auditorías en la ventana
  posicion: number | null // 1..3 para el podio
}

export interface MisionesSectorRow {
  sector_numero: number
  nombre: string
  nota_5s: number | null // promedio de nota_total; null si no hubo auditorías
  auditorias: number
  posicion: number | null // 1..3 entre los sectores con nota
}

export interface MisionesRankingData {
  periodo_desde: string
  periodo_hasta: string
  meses: string[]
  flota: MisionesFlotaRow[]
  almacen: MisionesSectorRow[]
}

// ── utils de fecha (bimestre, igual criterio que Pampeana) ──
function firstDayOfMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

function addMonths(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map((n) => parseInt(n, 10))
  return firstDayOfMonth(new Date(y, m - 1 + delta, 1))
}

/**
 * Primer mes del último bimestre CALENDARIO cerrado (anclado al año:
 * Ene-Feb, Mar-Abr, May-Jun, …). Mismo criterio que el ranking de Pampeana.
 */
function bimestreDefault(): string {
  const now = new Date()
  const m = now.getMonth() + 1
  const primerMesEnCurso = m - ((m - 1) % 2) // 1,3,5,7,9,11
  const enCurso = `${now.getFullYear()}-${String(primerMesEnCurso).padStart(2, "0")}-01`
  return addMonths(enCurso, -2)
}

// ── normalización de nombres (los datos vienen con mayúsculas/acentos mixtos) ──
function normalizeKey(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

function toTitleCase(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/\b([a-záéíóúñ])/g, (c) => c.toUpperCase())
}

/**
 * Ranking de ayudantes (Misiones) basado SOLO en 5S.
 * - Distribución/Flota: promedio de nota 5S de las auditorías de flota donde
 *   aparece cada ayudante (ayudante_1 / ayudante_2).
 * - Almacén: ranking por sector según promedio de nota 5S de las auditorías de
 *   almacén del bimestre.
 */
export async function getRankingMisiones(
  periodoDesde?: string,
): Promise<{ data: MisionesRankingData } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const desde = periodoDesde ?? bimestreDefault()
    const meses = [desde, addMonths(desde, 1)] // ventana fija de 2 meses (bimestre)
    const hasta = meses[meses.length - 1]

    const [flotaRes, almacenRes, sectoresRes] = await Promise.all([
      supabase
        .from("s5_auditorias")
        .select("periodo, nota_total, ayudante_1, ayudante_2")
        .eq("tipo", "flota")
        .eq("estado", "completada")
        .in("periodo", meses)
        .not("nota_total", "is", null),
      supabase
        .from("s5_auditorias")
        .select("periodo, sector_numero, nota_total")
        .eq("tipo", "almacen")
        .eq("estado", "completada")
        .in("periodo", meses)
        .not("nota_total", "is", null),
      supabase.from("s5_sectores_almacen").select("numero, nombre"),
    ])

    if (flotaRes.error) return { error: flotaRes.error.message }

    // ── Flota: agrupar por ayudante normalizado ──
    const flotaAcc = new Map<
      string,
      { display: string; sum: number; n: number }
    >()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (flotaRes.data ?? []) as any[]) {
      const nota = Number(a.nota_total)
      if (!Number.isFinite(nota)) continue
      for (const raw of [a.ayudante_1, a.ayudante_2]) {
        const nombre = (raw ?? "").toString().trim()
        if (!nombre) continue
        const key = normalizeKey(nombre)
        const cur = flotaAcc.get(key) ?? {
          display: toTitleCase(nombre),
          sum: 0,
          n: 0,
        }
        cur.sum += nota
        cur.n += 1
        flotaAcc.set(key, cur)
      }
    }
    const flota: MisionesFlotaRow[] = Array.from(flotaAcc.values())
      .map((v) => ({
        nombre: v.display,
        nota_5s: Number((v.sum / v.n).toFixed(1)),
        auditorias: v.n,
        posicion: null as number | null,
      }))
      .sort((a, b) => b.nota_5s - a.nota_5s || b.auditorias - a.auditorias)
    flota.slice(0, 3).forEach((r, i) => (r.posicion = i + 1))

    // ── Almacén: ranking por sector ──
    const sectorNombre = new Map<number, string>()
    for (const s of (sectoresRes.data ?? []) as {
      numero: number
      nombre: string
    }[]) {
      sectorNombre.set(s.numero, s.nombre)
    }
    const sectorAcc = new Map<number, { sum: number; n: number }>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (almacenRes.data ?? []) as any[]) {
      const nota = Number(a.nota_total)
      const sec = a.sector_numero
      if (!Number.isFinite(nota) || sec == null) continue
      const cur = sectorAcc.get(sec) ?? { sum: 0, n: 0 }
      cur.sum += nota
      cur.n += 1
      sectorAcc.set(sec, cur)
    }
    // Incluye TODOS los sectores definidos (aunque no tengan auditorías).
    const numerosSector = new Set<number>([
      ...sectorNombre.keys(),
      ...sectorAcc.keys(),
    ])
    const almacen: MisionesSectorRow[] = Array.from(numerosSector)
      .map((num) => {
        const acc = sectorAcc.get(num)
        return {
          sector_numero: num,
          nombre: sectorNombre.get(num) ?? `Sector ${num}`,
          nota_5s: acc ? Number((acc.sum / acc.n).toFixed(1)) : null,
          auditorias: acc?.n ?? 0,
          posicion: null as number | null,
        }
      })
      .sort((a, b) => {
        // Sectores con nota primero (mayor a menor); los sin nota al final.
        if (a.nota_5s == null && b.nota_5s == null)
          return a.nombre.localeCompare(b.nombre)
        if (a.nota_5s == null) return 1
        if (b.nota_5s == null) return -1
        return b.nota_5s - a.nota_5s
      })
    almacen
      .filter((r) => r.nota_5s != null)
      .slice(0, 3)
      .forEach((r, i) => (r.posicion = i + 1))

    return {
      data: {
        periodo_desde: desde,
        periodo_hasta: hasta,
        meses,
        flota,
        almacen,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el ranking",
    }
  }
}
