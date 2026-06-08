"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

export interface RechazoClienteMotivo {
  id_cliente: number | null
  nombre_cliente: string
  hl: number
  bultos: number
  eventos: number
}

/**
 * Clientes que rechazaron por un motivo (id_rechazo) en el rango [desde, hasta]
 * (inclusive). Agrupa la tabla `rechazos` por cliente. Imputado a fecha_venta
 * (mismo criterio que el resumen del día).
 */
export async function getRechazosClientesPorMotivo(
  desde: string,
  hasta: string,
  idRechazo: number,
): Promise<{ data: RechazoClienteMotivo[] } | { error: string }> {
  try {
    await requireAuth()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      return { error: "Fechas inválidas" }
    }
    const supa = await createClient()

    let q = supa
      .from("rechazos")
      .select("id_cliente, nombre_cliente, hl_rechazados, bultos_rechazados")
      .eq("id_rechazo", idRechazo)
    q =
      desde === hasta
        ? q.eq("fecha_venta", desde)
        : q.gte("fecha_venta", desde).lte("fecha_venta", hasta)

    const { data, error } = await q
    if (error) return { error: error.message }

    type Agg = { nombre: string; hl: number; bultos: number; eventos: number }
    const map = new Map<number, Agg>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      const id = r.id_cliente ?? -1
      const nombre = (r.nombre_cliente ?? "").trim() || "(Sin cliente)"
      const hl = Number(r.hl_rechazados ?? 0)
      const b = Number(r.bultos_rechazados ?? 0)
      const ex = map.get(id)
      if (ex) {
        ex.hl += hl
        ex.bultos += b
        ex.eventos += 1
      } else {
        map.set(id, { nombre, hl, bultos: b, eventos: 1 })
      }
    }

    const out: RechazoClienteMotivo[] = [...map.entries()]
      .map(([id, a]) => ({
        id_cliente: id === -1 ? null : id,
        nombre_cliente: a.nombre,
        hl: a.hl,
        bultos: a.bultos,
        eventos: a.eventos,
      }))
      .sort((a, b) => b.bultos - a.bultos)

    return { data: out }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando clientes del motivo",
    }
  }
}
