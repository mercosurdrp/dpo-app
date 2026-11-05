"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { TIPO_CARGA_GASOIL } from "@/lib/vehiculos/tipos-carga"
import { separarCargasSinRegistrar } from "@/lib/vehiculos/combustible-limpio"
import { getEjecucionPorRubro } from "@/actions/presupuesto-generador"

export interface CombustibleCamion {
  dominio: string
  descripcion: string | null
  modelo: string | null
  cargas: number
  litros: number // suma de TODAS las cargas del mes
  km: number // suma de km_recorridos (solo cargas con medición)
  litros_con_km: number // litros de las cargas que tienen km (para el rendimiento)
  rendimiento: number | null // km / litros_con_km (km por litro)
  l_100km: number | null
  desvio_pct: number | null // % de rendimiento vs el promedio de la flota
  /** Cargas del mes con una carga sin registrar en el medio: no entran al km/l. */
  cargas_sin_registrar: number
  /** Litros de esas cargas: orden de magnitud de lo que entró sin registrar. */
  litros_sin_registrar: number
  /** Hueco más largo entre cargas dentro del mes (incluye desde la última carga al cierre). */
  max_hueco_dias: number | null
  /** Días desde la última carga del camión hasta el cierre del mes (o hoy). */
  dias_desde_ultima: number | null
  /** Debajo del piso por unidad (3,50 km/l). */
  bajo_piso: boolean
  /** Camión de reparto activo: entra al km/l de la flota. Autoelevadores y camionetas, no. */
  en_flota: boolean
}

/**
 * km/l por chofer (DPO 3.3, GOP 817). Regla de atribución, acordada el
 * 05/11/2026: el tramo entre dos cargas se le asigna al chofer que REGISTRÓ la
 * carga que lo cierra. En Pampeana 8 de los 11 camiones tienen un solo chofer
 * en 90 días, así que el error es chico; los reemplazos se ven en `camiones`.
 */
export interface CombustibleChofer {
  chofer: string
  cargas: number
  litros: number
  km: number
  litros_con_km: number
  rendimiento: number | null
  l_100km: number | null
  camiones: string[]
  /** Posición en el ranking del mes (1 = mejor), sólo con rendimiento. */
  puesto: number | null
  bajo_piso: boolean
}

export interface AnalisisCombustible {
  mes: string // "YYYY-MM"
  meses_disponibles: string[]
  total_cargas: number
  total_camiones: number
  total_litros: number
  total_km: number
  /** Cargas del mes excluidas del km/l por carga faltante (suma de los camiones). */
  total_sin_registrar: number
  /** Litros de esas cargas (PI de pérdida, meta 0). */
  litros_sin_registrar: number
  /** Camiones de reparto activos con un hueco > 7 días entre cargas en el mes (meta 0). */
  camiones_hueco_7d: number
  rendimiento_flota: number | null
  l_100km_flota: number | null
  /** Meta de la flota (`flota_metas.combustible_kml`) y piso por unidad / chofer. */
  meta_flota: number | null
  piso_unidad: number
  /** Justificación del KPI cargada en la meta (R3.3.3: por qué este KPI). */
  justificacion_kpi: string | null
  /** Rubro COMBUSTIBLES - GASOIL del Estado de Resultado para el mes, si está cerrado. */
  eerr_gasoil: { presup: number; real: number } | null
  camiones: CombustibleCamion[]
  choferes: CombustibleChofer[]
}

/** Piso de rendimiento por camión y por chofer (meta 3,75 del 31/08/2026: «los rezagados a 3,50»). */
const PISO_UNIDAD_KML = 3.5
/** Una carga cada 7 días o menos por camión (condición de la meta). */
const DIAS_MAX_SIN_CARGA = 7

/** "YYYY-MM" del mes en curso en horario Argentina. */
function mesActualAR(): string {
  return hoyAR().slice(0, 7)
}

function hoyAR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date())
}

/** Primer día del mes siguiente a "YYYY-MM" → "YYYY-MM-01". */
function primerDiaMesSiguiente(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, "0")}-01`
}

function ultimoDiaMes(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

function round(n: number, dec = 2): number {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

interface CargaRow {
  dominio: string | null
  chofer: string | null
  fecha: string
  litros: number | null
  km_recorridos: number | null
}

/** Días previos al mes que se usan como muestra para la mediana por camión. */
const HISTORIAL_MEDIANA_DIAS = 90

function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

function normalizarRubro(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/**
 * Presupuestado vs real del rubro de gasoil en el EERR del año, para el mes.
 * El EERR se sube con el mes cerrado: el mes en curso no tiene dato. Si el
 * Excel no está o falla, el análisis sigue sin esta tarjeta.
 */
async function eerrGasoilDelMes(mes: string): Promise<{ presup: number; real: number } | null> {
  try {
    const anio = Number(mes.slice(0, 4))
    const mesNum = Number(mes.slice(5, 7))
    const ej = await getEjecucionPorRubro(anio)
    if ("error" in ej) return null
    const key = Object.keys(ej.data).find((k) => {
      const n = normalizarRubro(k)
      return n.includes("COMBUSTIBLE") && n.includes("GASOIL")
    })
    if (!key) return null
    const m = ej.data[key].porMes.find((p) => p.mes === mesNum)
    return m ? { presup: m.presup, real: m.real } : null
  } catch {
    return null
  }
}

export interface SerieCombustibleMes {
  /** "YYYY-MM" */
  ym: string
  /** km/l de la flota de reparto del mes (Σ km ÷ Σ litros, sin cargas faltantes). */
  flota: number | null
  /** km/l por camión de reparto; null si no tuvo tramos válidos ese mes. */
  porDominio: Record<string, number | null>
  /** Litros de gasoil cargados por la flota de reparto en el mes. */
  litros: number
}

export interface SerieCombustible {
  meses: SerieCombustibleMes[]
  /** Camiones de reparto activos, ordenados por patente. */
  dominios: string[]
  meta: number | null
  piso: number
}

/**
 * Serie mensual de rendimiento (km/l) de la flota de reparto y de cada camión,
 * desde la primera carga registrada, con la misma limpieza que el análisis del
 * mes (tramos plausibles, cargas sin registrar excluidas; la mediana de cada
 * camión se toma sobre los 90 días previos a cada mes). Alimenta el gráfico de
 * consumo promedio por mes de /vehiculos/combustible/analisis.
 */
export async function getSerieCombustibleMensual(): Promise<
  { data: SerieCombustible } | { error: string }
> {
  try {
    await requireAuth()
    const supa = await createClient()
    const [cargasRes, catRes, metaRes] = await Promise.all([
      supa
        .from("registro_combustible")
        .select("dominio, fecha, litros, km_recorridos")
        .eq("tipo_combustible", TIPO_CARGA_GASOIL)
        .order("fecha")
        .limit(10000),
      supa.from("catalogo_vehiculos").select("dominio, tipo, sector, active"),
      supa.from("flota_metas").select("meta").eq("kpi", "combustible_kml").maybeSingle(),
    ])
    if (cargasRes.error) return { error: cargasRes.error.message }

    const flotaReparto = new Set(
      (catRes.data ?? [])
        .filter((c) => c.active !== false && c.tipo === "camion" && c.sector !== "deposito")
        .map((c) => c.dominio),
    )
    const todas = ((cargasRes.data ?? []) as Omit<CargaRow, "chofer">[]).filter(
      (r): r is Omit<CargaRow, "chofer"> & { dominio: string } => !!r.dominio && flotaReparto.has(r.dominio),
    )
    const meses = [...new Set(todas.map((r) => r.fecha.slice(0, 7)))].sort()

    const out: SerieCombustibleMes[] = []
    for (const ym of meses) {
      const desde = `${ym}-01`
      const hasta = primerDiaMesSiguiente(ym)
      const historial = todas.filter((r) => r.fecha >= restarDias(desde, HISTORIAL_MEDIANA_DIAS) && r.fecha < hasta)
      const delMes = historial.filter((r) => r.fecha >= desde)
      const { validas } = separarCargasSinRegistrar(delMes, historial)
      const setValidas = new Set(validas)
      const porDom = new Map<string, { km: number; l: number }>()
      let km = 0
      let l = 0
      let litros = 0
      for (const r of delMes) {
        const lt = Number(r.litros ?? 0)
        const k = Number(r.km_recorridos ?? 0)
        litros += lt
        if (!(k > 0) || !setValidas.has(r)) continue
        km += k
        l += lt
        const a = porDom.get(r.dominio) ?? { km: 0, l: 0 }
        a.km += k
        a.l += lt
        porDom.set(r.dominio, a)
      }
      const porDominio: Record<string, number | null> = {}
      for (const d of flotaReparto) {
        const a = porDom.get(d)
        porDominio[d] = a && a.l > 0 ? round(a.km / a.l) : null
      }
      out.push({ ym, flota: l > 0 ? round(km / l) : null, porDominio, litros: round(litros, 0) })
    }

    const metaRow = metaRes.data as { meta: number | null } | null
    return {
      data: {
        meses: out,
        dominios: [...flotaReparto].sort(),
        meta: metaRow?.meta != null ? Number(metaRow.meta) : null,
        piso: PISO_UNIDAD_KML,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando la serie" }
  }
}

/**
 * Análisis de combustible del mes: consumo, km y rendimiento (km/l) por camión
 * y por chofer, comparado contra el promedio de la flota, la meta y el piso.
 * Pensado para detectar los camiones y choferes de peor rendimiento y armar el
 * plan de acción (DPO Flota 3.3). Sin valorización ($) salvo el cruce con el
 * rubro del EERR.
 *
 * El rendimiento del mes se calcula como Σ km_recorridos / Σ litros de las
 * cargas que tienen medición de km (la 1ª carga de un vehículo no tiene km).
 */
export async function getAnalisisCombustible(
  mes?: string,
): Promise<{ data: AnalisisCombustible } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()

    const mesSel = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : mesActualAR()
    const desde = `${mesSel}-01`
    const hasta = primerDiaMesSiguiente(mesSel)
    const hoy = hoyAR()
    // Cierre del mes para medir huecos: el último día, o hoy si está en curso.
    const cierre = ultimoDiaMes(mesSel) < hoy ? ultimoDiaMes(mesSel) : hoy

    // Se traen también los ~90 días previos: son la muestra para la mediana de
    // rendimiento de cada camión, con la que se detectan las cargas sin
    // registrar del mes (ver `combustible-limpio.ts`), y la última carga previa
    // al mes, que marca desde cuándo corre el primer hueco.
    const [cargasRes, todasRes, catRes, metaRes, eerr] = await Promise.all([
      supa
        .from("registro_combustible")
        .select("dominio, chofer, fecha, litros, km_recorridos")
        .eq("tipo_combustible", TIPO_CARGA_GASOIL)
        .gte("fecha", restarDias(desde, HISTORIAL_MEDIANA_DIAS))
        .lt("fecha", hasta)
        .order("fecha"),
      supa.from("registro_combustible").select("fecha").eq("tipo_combustible", TIPO_CARGA_GASOIL),
      supa.from("catalogo_vehiculos").select("dominio, descripcion, modelo, tipo, sector, active"),
      supa
        .from("flota_metas")
        .select("meta, justificacion")
        .eq("kpi", "combustible_kml")
        .maybeSingle(),
      eerrGasoilDelMes(mesSel),
    ])
    if (cargasRes.error) return { error: cargasRes.error.message }
    if (todasRes.error) return { error: todasRes.error.message }

    const historial = ((cargasRes.data ?? []) as CargaRow[]).filter(
      (r): r is CargaRow & { dominio: string } => !!r.dominio,
    )
    const cargasMes = historial.filter((r) => r.fecha >= desde)
    const { sinRegistrar } = separarCargasSinRegistrar(cargasMes, historial)
    const setSinRegistrar = new Set<CargaRow>(sinRegistrar)
    const cargas = cargasMes

    // Meses con datos (para el selector)
    const meses_disponibles = [
      ...new Set((todasRes.data ?? []).map((t) => String(t.fecha).slice(0, 7))),
    ].sort().reverse()

    // Catálogo para enriquecer y para saber qué camiones son flota de reparto activa.
    const catMap = new Map<string, { descripcion: string | null; modelo: string | null }>()
    const flotaReparto = new Set<string>()
    for (const c of catRes.data ?? []) {
      catMap.set(c.dominio, { descripcion: c.descripcion ?? null, modelo: c.modelo ?? null })
      if (c.active !== false && c.tipo === "camion" && c.sector !== "deposito") {
        flotaReparto.add(c.dominio)
      }
    }

    // Agregación por dominio
    interface Agg {
      cargas: number
      litros: number
      km: number
      litros_con_km: number
      sin_registrar: number
      litros_sin_registrar: number
    }
    const nuevoAgg = (): Agg => ({
      cargas: 0, litros: 0, km: 0, litros_con_km: 0, sin_registrar: 0, litros_sin_registrar: 0,
    })
    const agg = new Map<string, Agg>()
    const aggChofer = new Map<string, Agg & { camiones: Set<string> }>()
    for (const r of cargas) {
      if (!r.dominio) continue
      const a = agg.get(r.dominio) ?? nuevoAgg()
      const litros = Number(r.litros ?? 0)
      const km = Number(r.km_recorridos ?? 0)
      const sospechosa = setSinRegistrar.has(r)
      a.cargas += 1
      a.litros += litros
      // Una carga faltante en el medio infla el tramo (8-10 km/l): sus litros
      // son reales y suman al consumo, pero el tramo no entra al rendimiento.
      if (km > 0 && !sospechosa) {
        a.km += km
        a.litros_con_km += litros
      }
      if (sospechosa) {
        a.sin_registrar += 1
        a.litros_sin_registrar += litros
      }
      agg.set(r.dominio, a)

      // Por chofer: sólo flota de reparto (un autoelevador mide horas).
      if (flotaReparto.has(r.dominio) || !catMap.has(r.dominio)) {
        const nombre = (r.chofer ?? "").trim().replace(/\s+/g, " ").toUpperCase() || "SIN CHOFER"
        const c = aggChofer.get(nombre) ?? { ...nuevoAgg(), camiones: new Set<string>() }
        c.cargas += 1
        c.litros += litros
        if (km > 0 && !sospechosa) {
          c.km += km
          c.litros_con_km += litros
        }
        if (sospechosa) {
          c.sin_registrar += 1
          c.litros_sin_registrar += litros
        }
        c.camiones.add(r.dominio)
        aggChofer.set(nombre, c)
      }
    }

    // Huecos entre cargas por camión de reparto activo: de la última carga
    // previa al mes a la primera del mes, entre cargas, y de la última al cierre.
    const fechasPorDominio = new Map<string, string[]>()
    for (const r of historial) {
      const arr = fechasPorDominio.get(r.dominio) ?? []
      arr.push(r.fecha.slice(0, 10))
      fechasPorDominio.set(r.dominio, arr)
    }
    const huecoPorDominio = new Map<string, { max: number | null; desdeUltima: number | null }>()
    let camiones_hueco_7d = 0
    for (const dominio of new Set([...flotaReparto, ...agg.keys()])) {
      const fechas = [...new Set(fechasPorDominio.get(dominio) ?? [])].sort()
      const previa = fechas.filter((f) => f < desde).at(-1) ?? null
      const delMes = fechas.filter((f) => f >= desde && f <= cierre)
      const hitos = [...(previa ? [previa] : []), ...delMes]
      let max: number | null = null
      for (let i = 1; i < hitos.length; i++) {
        const d = diasEntre(hitos[i - 1], hitos[i])
        max = max == null ? d : Math.max(max, d)
      }
      const ultima = hitos.at(-1) ?? null
      const desdeUltima = ultima ? diasEntre(ultima, cierre) : null
      if (desdeUltima != null) max = max == null ? desdeUltima : Math.max(max, desdeUltima)
      huecoPorDominio.set(dominio, { max, desdeUltima })
      if (flotaReparto.has(dominio) && max != null && max > DIAS_MAX_SIN_CARGA) camiones_hueco_7d++
    }

    // Totales de flota (rendimiento ponderado por litros con medición)
    let totLitros = 0,
      totKm = 0,
      totLitrosConKm = 0,
      totCargas = 0,
      totLitrosSinRegistrar = 0
    // 🚨 Sólo la flota de reparto: un autoelevador rinde 0,4 km/l porque mide
    // horas y una camioneta no reparte. Mezclarlos daba 3,40 cuando los
    // camiones rendían 3,64, y el número no era comparable con la meta ni con
    // la tarjeta de Indicadores.
    let totSinRegistrar = 0
    for (const [dominio, a] of agg) {
      if (!flotaReparto.has(dominio)) continue
      totLitros += a.litros
      totKm += a.km
      totLitrosConKm += a.litros_con_km
      totCargas += a.cargas
      totSinRegistrar += a.sin_registrar
      totLitrosSinRegistrar += a.litros_sin_registrar
    }
    const rendimiento_flota = totLitrosConKm > 0 ? round(totKm / totLitrosConKm) : null
    const l_100km_flota = totKm > 0 ? round((totLitrosConKm / totKm) * 100) : null

    const camiones: CombustibleCamion[] = [...agg.entries()].map(([dominio, a]) => {
      const rendimiento = a.litros_con_km > 0 ? round(a.km / a.litros_con_km) : null
      const l_100km = a.km > 0 ? round((a.litros_con_km / a.km) * 100) : null
      const enFlota = flotaReparto.has(dominio)
      const desvio_pct =
        enFlota && rendimiento != null && rendimiento_flota
          ? round(((rendimiento - rendimiento_flota) / rendimiento_flota) * 100, 1)
          : null
      const info = catMap.get(dominio)
      const hueco = huecoPorDominio.get(dominio)
      return {
        en_flota: enFlota,
        dominio,
        descripcion: info?.descripcion ?? null,
        modelo: info?.modelo ?? null,
        cargas: a.cargas,
        litros: round(a.litros, 0),
        km: a.km,
        litros_con_km: round(a.litros_con_km, 0),
        rendimiento,
        l_100km,
        desvio_pct,
        cargas_sin_registrar: a.sin_registrar,
        litros_sin_registrar: round(a.litros_sin_registrar, 0),
        max_hueco_dias: hueco?.max ?? null,
        dias_desde_ultima: hueco?.desdeUltima ?? null,
        bajo_piso: rendimiento != null && flotaReparto.has(dominio) && rendimiento < PISO_UNIDAD_KML,
      }
    })

    // Peor rendimiento primero (foco del plan de acción); sin dato al final
    camiones.sort((x, y) => {
      if (x.en_flota !== y.en_flota) return x.en_flota ? -1 : 1
      if (x.rendimiento == null) return 1
      if (y.rendimiento == null) return -1
      return x.rendimiento - y.rendimiento
    })

    // Ranking por chofer: mejor primero (GOP 817: reconocimiento a los 3 mejores).
    const choferes: CombustibleChofer[] = [...aggChofer.entries()].map(([chofer, c]) => {
      const rendimiento = c.litros_con_km > 0 ? round(c.km / c.litros_con_km) : null
      return {
        chofer,
        cargas: c.cargas,
        litros: round(c.litros, 0),
        km: c.km,
        litros_con_km: round(c.litros_con_km, 0),
        rendimiento,
        l_100km: c.km > 0 ? round((c.litros_con_km / c.km) * 100) : null,
        camiones: [...c.camiones].sort(),
        puesto: null,
        bajo_piso: rendimiento != null && rendimiento < PISO_UNIDAD_KML,
      }
    })
    choferes.sort((x, y) => {
      if (x.rendimiento == null) return 1
      if (y.rendimiento == null) return -1
      return y.rendimiento - x.rendimiento
    })
    let puesto = 0
    for (const c of choferes) if (c.rendimiento != null) c.puesto = ++puesto

    const metaRow = metaRes.data as { meta: number | null; justificacion: string | null } | null

    return {
      data: {
        mes: mesSel,
        meses_disponibles: meses_disponibles.length ? meses_disponibles : [mesSel],
        total_cargas: totCargas,
        total_camiones: [...agg.keys()].filter((d) => flotaReparto.has(d)).length,
        total_litros: round(totLitros, 0),
        total_km: totKm,
        total_sin_registrar: totSinRegistrar,
        litros_sin_registrar: round(totLitrosSinRegistrar, 0),
        camiones_hueco_7d,
        rendimiento_flota,
        l_100km_flota,
        meta_flota: metaRow?.meta != null ? Number(metaRow.meta) : null,
        piso_unidad: PISO_UNIDAD_KML,
        justificacion_kpi: metaRow?.justificacion ?? null,
        eerr_gasoil: eerr,
        camiones,
        choferes,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando análisis" }
  }
}
