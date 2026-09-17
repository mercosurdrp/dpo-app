/**
 * Estado del sync de NPS/RMD con el Power BI de Quilmes
 * (cron `sync_nps_quincenal.py` en la VPS → tabla `nps_sync_log`).
 */

/**
 * Pasados 8 días sin una corrida OK ya se salteó un lunes: casi siempre es el
 * refresh token de Power BI vencido por MFA, que solo se recupera a mano
 * (`login_pbi_devicecode.py`).
 */
export const DIAS_ALERTA_SYNC = 8

/** Fila de `nps_sync_log`, tal como la devuelve Supabase. */
export interface CorridaSync {
  ejecutado_en: string
  ok: boolean
  detalle: string | null
}

export interface EstadoSync {
  /** Última corrida OK: la fecha de los datos que se ven en pantalla. */
  ultimaOk: string | null
  /** Días enteros desde esa corrida. */
  diasSinSync: number | null
  /**
   * Última corrida fallida, cuando es posterior a la última OK: el sync está
   * roto AHORA. Esto se sabe al día siguiente del lunes, sin esperar los 8
   * días del umbral.
   */
  fallaEn: string | null
  /** Motivo de esa falla, ya recortado para mostrar. */
  fallaMotivo: string | null
  /** Hay algo que avisar: falla vigente, atraso, o ninguna corrida registrada. */
  hayProblema: boolean
}

/** Días enteros transcurridos desde la última corrida OK del sync. */
export function diasSinSync(ultimaCorrida: string | null): number | null {
  if (!ultimaCorrida) return null
  const ms = Date.now() - new Date(ultimaCorrida).getTime()
  return Math.floor(ms / 86_400_000)
}

/**
 * El detalle del error viene del traceback de Python y es larguísimo. Del de
 * Azure lo que importa es el código `AADSTS…` y su frase.
 */
export function motivoCorto(detalle: string | null): string | null {
  if (!detalle) return null
  const aad = detalle.match(/AADSTS\d+:[^.]*\./)
  if (aad) return aad[0].trim()
  return detalle.slice(0, 200).trim()
}

/**
 * Evalúa las últimas corridas (más reciente primero) y dice si hay algo que
 * avisar. Se usa tanto en las pantallas de NPS/RMD como en el cron que manda
 * el mail de alerta, para que los dos midan lo mismo.
 */
export function evaluarSync(corridas: CorridaSync[]): EstadoSync {
  const ordenadas = [...corridas].sort(
    (a, b) =>
      new Date(b.ejecutado_en).getTime() - new Date(a.ejecutado_en).getTime(),
  )
  const ultimaOk = ordenadas.find((c) => c.ok)?.ejecutado_en ?? null
  const dias = diasSinSync(ultimaOk)

  // Falla vigente = la corrida más reciente falló (y por lo tanto es posterior
  // a la última OK, porque están ordenadas).
  const masReciente = ordenadas[0] ?? null
  const falla = masReciente && !masReciente.ok ? masReciente : null

  return {
    ultimaOk,
    diasSinSync: dias,
    fallaEn: falla?.ejecutado_en ?? null,
    fallaMotivo: motivoCorto(falla?.detalle ?? null),
    hayProblema:
      falla != null || ultimaOk == null || (dias != null && dias >= DIAS_ALERTA_SYNC),
  }
}
