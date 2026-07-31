/**
 * Dónde se guarda el equipo que descargó un camión de acarreo.
 *
 * 🚨 NO hay columna `maquinistas` en `recepcion_acarreos` (la base es la de
 * acarreo-rdf) y no se puede crear desde la VM: de esa Supabase sólo tenemos
 * la SERVICE_ROLE_KEY, que escribe FILAS pero no ejecuta DDL. Antes que dejar
 * un SQL para pegar a mano, el equipo viaja DENTRO de `notas`, que ya existe,
 * es texto libre y no la muestra ninguna pantalla:
 *
 *   "Carga manual retroactiva [[maq:107@dpo.local,173@dpo.local]]"
 *    └─ nota del operador ──┘ └─ marcador, invisible en la UI ─────┘
 *
 * 🚨 DUPLICADO en acarreo-rdf (`src/lib/acarreo.ts`, bloque "Dónde se guarda
 * el equipo"): son dos repos sin paquete compartido y las dos apps escriben
 * en la MISMA tabla, así que el formato tiene que cambiarse en las dos a la
 * vez. Lo mismo que ya pasa con MAQUINISTAS_DESCARGA
 * ([[src/lib/acarreo-operadores.ts]]).
 */

/** Marcador al final de la nota. El `\s*` se come el espacio que lo separa. */
const MARCA_EQUIPO = /\s*\[\[maq:([^\]]*)\]\]\s*$/

/** Emails del equipo escondidos en la nota. Null si la nota no trae marcador. */
export function equipoDeNotas(notas: string | null): string[] | null {
  const m = notas?.match(MARCA_EQUIPO)
  if (!m) return null
  const emails = m[1]
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
  return emails.length > 0 ? emails : null
}

/** La nota como la escribió el operador, sin el marcador. */
export function notasSinEquipo(notas: string | null): string | null {
  if (!notas) return null
  const limpio = notas.replace(MARCA_EQUIPO, "").trim()
  return limpio.length > 0 ? limpio : null
}

/**
 * Vuelve a pegar nota + equipo para guardar. `notas` puede venir con marcador
 * viejo (se reemplaza) o sin él. Equipo vacío ⇒ queda sólo la nota.
 */
export function notasConEquipo(
  notas: string | null,
  equipo: string[] | null,
): string | null {
  const texto = notasSinEquipo(notas)
  const emails = (equipo ?? []).map((e) => e.trim()).filter(Boolean)
  if (emails.length === 0) return texto
  const marca = `[[maq:${emails.join(",")}]]`
  return texto ? `${texto} ${marca}` : marca
}
