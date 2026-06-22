import type { VehiculoTipo } from "@/types/database"

// Layout de posiciones de neumáticos por tipo de unidad, para el diagrama
// interactivo. Las coordenadas x/y son porcentajes (0-100) sobre la silueta
// vista desde arriba (el frente de la unidad arriba). El eje define si la
// posición es direccional (dirección) o de tracción.

export type EjeNeumatico = "direccional" | "traccion"

export interface PosicionNeumatico {
  /** Código persistido en mantenimiento_neumaticos.posicion */
  code: string
  /** Etiqueta corta para el diagrama */
  label: string
  x: number
  y: number
  /** null = eje libre (acoplado: ni direccional ni tracción) */
  eje: EjeNeumatico | null
}

// Convención de códigos:
//   <nro-eje><lado><posición-en-eje>
//   lado: I = izquierda, D = derecha
//   posición-en-eje: E = externa, I = interna (solo en ruedas duales)
// Ej.: "1I" = eje 1, izquierda; "2IE" = eje 2, izquierda externa.

const CAMION: PosicionNeumatico[] = [
  // Eje 1 — direccional (delantero)
  { code: "1I", label: "1I", x: 20, y: 14, eje: "direccional" },
  { code: "1D", label: "1D", x: 80, y: 14, eje: "direccional" },
  // Eje 2 — tracción (trasero, rueda dual)
  { code: "2IE", label: "2IE", x: 7, y: 80, eje: "traccion" },
  { code: "2II", label: "2II", x: 27, y: 80, eje: "traccion" },
  { code: "2DI", label: "2DI", x: 73, y: 80, eje: "traccion" },
  { code: "2DE", label: "2DE", x: 93, y: 80, eje: "traccion" },
]

const CAMIONETA: PosicionNeumatico[] = [
  { code: "1I", label: "1I", x: 22, y: 16, eje: "direccional" },
  { code: "1D", label: "1D", x: 78, y: 16, eje: "direccional" },
  { code: "2I", label: "2I", x: 22, y: 80, eje: "traccion" },
  { code: "2D", label: "2D", x: 78, y: 80, eje: "traccion" },
]

// El autoelevador dirige con las ruedas traseras y tracciona con las delanteras.
const AUTOELEVADOR: PosicionNeumatico[] = [
  { code: "1I", label: "1I", x: 20, y: 16, eje: "traccion" },
  { code: "1D", label: "1D", x: 80, y: 16, eje: "traccion" },
  { code: "2I", label: "2I", x: 38, y: 82, eje: "direccional" },
  { code: "2D", label: "2D", x: 62, y: 82, eje: "direccional" },
]

// Acoplado / semirremolque: 3 ejes traseros con rueda dual (12 cubiertas),
// todas de eje libre (ni dirección ni tracción).
const ACOPLADO: PosicionNeumatico[] = [
  { code: "1IE", label: "1IE", x: 7, y: 40, eje: null },
  { code: "1II", label: "1II", x: 27, y: 40, eje: null },
  { code: "1DI", label: "1DI", x: 73, y: 40, eje: null },
  { code: "1DE", label: "1DE", x: 93, y: 40, eje: null },
  { code: "2IE", label: "2IE", x: 7, y: 62, eje: null },
  { code: "2II", label: "2II", x: 27, y: 62, eje: null },
  { code: "2DI", label: "2DI", x: 73, y: 62, eje: null },
  { code: "2DE", label: "2DE", x: 93, y: 62, eje: null },
  { code: "3IE", label: "3IE", x: 7, y: 84, eje: null },
  { code: "3II", label: "3II", x: 27, y: 84, eje: null },
  { code: "3DI", label: "3DI", x: 73, y: 84, eje: null },
  { code: "3DE", label: "3DE", x: 93, y: 84, eje: null },
]

export const LAYOUT_NEUMATICOS: Record<VehiculoTipo, PosicionNeumatico[]> = {
  camion: CAMION,
  camioneta: CAMIONETA,
  utilitario: CAMIONETA,
  autoelevador: AUTOELEVADOR,
  acoplado: ACOPLADO,
}

export function layoutDeTipo(tipo: VehiculoTipo | null): PosicionNeumatico[] {
  return LAYOUT_NEUMATICOS[tipo ?? "camion"] ?? CAMION
}

export function ejeDePosicion(
  tipo: VehiculoTipo | null,
  code: string
): EjeNeumatico | null {
  return layoutDeTipo(tipo).find((p) => p.code === code)?.eje ?? null
}
