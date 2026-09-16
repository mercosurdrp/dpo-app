import { TOLERANCIA_SUBIDA_MM } from "@/lib/flota/neumaticos-control"

/**
 * Una medición de profundidad no puede ser más alta que la anterior de la misma
 * cubierta: la goma no crece.
 *
 * Por qué es una regla y no un aviso: el desgaste por km corta el tramo de vida
 * ante cualquier salto hacia arriba (si no, daría desgaste negativo), así que
 * una sola medición mal tipeada deja a esa cubierta sin tasa hasta la ronda
 * siguiente. El 27/07/2026 entró una ronda entera leída bajo y 22 cubiertas
 * quedaron con desgaste imposible; hubo que descartar la ronda a mano y la
 * flota perdió su línea de base. Esto es para que no vuelva a pasar.
 *
 * La función es pura —recibe lo que ya se leyó de la base— para que la misma
 * regla valga en la carga de la ronda del operador y en la corrección puntual
 * del módulo de mantenimiento, que usan clientes de Supabase distintos.
 */

export interface EntradaProfundidad {
  neumatico_id: string
  profundidad_mm: number
  /** Fecha de la medición que se está cargando (ISO, YYYY-MM-DD). */
  fecha: string
}

export interface MedicionPrevia {
  neumatico_id: string
  fecha: string
  profundidad_mm: number
}

/** Montaje de una cubierta: corta la comparación hacia atrás. */
export interface MontajePrevio {
  neumatico_id: string
  fecha: string
}

export interface FichaCubierta {
  id: string
  numero: string | null
  posicion: string | null
}

const ddmmaaaa = (iso: string) => iso.split("-").reverse().join("/")

/**
 * Devuelve el mensaje de error de la primera medición que sube, o null si
 * pasan todas.
 *
 * La referencia de cada cubierta es su medición más reciente ANTERIOR a la
 * fecha que se carga (así una corrección del mismo día no se compara contra sí
 * misma) y posterior a su último montaje: una cubierta que vuelve del
 * recapador sí tiene más dibujo que cuando salió, y eso es legítimo.
 */
export function errorProfundidadQueSube(datos: {
  entradas: EntradaProfundidad[]
  mediciones: MedicionPrevia[]
  montajes: MontajePrevio[]
  fichas: FichaCubierta[]
}): string | null {
  const { entradas, mediciones, montajes, fichas } = datos
  if (entradas.length === 0) return null

  const ultimoMontaje = new Map<string, string>()
  for (const m of montajes) {
    const prev = ultimoMontaje.get(m.neumatico_id)
    if (!prev || m.fecha > prev) ultimoMontaje.set(m.neumatico_id, m.fecha)
  }
  const ficha = new Map(fichas.map((c) => [c.id, c]))

  for (const e of entradas) {
    const desde = ultimoMontaje.get(e.neumatico_id)
    let ref: MedicionPrevia | null = null
    for (const m of mediciones) {
      if (m.neumatico_id !== e.neumatico_id) continue
      if (m.fecha >= e.fecha) continue
      if (desde && m.fecha < desde) continue
      if (!ref || m.fecha > ref.fecha) ref = m
    }
    if (!ref) continue
    if (e.profundidad_mm <= ref.profundidad_mm + TOLERANCIA_SUBIDA_MM) continue

    const c = ficha.get(e.neumatico_id)
    const quien = c
      ? `${c.posicion ?? "esa cubierta"}${c.numero ? ` (N° ${c.numero})` : ""}`
      : "esa cubierta"
    return (
      `La ${quien} marcaba ${ref.profundidad_mm} mm el ${ddmmaaaa(ref.fecha)} y estás ` +
      `cargando ${e.profundidad_mm} mm: la goma no puede tener más dibujo que antes. ` +
      `Revisá el número — suele ser un dígito de más o la rueda equivocada. Si la ` +
      `cubierta volvió del recapador, cargá primero el recapado y después la medición.`
    )
  }
  return null
}
