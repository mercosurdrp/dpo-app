import type { EmpleadoTalles } from "@/types/database"

/**
 * Catálogo fijo de ropa y EPP entregables (decisión 2026-08-07: lista en
 * código, no configurable). Las prendas con talle apuntan al campo de
 * empleados_talles que las prellena al armar una entrega.
 */

export type TalleCampo =
  | "talle_pantalon"
  | "talle_remera"
  | "talle_campera"
  | "talle_buzo"
  | "talle_botines"

export interface EppTipoItem {
  value: string
  label: string
  llevaTalle: boolean
  talleCampo?: TalleCampo
}

export const EPP_TIPOS_ITEM: EppTipoItem[] = [
  { value: "pantalon", label: "Pantalón", llevaTalle: true, talleCampo: "talle_pantalon" },
  { value: "remera", label: "Remera", llevaTalle: true, talleCampo: "talle_remera" },
  { value: "campera", label: "Campera", llevaTalle: true, talleCampo: "talle_campera" },
  { value: "buzo", label: "Buzo", llevaTalle: true, talleCampo: "talle_buzo" },
  { value: "botines", label: "Botines de seguridad", llevaTalle: true, talleCampo: "talle_botines" },
  { value: "casco", label: "Casco", llevaTalle: false },
  { value: "guantes", label: "Guantes", llevaTalle: false },
  { value: "lentes", label: "Lentes de seguridad", llevaTalle: false },
  { value: "chaleco", label: "Chaleco reflectivo", llevaTalle: false },
  { value: "proteccion_auditiva", label: "Protección auditiva", llevaTalle: false },
  { value: "faja", label: "Faja lumbar", llevaTalle: false },
  { value: "otro", label: "Otro", llevaTalle: false },
]

export const EPP_TIPO_LABELS: Record<string, string> = Object.fromEntries(
  EPP_TIPOS_ITEM.map((t) => [t.value, t.label])
)

// Rangos amplios a propósito: mejor que sobren opciones a que alguien no
// encuentre su talle y deje el campo vacío.
export const TALLES_LETRA = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"]

export const TALLES_PANTALON = Array.from({ length: 13 }, (_, i) => String(36 + i * 2)) // 36–60

export const TALLES_BOTINES = Array.from({ length: 13 }, (_, i) => String(35 + i)) // 35–47

export interface TalleCampoDef {
  campo: TalleCampo
  label: string
  opciones: string[]
}

/** Los 5 talles que carga el empleado, en orden de pantalla. */
export const TALLE_CAMPOS: TalleCampoDef[] = [
  { campo: "talle_pantalon", label: "Pantalón", opciones: TALLES_PANTALON },
  { campo: "talle_remera", label: "Remera", opciones: TALLES_LETRA },
  { campo: "talle_campera", label: "Campera", opciones: TALLES_LETRA },
  { campo: "talle_buzo", label: "Buzo", opciones: TALLES_LETRA },
  { campo: "talle_botines", label: "Botines", opciones: TALLES_BOTINES },
]

export function tallesCompletos(t: EmpleadoTalles | null): boolean {
  if (!t) return false
  return TALLE_CAMPOS.every((c) => !!t[c.campo])
}
