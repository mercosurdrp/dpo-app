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
//
// Los tipos y el factor viven en lib/vehiculos/sustentabilidad.ts: un archivo
// "use server" sólo puede exportar funciones async.

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { leerClave } from "@/lib/clima-store"
import { HUELLA_PARAMS_DEFAULT, type HuellaParams } from "@/lib/huella/definiciones"
import {
  agregadoCo2,
  KG_CO2_POR_LITRO_DIESEL,
  type SustentabilidadFlota,
} from "@/lib/vehiculos/sustentabilidad"

/**
 * El factor de emisión del gasoil, tomado de donde lo toma /huella-carbono:
 * `app_config` bajo "huella:params", con el default del módulo de huella como
 * respaldo. Las dos pantallas informan el CO2 de la MISMA flota, así que el
 * factor tiene que ser uno solo.
 */
export async function factorGasoil(): Promise<number> {
  try {
    const guardado = await leerClave<Partial<HuellaParams>>("huella:params")
    const fe = Number(guardado?.feGasoil ?? HUELLA_PARAMS_DEFAULT.feGasoil)
    return Number.isFinite(fe) && fe > 0 ? fe : KG_CO2_POR_LITRO_DIESEL
  } catch {
    return KG_CO2_POR_LITRO_DIESEL
  }
}

export async function getSustentabilidadFlota(
  desde?: string
): Promise<{ data: SustentabilidadFlota } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const factor = await factorGasoil()

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
      .map(([mes, v]) => ({ mes, cargas: v.cargas, ...agregadoCo2(v.litros, v.km, factor) }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    const porUnidad = Array.from(domMap.entries())
      .map(([dominio, v]) => ({ dominio, ...agregadoCo2(v.litros, v.km, factor) }))
      .sort((a, b) => b.co2Kg - a.co2Kg)

    return {
      data: {
        factor,
        porMes,
        porUnidad,
        anio: agregadoCo2(litrosAnio, kmAnio, factor),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
