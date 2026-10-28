// Modulación de rechazos: de los rechazos del día, cuántos gestionó el
// vendedor y, de esos, cuántos terminaron entregados ese mismo día.
//
// Definiciones (acordadas con la operación, 28/10/2026):
//   - Rechazo   = 1 alerta (1 visita con rechazo en Foxtrot).
//   - Modulado  = el vendedor GESTIONÓ: respondió el seguimiento del bot
//                 (evitado / reprogramado / perdido). La alerta se manda
//                 siempre, así que "enviada" no distingue nada.
//   - Exitoso   = modulado + entregado el MISMO DÍA (outcome automático
//                 recuperado_mismo_dia, no lo que dice el vendedor).
//   - Rechazado = modulado que no se entregó ese día.
//
// Lo usan la página de alertas y la Matinal de Distribución.

import type { OutcomeAlerta, ResultadoSeguimiento } from "./types"

export interface AlertaModulacion {
  fecha: string
  outcome: OutcomeAlerta
  seguimiento_resultado: ResultadoSeguimiento | null
}

export interface ModulacionResumen {
  rechazos: number
  modulados: number
  exitosos: number
  rechazados: number
  /** El vendedor no contestó (o todavía no le preguntaron). */
  sin_gestion: number
  /** modulados / rechazos, en %. null sin rechazos. */
  pct_modulacion: number | null
  /** exitosos / modulados, en %. null sin modulados. */
  pct_exito: number | null
}

export function esModulado(a: AlertaModulacion): boolean {
  return (
    a.seguimiento_resultado === "evitado" ||
    a.seguimiento_resultado === "reprogramado" ||
    a.seguimiento_resultado === "perdido"
  )
}

const pct1 = (n: number, den: number) =>
  den > 0 ? Math.round((1000 * n) / den) / 10 : null

export function resumirModulacion(alertas: AlertaModulacion[]): ModulacionResumen {
  let modulados = 0
  let exitosos = 0
  for (const a of alertas) {
    if (!esModulado(a)) continue
    modulados++
    if (a.outcome === "recuperado_mismo_dia") exitosos++
  }
  const rechazos = alertas.length
  return {
    rechazos,
    modulados,
    exitosos,
    rechazados: modulados - exitosos,
    sin_gestion: rechazos - modulados,
    pct_modulacion: pct1(modulados, rechazos),
    pct_exito: pct1(exitosos, modulados),
  }
}

/** Un resumen por fecha, de la más reciente a la más vieja. */
export function modulacionPorDia(
  alertas: AlertaModulacion[],
): Array<ModulacionResumen & { fecha: string }> {
  const porFecha = new Map<string, AlertaModulacion[]>()
  for (const a of alertas) {
    const arr = porFecha.get(a.fecha) ?? []
    arr.push(a)
    porFecha.set(a.fecha, arr)
  }
  return Array.from(porFecha.entries())
    .sort((x, y) => y[0].localeCompare(x[0]))
    .map(([fecha, arr]) => ({ fecha, ...resumirModulacion(arr) }))
}
