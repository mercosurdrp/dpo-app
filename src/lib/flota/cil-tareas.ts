/**
 * Catálogo de tareas del CIL (DPO Flota 4.1).
 *
 * 🚨 Vive acá y no en `actions/mi-cil.ts` porque ese archivo es `"use server"` y
 * un módulo de server actions sólo puede exportar funciones async: exportar una
 * constante desde ahí rompe el build de producción.
 *
 * 🚨 Lo que se guarda en `mantenimiento_cil.tarea` es el `id`, NO el `label`: la
 * columna tiene un CHECK que sólo acepta `limpieza`, `limpieza_profunda`,
 * `inspeccion` y `lubricacion`. Guardar el label hacía fallar el INSERT entero
 * con `23514` y el chofer veía un error al registrar (roto del 05 al 06/08/2026).
 * El `label` es sólo lo que se muestra en pantalla y se puede cambiar libremente.
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
    // La I de CIL. Se llamaba `control_fluidos`, que el CHECK no acepta: era la
    // segunda mitad del mismo error. El histórico usa `inspeccion` desde el
    // 11/07, así que unificar acá deja toda la serie comparable.
    id: "inspeccion",
    label: "Inspección (control de fluidos)",
    detalle: "Niveles y control de pérdidas de aceite, agua y refrigerante",
  },
  {
    id: "lubricacion",
    label: "Lubricación",
    detalle: "Engrase de los puntos que indica el plan de mantenimiento",
  },
] as const

/** Texto para mostrar a partir de lo que está guardado en la tabla. */
export function labelTareaCil(id: string): string {
  return TAREAS_CIL.find((t) => t.id === id)?.label ?? id
}

/** Meta mensual de tareas CIL de toda la operación (KPI `cil_tareas`). */
export const META_CIL_MENSUAL = 30

/**
 * El ciclo que una unidad tiene que completar cada mes para estar al día: las
 * tres letras del CIL. `limpieza_profunda` queda afuera a propósito — es un
 * extra mensual, no parte del ciclo exigible.
 */
export const CICLO_CIL_MENSUAL = ["limpieza", "inspeccion", "lubricacion"] as const

/**
 * Alcance del seguimiento mensual, por `catalogo_vehiculos.tipo`: camiones y
 * autoelevadores.
 *
 * Quedan afuera, por decisión de Francisco el 06/08/2026:
 *  - **camionetas**: la inspección y la lubricación se hacen en la base, pero el
 *    lavado a veces va a un lavadero externo y no deja registro propio;
 *  - **acoplado**: no tiene motor, así que fluidos y lubricación no le aplican.
 */
export const TIPOS_CIL_OBLIGATORIOS = ["camion", "autoelevador"] as const

/**
 * Unidades que no entran aunque su tipo sí: no ruedan y no tienen chofer
 * designado, así que arrastrarían el porcentaje para abajo todos los meses sin
 * decir nada sobre la flota que trabaja.
 *
 * 🚨 Se muestran igual en la pantalla, en un bloque aparte: que no cuenten no
 * significa esconderlas del auditor.
 */
export const DOMINIOS_CIL_EXCLUIDOS: Record<string, string> = {
  AC165AJ: "Camión de backup: no rueda y no tiene chofer designado",
}
