"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  META_RECHAZO_PCT,
  type PeriodoKey,
  type RankingPatente,
  type PorDia,
  type PorMotivo,
  type RechazosEmpleadoData,
} from "./rechazos-empleado-tipos"
import { etiquetaChofer } from "@/lib/gescom/etiqueta-fletero"
import { cargarChoferesPorPatente } from "@/lib/gescom/indice-choferes"

/**
 * Vista AMIGABLE de rechazos para el empleado, orientada a OBJETIVO + premio.
 *
 * Objetivo: la tasa de rechazo no debe superar META_RECHAZO_PCT (1,7%).
 * Tasa = HL rechazados / HL entregados × 100 (mismo criterio que el dashboard
 * ejecutivo: numerador = `rechazos.hl_rechazados` por fecha_venta; denominador
 * = `ventas_diarias.total_hl` por fecha). El ranking premia al que MENOS
 * rechaza (menor tasa primero). Sin montos $.
 */

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
    const d = new Date(`${hoy}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 6)
    return { desde: d.toISOString().slice(0, 10), hasta: hoy, label: "Últimos 7 días" }
  }

  if (periodo === "mes_pasado") {
    const mesAnt = m === 1 ? 12 : m - 1
    const anioAnt = m === 1 ? y - 1 : y
    const desde = `${anioAnt}-${pad(mesAnt)}-01`
    const ultimo = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
    const hasta = `${anioAnt}-${pad(mesAnt)}-${pad(ultimo)}`
    return { desde, hasta, label: nombreMes(mesAnt, anioAnt) }
  }

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

const norm = (s: string | null | undefined) => (s ?? "—").toUpperCase().trim()

interface RawRechazo {
  fecha_venta: string
  ds_fletero_carga: string | null
  bultos_rechazados: number | null
  hl_rechazados: number | null
  ds_rechazo: string | null
}
interface RawVenta {
  fecha: string
  ds_fletero_carga: string | null
  total_hl: number | null
}

export async function getRechazosRankingEmpleado(
  periodo: PeriodoKey = "mes",
): Promise<Result<RechazosEmpleadoData>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { desde, hasta, label } = ventana(periodo)

    const [rechRes, ventasRes, choferesMapeo] = await Promise.all([
      supabase
        .from("rechazos")
        .select("fecha_venta, ds_fletero_carga, bultos_rechazados, hl_rechazados, ds_rechazo")
        .gte("fecha_venta", desde)
        .lte("fecha_venta", hasta),
      supabase
        .from("ventas_diarias")
        .select("fecha, ds_fletero_carga, total_hl")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      cargarChoferesPorPatente(supabase, norm),
    ])

    if (rechRes.error) return { error: rechRes.error.message }
    if (ventasRes.error) return { error: ventasRes.error.message }

    const rechazos = (rechRes.data ?? []) as unknown as RawRechazo[]
    const ventas = (ventasRes.data ?? []) as unknown as RawVenta[]

    // patente/reparto → chofer (Chess + GESCOM, ya normalizado con `norm`)
    const choferPorPatente = new Map<string, string>()
    for (const m of choferesMapeo) {
      if (m.patente && m.chofer_nombre) choferPorPatente.set(m.patente, m.chofer_nombre)
    }

    // Entregado (denominador) por patente y por día — HL
    const hlEntregadoPatente = new Map<string, number>()
    const hlEntregadoDia = new Map<string, number>()
    let totalHlEntregado = 0
    for (const v of ventas) {
      const h = Math.abs(Number(v.total_hl) || 0)
      totalHlEntregado += h
      const pat = norm(v.ds_fletero_carga)
      hlEntregadoPatente.set(pat, (hlEntregadoPatente.get(pat) ?? 0) + h)
      hlEntregadoDia.set(v.fecha, (hlEntregadoDia.get(v.fecha) ?? 0) + h)
    }

    // Rechazado (numerador)
    interface PatAcc { patente: string; eventos: number; bultos: number; hl: number }
    const patAgg = new Map<string, PatAcc>()
    const diaAgg = new Map<string, { eventos: number; bultos: number; hl: number }>()
    const motivoAgg = new Map<string, PorMotivo>()
    let total_eventos = 0
    let total_bultos = 0
    let total_hl = 0

    for (const r of rechazos) {
      const bultos = Math.abs(Number(r.bultos_rechazados) || 0)
      const hl = Math.abs(Number(r.hl_rechazados) || 0)
      total_eventos += 1
      total_bultos += bultos
      total_hl += hl

      const pat = norm(r.ds_fletero_carga)
      const pa = patAgg.get(pat) ?? { patente: pat, eventos: 0, bultos: 0, hl: 0 }
      pa.eventos += 1; pa.bultos += bultos; pa.hl += hl
      patAgg.set(pat, pa)

      const da = diaAgg.get(r.fecha_venta) ?? { eventos: 0, bultos: 0, hl: 0 }
      da.eventos += 1; da.bultos += bultos; da.hl += hl
      diaAgg.set(r.fecha_venta, da)

      const motivo = r.ds_rechazo ?? "Sin motivo"
      const ma = motivoAgg.get(motivo) ?? { ds_rechazo: motivo, eventos: 0, bultos: 0 }
      ma.eventos += 1; ma.bultos += bultos
      motivoAgg.set(motivo, ma)
    }

    const round1 = (n: number) => Math.round(n * 10) / 10
    const round2 = (n: number) => Math.round(n * 100) / 100

    // Armar filas por patente con tasa
    const filas: RankingPatente[] = Array.from(patAgg.values()).map((p) => {
      const hlEnt = hlEntregadoPatente.get(p.patente) ?? 0
      const confiable = hlEnt > 0 && p.hl <= hlEnt
      const tasa = hlEnt > 0 ? (p.hl / hlEnt) * 100 : 0
      return {
        patente: p.patente,
        display: etiquetaChofer(choferPorPatente.get(p.patente), p.patente, p.patente),
        eventos: p.eventos,
        bultos: round1(p.bultos),
        hl: round1(p.hl),
        hl_entregado: round1(hlEnt),
        tasa: round2(tasa),
        denominador_confiable: confiable,
        excede: confiable && tasa > META_RECHAZO_PCT,
      }
    })

    // Ranking: solo confiables, MENOR tasa primero (premio al que menos rechaza)
    const ranking = filas
      .filter((f) => f.denominador_confiable)
      .sort((a, b) => a.tasa - b.tasa || a.bultos - b.bultos)
    const sin_dato = filas
      .filter((f) => !f.denominador_confiable)
      .sort((a, b) => b.bultos - a.bultos)

    const por_dia: PorDia[] = Array.from(diaAgg.entries())
      .map(([fecha, d]) => {
        const hlEnt = hlEntregadoDia.get(fecha) ?? 0
        return {
          fecha,
          eventos: d.eventos,
          bultos: round1(d.bultos),
          hl: round1(d.hl),
          hl_entregado: round1(hlEnt),
          tasa: hlEnt > 0 ? round2((d.hl / hlEnt) * 100) : 0,
        }
      })
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

    const por_motivo = Array.from(motivoAgg.values()).sort((a, b) => b.eventos - a.eventos)

    const tasa_global = totalHlEntregado > 0 ? round2((total_hl / totalHlEntregado) * 100) : 0

    return {
      data: {
        periodo,
        desde,
        hasta,
        label,
        meta: META_RECHAZO_PCT,
        total_eventos,
        total_bultos: round1(total_bultos),
        total_hl: round1(total_hl),
        total_hl_entregado: round1(totalHlEntregado),
        tasa_global,
        cumple_meta: tasa_global <= META_RECHAZO_PCT,
        camiones_exceden: ranking.filter((r) => r.excede).length,
        ranking,
        sin_dato,
        por_dia,
        por_motivo,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los rechazos",
    }
  }
}
