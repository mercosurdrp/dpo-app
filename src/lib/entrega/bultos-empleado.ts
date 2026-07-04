// Bultos distribuidos por EMPLEADO (chofer o ayudante), para "Visibilidad de
// Resultados" (DPO Entrega 2.1). Métrica de CAMIÓN: chofer y ayudante del
// mismo camión ven los mismos bultos (sin prorrateo).
//
// Resolución por día (más precisa que el resumen de mi-entrega.ts, que junta
// las patentes de todo el mes): una venta de la patente P del día D se
// atribuye al empleado si ese día D él figuraba en el egreso TML de P
// (chofer/ayudante1/ayudante2, vía mapeo_empleado_chofer), o si P está en su
// mapeo estático de fletero (mapeo_empleado_fletero, cuenta todos los días).

import type { SupabaseClient } from "@supabase/supabase-js"

export interface BultosEmpleadoRango {
  /** Tiene algún mapeo a camión (chofer o fletero). */
  vinculado: boolean
  nombre_chofer: string | null
  total_bultos: number
  dias_con_entrega: number
  /** "YYYY-MM-DD" → bultos del día. */
  por_dia: Map<string, number>
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, " ").trim()
}

const PAGE = 1000

async function fetchPaginado<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

interface RegistroRow {
  fecha: string
  dominio: string | null
  tipo: string
  chofer: string | null
  ayudante1: string | null
  ayudante2: string | null
}

interface VentaRow {
  fecha: string
  ds_fletero_carga: string | null
  total_bultos: number | null
}

/**
 * Bultos por día para VARIOS empleados a la vez (vista equipo y también la
 * individual, pasando un solo id): resuelve todo con 4 lecturas paginadas,
 * sin N×M de queries.
 */
export async function getBultosRangoEmpleados(
  admin: SupabaseClient,
  empleadoIds: string[],
  desde: string,
  hasta: string,
): Promise<Map<string, BultosEmpleadoRango>> {
  const out = new Map<string, BultosEmpleadoRango>()
  if (empleadoIds.length === 0) return out

  const [choferMaps, fleteroMaps, registros, ventas] = await Promise.all([
    fetchPaginado<{ empleado_id: string; nombre_chofer: string | null }>((a, b) =>
      admin
        .from("mapeo_empleado_chofer")
        .select("empleado_id, nombre_chofer")
        .in("empleado_id", empleadoIds)
        .order("empleado_id")
        .range(a, b),
    ),
    fetchPaginado<{ empleado_id: string; ds_fletero_carga: string | null }>((a, b) =>
      admin
        .from("mapeo_empleado_fletero")
        .select("empleado_id, ds_fletero_carga")
        .in("empleado_id", empleadoIds)
        .order("empleado_id")
        .range(a, b),
    ),
    fetchPaginado<RegistroRow>((a, b) =>
      admin
        .from("registros_vehiculos")
        .select("fecha, dominio, tipo, chofer, ayudante1, ayudante2")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id")
        .range(a, b),
    ),
    fetchPaginado<VentaRow>((a, b) =>
      admin
        .from("ventas_diarias")
        .select("fecha, ds_fletero_carga, total_bultos")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id")
        .range(a, b),
    ),
  ])

  // Índices de mapeos por empleado.
  const choferPorEmpleado = new Map<string, string>()
  for (const m of choferMaps) {
    if (m.nombre_chofer && !choferPorEmpleado.has(m.empleado_id)) {
      choferPorEmpleado.set(m.empleado_id, m.nombre_chofer)
    }
  }
  const fleterosPorEmpleado = new Map<string, Set<string>>()
  for (const m of fleteroMaps) {
    if (!m.ds_fletero_carga) continue
    let set = fleterosPorEmpleado.get(m.empleado_id)
    if (!set) {
      set = new Set()
      fleterosPorEmpleado.set(m.empleado_id, set)
    }
    set.add(norm(m.ds_fletero_carga))
  }

  // Índice TML: nombre (chofer o ayudante, normalizado) → set de "fecha|patente".
  const diasPatentePorNombre = new Map<string, Set<string>>()
  for (const r of registros) {
    if (!r.dominio) continue
    const key = `${r.fecha}|${norm(r.dominio)}`
    for (const nombre of [r.chofer, r.ayudante1, r.ayudante2]) {
      const n = norm(nombre)
      if (!n) continue
      let set = diasPatentePorNombre.get(n)
      if (!set) {
        set = new Set()
        diasPatentePorNombre.set(n, set)
      }
      set.add(key)
    }
  }

  // Ventas indexadas por "fecha|patente" (agregando duplicados).
  const ventasPorDiaPatente = new Map<string, number>()
  for (const v of ventas) {
    const bultos = Number(v.total_bultos ?? 0)
    if (!Number.isFinite(bultos) || !v.ds_fletero_carga) continue
    const key = `${v.fecha}|${norm(v.ds_fletero_carga)}`
    ventasPorDiaPatente.set(key, (ventasPorDiaPatente.get(key) ?? 0) + bultos)
  }

  for (const id of empleadoIds) {
    const nombreChofer = choferPorEmpleado.get(id) ?? null
    const fleteros = fleterosPorEmpleado.get(id) ?? new Set<string>()
    const vinculado = nombreChofer !== null || fleteros.size > 0
    const porDia = new Map<string, number>()

    if (vinculado) {
      // Días-patente en los que el empleado estuvo arriba del camión (TML).
      const claves = new Set<string>(
        nombreChofer ? (diasPatentePorNombre.get(norm(nombreChofer)) ?? []) : [],
      )
      // Patentes estáticas de fletero: cuentan todos los días del rango.
      if (fleteros.size > 0) {
        for (const key of ventasPorDiaPatente.keys()) {
          const patente = key.slice(key.indexOf("|") + 1)
          if (fleteros.has(patente)) claves.add(key)
        }
      }
      for (const key of claves) {
        const bultos = ventasPorDiaPatente.get(key)
        if (!bultos) continue
        const fecha = key.slice(0, 10)
        porDia.set(fecha, (porDia.get(fecha) ?? 0) + bultos)
      }
    }

    let total = 0
    for (const b of porDia.values()) total += b
    out.set(id, {
      vinculado,
      nombre_chofer: nombreChofer,
      total_bultos: Math.round(total),
      dias_con_entrega: porDia.size,
      por_dia: porDia,
    })
  }

  return out
}
