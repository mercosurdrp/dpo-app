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
//
// "AUX" = rueda de auxilio: viaja EN la unidad pero no apoya, así que no rota
// ni se le calcula desgaste por km. Antes no existía y las de auxilio había que
// dejarlas en stock, donde figuraban disponibles para cualquier otra unidad.

/** Código de la posición de auxilio (una por unidad). */
export const POSICION_AUXILIO = "AUX"

const AUXILIO: PosicionNeumatico = {
  code: POSICION_AUXILIO,
  label: "AUX",
  x: 50,
  y: 47,
  eje: null,
}

const CAMION: PosicionNeumatico[] = [
  // Eje 1 — direccional (delantero)
  { code: "1I", label: "1I", x: 20, y: 14, eje: "direccional" },
  { code: "1D", label: "1D", x: 80, y: 14, eje: "direccional" },
  // Eje 2 — tracción (trasero, rueda dual)
  { code: "2IE", label: "2IE", x: 7, y: 80, eje: "traccion" },
  { code: "2II", label: "2II", x: 27, y: 80, eje: "traccion" },
  { code: "2DI", label: "2DI", x: 73, y: 80, eje: "traccion" },
  { code: "2DE", label: "2DE", x: 93, y: 80, eje: "traccion" },
  AUXILIO,
]

const CAMIONETA: PosicionNeumatico[] = [
  { code: "1I", label: "1I", x: 22, y: 16, eje: "direccional" },
  { code: "1D", label: "1D", x: 78, y: 16, eje: "direccional" },
  { code: "2I", label: "2I", x: 22, y: 80, eje: "traccion" },
  { code: "2D", label: "2D", x: 78, y: 80, eje: "traccion" },
  AUXILIO,
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
  { ...AUXILIO, y: 18 },
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

/** Nº de eje de una posición: "2IE" → 2, "AUX" → null. */
export function ejeNumero(code: string): number | null {
  const n = Number(code[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Filas (ejes) del layout, de adelante hacia atrás. */
export function filasDelLayout(layout: PosicionNeumatico[]) {
  return [...new Set(layout.map((p) => p.y))]
    .sort((a, b) => a - b)
    .map((y) => {
      const enFila = layout.filter((p) => p.y === y).sort((a, b) => a.x - b.x)
      return {
        y,
        posiciones: enFila,
        eje: enFila[0]?.eje ?? null,
        numero: ejeNumero(enFila[0]?.code ?? ""),
        x1: Math.min(...enFila.map((p) => p.x)),
        x2: Math.max(...enFila.map((p) => p.x)),
      }
    })
}

export interface PosicionEnPalabras {
  /** "Izquierda" / "Derecha", o null en la de auxilio. */
  lado: "Izquierda" | "Derecha" | null
  /** "Eje delantero", "Eje trasero", "2º eje"… */
  eje: string | null
  /** "rueda de afuera" / "rueda de adentro" en los ejes de rueda dual. */
  rueda: string | null
  /** Todo junto, para mostrar debajo del código: "Eje trasero · derecha · rueda de afuera". */
  texto: string
}

const ORDINAL_EJE = ["1º", "2º", "3º", "4º"]

/**
 * La posición dicha en palabras.
 *
 * 🚨 Los códigos ("1I", "2DE") los entiende quien armó la convención, no el que
 * está parado al lado de la rueda: los choferes cargan la medición mensual y
 * montan cubiertas sin saber cuál es la izquierda y cuál la derecha, y una
 * medición cargada en la rueda equivocada arruina el desgaste de las dos gomas.
 * Izquierda y derecha son SIEMPRE mirando hacia adelante, sentado en la cabina
 * — el mismo criterio con el que está armado el diagrama (frente arriba).
 */
export function posicionEnPalabras(
  tipo: VehiculoTipo | null,
  code: string | null
): PosicionEnPalabras {
  const vacio: PosicionEnPalabras = { lado: null, eje: null, rueda: null, texto: "" }
  if (!code) return vacio
  if (code === POSICION_AUXILIO) return { ...vacio, texto: "Rueda de auxilio" }

  const layout = layoutDeTipo(tipo)
  const nro = ejeNumero(code)
  const ejes = [
    ...new Set(
      layout
        .filter((p) => p.code !== POSICION_AUXILIO)
        .map((p) => ejeNumero(p.code))
        .filter((n): n is number => n != null)
    ),
  ].sort((a, b) => a - b)

  let eje: string | null = null
  if (nro != null) {
    if (ejes.length <= 2) {
      eje = nro === ejes[0] ? "Eje delantero" : "Eje trasero"
    } else {
      eje = `${ORDINAL_EJE[ejes.indexOf(nro)] ?? `${nro}º`} eje`
    }
  }

  const lado = code[1] === "I" ? "Izquierda" : code[1] === "D" ? "Derecha" : null
  const rueda =
    code[2] === "E" ? "rueda de afuera" : code[2] === "I" ? "rueda de adentro" : null

  const partes = [eje, lado?.toLowerCase(), rueda].filter(Boolean)
  return { lado, eje, rueda, texto: partes.join(" · ") }
}
