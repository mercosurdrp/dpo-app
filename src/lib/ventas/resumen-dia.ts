/**
 * Resumen del día de bultos vendidos para el detalle de "Bultos vendidos"
 * en el tablero de reuniones. Lectura pura.
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

export interface VentasPatenteRow {
  patente: string
  chofer_nombre: string | null
  bultos: number
}

export interface VentasResumenDia {
  fecha: string
  total_bultos: number
  patentes_con_venta: number
  promedio_mes_anterior: number | null
  por_patente: VentasPatenteRow[]
}

export async function getVentasResumenDia(
  supa: SupaClient,
  fecha: string,
): Promise<VentasResumenDia> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida (esperado YYYY-MM-DD)")
  }

  // Rango mes anterior
  const [y, m] = fecha.split("-").map((s) => parseInt(s, 10))
  const prevAnio = m === 1 ? y - 1 : y
  const prevMes = m === 1 ? 12 : m - 1
  const prevDesde = `${prevAnio}-${String(prevMes).padStart(2, "0")}-01`
  const ultimoDia = new Date(Date.UTC(prevAnio, prevMes, 0)).getUTCDate()
  const prevHasta = `${prevAnio}-${String(prevMes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`

  const [ventasRaw, ventasMesAntRaw, mapeoRaw] = await Promise.all([
    supa
      .from("ventas_diarias")
      .select("ds_fletero_carga, total_bultos")
      .eq("fecha", fecha),
    supa
      .from("ventas_diarias")
      .select("fecha, total_bultos")
      .gte("fecha", prevDesde)
      .lte("fecha", prevHasta),
    supa
      .from("mapeo_patente_chofer")
      .select("patente, catalogo_choferes(nombre)"),
  ])

  if (ventasRaw.error) {
    throw new Error(`ventas_diarias: ${ventasRaw.error.message}`)
  }

  type MapeoRow = {
    patente: string
    catalogo_choferes: { nombre: string | null } | null
  }
  const mapeo = (mapeoRaw.data ?? []) as unknown as MapeoRow[]
  const choferIdx = new Map<string, string | null>()
  for (const m of mapeo) {
    choferIdx.set(m.patente, m.catalogo_choferes?.nombre ?? null)
  }

  const ventas = (ventasRaw.data ?? []) as Array<{
    ds_fletero_carga: string
    total_bultos: number | null
  }>

  let total = 0
  const porPatente = new Map<string, number>()
  for (const v of ventas) {
    const b = Number(v.total_bultos ?? 0)
    if (!Number.isFinite(b)) continue
    total += b
    if (v.ds_fletero_carga) {
      porPatente.set(
        v.ds_fletero_carga,
        (porPatente.get(v.ds_fletero_carga) ?? 0) + b,
      )
    }
  }

  // Promedio diario del mes anterior (Σ bultos / días con datos)
  let promedio: number | null = null
  if (!ventasMesAntRaw.error && ventasMesAntRaw.data) {
    const porFecha = new Map<string, number>()
    for (const v of ventasMesAntRaw.data as Array<{
      fecha: string
      total_bultos: number | null
    }>) {
      const b = Number(v.total_bultos ?? 0)
      if (!Number.isFinite(b)) continue
      porFecha.set(v.fecha, (porFecha.get(v.fecha) ?? 0) + b)
    }
    const dias = porFecha.size
    if (dias > 0) {
      let sum = 0
      for (const b of porFecha.values()) sum += b
      promedio = sum / dias
    }
  }

  const por_patente: VentasPatenteRow[] = [...porPatente.entries()]
    .map(([patente, bultos]) => ({
      patente,
      chofer_nombre: choferIdx.get(patente) ?? null,
      bultos,
    }))
    .sort((a, b) => b.bultos - a.bultos)

  return {
    fecha,
    total_bultos: total,
    patentes_con_venta: porPatente.size,
    promedio_mes_anterior: promedio,
    por_patente,
  }
}
