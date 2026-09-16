"use server"

import { esCargaSinRegistrar, medianasPorDominio } from "@/lib/vehiculos/combustible-limpio"
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { TIPO_CARGA_GASOIL } from "@/lib/vehiculos/tipos-carga"

/**
 * KPI físico de las iniciativas de ahorro de combustible: km recorridos por
 * litro cargado, mes a mes, para el grupo de camiones al que apunta la
 * iniciativa.
 *
 * Es el equivalente de `presupuesto-perdidas-kpi` pero para flota: mismo
 * contrato (Record indexado + serie mensual + acumulado) para que la tarjeta
 * de la iniciativa lo dibuje con el mismo bloque de gráfico.
 *
 * 🚨 El rendimiento se calcula como razón de sumas (Σkm / Σlitros del mes), NO
 * como promedio de los rendimientos de cada carga: una carga corta con el
 * tanque a medio llenar pesaría igual que un viaje largo y distorsiona.
 *
 * 🚨 Se descartan las cargas con rendimiento implausible: por debajo de 2 km/l
 * (cargas duplicadas el mismo día, tanque no lleno: dan 0,06 km/l) o por
 * encima de 1,4× la mediana del camión (odómetro salteado porque falta
 * registrar la carga anterior: da 5, 8 o 10 km/l). La línea base del
 * seguimiento Q2-2026 se calculó con techo fijo de 6 km/l; el techo relativo
 * es más estricto y se adoptó el 31/08/2026 (ver `combustible-limpio.ts`).
 */

type Result<T> = { data: T } | { error: string }

/**
 * Dominios que mide cada iniciativa, por nombre de su KPI (en mayúsculas).
 *
 * 🚨 Los limitadores terminaron colocándose en LOS 11 CAMIONES de distribución,
 * no sólo en los 4 de larga distancia con los que arrancó la iniciativa, así que
 * el KPI mide la flota entera: dejar afuera 7 camiones intervenidos sería medir
 * la mitad del efecto. Son los `catalogo_vehiculos` con tipo `camion` y sector
 * `distribucion` activos; si entra o sale un camión, esta lista se actualiza a
 * mano (no se lee de la tabla para que el KPI histórico no cambie solo).
 */
const DOMINIOS_POR_KPI: Record<string, string[]> = {
  "RENDIMIENTO COMBUSTIBLE FLOTA DE DISTRIBUCIÓN": [
    "AC165AJ",
    "AE591EI",
    "AE908DF",
    "AE908DG",
    "AE908DH",
    "AF028YB",
    "AF399KY",
    "AF469UR",
    "AF588SU",
    "AF664NY",
    "OJA403",
  ],
}

/**
 * Subconjunto que YA tiene la mejora instalada, para poder separarlo del resto
 * y usar los camiones sin intervenir como grupo de control. Si la lista está
 * vacía (o es igual al grupo), la tarjeta dibuja una sola serie.
 */
const DOMINIOS_INTERVENIDOS_POR_KPI: Record<string, string[]> = {
  // Vacío a propósito: el 06-jul-2026 quedaron limitados los 11 camiones, así
  // que no hay grupo de control contra el cual separar una serie. La única
  // comparación posible es contra el Q2 previo a la instalación.
  "RENDIMIENTO COMBUSTIBLE FLOTA DE DISTRIBUCIÓN": [],
}

/**
 * Iniciativas de VIAJES: las que ahorran km porque se va menos veces a un
 * destino. El KPI es viajes por semana a la localidad (Foxtrot: rutas del día
 * con paradas completadas en esa localidad, la haga la ruta que la haga), y
 * el ahorro son los viajes que no se hicieron contra la línea base, en km y
 * de ahí en litros y en plata.
 *
 * 🚨 Colón: la línea base NO es 5. Desde abril de 2026 se fue 4 días por
 * semana (mar-vie); el quinto día de la ruta 10 era un reparto local de ~75 km
 * en San Nicolás/Ramallo, no un viaje a Colón. El esquema de 3 días (mar/mié/
 * vie) se sostiene desde la semana del 10/08/2026, la misma fecha del plan
 * territorial 5.1. El viaje son ~280 km lo haga la 10, la 26, la 14 o la 12.
 */
interface KpiViajesConfig {
  /** `localidad` de `bot_clientes_cache` (en mayúsculas, como está cargada). */
  localidad: string
  /** km de ida y vuelta de un viaje (plan de Foxtrot, promedio 2026). */
  kmViaje: number
  /** Paradas mínimas en la localidad para que una ruta cuente como viaje. */
  minParadas: number
  /**
   * km/l con el que se valorizan los km evitados: la línea base de la flota
   * de distribución (Q2-2026, misma que la iniciativa de limitadores). Se
   * usa la base y no el real del mes para no mezclar dos iniciativas.
   */
  rendimientoBase: number
}

const VIAJES_POR_KPI: Record<string, KpiViajesConfig> = {
  "VIAJES A COLÓN POR SEMANA": {
    localidad: "COLON",
    kmViaje: 280,
    minParadas: 5,
    rendimientoBase: 3.53,
  },
}

/**
 * Piso de rendimiento plausible para un camión de reparto/larga distancia. El
 * techo no es fijo: es 1,4× la mediana del camión (`esCargaSinRegistrar`).
 */
const REND_MIN = 2

/**
 * Ahorro en plata de la iniciativa, estimado desde el rendimiento físico.
 *
 * `registro_combustible.costo_total` no sirve para esto: desde junio nadie lo
 * carga y lo poco cargado es basura (cargas de 154 lts con $2.359 total). En su
 * lugar: litros EVITADOS (los km recorridos a la línea base menos los litros
 * realmente cargados) valorizados al precio del gasoil de la tarjeta Axion,
 * NETO de IVA — el IVA es crédito fiscal, no costo, y el neto es lo comparable
 * con el EERR.
 */
export interface AhorroCombustibleMes {
  mes: number
  km: number
  litros: number
  /** Litros que se habrían quemado a la línea base (km ÷ base). */
  litrosBase: number
  litrosEvitados: number
  /** $/litro Axion neto de IVA. null si el año no tiene la serie cargada. */
  precioLitro: number | null
  pesos: number | null
  /**
   * Sólo en modo viajes: la cuenta completa del mes, para auditar. Los km de
   * arriba son los EVITADOS (viajes evitados × km por viaje), no recorridos.
   */
  viajes?: {
    semanas: number
    viajesBase: number
    viajesReales: number
    viajesEvitados: number
    kmViaje: number
    rendimientoBase: number
  }
}

export interface AhorroCombustible {
  /** Primer día computado: el siguiente a la instalación. */
  desde: string
  lineaBase: number
  meses: AhorroCombustibleMes[]
  litrosEvitadosAcum: number
  /** null si ningún mes tiene precio (sin EERR cargado). */
  pesosAcum: number | null
}

export interface KpiCombustibleMes {
  mes: number
  /**
   * km/l del grupo completo (modo rendimiento) o viajes por semana (modo
   * viajes). null si el mes no tuvo dato.
   */
  real: number | null
  /** Modo viajes: viajes contados y semanas hábiles computadas del mes. */
  viajes?: number
  semanas?: number
  /** km/l de los camiones ya intervenidos. null si no hay dato ese mes. */
  intervenidos: number | null
  /** km/l de los camiones sin intervenir (grupo de control). */
  control: number | null
  km: number
  litros: number
  cargas: number
}

export interface KpiCombustible {
  /** Qué mide la serie: km/l de un grupo de camiones o viajes por semana. */
  modo: "rendimiento" | "viajes"
  /** Modo viajes: a dónde se viaja y cuánto es el viaje. */
  viajes?: { localidad: string; kmViaje: number; rendimientoBase: number }
  meses: KpiCombustibleMes[]
  /** Acumulado del año: razón de sumas, no promedio de los meses. */
  realAcum: number | null
  intervenidosAcum: number | null
  controlAcum: number | null
  dominios: string[]
  dominiosIntervenidos: string[]
  /** Cargas descartadas por rendimiento implausible (para auditar el dato). */
  cargasDescartadas: number
  /**
   * Ahorro estimado desde la instalación. null si la iniciativa no tiene
   * fecha de implementación o línea base cargadas.
   */
  ahorro: AhorroCombustible | null
}

interface FilaCarga {
  fecha: string
  dominio: string
  km_recorridos: number | null
  litros: number | null
  rendimiento: number | null
}

function ratio(km: number, litros: number): number | null {
  if (litros <= 0) return null
  return Math.round((km / litros) * 100) / 100
}

/**
 * Precio del gasoil por mes de 2026, NETO de IVA, de la tarjeta Axion con la
 * que carga la flota (índice 0 = enero).
 *
 * Ene-jun son los precios REALES de las transacciones de la tarjeta; jul-dic
 * es la proyección del ajuste presupuestario de gasoil (jun 1.977 $/l +2,5 %
 * por mes) — el mismo modelo que quedó en la hoja FORECAST del EERR, así que
 * el ahorro se valoriza con la misma vara que el forecast aprobado. NO usar el
 * precio del P×Q original ($1.447 +2 %/mes): quedó ~20 % abajo del real desde
 * la suba de feb-2026. Cuando cierre el precio real de un mes proyectado, se
 * actualiza acá a mano.
 */
const PRECIOS_GASOIL_NETO_2026 = [
  1567, 1570, 1720, 1950, 1966, 1977, 2026, 2077, 2129, 2182, 2237, 2293,
]

function getPreciosGasoil(anio: number): (number | null)[] | null {
  return anio === 2026 ? PRECIOS_GASOIL_NETO_2026 : null
}

interface IniciativaCombustible {
  fecha_implementacion: string | null
  lineaBase: number | null
}

export async function getKpiCombustible(
  anio: number,
): Promise<Result<Record<string, KpiCombustible>>> {
  await requireAuth()

  const kpis = Object.keys(DOMINIOS_POR_KPI)
  const todosLosDominios = [
    ...new Set(Object.values(DOMINIOS_POR_KPI).flat()),
  ]
  if (todosLosDominios.length === 0) return { data: {} }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("registro_combustible")
    .select("fecha, dominio, km_recorridos, litros, rendimiento")
    .eq("tipo_combustible", TIPO_CARGA_GASOIL)
    .in("dominio", todosLosDominios)
    .gte("fecha", `${anio}-01-01`)
    .lte("fecha", `${anio}-12-31`)
    .order("fecha", { ascending: true })

  if (error) {
    return { error: `No se pudo leer el registro de combustible: ${error.message}` }
  }

  // Fecha de instalación y línea base de cada iniciativa, para el ahorro.
  const { data: inis } = await supabase
    .from("presupuestos_iniciativas")
    .select("kpi_nombre, fecha_implementacion, kpi_linea_base")
    .eq("anio", anio)
    .not("kpi_nombre", "is", null)
  const iniPorKpi = new Map<string, IniciativaCombustible>()
  for (const i of inis ?? []) {
    if (!i.kpi_nombre) continue
    iniPorKpi.set(i.kpi_nombre.trim().toUpperCase(), {
      fecha_implementacion: i.fecha_implementacion,
      lineaBase: i.kpi_linea_base,
    })
  }

  const preciosGasoil = getPreciosGasoil(anio)

  const filas = (data ?? []) as FilaCarga[]
  const out: Record<string, KpiCombustible> = {}

  for (const kpi of kpis) {
    const dominios = DOMINIOS_POR_KPI[kpi]
    const intervenidos = DOMINIOS_INTERVENIDOS_POR_KPI[kpi] ?? []
    const delGrupo = filas.filter((f) => dominios.includes(f.dominio))
    // 🚨 El techo fijo de 6 km/l dejaba pasar tramos de 5,2-5,7 en camiones que
    // rinden 3,5: son cargas sin registrar y en agosto de 2026 inflaban el KPI
    // (3,76 en vez de 3,65 en larga distancia). Ahora el techo es 1,4× la
    // mediana de cada camión sobre el año (ver `combustible-limpio.ts`).
    const medianasGrupo = medianasPorDominio(delGrupo)
    const esImplausible = (f: FilaCarga) =>
      f.rendimiento === null || f.rendimiento < REND_MIN || esCargaSinRegistrar(f, medianasGrupo)

    // Acumuladores por mes (1-12) y por sub-grupo.
    const acum = new Map<
      number,
      {
        km: number
        litros: number
        cargas: number
        kmInt: number
        litrosInt: number
        kmCtl: number
        litrosCtl: number
      }
    >()
    let cargasDescartadas = 0

    for (const f of delGrupo) {
      const km = f.km_recorridos
      const litros = f.litros
      // Sin delta de odómetro o sin litros no hay rendimiento que calcular.
      if (km === null || litros === null || litros <= 0) continue
      if (esImplausible(f)) {
        cargasDescartadas++
        continue
      }

      const mes = Number(f.fecha.slice(5, 7))
      if (!Number.isFinite(mes) || mes < 1 || mes > 12) continue

      const a =
        acum.get(mes) ??
        {
          km: 0,
          litros: 0,
          cargas: 0,
          kmInt: 0,
          litrosInt: 0,
          kmCtl: 0,
          litrosCtl: 0,
        }
      a.km += km
      a.litros += litros
      a.cargas++
      if (intervenidos.includes(f.dominio)) {
        a.kmInt += km
        a.litrosInt += litros
      } else {
        a.kmCtl += km
        a.litrosCtl += litros
      }
      acum.set(mes, a)
    }

    if (acum.size === 0) continue

    const meses: KpiCombustibleMes[] = [...acum.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([mes, a]) => ({
        mes,
        real: ratio(a.km, a.litros),
        intervenidos: ratio(a.kmInt, a.litrosInt),
        control: ratio(a.kmCtl, a.litrosCtl),
        km: a.km,
        litros: Math.round(a.litros),
        cargas: a.cargas,
      }))

    const tot = [...acum.values()].reduce(
      (s, a) => ({
        km: s.km + a.km,
        litros: s.litros + a.litros,
        kmInt: s.kmInt + a.kmInt,
        litrosInt: s.litrosInt + a.litrosInt,
        kmCtl: s.kmCtl + a.kmCtl,
        litrosCtl: s.litrosCtl + a.litrosCtl,
      }),
      { km: 0, litros: 0, kmInt: 0, litrosInt: 0, kmCtl: 0, litrosCtl: 0 },
    )

    // Ahorro: sólo las cargas POSTERIORES al día de la instalación (una carga
    // del mismo día puede ser combustible quemado sin la mejora). El mes de la
    // instalación entra parcial: se cuentan sus km y litros desde ese corte.
    let ahorro: AhorroCombustible | null = null
    const ini = iniPorKpi.get(kpi)
    if (ini?.fecha_implementacion && ini.lineaBase && ini.lineaBase > 0) {
      const base = ini.lineaBase
      const desdeDate = new Date(`${ini.fecha_implementacion}T12:00:00`)
      desdeDate.setDate(desdeDate.getDate() + 1)
      const desde = desdeDate.toISOString().slice(0, 10)
      const porMes = new Map<number, { km: number; litros: number }>()
      for (const f of delGrupo) {
        if (f.fecha < desde) continue
        const km = f.km_recorridos
        const litros = f.litros
        if (km === null || litros === null || litros <= 0) continue
        if (esImplausible(f)) continue
        const mes = Number(f.fecha.slice(5, 7))
        if (!Number.isFinite(mes) || mes < 1 || mes > 12) continue
        const a = porMes.get(mes) ?? { km: 0, litros: 0 }
        a.km += km
        a.litros += litros
        porMes.set(mes, a)
      }
      if (porMes.size > 0) {
        const mesesAhorro: AhorroCombustibleMes[] = [...porMes.entries()]
          .sort((x, y) => x[0] - y[0])
          .map(([mes, a]) => {
            const litrosBase = a.km / base
            const litrosEvitados = litrosBase - a.litros
            const precioLitro = preciosGasoil?.[mes - 1] ?? null
            return {
              mes,
              km: Math.round(a.km),
              litros: Math.round(a.litros),
              litrosBase: Math.round(litrosBase),
              litrosEvitados: Math.round(litrosEvitados),
              precioLitro,
              pesos:
                precioLitro !== null
                  ? Math.round(litrosEvitados * precioLitro)
                  : null,
            }
          })
        const conPrecio = mesesAhorro.filter((m) => m.pesos !== null)
        ahorro = {
          desde,
          lineaBase: base,
          meses: mesesAhorro,
          litrosEvitadosAcum: mesesAhorro.reduce(
            (s, m) => s + m.litrosEvitados,
            0,
          ),
          pesosAcum:
            conPrecio.length > 0
              ? conPrecio.reduce((s, m) => s + (m.pesos ?? 0), 0)
              : null,
        }
      }
    }

    out[kpi] = {
      modo: "rendimiento",
      meses,
      realAcum: ratio(tot.km, tot.litros),
      intervenidosAcum: ratio(tot.kmInt, tot.litrosInt),
      controlAcum: ratio(tot.kmCtl, tot.litrosCtl),
      dominios,
      dominiosIntervenidos: intervenidos,
      cargasDescartadas,
      ahorro,
    }
  }

  // ---------------------------------------------------------------------
  // Modo viajes: viajes por semana a una localidad, contados en Foxtrot.
  // ---------------------------------------------------------------------
  for (const [kpi, cfg] of Object.entries(VIAJES_POR_KPI)) {
    const serie = await serieViajes(supabase, anio, cfg)
    if ("error" in serie) return { error: serie.error }
    const { viajesPorDia, desdeDatos, hastaDatos } = serie.data
    if (!desdeDatos || !hastaDatos) continue

    const viajesEntre = (d1: string, d2: string) => {
      let n = 0
      for (const [f, v] of viajesPorDia) if (f >= d1 && f <= d2) n += v
      return n
    }

    const meses: KpiCombustibleMes[] = []
    let totViajes = 0
    let totSemanas = 0
    for (let mes = 1; mes <= 12; mes++) {
      const ini = `${anio}-${String(mes).padStart(2, "0")}-01`
      const fin = finDeMes(anio, mes)
      // Sólo meses con datos de Foxtrot: antes del primer día sincronizado el
      // cero no es "no se fue", es "no hay dato".
      const d1 = ini < desdeDatos ? desdeDatos : ini
      const d2 = fin > hastaDatos ? hastaDatos : fin
      if (d1 > d2) continue
      const semanas = diasHabiles(d1, d2) / 5
      if (semanas <= 0) continue
      const viajes = viajesEntre(d1, d2)
      totViajes += viajes
      totSemanas += semanas
      meses.push({
        mes,
        real: Math.round((viajes / semanas) * 100) / 100,
        viajes,
        semanas: Math.round(semanas * 10) / 10,
        intervenidos: null,
        control: null,
        km: viajes * cfg.kmViaje,
        litros: 0,
        cargas: viajes,
      })
    }
    if (meses.length === 0) continue

    // Ahorro: viajes evitados contra la línea base desde el día del cambio de
    // esquema (inclusive: el esquema rige desde ese lunes, no hay "carga del
    // mismo día" como en combustible).
    let ahorro: AhorroCombustible | null = null
    const iniDef = iniPorKpi.get(kpi)
    if (iniDef?.fecha_implementacion && iniDef.lineaBase && iniDef.lineaBase > 0) {
      const base = iniDef.lineaBase
      const desde = iniDef.fecha_implementacion
      const mesesAhorro: AhorroCombustibleMes[] = []
      for (const m of meses) {
        const ini = `${anio}-${String(m.mes).padStart(2, "0")}-01`
        const fin = finDeMes(anio, m.mes)
        const d1 = ini < desde ? desde : ini
        const d2 = fin > hastaDatos ? hastaDatos : fin
        if (d1 > d2) continue
        const semanas = diasHabiles(d1, d2) / 5
        if (semanas <= 0) continue
        const viajesReales = viajesEntre(d1, d2)
        const viajesBase = base * semanas
        const viajesEvitados = viajesBase - viajesReales
        const km = viajesEvitados * cfg.kmViaje
        const litrosEvitados = km / cfg.rendimientoBase
        const precioLitro = preciosGasoil?.[m.mes - 1] ?? null
        mesesAhorro.push({
          mes: m.mes,
          km: Math.round(km),
          litros: 0,
          litrosBase: Math.round(litrosEvitados),
          litrosEvitados: Math.round(litrosEvitados),
          precioLitro,
          pesos:
            precioLitro !== null ? Math.round(litrosEvitados * precioLitro) : null,
          viajes: {
            semanas: Math.round(semanas * 10) / 10,
            viajesBase: Math.round(viajesBase * 10) / 10,
            viajesReales,
            viajesEvitados: Math.round(viajesEvitados * 10) / 10,
            kmViaje: cfg.kmViaje,
            rendimientoBase: cfg.rendimientoBase,
          },
        })
      }
      if (mesesAhorro.length > 0) {
        const conPrecio = mesesAhorro.filter((m) => m.pesos !== null)
        ahorro = {
          desde,
          lineaBase: base,
          meses: mesesAhorro,
          litrosEvitadosAcum: mesesAhorro.reduce((s, m) => s + m.litrosEvitados, 0),
          pesosAcum:
            conPrecio.length > 0
              ? conPrecio.reduce((s, m) => s + (m.pesos ?? 0), 0)
              : null,
        }
      }
    }

    out[kpi] = {
      modo: "viajes",
      viajes: {
        localidad: cfg.localidad,
        kmViaje: cfg.kmViaje,
        rendimientoBase: cfg.rendimientoBase,
      },
      meses,
      realAcum:
        totSemanas > 0 ? Math.round((totViajes / totSemanas) * 100) / 100 : null,
      intervenidosAcum: null,
      controlAcum: null,
      dominios: [],
      dominiosIntervenidos: [],
      cargasDescartadas: 0,
      ahorro,
    }
  }

  return { data: out }
}

function finDeMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0))
  return d.toISOString().slice(0, 10)
}

/** Días lunes a viernes entre dos fechas ISO, ambas inclusive. */
function diasHabiles(d1: string, d2: string): number {
  let n = 0
  const cur = new Date(`${d1}T12:00:00Z`)
  const fin = new Date(`${d2}T12:00:00Z`)
  while (cur <= fin) {
    const dow = cur.getUTCDay()
    if (dow >= 1 && dow <= 5) n++
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return n
}

/**
 * Viajes por día a la localidad: rutas de Foxtrot con al menos `minParadas`
 * paradas completadas ahí ese día. `desdeDatos`/`hastaDatos` son el primer y
 * último día con rutas sincronizadas en el año, para no contar como cero los
 * días que Foxtrot todavía no trajo.
 */
async function serieViajes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anio: number,
  cfg: KpiViajesConfig,
): Promise<
  Result<{
    viajesPorDia: Map<string, number>
    desdeDatos: string | null
    hastaDatos: string | null
  }>
> {
  // El corte es el día ANTERIOR al último con paradas completadas. La ruta de
  // hoy ya existe en Foxtrot antes de que el camión vuelva, y el último día
  // sincronizado queda a medias hasta la sincronización siguiente (el 15/09/
  // 2026 la ruta 10 tenía 285 km planificados a Colón y cero paradas
  // completadas mientras otras rutas del día ya figuraban cerradas): contarlo
  // como "día sin viaje" inflaba el ahorro del mes en curso.
  const [primera, ultima] = await Promise.all([
    supabase
      .from("foxtrot_waypoints_visita")
      .select("fecha")
      .eq("status", "COMPLETED")
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("foxtrot_waypoints_visita")
      .select("fecha")
      .eq("status", "COMPLETED")
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (primera.error) return { error: `No se pudo leer Foxtrot: ${primera.error.message}` }
  if (ultima.error) return { error: `No se pudo leer Foxtrot: ${ultima.error.message}` }
  const ultimaFecha = (ultima.data as { fecha: string } | null)?.fecha ?? null
  let hastaDatos: string | null = null
  if (ultimaFecha !== null) {
    const d = new Date(`${ultimaFecha}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    hastaDatos = d.toISOString().slice(0, 10)
  }

  const paradasPorRuta = new Map<string, { fecha: string; n: number }>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("v_tiempo_ruta_ciclos")
      .select("route_id, fecha")
      .eq("localidad", cfg.localidad)
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .range(from, from + PAGE - 1)
    if (error) return { error: `No se pudieron leer las paradas: ${error.message}` }
    for (const r of (data ?? []) as { route_id: string; fecha: string }[]) {
      const cur = paradasPorRuta.get(r.route_id) ?? { fecha: r.fecha, n: 0 }
      cur.n++
      paradasPorRuta.set(r.route_id, cur)
    }
    if (!data || data.length < PAGE) break
  }

  const viajesPorDia = new Map<string, number>()
  for (const { fecha, n } of paradasPorRuta.values()) {
    if (n < cfg.minParadas) continue
    viajesPorDia.set(fecha, (viajesPorDia.get(fecha) ?? 0) + 1)
  }

  return {
    data: {
      viajesPorDia,
      desdeDatos: (primera.data as { fecha: string } | null)?.fecha ?? null,
      hastaDatos,
    },
  }
}
