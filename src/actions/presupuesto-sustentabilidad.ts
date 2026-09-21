"use server"

import { requireAuth } from "@/lib/session"
import { getPptoCantidades } from "@/actions/presupuesto-generador"
import { fetchMermaFinalDelAnio, type MermaFinalMes } from "@/lib/sueno/externos"

/**
 * Presupuesto y sustentabilidad: qué compromete el presupuesto sobre el FGLI
 * (Finished Goods Loss Index, HL perdidos por millón de HL) y cómo viene.
 *
 * La pregunta que responde la solapa de presupuesto es "¿el presupuesto MEJORA
 * el indicador?". Para eso se ponen en la misma vara tres números:
 *  - el real del año ANTERIOR (el punto de partida),
 *  - lo que el presupuesto del año PREVÉ perder (la Q de la hoja ALMACEN PXQ,
 *    pasada a HL, sobre los HL que el presupuesto prevé vender),
 *  - el real del año A LA FECHA, en MERMA FINAL.
 *
 * 🚨 Definición de FGLI acá (Handbook Almacén 3.4): roturas DESCARTADAS +
 * vencidos + diferencia neta de inventario, SIN faltantes de entrega. Es la
 * base que cierra con el presupuesto, cuya Q son bultos que se dan de baja.
 * NO es la del Árbol del Sueño: desde el 17/09/2026 el árbol sigue el Reporte
 * DPO (volumen AFECTADO, con todo lo que entra a reempaque) y da ~3× más; por
 * eso esta sección no muestra el FGLI ni la meta del Sueño, no serían
 * comparables. El presupuesto tiene Q para las tres patas (ROTURAS Y
 * DERRAMES, PRODUCTO VENCIDO, DIFERENCIAS DE INVENTARIO) y también para
 * FALTANTES, que queda afuera a propósito.
 *
 * 🚨 La Q del presupuesto está en bultos y el FGLI en HL: se convierte con el
 * mix REAL del año (Σ HL ÷ Σ bultos de lo reportado por el depósito, por
 * grupo). Para diferencias de inventario el depósito no reporta bultos, así
 * que se usa el factor de roturas (producto entero, no envase chico como los
 * vencidos). Es un supuesto y está dicho en la tarjeta.
 *
 * 🚨 Fuente de los reales (desde el 2026-09-21): el bloque `merma` de la base
 * del Reporte DPO en `/api/indicadores`, la MISMA llamada que alimenta el
 * FGLI del Árbol del Sueño, para el año y para el anterior. Roturas = rotura
 * de almacén descartada + rotura de entrega (igual que #53 del reporte, pero
 * en merma final). Denominador = #28 HL despachados en concepto de venta,
 * el mismo del árbol. Antes 2025 salía del módulo de pérdidas (÷ HL de
 * venta) y 2026 de la serie diaria: dos endpoints, dos denominadores.
 *
 * 🚨 Denominador del presupuesto: los HL que preveía vender (EERR, fila
 * "Total en HL"). Es parecido a #28 (±10 %) y es lo que hay: sólo el EERR
 * tiene presupuesto.
 *
 * 🚨 Meta: la tarjeta NO muestra el FGLI ni la meta del Sueño (volumen
 * afectado, otra base: ~3× más). Aplica la MISMA regla del árbol en esta
 * base: gatillo = real del año anterior, meta = 10 % mejor. Con eso se ve
 * si el presupuesto pide lo mismo que la meta (2026: ppto 1.005 vs meta
 * ~1.000). Decisión de Sebastián, 2026-09-21.
 */

const PERDIDAS_URL =
  "https://deposito-regionpampeana.vercel.app/api/shared/load?module=perdidas"
const TIMEOUT_MS = 8000

type Result<T> = { data: T } | { error: string }

/** Pata del FGLI ← concepto de la hoja ALMACEN PXQ. */
const PATAS = [
  { key: "roturas", label: "Roturas y derrames", concepto: "ROTURAS Y DERRAMES" },
  { key: "vencidos", label: "Producto vencido", concepto: "PRODUCTO VENCIDO" },
  { key: "diferencias", label: "Diferencias de inventario", concepto: "DIFERENCIAS DE INVENTARIO" },
] as const
type PataKey = (typeof PATAS)[number]["key"]

export interface SustentabilidadMes {
  mes: number
  /** ppm que el presupuesto prevé perder ese mes. null si no hay Q o volumen. */
  pptoPpm: number | null
  /** ppm real del año (merma final). null si el mes no cerró / sin dato. */
  realPpm: number | null
  /** ppm real del mismo mes del año anterior (merma final, misma base). */
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
  /** Qué patas entran en el año anterior. */
  anteriorIncluye: PataKey[]
  /** FGLI que el presupuesto prevé para el año completo. */
  pptoAnualPpm: number | null
  /** FGLI presupuestado sólo para los meses que ya tienen real (misma ventana). */
  pptoYtdPpm: number | null
  /** FGLI real del año a la fecha (merma final). */
  realYtdPpm: number | null
  /** Meta en esta base: 10 % mejor que el real del año anterior (regla del Sueño). */
  metaPpm: number | null
  /** Gatillo: el real del año anterior (si no se le gana, rojo). */
  gatilloPpm: number | null
  /** Meses con real, para decir "a la fecha" con precisión. */
  mesesConReal: number
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

/** Sólo se usa para el factor HL/bulto: los HL reales salen de la base del Reporte DPO. */
interface PerdidasEndpoint {
  actual: Record<string, PerdidaItem[]>
  anterior: Record<string, PerdidaItem[]>
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
    }
  } finally {
    clearTimeout(t)
  }
}

/** Regla del Sueño para estos KPIs: meta = 10 % mejor que el año anterior. */
const META_MEJORA = 0.1

/** HL de una pata en merma final. Roturas = almacén descartada + entrega. */
function hlPata(m: MermaFinalMes, pata: PataKey): number {
  if (pata === "roturas") return m.roturasAlmacen + m.roturasEntrega
  if (pata === "vencidos") return m.vencidos
  return m.diferencias
}

/** FGLI en HL: roturas + vencidos + diferencias, sin faltantes de entrega. */
function mermaFinal(m: MermaFinalMes): number {
  return hlPata(m, "roturas") + hlPata(m, "vencidos") + hlPata(m, "diferencias")
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

    const [cantRes, perdidasRes, realRes, antRes] = await Promise.allSettled([
      getPptoCantidades(anio),
      fetchPerdidas(),
      fetchMermaFinalDelAnio(anio),
      fetchMermaFinalDelAnio(anio - 1),
    ])

    if (cantRes.status === "rejected") {
      return { data: { fgli: null, avisos: [`Sin presupuesto legible: ${String(cantRes.reason)}`] } }
    }
    if ("error" in cantRes.value) {
      return { data: { fgli: null, avisos: [`Sin presupuesto legible: ${cantRes.value.error}`] } }
    }
    const ppto = cantRes.value.data
    const perdidas = perdidasRes.status === "fulfilled" ? perdidasRes.value : null
    if (!perdidas) avisos.push("El módulo de pérdidas del depósito no respondió: sin factor HL/bulto real.")
    const soloConDato = (r: PromiseSettledResult<(MermaFinalMes | null)[]>): MermaFinalMes[] =>
      r.status === "fulfilled" ? r.value.filter((m): m is MermaFinalMes => m !== null) : []
    const real = soloConDato(realRes)
    const anterior = soloConDato(antRes)
    if (real.length === 0) avisos.push(`La merma final ${anio} (base del Reporte DPO del depósito) no está disponible ahora.`)
    if (anterior.length === 0) avisos.push(`La merma final ${anio - 1} (base del Reporte DPO del depósito) no está disponible ahora.`)

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
      const hlAnterior = anterior.length ? anterior.reduce((a, m) => a + hlPata(m, p.key), 0) : null
      const hlReal = real.length ? real.reduce((a, m) => a + hlPata(m, p.key), 0) : null
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

    // ── Volumen presupuestado (denominador) ──
    const volPorMes = new Map(ppto.volumen.map((v) => [v.mes, v]))

    // ── Año anterior: merma final ÷ #28, mes a mes y año completo ──
    const anteriorIncluye: PataKey[] = ["roturas", "vencidos", "diferencias"]
    let antPerd = 0
    let antVol = 0
    const anteriorPorMes = new Map<number, number>()
    for (const m of anterior) {
      const perd = mermaFinal(m)
      antPerd += perd
      antVol += m.entregado
      anteriorPorMes.set(m.mes, (perd / m.entregado) * 1e6)
    }
    const anteriorPpm = antVol > 0 ? (antPerd / antVol) * 1e6 : null

    // ── Serie mensual ──
    const realPorMes = new Map<number, { ppm: number; hl: number; ent: number }>()
    for (const m of real) {
      const perd = mermaFinal(m)
      realPorMes.set(m.mes, { ppm: (perd / m.entregado) * 1e6, hl: perd, ent: m.entregado })
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

    // Real YTD como razón de sumas: Σ HL perdidos ÷ Σ HL entregados.
    let realPerd = 0
    let realEnt = 0
    for (const { hl, ent } of realPorMes.values()) {
      realPerd += hl
      realEnt += ent
    }

    return {
      data: {
        fgli: {
          anio,
          anteriorPpm,
          anteriorIncluye,
          pptoAnualPpm: pptoVolAnual > 0 ? (pptoPerdAnual / pptoVolAnual) * 1e6 : null,
          pptoYtdPpm: pptoVolYtd > 0 ? (pptoPerdYtd / pptoVolYtd) * 1e6 : null,
          realYtdPpm: realEnt > 0 ? (realPerd / realEnt) * 1e6 : null,
          metaPpm: anteriorPpm !== null ? anteriorPpm * (1 - META_MEJORA) : null,
          gatilloPpm: anteriorPpm,
          mesesConReal: realPorMes.size,
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
