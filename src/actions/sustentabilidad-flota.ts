"use server"

// PI de sostenibilidad de la flota (punto 4.3 del pilar Flota).
//
// El R4.3.2 pide elegir un KPI/PI por su impacto ecológico, y la guía agrega que
// tiene que mostrar tendencia positiva sobre los últimos 3 meses. El PI elegido
// por el lado de las emisiones es kg de CO2 cada 100 km.
//
// 🚨 El CO2 NO se mide con un sensor: se calcula desde el gasoil quemado, que ya
// se carga por unidad en el módulo de combustible. Es el método estándar para
// reportar alcance 1 (combustión propia): litros × factor de emisión.
//
// El segundo PI —recuperación de cubiertas por recapado— se calcula en el
// cliente, con los datos de neumáticos que la pantalla ya recibe.

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Kg de CO2 por litro de gasoil quemado. Factor de combustión de diésel
 * (DEFRA / IPCC, ~2,68 kg CO2/L): es el que se usa para alcance 1 y el que hay
 * que citar como fuente ante la auditoría. Si algún día entra una unidad a GNC
 * o eléctrica, este número deja de servirle a esa unidad.
 */
export const KG_CO2_POR_LITRO_DIESEL = 2.68

export interface MesSustentabilidad {
  mes: string
  litros: number
  km: number
  cargas: number
  co2Kg: number
  /** El PI: kg de CO2 cada 100 km. `null` si el mes no tiene km cargados. */
  co2Por100Km: number | null
}

export interface UnidadSustentabilidad {
  dominio: string
  litros: number
  km: number
  co2Kg: number
  co2Por100Km: number | null
}

export interface SustentabilidadFlota {
  factor: number
  porMes: MesSustentabilidad[]
  porUnidad: UnidadSustentabilidad[]
  /** Totales del año en curso. */
  anio: { litros: number; km: number; co2Kg: number; co2Por100Km: number | null }
}

function agregado(litros: number, km: number) {
  const co2Kg = litros * KG_CO2_POR_LITRO_DIESEL
  return {
    litros: Math.round(litros * 10) / 10,
    km: Math.round(km),
    co2Kg: Math.round(co2Kg),
    co2Por100Km: km > 0 ? Math.round((co2Kg / km) * 100 * 10) / 10 : null,
  }
}

export async function getSustentabilidadFlota(
  desde?: string
): Promise<{ data: SustentabilidadFlota } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // 13 meses hacia atrás por defecto: alcanza para la tendencia de 3 meses que
    // pide la guía y para comparar contra el mismo mes del año anterior.
    const hoy = new Date().toISOString().slice(0, 10)
    const inicio = desde ?? `${Number(hoy.slice(0, 4)) - 1}-${hoy.slice(5, 7)}-01`

    // PostgREST topea en 1000: se pagina. Son ~300 cargas por año, pero la
    // ventana crece y una página perdida bajaría el CO2 sin avisar.
    const PAGE = 1000
    const filas: Array<{
      dominio: string
      fecha: string
      litros: number | null
      km_recorridos: number | null
    }> = []
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await supabase
        .from("registro_combustible")
        .select("dominio, fecha, litros, km_recorridos")
        .gte("fecha", inicio)
        .order("fecha", { ascending: true })
        .range(off, off + PAGE - 1)
      if (error) return { error: error.message }
      const page = (data || []) as typeof filas
      filas.push(...page)
      if (page.length < PAGE) break
    }

    const anioActual = hoy.slice(0, 4)
    const mesMap = new Map<string, { litros: number; km: number; cargas: number }>()
    const domMap = new Map<string, { litros: number; km: number }>()
    let litrosAnio = 0
    let kmAnio = 0

    for (const f of filas) {
      const litros = Number(f.litros || 0)
      const km = Number(f.km_recorridos || 0)
      const mes = f.fecha.slice(0, 7)

      if (!mesMap.has(mes)) mesMap.set(mes, { litros: 0, km: 0, cargas: 0 })
      const m = mesMap.get(mes)!
      m.litros += litros
      m.km += km
      m.cargas++

      if (!domMap.has(f.dominio)) domMap.set(f.dominio, { litros: 0, km: 0 })
      const d = domMap.get(f.dominio)!
      d.litros += litros
      d.km += km

      if (f.fecha.slice(0, 4) === anioActual) {
        litrosAnio += litros
        kmAnio += km
      }
    }

    const porMes = Array.from(mesMap.entries())
      .map(([mes, v]) => ({ mes, cargas: v.cargas, ...agregado(v.litros, v.km) }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    const porUnidad = Array.from(domMap.entries())
      .map(([dominio, v]) => ({ dominio, ...agregado(v.litros, v.km) }))
      .sort((a, b) => b.co2Kg - a.co2Kg)

    return {
      data: {
        factor: KG_CO2_POR_LITRO_DIESEL,
        porMes,
        porUnidad,
        anio: agregado(litrosAnio, kmAnio),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
