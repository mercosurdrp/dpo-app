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
  rechazos_eliminados: number
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
  esCombo: string | null   // "SI" = línea encabezado del combo (no es mercadería física)
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

// ----------------------------- Reconciliación por comprobante -----------------------------

/**
 * Reconcilia un COMPROBANTE de rechazos: borra de `rechazos` las líneas
 * (id_articulo) de ese (origen, serie, nrodoc) que YA NO vinieron del origen.
 * Es el equivalente al "borrar + reinsertar el día" del dashboard de Misiones,
 * pero a nivel comprobante — necesario porque la columna `fecha` guarda la fecha
 * de VENTA, no la de registro del fetch, así que no se puede particionar por día.
 *
 * Cubre: líneas quitadas de un comprobante y comprobantes anulados/revertidos
 * enteros (idArticulosVigentes vacío → borra todas sus líneas). Sin esto, un
 * rechazo que el origen corrige/anula quedaba zombie inflando el indicador,
 * porque el sync sólo hacía upsert (nunca borraba).
 *
 * 🚨 SEGURIDAD: invocar SÓLO con comprobantes que vinieron en el fetch. Un
 * comprobante siempre llega con TODOS sus ítems (la parcialidad de paginación es
 * entre comprobantes, no dentro de uno), así que es seguro en cualquier modo.
 * Devuelve cuántas filas eliminó.
 */
export async function reconciliarComprobante(
  supabase: SupabaseClient,
  origen: string,
  serie: number,
  nrodoc: number,
  idArticulosVigentes: Set<number>,
): Promise<number> {
  const { data, error } = await supabase
    .from("rechazos")
    .select("id_articulo")
    .eq("origen", origen)
    .eq("serie", serie)
    .eq("nrodoc", nrodoc)
  if (error) {
    console.warn(`[sync] reconciliar ${origen} ${serie}-${nrodoc}: no se pudo leer líneas: ${error.message}`)
    return 0
  }
  const zombies = ((data ?? []) as Array<{ id_articulo: number }>)
    .filter((r) => !idArticulosVigentes.has(r.id_articulo))
  let borradas = 0
  for (const z of zombies) {
    const { error: delErr } = await supabase
      .from("rechazos")
      .delete()
      .eq("origen", origen)
      .eq("serie", serie)
      .eq("nrodoc", nrodoc)
      .eq("id_articulo", z.id_articulo)
    if (delErr) {
      console.warn(`[sync] reconciliar ${origen} ${serie}-${nrodoc}: no se pudo borrar art ${z.id_articulo}: ${delErr.message}`)
      continue
    }
    borradas++
  }
  return borradas
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
    rechazos_eliminados: 0,
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
    if (v.esCombo === "SI") continue
    if (!isPatenteValida(v.dsFleteroCarga)) continue
    entregadosPorFletero.set(
      v.dsFleteroCarga,
      (entregadosPorFletero.get(v.dsFleteroCarga) ?? 0) + Math.abs(Number(v.cantidadesTotal) || 0),
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

  // Comprobantes de rechazo que el fetch del día tocó (incluye anulados/sin
  // patente, para detectar líneas que dejaron de ser rechazo) → líneas vigentes
  // por comprobante, para reconciliar al final. Clave "serie|nrodoc".
  const lineasVigentesPorComp = new Map<string, Set<number>>()
  for (const v of ventas) {
    if (v.idRechazo > 0 && v.idDocumento !== "PRDVO") {
      const k = `${v.serie}|${v.nrodoc}`
      if (!lineasVigentesPorComp.has(k)) lineasVigentesPorComp.set(k, new Set<number>())
    }
  }

  // ---- upsert rechazos ----
  for (const r of rechazos) {
    lineasVigentesPorComp.get(`${r.serie}|${r.nrodoc}`)?.add(r.idArticulo)
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
      // fecha = día del REPARTO (criterio del indicador desde 2026-06-12; antes era
      // el día de registro del DVVTA). fecha_venta se mantiene por compatibilidad.
      fecha: fechaVenta,
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

  // ---- reconciliar: borrar líneas de rechazo que el origen ya no reporta ----
  // El fetch del día trae cada DVVTA completo, así que es seguro limpiar por
  // comprobante lo que sobra (líneas corregidas / comprobantes anulados).
  for (const [key, vig] of lineasVigentesPorComp) {
    const [serie, nrodoc] = key.split("|").map(Number)
    result.rechazos_eliminados += await reconciliarComprobante(supabase, "chess", serie, nrodoc, vig)
  }

  // ---- upsert ventas_diarias (solo FCVTA + patente válida) ----
  // Se excluye la línea ENCABEZADO del combo (esCombo="SI", SKU 900xxx): no es
  // mercadería física, sus productos ya vienen como líneas componentes
  // (esCombo="NO", idCombo→header). Contarla inflaba bultos/HL (1 por combo).
  const ventasFCVTA = ventas.filter(
    (v) =>
      v.idDocumento === "FCVTA" &&
      v.anulado !== "SI" &&
      v.esCombo !== "SI" &&
      isPatenteValida(v.dsFleteroCarga)
  )
  type Agg = { bultos: number; unidades: number; hl: number; planillas: Set<string> }
  const agg = new Map<string, Agg>()
  // Detalle por SKU del día (drill-down de "Bultos vendidos" en reuniones, mig 108)
  type AggSku = { ds: string; bultos: number; hl: number }
  const aggSku = new Map<number, AggSku>()
  // Detalle cliente × camión del día (mig 119) — misma pasada, clave "<fletero>|<idCliente>"
  type AggCliente = {
    fletero: string; idCliente: number; nombre: string | null
    bultos: number; hl: number; neto: number; comprobantes: Set<string>
  }
  const aggCliente = new Map<string, AggCliente>()
  // Detalle camión × SKU del día (mig 120) — clave "<fletero>|<idArticulo>"
  type AggFleteroSku = { fletero: string; idArt: number; ds: string; bultos: number; hl: number }
  const aggFleteroSku = new Map<string, AggFleteroSku>()
  for (const v of ventasFCVTA) {
    const a = agg.get(v.dsFleteroCarga) ?? { bultos: 0, unidades: 0, hl: 0, planillas: new Set<string>() }
    // En Chess Pampeana: cantidadesTotal = BULTOS (puede ser fraccional, p.ej. 0.5 = medio
    // bulto). unidadesSolicitadas = unidades sueltas (0 cuando se vende el bulto entero).
    // total_bultos debe ser cantidadesTotal; total_unidades, las sueltas.
    a.bultos += Math.abs(Number(v.cantidadesTotal) || 0)
    a.unidades += Math.abs(Number(v.unidadesSolicitadas) || 0)
    a.hl += Math.abs(Number(v.unimedtotal) || 0)
    if (v.planillaCarga) a.planillas.add(v.planillaCarga)
    agg.set(v.dsFleteroCarga, a)

    const s = aggSku.get(v.idArticulo) ?? { ds: v.dsArticulo ?? `Art ${v.idArticulo}`, bultos: 0, hl: 0 }
    s.bultos += Math.abs(Number(v.cantidadesTotal) || 0)
    s.hl += Math.abs(Number(v.unimedtotal) || 0)
    aggSku.set(v.idArticulo, s)

    const fsk = `${v.dsFleteroCarga}|${v.idArticulo}`
    const fs = aggFleteroSku.get(fsk) ?? {
      fletero: v.dsFleteroCarga, idArt: v.idArticulo,
      ds: v.dsArticulo ?? `Art ${v.idArticulo}`, bultos: 0, hl: 0,
    }
    fs.bultos += Math.abs(Number(v.cantidadesTotal) || 0)
    fs.hl += Math.abs(Number(v.unimedtotal) || 0)
    aggFleteroSku.set(fsk, fs)

    if (v.idCliente != null) {
      const ck = `${v.dsFleteroCarga}|${v.idCliente}`
      const c = aggCliente.get(ck) ?? {
        fletero: v.dsFleteroCarga, idCliente: v.idCliente,
        nombre: v.nombreCliente ?? null,
        bultos: 0, hl: 0, neto: 0, comprobantes: new Set<string>(),
      }
      c.bultos += Math.abs(Number(v.cantidadesTotal) || 0)
      c.hl += Math.abs(Number(v.unimedtotal) || 0)
      c.neto += Math.abs(Number(v.subtotalNeto) || 0)
      c.comprobantes.add(`${v.serie}-${v.nrodoc}`)
      aggCliente.set(ck, c)
    }
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

  // ---- upsert ventas_diarias_sku (detalle por artículo, batch) ----
  if (aggSku.size > 0) {
    const skuRows = [...aggSku.entries()].map(([idArt, s]) => ({
      fecha,
      origen: "chess",
      id_articulo: idArt,
      ds_articulo: s.ds,
      bultos: Math.round(s.bultos * 100) / 100,
      hl: Math.round(s.hl * 10000) / 10000,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from("ventas_diarias_sku")
      .upsert(skuRows, { onConflict: "fecha,origen,id_articulo" })
    if (error) {
      // Tabla nueva (mig 108): si aún no existe en este tenant, no es fatal.
      console.warn(`[sync] ventas_diarias_sku day=${fecha}: ${error.message}`)
    }
  }

  // ---- upsert ventas_diarias_camion_sku (SKU × camión, batch, mig 120) ----
  if (aggFleteroSku.size > 0) {
    const rows = [...aggFleteroSku.values()].map((s) => ({
      fecha,
      origen: "chess",
      ds_fletero_carga: s.fletero,
      id_articulo: s.idArt,
      ds_articulo: s.ds,
      bultos: Math.round(s.bultos * 100) / 100,
      hl: Math.round(s.hl * 10000) / 10000,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from("ventas_diarias_camion_sku")
      .upsert(rows, { onConflict: "fecha,origen,ds_fletero_carga,id_articulo" })
    if (error) {
      // Tabla nueva (mig 120): si aún no existe en este tenant, no es fatal.
      console.warn(`[sync] ventas_diarias_camion_sku day=${fecha}: ${error.message}`)
    }
  }

  // ---- upsert ventas_diarias_cliente (cliente × camión, batch, mig 119) ----
  if (aggCliente.size > 0) {
    const clienteRows = [...aggCliente.values()].map((c) => ({
      fecha,
      origen: "chess",
      ds_fletero_carga: c.fletero,
      patente: c.fletero, // en Chess el fletero ES la patente (ya validada arriba)
      id_cliente: c.idCliente,
      nombre_cliente: c.nombre,
      comprobantes: c.comprobantes.size,
      bultos: Math.round(c.bultos * 100) / 100,
      hl: Math.round(c.hl * 10000) / 10000,
      monto_neto: Math.round(c.neto * 100) / 100,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from("ventas_diarias_cliente")
      .upsert(clienteRows, { onConflict: "fecha,origen,ds_fletero_carga,id_cliente" })
    if (error) {
      // Tabla nueva (mig 119): si aún no existe en este tenant, no es fatal.
      console.warn(`[sync] ventas_diarias_cliente day=${fecha}: ${error.message}`)
    }
  }

  return result
}
