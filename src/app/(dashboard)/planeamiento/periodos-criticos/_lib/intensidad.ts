// Escala del calendario de Períodos Críticos (DPO 3.4): el "juego de las P".
//
// Tres indicadores, cada uno da una P cuando el día cruza su umbral:
//   · Volumen    — los HL del día llegan a la capacidad de distribución
//   · Rechazo    — la tasa de rechazo del día supera el máximo
//   · Ausentismo — el % de ausentes del día llega al máximo
//
// El color sale de cuántas P juntó el día, en tres tonos:
//   ROJO     CRITICO  = PPP  (los tres cruzados)
//   AMARILLO ATENCION = PP   (dos de tres)
//   VERDE    NORMAL   = P o ninguna
//
// Clientes y el % de capacidad se ven en el detalle del día como dato, pero no
// dan P ni cambian el color. Pedido por Sebastián Roselli el 14/09/2026.
//
// Este archivo no tiene "use client": lo importan la pantalla, las APIs del mes
// siguiente y de próximos focos, y la sección de la reunión Ventas-Logística.

export type Intensidad = "CRITICO" | "ATENCION" | "NORMAL"

/** Lo mínimo que hace falta saber de un día para clasificarlo. */
export type DiaClasificable = {
  trigger_vol: boolean
  trigger_otif: boolean
  trigger_aus: boolean
}

export type Indicador = keyof DiaClasificable

/** Los tres indicadores, en el orden en que se leen las P. */
export const INDICADORES: Array<[Indicador, string]> = [
  ["trigger_vol", "Volumen: llega a la capacidad"],
  ["trigger_otif", "Rechazo: supera el máximo"],
  ["trigger_aus", "Ausentismo: llega al máximo"],
]

/** Cuántos indicadores cruzaron (0–3). */
export function cantidadP(d: DiaClasificable): number {
  return (d.trigger_vol ? 1 : 0) + (d.trigger_otif ? 1 : 0) + (d.trigger_aus ? 1 : 0)
}

/** "PPP" / "PP" / "P" / "". */
export function codigoP(d: DiaClasificable): string {
  return "P".repeat(cantidadP(d))
}

export function intensidadDia(d: DiaClasificable): Intensidad {
  const n = cantidadP(d)
  if (n >= 3) return "CRITICO"
  if (n === 2) return "ATENCION"
  return "NORMAL"
}

// De menor a mayor, para poder pedir "la peor del bloque".
const ESCALA: Intensidad[] = ["NORMAL", "ATENCION", "CRITICO"]

export function intensidadMax(dias: DiaClasificable[]): Intensidad {
  let peor = 0
  for (const d of dias) peor = Math.max(peor, ESCALA.indexOf(intensidadDia(d)))
  return ESCALA[peor]
}

export const INTENSIDAD_LABEL: Record<Intensidad, string> = {
  CRITICO: "CRÍTICO",
  ATENCION: "ATENCIÓN",
  NORMAL: "NORMAL",
}

/** Código de P que corresponde al escalón (para leyendas). */
export const INTENSIDAD_CODIGO: Record<Intensidad, string> = {
  CRITICO: "PPP",
  ATENCION: "PP",
  NORMAL: "P / —",
}

/** Descripción corta de cada escalón (planes de acción, leyendas). */
export const INTENSIDAD_DESC: Record<Intensidad, string> = {
  CRITICO: "PPP: volumen, rechazo y ausentismo cruzados el mismo día",
  ATENCION: "PP: dos de los tres indicadores cruzados",
  NORMAL: "Un indicador o ninguno",
}

// Color de fondo por intensidad (celdas del calendario / badges).
export const INTENSIDAD_BG: Record<Intensidad, string> = {
  CRITICO:  "bg-red-600 text-white font-semibold",
  ATENCION: "bg-amber-300 text-amber-950 font-medium",
  NORMAL:   "bg-emerald-500/80 text-white",
}
