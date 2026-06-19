"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

// RMD = Rate My Delivery (Power BI de Quilmes). Cada entrega se puntúa 1-5.
// Detractor = puntuación 1-3. La base individual vive en nps_rmd_cliente.

export interface RmdResumen {
  anio: number
  /** Promedio simple de todas las puntuaciones del año (1-5). */
  rmd: number | null
  /** Cantidad de entregas puntuadas. */
  rmd_respuestas: number
  /** Puntuaciones 1-3. */
  detractores: number
  /** % de detractoras sobre el total. */
  pct_detractores: number | null
  /** Clientes distintos que puntuaron. */
  clientes: number
  ultima_puntuacion: string | null
  /** Última corrida OK del sync con el Power BI (nps_sync_log). */
  actualizado_en: string | null
}

export interface RmdMes {
  mes: number // 1-12
  rmd: number | null
  puntuadas: number
  detractores: number
  otif_interno: number | null // 1 - bultos_rechazados/bultos_entregados (def. 109)
}

export interface RmdDistribucion {
  puntuacion: number // 1-5
  cantidad: number
  pct: number
}

export interface RmdMotivo {
  motivo: string
  cantidad: number
}

export interface RmdPromotor {
  promotor: string
  rmd: number
  puntuaciones: number
  detractoras: number
}

export interface RmdCliente {
  cod_cliente: number
  nombre_cliente: string
  promotor: string | null
  localidad: string | null
  rmd: number
  puntuaciones: number
  detractoras: number
  ultima_fecha: string
  ultima_puntuacion: number
}

export interface RmdDashboardData {
  resumen: RmdResumen
  por_mes: RmdMes[]
  distribucion: RmdDistribucion[]
  motivos: RmdMotivo[]
  por_promotor: RmdPromotor[]
  clientes: RmdCliente[]
}

interface RmdRow {
  cod_cliente: number
  nombre_cliente: string | null
  promotor: string | null
  localidad: string | null
  fecha_puntuacion: string
  puntuacion: number
  motivos: string | null
}

export interface RmdPunto {
  fecha_puntuacion: string
  fecha_entrega: string | null
  nro_pedido: string | null
  puntuacion: number
  motivos: string | null
  comentario: string | null
}

const ANIO = 2026
const PAGE = 1000

export async function getRmdDashboard(): Promise<Result<RmdDashboardData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // La base de RMD puede superar el tope por defecto de PostgREST: paginamos.
    const filas: RmdRow[] = []
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await supabase
        .from("nps_rmd_cliente")
        .select(
          "cod_cliente, nombre_cliente, promotor, localidad, fecha_puntuacion, puntuacion, motivos",
        )
        .gte("fecha_puntuacion", `${ANIO}-01-01`)
        .lt("fecha_puntuacion", `${ANIO + 1}-01-01`)
        .order("fecha_puntuacion", { ascending: true })
        .range(desde, desde + PAGE - 1)
      if (error) return { error: error.message }
      const lote = (data ?? []) as unknown as RmdRow[]
      filas.push(...lote)
      if (lote.length < PAGE) break
    }

    const [rechRes, syncRes] = await Promise.all([
      supabase
        .from("v_nps_otif_mensual")
        .select("mes, otif_interno")
        .eq("anio", ANIO),
      supabase
        .from("nps_sync_log")
        .select("ejecutado_en")
        .eq("ok", true)
        .order("ejecutado_en", { ascending: false })
        .limit(1),
    ])

    const otifPorMes = new Map<number, number | null>()
    for (const r of (rechRes.data ?? []) as Array<{
      mes: number
      otif_interno: number | null
    }>) {
      otifPorMes.set(r.mes, r.otif_interno)
    }

    // ---- resumen anual ----
    const total = filas.length
    let suma = 0
    let detractores = 0
    const clientesSet = new Set<number>()
    for (const f of filas) {
      suma += f.puntuacion
      if (f.puntuacion <= 3) detractores += 1
      clientesSet.add(f.cod_cliente)
    }
    const resumen: RmdResumen = {
      anio: ANIO,
      rmd: total ? round2(suma / total) : null,
      rmd_respuestas: total,
      detractores,
      pct_detractores: total ? round1((detractores / total) * 100) : null,
      clientes: clientesSet.size,
      ultima_puntuacion: total ? filas[total - 1].fecha_puntuacion : null,
      actualizado_en:
        ((syncRes.data ?? []) as Array<{ ejecutado_en: string }>)[0]
          ?.ejecutado_en ?? null,
    }

    // ---- por mes ----
    const meses = new Map<number, { suma: number; n: number; det: number }>()
    for (const f of filas) {
      const mes = Number(f.fecha_puntuacion.slice(5, 7))
      const cur = meses.get(mes) ?? { suma: 0, n: 0, det: 0 }
      cur.suma += f.puntuacion
      cur.n += 1
      if (f.puntuacion <= 3) cur.det += 1
      meses.set(mes, cur)
    }
    const mesMax = Math.max(...meses.keys(), ...otifPorMes.keys(), 1)
    const por_mes: RmdMes[] = []
    for (let mes = 1; mes <= mesMax; mes++) {
      const c = meses.get(mes)
      por_mes.push({
        mes,
        rmd: c && c.n ? round2(c.suma / c.n) : null,
        puntuadas: c?.n ?? 0,
        detractores: c?.det ?? 0,
        otif_interno: otifPorMes.get(mes) ?? null,
      })
    }

    // ---- distribución de puntuaciones 1-5 ----
    const distCount = new Map<number, number>()
    for (const f of filas) {
      distCount.set(f.puntuacion, (distCount.get(f.puntuacion) ?? 0) + 1)
    }
    const distribucion: RmdDistribucion[] = []
    for (let p = 1; p <= 5; p++) {
      const cantidad = distCount.get(p) ?? 0
      distribucion.push({
        puntuacion: p,
        cantidad,
        pct: total ? round1((cantidad / total) * 100) : 0,
      })
    }

    // ---- motivos de baja puntuación (texto libre del Power BI) ----
    const motivoCount = new Map<string, number>()
    for (const f of filas) {
      const m = (f.motivos ?? "").trim()
      if (!m) continue
      motivoCount.set(m, (motivoCount.get(m) ?? 0) + 1)
    }
    const motivos: RmdMotivo[] = [...motivoCount.entries()]
      .map(([motivo, cantidad]) => ({ motivo, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)

    // ---- por promotor ----
    const porProm = new Map<string, { suma: number; n: number; det: number }>()
    for (const f of filas) {
      if (!f.promotor) continue
      const cur = porProm.get(f.promotor) ?? { suma: 0, n: 0, det: 0 }
      cur.suma += f.puntuacion
      cur.n += 1
      if (f.puntuacion <= 3) cur.det += 1
      porProm.set(f.promotor, cur)
    }
    const por_promotor: RmdPromotor[] = [...porProm.entries()]
      .map(([promotor, c]) => ({
        promotor,
        rmd: round2(c.suma / c.n),
        puntuaciones: c.n,
        detractoras: c.det,
      }))
      .sort((a, b) => a.rmd - b.rmd || b.detractoras - a.detractoras)

    // ---- por cliente (agregado; el detalle se trae on-demand) ----
    const porCli = new Map<
      number,
      {
        nombre: string | null
        promotor: string | null
        localidad: string | null
        suma: number
        n: number
        det: number
        ultimaFecha: string
        ultimaPunt: number
      }
    >()
    for (const f of filas) {
      const cur = porCli.get(f.cod_cliente) ?? {
        nombre: null,
        promotor: null,
        localidad: null,
        suma: 0,
        n: 0,
        det: 0,
        ultimaFecha: f.fecha_puntuacion,
        ultimaPunt: f.puntuacion,
      }
      cur.suma += f.puntuacion
      cur.n += 1
      if (f.puntuacion <= 3) cur.det += 1
      // filas vienen ordenadas asc por fecha → la última gana
      cur.ultimaFecha = f.fecha_puntuacion
      cur.ultimaPunt = f.puntuacion
      cur.nombre = f.nombre_cliente ?? cur.nombre
      cur.promotor = f.promotor ?? cur.promotor
      cur.localidad = f.localidad ?? cur.localidad
      porCli.set(f.cod_cliente, cur)
    }
    const clientes: RmdCliente[] = [...porCli.entries()]
      .map(([cod, c]) => ({
        cod_cliente: cod,
        nombre_cliente: c.nombre ?? `Cliente ${cod}`,
        promotor: c.promotor,
        localidad: c.localidad,
        rmd: round2(c.suma / c.n),
        puntuaciones: c.n,
        detractoras: c.det,
        ultima_fecha: c.ultimaFecha,
        ultima_puntuacion: c.ultimaPunt,
      }))
      // peores RMD primero, desempate por más detractoras
      .sort((a, b) => a.rmd - b.rmd || b.detractoras - a.detractoras)

    return {
      data: {
        resumen,
        por_mes,
        distribucion,
        motivos,
        por_promotor,
        clientes,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando el dashboard RMD",
    }
  }
}

/** Puntuaciones individuales de un cliente (para el modal del explorador). */
export async function getRmdPuntuacionesCliente(
  codCliente: number,
): Promise<Result<RmdPunto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("nps_rmd_cliente")
      .select(
        "fecha_puntuacion, fecha_entrega, nro_pedido, puntuacion, motivos, comentario",
      )
      .eq("cod_cliente", codCliente)
      .gte("fecha_puntuacion", `${ANIO}-01-01`)
      .lt("fecha_puntuacion", `${ANIO + 1}-01-01`)
      .order("fecha_puntuacion", { ascending: false })
    if (error) return { error: error.message }
    return { data: (data ?? []) as unknown as RmdPunto[] }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando las puntuaciones del cliente",
    }
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
