/**
 * Los dos tipos de carga que conviven en `registro_combustible`.
 *
 * 🚨 La urea (AdBlue) NO es combustible y NO puede sumarse al gasoil: comparte
 * la tabla porque los datos que se toman son los mismos —unidad, chofer,
 * odómetro y litros— pero mezclarla infla los litros del mes, hunde el km/l y
 * descoloca el CO2, el costo y el presupuesto. **Toda consulta que sume litros,
 * calcule rendimiento o proyecte costo tiene que filtrar por tipo.**
 *
 * La excepción son las lecturas de ODÓMETRO (`lib/vehiculos/lecturas.ts`,
 * `odometro-lecturas.ts` al listar): ahí la fila de urea vale igual que la de
 * gasoil, porque el kilometraje que anotó el chofer es real venga de donde
 * venga. Filtrarla ahí sería perder lecturas buenas.
 *
 * Hoy las filas históricas son todas `gasoil` (es el default de la columna
 * desde que existe), así que agregar el filtro no mueve ningún número: deja el
 * cálculo blindado para cuando entren las cargas de urea.
 */

export const TIPO_CARGA_GASOIL = "gasoil"
export const TIPO_CARGA_UREA = "urea"

/** Litros de urea de una carga: el tanque más grande de la flota ronda los 80 l. */
export const UREA_LITROS_MAX = 100

export function validarLitrosUrea(litros: number): string | null {
  if (!Number.isFinite(litros) || litros <= 0) {
    return "Los litros de urea tienen que ser mayores a cero."
  }
  if (litros > UREA_LITROS_MAX) {
    return `${litros} litros es demasiado para una carga de urea (máximo ${UREA_LITROS_MAX}). Revisá el número.`
  }
  return null
}
