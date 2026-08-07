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

/**
 * Lo que se le OFRECE al chofer en `/mi-cil`.
 *
 * 🚨 `limpieza` ya no está: era prácticamente lo mismo que `limpieza_profunda` y
 * el chofer tenía que adivinar cuál elegir (decisión de Francisco, 07/08/2026).
 * Quedó la profunda. Ojo: sigue siendo una opción VÁLIDA de la tabla y las filas
 * históricas la usan — ver `ALIAS_CICLO` más abajo.
 */
export const TAREAS_CIL = [
  {
    id: "limpieza_profunda",
    label: "Limpieza profunda",
    detalle: "Lavado exterior, cabina, vidrios, espejos, ópticas y caja",
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

/**
 * Tareas que la tabla acepta pero que ya no se ofrecen. Están acá sólo para que
 * el histórico se siga leyendo con su nombre y no aparezca el id crudo.
 */
const TAREAS_HISTORICAS: Record<string, string> = {
  limpieza: "Limpieza",
}

/** Texto para mostrar a partir de lo que está guardado en la tabla. */
export function labelTareaCil(id: string): string {
  return (
    TAREAS_CIL.find((t) => t.id === id)?.label ?? TAREAS_HISTORICAS[id] ?? id
  )
}

/** Meta mensual de tareas CIL de toda la operación (KPI `cil_tareas`). */
export const META_CIL_MENSUAL = 30

/**
 * El ciclo que una unidad tiene que completar cada mes para estar al día: las
 * tres letras del CIL.
 */
export const CICLO_CIL_MENSUAL = [
  "limpieza_profunda",
  "inspeccion",
  "lubricacion",
] as const

/**
 * Equivalencias para leer el histórico.
 *
 * 🚨 Sin esto, sacar `limpieza` del catálogo borraba trabajo ya hecho: las 18
 * tareas de agosto de 2026 incluyen **6 de `limpieza`**, que son la C del ciclo
 * de esas 6 unidades. Si la C pasara a exigir literalmente `limpieza_profunda`,
 * la cobertura del mes se caía de 5/12 a 0/13 y el KPI perdía 6 tareas de un día
 * para el otro — sin que nadie hubiera dejado de limpiar un camión.
 *
 * La limpieza vieja cuenta como profunda hacia atrás; de acá en adelante sólo se
 * carga `limpieza_profunda`.
 */
const ALIAS_CICLO: Record<string, string> = {
  limpieza: "limpieza_profunda",
}

/**
 * A qué letra del ciclo corresponde una tarea guardada. Toda lectura del
 * histórico tiene que pasar por acá en vez de comparar el id crudo.
 */
export function tareaDelCiclo(tareaGuardada: string): string {
  return ALIAS_CICLO[tareaGuardada] ?? tareaGuardada
}

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
 *
 * 🚨 El `AC165AJ` estuvo acá hasta el 07/08/2026 como "camión de backup". Salió
 * por decisión de Francisco: a veces sale y a veces no, y dejarlo afuera por eso
 * generaba más lío del que resolvía. Los datos de entrega le daban la razón —
 * repartió 12 días entre el 08/07 y el 31/07, hasta 571 bultos en un día.
 */
export const DOMINIOS_CIL_EXCLUIDOS: Record<string, string> = {}
