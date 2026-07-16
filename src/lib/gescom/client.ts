/**
 * Cliente de la API GESCOM (sistema "Gestión", paralelo a Chess) — operación Pampeana.
 * Auth: OAuth2 Keycloak (password grant) → Bearer token.
 * Datos: endpoint de ventas paginado. Ver scripts/gescom/API-VENTASGESTION.py (fuente original).
 *
 * Taxonomía de codigoTipoVenta:
 *   VEN              → venta real (FAC-A/FAC-B)
 *   DEV-RE / DEV-CA  → devoluciones/rechazos (NCR, esCredito=true, ventaReferenciada→VEN)
 *   AJU-MAS/AJU-MEN  → ajustes de stock (remitos REMI/REME) — NO son venta ni rechazo
 *   DEB              → nota de débito
 *
 * Mapeo a Chess:
 *   codigoCliente = "200" + idCliente Chess (strip de prefijo string, ver normalizarCodigoCliente)
 *   codigoItem    = idArticulo Chess (cruzar con chess_articulos para HL)
 *
 * ⚠️ La API no ordena ni filtra por tipo (orderby/sort/filter son ignorados). Los registros
 *    vienen ordenados ASCENDENTE por id, así que lo reciente está en las últimas páginas.
 *    Histórico ≈ 31k registros / 155 páginas / 260s. Por eso el sync diario NO recorre todo:
 *    localiza la última página por búsqueda binaria (`buscarIndiceUltimaPagina`) y lee solo las
 *    últimas N (`fetchVentasRecientes`). El recorrido completo (`fetchVentasPorRango`) queda
 *    para el backfill histórico inicial.
 *
 * ⚠️ `fechaDesde` SÍ se aplica (2026-07-16), al revés de lo que decía este encabezado: filtra
 *    por **fechaPedido**, no por fechaEntrega. Sirve para acotar sin recorrer el histórico,
 *    pero hay que retroceder lo suficiente como para no perder pedidos cargados con
 *    anticipación — ver `fetchVentasPorFechaEntrega`.
 */

export interface GescomCredentials {
  tokenUrl: string
  baseUrl: string
  clientId: string
  user: string
  pass: string
}

export interface GescomItem {
  codigoItem: string | null
  cantidad: number | null
  codigoUnidad: string | null      // "Pack" | "Unidad" | ...
  unidadFactor: number | null      // unidades por Pack (== unidades_bulto de Chess)
  codigoDeposito: string | null
  precioUnitario: number | null
  importeNeto: number | null
  importeTotal: number | null
}

export interface GescomVentaReferenciada {
  id: number
  numeroComprobante: number
  codigoTipoComprobante: string    // "VEN" para la venta original referenciada por una NC
}

export interface GescomVenta {
  id: number
  numeroComprobante: number
  codigoTipoVenta: string          // VEN | DEV-RE | DEV-CA | AJU-MAS | AJU-MEN | DEB
  estado: string                   // "Finalizada" | ...
  etapa: string                    // "Entrega" | ...
  esCredito: boolean
  esSinCargo: boolean
  codigoCliente: string | null
  codigoChofer: string | null
  codigoReparto: number | null
  codigoVendedor: string | null
  codigoEmpresa: string | null     // "98" en Pampeana
  codigoSede: string | null        // "2" en Pampeana
  fechaPedido: string | null
  fechaEntrega: string | null      // "YYYY-MM-DDTHH:mm:ss-03:00"
  importeNeto: number | null
  importeTotal: number | null
  motivo: string | null            // null en las devoluciones observadas
  ventaReferenciada: GescomVentaReferenciada | null
  comprobantePrincipal: { codigoTipoComprobante: string } | null
  items: GescomItem[]
}

const PAGE_SIZE = 200
const MAX_PAGES = 5000

/** Lee las credenciales GESCOM desde el entorno (con defaults a los valores del script fuente). */
export function gescomCredsFromEnv(): GescomCredentials {
  return {
    tokenUrl: process.env.GESCOM_TOKEN_URL
      ?? "https://auth.gescom.online/realms/gcw-mercosur/protocol/openid-connect/token",
    baseUrl: process.env.GESCOM_BASE_URL
      ?? "https://mercosur.gescom.online/data/cmd/ventas/api/v1/get",
    clientId: process.env.GESCOM_CLIENT_ID ?? "gcw-web-api",
    user: process.env.GESCOM_USER ?? "",
    pass: process.env.GESCOM_PASS ?? "",
  }
}

/** OAuth2 password grant → access_token (Bearer). */
export async function gescomLogin(creds: GescomCredentials): Promise<string> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    username: creds.user,
    password: creds.pass,
    grant_type: "password",
  })
  const r = await fetch(creds.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!r.ok) throw new Error(`GESCOM token failed: ${r.status} ${await r.text().catch(() => "")}`)
  const data = (await r.json()) as { access_token?: string }
  if (!data.access_token) throw new Error("GESCOM: respuesta sin access_token")
  return data.access_token
}

/** Una página de ventas (pagestoskip = número de página). `fechaDesde` opcional (ver abajo). */
async function fetchVentasPagina(
  creds: GescomCredentials, token: string, page: number, fechaDesde?: string,
): Promise<GescomVenta[]> {
  const filtro = fechaDesde ? `&fechaDesde=${fechaDesde}` : ""
  const url = `${creds.baseUrl}?pagesize=${PAGE_SIZE}&pagestoskip=${page}&pagestotake=1${filtro}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`GESCOM GET ventas page=${page}: ${r.status}`)
  const data = await r.json()
  return Array.isArray(data) ? (data.filter((v) => v && typeof v === "object") as GescomVenta[]) : []
}

/** Resta días a un YYYY-MM-DD. */
function restarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10)
}

/**
 * Días de anticipación con que se carga un pedido antes de su entrega. Medido sobre 1.769
 * ventas VEN de la empresa 98 (abr–jul 2026): la moda son 2 días, el p99 son 7 y el máximo
 * observado 15. 21 deja margen de sobra sin arrastrar meses de ventas.
 */
const DIAS_ANTICIPACION = 21

/** Cuántas páginas se piden a la vez. La API responde ~1s por página. */
const TANDA = 4

/**
 * Ventas con `fechaEntrega` en [desde, hasta], acotando por el filtro `fechaDesde` de la API.
 *
 * 🚨 `fechaDesde` SÍ filtra (el encabezado de este módulo lo daba por ignorado; hoy lo
 * aplica), pero **filtra por `fechaPedido`, NO por `fechaEntrega`** — verificado contra prod
 * 2026-07-16: el `min(fechaPedido)` de la respuesta coincide exactamente con el parámetro, y
 * `fechaDesde=2026-07-16` devuelve entregas del 15 al 18. Pedir el día anterior a la entrega
 * trae 3 de los 13 pedidos del día y PIERDE los otros 10 EN SILENCIO. Por eso se retrocede
 * `DIAS_ANTICIPACION` desde `desde` y el rango de entrega se filtra acá.
 *
 * Si la API dejara de aplicar el filtro, la respuesta traería `fechaPedido` anteriores al
 * corte: se detecta y se cae a `fetchVentasRecientes` (más lento, pero correcto) en vez de
 * devolver de menos.
 */
export async function fetchVentasPorFechaEntrega(
  creds: GescomCredentials, token: string, desde: string, hasta: string,
): Promise<GescomVenta[]> {
  const corte = restarDias(desde, DIAS_ANTICIPACION)
  const primera = await fetchVentasPagina(creds, token, 0, corte)
  const pedidas = primera.map((v) => (v.fechaPedido ?? "").slice(0, 10)).filter(Boolean)
  if (pedidas.some((f) => f < corte)) {
    return await fetchVentasRecientes(creds, token, desde, hasta)
  }

  const enRango = (v: GescomVenta) => {
    const f = (v.fechaEntrega ?? "").slice(0, 10)
    return f >= desde && f <= hasta
  }
  const out: GescomVenta[] = primera.filter(enRango)
  if (primera.length < PAGE_SIZE) return out

  // El resto de las páginas de a tandas: son ~6 y en serie costarían ~6s.
  for (let page = 1; page < MAX_PAGES; page += TANDA) {
    const tanda = await Promise.all(
      Array.from({ length: TANDA }, (_, i) => fetchVentasPagina(creds, token, page + i, corte)),
    )
    for (const chunk of tanda) out.push(...chunk.filter(enRango))
    if (tanda.some((c) => c.length < PAGE_SIZE)) break
  }
  return out
}

/** True si la página `page` tiene al menos un registro. */
async function paginaTieneDatos(creds: GescomCredentials, token: string, page: number): Promise<boolean> {
  return (await fetchVentasPagina(creds, token, page)).length > 0
}

/**
 * Índice de la última página con datos (búsqueda exponencial + binaria) — ~log2(N) requests.
 * Devuelve -1 si no hay datos.
 */
export async function buscarIndiceUltimaPagina(creds: GescomCredentials, token: string): Promise<number> {
  if (!(await paginaTieneDatos(creds, token, 0))) return -1
  // fase exponencial: hi = primera potencia de 2 vacía
  let lo = 0, hi = 1
  while (hi < MAX_PAGES && (await paginaTieneDatos(creds, token, hi))) {
    lo = hi
    hi *= 2
  }
  // binaria en (lo, hi]: lo tiene datos, hi no
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (await paginaTieneDatos(creds, token, mid)) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Ventas recientes para el sync diario: localiza la última página y RETROCEDE desde el final
 * hasta cubrir todo el rango [desde, hasta] por `fechaEntrega`, filtrando esas ventas.
 *
 * No usa un tope fijo de páginas: para a la primera página cuya fecha de entrega MÁXIMA ya es
 * anterior a `desde` (con `SOLAPE` páginas extra de seguridad porque la API ordena por id de
 * creación, no estrictamente por fechaEntrega). Esto recaptura finalizaciones tardías de días
 * que ya "envejecieron" en la paginación — el motivo por el que un tope fijo (25) dejaba días
 * recientes congelados/subcontados (incidente 2026-06-16). `minPaginas` es un piso de seguridad.
 * Costo ≈ (páginas que cubren el rango) + log2(total) requests; sigue sin recorrer el histórico.
 */
export async function fetchVentasRecientes(
  creds: GescomCredentials, token: string, desde: string, hasta: string, minPaginas = 25,
): Promise<GescomVenta[]> {
  const ultima = await buscarIndiceUltimaPagina(creds, token)
  if (ultima < 0) return []
  const SOLAPE = 3
  const out: GescomVenta[] = []
  let leidas = 0
  let paginasBajoDesde = 0
  for (let page = ultima; page >= 0; page--) {
    const chunk = await fetchVentasPagina(creds, token, page)
    leidas++
    let maxFecha = ""
    for (const v of chunk) {
      const f = (v.fechaEntrega ?? "").slice(0, 10)
      if (!f) continue
      if (f > maxFecha) maxFecha = f
      if (f >= desde && f <= hasta) out.push(v)
    }
    // Toda la página ya cae antes del rango: cortar tras `minPaginas` y `SOLAPE` consecutivas.
    if (maxFecha && maxFecha < desde) {
      paginasBajoDesde++
      if (leidas >= minPaginas && paginasBajoDesde >= SOLAPE) break
    } else {
      paginasBajoDesde = 0
    }
  }
  return out
}

/**
 * Recorre TODO el histórico filtrando por `fechaEntrega` en [desde, hasta]. Solo para el
 * backfill inicial (lento: ~260s para ~31k registros). El sync diario usa `fetchVentasRecientes`.
 */
export async function fetchVentasPorRango(
  creds: GescomCredentials, token: string, desde: string, hasta: string,
): Promise<GescomVenta[]> {
  const out: GescomVenta[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const chunk = await fetchVentasPagina(creds, token, page)
    if (chunk.length === 0) break
    for (const v of chunk) {
      const f = (v.fechaEntrega ?? "").slice(0, 10)
      if (f && f >= desde && f <= hasta) out.push(v)
    }
    if (chunk.length < PAGE_SIZE) break
  }
  return out
}

/** id de cliente Chess a partir del codigoCliente de Gestión (strip prefijo "200"). */
export function normalizarCodigoCliente(codigoCliente: string | null): number | null {
  const s = String(codigoCliente ?? "")
  const sinPrefijo = s.startsWith("200") ? s.slice(3) : s
  const n = Number(sinPrefijo)
  return Number.isFinite(n) && sinPrefijo !== "" ? n : null
}
