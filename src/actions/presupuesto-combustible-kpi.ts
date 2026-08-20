"use server"

import * as XLSX from "xlsx"
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
 * 🚨 Se descartan las cargas con rendimiento fuera de [2, 6] km/l. En estos
 * camiones no son valores posibles: son cargas con el odómetro salteado (falta
 * registrar la carga anterior, da 10 km/l), cargas duplicadas el mismo día o
 * cargas a tanque no lleno (dan 0,06 km/l). Es el mismo criterio con el que se
 * calculó la línea base cargada en el seguimiento Q2-2026 de la iniciativa.
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
  "RENDIMIENTO COMBUSTIBLE LARGA DISTANCIA": [
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
  "RENDIMIENTO COMBUSTIBLE LARGA DISTANCIA": [],
}

/** Rango de rendimiento plausible para un camión de reparto/larga distancia. */
const REND_MIN = 2
const REND_MAX = 6

/**
 * Ahorro en plata de la iniciativa, estimado desde el rendimiento físico.
 *
 * `registro_combustible.costo_total` no sirve para esto: desde junio nadie lo
 * carga y lo poco cargado es basura (cargas de 154 lts con $2.359 total). En su
 * lugar: litros EVITADOS (los km recorridos a la línea base menos los litros
 * realmente cargados) valorizados al precio del gasoil con el que se armó el
 * presupuesto del año (fila "PRECIO COMBUSTIBLES - GASOIL" de la hoja FLOTA PXQ
 * del EERR) — la misma vara contra la que se comprometió el ahorro.
 */
export interface AhorroCombustibleMes {
  mes: number
  km: number
  litros: number
  /** Litros que se habrían quemado a la línea base (km ÷ base). */
  litrosBase: number
  litrosEvitados: number
  /** $/litro del presupuesto P×Q. null si el EERR no lo trae. */
  precioLitro: number | null
  pesos: number | null
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
  /** km/l del grupo completo. null si el mes no tuvo cargas válidas. */
  real: number | null
  /** km/l de los camiones ya intervenidos. null si no hay dato ese mes. */
  intervenidos: number | null
  /** km/l de los camiones sin intervenir (grupo de control). */
  control: number | null
  km: number
  litros: number
  cargas: number
}

export interface KpiCombustible {
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

const SHEET_FLOTA_PXQ = "FLOTA PXQ mrp"
const FILA_PRECIO_GASOIL = "PRECIO COMBUSTIBLES - GASOIL"

/**
 * Precio mensual del gasoil con el que se armó el presupuesto del año (índice
 * 0 = enero), desde la hoja FLOTA PXQ del EERR. En esa hoja el concepto va en
 * la columna 3 y enero arranca en la columna 6 (la 5 es el precio base del
 * armado). null si no hay EERR o no trae la fila: el ahorro queda en litros.
 */
async function getPreciosGasoil(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anio: number,
): Promise<(number | null)[] | null> {
  const { data: eerr } = await supabase
    .from("presupuestos_eerr_anual")
    .select("archivo_url")
    .eq("anio", anio)
    .maybeSingle()
  if (!eerr?.archivo_url) return null

  const { data: blob } = await supabase.storage
    .from("presupuestos")
    .download(eerr.archivo_url)
  if (!blob) return null

  const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" })
  const ws = wb.Sheets[SHEET_FLOTA_PXQ]
  if (!ws) return null
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  })
  const fila = aoa.find(
    (f) =>
      typeof f?.[3] === "string" &&
      f[3].replace(/\s+/g, " ").trim().toUpperCase() === FILA_PRECIO_GASOIL,
  )
  if (!fila) return null
  return Array.from({ length: 12 }, (_, m) => {
    const v = fila[6 + m]
    return typeof v === "number" && v > 0 ? v : null
  })
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

  const preciosGasoil = await getPreciosGasoil(supabase, anio)

  const filas = (data ?? []) as FilaCarga[]
  const out: Record<string, KpiCombustible> = {}

  for (const kpi of kpis) {
    const dominios = DOMINIOS_POR_KPI[kpi]
    const intervenidos = DOMINIOS_INTERVENIDOS_POR_KPI[kpi] ?? []
    const delGrupo = filas.filter((f) => dominios.includes(f.dominio))

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
      const rend = f.rendimiento
      // Sin delta de odómetro o sin litros no hay rendimiento que calcular.
      if (km === null || litros === null || litros <= 0) continue
      if (rend === null || rend < REND_MIN || rend > REND_MAX) {
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
        const rend = f.rendimiento
        if (km === null || litros === null || litros <= 0) continue
        if (rend === null || rend < REND_MIN || rend > REND_MAX) continue
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

  return { data: out }
}
