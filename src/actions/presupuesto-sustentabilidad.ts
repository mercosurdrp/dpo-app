"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { getPptoCantidades } from "@/actions/presupuesto-generador"
import { KPI_EXTERNOS } from "@/lib/sueno/externos"

/**
 * Presupuesto y sustentabilidad: qué compromete el presupuesto sobre el FGLI
 * (Finished Goods Loss Index, HL perdidos por millón de HL) y cómo viene.
 *
 * La pregunta que responde la solapa de presupuesto es "¿el presupuesto MEJORA
 * el indicador?". Para eso se ponen en la misma vara tres números:
 *  - el real del año ANTERIOR (el punto de partida),
 *  - lo que el presupuesto del año PREVÉ perder (la Q de la hoja ALMACEN PXQ,
 *    pasada a HL, sobre los HL que el presupuesto prevé vender),
 *  - el real del año A LA FECHA (el FGLI del Árbol del Sueño).
 *
 * 🚨 Definición de FGLI (Handbook Almacén 3.4, y la misma del Sueño desde el
 * 14/09/2026): roturas + vencidos + diferencia neta de inventario, SIN
 * faltantes de entrega. El presupuesto tiene Q para las tres patas (ROTURAS Y
 * DERRAMES, PRODUCTO VENCIDO, DIFERENCIAS DE INVENTARIO) y también para
 * FALTANTES, que queda afuera a propósito.
 *
 * 🚨 La Q del presupuesto está en bultos y el FGLI en HL: se convierte con el
 * mix REAL del año (Σ HL ÷ Σ bultos de lo reportado por el depósito, por
 * grupo). Para diferencias de inventario el depósito no reporta bultos, así
 * que se usa el factor de roturas (producto entero, no envase chico como los
 * vencidos). Es un supuesto y está dicho en la tarjeta.
 *
 * 🚨 Denominadores: el presupuesto divide por los HL que preveía vender (EERR,
 * fila "Total en HL"); el real del Sueño divide por los HL entregados del
 * depósito; el año anterior por los HL de venta del tablero del depósito. Son
 * series parecidas (±10 %) y es lo que hay: sólo el EERR tiene presupuesto.
 */

const PERDIDAS_URL =
  "https://deposito-regionpampeana.vercel.app/api/shared/load?module=perdidas"
const TIMEOUT_MS = 8000

type Result<T> = { data: T } | { error: string }

/** Pata del FGLI ← concepto de la hoja ALMACEN PXQ ← grupo del depósito. */
const PATAS = [
  { key: "roturas", label: "Roturas y derrames", concepto: "ROTURAS Y DERRAMES", grupo: "Roturas y Derrames" },
  { key: "vencidos", label: "Producto vencido", concepto: "PRODUCTO VENCIDO", grupo: "Vencidos" },
  { key: "diferencias", label: "Diferencias de inventario", concepto: "DIFERENCIAS DE INVENTARIO", grupo: null },
] as const
type PataKey = (typeof PATAS)[number]["key"]

export interface SustentabilidadMes {
  mes: number
  /** ppm que el presupuesto prevé perder ese mes. null si no hay Q o volumen. */
  pptoPpm: number | null
  /** ppm real del año (FGLI del Sueño). null si el mes no cerró / sin dato. */
  realPpm: number | null
  /** ppm real del mismo mes del año anterior (roturas + vencidos). */
  anteriorPpm: number | null
}

export interface SustentabilidadPata {
  key: PataKey
  label: string
  /** HL del año anterior (real). null si el depósito no lo reporta. */
  hlAnterior: number | null
  /** HL que el presupuesto prevé para el año entero. */
  hlPpto: number | null
  bultosPpto: number | null
  /** HL reales del año a la fecha. null si no hay dato. */
  hlReal: number | null
  /** HL por bulto con el que se convirtió la Q. */
  factorHlBulto: number | null
  /** true si el factor se tomó prestado de otra pata. */
  factorPrestado: boolean
}

export interface SustentabilidadFgli {
  anio: number
  /** FGLI real del año anterior, año completo. null si no hay dato. */
  anteriorPpm: number | null
  /** Qué patas entran en el año anterior (diferencias no siempre está). */
  anteriorIncluye: PataKey[]
  /** FGLI que el presupuesto prevé para el año completo. */
  pptoAnualPpm: number | null
  /** FGLI presupuestado sólo para los meses que ya tienen real (misma ventana). */
  pptoYtdPpm: number | null
  /** FGLI real del año a la fecha (Sueño). */
  realYtdPpm: number | null
  /** Meses con real, para decir "a la fecha" con precisión. */
  mesesConReal: number
  /** Meta y gatillo del Sueño para el año. */
  meta: number | null
  gatillo: number | null
  meses: SustentabilidadMes[]
  patas: SustentabilidadPata[]
}

export interface SustentabilidadPresupuesto {
  fgli: SustentabilidadFgli | null
  /** Qué no se pudo leer, para decirlo en vez de mostrar un cero. */
  avisos: string[]
}

interface PerdidaItem {
  grupo?: string
  bultos?: number
  /** Algunos ítems vienen en unidades sueltas: bultos = unidades ÷ un_bulto. */
  unidades?: number
  un_bulto?: number
  hl?: number
}

interface PerdidasEndpoint {
  actual: Record<string, PerdidaItem[]>
  anterior: Record<string, PerdidaItem[]>
  /** año → mes → HL de venta. */
  hlVentas: Record<string, Record<string, number>>
}

async function fetchPerdidas(): Promise<PerdidasEndpoint> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(PERDIDAS_URL, {
      signal: ctrl.signal,
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`El tablero de depósito respondió ${res.status}`)
    const json = await res.json()
    const d = json?.data ?? json
    const leer = (bloque: unknown): Record<string, PerdidaItem[]> => {
      const out: Record<string, PerdidaItem[]> = {}
      if (!bloque || typeof bloque !== "object") return out
      for (const [mes, val] of Object.entries(bloque as Record<string, unknown>)) {
        const detalle = (val as { detalle?: PerdidaItem[] })?.detalle
        if (Array.isArray(detalle)) out[String(Number(mes))] = detalle
      }
      return out
    }
    return {
      actual: leer(d?.data_actual),
      anterior: leer(d?.data_anterior),
      hlVentas: (d?.hl_ventas ?? {}) as Record<string, Record<string, number>>,
    }
  } finally {
    clearTimeout(t)
  }
}

function sumaHl(items: PerdidaItem[], grupo: string): number {
  return items.filter((x) => x.grupo === grupo).reduce((a, x) => a + (x.hl ?? 0), 0)
}

/**
 * HL por bulto de un grupo sobre todo el bloque (Σ HL ÷ Σ bultos). Los bultos
 * se cuentan como en el KPI de pérdidas: `bultos` más las unidades sueltas
 * pasadas a bulto (`unidades ÷ un_bulto`). Sin eso el factor de roturas daba
 * 0,24 HL/bulto en vez de ~0,12 y el presupuesto parecía perder el doble.
 */
function factorDe(bloque: Record<string, PerdidaItem[]>, grupo: string): number | null {
  let hl = 0
  let bultos = 0
  for (const items of Object.values(bloque)) {
    for (const x of items) {
      if (x.grupo !== grupo) continue
      hl += x.hl ?? 0
      bultos += (x.bultos ?? 0) + (x.unidades ?? 0) / (x.un_bulto || 1)
    }
  }
  return bultos > 0 ? hl / bultos : null
}

export async function getSustentabilidadPresupuesto(
  anio: number,
): Promise<Result<SustentabilidadPresupuesto>> {
  try {
    await requireAuth()
    const avisos: string[] = []

    const [cantRes, perdidasRes, realRes, metaRes] = await Promise.allSettled([
      getPptoCantidades(anio),
      fetchPerdidas(),
      KPI_EXTERNOS.fgli.resumen(anio),
      (async () => {
        const supabase = await createClient()
        const { data } = await supabase
          .from("sueno_kpi_valores")
          .select("meta, gatillo")
          .eq("anio", anio)
          .eq("kpi_key", "fgli")
          .maybeSingle()
        return data as { meta: number | null; gatillo: number | null } | null
      })(),
    ])

    if (cantRes.status === "rejected") {
      return { data: { fgli: null, avisos: [`Sin presupuesto legible: ${String(cantRes.reason)}`] } }
    }
    if ("error" in cantRes.value) {
      return { data: { fgli: null, avisos: [`Sin presupuesto legible: ${cantRes.value.error}`] } }
    }
    const ppto = cantRes.value.data
    const perdidas = perdidasRes.status === "fulfilled" ? perdidasRes.value : null
    if (!perdidas) avisos.push("El tablero del depósito no respondió: sin año anterior ni factor HL/bulto real.")
    const real = realRes.status === "fulfilled" ? realRes.value : null
    if (!real) avisos.push("El FGLI real del Sueño no está disponible ahora.")
    const meta = metaRes.status === "fulfilled" ? metaRes.value : null

    // ── Factores HL/bulto por pata ──
    const factorRot =
      (perdidas && (factorDe(perdidas.actual, "Roturas y Derrames") ?? factorDe(perdidas.anterior, "Roturas y Derrames"))) ?? null
    const factorVen =
      (perdidas && (factorDe(perdidas.actual, "Vencidos") ?? factorDe(perdidas.anterior, "Vencidos"))) ?? null
    const factores: Record<PataKey, { f: number | null; prestado: boolean }> = {
      roturas: { f: factorRot, prestado: false },
      vencidos: { f: factorVen, prestado: false },
      diferencias: { f: factorRot, prestado: true },
    }

    // ── HL presupuestados por pata y por mes ──
    const hlPptoMes = new Map<number, number>() // Σ patas
    const patas: SustentabilidadPata[] = PATAS.map((p) => {
      const q = ppto.porConcepto[p.concepto] ?? null
      const f = factores[p.key].f
      let bultos: number | null = null
      let hl: number | null = null
      if (q && f !== null) {
        bultos = q.reduce((a, m) => a + m.bultos, 0)
        hl = bultos * f
        for (const m of q) hlPptoMes.set(m.mes, (hlPptoMes.get(m.mes) ?? 0) + m.bultos * f)
      } else if (q) {
        bultos = q.reduce((a, m) => a + m.bultos, 0)
        avisos.push(`${p.label}: el presupuesto tiene Q pero no hay factor HL/bulto para convertirla.`)
      } else {
        avisos.push(`${p.label}: el presupuesto no tiene fila Q en ALMACEN PXQ.`)
      }
      const hlAnterior =
        perdidas && p.grupo
          ? Object.values(perdidas.anterior).reduce((a, items) => a + sumaHl(items, p.grupo!), 0)
          : null
      const hlReal =
        perdidas && p.grupo
          ? Object.values(perdidas.actual).reduce((a, items) => a + sumaHl(items, p.grupo!), 0)
          : null
      return {
        key: p.key,
        label: p.label,
        hlAnterior,
        hlPpto: hl,
        bultosPpto: bultos,
        hlReal,
        factorHlBulto: f,
        factorPrestado: factores[p.key].prestado,
      }
    })

    // Diferencias reales del año: el resumen del Sueño trae en `bultos` el
    // "vencidos + diferencias" de cada mes; restando vencidos queda diferencias.
    if (real) {
      const venReal = patas.find((p) => p.key === "vencidos")?.hlReal ?? 0
      const venMasDif = real.meses.reduce((a, m) => a + (m.bultos ?? 0), 0)
      const dif = patas.find((p) => p.key === "diferencias")
      if (dif && venMasDif > 0) dif.hlReal = Math.max(0, venMasDif - venReal)
    }

    // ── Volumen presupuestado (denominador) ──
    const volPorMes = new Map(ppto.volumen.map((v) => [v.mes, v]))

    // ── Año anterior: roturas + vencidos ÷ HL de venta del tablero ──
    const anteriorIncluye: PataKey[] = ["roturas", "vencidos"]
    const hlVentasAnt = perdidas?.hlVentas?.[String(anio - 1)] ?? {}
    let antPerd = 0
    let antVol = 0
    const anteriorPorMes = new Map<number, number>()
    if (perdidas) {
      for (const [mesStr, items] of Object.entries(perdidas.anterior)) {
        const mes = Number(mesStr)
        const vol = Number(hlVentasAnt[mesStr] ?? 0)
        const perd = sumaHl(items, "Roturas y Derrames") + sumaHl(items, "Vencidos")
        if (vol > 0) {
          antPerd += perd
          antVol += vol
          anteriorPorMes.set(mes, (perd / vol) * 1e6)
        }
      }
    }

    // ── Serie mensual ──
    const realPorMes = new Map<number, { ppm: number; hl: number }>()
    for (const m of real?.meses ?? []) {
      if (m.valor !== null && m.registros !== null) realPorMes.set(m.mes, { ppm: m.valor, hl: m.registros })
    }
    const meses: SustentabilidadMes[] = []
    let pptoPerdAnual = 0
    let pptoVolAnual = 0
    let pptoPerdYtd = 0
    let pptoVolYtd = 0
    for (let mes = 1; mes <= 12; mes++) {
      const vol = volPorMes.get(mes)
      const perd = hlPptoMes.get(mes)
      const pptoPpm =
        vol && vol.hlPpto > 0 && perd !== undefined ? (perd / vol.hlPpto) * 1e6 : null
      if (pptoPpm !== null) {
        pptoPerdAnual += perd!
        pptoVolAnual += vol!.hlPpto
        if (realPorMes.has(mes)) {
          pptoPerdYtd += perd!
          pptoVolYtd += vol!.hlPpto
        }
      }
      meses.push({
        mes,
        pptoPpm,
        realPpm: realPorMes.get(mes)?.ppm ?? null,
        anteriorPpm: anteriorPorMes.get(mes) ?? null,
      })
    }

    // Real YTD como razón de sumas: Σ HL perdidos ÷ Σ HL entregados, con el
    // entregado de cada mes despejado de su ppm.
    let realPerd = 0
    let realEnt = 0
    for (const { ppm, hl } of realPorMes.values()) {
      if (ppm > 0) {
        realPerd += hl
        realEnt += (hl / ppm) * 1e6
      }
    }

    return {
      data: {
        fgli: {
          anio,
          anteriorPpm: antVol > 0 ? (antPerd / antVol) * 1e6 : null,
          anteriorIncluye,
          pptoAnualPpm: pptoVolAnual > 0 ? (pptoPerdAnual / pptoVolAnual) * 1e6 : null,
          pptoYtdPpm: pptoVolYtd > 0 ? (pptoPerdYtd / pptoVolYtd) * 1e6 : null,
          realYtdPpm: realEnt > 0 ? (realPerd / realEnt) * 1e6 : null,
          mesesConReal: realPorMes.size,
          meta: meta?.meta ?? null,
          gatillo: meta?.gatillo ?? null,
          meses,
          patas,
        },
        avisos,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error leyendo sustentabilidad",
    }
  }
}
