/**
 * Estado del sync de NPS/RMD con el Power BI de Quilmes
 * (cron `sync_nps_quincenal.py`, lunes 05:00 → tabla `nps_sync_log`).
 */

/**
 * Pasados 8 días sin una corrida OK ya se salteó un lunes: casi siempre es el
 * refresh token de Power BI vencido por MFA, que solo se recupera a mano
 * (`login_pbi_devicecode.py`).
 */
export const DIAS_ALERTA_SYNC = 8

/** Días enteros transcurridos desde la última corrida OK del sync. */
export function diasSinSync(ultimaCorrida: string | null): number | null {
  if (!ultimaCorrida) return null
  const ms = Date.now() - new Date(ultimaCorrida).getTime()
  return Math.floor(ms / 86_400_000)
}
