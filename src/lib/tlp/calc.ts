import type { createClient } from "@/lib/supabase/server"
import { ceqGescomPorViaje } from "./ceq-gescom"
import { tiempoPdvPorCiudad, type TiempoPdvCiudad, type TiempoPdvResultado } from "./tiempo-pdv"
import { historicoEnRango } from "./historico"

// Núcleo del cálculo del TLP (Transport Labor Productivity), compartido entre
// la página /indicadores/tlp y el Árbol del Sueño.
//
// TLP = CEq entregadas ÷ horas-hombre (horas en ruta × FTE del camión).
// Viaje = patente + fecha, imputado a su ciudad PREDOMINANTE (más CEq).
//
// 🚨 Las CEq son Chess + GESTIÓN (GESCOM, sede 2) — la MISMA base que las "CEq
// distribuidas" del cuadro de Indicadores (RPC `cuadro_ceq_mensual`). Contar
// solo Chess subestimaba el TLP: en mayo 2026 tomaba 65.381 de 93.087 CEq
// (TLP 18,95 en vez de 26,96). Ver `lib/tlp/ceq-gescom.ts`.
//
// Todas las lecturas paginan de a 1000 filas: PostgREST trunca en 1000 y un
// rango anual (Sueño YTD) supera ese límite con comodidad.

export const FTE_FALLBACK = 2

/**
 * Desde esta fecha se ESTIMA el viaje al que le falta el checklist de retorno, en
 * vez de descartarlo. El checklist arrancó el 9-abr-2026: antes de abril no hay
 * uno solo, así que el 100% de las horas sería inventado (y Foxtrot no sirve de
 * reemplazo: mide +37% y correlaciona 0,22) — esos meses van con el cierre a mano
 * (ver ./historico.ts).
 *
 * De abril en adelante, el camión SALIÓ y entregó (tiene CEq); lo único que falta
 * es que alguien cargue el checklist. Descartarlo se llevaba puesta también su
 * carga: en junio dejaba afuera el 7% de las CEq del mes.
 */
const ESTIMAR_DESDE = "2026-04-01"

const CEQ_MIN_ESTIMADO = 100

const PAGE = 1000

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface ViajeTlp {
  patente: string
  fecha: string
  ciudad: string // predominante
  ceq: number
  /** Parte de `ceq` que vino de GESCOM (Gestión); el resto es Chess. */
  ceqGescom: number
  horasRuta: number
  fte: number
  fteFallback: boolean
  /** El viaje no tiene checklist: las horas son el promedio de esa patente. */
  horasEstimadas: boolean
}

export interface ViajesTlpResultado {
  viajes: ViajeTlp[]
  /** Viajes con CEq pero sin checklist de retorno (excluidos, sin denominador). */
  viajesSinTiempo: number
  /** Total de viajes con CEq (incluidos + excluidos). */
  viajesConCeq: number
  /** CEq de Gestión que quedaron fuera por no tener checklist de retorno. */
  ceqGescomSinTiempo: number
  /** Viajes cuyo tiempo en ruta se estimó con el promedio de su patente. */
  viajesHorasEstimadas: number
}

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** Carga el mapeo localidad → ciudad. Localidades sin match → "Otras". */
export async function mapaCiudades(supabase: Supabase): Promise<Map<string, string>> {
  const { data } = await supabase.from("dim_localidad_ciudad").select("localidad, ciudad")
  const m = new Map<string, string>()
  for (const r of (data ?? []) as { localidad: string; ciudad: string }[]) {
    m.set(r.localidad.trim().toUpperCase(), r.ciudad)
  }
  return m
}

export function normPatente(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase()
}

export function fteDeAyudantes(ayudante1: string | null, ayudante2: string | null): number {
  return (
    1 +
    ((ayudante1 ?? "").trim() !== "" ? 1 : 0) +
    ((ayudante2 ?? "").trim() !== "" ? 1 : 0)
  )
}

/**
 * Resuelve los viajes del rango con su CEq, ciudad predominante, horas en
 * ruta (checklist retorno) y FTE (registro de egreso; fallback 2).
 */
export async function fetchViajesTlp(
  supabase: Supabase,
  desde: string,
  hasta: string,
): Promise<ViajesTlpResultado> {
  const [locRows, retRows, egrRows, ciudades, ceqGescom] = await Promise.all([
    fetchAll<{ patente: string; fecha: string; localidad: string; ceq_total: number }>(
      (from, to) =>
        supabase
          .from("ocupacion_bodega_localidad_diaria")
          .select("patente, fecha, localidad, ceq_total")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          // 🚨 Ordenar por una clave ÚNICA, no por `fecha`: hay ~10 viajes por día
          // y PostgREST devuelve los empates en orden arbitrario ⇒ las páginas se
          // pisan y el TLP sale distinto en cada corrida (abril llegó a saltar de
          // 31,4 a 39,4). Ver [[feedback_supabase_max_rows]].
          .order("id")
          .range(from, to),
    ),
    fetchAll<{ dominio: string; fecha: string; tiempo_ruta_minutos: number }>(
      (from, to) =>
        supabase
          .from("checklist_vehiculos")
          .select("dominio, fecha, tiempo_ruta_minutos")
          .eq("tipo", "retorno")
          .not("tiempo_ruta_minutos", "is", null)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id")
          .range(from, to),
    ),
    fetchAll<{ dominio: string; fecha: string; ayudante1: string | null; ayudante2: string | null }>(
      (from, to) =>
        supabase
          .from("registros_vehiculos")
          .select("dominio, fecha, ayudante1, ayudante2")
          .eq("tipo", "egreso")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id")
          .range(from, to),
    ),
    mapaCiudades(supabase),
    ceqGescomPorViaje(supabase, desde, hasta),
  ])

  // Viaje = patente|fecha. CEq total + CEq por ciudad.
  const acum = new Map<string, { ceqTotal: number; ceqGescom: number; porCiudad: Map<string, number> }>()
  const nuevoAcum = () => ({ ceqTotal: 0, ceqGescom: 0, porCiudad: new Map<string, number>() })
  for (const r of locRows) {
    const ceq = Number(r.ceq_total) || 0
    if (ceq <= 0) continue
    const key = `${normPatente(r.patente)}|${r.fecha}`
    const ciudad = ciudades.get((r.localidad ?? "").trim().toUpperCase()) ?? "Otras"
    const v = acum.get(key) ?? nuevoAcum()
    v.ceqTotal += ceq
    v.porCiudad.set(ciudad, (v.porCiudad.get(ciudad) ?? 0) + ceq)
    acum.set(key, v)
  }

  // CEq de Gestión: van al MISMO viaje (el camión hace una sola ruta). GESCOM no
  // trae localidad, así que no votan la ciudad predominante — la fija Chess. Un
  // viaje que sólo llevó carga de Gestión no tiene ciudad propia: hereda la
  // ciudad habitual de esa patente en el rango (abajo).
  for (const [key, ceq] of ceqGescom) {
    if (ceq <= 0) continue
    const v = acum.get(key) ?? nuevoAcum()
    v.ceqTotal += ceq
    v.ceqGescom += ceq
    acum.set(key, v)
  }

  // Ciudad habitual por patente (la que más CEq de Chess le entregó en el rango).
  const ceqPatenteCiudad = new Map<string, Map<string, number>>()
  for (const [key, v] of acum) {
    const patente = key.split("|")[0]
    const m = ceqPatenteCiudad.get(patente) ?? new Map<string, number>()
    for (const [c, ceq] of v.porCiudad) m.set(c, (m.get(c) ?? 0) + ceq)
    ceqPatenteCiudad.set(patente, m)
  }
  const ciudadHabitual = (patente: string): string => {
    let mejor = "Otras"
    let max = -1
    for (const [c, ceq] of ceqPatenteCiudad.get(patente) ?? []) {
      if (ceq > max) { max = ceq; mejor = c }
    }
    return mejor
  }

  // Tiempo en ruta (minutos) por viaje — el mayor del día si hubiera varios.
  const tiempo = new Map<string, number>()
  for (const r of retRows) {
    const key = `${normPatente(r.dominio)}|${r.fecha}`
    const min = Number(r.tiempo_ruta_minutos) || 0
    if (min <= 0) continue
    tiempo.set(key, Math.max(tiempo.get(key) ?? 0, min))
  }

  // FTE por viaje — el mayor del día si hubiera varios egresos.
  const fte = new Map<string, number>()
  for (const r of egrRows) {
    const key = `${normPatente(r.dominio)}|${r.fecha}`
    fte.set(key, Math.max(fte.get(key) ?? 0, fteDeAyudantes(r.ayudante1, r.ayudante2)))
  }

  // Promedios para estimar lo que falta, calculados sobre los viajes que SÍ tienen
  // el dato (checklist para las horas, egreso para el FTE).
  //
  // Siempre por patente Y MES: si el promedio dependiera del rango consultado, el
  // TLP de un mes daría distinto al filtrarlo que al mirar el año entero.
  const promedio = (datos: Map<string, number>) => {
    const porPatenteMes = new Map<string, { suma: number; n: number }>()
    const porMes = new Map<string, { suma: number; n: number }>()
    let suma = 0
    let n = 0
    for (const [key, valor] of datos) {
      const [patente, fecha] = key.split("|")
      const mes = fecha.slice(0, 7)
      for (const [m, k] of [
        [porPatenteMes, `${patente}|${mes}`],
        [porMes, mes],
      ] as [Map<string, { suma: number; n: number }>, string][]) {
        const a = m.get(k) ?? { suma: 0, n: 0 }
        a.suma += valor
        a.n += 1
        m.set(k, a)
      }
      suma += valor
      n += 1
    }
    // La patente en ese mes → el mes → todo lo que haya.
    return (patente: string, mes: string): number | null => {
      const a = porPatenteMes.get(`${patente}|${mes}`) ?? porMes.get(mes)
      if (a && a.n > 0) return a.suma / a.n
      return n > 0 ? suma / n : null
    }
  }
  const minutosDePatente = promedio(tiempo)
  const ftePromedio = promedio(fte)

  /**
   * Tiempo estimado de un viaje sin checklist. Un camión tarda distinto según lo
   * que lleve, así que se busca entre los viajes MEDIDOS los que se le parecen:
   *
   *   1. misma patente, ese mes, con CEq parecida (±25%)  ← lo más comparable
   *   2. cualquier patente del mes con CEq parecida       ← si esa patente no repitió carga así
   *   3. el promedio de la patente en el mes              ← última red
   *
   * El paso 3 lo cubre `minutosDePatente` (patente → mes → global).
   */
  const medidos = [...tiempo].map(([key, min]) => {
    const [patente, fecha] = key.split("|")
    return { patente, mes: fecha.slice(0, 7), ceq: acum.get(key)?.ceqTotal ?? 0, min }
  })
  const TOLERANCIA_CEQ = 0.25

  const minutosEstimados = (patente: string, mes: string, ceq: number): number | null => {
    if (ceq > 0) {
      const parecidos = (mismaPatente: boolean) =>
        medidos.filter(
          (m) =>
            m.mes === mes &&
            m.ceq > 0 &&
            (!mismaPatente || m.patente === patente) &&
            Math.abs(m.ceq - ceq) / ceq <= TOLERANCIA_CEQ,
        )
      for (const cand of [parecidos(true), parecidos(false)]) {
        if (cand.length > 0) {
          return cand.reduce((s, m) => s + m.min, 0) / cand.length
        }
      }
    }
    return minutosDePatente(patente, mes)
  }

  // 🚨 Sin egreso NO se usa FTE = 2: un 2 fijo subestima la dotación real (2,5 en
  // promedio) y le regala productividad al viaje. Va el promedio de la patente.
  const fteEstimado = (patente: string, mes: string): number =>
    ftePromedio(patente, mes) ?? FTE_FALLBACK

  const viajes: ViajeTlp[] = []
  let viajesSinTiempo = 0
  let ceqGescomSinTiempo = 0
  let viajesHorasEstimadas = 0
  for (const [key, v] of acum) {
    const [patente, fecha] = key.split("|")
    const fteReal0 = fte.get(key)
    let min = tiempo.get(key)
    let estimado = false

    // El viaje existe (entregó CEq) pero nadie cargó el checklist: se le estima el
    // tiempo con los viajes medidos que se le parecen (misma patente y CEq similar).
    if (!min && fecha >= ESTIMAR_DESDE) {
      const est = minutosEstimados(patente, fecha.slice(0, 7), v.ceqTotal)
      if (est) {
        min = est
        estimado = true
      }
    }

    if (!min) {
      viajesSinTiempo++
      ceqGescomSinTiempo += v.ceqGescom
      continue // sin tiempo en ruta no hay denominador
    }
    if (estimado) viajesHorasEstimadas++
    let ciudadPred = ""
    let maxCeq = -1
    for (const [c, ceq] of v.porCiudad) {
      if (ceq > maxCeq) {
        maxCeq = ceq
        ciudadPred = c
      }
    }
    // Viaje sólo de Gestión (sin CEq de Chess ⇒ sin localidad): va a la ciudad
    // habitual de la patente.
    if (!ciudadPred) ciudadPred = ciudadHabitual(patente)

    // Carga residual sin checklist: no fue un viaje (ver CEQ_MIN_ESTIMADO).
    if (estimado && v.ceqTotal < CEQ_MIN_ESTIMADO) continue

    // Sin egreso no hay dotación cargada → el FTE promedio de la patente en el mes.
    const fteUsado = fteReal0 ?? fteEstimado(patente, fecha.slice(0, 7))

    viajes.push({
      patente,
      fecha,
      ciudad: ciudadPred,
      ceq: v.ceqTotal,
      ceqGescom: v.ceqGescom,
      horasRuta: min / 60,
      fte: fteUsado,
      fteFallback: fteReal0 == null,
      horasEstimadas: estimado,
    })
  }

  return {
    viajes,
    viajesSinTiempo,
    viajesConCeq: acum.size,
    ceqGescomSinTiempo,
    viajesHorasEstimadas,
  }
}

export interface TlpMensual {
  mes: number // 1..12
  tlp: number
  viajes: number
}

/**
 * TLP anual para el Árbol del Sueño: YTD (CEq acumuladas ÷ horas-hombre
 * acumuladas del año) + apertura mensual. Devuelve null si no hay viajes.
 */
export async function tlpAnual(
  supabase: Supabase,
  anio: number,
): Promise<{ ytd: number; meses: TlpMensual[] } | null> {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < `${anio}-12-31` ? hoy : `${anio}-12-31`
  const { viajes } = await fetchViajesTlp(supabase, `${anio}-01-01`, hasta)
  const hist = historicoEnRango(`${anio}-01-01`, hasta)
  if (viajes.length === 0 && hist.meses.size === 0) return null

  let ceq = hist.ceq
  let hh = hist.hh
  const porMes = new Map<number, { ceq: number; hh: number; viajes: number }>()
  // Meses cerrados a mano (ene–mar: sin checklist ⇒ sin cálculo viaje a viaje).
  for (const [mes, h] of hist.meses) {
    porMes.set(mes, { ceq: h.ceq, hh: h.hh, viajes: h.viajes })
  }
  for (const v of viajes) {
    const horasHombre = v.horasRuta * v.fte
    ceq += v.ceq
    hh += horasHombre
    const mes = Number(v.fecha.slice(5, 7))
    const m = porMes.get(mes) ?? { ceq: 0, hh: 0, viajes: 0 }
    m.ceq += v.ceq
    m.hh += horasHombre
    m.viajes += 1
    porMes.set(mes, m)
  }
  if (hh <= 0) return null

  const meses: TlpMensual[] = [...porMes.entries()]
    .filter(([, m]) => m.hh > 0)
    .map(([mes, m]) => ({
      mes,
      tlp: Math.round((m.ceq / m.hh) * 100) / 100,
      viajes: m.viajes,
    }))
    .sort((a, b) => a.mes - b.mes)

  return { ytd: Math.round((ceq / hh) * 100) / 100, meses }
}

export interface TlpEvolucionFila {
  ciudad: string
  /** TLP de cada mes con datos (1..12); meses sin viajes no aparecen. */
  meses: Record<number, number>
  ytd: number | null
}

export interface TlpEvolucionAnual {
  anio: number
  /** Meses (1..12) donde al menos una ciudad tuvo viajes, ordenados. */
  meses: number[]
  filas: TlpEvolucionFila[]
  total: TlpEvolucionFila
}

/**
 * Evolución mensual del TLP por ciudad (cuadro ciudad × mes del año), con
 * fila Total. Base del bloque "Objetivo por ciudad" de /indicadores/tlp.
 */
export function evolucionDesdeViajes(viajes: ViajeTlp[], anio: number): TlpEvolucionAnual {
  type Acum = { ceq: number; hh: number }
  const porCiudadMes = new Map<string, Map<number, Acum>>()
  const porCiudadYtd = new Map<string, Acum>()
  const totalMes = new Map<number, Acum>()
  const totalYtd: Acum = { ceq: 0, hh: 0 }

  // Meses históricos: solo tienen total (no hay desglose por ciudad) ⇒ la fila
  // Total los muestra y las ciudades quedan en "—".
  const hist = historicoEnRango(`${anio}-01-01`, `${anio}-12-31`)
  for (const [mes, h] of hist.meses) {
    totalMes.set(mes, { ceq: h.ceq, hh: h.hh })
    totalYtd.ceq += h.ceq
    totalYtd.hh += h.hh
  }

  const suma = (a: Acum, v: ViajeTlp) => {
    a.ceq += v.ceq
    a.hh += v.horasRuta * v.fte
  }

  for (const v of viajes) {
    const mes = Number(v.fecha.slice(5, 7))
    const mc = porCiudadMes.get(v.ciudad) ?? new Map<number, Acum>()
    const am = mc.get(mes) ?? { ceq: 0, hh: 0 }
    suma(am, v)
    mc.set(mes, am)
    porCiudadMes.set(v.ciudad, mc)

    const ay = porCiudadYtd.get(v.ciudad) ?? { ceq: 0, hh: 0 }
    suma(ay, v)
    porCiudadYtd.set(v.ciudad, ay)

    const tm = totalMes.get(mes) ?? { ceq: 0, hh: 0 }
    suma(tm, v)
    totalMes.set(mes, tm)
    suma(totalYtd, v)
  }

  const tlpDe = (a: Acum | undefined): number | null =>
    a && a.hh > 0 ? Math.round((a.ceq / a.hh) * 100) / 100 : null

  const meses = [...totalMes.keys()].sort((a, b) => a - b)

  const cerrarFila = (
    ciudad: string,
    mc: Map<number, Acum>,
    ytd: Acum | undefined,
  ): TlpEvolucionFila => {
    const out: Record<number, number> = {}
    for (const [mes, a] of mc) {
      const t = tlpDe(a)
      if (t != null) out[mes] = t
    }
    return { ciudad, meses: out, ytd: tlpDe(ytd) }
  }

  const filas = [...porCiudadMes.entries()]
    .map(([ciudad, mc]) => cerrarFila(ciudad, mc, porCiudadYtd.get(ciudad)))
    .sort((a, b) => (b.ytd ?? 0) - (a.ytd ?? 0))

  return {
    anio,
    meses,
    filas,
    total: cerrarFila("Total", totalMes, totalYtd),
  }
}

// ---------------------------------------------------------------------------
// Árbol de TLP (bloque "Árbol del TLP" de /indicadores/tlp)
// ---------------------------------------------------------------------------

export interface TlpArbolNodo {
  ciudad: string
  ceq: number
  horasRuta: number
  horasHombre: number
  /** Dotación promedio del viaje, ponderada por horas en ruta. */
  fte: number | null
  viajes: number
  tlp: number | null
  /** Tiempo en PDV despejado del tiempo en ruta (ver lib/tlp/tiempo-pdv.ts). */
  tiempoPdv: TiempoPdvCiudad | null
}

export interface TlpArbol {
  anio: number
  /** Último día incluido (hoy, o el 31-dic si el año ya cerró). */
  hasta: string
  /** Raíz: TLP YTD ponderado de toda la operación — el mismo del Árbol del Sueño. */
  total: TlpArbolNodo
  ciudades: TlpArbolNodo[]
}

/**
 * Árbol del TLP: raíz (total) → una rama por ciudad → sus dos insumos.
 *
 * La raíz NO promedia los TLP de las ciudades: es Σ CEq ÷ Σ horas-hombre de
 * todos los viajes del año, idéntico a `tlpAnual` (Árbol del Sueño). Cada
 * ciudad pesa según su volumen y sus horas, no una ciudad = un voto.
 */
export function arbolDesdeViajes(
  viajes: ViajeTlp[],
  anio: number,
  hasta: string,
  pdv?: TiempoPdvResultado,
): TlpArbol {
  type Acum = { ceq: number; horasRuta: number; hh: number; viajes: number }
  const nuevo = (): Acum => ({ ceq: 0, horasRuta: 0, hh: 0, viajes: 0 })

  const porCiudad = new Map<string, Acum>()
  const total = nuevo()

  // La raíz arranca con los meses cerrados a mano (ene–mar), que no tienen
  // desglose por ciudad: así el TLP total sigue siendo el del Árbol del Sueño.
  const hist = historicoEnRango(`${anio}-01-01`, hasta)
  total.ceq += hist.ceq
  total.horasRuta += hist.horasRuta
  total.hh += hist.hh
  total.viajes += hist.viajes

  const suma = (a: Acum, v: ViajeTlp) => {
    a.ceq += v.ceq
    a.horasRuta += v.horasRuta
    a.hh += v.horasRuta * v.fte
    a.viajes += 1
  }

  for (const v of viajes) {
    const a = porCiudad.get(v.ciudad) ?? nuevo()
    suma(a, v)
    porCiudad.set(v.ciudad, a)
    suma(total, v)
  }

  const cerrar = (ciudad: string, a: Acum, tiempoPdv: TiempoPdvCiudad | null): TlpArbolNodo => ({
    ciudad,
    ceq: Math.round(a.ceq),
    horasRuta: Math.round(a.horasRuta * 10) / 10,
    horasHombre: Math.round(a.hh * 10) / 10,
    // FTE ponderado por horas: hh = Σ (horas × FTE) ⇒ FTE = hh ÷ horas.
    fte: a.horasRuta > 0 ? Math.round((a.hh / a.horasRuta) * 100) / 100 : null,
    viajes: a.viajes,
    tlp: a.hh > 0 ? Math.round((a.ceq / a.hh) * 100) / 100 : null,
    tiempoPdv,
  })

  return {
    anio,
    hasta,
    total: cerrar("Total", total, pdv?.total ?? null),
    ciudades: [...porCiudad.entries()]
      .map(([ciudad, a]) => cerrar(ciudad, a, pdv?.porCiudad.get(ciudad) ?? null))
      .sort((a, b) => b.ceq - a.ceq),
  }
}

/**
 * Un solo barrido anual para los dos bloques que miran el año completo
 * (evolución mensual + árbol). `fetchViajesTlp` sobre un año es la lectura
 * más cara de la página: no conviene repetirla.
 */
export async function tlpAnualPorCiudad(
  supabase: Supabase,
  anio: number,
): Promise<{ evolucion: TlpEvolucionAnual; arbol: TlpArbol }> {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < `${anio}-12-31` ? hoy : `${anio}-12-31`
  const desde = `${anio}-01-01`
  const { viajes } = await fetchViajesTlp(supabase, desde, hasta)
  const pdv = await tiempoPdvPorCiudad(supabase, viajes, desde, hasta)

  return {
    evolucion: evolucionDesdeViajes(viajes, anio),
    arbol: arbolDesdeViajes(viajes, anio, hasta, pdv),
  }
}

/**
 * Tiempo en PDV anual para el Árbol del Sueño: YTD (Σ minutos en PDV ÷ Σ
 * clientes visitados) + apertura mensual. Mismo cálculo que el nodo Tiempo en
 * PDV del árbol de /indicadores/tlp — ver `lib/tlp/tiempo-pdv.ts` para por qué
 * se despeja en vez de medirse.
 */
export async function tiempoPdvAnual(
  supabase: Supabase,
  anio: number,
): Promise<{ ytd: number; meses: { mes: number; valor: number; clientes: number }[] } | null> {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < `${anio}-12-31` ? hoy : `${anio}-12-31`
  const desde = `${anio}-01-01`

  const { viajes } = await fetchViajesTlp(supabase, desde, hasta)
  if (viajes.length === 0) return null

  const pdv = await tiempoPdvPorCiudad(supabase, viajes, desde, hasta)
  if (!pdv.total) return null

  return {
    ytd: pdv.total.minPorPdv,
    meses: [...pdv.porMes].map(([mes, t]) => ({
      mes,
      valor: t.minPorPdv,
      clientes: t.clientes,
    })),
  }
}
