// Cómo se muestra un fletero de GESCOM en pantalla y en los PDFs.
//
// GESCOM no expone patente (ver `patente-chofer.ts`), así que el sync guarda el
// reparto como `GESTION-<codigoChofer>` en `ds_fletero_carga`, mezclado con las
// patentes reales que vienen de Chess. Ese valor es parte de la clave del upsert
// y de la trazabilidad del dato, por lo que NO se toca en la base: se traduce
// acá, al momento de dibujarlo.
//
// Antes cada pantalla resolvía esto por su cuenta (`.replace(/^GESTION-/, ...)`
// copiado en 7 archivos, y el sufijo " (Gestión)" limpiado en solo 2 de 10), así
// que el código crudo se filtraba a la UI en las que se habían olvidado. Todo
// pasa por acá para que no vuelva a desincronizarse.

const PREFIJO_GESCOM = "GESTION-"
/** Reparto sin código, tal como lo escribe el sync cuando falta `codigoChofer`. */
const FLETERO_GESCOM_SIN_CODIGO = "GESTION"

/** Clave que usa el sync en `ds_fletero_carga` para un chofer de GESCOM. */
export function claveFleteroGescom(codigo: string): string {
  return `${PREFIJO_GESCOM}${codigo}`
}

export function esFleteroGescom(ds: string | null | undefined): boolean {
  if (!ds) return false
  return ds.startsWith(PREFIJO_GESCOM) || ds === FLETERO_GESCOM_SIN_CODIGO
}

/** `"GESTION-20014"` → `"20014"`. `null` si no es un fletero de GESCOM. */
export function codigoFleteroGescom(ds: string | null | undefined): string | null {
  if (!ds || !ds.startsWith(PREFIJO_GESCOM)) return null
  return ds.slice(PREFIJO_GESCOM.length) || null
}

/**
 * Nombre de chofer sin el sufijo del sistema de origen: algunos mapeos quedaron
 * grabados como "RIVERO FEDERICO (Gestión)".
 */
export function limpiarNombreChofer<T extends string | null | undefined>(nombre: T): T {
  if (!nombre) return nombre
  return nombre.replace(/\s*\(Gesti[oó]n\)\s*$/i, "").trim() as T
}

interface EtiquetaFleteroOpts {
  /** Patente real del día si se pudo resolver (gana siempre). */
  patente?: string | null
  /** Nombre del chofer si ya se resolvió contra el mapeo. */
  chofer?: string | null
}

/**
 * Cómo se muestra un fletero. Las patentes de Chess salen tal cual; los repartos
 * de GESCOM se muestran, en orden de preferencia: patente real del día → nombre
 * del chofer → `Rep. <codigo>`. Nunca devuelve el `GESTION-` crudo.
 */
export function etiquetaFletero(
  ds: string | null | undefined,
  opts: EtiquetaFleteroOpts = {},
): string {
  const patente = opts.patente?.trim()
  if (patente) return patente
  if (!ds) return ""
  if (!esFleteroGescom(ds)) return ds

  const chofer = limpiarNombreChofer(opts.chofer)?.trim()
  if (chofer) return chofer

  const codigo = codigoFleteroGescom(ds)
  return codigo ? `Rep. ${codigo}` : "Reparto propio"
}

/**
 * Etiqueta para una columna "Chofer": el nombre si se conoce; si no y es un
 * reparto de GESCOM, al menos el reparto en vez del código crudo.
 */
export function etiquetaChofer(
  chofer: string | null | undefined,
  ds?: string | null,
  fallback = "(sin asignar)",
): string {
  const limpio = limpiarNombreChofer(chofer)?.trim()
  if (limpio) return limpio
  if (esFleteroGescom(ds)) {
    const codigo = codigoFleteroGescom(ds)
    return codigo ? `Rep. ${codigo}` : "Reparto propio"
  }
  return fallback
}
