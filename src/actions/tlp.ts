"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  FTE_FALLBACK,
  fetchViajesTlp,
  fteDeAyudantes,
  mapaCiudades,
  normPatente,
  tlpEvolucionAnual,
  type TlpEvolucionAnual,
} from "@/lib/tlp/calc"

// TLP (Transport Labor Productivity) = Cajas Equivalentes entregadas
//   ────────────────────────────────────────────────────────────────
//                  Σ (horas en ruta × FTE)   [horas-hombre]
//
// Por viaje (patente + fecha):
//   - CEq:      ocupacion_bodega_localidad_diaria (desglosado por localidad → ciudad)
//   - horas:    checklist_vehiculos retorno (tiempo_ruta_minutos = retorno − liberación)
//   - FTE:      registros_vehiculos egreso (1 chofer + ayudantes); fallback 2 si falta
// Cada viaje se imputa a su ciudad PREDOMINANTE (donde entregó más CEq).
// El núcleo del cálculo vive en `@/lib/tlp/calc` (compartido con el Sueño).

export interface TlpFila {
  ciudad: string
  ceq: number
  horas_ruta: number
  horas_hombre: number
  viajes: number
  tlp: number | null // CEq por hora-hombre
}

export interface TlpPatenteFila {
  patente: string
  ceq: number
  horas_ruta: number
  horas_hombre: number
  viajes: number
  tlp: number | null
}

export interface TlpResumen {
  desde: string
  hasta: string
  total: TlpFila
  por_ciudad: TlpFila[]
  por_patente: TlpPatenteFila[]
  viajes_con_ceq: number
  viajes_sin_tiempo: number // tienen CEq pero no checklist de retorno → excluidos
  viajes_fte_fallback: number // usaron FTE=2 por falta de registro de egreso
}

function nuevaFila(ciudad: string): TlpFila {
  return { ciudad, ceq: 0, horas_ruta: 0, horas_hombre: 0, viajes: 0, tlp: null }
}

function cerrarTlp<
  T extends { ceq: number; horas_ruta: number; horas_hombre: number; tlp: number | null },
>(f: T): T {
  return {
    ...f,
    ceq: Math.round(f.ceq),
    horas_ruta: Math.round(f.horas_ruta * 10) / 10,
    horas_hombre: Math.round(f.horas_hombre * 10) / 10,
    tlp: f.horas_hombre > 0 ? Math.round((f.ceq / f.horas_hombre) * 100) / 100 : null,
  }
}

export async function getTlpMes(
  desde: string,
  hasta: string,
): Promise<{ data: TlpResumen } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { viajes, viajesSinTiempo, viajesConCeq } = await fetchViajesTlp(
      supabase,
      desde,
      hasta,
    )

    const total = nuevaFila("Total")
    const porCiudad = new Map<string, TlpFila>()
    const porPatente = new Map<string, TlpPatenteFila>()
    let viajesFteFallback = 0

    for (const v of viajes) {
      if (v.fteFallback) viajesFteFallback++
      const horasHombre = v.horasRuta * v.fte

      for (const f of [total, (porCiudad.get(v.ciudad) ?? (() => {
        const nf = nuevaFila(v.ciudad); porCiudad.set(v.ciudad, nf); return nf
      })())]) {
        f.ceq += v.ceq
        f.horas_ruta += v.horasRuta
        f.horas_hombre += horasHombre
        f.viajes += 1
      }

      // Acumulado por camión (patente del viaje).
      const fp = porPatente.get(v.patente) ?? {
        patente: v.patente, ceq: 0, horas_ruta: 0, horas_hombre: 0, viajes: 0, tlp: null,
      }
      fp.ceq += v.ceq
      fp.horas_ruta += v.horasRuta
      fp.horas_hombre += horasHombre
      fp.viajes += 1
      porPatente.set(v.patente, fp)
    }

    const filas = [...porCiudad.values()]
      .map(cerrarTlp)
      .sort((a, b) => b.ceq - a.ceq)
    const filasPatente = [...porPatente.values()]
      .map(cerrarTlp)
      .sort((a, b) => b.ceq - a.ceq)

    return {
      data: {
        desde,
        hasta,
        total: cerrarTlp(total),
        por_ciudad: filas,
        por_patente: filasPatente,
        viajes_con_ceq: viajesConCeq,
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

// ====================================================================
// Detalle de HORAS EN RUTA por viaje (para el modal "¿cómo se calcula?")
// Cada viaje (patente+fecha): salida (checklist liberación) → retorno
// (checklist retorno) = tiempo_ruta_minutos → horas; FTE de egreso.
// ====================================================================
export interface TlpRutaViaje {
  patente: string
  fecha: string
  ciudad: string
  salida: string | null // ISO timestamptz de la liberación
  retorno: string | null // ISO timestamptz del retorno
  minutos: number
  horas_ruta: number
  fte: number
  fte_fallback: boolean
  horas_hombre: number
  ceq: number
  excluido: boolean // tiene CEq pero sin tiempo de retorno → no cuenta en el TLP
}

export async function getTlpRutaDetalle(
  desde: string,
  hasta: string,
): Promise<{ data: TlpRutaViaje[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [locRes, chkRes, egrRes, ciudades] = await Promise.all([
      supabase
        .from("ocupacion_bodega_localidad_diaria")
        .select("patente, fecha, localidad, ceq_total")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("checklist_vehiculos")
        .select("dominio, fecha, tipo, hora, tiempo_ruta_minutos")
        .in("tipo", ["liberacion", "retorno"])
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
    if (chkRes.error) return { error: chkRes.error.message }
    if (egrRes.error) return { error: egrRes.error.message }

    // CEq por viaje + ciudad predominante.
    const viajes = new Map<string, { ceqTotal: number; porCiudad: Map<string, number> }>()
    for (const r of (locRes.data ?? []) as {
      patente: string; fecha: string; localidad: string; ceq_total: number
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

    // Horas de checklist: retorno (minutos + hora) y liberación (hora de salida).
    const retorno = new Map<string, { min: number; hora: string | null }>()
    const salida = new Map<string, string | null>()
    for (const r of (chkRes.data ?? []) as {
      dominio: string; fecha: string; tipo: string
      hora: string | null; tiempo_ruta_minutos: number | null
    }[]) {
      const key = `${normPatente(r.dominio)}|${r.fecha}`
      if (r.tipo === "retorno") {
        const min = Number(r.tiempo_ruta_minutos) || 0
        const prev = retorno.get(key)
        if (!prev || min > prev.min) retorno.set(key, { min, hora: r.hora ?? null })
      } else {
        const prev = salida.get(key)
        if (prev == null || (r.hora && r.hora < prev)) salida.set(key, r.hora ?? prev ?? null)
      }
    }

    const fte = new Map<string, number>()
    for (const r of (egrRes.data ?? []) as {
      dominio: string; fecha: string; ayudante1: string | null; ayudante2: string | null
    }[]) {
      const key = `${normPatente(r.dominio)}|${r.fecha}`
      fte.set(key, Math.max(fte.get(key) ?? 0, fteDeAyudantes(r.ayudante1, r.ayudante2)))
    }

    const out: TlpRutaViaje[] = []
    for (const [key, v] of viajes) {
      const [patente, fecha] = key.split("|")
      let ciudadPred = "Otras"
      let maxCeq = -1
      for (const [c, ceq] of v.porCiudad) if (ceq > maxCeq) { maxCeq = ceq; ciudadPred = c }
      const ret = retorno.get(key)
      const min = ret?.min ?? 0
      const fteReal = fte.get(key)
      const fteUsado = fteReal ?? FTE_FALLBACK
      const horasRuta = min / 60
      out.push({
        patente,
        fecha,
        ciudad: ciudadPred,
        salida: salida.get(key) ?? null,
        retorno: ret?.hora ?? null,
        minutos: min,
        horas_ruta: Math.round(horasRuta * 100) / 100,
        fte: fteUsado,
        fte_fallback: fteReal == null,
        horas_hombre: Math.round(horasRuta * fteUsado * 100) / 100,
        ceq: Math.round(v.ceqTotal),
        excluido: min <= 0,
      })
    }
    out.sort((a, b) =>
      Number(a.excluido) - Number(b.excluido) ||
      (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0) ||
      b.ceq - a.ceq,
    )
    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando el detalle de horas en ruta" }
  }
}

/** Cuadro anual: TLP por ciudad × mes, para el bloque "Objetivo por ciudad". */
export async function getTlpEvolucion(
  anio: number,
): Promise<{ data: TlpEvolucionAnual } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const data = await tlpEvolucionAnual(supabase, anio)
    return { data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error calculando la evolución del TLP" }
  }
}
