"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Detalle del RMD (Rate My Delivery) de un día para el drill-down del tablero
 * de la matinal. Lee nps_rmd_cliente agrupando por FECHA DE PUNTUACIÓN (mismo
 * criterio que el valor del indicador y el gráfico "RMD por Dia" de Quilmes).
 * Categorías: Detractor (1-3), Neutro (4), Promotor (5).
 */

export type RmdCategoria = "promotor" | "neutro" | "detractor"

export interface RmdClienteRow {
  cod_cliente: number | null
  nombre_cliente: string
  puntuacion: number
  categoria: RmdCategoria
  motivos: string | null
  comentario: string | null
  nro_pedido: string | null
  fecha_entrega: string | null
}

export interface RmdResumenDiaKPIs {
  /** Cantidad de puntuaciones (= clientes que puntuaron ese día). */
  n: number
  /** Promedio de puntuación del día (1-5). Null si no hubo puntuaciones. */
  promedio: number | null
  promotores: number
  neutros: number
  detractores: number
  /** % de detractores sobre el total del día. */
  pct_detractores: number | null
}

export interface RmdResumenDia {
  fecha: string
  kpis: RmdResumenDiaKPIs
  clientes: RmdClienteRow[]
}

function categoria(p: number): RmdCategoria {
  if (p <= 3) return "detractor"
  if (p === 4) return "neutro"
  return "promotor"
}

function limpio(s: string | null): string | null {
  const t = (s ?? "").trim()
  if (!t) return null
  if (["sin comentario", "s/d", "null", "-"].includes(t.toLowerCase())) return null
  return t
}

export async function getRmdResumenDia(
  fecha: string,
): Promise<{ data: RmdResumenDia } | { error: string }> {
  try {
    await requireAuth()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Fecha inválida (esperado YYYY-MM-DD)" }
    }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("nps_rmd_cliente")
      .select(
        "cod_cliente, nombre_cliente, puntuacion, motivos, comentario, nro_pedido, fecha_entrega",
      )
      .eq("fecha_puntuacion", fecha)
    if (error) return { error: error.message }

    const rows = (data ?? []) as Array<{
      cod_cliente: number | null
      nombre_cliente: string | null
      puntuacion: number | null
      motivos: string | null
      comentario: string | null
      nro_pedido: string | null
      fecha_entrega: string | null
    }>

    let sum = 0
    let n = 0
    let promotores = 0
    let neutros = 0
    let detractores = 0
    const clientes: RmdClienteRow[] = []

    for (const r of rows) {
      const p = r.puntuacion == null ? null : Number(r.puntuacion)
      if (p == null || !Number.isFinite(p)) continue
      const cat = categoria(p)
      sum += p
      n += 1
      if (cat === "promotor") promotores += 1
      else if (cat === "neutro") neutros += 1
      else detractores += 1
      clientes.push({
        cod_cliente: r.cod_cliente,
        nombre_cliente: (r.nombre_cliente ?? "").trim() || "(Sin nombre)",
        puntuacion: p,
        categoria: cat,
        motivos: limpio(r.motivos),
        comentario: limpio(r.comentario),
        nro_pedido: r.nro_pedido,
        fecha_entrega: r.fecha_entrega,
      })
    }

    // Ordenar: primero los más bajos (detractores arriba = lo accionable).
    clientes.sort((a, b) => a.puntuacion - b.puntuacion)

    return {
      data: {
        fecha,
        kpis: {
          n,
          promedio: n > 0 ? sum / n : null,
          promotores,
          neutros,
          detractores,
          pct_detractores: n > 0 ? (detractores / n) * 100 : null,
        },
        clientes,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando detalle de RMD",
    }
  }
}
