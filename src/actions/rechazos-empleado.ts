"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Vista AMIGABLE de rechazos para el empleado (ranking general por día y por
 * patente/chofer). Sin montos $ — solo cantidad de rechazos y bultos.
 * Fuente: tabla `rechazos` (Pampeana). Los PRDVO ya no entran (sync filtrado).
 */

export type PeriodoKey = "mes" | "mes_pasado" | "semana"

export interface RankingPatente {
  patente: string
  display: string // nombre del chofer si hay mapeo, si no la patente
  eventos: number
  bultos: number
  hl: number
}

export interface PorDia {
  fecha: string // YYYY-MM-DD
  eventos: number
  bultos: number
  hl: number
}

export interface PorMotivo {
  ds_rechazo: string
  eventos: number
  bultos: number
}

export interface RechazosEmpleadoData {
  periodo: PeriodoKey
  desde: string
  hasta: string
  label: string
  total_eventos: number
  total_bultos: number
  total_hl: number
  por_patente: RankingPatente[]
  por_dia: PorDia[]
  por_motivo: PorMotivo[]
}

type Result<T> = { data: T } | { error: string }

// ── Helpers de fecha en zona Argentina (Vercel corre en UTC) ──
function hoyART(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function ventana(periodo: PeriodoKey): { desde: string; hasta: string; label: string } {
  const hoy = hoyART()
  const [y, m] = hoy.split("-").map(Number)
  const pad = (n: number) => String(n).padStart(2, "0")

  if (periodo === "semana") {
    // Últimos 7 días (incluye hoy)
    const d = new Date(`${hoy}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 6)
    const desde = d.toISOString().slice(0, 10)
    return { desde, hasta: hoy, label: "Últimos 7 días" }
  }

  if (periodo === "mes_pasado") {
    const mesAnt = m === 1 ? 12 : m - 1
    const anioAnt = m === 1 ? y - 1 : y
    const desde = `${anioAnt}-${pad(mesAnt)}-01`
    // Último día del mes anterior = día 0 del mes actual
    const ultimo = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
    const hasta = `${anioAnt}-${pad(mesAnt)}-${pad(ultimo)}`
    return { desde, hasta, label: nombreMes(mesAnt, anioAnt) }
  }

  // Mes en curso
  const desde = `${y}-${pad(m)}-01`
  return { desde, hasta: hoy, label: `${nombreMes(m, y)} (en curso)` }
}

function nombreMes(mes: number, anio: number): string {
  const nombres = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ]
  return `${nombres[mes - 1]} ${anio}`
}

interface RawRow {
  fecha_venta: string
  ds_fletero_carga: string | null
  bultos_rechazados: number | null
  hl_rechazados: number | null
  ds_rechazo: string | null
  id_rechazo: number
}

export async function getRechazosRankingEmpleado(
  periodo: PeriodoKey = "mes",
): Promise<Result<RechazosEmpleadoData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { desde, hasta, label } = ventana(periodo)

    // Traemos las filas del período + el mapeo patente→chofer en paralelo.
    const [rowsRes, mapeoRes] = await Promise.all([
      supabase
        .from("rechazos")
        .select(
          "fecha_venta, ds_fletero_carga, bultos_rechazados, hl_rechazados, ds_rechazo, id_rechazo",
        )
        .gte("fecha_venta", desde)
        .lte("fecha_venta", hasta),
      supabase
        .from("mapeo_patente_chofer")
        .select("patente, catalogo_choferes(nombre)"),
    ])

    if (rowsRes.error) return { error: rowsRes.error.message }
    const rows = (rowsRes.data ?? []) as unknown as RawRow[]

    // Mapa patente → nombre chofer
    type MapeoRow = { patente: string; catalogo_choferes: { nombre: string | null } | null }
    const choferPorPatente = new Map<string, string>()
    for (const m of (mapeoRes.data ?? []) as unknown as MapeoRow[]) {
      const nombre = m.catalogo_choferes?.nombre
      if (m.patente && nombre) choferPorPatente.set(m.patente.toUpperCase().trim(), nombre)
    }

    // Agregaciones
    const patenteAgg = new Map<string, RankingPatente>()
    const diaAgg = new Map<string, PorDia>()
    const motivoAgg = new Map<string, PorMotivo>()
    let total_eventos = 0
    let total_bultos = 0
    let total_hl = 0

    for (const r of rows) {
      const bultos = Math.abs(Number(r.bultos_rechazados) || 0)
      const hl = Math.abs(Number(r.hl_rechazados) || 0)
      total_eventos += 1
      total_bultos += bultos
      total_hl += hl

      // por patente
      const pat = (r.ds_fletero_carga ?? "—").toUpperCase().trim()
      const pa = patenteAgg.get(pat) ?? {
        patente: pat,
        display: choferPorPatente.get(pat) ?? pat,
        eventos: 0,
        bultos: 0,
        hl: 0,
      }
      pa.eventos += 1
      pa.bultos += bultos
      pa.hl += hl
      patenteAgg.set(pat, pa)

      // por día
      const dia = r.fecha_venta
      const da = diaAgg.get(dia) ?? { fecha: dia, eventos: 0, bultos: 0, hl: 0 }
      da.eventos += 1
      da.bultos += bultos
      da.hl += hl
      diaAgg.set(dia, da)

      // por motivo
      const motivo = r.ds_rechazo ?? "Sin motivo"
      const ma = motivoAgg.get(motivo) ?? { ds_rechazo: motivo, eventos: 0, bultos: 0 }
      ma.eventos += 1
      ma.bultos += bultos
      motivoAgg.set(motivo, ma)
    }

    const por_patente = Array.from(patenteAgg.values()).sort(
      (a, b) => b.bultos - a.bultos || b.eventos - a.eventos,
    )
    const por_dia = Array.from(diaAgg.values()).sort((a, b) =>
      a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0,
    )
    const por_motivo = Array.from(motivoAgg.values()).sort(
      (a, b) => b.eventos - a.eventos,
    )

    const round1 = (n: number) => Math.round(n * 10) / 10
    return {
      data: {
        periodo,
        desde,
        hasta,
        label,
        total_eventos,
        total_bultos: round1(total_bultos),
        total_hl: round1(total_hl),
        por_patente: por_patente.map((p) => ({ ...p, bultos: round1(p.bultos), hl: round1(p.hl) })),
        por_dia: por_dia.map((d) => ({ ...d, bultos: round1(d.bultos), hl: round1(d.hl) })),
        por_motivo,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los rechazos",
    }
  }
}
