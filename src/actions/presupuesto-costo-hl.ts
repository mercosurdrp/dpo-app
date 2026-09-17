"use server"

import { getCuadroMensualIndicadores } from "@/actions/cuadro-mensual"

/**
 * Costo logístico por HL, mes a mes, para medir el aporte de cada iniciativa
 * de ahorro: ahorro del mes ÷ HL del mes = $/HL que la iniciativa le sacó al
 * costo, y ese aporte sobre el $/HL del mes = cuánto pesa.
 *
 * 🚨 Sale del Cuadro mensual de indicadores (Indicadores → Cuadro mensual),
 * pedido así por Sebastián el 16/09/2026: los HL son los "HL vendidos" del
 * pilar Ventas (`facturado_chess_hl`: facturado Chess neto = distribuido chess
 * + mostrador + presupuesto − notas de crédito − devoluciones) y el pool es
 * Costo Distribución + Costo Almacén (`costo_logistico_mensual`).
 *
 * Se eligió "vendidos" y no "distribuidos" (17/09/2026) para que el $/HL sea
 * EL MISMO que el VLC/HL del Árbol del Sueño: ene-ago 2026 los HL vendidos
 * del cuadro suman 88.224 y el Sueño divide por 88.230 (VLC/HL YTD 14.574).
 * Con "distribuidos" (6.825 HL en agosto contra 9.082 vendidos) el $/HL daba
 * un 30 % más alto y no cuadraba con ningún tablero. El % de aporte no cambia
 * con el denominador (termina siendo ahorro ÷ pool); sólo cambia el $/HL.
 */
export interface CostoHlMes {
  mes: number
  /** HL vendidos del mes (facturado Chess neto). null si el cuadro no tiene el dato. */
  hl: number | null
  /** Distribución + almacén. null si falta cualquiera de los dos. */
  pool: number | null
  /** pool ÷ hl. null sin pool o sin HL. */
  costoXHl: number | null
  /** Mes en curso: HL incompletos. */
  parcial: boolean
}

type Result<T> = { data: T } | { error: string }

export async function getCostoHlMensual(
  anio: number,
): Promise<Result<Record<number, CostoHlMes>>> {
  const cuadro = await getCuadroMensualIndicadores()
  if ("error" in cuadro) return { error: cuadro.error }

  const fila = (id: string) => cuadro.data.filas.find((f) => f.def.id === id)
  const hlFila = fila("facturado_chess_hl")
  const distFila = fila("costo_distribucion")
  const almFila = fila("costo_almacen")
  if (!hlFila) return { error: "El cuadro mensual no trae HL vendidos" }

  const out: Record<number, CostoHlMes> = {}
  for (const mesKey of cuadro.data.meses) {
    if (!mesKey.startsWith(`${anio}-`)) continue
    const mes = Number(mesKey.slice(5, 7))
    const hl = hlFila.celdas[mesKey]?.valor ?? null
    const dist = distFila?.celdas[mesKey]?.valor ?? null
    const alm = almFila?.celdas[mesKey]?.valor ?? null
    const pool = dist !== null && alm !== null ? dist + alm : null
    out[mes] = {
      mes,
      hl: hl !== null && hl > 0 ? hl : null,
      pool,
      costoXHl: pool !== null && hl !== null && hl > 0 ? pool / hl : null,
      parcial: mesKey === cuadro.data.mesActual,
    }
  }
  return { data: out }
}
