"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

// ==================================================================
// Plan Territorial — viajes por semana a una ciudad (13/11/2026)
//
// En una ciudad CERCANA el $/HL de distribución casi no ve un viaje menos: el
// modelo valora el viaje sólo por sus km, y el resto de la distribución se
// reparte por bultos y entregas. Lo que la reestructuración cambia de verdad
// es cuántos días por semana se va. Este indicador lo muestra.
//
// Viaje = un camión (patente) que ese día entregó a `minClientes` clientes o
// más de la ciudad, según las ventas de Chess + Gestión (misma cuenta que la
// iniciativa de Colón). Se cuenta por semana calendario (lunes a domingo) y
// sólo semanas completas: el mes es el promedio de las semanas que empiezan
// en ese mes.
// ==================================================================

type Result<T> = { data: T } | { error: string }

interface ConfigViajes {
  /** `localidad` de `bot_clientes_cache`, como está cargada. */
  localidades: string[]
  /** Meta: viajes por semana como máximo. */
  meta: number
  minClientes: number
}

/** Ciudades con plan que se siguen también por viajes por semana. */
const VIAJES_PLAN: Record<string, ConfigViajes> = {
  // REV.06 (05/10/2026): de lunes a sábado a martes a sábado.
  Ramallo: { localidades: ["RAMALLO", "VILLA RAMALLO"], meta: 5, minClientes: 5 },
}

export interface ViajesCiudad {
  ciudad: string
  meta: number
  minClientes: number
  /** Semanas completas del año: lunes (YYYY-MM-DD) y viajes. */
  semanas: { lunes: string; viajes: number }[]
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getViajesCiudades(
  anio: number,
  ciudades: string[],
): Promise<Result<Record<string, ViajesCiudad>>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const out: Record<string, ViajesCiudad> = {}
    const PAGE = 1000

    // Última semana completa: la que terminó (domingo) antes de hoy.
    const hoy = new Date()
    hoy.setUTCHours(12, 0, 0, 0)
    const finAnio = `${anio}-12-31`

    for (const ciudad of ciudades) {
      const cfg = VIAJES_PLAN[ciudad]
      if (!cfg) continue

      const { data: clientes, error: errCli } = await supabase
        .from("bot_clientes_cache")
        .select("id_cliente")
        .in("localidad", cfg.localidades)
      if (errCli) return { error: `No se pudieron leer los clientes: ${errCli.message}` }
      const ids = ((clientes ?? []) as { id_cliente: string | number }[])
        .map((c) => Number(c.id_cliente))
        .filter((n) => Number.isFinite(n))

      const clientesPorCamion = new Map<string, Set<number>>()
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200)
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("ventas_diarias_cliente")
            .select("fecha, patente, id_cliente")
            .in("origen", ["chess", "gestion"])
            .in("id_cliente", lote)
            .gte("fecha", `${anio}-01-01`)
            .lte("fecha", finAnio)
            .order("fecha", { ascending: true })
            .order("id_cliente", { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) return { error: `No se pudo leer el reparto: ${error.message}` }
          for (const r of (data ?? []) as {
            fecha: string
            patente: string | null
            id_cliente: number
          }[]) {
            const patente = (r.patente ?? "").trim()
            if (!patente) continue
            const k = `${r.fecha}|${patente}`
            const set = clientesPorCamion.get(k) ?? new Set<number>()
            set.add(r.id_cliente)
            clientesPorCamion.set(k, set)
          }
          if (!data || data.length < PAGE) break
        }
      }

      const porSemana = new Map<string, number>()
      for (const [k, set] of clientesPorCamion) {
        if (set.size < cfg.minClientes) continue
        const d = new Date(`${k.slice(0, 10)}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
        const lunes = iso(d)
        porSemana.set(lunes, (porSemana.get(lunes) ?? 0) + 1)
      }

      // Semanas cuyo lunes cae en el año y que ya terminaron.
      const semanas: { lunes: string; viajes: number }[] = []
      const d = new Date(`${anio}-01-01T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)) // primer lunes
      while (d.getUTCFullYear() === anio) {
        const domingo = new Date(d)
        domingo.setUTCDate(domingo.getUTCDate() + 6)
        if (domingo >= hoy) break
        semanas.push({ lunes: iso(d), viajes: porSemana.get(iso(d)) ?? 0 })
        d.setUTCDate(d.getUTCDate() + 7)
      }

      out[ciudad] = { ciudad, meta: cfg.meta, minClientes: cfg.minClientes, semanas }
    }
    return { data: out }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error contando los viajes" }
  }
}
