/**
 * Qué respuesta NO OK del checklist es un FOCO de mantenimiento y qué no.
 *
 * El checklist pregunta cosas de dos naturalezas distintas. "Luces de freno",
 * "pérdida de fluidos" o "matafuegos" son defectos: hay que repararlos, llevan
 * plan de acción y tienen un tiempo de respuesta que se mide. **"¿Nivel de
 * combustible superior a 1/4 tanque?" no es un defecto**: es un aviso operativo
 * que se resuelve cargando combustible en el día, y el que lo resuelve es el
 * propio chofer o el playero, no el taller.
 *
 * Mezclados, el ítem de combustible ensuciaba el módulo de focos: el HELI1
 * aportó 4 "focos" por tanque bajo —tres de ellos sin plan cargado, porque nadie
 * abre un plan de acción para ir a cargar gasoil— y figuraban "abiertos hace 64
 * días" en la lista de defectos sin resolver. Contaban en los ítems no OK, en el
 * denominador de "con plan de acción" y en el tiempo de respuesta.
 *
 * La pregunta se sigue haciendo y la respuesta se sigue guardando: queda en el
 * checklist del día y en el detalle de la unidad, que es donde se ve si una
 * unidad sale seguido con el tanque en reserva. Lo que no hace es pedir un plan
 * de acción de mantenimiento.
 *
 * Decidido con el Gestor de Flota el 06/10/2026.
 */

/** Ítems que NO son defectos de mantenimiento, por más que den NO OK. */
const ITEMS_OPERATIVOS = [/combustible/i]

export function esFocoDeMantenimiento(nombreItem: string | null | undefined): boolean {
  const n = (nombreItem ?? "").trim()
  if (!n) return true
  return !ITEMS_OPERATIVOS.some((re) => re.test(n))
}
