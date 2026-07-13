// El tanque más grande de la flota ronda los 300 l, así que 500 deja margen de
// sobra. El tope existe para atajar el tipeo con separador de miles: "134.938"
// entró una vez como 134.938 litros en vez de 134,94 y por sí solo llevó la
// huella de CO₂ del mes de 18 t a 367 t.
export const LITROS_MAX = 500

/** Devuelve el mensaje de error, o null si los litros son plausibles. */
export function validarLitros(litros: number): string | null {
  if (!Number.isFinite(litros) || litros <= 0) {
    return "Los litros cargados tienen que ser mayores a 0"
  }
  if (litros > LITROS_MAX) {
    return `${litros} litros no es una carga posible (el máximo es ${LITROS_MAX} l). Si querés cargar decimales, usá la coma: 134,94.`
  }
  return null
}
