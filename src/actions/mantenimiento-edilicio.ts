"use server"

// Helper de integración con la app FastAPI externa "Plan de Mantenimiento
// Edilicio" (http://181.215.135.232:8123 — ver MANTENIMIENTO_API_URL en env).
//
// Configuración:
//   - process.env.MANTENIMIENTO_API_URL    (ej: http://181.215.135.232:8123)
//   - process.env.MANTENIMIENTO_API_TOKEN  (bearer token compartido)
//
// Si alguna var falta, las funciones devuelven { error } sin tirar — para
// que el flujo principal (crear/editar actividad) no se rompa por la
// integración. El caller decide qué hacer (loguear, toastear, etc).
//
// pregunta_id: la app externa requiere asociar cada PDA a una "pregunta"
// del cuestionario DPO (36 items fijos). Hardcodeamos id=1 ("estructuras
// del techo") como bucket genérico mientras no haya una pregunta "Otros".
// TODO: configurable por env var MANTENIMIENTO_DEFAULT_PREGUNTA_ID.

const DEFAULT_PREGUNTA_ID = 1

export interface Rubro {
  id: string
  nombre: string
}

export interface PdaOutput {
  id: number
  titulo: string
  estado: string
  external_id: string | null
  external_source: string | null
  rubro: string | null
}

interface ApiResult<T> {
  data?: T
  error?: string
}

function getConfig(): { url: string; token: string } | null {
  const url = process.env.MANTENIMIENTO_API_URL
  const token = process.env.MANTENIMIENTO_API_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ""), token }
}

function buildHeaders(token: string, extra?: Record<string, string>) {
  return {
    "Authorization": `Bearer ${token}`,
    "X-External-Source": "dpo-app-reuniones",
    "Content-Type": "application/json",
    ...(extra ?? {}),
  }
}

// Timeout default para llamadas al servicio externo. Si la app de
// mantenimiento está caída o lenta no debe bloquear el flujo principal
// de la actividad de reunión.
const DEFAULT_TIMEOUT_MS = 5000

async function fetchConTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

/**
 * GET /api/rubros — lista pública, sin auth.
 * Cacheado 5 min (lista estática). Timeout de 2.5s para no bloquear
 * la página si la app de mantenimiento está caída o lenta.
 */
export async function listarRubrosMantenimiento(): Promise<ApiResult<Rubro[]>> {
  const cfg = getConfig()
  if (!cfg) return { error: "Mantenimiento API no configurada" }
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)
    const r = await fetch(`${cfg.url}/api/rubros`, {
      next: { revalidate: 300 },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!r.ok) return { error: `HTTP ${r.status}` }
    const data = (await r.json()) as Rubro[]
    return { data }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error fetching rubros",
    }
  }
}

export interface CrearPdaInput {
  externalId: string
  titulo: string
  descripcion: string
  responsable: string
  fechaProbable: string | null
  rubro: string
}

/**
 * POST /api/pdas — crea (o devuelve existente, es idempotente por
 * external_id) un PDA en la app de mantenimiento.
 */
export async function crearPdaEnMantenimiento(
  input: CrearPdaInput
): Promise<ApiResult<PdaOutput>> {
  const cfg = getConfig()
  if (!cfg) return { error: "Mantenimiento API no configurada" }
  try {
    const body = {
      pregunta_id: DEFAULT_PREGUNTA_ID,
      titulo: input.titulo.slice(0, 200),
      descripcion: input.descripcion,
      tipo: "reparacion",
      responsable: input.responsable,
      fecha_probable: input.fechaProbable,
      rubro: input.rubro,
      external_id: input.externalId,
      estado: "planificado",
    }
    const r = await fetchConTimeout(`${cfg.url}/api/pdas`, {
      method: "POST",
      headers: buildHeaders(cfg.token),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    if (!r.ok) {
      const text = await r.text()
      return { error: `HTTP ${r.status}: ${text.slice(0, 200)}` }
    }
    const data = (await r.json()) as PdaOutput
    return { data }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando PDA",
    }
  }
}

/**
 * GET /api/pdas?external_id=... — resuelve el id interno del PDA usando
 * el external_id (que es el id de la actividad de reunión).
 */
async function buscarPdaPorExternalId(
  externalId: string
): Promise<ApiResult<PdaOutput>> {
  const cfg = getConfig()
  if (!cfg) return { error: "Mantenimiento API no configurada" }
  try {
    const url = new URL(`${cfg.url}/api/pdas`)
    url.searchParams.set("external_source", "dpo-app-reuniones")
    url.searchParams.set("external_id", externalId)
    const r = await fetchConTimeout(url.toString(), {
      headers: buildHeaders(cfg.token),
      cache: "no-store",
    })
    if (!r.ok) return { error: `HTTP ${r.status}` }
    const list = (await r.json()) as PdaOutput[]
    if (!list.length) return { error: "PDA no encontrado" }
    return { data: list[0] }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error buscando PDA",
    }
  }
}

export interface ActualizarPdaInput {
  externalId: string
  descripcion?: string
  responsable?: string
  fechaProbable?: string | null
  rubro?: string
  estado?: "planificado" | "en_curso" | "ejecutado" | "cancelado"
}

/**
 * PUT /api/pdas/{id} — actualiza un PDA buscándolo por external_id.
 */
export async function actualizarPdaEnMantenimiento(
  input: ActualizarPdaInput
): Promise<ApiResult<PdaOutput>> {
  const cfg = getConfig()
  if (!cfg) return { error: "Mantenimiento API no configurada" }
  const found = await buscarPdaPorExternalId(input.externalId)
  if (found.error || !found.data) {
    return { error: found.error ?? "PDA no encontrado" }
  }
  try {
    const body: Record<string, unknown> = {}
    if (input.descripcion !== undefined) body.descripcion = input.descripcion
    if (input.responsable !== undefined) body.responsable = input.responsable
    if (input.fechaProbable !== undefined) {
      body.fecha_probable = input.fechaProbable
    }
    if (input.rubro !== undefined) body.rubro = input.rubro
    if (input.estado !== undefined) body.estado = input.estado

    const r = await fetchConTimeout(`${cfg.url}/api/pdas/${found.data.id}`, {
      method: "PUT",
      headers: buildHeaders(cfg.token),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    if (!r.ok) {
      const text = await r.text()
      return { error: `HTTP ${r.status}: ${text.slice(0, 200)}` }
    }
    const data = (await r.json()) as PdaOutput
    return { data }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando PDA",
    }
  }
}

/**
 * DELETE /api/pdas/{id} — elimina un PDA por external_id (cuando el
 * destino de la actividad cambia y deja de ser mantenimiento_edilicio).
 */
export async function eliminarPdaEnMantenimiento(
  externalId: string
): Promise<ApiResult<{ ok: true }>> {
  const cfg = getConfig()
  if (!cfg) return { error: "Mantenimiento API no configurada" }
  const found = await buscarPdaPorExternalId(externalId)
  if (found.error || !found.data) {
    // Si no existe, semánticamente está borrado.
    return { data: { ok: true } }
  }
  try {
    const r = await fetchConTimeout(`${cfg.url}/api/pdas/${found.data.id}`, {
      method: "DELETE",
      headers: buildHeaders(cfg.token),
      cache: "no-store",
    })
    if (!r.ok) {
      const text = await r.text()
      return { error: `HTTP ${r.status}: ${text.slice(0, 200)}` }
    }
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error borrando PDA",
    }
  }
}

/**
 * Helper para evidencias: sube un archivo (descargado de Supabase) a la
 * app de mantenimiento via POST /api/pdas/{id}/evidencias (multipart).
 */
export async function subirEvidenciaPda(input: {
  externalId: string
  archivoBlob: Blob
  archivoNombre: string
  descripcion?: string | null
}): Promise<ApiResult<{ ok: true }>> {
  const cfg = getConfig()
  if (!cfg) return { error: "Mantenimiento API no configurada" }
  const found = await buscarPdaPorExternalId(input.externalId)
  if (found.error || !found.data) {
    return { error: found.error ?? "PDA no encontrado" }
  }
  try {
    const fd = new FormData()
    fd.append("archivo", input.archivoBlob, input.archivoNombre)
    if (input.descripcion) fd.append("descripcion", input.descripcion)

    const r = await fetch(
      `${cfg.url}/api/pdas/${found.data.id}/evidencias`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.token}`,
          "X-External-Source": "dpo-app-reuniones",
        },
        body: fd,
        cache: "no-store",
      }
    )
    if (!r.ok) {
      const text = await r.text()
      return { error: `HTTP ${r.status}: ${text.slice(0, 200)}` }
    }
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo evidencia",
    }
  }
}
