/**
 * URL pública donde el chofer se anuncia al llegar (app `acarreo-rdf`, proyecto
 * distinto de dpo-app). Es la única pantalla del circuito que NO pide login:
 * el camionero la abre escaneando el QR del cartel de portería.
 *
 * OJO: no apuntar el QR a `/recepcion` de dpo-app — esa es la pantalla del
 * operador y está detrás de `requireAuth()` + `puedeOperarAcarreo()`.
 */
export const ACARREO_ANUNCIO_URL =
  process.env.NEXT_PUBLIC_ACARREO_ANUNCIO_URL ?? "https://acarreo-rdf.vercel.app/anuncio"
