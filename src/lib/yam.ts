/**
 * Cliente de la API YAM Capital Humano (RRHH; solo Pampeana).
 * Docs: https://mercosur.yamcapitalhumano.com/api/openapi.html
 *
 * Particularidades relevadas el 2026-08-11 contra el ambiente real:
 *  - Auth: POST /Seguridad/Autenticar con la APIKEY (`GRUPO|KEY`) devuelve un JWT,
 *    pero el backend (framework Toba) guarda el grupo en la SESIÓN PHP: sin la
 *    cookie `TOBA_SESSID` del Autenticar, cualquier endpoint responde 401
 *    "falta grupo". Hay que mandar cookie + Bearer juntos.
 *  - Todas las requests llevan el query param `ai=rrhh||3956` (URL-encodeado).
 *  - Cloudflare bloquea la huella TLS del fetch de Node (undici, HTTP/1.1) con
 *    403 sistemático, pero deja pasar el cliente HTTP/2 nativo (`node:http2`).
 *    Por eso el transporte de acá abajo NO usa fetch — no "simplificarlo".
 *  - Asistencia/Ausentismo no son REST: van por POST /Capacidades/Ejecutar con
 *    `{grupo, alias, parametros}` (extensión x-ruta-ejecucion del spec).
 *  - Las respuestas de Capacidades pueden venir en latin-1 → decodificar con
 *    fallback (los acentos de los nombres se rompen si se asume UTF-8).
 */

const YAM_BASE_URL = (
  process.env.YAM_BASE_URL ?? "https://mercosur.yamcapitalhumano.com"
).trim()
const YAM_AI = (process.env.YAM_AI ?? "rrhh||3956").trim()

/** Código de empresa dentro de YAM (MPAMP = Mercosur Región Pampeana S.R.L). */
export const YAM_CODIGO_EMPRESA = (
  process.env.YAM_CODIGO_EMPRESA ?? "MPAMP"
).trim()

const API_PATH = "/aplicacion.php/api/v1"
const UA = "dpo-app/1.0"

// ── Tipos (campos que usamos; la API devuelve más) ──────────────────────────

export interface YamPersona {
  id_personal: number
  legajo: string | null
  nombre: string
  dni: string | null
  cuil: string | null
  codigo_empresa: string
  nombre_gerencia: string | null
  nombre_area: string | null
  nombre_sector: string | null
  centro_costo: string | null
  fecha_ingreso: string | null
  fecha_nacimiento: string | null
  fecha_baja: string | null
  movil: string | null
  fijo: string | null
  contacto_emergencia: string | null
  usuario: string | null
}

export interface YamAsistenciaDia {
  empresa: string
  legajo: string
  nombre: string
  fecha: string
  /** PRESENTE | AUSENTE | VACACIONES | LICENCIA | ... */
  estado: string
  descripcion: string
  entrada: string | null
  salida: string | null
  horas: string
  horas_nocturnas: string
  horas_descontadas: string
  origen_entrada: string | null
  origen_salida: string | null
}

export interface YamAusentismo {
  id_periodo: string
  codigo_empresa: string
  persona: { id_personal: number; legajo: string; nombre: string }
  categoria: { codigo: string; descripcion: string }
  motivo: { id: number; codigo: string; descripcion: string; clase: string } | null
  estado: { codigo: string; descripcion: string }
  situacion: { codigo: string; descripcion: string; fecha_referencia: string }
  periodo: {
    fecha_desde: string
    fecha_hasta: string
    cantidad: number
    unidad: string
  }
}

export interface YamResumenAsistencia {
  empresa: string
  id_personal: number
  periodo: { desde: string; hasta: string }
  horas: {
    totales: string
    simples: string
    nocturnas: string
    descontadas: string
    requeridas: string
    promedio: string
    extras: { codigo: string; nombre: string; horas: string }[]
  }
  contadores: {
    laborables: number
    presentes: number
    ausentes: number
    ausentes_injustificados: number
    ausentes_justificados: number
    vacaciones: number
    licencias: number
    feriados: number
    sanciones: number
    [k: string]: number
  }
  motivos: { codigo: string; nombre: string; tipo: string; cantidad: number }[]
}

// ── Sesión (token JWT + cookie Toba), cacheada por lambda ───────────────────

interface YamSesion {
  token: string
  cookie: string
  expira: number
}

let sesion: YamSesion | null = null

function apikey(): string {
  const key = (process.env.YAM_APIKEY ?? "").trim()
  if (!key) throw new Error("Falta la variable de entorno YAM_APIKEY")
  return key
}

/** Decodifica el body probando UTF-8 estricto y cayendo a latin-1. */
function decodificar(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder("latin1").decode(buf)
  }
}

interface YamHttpRes {
  status: number
  setCookies: string[]
  body: string
}

/** Request cruda por HTTP/2 (ver nota de Cloudflare arriba). */
async function yamHttp(
  method: "GET" | "POST",
  path: string,
  extraHeaders: Record<string, string>,
  body?: string
): Promise<YamHttpRes> {
  const { connect } = await import("node:http2")
  const sep = path.includes("?") ? "&" : "?"
  const fullPath = `${API_PATH}${path}${sep}ai=${encodeURIComponent(YAM_AI)}`
  return new Promise((resolve, reject) => {
    const client = connect(YAM_BASE_URL)
    const timer = setTimeout(() => {
      client.close()
      reject(new Error(`YAM timeout en ${method} ${path}`))
    }, 60_000)
    client.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
    const req = client.request({
      ":method": method,
      ":path": fullPath,
      "user-agent": UA,
      accept: "*/*",
      ...(body ? { "content-type": "application/json" } : {}),
      ...extraHeaders,
    })
    let status = 0
    let setCookies: string[] = []
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0)
      const sc = headers["set-cookie"]
      setCookies = Array.isArray(sc) ? sc : sc ? [sc] : []
    })
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => {
      clearTimeout(timer)
      client.close()
      resolve({ status, setCookies, body: decodificar(Buffer.concat(chunks)) })
    })
    req.on("error", (err) => {
      clearTimeout(timer)
      client.close()
      reject(err)
    })
    req.end(body)
  })
}

async function autenticar(): Promise<YamSesion> {
  const res = await yamHttp(
    "POST",
    "/Seguridad/Autenticar",
    {},
    JSON.stringify({ apikey: apikey() })
  )
  const cookie = res.setCookies
    .map((c) => c.split(";")[0].trim())
    .filter((c) => c.includes("TOBA_SESSID"))
    .join("; ")
  const json = JSON.parse(res.body) as {
    success: boolean
    message: string
    data: { rows: { access_token: string; expires_in: number } }
  }
  if (res.status !== 200 || !json.success) {
    throw new Error(`YAM Autenticar falló (${res.status}): ${json.message ?? "sin detalle"}`)
  }
  return {
    token: json.data.rows.access_token,
    cookie,
    // Renovar con 1 h de margen sobre las 24 h del token.
    expira: Date.now() + (json.data.rows.expires_in - 3600) * 1000,
  }
}

async function getSesion(): Promise<YamSesion> {
  if (!sesion || sesion.expira < Date.now()) sesion = await autenticar()
  return sesion
}

async function request(method: "GET" | "POST", path: string, body?: string): Promise<string> {
  const s = await getSesion()
  const hacer = (ses: YamSesion) =>
    yamHttp(method, path, { authorization: `Bearer ${ses.token}`, cookie: ses.cookie }, body)
  let res = await hacer(s)
  if (res.status === 401) {
    // Sesión PHP vencida en el server: re-autenticar una vez.
    sesion = await autenticar()
    res = await hacer(sesion)
  }
  return res.body
}

// ── Endpoints REST ──────────────────────────────────────────────────────────

interface YamRestResponse<T> {
  success: boolean
  code: number
  message: string
  data: { rows?: T[] }
  meta: { total?: number; page?: number; total_pages?: number }
}

async function yamGet<T>(path: string): Promise<YamRestResponse<T>> {
  return JSON.parse(await request("GET", path)) as YamRestResponse<T>
}

/** Nómina completa de la empresa (recorre todas las páginas). */
export async function yamListarPersonal(): Promise<YamPersona[]> {
  const rows: YamPersona[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await yamGet<YamPersona>(
      `/Personal/Listar?codigo_empresa=${YAM_CODIGO_EMPRESA}&page=${page}&per_page=100&order_by=nombre`
    )
    // 404 "No se encontraron resultados" = página vacía, no error.
    if (!res.success) break
    rows.push(...(res.data.rows ?? []))
    if (page >= (res.meta.total_pages ?? 1)) break
  }
  return rows
}

// ── Capacidades (Asistencia / Ausentismo) ───────────────────────────────────

interface YamCapacidadResponse<T> {
  estado: string
  codigo_capacidad: string
  mensaje: string
  datos: T
  metadatos?: { total_pages?: number }
}

async function yamCapacidad<T>(
  alias: string,
  parametros: Record<string, unknown>
): Promise<YamCapacidadResponse<T>> {
  const grupo = apikey().split("|")[0]
  const body = JSON.stringify({ grupo, alias, parametros })
  const json = JSON.parse(
    await request("POST", "/Capacidades/Ejecutar", body)
  ) as YamCapacidadResponse<T>
  if (json.estado !== "OK") {
    throw new Error(`YAM ${alias} falló: ${json.mensaje ?? json.estado}`)
  }
  return json
}

/** Las capacidades paginan de a 100 (metadatos.total_pages): junta todas las páginas. */
async function yamCapacidadTodas<T>(
  alias: string,
  parametros: Record<string, unknown>
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await yamCapacidad<T[]>(alias, { ...parametros, page, per_page: 100 })
    out.push(...res.datos)
    if (page >= (res.metadatos?.total_pages ?? 1)) break
  }
  return out
}

/** Detalle de asistencia de TODA la empresa para un día (fichadas del reloj). */
export async function yamDetalleDiario(fecha: string): Promise<YamAsistenciaDia[]> {
  return yamCapacidadTodas<YamAsistenciaDia>("Asistencia/ListarDetalleDiario", {
    codigo_empresa: YAM_CODIGO_EMPRESA,
    fecha,
  })
}

/** Períodos de ausentismo (vacaciones, licencias, etc.) que tocan el rango. */
export async function yamAusentismos(
  fechaDesde: string,
  fechaHasta: string
): Promise<YamAusentismo[]> {
  return yamCapacidadTodas<YamAusentismo>("Ausentismo/ListarPeriodos", {
    codigo_empresa: YAM_CODIGO_EMPRESA,
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
  })
}

/** Resumen de asistencia de una persona en un período (horas, extras, contadores). */
export async function yamResumenAsistencia(
  legajo: string,
  fechaDesde: string,
  fechaHasta: string
): Promise<YamResumenAsistencia> {
  const res = await yamCapacidad<YamResumenAsistencia>("Asistencia/Resumen", {
    codigo_empresa: YAM_CODIGO_EMPRESA,
    legajo,
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
  })
  return res.datos
}
