/** Formato y semáforo compartidos por las pestañas de GOPs. */

export const MES_NOMBRE: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
}

export function pct(v: number | null, dec = 1): string {
  if (v === null) return "—"
  return `${(v * 100).toFixed(dec)}%`
}

/**
 * Semáforo contra el target del tema (0,85 por defecto). El amarillo arranca 15 puntos
 * abajo: no es lo mismo un GOP a punto de pasar que uno en la mitad de la tabla.
 */
export function tonoPuntaje(puntaje: number | null, target: number): "ok" | "cerca" | "lejos" {
  if (puntaje === null) return "lejos"
  if (puntaje >= target) return "ok"
  if (puntaje >= target - 0.15) return "cerca"
  return "lejos"
}

export const COLOR_TONO: Record<"ok" | "cerca" | "lejos", string> = {
  ok: "text-emerald-600",
  cerca: "text-amber-600",
  lejos: "text-red-600",
}

export const BARRA_TONO: Record<"ok" | "cerca" | "lejos", string> = {
  ok: "bg-emerald-500",
  cerca: "bg-amber-500",
  lejos: "bg-red-500",
}

export const DESTINO_LABEL: Record<string, string> = {
  plan: "Plan de acción",
  largo_plazo: "Largo plazo",
  no_aplica: "No aplica",
}

export const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}
