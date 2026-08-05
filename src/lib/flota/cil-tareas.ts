/**
 * Catálogo de tareas del CIL (DPO Flota 4.1).
 *
 * 🚨 Vive acá y no en `actions/mi-cil.ts` porque ese archivo es `"use server"` y
 * un módulo de server actions sólo puede exportar funciones async: exportar una
 * constante desde ahí rompe el build de producción.
 *
 * El `label` es el texto que queda escrito en `mantenimiento_cil.tarea` y el que
 * después lee el auditor, así que cambiarlo cambia el histórico.
 */
export const TAREAS_CIL = [
  {
    id: "limpieza",
    label: "Limpieza",
    detalle: "Lavado exterior, cabina, vidrios, espejos y ópticas",
  },
  {
    id: "limpieza_profunda",
    label: "Limpieza profunda",
    detalle: "Limpieza integral de la unidad, una vez por mes",
  },
  {
    id: "control_fluidos",
    label: "Control de fluidos",
    detalle: "Niveles y control de pérdidas de aceite, agua y refrigerante",
  },
  {
    id: "lubricacion",
    label: "Lubricación",
    detalle: "Engrase de los puntos que indica el plan de mantenimiento",
  },
] as const

/** Meta mensual de tareas CIL de toda la operación (KPI `cil_tareas`). */
export const META_CIL_MENSUAL = 30
