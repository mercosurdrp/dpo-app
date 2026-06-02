/**
 * Sync de Ocupación de Bodega (CEq).
 *
 * Dos operaciones que el cron de rechazos invoca:
 *   - syncChessArticulos: paginа /articulos/ y upsertea en chess_articulos.
 *     Se ejecuta una vez al día (skip si fue corrida hace < 20 hs).
 *   - recalcOcupacionBodegaDia: para una fecha dada, descarga /ventas detallado,
 *     calcula CEq por (patente) y upsertea en ocupacion_bodega_diaria.
 *
 * También expone updateIndicadorOB que recalcula el indicador (AVG CEq MTD del
 * mes en curso) y lo persiste en la tabla `indicadores`.
 */
import { chessLogin, type ChessCredentials } from "./rechazos-sync"
import type { SupabaseClient } from "@supabase/supabase-js"

// La pregunta 1.2 EN RUTA tiene key estable '5_1_23_74' en master_seed.
const PREGUNTA_KEY_1_2 = "5_1_23_74"
const INDICADOR_NOMBRE = "Ocupación de Bodega (OB)"
const TARGET_CEQ = 525

// ---------- helpers ----------

function chessFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init)
}

function isPatenteValida(s: string | null | undefined): boolean {
  if (!s) return false
  return /^[A-Z]{2,3}[0-9]{3,4}[A-Z]{0,2}$/i.test(s.trim()) || /^[A-Z0-9]{6,9}$/i.test(s.trim())
}

// ---------- 1) maestro chess_articulos ----------

interface ChessArticulo {
  idArticulo: number
  desArticulo: string | null
  desCortaArticulo: string | null
  bultosPallet: number | null
  unidadesBulto: number | null
  valorUnidadMedida: number | null
  pesoBulto: number | null
  desUnidadMedida: string | null
  anulado: boolean
}

export async function syncChessArticulos(
  supabase: SupabaseClient,
  creds: ChessCredentials,
  sessionId: string,
  { force = false }: { force?: boolean } = {},
): Promise<{ skipped: boolean; total: number; conBp: number; reason?: string }> {
  if (!force) {
    const { data: anySync } = await supabase
      .from("chess_articulos")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anySync?.last_synced_at) {
      const last = new Date(anySync.last_synced_at)
      const hours = (Date.now() - last.getTime()) / 3600_000
      if (hours < 20) {
        return { skipped: true, total: 0, conBp: 0, reason: `last_sync_hace=${hours.toFixed(1)}h` }
      }
    }
  }

  function findArr(o: unknown, d = 0): unknown[] | null {
    if (d > 5 || !o) return null
    if (Array.isArray(o) && o.length && typeof o[0] === "object" && o[0] !== null && "idArticulo" in (o[0] as object)) return o
    if (typeof o === "object" && o !== null) {
      for (const v of Object.values(o)) { const f = findArr(v, d + 1); if (f) return f }
    }
    return null
  }

  // Chess pagina y a veces devuelve el mismo idArticulo en lotes distintos
  // (versiones, alias). Deduplicamos en memoria por idArticulo antes de
  // upsertear — quedan los datos del lote más reciente.
  const dedup = new Map<number, ChessArticulo>()
  let page = 0
  let total = 0

  while (page < 200) {
    const r = await chessFetch(`${creds.baseUrl}/articulos/?nroLote=${page}`, {
      headers: { Cookie: sessionId, Accept: "application/json" },
    })
    if (!r.ok) break
    const j = (await r.json()) as unknown
    const arr = findArr(j) as ChessArticulo[] | null
    if (!arr || arr.length === 0) break
    for (const a of arr) {
      total++
      dedup.set(a.idArticulo, a)
    }
    page++
  }

  const rows = [...dedup.values()].map(a => ({
    id_articulo: a.idArticulo,
    des_articulo: a.desArticulo,
    des_corta: a.desCortaArticulo,
    bultos_pallet: a.bultosPallet && a.bultosPallet > 0 ? a.bultosPallet : null,
    unidades_bulto: a.unidadesBulto,
    valor_unidad_medida: a.valorUnidadMedida,
    peso_bulto: a.pesoBulto,
    des_unidad_medida: a.desUnidadMedida,
    anulado: a.anulado,
    last_synced_at: new Date().toISOString(),
  }))
  const conBp = rows.filter(r => r.bultos_pallet !== null).length

  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase
      .from("chess_articulos")
      .upsert(rows.slice(i, i + batchSize), { onConflict: "id_articulo" })
    if (error) console.error(`[OB] upsert chess_articulos: ${error.message}`)
  }

  return { skipped: false, total, conBp }
}

// ---------- 2) OB diaria ----------

interface VentaLinea {
  idDocumento?: string
  dsFleteroCarga?: string | null
  idArticulo?: number
  cantidadesTotal?: number | null
  unimedtotal?: number | null
}

async function fetchVentasDia(creds: ChessCredentials, sessionId: string, fecha: string): Promise<VentaLinea[]> {
  const r = await chessFetch(`${creds.baseUrl}/ventas/?fechaDesde=${fecha}&fechaHasta=${fecha}&detallado=true`, {
    headers: { Cookie: sessionId, Accept: "application/json" },
  })
  if (!r.ok) return []
  let d: { dsReporteComprobantesApi?: { VentasResumen?: unknown } }
  try { d = (await r.json()) as typeof d } catch { return [] }
  const res = d?.dsReporteComprobantesApi?.VentasResumen
  return Array.isArray(res) ? (res as VentaLinea[]) : []
}

export async function recalcOcupacionBodegaDia(
  supabase: SupabaseClient,
  creds: ChessCredentials,
  sessionId: string,
  fecha: string,
): Promise<{ fecha: string; viajes: number; ceqTotal: number; lineas: number; skipNoBp: number }> {
  // 1) Cargar maestro (idArticulo → bultos_pallet) desde la tabla local.
  //    PostgREST tope a 1000 filas: paginamos con .range() hasta agotar.
  const bp = new Map<number, number>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data: rows, error: errM } = await supabase
      .from("chess_articulos")
      .select("id_articulo, bultos_pallet")
      .not("bultos_pallet", "is", null)
      .order("id_articulo", { ascending: true })
      .range(from, from + PAGE - 1)
    if (errM) { console.error(`[OB] read maestro: ${errM.message}`); break }
    if (!rows || rows.length === 0) break
    for (const r of rows) {
      if (r.bultos_pallet && r.bultos_pallet > 0) bp.set(r.id_articulo, r.bultos_pallet)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }

  // 2) Bajar /ventas del día
  const lineas = await fetchVentasDia(creds, sessionId, fecha)

  // 3) Agregar por patente
  const agg = new Map<string, { ceq: number; bultos: number; hl: number; lineas: number; skus: Set<number> }>()
  let skipNoBp = 0
  for (const v of lineas) {
    if (v.idDocumento !== "FCVTA") continue
    if (!isPatenteValida(v.dsFleteroCarga ?? null)) continue
    const idArt = Number(v.idArticulo)
    const bpa = bp.get(idArt)
    if (!bpa) { skipNoBp++; continue }
    const bultos = Math.abs(Number(v.cantidadesTotal) || 0)
    if (bultos === 0) continue
    const ceq = (120 / bpa) * bultos
    const patente = (v.dsFleteroCarga as string).trim().toUpperCase()
    const slot = agg.get(patente) ?? { ceq: 0, bultos: 0, hl: 0, lineas: 0, skus: new Set<number>() }
    slot.ceq += ceq
    slot.bultos += bultos
    slot.hl += Math.abs(Number(v.unimedtotal) || 0)
    slot.lineas += 1
    slot.skus.add(idArt)
    agg.set(patente, slot)
  }

  // 4) Upsert en ocupacion_bodega_diaria
  let ceqTotal = 0
  const rows = [...agg.entries()].map(([patente, d]) => {
    ceqTotal += d.ceq
    return {
      fecha,
      patente,
      ceq_total: Math.round(d.ceq * 100) / 100,
      bultos_total: Math.round(d.bultos * 100) / 100,
      hl_total: Math.round(d.hl * 10000) / 10000,
      lineas: d.lineas,
      skus_distintos: d.skus.size,
    }
  })
  if (rows.length > 0) {
    const { error } = await supabase.from("ocupacion_bodega_diaria").upsert(rows, { onConflict: "fecha,patente" })
    if (error) console.error(`[OB] upsert ob_diaria ${fecha}: ${error.message}`)
  }

  return { fecha, viajes: rows.length, ceqTotal, lineas: lineas.length, skipNoBp }
}

// ---------- 3) update indicador AVG MTD ----------

export async function updateIndicadorOB(supabase: SupabaseClient): Promise<{ updated: boolean; avg: number; viajes: number }> {
  // Buscar el indicador (vinculado al punto del manual con key estable)
  const { data: preg } = await supabase
    .from("preguntas")
    .select("id")
    .eq("key", PREGUNTA_KEY_1_2)
    .maybeSingle()
  if (!preg) return { updated: false, avg: 0, viajes: 0 }
  const { data: ind } = await supabase
    .from("indicadores")
    .select("id")
    .eq("pregunta_id", preg.id)
    .eq("nombre", INDICADOR_NOMBRE)
    .maybeSingle()
  if (!ind) return { updated: false, avg: 0, viajes: 0 }

  // AVG CEq por viaje MTD
  const hoy = new Date()
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  const { data: viajes } = await supabase
    .from("ocupacion_bodega_diaria")
    .select("ceq_total")
    .gte("fecha", desde)
    .gt("ceq_total", 0)
  const arr = (viajes ?? []) as { ceq_total: number }[]
  if (arr.length === 0) return { updated: false, avg: 0, viajes: 0 }
  const avg = arr.reduce((acc, r) => acc + Number(r.ceq_total), 0) / arr.length
  const avgRounded = Math.round(avg * 10) / 10

  const { error } = await supabase.from("indicadores").update({
    actual: avgRounded,
    unidad: "CEq",
    meta: TARGET_CEQ,
    notas: `Promedio CEq por viaje del mes (${arr.length} viajes). Target ${TARGET_CEQ} CEq por camión. Fórmula: CEq = 120/bultosPallet × cantidadesTotal por línea, agrupado por (patente, fecha).`,
    updated_at: new Date().toISOString(),
  }).eq("id", ind.id)
  if (error) {
    console.error(`[OB] update indicador: ${error.message}`)
    return { updated: false, avg: avgRounded, viajes: arr.length }
  }
  return { updated: true, avg: avgRounded, viajes: arr.length }
}
