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
