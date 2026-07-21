/**
 * Detección de tareas del plan a partir del TEXTO de una Orden de Trabajo.
 *
 * El taller no tilda checkboxes: escribe lo que hizo ("se cambió la bomba de
 * agua", "servis completo"). Esta lógica lee las tareas libres y las
 * observaciones de la OT y, si encuentra las palabras clave de una tarea del
 * plan, la da por realizada al km/horas de esa OT — que es lo que hace arrancar
 * el contador del próximo vencimiento.
 *
 * Es el mismo criterio que ya usaba el puente OT → Neumáticos, generalizado a
 * cualquier tarea del plan y con las palabras configurables por tarea.
 */

export interface TareaDetectable {
  id: string
  tipo_vehiculo: string
  activo: boolean
  /** Términos en minúsculas y sin acentos. Vacío = la tarea no se autodetecta. */
  palabras_clave: string[]
}

/** minúsculas + sin acentos, para comparar sin depender de cómo se escribió. */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/**
 * Frases que niegan lo que viene después. Sin esto, "no se cambió la correa"
 * registraría la correa como hecha, que es peor que no detectar nada: dejaría
 * el contador corriendo sobre un trabajo que nunca se hizo.
 */
const NEGACIONES = [
  "no se cambio",
  "no se cambiaron",
  "no se hizo",
  "no se realizo",
  "no cambio",
  "sin cambiar",
  "falta cambiar",
  "falta hacer",
  "hay que cambiar",
  "hay que hacer",
  "revisar proximo",
  "para el proximo",
  "queda pendiente",
  "pendiente de",
  "proximo service",
]

/**
 * Corta el texto en los tramos que NO están negados.
 *
 * Trabaja por frases (corta en `.`, `,`, `;` y saltos de línea): si una frase
 * arranca con una negación, se descarta entera. Es deliberadamente conservador
 * — ante la duda prefiere no detectar, porque un falso positivo mete un
 * mantenimiento que no ocurrió.
 */
function tramosAfirmativos(texto: string): string[] {
  return texto
    .split(/[.,;\n]+/)
    .map((f) => f.trim())
    .filter((f) => f && !NEGACIONES.some((n) => f.includes(n)))
}

/**
 * Devuelve los IDs de las tareas del plan mencionadas en el texto de la OT.
 *
 * @param textos      tareas libres + observaciones de la OT (sin normalizar)
 * @param tareas      tareas del plan (se filtran por activo y tipo de unidad)
 * @param tipoUnidad  tipo del vehículo de la OT
 */
export function detectarTareas(
  textos: Array<string | null | undefined>,
  tareas: TareaDetectable[],
  tipoUnidad: string
): string[] {
  const tramos = textos
    .filter((t): t is string => !!t && t.trim() !== "")
    .flatMap((t) => tramosAfirmativos(normalizarTexto(t)))
  if (tramos.length === 0) return []

  const detectadas: string[] = []
  for (const t of tareas) {
    if (!t.activo) continue
    if (t.tipo_vehiculo !== tipoUnidad) continue
    if (t.palabras_clave.length === 0) continue
    const encontrada = t.palabras_clave.some((p) => {
      const palabra = p.trim()
      return palabra !== "" && tramos.some((tramo) => tramo.includes(palabra))
    })
    if (encontrada) detectadas.push(t.id)
  }
  return detectadas
}
