/**
 * Catálogo de artículos de limpieza que se le entregan a cada unidad.
 *
 * Vive acá y no en `actions/articulos-limpieza.ts` por la misma razón que
 * `cil-tareas.ts`: un módulo `"use server"` sólo puede exportar funciones
 * async, y exportar una constante desde ahí rompe el build de producción.
 *
 * Se guarda el `id`, nunca el `label`: el label se puede renombrar libremente
 * sin tocar lo ya registrado.
 */
export const ARTICULOS_LIMPIEZA = [
  { id: "escoba", label: "Escoba" },
  { id: "rejilla", label: "Rejilla" },
  { id: "franela", label: "Franela" },
] as const

export type ArticuloLimpiezaId = (typeof ARTICULOS_LIMPIEZA)[number]["id"]

/** Texto para mostrar a partir de lo que está guardado. */
export function labelArticulo(id: string): string {
  return ARTICULOS_LIMPIEZA.find((a) => a.id === id)?.label ?? id
}
