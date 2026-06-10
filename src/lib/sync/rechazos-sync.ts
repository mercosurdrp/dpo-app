/**
 * Lógica compartida del sync de rechazos.
 *
 * Una sola fuente de verdad para los dos consumidores:
 *   - `src/app/api/rechazos/sync/route.ts` (endpoint con auth + sync_log)
 *   - `scripts/maintenance/sync-rechazos-local.ts` (CLI con creds locales)
 *
 * Por día sincroniza:
 *   1) Lista de ventas crudas desde Chess.
 *   2) Total de bultos entregados por fletero (denominador per-día).
 *   3) Upsert a `rechazos` (filtros: idRechazo>0, !anulado, patente válida).
 *   4) Upsert a `ventas_diarias` (solo FCVTA, patente válida).
 *
 * Chofer (persona) se resuelve únicamente desde `mapeo_patente_chofer`
 * (tabla manual). Foxtrot NO se consulta acá — el dato de chofer del
 * rechazo proviene de quién quedó asignado a la patente, no del tracking
 * de entregas en vivo.
 *
 * El sync NO filtra por motivo (la categorización vive en `catalogo_rechazos`,
 * el dashboard la aplica para presentación).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import https from "node:https"

// ----------------------------- Tipos públicos -----------------------------

export interface SyncDayResult {
  fecha: string
  sin_datos: boolean
  rechazos_upserted: number
  rechazos_repetidos: number
  ventas_diarias_upserted: number
  total_rechazos_intentados: number
  chofer: { mapeo: number; sin_resolver: number }
  errors: Array<{ day: string | null; kind: "rechazo" | "ventas_diarias" | "ocupacion_bodega" | "fatal"; message: string }>
}

export interface ChessCredentials {
  baseUrl: string
  user: string
  pass: string
}

// ----------------------------- Constantes/utilidades -----------------------------

const PATENTE_REGEX =
  /^([A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})(\.\d+)?$/i

const insecureAgent = new https.Agent({ rejectUnauthorized: false })

export function isPatenteValida(s: string | null | undefined): boolean {
  if (!s) return false
  return PATENTE_REGEX.test(s.trim())
}

export function normalizarPatente(s: string): string {
  return s.toUpperCase().trim()
}

function chessFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    // @ts-expect-error Node fetch supports agent option
    agent: insecureAgent,
  })
}

// ----------------------------- Shape de Chess -----------------------------

interface ChessVenta {
  idDocumento: string
  serie: number
  nrodoc: number
  idRechazo: number
  dsRechazo: string
  idArticulo: number
  dsArticulo: string
  idFleteroCarga: number
  dsFleteroCarga: string
  cantidadesRechazo: number
  cantidadesTotal: number
  unidadesSolicitadas: number
  idCliente: number
  nombreCliente: string
  idVendedor: number
  dsVendedor: string
  planillaCarga: string
  fechaComprobate: string
  fechaPedido: string | null
  anulado: string
  unimedtotal: number
  fechaComprobanteRela: string | null   // fecha de la FCVTA relacionada (DVVTA)
  idSucursal: number | null
  dsSucursal: string | null
  dsSupervisor: string | null
  dsGerente: string | null
  dsLocalidad: string | null
  dsProvincia: string | null
  dsCanalMkt: string | null
  dsSubcanalMKT: string | null
  dsSegmentoMkt: string | null
  subtotalNeto: number | null
  subtotalFinal: number | null
  internos: number | null
}

// ----------------------------- Acceso a Chess -----------------------------

export async function chessLogin(creds: ChessCredentials): Promise<string> {
  const resp = await chessFetch(`${creds.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: creds.user, password: creds.pass }),
  })
  if (!resp.ok) throw new Error(`Chess login failed: ${resp.status}`)
  const data = (await resp.json()) as { sessionId?: string }
  if (!data.sessionId) throw new Error("No sessionId from Chess")
  return data.sessionId
}

async function fetchVentasDia(
  creds: ChessCredentials,
  sessionId: string,
  fecha: string,
): Promise<ChessVenta[]> {
  const url = `${creds.baseUrl}/ventas/?fechaDesde=${fecha}&fechaHasta=${fecha}&detallado=true`
  const r = await chessFetch(url, { headers: { Accept: "application/json", Cookie: sessionId } })
  if (!r.ok) { console.warn(`[sync] chess ventas ${fecha}: HTTP ${r.status}`); return [] }
  let d: { dsReporteComprobantesApi?: { VentasResumen?: unknown } }
  try { d = (await r.json()) as typeof d } catch { return [] }
  const res = d?.dsReporteComprobantesApi?.VentasResumen
  return Array.isArray(res) ? (res as ChessVenta[]) : []
}

// ----------------------------- mapeo_patente_chofer (manual) -----------------------------

/**
 * Carga el mapeo patente→chofer manual.
 * Devuelve mapa `<patente_normalizada>` → `<nombre del chofer>`.
 * Si la tabla no existe (e.g. antes de aplicar mig. 056), devuelve mapa vacío.
 */
export async function loadMapeoManualChofer(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const { data, error } = await supabase
    .from("mapeo_patente_chofer")
    .select("patente, activo, chofer:catalogo_choferes(nombre)")
    .eq("activo", true)

  if (error) {
    console.warn(`[sync] mapeo_patente_chofer no disponible: ${error.message}`)
    return out
  }
  type Row = { patente: string; chofer: { nombre: string } | { nombre: string }[] | null }
  for (const row of (data ?? []) as unknown as Row[]) {
    const chofer = Array.isArray(row.chofer) ? row.chofer[0] : row.chofer
    if (chofer?.nombre) out.set(normalizarPatente(row.patente), chofer.nombre)
  }
  return out
}

// ----------------------------- Sync por día -----------------------------

export interface SyncDayDeps {
  supabase: SupabaseClient
  chess: ChessCredentials
  sessionId: string                       // pre-loggeado para reutilizar entre días
  mapeoManualChofer: Map<string, string>  // cargado una vez por sync
}

/**
 * Sincroniza un único día. Idempotente (upserts).
 * No hace HTTP a Chess para login (espera sessionId del caller).
 * Caller decide qué hacer con el resultado (logging, sync_log, etc.).
 */
export async function syncRechazosForDate(
  fecha: string,
  deps: SyncDayDeps,
): Promise<SyncDayResult> {
  const { supabase, chess, sessionId, mapeoManualChofer } = deps

  const result: SyncDayResult = {
    fecha,
    sin_datos: false,
    rechazos_upserted: 0,
    rechazos_repetidos: 0,
    ventas_diarias_upserted: 0,
    total_rechazos_intentados: 0,
    chofer: { mapeo: 0, sin_resolver: 0 },
    errors: [],
  }

  const ventas = await fetchVentasDia(chess, sessionId, fecha)
  if (ventas.length === 0) { result.sin_datos = true; return result }

  // Total bultos entregados por fletero (mismo criterio que ventas_diarias
  // sin filtro FCVTA aún — usado solo como "denominador per-día" para guardar
  // en `rechazos.bultos_entregados` por compat. DEPRECATED desde 054).
  const entregadosPorFletero = new Map<string, number>()
  for (const v of ventas) {
    if (v.anulado === "SI") continue
    if (!isPatenteValida(v.dsFleteroCarga)) continue
    entregadosPorFletero.set(
      v.dsFleteroCarga,
      (entregadosPorFletero.get(v.dsFleteroCarga) ?? 0) + Math.abs(Number(v.unidadesSolicitadas) || 0),
    )
  }

  // Filtros del sync: idRechazo>0, !anulado, patente válida, documento DVVTA.
  // Se excluye PRDVO (orden de devolución administrativa: mal facturado,
  // trámites internos, error de distribución). No es un rechazo de reparto del
  // cliente en ruta y distorsiona el indicador (montos enormes, HL ~0 por
  // cabeceras de combo). El indicador mide solo devoluciones de venta (DVVTA).
  const rechazos = ventas.filter(
    (v) => v.idRechazo > 0 && v.anulado !== "SI" && isPatenteValida(v.dsFleteroCarga)
      && v.idDocumento !== "PRDVO"
  )
  result.total_rechazos_intentados = rechazos.length

  // ---- upsert rechazos ----
  for (const r of rechazos) {
    const patenteNorm = normalizarPatente(r.dsFleteroCarga)
    const choferMapeo = mapeoManualChofer.get(patenteNorm) ?? null
    if (choferMapeo) result.chofer.mapeo++
    else result.chofer.sin_resolver++

    // fecha_venta: imputa el rechazo al día de la venta original.
    // DVVTA → fechaComprobanteRela (la FCVTA relacionada). Sin doc relacionado
    // válido → la propia fecha (no tienen desfasaje).
    const rela = r.fechaComprobanteRela
    const fechaVenta =
      rela && /^\d{4}-\d{2}-\d{2}/.test(rela) && !rela.startsWith("9999") && !rela.startsWith("0001")
        ? rela.slice(0, 10)
        : fecha

    const row = {
      origen: "chess",
      fecha,
      fecha_venta: fechaVenta,
      serie: r.serie,
      nrodoc: r.nrodoc,
      id_articulo: r.idArticulo,
      ds_articulo: r.dsArticulo,
      id_fletero_carga: r.idFleteroCarga,
      ds_fletero_carga: r.dsFleteroCarga,
      id_rechazo: r.idRechazo,
      ds_rechazo: r.dsRechazo,
      bultos_rechazados: Math.abs(Number(r.cantidadesRechazo) || 0),
      hl_rechazados: Math.abs(Number(r.unimedtotal) || 0), // HL: métrica de volumen primaria (combos = 0)
      bultos_entregados: entregadosPorFletero.get(r.dsFleteroCarga) ?? 0, // DEPRECATED (ver mig 054)
      id_cliente: r.idCliente,
      nombre_cliente: r.nombreCliente,
      id_vendedor: r.idVendedor,
      ds_vendedor: r.dsVendedor,
      planilla_carga: r.planillaCarga,
      chofer: choferMapeo,
      // Campos sumados en PR 1
      monto_neto:      r.subtotalNeto   == null ? null : Math.abs(Number(r.subtotalNeto)   || 0),
      monto_bruto:     r.subtotalFinal  == null ? null : Math.abs(Number(r.subtotalFinal)  || 0),
      internos:        r.internos       == null ? null : Math.abs(Number(r.internos)      || 0),
      ds_localidad:    r.dsLocalidad    ?? null,
      ds_provincia:    r.dsProvincia    ?? null,
      ds_canal_mkt:    r.dsCanalMkt     ?? null,
      ds_subcanal_mkt: r.dsSubcanalMKT  ?? null,
      ds_segmento_mkt: r.dsSegmentoMkt  ?? null,
      ds_supervisor:   r.dsSupervisor   ?? null,
      ds_gerente:      r.dsGerente      ?? null,
      id_sucursal:     r.idSucursal     ?? null,
      ds_sucursal:     r.dsSucursal     ?? null,
      fecha_pedido:    r.fechaPedido && r.fechaPedido !== "9999-12-31" ? r.fechaPedido : null,
      id_documento:    r.idDocumento    ?? null,
    }

    const { error } = await supabase
      .from("rechazos")
      .upsert(row, { onConflict: "origen,serie,nrodoc,id_articulo" })

    if (error) {
      if (error.code === "23505") result.rechazos_repetidos++
      else {
        console.error(`[sync] error upsert rechazo day=${fecha}: ${error.message}`)
        result.errors.push({ day: fecha, kind: "rechazo", message: error.message })
      }
    } else {
      result.rechazos_upserted++
    }
  }

  // ---- upsert ventas_diarias (solo FCVTA + patente válida) ----
  const ventasFCVTA = ventas.filter(
    (v) => v.idDocumento === "FCVTA" && v.anulado !== "SI" && isPatenteValida(v.dsFleteroCarga)
  )
  type Agg = { bultos: number; unidades: number; hl: number; planillas: Set<string> }
  const agg = new Map<string, Agg>()
  for (const v of ventasFCVTA) {
    const a = agg.get(v.dsFleteroCarga) ?? { bultos: 0, unidades: 0, hl: 0, planillas: new Set<string>() }
    a.bultos += Math.abs(Number(v.unidadesSolicitadas) || 0)
    a.unidades += Math.abs(Number(v.cantidadesTotal) || 0)
    a.hl += Math.abs(Number(v.unimedtotal) || 0)
    if (v.planillaCarga) a.planillas.add(v.planillaCarga)
    agg.set(v.dsFleteroCarga, a)
  }
  for (const [fletero, a] of agg) {
    const { error } = await supabase.from("ventas_diarias").upsert({
      origen: "chess",
      fecha,
      ds_fletero_carga: fletero,
      total_bultos: Math.round(a.bultos * 100) / 100,
      total_unidades: Math.round(a.unidades * 10000) / 10000,
      total_hl: Math.round(a.hl * 10000) / 10000,
      viajes: a.planillas.size,
    }, { onConflict: "fecha,ds_fletero_carga,origen" })
    if (error) {
      console.error(`[sync] error upsert ventas_diarias day=${fecha}: ${error.message}`)
      result.errors.push({ day: fecha, kind: "ventas_diarias", message: error.message })
    } else {
      result.ventas_diarias_upserted++
    }
  }

  return result
}
