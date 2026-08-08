/**
 * Cache en memoria del Árbol del Sueño, con single-flight.
 *
 * getSuenoArbol() recalcula TLP, tiempo en PDV, tiempo en ruta y OTIF del año
 * ENTERO contra Supabase (~5-10 s de DB, paginando decenas de miles de filas)
 * y se ejecuta en el inicio y en /mis-capacitaciones — justo donde cae todo el
 * que se loguea. Sin cache, cada vista repetía el cálculo completo y a la
 * mañana, con todos entrando a la vez, la DB se saturaba hasta el 504.
 *
 * El resultado no depende del usuario (son KPIs de la empresa; el rol solo
 * decide si es editable, y eso se resuelve fuera), así que una entrada por año
 * alcanza. El single-flight hace que N requests simultáneas con cache frío
 * disparen UN solo cálculo y las demás esperen esa misma promesa.
 *
 * Vive en memoria del proceso: con Fluid Compute las instancias calientes lo
 * comparten entre requests. Instancia nueva = cache frío, que se llena con la
 * primera vista. Las mutaciones del árbol llaman a invalidarArbolSueno().
 */

const TTL_MS = 10 * 60_000

interface Entrada {
  at: number
  promesa: Promise<unknown>
}

const entradas = new Map<string, Entrada>()

export function arbolSuenoCacheado<T>(
  key: string,
  computar: () => Promise<T>,
  esCacheable: (valor: T) => boolean,
): Promise<T> {
  const hit = entradas.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promesa as Promise<T>

  const promesa = computar()
  entradas.set(key, { at: Date.now(), promesa })

  // No dejar cacheados ni un rechazo ni un resultado de error ({ error }):
  // si no, un fallo transitorio quedaría pegado 10 minutos.
  promesa.then(
    (valor) => {
      if (!esCacheable(valor) && entradas.get(key)?.promesa === promesa) {
        entradas.delete(key)
      }
    },
    () => {
      if (entradas.get(key)?.promesa === promesa) entradas.delete(key)
    },
  )

  return promesa
}

export function invalidarArbolSueno(): void {
  entradas.clear()
}
