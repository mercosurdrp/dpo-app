// Lectura de la mejora de un indicador a partir de un bench (R5.2.4).
//
// El punto 5.2 define "mejorar" como:
//   - tendencia positiva: mejora en los últimos 3 meses
//   - mejora: mejor que antes del ejercicio / que el año anterior / que el ppto
//
// Acá comparamos el promedio de los meses ANTERIORES al mes de aplicación
// (hasta 3) contra el promedio de los meses desde la aplicación en adelante,
// y miramos la pendiente de los últimos 3 meses con dato. Vale tanto para la
// serie automática del Cuadro mensual como para la manual.

import type { AplicacionValor, MejorSi } from "@/types/benchmarking"

export interface Tendencia {
  mesBase: string | null
  antes: number | null
  despues: number | null
  /** despues − antes, en la unidad del indicador. */
  delta: number | null
  /** Variación relativa (%) sobre el "antes". */
  deltaPct: number | null
  /** true = mejoró según mejor_si; null = no se puede comparar todavía. */
  mejora: boolean | null
  /** Pendiente de los últimos 3 meses con dato: 'sube' | 'baja' | 'plana' | null. */
  ultimos3: "sube" | "baja" | "plana" | null
  /** true si la tendencia de los últimos 3 meses va para el lado correcto. */
  tendenciaPositiva: boolean | null
  ultimo: AplicacionValor | null
  cumpleMeta: boolean | null
}

function prom(vals: number[]): number | null {
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function mesDeFecha(fecha: string | null | undefined): string | null {
  if (!fecha || !/^\d{4}-\d{2}/.test(fecha)) return null
  return fecha.slice(0, 7)
}

export function calcularTendencia(
  serie: AplicacionValor[],
  fechaAplicacion: string | null,
  mejorSi: MejorSi,
  meta: number | null,
): Tendencia {
  const conDato = serie
    .filter((p) => p.valor !== null && Number.isFinite(p.valor))
    .sort((a, b) => a.mes.localeCompare(b.mes))
  const mesBase = mesDeFecha(fechaAplicacion)

  const antesVals = mesBase
    ? conDato.filter((p) => p.mes < mesBase).slice(-3).map((p) => p.valor as number)
    : []
  const despuesVals = mesBase
    ? conDato.filter((p) => p.mes >= mesBase).map((p) => p.valor as number)
    : []

  const antes = prom(antesVals)
  const despues = prom(despuesVals)
  const delta = antes !== null && despues !== null ? despues - antes : null
  const deltaPct = delta !== null && antes !== null && antes !== 0 ? (delta / Math.abs(antes)) * 100 : null
  const mejora =
    delta === null ? null : mejorSi === "mayor" ? delta > 0 : delta < 0

  const u3 = conDato.slice(-3)
  let ultimos3: Tendencia["ultimos3"] = null
  if (u3.length >= 2) {
    const d = (u3[u3.length - 1].valor as number) - (u3[0].valor as number)
    const ref = Math.abs(u3[0].valor as number) || 1
    ultimos3 = Math.abs(d) / ref < 0.005 ? "plana" : d > 0 ? "sube" : "baja"
  }
  const tendenciaPositiva =
    ultimos3 === null ? null : ultimos3 === "plana" ? false : mejorSi === "mayor" ? ultimos3 === "sube" : ultimos3 === "baja"

  const ultimo = conDato.length > 0 ? conDato[conDato.length - 1] : null
  const cumpleMeta =
    ultimo && meta !== null
      ? mejorSi === "mayor"
        ? (ultimo.valor as number) >= meta
        : (ultimo.valor as number) <= meta
      : null

  return { mesBase, antes, despues, delta, deltaPct, mejora, ultimos3, tendenciaPositiva, ultimo, cumpleMeta }
}

export function formatNum(v: number | null, unidad?: string | null): string {
  if (v === null || !Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  const dec = unidad === "%" ? 1 : abs >= 1000 ? 0 : abs >= 100 ? 1 : 2
  const s = v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return unidad === "%" ? `${s} %` : unidad === "$" ? `$ ${s}` : unidad ? `${s} ${unidad}` : s
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
export function nombreMesCorto(mes: string): string {
  const [y, m] = mes.split("-")
  const i = Number(m) - 1
  return `${MESES[i] ?? m} ${y.slice(2)}`
}
