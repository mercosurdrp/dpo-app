/**
 * Identidad de la empresa para el deploy actual.
 * Se parametriza vía env var NEXT_PUBLIC_EMPRESA_NOMBRE para permitir
 * replicar la app a otras empresas (ej: Mercosur Distribuciones) manteniendo
 * un solo codebase.
 */

export const EMPRESA_NOMBRE =
  process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "Mercosur Región Pampeana"

export const EMPRESA_NOMBRE_CORTO =
  process.env.NEXT_PUBLIC_EMPRESA_NOMBRE_CORTO ?? "Mercosur"

export const IS_MISIONES = EMPRESA_NOMBRE === "Mercosur Distribuciones"

/**
 * Razón social tal como la nombra la planilla de la Encuesta de Clima. El
 * export de la consultora trae las dos empresas del grupo en las mismas hojas,
 * con cada columna prefijada por este texto: es la llave para importar solo lo
 * propio.
 */
export const EMPRESA_RAZON_SOCIAL_CLIMA = IS_MISIONES
  ? "Mercosur Distribuciones Srl."
  : "Mercosur Pampeano"
