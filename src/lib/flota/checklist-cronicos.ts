// Umbrales del análisis de defectos crónicos del checklist (DPO 1.3).
//
// Viven acá y no en `@/actions/checklist-analisis` porque un archivo "use server"
// sólo puede exportar funciones async: una constante exportada rompe el build.

/** Repeticiones del mismo ítem en la misma unidad para llamarlo crónico. */
export const UMBRAL_CRONICO = 3

/**
 * Días sin volver a detectarse para dar el defecto por cortado. Un crónico que
 * se reparó conserva su historial, pero no puede seguir mostrándose como si
 * seguiera vivo.
 */
export const DIAS_CRONICO_ACTIVO = 7
