/**
 * Dónde se guarda la carga de envases vacíos de un camión de acarreo.
 *
 * Hay tres operaciones: sólo descarga, descarga + carga de vacíos, y sólo
 * carga de vacíos (el camión que viene a buscar envases para volver a
 * fábrica). El tiempo de los vacíos quedaba escondido dentro de
 * «fin de descarga → salida», o directamente sin medir.
 *
 * 🚨 NO hay columna `operacion` ni horas de vacíos en `recepcion_acarreos`
 * (la base es la de acarreo-rdf y desde la VM no hay DDL). Igual que el
 * equipo de maquinistas ([[src/lib/acarreo-equipo.ts]]), la operación y sus
 * dos horas viajan DENTRO de `notas`:
 *
 *   "nota del operador [[maq:107@dpo.local]] [[vac:descarga_vacios|<inicio ISO>|<fin ISO>]]"
 *
 * Un camión SIN marcador es «sólo descarga» (el caso histórico): sólo se
 * escribe cuando lleva vacíos.
 *
 * 🚨 DUPLICADO en acarreo-rdf (`src/lib/acarreo.ts`, bloque "Dónde se guarda
 * la carga de vacíos"): las dos apps escriben en la MISMA tabla y el ATCT de
 * acarreo-rdf lee este marcador, así que el formato tiene que ser el mismo en
 * las dos. dpo-app lo lee en `esSoloVaciosRecepcion` (SLA #7).
 */

export type OperacionAcarreo = "descarga" | "descarga_vacios" | "solo_vacios"

export const OPERACIONES_ACARREO: { valor: OperacionAcarreo; label: string; detalle: string }[] = [
  { valor: "descarga", label: "Sólo descarga", detalle: "Baja producto y se va" },
  { valor: "descarga_vacios", label: "Descarga y carga vacíos", detalle: "Baja producto y se lleva envases vacíos" },
  { valor: "solo_vacios", label: "Sólo carga vacíos", detalle: "No baja nada: viene a buscar envases vacíos" },
]

export function esOperacionAcarreo(v: unknown): v is OperacionAcarreo {
  return OPERACIONES_ACARREO.some((o) => o.valor === v)
}

export function llevaVacios(op: OperacionAcarreo | null | undefined): boolean {
  return op === "descarga_vacios" || op === "solo_vacios"
}

export function etiquetaOperacion(op: OperacionAcarreo | null | undefined): string {
  return OPERACIONES_ACARREO.find((o) => o.valor === op)?.label ?? "Sólo descarga"
}

export interface VaciosRecepcion {
  operacion: OperacionAcarreo
  /** ISO. Null mientras no empezó la carga de vacíos. */
  inicio: string | null
  /** ISO. Null mientras no terminó. */
  fin: string | null
}

/** Marcador en cualquier parte de la nota (puede ir antes o después del de equipo). */
const MARCA_VACIOS = /\s*\[\[vac:([^\]|]*)\|([^\]|]*)\|([^\]|]*)\]\]/

/** Operación y horas escondidas en la nota. Null ⇒ sólo descarga (sin marcador). */
export function vaciosDeNotas(notas: string | null | undefined): VaciosRecepcion | null {
  const m = notas?.match(MARCA_VACIOS)
  if (!m) return null
  const op = m[1].trim()
  if (!esOperacionAcarreo(op)) return null
  return {
    operacion: op,
    inicio: m[2].trim() || null,
    fin: m[3].trim() || null,
  }
}

/** La nota sin el marcador de vacíos (conserva el de equipo si lo hay). */
export function notasSinVacios(notas: string | null): string | null {
  if (!notas) return null
  const limpio = notas.replace(MARCA_VACIOS, "").trim()
  return limpio.length > 0 ? limpio : null
}

/**
 * Vuelve a pegar nota + marcador para guardar. Reemplaza el marcador viejo si
 * lo hay. `vacios` null ⇒ queda la nota sin marcador (sólo descarga).
 */
export function notasConVacios(
  notas: string | null,
  vacios: VaciosRecepcion | null,
): string | null {
  const texto = notasSinVacios(notas)
  if (!vacios) return texto
  const marca = `[[vac:${vacios.operacion}|${vacios.inicio ?? ""}|${vacios.fin ?? ""}]]`
  return texto ? `${texto} ${marca}` : marca
}
