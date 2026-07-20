"use server"

import { requireAuth } from "@/lib/session"
import {
  consultarCoberturaVentanasHorarias,
  type CoberturaVh,
} from "@/lib/mercosur-dashboard"

// ===== Ventanas horarias de los PDV (DPO Entrega 4.4 "Entregas On Time") =====
// El punto 4.4 pide, en R4.4.2 y R4.4.3, una rutina TRIMESTRAL de revisión de las
// ventanas horarias del PDV y una BASE ÚNICA con esas ventanas disponible para
// ruteo y entrega, con >80% de los clientes cubiertos.
//
// El relevamiento no vive acá: es la página /horarios-pdv del dashboard Mercosur
// (Railway). dpo-app sólo LEE la cobertura para mostrarla dentro del punto de
// auditoría, igual que hace con el VRC. No se replica el dato ni se escribe nada.
//
// 🚨 La ventana horaria de Chess NO sirve como fuente: son valores "default"
// cargados masivamente que no se respetan operativamente (validado contra 30 y
// 120 días de Foxtrot). La única VH creíble es la relevada por el promotor.

/** Punto DPO Entrega 4.4 "ENTREGAS ON TIME" (key 5_2_26_84). */
export const PREGUNTA_44_ID = "abee84bc-9579-4e8e-9512-d6ce84f7f860"

export type CoberturaVhResult =
  | { data: CoberturaVh | null }
  | { error: string }

/**
 * Cobertura del relevamiento de ventanas horarias del ciclo vigente.
 * Degrada con `error` si la Railway no responde: NUNCA devuelve 0 como si fuera
 * un dato real, porque un 0 por caída se lee igual que un 0 por incumplimiento.
 */
export async function getCoberturaVentanasHorarias(
  ciclo?: string,
): Promise<CoberturaVhResult> {
  await requireAuth()
  try {
    const data = await consultarCoberturaVentanasHorarias(ciclo)
    return { data }
  } catch (e) {
    console.error("[ventanas-horarias] error consultando la Railway:", e)
    return {
      error:
        e instanceof Error
          ? `No se pudo leer el relevamiento de horarios: ${e.message}`
          : "No se pudo leer el relevamiento de horarios.",
    }
  }
}
