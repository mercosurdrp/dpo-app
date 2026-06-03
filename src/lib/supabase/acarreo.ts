import { createClient } from "@supabase/supabase-js"

/**
 * Cliente de SOLO LECTURA hacia la Supabase de la app `acarreo-rdf`, que es un
 * proyecto distinto del de dpo-app (Pampeana). acarreo-rdf escribe la tabla
 * `recepcion_acarreos`; dpo-app la lee desde acá para el reporte y el SLA #7.
 *
 * Usa el service-role de ese proyecto (solo en servidor, nunca expuesto). La
 * autorización del usuario de dpo-app ya se valida antes con requireRole.
 * Devuelve null si las env no están configuradas, para degradar con gracia.
 */
export function createAcarreoClient() {
  const url = process.env.ACARREO_SUPABASE_URL
  const key = process.env.ACARREO_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
