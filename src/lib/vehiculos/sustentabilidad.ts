// Tipos y constante del PI de sostenibilidad de flota (punto 4.3).
//
// Viven acá y no en la action porque un archivo "use server" sólo puede exportar
// funciones async: exportar una constante deja al módulo SIN exportaciones y el
// build se cae con "The module has no exports at all".

/**
 * Kg de CO2 por litro de gasoil quemado. Factor de combustión de diésel
 * (DEFRA / IPCC, ~2,68 kg CO2/L): es el que se usa para alcance 1 y el que hay
 * que citar como fuente ante la auditoría. Si algún día entra una unidad a GNC
 * o eléctrica, este número deja de servirle a esa unidad.
 *
 * 🚨 Es sólo el FALLBACK. El factor real sale de `HUELLA_PARAMS_DEFAULT.feGasoil`
 * pisado por lo que esté guardado en `app_config` bajo "huella:params", que es
 * de donde lo toma /huella-carbono. Las dos pantallas informan emisiones de la
 * misma flota: si el PI de flota tuviera su propio 2,68 hardcodeado y alguien
 * cambiara el factor en Huella de carbono, la empresa quedaría con dos números
 * distintos de CO2 y es la primera cosa que un auditor cruza.
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

/** Litros y km de un período, pasados a emisiones y al PI por 100 km. */
export function agregadoCo2(litros: number, km: number, factor = KG_CO2_POR_LITRO_DIESEL) {
  const co2Kg = litros * factor
  return {
    litros: Math.round(litros * 10) / 10,
    km: Math.round(km),
    co2Kg: Math.round(co2Kg),
    co2Por100Km: km > 0 ? Math.round((co2Kg / km) * 100 * 10) / 10 : null,
  }
}

// ==================== Metas de los dos PI ====================
//
// Viven acá y no en la pantalla porque el PDF que se adjunta como evidencia del
// R4.3.2 tiene que decir la MISMA meta que el tablero. Si divergen, el auditor
// ve dos números y el punto se cae por eso.

/** kg CO2/100 km ≈ 25,4 L/100 km: el mejor mes cerrado de 2026 es el piso a defender. */
export const META_CO2_100KM = 68

/** % de cubiertas que vuelven a rodar recapadas en vez de irse a la recicladora. */
export const META_RECUPERACION = 70

// ==================== PI 2 · recuperación de cubiertas ====================

/** Lo mínimo que hace falta de una cubierta para el cálculo (no el tipo entero,
 *  así la lib no depende de la forma completa de `Neumatico`). */
export interface CubiertaParaPi {
  estado: string
  residuo_id: string | null
  fecha_baja: string | null
}

/** Ídem para el remito de recapado. */
export interface RemitoParaPi {
  fecha_retorno: string | null
  items?: { resultado: string }[]
}

export interface MesRecuperacion {
  mes: string
  recapadas: number
  desechadas: number
  /** % recuperado del mes; `null` si no salió ninguna cubierta de servicio. */
  pct: number | null
}

/**
 * Recuperación de cubiertas: de las que salieron de servicio en el mes, cuántas
 * volvieron a rodar recapadas en vez de irse a la recicladora.
 *
 * 🚨 El denominador son las bajas CON retiro a la recicladora (`residuo_id`), no
 * todas las bajas: de las 26 bajas de 2026, 18 son las cubiertas transferidas a
 * Misiones el 05/09 — salieron del parque pero no se desecharon, y contarlas
 * hundiría el indicador por una mudanza.
 */
export function recuperacionPorMes(
  neumaticos: CubiertaParaPi[],
  recapados: RemitoParaPi[]
): MesRecuperacion[] {
  const mapa = new Map<string, { recapadas: number; desechadas: number }>()
  const get = (mes: string) => {
    if (!mapa.has(mes)) mapa.set(mes, { recapadas: 0, desechadas: 0 })
    return mapa.get(mes)!
  }

  for (const r of recapados) {
    // Cuenta cuando VOLVIÓ recapada: es el momento en que la goma se recuperó.
    if (!r.fecha_retorno) continue
    for (const it of r.items ?? []) {
      if (it.resultado === "recapada") get(r.fecha_retorno.slice(0, 7)).recapadas++
    }
  }

  for (const n of neumaticos) {
    if (n.estado !== "baja" || !n.residuo_id || !n.fecha_baja) continue
    get(n.fecha_baja.slice(0, 7)).desechadas++
  }

  return Array.from(mapa.entries())
    .map(([mes, v]) => {
      const total = v.recapadas + v.desechadas
      return { mes, ...v, pct: total > 0 ? (v.recapadas / total) * 100 : null }
    })
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

/** Totales del año de la recuperación, para el KPI y el pie de la tabla. */
export function recuperacionDelAnio(serie: MesRecuperacion[], anio: string) {
  const delAnio = serie.filter((r) => r.mes.startsWith(anio))
  const recapadas = delAnio.reduce((a, r) => a + r.recapadas, 0)
  const desechadas = delAnio.reduce((a, r) => a + r.desechadas, 0)
  const total = recapadas + desechadas
  return { recapadas, desechadas, pct: total > 0 ? (recapadas / total) * 100 : null }
}

// ==================== Tendencia de 3 meses ====================

export type EstadoTendencia = "mejora" | "empeora" | "igual" | "sin_datos"

export interface Tendencia {
  estado: EstadoTendencia
  delta: number | null
  meses: string[]
}

/**
 * Tendencia sobre los últimos 3 meses CERRADOS, que es lo que pide la guía del
 * punto 4.3.
 *
 * 🚨 El mes en curso se excluye: va siempre a la baja porque está a medio
 * cargar, y en un PI donde bajar es mejorar haría ver una mejora que no existe.
 */
export function tendencia3Meses(
  serie: Array<{ mes: string; valor: number | null }>,
  mesActual: string,
  /** true = bajar es mejorar (emisiones); false = subir es mejorar (recuperación). */
  bajarEsMejor: boolean
): Tendencia {
  const cerrados = serie.filter((p) => p.mes < mesActual && p.valor != null).slice(-3)
  if (cerrados.length < 2) return { estado: "sin_datos", delta: null, meses: [] }
  const primero = cerrados[0].valor!
  const ultimo = cerrados[cerrados.length - 1].valor!
  const delta = ultimo - primero
  const meses = cerrados.map((p) => p.mes)
  if (Math.abs(delta) < 0.05) return { estado: "igual", delta, meses }
  const mejora = bajarEsMejor ? delta < 0 : delta > 0
  return { estado: mejora ? "mejora" : "empeora", delta, meses }
}
