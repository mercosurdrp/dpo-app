"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

// TLP (Transport Labor Productivity) = Cajas Equivalentes entregadas
//   ────────────────────────────────────────────────────────────────
//                  Σ (horas en ruta × FTE)   [horas-hombre]
//
// Por viaje (patente + fecha):
//   - CEq:      ocupacion_bodega_localidad_diaria (desglosado por localidad → ciudad)
//   - horas:    checklist_vehiculos retorno (tiempo_ruta_minutos = retorno − liberación)
//   - FTE:      registros_vehiculos egreso (1 chofer + ayudantes); fallback 2 si falta
// Cada viaje se imputa a su ciudad PREDOMINANTE (donde entregó más CEq).

const FTE_FALLBACK = 2

export interface TlpFila {
  ciudad: string
  ceq: number
  horas_ruta: number
  horas_hombre: number
  viajes: number
  tlp: number | null // CEq por hora-hombre
}

export interface TlpResumen {
  desde: string
  hasta: string
  total: TlpFila
  por_ciudad: TlpFila[]
  viajes_con_ceq: number
  viajes_sin_tiempo: number // tienen CEq pero no checklist de retorno → excluidos
  viajes_fte_fallback: number // usaron FTE=2 por falta de registro de egreso
}

function normPatente(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase()
}

function fteDeAyudantes(ayudante1: string | null, ayudante2: string | null): number {
  return (
    1 +
    ( (ayudante1 ?? "").trim() !== "" ? 1 : 0) +
    ( (ayudante2 ?? "").trim() !== "" ? 1 : 0)
  )
}

function nuevaFila(ciudad: string): TlpFila {
  return { ciudad, ceq: 0, horas_ruta: 0, horas_hombre: 0, viajes: 0, tlp: null }
}

function cerrarTlp(f: TlpFila): TlpFila {
  return {
    ...f,
    ceq: Math.round(f.ceq),
    horas_ruta: Math.round(f.horas_ruta * 10) / 10,
    horas_hombre: Math.round(f.horas_hombre * 10) / 10,
    tlp: f.horas_hombre > 0 ? Math.round((f.ceq / f.horas_hombre) * 100) / 100 : null,
  }
}

/** Carga el mapeo localidad → ciudad. Localidades sin match → "Otras". */
async function mapaCiudades(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from("dim_localidad_ciudad").select("localidad, ciudad")
  const m = new Map<string, string>()
  for (const r of (data ?? []) as { localidad: string; ciudad: string }[]) {
    m.set(r.localidad.trim().toUpperCase(), r.ciudad)
  }
  return m
}

export async function getTlpMes(
  desde: string,
  hasta: string,
): Promise<{ data: TlpResumen } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [locRes, retRes, egrRes, ciudades] = await Promise.all([
      supabase
        .from("ocupacion_bodega_localidad_diaria")
        .select("patente, fecha, localidad, ceq_total")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("checklist_vehiculos")
        .select("dominio, fecha, tiempo_ruta_minutos")
        .eq("tipo", "retorno")
        .not("tiempo_ruta_minutos", "is", null)
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("registros_vehiculos")
        .select("dominio, fecha, ayudante1, ayudante2")
        .eq("tipo", "egreso")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      mapaCiudades(supabase),
    ])

    if (locRes.error) return { error: locRes.error.message }
    if (retRes.error) return { error: retRes.error.message }
    if (egrRes.error) return { error: egrRes.error.message }

    // Viaje = patente|fecha. CEq total + CEq por ciudad.
    const viajes = new Map<
      string,
      { ceqTotal: number; porCiudad: Map<string, number> }
    >()
    for (const r of (locRes.data ?? []) as {
      patente: string
      fecha: string
      localidad: string
      ceq_total: number
    }[]) {
      const ceq = Number(r.ceq_total) || 0
      if (ceq <= 0) continue
      const key = `${normPatente(r.patente)}|${r.fecha}`
      const ciudad = ciudades.get((r.localidad ?? "").trim().toUpperCase()) ?? "Otras"
      const v = viajes.get(key) ?? { ceqTotal: 0, porCiudad: new Map<string, number>() }
      v.ceqTotal += ceq
      v.porCiudad.set(ciudad, (v.porCiudad.get(ciudad) ?? 0) + ceq)
      viajes.set(key, v)
    }

    // Tiempo en ruta (minutos) por viaje — el mayor del día si hubiera varios.
    const tiempo = new Map<string, number>()
    for (const r of (retRes.data ?? []) as {
      dominio: string
      fecha: string
      tiempo_ruta_minutos: number
    }[]) {
      const key = `${normPatente(r.dominio)}|${r.fecha}`
      const min = Number(r.tiempo_ruta_minutos) || 0
      if (min <= 0) continue
      tiempo.set(key, Math.max(tiempo.get(key) ?? 0, min))
    }

    // FTE por viaje — el mayor del día si hubiera varios egresos.
    const fte = new Map<string, number>()
    for (const r of (egrRes.data ?? []) as {
      dominio: string
      fecha: string
      ayudante1: string | null
      ayudante2: string | null
    }[]) {
      const key = `${normPatente(r.dominio)}|${r.fecha}`
      fte.set(key, Math.max(fte.get(key) ?? 0, fteDeAyudantes(r.ayudante1, r.ayudante2)))
    }

    const total = nuevaFila("Total")
    const porCiudad = new Map<string, TlpFila>()
    let viajesSinTiempo = 0
    let viajesFteFallback = 0

    for (const [key, v] of viajes) {
      const min = tiempo.get(key)
      if (!min) {
        viajesSinTiempo++
        continue // sin tiempo en ruta no hay denominador
      }
      const fteReal = fte.get(key)
      const fteUsado = fteReal ?? FTE_FALLBACK
      if (fteReal == null) viajesFteFallback++
      const horasRuta = min / 60
      const horasHombre = horasRuta * fteUsado

      // ciudad predominante del viaje
      let ciudadPred = "Otras"
      let maxCeq = -1
      for (const [c, ceq] of v.porCiudad) {
        if (ceq > maxCeq) { maxCeq = ceq; ciudadPred = c }
      }

      for (const f of [total, (porCiudad.get(ciudadPred) ?? (() => {
        const nf = nuevaFila(ciudadPred); porCiudad.set(ciudadPred, nf); return nf
      })())]) {
        f.ceq += v.ceqTotal
        f.horas_ruta += horasRuta
        f.horas_hombre += horasHombre
        f.viajes += 1
      }
    }

    const filas = [...porCiudad.values()]
      .map(cerrarTlp)
      .sort((a, b) => b.ceq - a.ceq)

    return {
      data: {
        desde,
        hasta,
        total: cerrarTlp(total),
        por_ciudad: filas,
        viajes_con_ceq: viajes.size,
        viajes_sin_tiempo: viajesSinTiempo,
        viajes_fte_fallback: viajesFteFallback,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error calculando el TLP" }
  }
}

export interface TlpViajeDetalle {
  patente: string
  ciudad: string
  ceq: number
  horas_ruta: number
  fte: number
  fte_fallback: boolean
  horas_hombre: number
  tlp: number | null
}

export async function getTlpDetalleDia(
  fecha: string,
): Promise<{ data: TlpViajeDetalle[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [locRes, retRes, egrRes, ciudades] = await Promise.all([
      supabase
        .from("ocupacion_bodega_localidad_diaria")
        .select("patente, localidad, ceq_total")
        .eq("fecha", fecha),
      supabase
        .from("checklist_vehiculos")
        .select("dominio, tiempo_ruta_minutos")
        .eq("tipo", "retorno")
        .not("tiempo_ruta_minutos", "is", null)
        .eq("fecha", fecha),
      supabase
        .from("registros_vehiculos")
        .select("dominio, ayudante1, ayudante2")
        .eq("tipo", "egreso")
        .eq("fecha", fecha),
      mapaCiudades(supabase),
    ])
    if (locRes.error) return { error: locRes.error.message }
    if (retRes.error) return { error: retRes.error.message }
    if (egrRes.error) return { error: egrRes.error.message }

    const ceqPorViaje = new Map<string, Map<string, number>>()
    for (const r of (locRes.data ?? []) as {
      patente: string
      localidad: string
      ceq_total: number
    }[]) {
      const ceq = Number(r.ceq_total) || 0
      if (ceq <= 0) continue
      const pat = normPatente(r.patente)
      const ciudad = ciudades.get((r.localidad ?? "").trim().toUpperCase()) ?? "Otras"
      const m = ceqPorViaje.get(pat) ?? new Map<string, number>()
      m.set(ciudad, (m.get(ciudad) ?? 0) + ceq)
      ceqPorViaje.set(pat, m)
    }
    const tiempo = new Map<string, number>()
    for (const r of (retRes.data ?? []) as { dominio: string; tiempo_ruta_minutos: number }[]) {
      const pat = normPatente(r.dominio)
      tiempo.set(pat, Math.max(tiempo.get(pat) ?? 0, Number(r.tiempo_ruta_minutos) || 0))
    }
    const fte = new Map<string, number>()
    for (const r of (egrRes.data ?? []) as { dominio: string; ayudante1: string | null; ayudante2: string | null }[]) {
      const pat = normPatente(r.dominio)
      fte.set(pat, Math.max(fte.get(pat) ?? 0, fteDeAyudantes(r.ayudante1, r.ayudante2)))
    }

    const out: TlpViajeDetalle[] = []
    for (const [pat, porCiudad] of ceqPorViaje) {
      const min = tiempo.get(pat)
      const ceqTotal = [...porCiudad.values()].reduce((a, b) => a + b, 0)
      let ciudadPred = "Otras"
      let maxCeq = -1
      for (const [c, ceq] of porCiudad) if (ceq > maxCeq) { maxCeq = ceq; ciudadPred = c }
      const fteReal = fte.get(pat)
      const fteUsado = fteReal ?? FTE_FALLBACK
      const horasRuta = (min ?? 0) / 60
      const horasHombre = horasRuta * fteUsado
      out.push({
        patente: pat,
        ciudad: ciudadPred,
        ceq: Math.round(ceqTotal),
        horas_ruta: Math.round(horasRuta * 100) / 100,
        fte: fteUsado,
        fte_fallback: fteReal == null,
        horas_hombre: Math.round(horasHombre * 100) / 100,
        tlp: horasHombre > 0 ? Math.round((ceqTotal / horasHombre) * 100) / 100 : null,
      })
    }
    out.sort((a, b) => b.ceq - a.ceq)
    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando el detalle del TLP" }
  }
}
