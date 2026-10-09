/**
 * Unidades dadas de baja y los papeles que quedaron a su nombre.
 *
 * En `requisitos_legales` la unidad no es una FK: es el `nombre` del requisito,
 * tipeado a mano ("AE TOYOTA 3" por TOYOTA3). Cuando una unidad se vende o se
 * transfiere a otra sucursal, el catálogo la marca `active = false` con el
 * motivo en la descripción, pero sus VTV, seguros y extintores siguen en el
 * control documentario y seguían avisando que vencían —alertas de papeles de
 * una unidad que ya no está en el CD—.
 *
 * Acá se resuelve el nombre tipeado contra el catálogo para poder sacarlas de
 * las alertas SIN borrar el registro: el papel sigue cargado (es historia y es
 * evidencia), sólo deja de pedir renovación.
 */

export interface UnidadCatalogo {
  dominio: string
  active: boolean
  descripcion?: string | null
}

/** Clave de comparación: sin espacios y en mayúsculas. */
export function normalizarDominio(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toUpperCase()
}

/**
 * La unidad del catálogo a la que pertenece un requisito, o null si el nombre
 * no corresponde a ninguna unidad del parque (o si es ambiguo: ante la duda no
 * se decide, porque el costo de equivocarse es ocultar un vencimiento real).
 */
export function resolverUnidad(
  catalogo: UnidadCatalogo[],
  nombre: string | null | undefined
): UnidadCatalogo | null {
  const clave = normalizarDominio(nombre)
  if (!clave) return null

  const exacta = catalogo.find((c) => normalizarDominio(c.dominio) === clave)
  if (exacta) return exacta

  // "AE TOYOTA 3" → TOYOTA3. Los dominios son largos y no se contienen entre
  // sí; si aun así hay más de uno, se devuelve null.
  const contenidas = catalogo.filter((c) => {
    const d = normalizarDominio(c.dominio)
    return d.length >= 4 && clave.includes(d)
  })
  return contenidas.length === 1 ? contenidas[0] : null
}

/**
 * Motivo de la baja si el requisito es de una unidad que ya no está en el
 * parque; null si la unidad sigue activa o si el nombre no es una unidad.
 */
export function bajaDeUnidad(
  catalogo: UnidadCatalogo[],
  nombre: string | null | undefined
): string | null {
  const u = resolverUnidad(catalogo, nombre)
  if (!u || u.active) return null
  return u.descripcion?.trim() || `${u.dominio} — dada de baja del parque`
}
