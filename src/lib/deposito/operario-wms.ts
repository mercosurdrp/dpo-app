// Resuelve QUÉ operario del WMS es el usuario logueado del portal.
//
// El WMS no conoce usuarios del portal: sus fuentes de productividad
// (picking, maquinistas) traen un nombre suelto tipo "ALEJO TROLI". El portal
// tiene perfiles con nombre propio, a veces en otro orden y con segundo
// nombre ("TROLI ALEJO JESUS"). Este módulo es el puente.
//
// 🚨 El número que sale de acá se le muestra a la PERSONA sobre sí misma, así
// que ante la duda NO se resuelve: mejor que no vea el bloque a que vea el de
// otro. Por eso el match tiene que ser único — si dos perfiles podrían ser el
// mismo operario, devuelve null.
//
// Clasificación de envases NO pasa por acá: esa fuente guarda directamente el
// id del perfil que cargó el dato (`creado_por`), así que el vínculo es exacto.

/**
 * Nombres del WMS que en realidad son de otra persona. La sesión "PRUEBA1"
 * era la de Hugo Ovejero antes de que tuviera usuario propio: sin esto le
 * faltaría su historia vieja y no tendría forma de darse cuenta.
 */
const ALIAS_WMS: Record<string, string[]> = {
  "HUGO OVEJERO": ["PRUEBA1"],
}

/**
 * Palabras significativas de un nombre, en mayúsculas y sin tildes. Se
 * descartan las de 2 letras o menos (preposiciones tipo "de", "la") porque no
 * identifican a nadie y sólo generan falsos positivos.
 */
export function tokensDeNombre(nombre: string): string[] {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

/**
 * ¿El nombre del WMS está contenido en el del perfil? Se compara por conjunto
 * de palabras, no por orden ni por texto exacto: "ALEJO TROLI" (WMS) entra en
 * "TROLI ALEJO JESUS" (portal), y "OVEJERO HUGO" en "HUGO OVEJERO".
 *
 * La dirección importa: se pide que TODAS las palabras del WMS estén en el
 * perfil, no al revés. El WMS es el que trae el nombre corto.
 */
function nombreWmsEntraEnPerfil(nombreWms: string, nombrePerfil: string): boolean {
  const wms = tokensDeNombre(nombreWms)
  if (wms.length < 2) return false // un apellido solo no alcanza para identificar
  const perfil = new Set(tokensDeNombre(nombrePerfil))
  return wms.every((t) => perfil.has(t))
}

/**
 * Devuelve el nombre del WMS que le corresponde al perfil, o null si no hay
 * uno solo claro. `operariosWms` son los nombres tal cual vienen de la fuente.
 */
export function resolverOperarioWms(
  nombrePerfil: string,
  operariosWms: Iterable<string>,
): string | null {
  const candidatos: string[] = []
  for (const op of operariosWms) {
    const limpio = String(op || "").trim()
    if (!limpio) continue
    if (nombreWmsEntraEnPerfil(limpio, nombrePerfil)) candidatos.push(limpio)
  }
  // Sin candidatos, o más de uno (dos personas que comparten nombre y apellido):
  // no se arriesga.
  const unicos = Array.from(new Set(candidatos))
  return unicos.length === 1 ? unicos[0] : null
}

/**
 * Todos los nombres del WMS que hay que sumar para esa persona: el suyo más
 * los alias históricos.
 */
export function nombresWmsDe(operario: string): string[] {
  return [operario, ...(ALIAS_WMS[operario] ?? [])]
}

/** ¿Esta fila del WMS es de esta persona (contemplando alias)? */
export function esDelOperario(filaOperario: string, operario: string): boolean {
  const objetivo = nombresWmsDe(operario).map((n) => n.trim().toUpperCase())
  return objetivo.includes(String(filaOperario || "").trim().toUpperCase())
}
