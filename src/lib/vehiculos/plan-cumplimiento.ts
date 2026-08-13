import type { EstadoPlanVehiculo } from "@/types/database"

// Cumplimiento del plan preventivo, aparte de `flota-kpis` porque lo necesitan
// las dos puntas: el cron de snapshots (servidor, con Supabase) y la tarjeta del
// tablero (componente cliente). `flota-kpis` arrastra `next/headers` a través de
// `loadEstadoPlan`, así que importarlo desde el cliente rompe el build.

/**
 * Tareas al día ÷ tareas con datos, con el tamaño de la muestra.
 *
 * 🚨 La cobertura no es un extra decorativo: las celdas `sin_datos` quedan fuera
 * del denominador, así que el porcentaje habla sólo de las tareas que alguien
 * cargó alguna vez. En agosto de 2026 el KPI daba 100 % en verde sobre **13 de
 * 122** celdas plan×unidad (1 de 8 por camión; los dos autoelevadores, 0 de 12):
 * el 89 % del plan preventivo no tenía un solo registro y el tablero lo mostraba
 * como cumplimiento perfecto. Sin el par (conDato, total) al lado, ese 100 % no
 * se puede leer.
 */
export function cumplimientoPlanDesdeEstados(estados: EstadoPlanVehiculo[]): {
  pct: number | null
  /** Celdas con al menos un mantenimiento cargado (el denominador real). */
  conDato: number
  /** Celdas plan×unidad activa que el plan preventivo exige. */
  total: number
} {
  let ok = 0
  let noOk = 0
  let total = 0
  for (const e of estados) {
    for (const c of e.celdas) {
      total++
      if (c.estado === "ok") ok++
      else if (c.estado === "proximo" || c.estado === "vencido") noOk++
    }
  }
  const conDato = ok + noOk
  return { pct: conDato > 0 ? (ok / conDato) * 100 : null, conDato, total }
}

/**
 * Cobertura mínima para que el cumplimiento del plan se juzgue contra la meta.
 *
 * Por debajo de esto el porcentaje sigue mostrándose —con su n— pero el semáforo
 * queda neutro: un 100 % sobre el 11 % del plan no es un plan cumplido, es un
 * plan sin datos, y pintarlo de verde apaga justamente la alarma que haría
 * falta. 60 % es el piso donde el número empieza a describir a la flota y no a
 * un puñado de tareas sueltas.
 */
export const PLAN_COBERTURA_MINIMA = 60
