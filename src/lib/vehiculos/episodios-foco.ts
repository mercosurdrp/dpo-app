/**
 * Episodios de un foco del checklist.
 *
 * Un desperfecto que tarda en resolverse lo vuelve a marcar el chofer en CADA
 * checklist: los frenos del HELI1 entraron el 28, el 29 y el 30 de octubre, y
 * cada reporte pedía su propio plan de acción, su propia OT y su propio tiempo
 * de respuesta. Son tres marcas del MISMO problema, no tres problemas.
 *
 * Un **episodio** es la vida de ese problema: arranca en el primer reporte y
 * termina cuando hay prueba de que el defecto se fue. Todo reporte que caiga
 * mientras el episodio sigue abierto es una repetición: no abre nada nuevo,
 * hereda la gestión en curso y no vuelve a contar el tiempo de respuesta. Un
 * reporte posterior al cierre sí abre un episodio nuevo: ahí el defecto
 * reapareció después de haberse arreglado, y eso es información, no ruido.
 *
 * ## Qué cuenta como prueba de que el defecto se fue
 *
 * **El plan cerrado por mantenimiento cierra el episodio, sin vueltas.** Es una
 * declaración de que se reparó.
 *
 * **La vuelta a OK del ítem cierra sólo si se sostiene.** El HELI1 carga DOS
 * checklists por día: el de las 10:30 marcó los frenos OK y el de las 12:20 los
 * volvió a marcar mal, los tres días. Tomando esa única lectura OK como cierre,
 * un defecto que sigue ahí se partía en tres focos de un reporte cada uno —cada
 * uno con su tiempo y pidiendo su plan—. Se exige entonces que el ítem se
 * mantenga OK al menos `GRACIA_OK_HORAS`: si el mismo defecto se reporta otra
 * vez dentro de esa ventana, el OK no probó nada y el episodio sigue siendo el
 * mismo.
 *
 * 🚨 El criterio anterior agrupaba por "mismo momento de cierre", y por eso una
 * serie abierta con planes en distinto estado se partía en varios focos. Acá el
 * corte lo da el cierre del episodio, no el estado de cada fila.
 */

/**
 * Cuánto tiene que durar una vuelta a OK para creerle.
 *
 * Dos días: cubre el caso de las dos cargas por día de la misma unidad y el del
 * checklist del día siguiente, sin llegar a pegar entre sí dos apariciones
 * realmente separadas del mismo defecto.
 */
export const GRACIA_OK_HORAS = 48

/** Lo mínimo que hace falta de cada marca del checklist para armar episodios. */
export interface ReporteFoco {
  id: string
  dominio: string
  /** Ítem del checklist: identifica el defecto a lo largo del tiempo. */
  itemId: string
  /** Timestamp de carga del checklist. */
  hora: string | null
  fecha: string
  /**
   * Prueba de que el defecto se fue: cierre del plan de acción o vuelta a OK
   * del ítem. null = sigue abierto.
   */
  cierre: string | null
  /**
   * true = lo cerró mantenimiento (plan resuelto): vale sin condiciones.
   * false = es una vuelta a OK del chofer: vale si se sostiene.
   */
  cierreFirme: boolean
}

export interface Episodio {
  /** Id del PRIMER reporte. Identifica el episodio en toda la pantalla. */
  id: string
  dominio: string
  itemId: string
  primeraFecha: string
  primeraHora: string | null
  /** Cierre del episodio. null = sigue abierto. */
  cierre: string | null
  /** Si ese cierre es un plan cerrado (true) o una vuelta a OK (false). */
  cierreFirme: boolean
  /** Ids de sus reportes, del más viejo al más nuevo. */
  reportes: string[]
}

/** ms del timestamp; los reportes sin hora se ordenan por la fecha del checklist. */
function ms(hora: string | null, fecha: string): number {
  const t = hora ? new Date(hora).getTime() : NaN
  if (Number.isFinite(t)) return t
  const f = new Date(`${fecha.slice(0, 10)}T12:00:00Z`).getTime()
  return Number.isFinite(f) ? f : 0
}

/**
 * Arma los episodios de un conjunto de reportes. Un episodio por problema, con
 * sus reportes adentro.
 */
export function agruparEpisodios(reportes: ReporteFoco[]): Episodio[] {
  const porDefecto = new Map<string, ReporteFoco[]>()
  for (const r of reportes) {
    const k = `${r.dominio}|${r.itemId}`
    const arr = porDefecto.get(k)
    if (arr) arr.push(r)
    else porDefecto.set(k, [r])
  }

  const gracia = GRACIA_OK_HORAS * 3_600_000
  const out: Episodio[] = []
  for (const [, arr] of porDefecto) {
    const orden = [...arr].sort((a, b) => ms(a.hora, a.fecha) - ms(b.hora, b.fecha))
    let actual: Episodio | null = null
    let cierreMs = Infinity
    for (const r of orden) {
      const t = ms(r.hora, r.fecha)
      if (actual && t > cierreMs) {
        if (actual.cierreFirme || t - cierreMs > gracia) {
          // El defecto volvió después de haberse ido: episodio nuevo.
          actual = null
        } else {
          // Reportado de vuelta enseguida: ese OK no probó nada. Se descarta el
          // cierre y el episodio sigue abierto desde el primer reporte.
          actual.cierre = null
          actual.cierreFirme = false
          cierreMs = Infinity
        }
      }
      if (!actual) {
        actual = {
          id: r.id,
          dominio: r.dominio,
          itemId: r.itemId,
          primeraFecha: r.fecha,
          primeraHora: r.hora,
          cierre: null,
          cierreFirme: false,
          reportes: [],
        }
        cierreMs = Infinity
        out.push(actual)
      }
      actual.reportes.push(r.id)
      // El cierre del episodio es la PRIMERA prueba de que el defecto se fue,
      // venga del plan de la fila que sea.
      if (r.cierre) {
        const c = new Date(r.cierre).getTime()
        if (Number.isFinite(c) && c < cierreMs) {
          cierreMs = c
          actual.cierre = r.cierre
          actual.cierreFirme = r.cierreFirme
        }
      }
    }
  }
  return out
}

/** Por reporte: a qué episodio pertenece, y el cierre y el arranque de ese episodio. */
export interface MarcaEpisodio {
  episodioId: string
  /** Fecha del primer reporte si esta fila es una repetición; null si es la primera. */
  repeticionDe: string | null
  primeraFecha: string
  primeraHora: string | null
  /** Cierre del episodio; null = el defecto sigue vivo. */
  cierre: string | null
  /** true = lo cerró un plan de mantenimiento; false = vuelta a OK del chofer. */
  cierreFirme: boolean
  /** Cuántas veces se reportó el mismo problema. */
  reportes: number
}

export function marcarEpisodios(reportes: ReporteFoco[]): Map<string, MarcaEpisodio> {
  const out = new Map<string, MarcaEpisodio>()
  for (const ep of agruparEpisodios(reportes)) {
    for (const id of ep.reportes) {
      out.set(id, {
        episodioId: ep.id,
        repeticionDe: id === ep.id ? null : ep.primeraFecha,
        primeraFecha: ep.primeraFecha,
        primeraHora: ep.primeraHora,
        cierre: ep.cierre,
        cierreFirme: ep.cierreFirme,
        reportes: ep.reportes.length,
      })
    }
  }
  return out
}
