/**
 * Serie diaria de bultos entregados y rechazados desglosada por origen
 * (Chess / Gestión) para el drill-down de la card "% de rechazo del período".
 * Entregados de `ventas_diarias`; rechazados de `rechazos` (mismos filtros
 * que el indicador: las exclusiones ya vienen aplicadas por los syncs).
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

export interface BultosDiaPunto {
  fecha: string
  chess: number
  gestion: number
  chess_rechazados: number
  gestion_rechazados: number
}

export interface BultosPorDia {
  desde: string
  hasta: string
  puntos: BultosDiaPunto[]
  total_chess: number
  total_gestion: number
  total_chess_rechazados: number
  total_gestion_rechazados: number
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export async function getBultosPorDia(
  supa: SupaClient,
  desde: string,
  hasta: string,
): Promise<BultosPorDia> {
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta)) {
    throw new Error("Rango inválido (esperado YYYY-MM-DD)")
  }

  const [entregadosRaw, rechazadosRaw] = await Promise.all([
    supa
      .from("ventas_diarias")
      .select("fecha, origen, total_bultos")
      .gte("fecha", desde)
      .lte("fecha", hasta),
    // Rechazos por fecha_venta (día del REPARTO al que pertenece la mercadería),
    // no por fecha del DVVTA (día en que se registró, en Chess ~1,6 días después).
    supa
      .from("rechazos")
      .select("fecha_venta, origen, bultos_rechazados")
      .gte("fecha_venta", desde)
      .lte("fecha_venta", hasta),
  ])

  if (entregadosRaw.error) throw new Error(`ventas_diarias: ${entregadosRaw.error.message}`)
  if (rechazadosRaw.error) throw new Error(`rechazos: ${rechazadosRaw.error.message}`)

  const porFecha = new Map<string, BultosDiaPunto>()
  const punto = (fecha: string): BultosDiaPunto => {
    let p = porFecha.get(fecha)
    if (!p) {
      p = { fecha, chess: 0, gestion: 0, chess_rechazados: 0, gestion_rechazados: 0 }
      porFecha.set(fecha, p)
    }
    return p
  }

  for (const r of (entregadosRaw.data ?? []) as Array<{
    fecha: string; origen: string | null; total_bultos: number | null
  }>) {
    const b = Number(r.total_bultos ?? 0)
    if (!Number.isFinite(b)) continue
    const p = punto(r.fecha)
    if (r.origen === "gestion") p.gestion += b
    else p.chess += b
  }

  for (const r of (rechazadosRaw.data ?? []) as Array<{
    fecha_venta: string; origen: string | null; bultos_rechazados: number | null
  }>) {
    const b = Number(r.bultos_rechazados ?? 0)
    if (!Number.isFinite(b)) continue
    const p = punto(r.fecha_venta)
    if (r.origen === "gestion") p.gestion_rechazados += b
    else p.chess_rechazados += b
  }

  const puntos = [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const round1 = (n: number) => Math.round(n * 10) / 10
  for (const p of puntos) {
    p.chess = round1(p.chess)
    p.gestion = round1(p.gestion)
    p.chess_rechazados = round1(p.chess_rechazados)
    p.gestion_rechazados = round1(p.gestion_rechazados)
  }

  return {
    desde,
    hasta,
    puntos,
    total_chess: round1(puntos.reduce((s, p) => s + p.chess, 0)),
    total_gestion: round1(puntos.reduce((s, p) => s + p.gestion, 0)),
    total_chess_rechazados: round1(puntos.reduce((s, p) => s + p.chess_rechazados, 0)),
    total_gestion_rechazados: round1(puntos.reduce((s, p) => s + p.gestion_rechazados, 0)),
  }
}
