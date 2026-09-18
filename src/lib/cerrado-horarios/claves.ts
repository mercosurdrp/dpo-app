/**
 * Las keys del Árbol del Sueño que abren CERRADO por cumplimiento de horario.
 *
 * Archivo aparte y sin "use server": lo importa un client component (el
 * diálogo del árbol) y desde ahí no se puede alcanzar nada que toque la base.
 * Tienen que coincidir con `ARBOL_SUENO` en arbol-config.ts.
 */
export const CERRADO_HORARIO_KPIS = [
  "cerrado_en_horario",
  "cerrado_fuera_horario",
] as const

export type CerradoHorarioKpiKey = (typeof CERRADO_HORARIO_KPIS)[number]

export function esCerradoHorarioKpi(key: string): key is CerradoHorarioKpiKey {
  return (CERRADO_HORARIO_KPIS as readonly string[]).includes(key)
}
