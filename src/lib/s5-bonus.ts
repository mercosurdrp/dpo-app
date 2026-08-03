/**
 * Bonus 5S por documentar el trabajo del mes.
 *
 * Vive fuera de las server actions porque un módulo `"use server"` solo puede
 * exportar funciones async, y estas son cálculos puros que también corren en
 * el cliente para mostrarle al operario lo que va ganando.
 */

export interface ResumenDocumentacion {
  /** Evidencias cargadas en el mes. */
  total: number
  /** Evidencias con foto de antes Y de después. */
  con_antes_despues: number
  /** Puntos que suma a la nota de la auditoría del mes. */
  bonus: number
}

/** Máximo que puede sumar documentar el trabajo, en puntos de la nota 0-100. */
export const BONUS_MAX = 3

/**
 * La escala premia el "antes y después": veinte fotos sueltas no llegan al
 * techo, pero cinco cargas con tres pares antes/después sí.
 */
export function calcularBonus(total: number, conAntesDespues: number): number {
  if (total === 0) return 0
  if (total >= 5 && conAntesDespues >= 3) return 3
  if (total >= 5 || conAntesDespues >= 2) return 2
  return 1
}

export function textoBonus(r: ResumenDocumentacion): string {
  return `Documentación 5S del mes: ${r.total} tarea${r.total === 1 ? "" : "s"} cargada${
    r.total === 1 ? "" : "s"
  } por el responsable (${r.con_antes_despues} con antes y después) → +${r.bonus} punto${
    r.bonus === 1 ? "" : "s"
  } sobre la nota de los ítems.`
}
