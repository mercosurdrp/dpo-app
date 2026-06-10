/**
 * Sync de rechazos/ventas de GESCOM (sistema "Gestión") → mismas tablas que Chess,
 * con `origen='gestion'`. Es el lado Gestión de la unificación del indicador de rechazos
 * (ver src/lib/sync/rechazos-sync.ts para el lado Chess).
 *
 * A diferencia de Chess (que pide día a día), GESCOM se trae por rango en una pasada:
 *   - sync diario → `fetchVentasRecientes` (últimas N páginas; la API no filtra por fecha)
 *   - backfill    → `fetchVentasPorRango` (recorre todo el histórico)
 *
 * Mapeo a las tablas `rechazos` / `ventas_diarias`:
 *   - SOLO empresa 98 (= Gestión Pampeana, clientes 200xxx). La API mezcla también la
 *     empresa 99 (clientes 100xxx, vendedor 100100, OTRA operación) y las 1/2 (marginales):
 *     se EXCLUYEN todas (definición de negocio 2026-06-10).
 *   - Numerador (rechazos)  = comprobantes `DEV-RE` (devolución por rechazo). Una fila por item.
 *   - Denominador (ventas)  = comprobantes `VEN`, agrupados por día bajo ds_fletero_carga='GESTION'.
 *   - HL = cantidad × unidadFactor / unidades_bulto × valor_unidad_medida (maestro chess_articulos).
 *   - id_cliente = codigoCliente sin prefijo "200" (normalizarCodigoCliente).
 *   - motivo = el real de GESCOM mapeado por texto al `catalogo_rechazos` de Chess (GESCOM
 *     trunca a 20 chars → match por prefijo sin acentos). Sin match o null → 9000 "Sin motivo".
 *   - Motivos ADMINISTRATIVOS excluidos (espeja la exclusión PRDVO de Chess):
 *     MAL FACTURADO y DEV X TRAMITES INTERNOS — son correcciones, no rechazo de reparto.
 *   - Una nota de débito `DEB` que referencia un `DEV-RE` lo REVIERTE → ese DEV-RE se excluye.
 *   - AJU-MAS/AJU-MEN (ajustes de stock) y DEV-CA (canje) se ignoran.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type GescomCredentials, type GescomVenta, type GescomItem,
  gescomLogin, fetchVentasRecientes, fetchVentasPorRango, normalizarCodigoCliente,
} from "@/lib/gescom/client"

export const GESCOM_FLETERO = "GESTION"
export const GESCOM_EMPRESA = "98"          // Gestión Pampeana; 99/1/2 = otras operaciones
export const GESCOM_ID_RECHAZO = 9000       // fallback "Sin motivo" cuando GESCOM no trae motivo
export const GESCOM_DS_RECHAZO = "Sin motivo"
// Motivos administrativos excluidos del indicador (espejan la exclusión PRDVO de Chess).
const MOTIVOS_EXCLUIDOS = ["MAL FACTURADO", "DEV X TRAMITES"]

export interface GescomSyncResult {
  desde: string
  hasta: string
  modo: "recientes" | "full"
  ventas_consideradas: number
  excluidas_otra_empresa: number
  excluidas_venta_directa: number
  rechazos_upserted: number
  rechazos_excluidos_admin: number
  ventas_diarias_upserted: number
  dev_re_revertidos: number
  errors: Array<{ kind: "rechazo" | "ventas_diarias" | "fatal"; message: string }>
}

/** Sin acentos, mayúsculas, sin espacios extremos — para matchear motivos GESCOM↔catálogo. */
function normTexto(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

interface ArticuloFactor {
  unidadesBulto: number
  hlPorBulto: number          // valor_unidad_medida = HL por bulto
  desCorta: string | null
}

/** Maestro de artículos Chess (idArticulo → factores) para convertir unidades a HL/bultos. */
async function loadArticulosFactores(supabase: SupabaseClient): Promise<Map<number, ArticuloFactor>> {
  const out = new Map<number, ArticuloFactor>()
  const { data, error } = await supabase
    .from("chess_articulos")
    .select("id_articulo, unidades_bulto, valor_unidad_medida, des_corta")
  if (error) { console.warn(`[gescom-sync] chess_articulos no disponible: ${error.message}`); return out }
  for (const r of (data ?? []) as Array<{
    id_articulo: number; unidades_bulto: number | null
    valor_unidad_medida: number | string | null; des_corta: string | null
  }>) {
    out.set(r.id_articulo, {
      unidadesBulto: Number(r.unidades_bulto) || 0,
      hlPorBulto: Number(r.valor_unidad_medida) || 0,
      desCorta: r.des_corta,
    })
  }
  return out
}

/** Nombres de cliente (id_cliente Chess → nombre) desde el cache de clientes. */
async function loadNombresClientes(supabase: SupabaseClient): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const { data, error } = await supabase
    .from("bot_clientes_cache")
    .select("id_cliente, nombre_cliente")
  if (error) { console.warn(`[gescom-sync] bot_clientes_cache no disponible: ${error.message}`); return out }
  for (const r of (data ?? []) as Array<{ id_cliente: string; nombre_cliente: string | null }>) {
    const id = Number(r.id_cliente)
    if (Number.isFinite(id) && r.nombre_cliente) out.set(id, r.nombre_cliente)
  }
  return out
}

/** Códigos de chofer GESCOM marcados como venta directa (no reparto) → se obvian del indicador. */
async function loadVentasDirectas(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("mapeo_chofer_gescom")
    .select("codigo")
    .eq("venta_directa", true)
  if (error) { console.warn(`[gescom-sync] mapeo_chofer_gescom no disponible: ${error.message}`); return new Set() }
  return new Set(((data ?? []) as Array<{ codigo: string }>).map((r) => r.codigo.trim()))
}

interface CatalogoMotivo {
  id_rechazo: number
  ds_rechazo: string
  dsNorm: string
}

/** Catálogo de motivos Chess para mapear el motivo textual de GESCOM. */
async function loadCatalogoMotivos(supabase: SupabaseClient): Promise<CatalogoMotivo[]> {
  const { data, error } = await supabase
    .from("catalogo_rechazos")
    .select("id_rechazo, ds_rechazo")
  if (error) { console.warn(`[gescom-sync] catalogo_rechazos no disponible: ${error.message}`); return [] }
  return ((data ?? []) as Array<{ id_rechazo: number; ds_rechazo: string }>)
    .filter((c) => c.id_rechazo !== GESCOM_ID_RECHAZO)
    .map((c) => ({ ...c, dsNorm: normTexto(c.ds_rechazo) }))
}

/** bultos = cantidad × unidadFactor / unidades_bulto ; HL = bultos × valor_unidad_medida. */
function bultosYHlDeItem(item: GescomItem, factores: Map<number, ArticuloFactor>): { bultos: number; hl: number } {
  const idArt = Number(item.codigoItem)
  const f = factores.get(idArt)
  const cantidad = Math.abs(Number(item.cantidad) || 0)
  const factor = Math.abs(Number(item.unidadFactor) || 0)
  if (!f || !f.unidadesBulto) return { bultos: 0, hl: 0 }
  const bultos = (cantidad * factor) / f.unidadesBulto
  return { bultos, hl: bultos * f.hlPorBulto }
}

function diaDe(v: GescomVenta): string {
  return (v.fechaEntrega ?? "").slice(0, 10)
}

/**
 * Etiqueta de fletero para Gestión: "GESTION-<codigoChofer>" (clave ESTABLE; el nombre
 * del chofer se resuelve en lectura desde mapeo_chofer_gescom, sin re-sync).
 */
function fleteroDe(v: GescomVenta): string {
  const c = (v.codigoChofer ?? "").trim()
  return c ? `${GESCOM_FLETERO}-${c}` : GESCOM_FLETERO
}

const esFinalizada = (v: GescomVenta) => v.estado === "Finalizada"

export interface GescomSyncDeps {
  supabase: SupabaseClient
  creds: GescomCredentials
  desde: string                       // "YYYY-MM-DD" (inclusive)
  hasta: string                       // "YYYY-MM-DD" (inclusive)
  modo?: "recientes" | "full"         // recientes = sync diario; full = backfill
  paginas?: number                    // ventana de últimas páginas (modo recientes)
}

export async function syncGescomRechazos(deps: GescomSyncDeps): Promise<GescomSyncResult> {
  const { supabase, creds, desde, hasta } = deps
  const modo = deps.modo ?? "recientes"
  const result: GescomSyncResult = {
    desde, hasta, modo,
    ventas_consideradas: 0, excluidas_otra_empresa: 0, excluidas_venta_directa: 0,
    rechazos_upserted: 0, rechazos_excluidos_admin: 0,
    ventas_diarias_upserted: 0, dev_re_revertidos: 0, errors: [],
  }

  let ventas: GescomVenta[]
  try {
    const token = await gescomLogin(creds)
    ventas = modo === "full"
      ? await fetchVentasPorRango(creds, token, desde, hasta)
      : await fetchVentasRecientes(creds, token, desde, hasta, deps.paginas ?? 25)
  } catch (e) {
    result.errors.push({ kind: "fatal", message: e instanceof Error ? e.message : String(e) })
    return result
  }

  // Solo Gestión Pampeana: la API mezcla otras empresas (99 = otra operación, 1/2 marginales).
  const totalCrudo = ventas.length
  ventas = ventas.filter((v) => String(v.codigoEmpresa) === GESCOM_EMPRESA)
  result.excluidas_otra_empresa = totalCrudo - ventas.length
  result.ventas_consideradas = ventas.length

  const [factores, nombres, catalogo, ventasDirectas] = await Promise.all([
    loadArticulosFactores(supabase),
    loadNombresClientes(supabase),
    loadCatalogoMotivos(supabase),
    loadVentasDirectas(supabase),
  ])

  // Ventas directas (no reparto): se obvian por completo — ni denominador ni rechazos.
  const antesDirectas = ventas.length
  ventas = ventas.filter((v) => !ventasDirectas.has((v.codigoChofer ?? "").trim()))
  result.excluidas_venta_directa = antesDirectas - ventas.length

  // Motivo GESCOM (posiblemente truncado a 20 chars) → entrada del catálogo Chess.
  const mapMotivo = (motivo: string | null): { id: number; ds: string } | "excluir" => {
    if (!motivo) return { id: GESCOM_ID_RECHAZO, ds: GESCOM_DS_RECHAZO }
    const m = normTexto(motivo)
    if (MOTIVOS_EXCLUIDOS.some((x) => m.startsWith(x))) return "excluir"
    const hit = catalogo.find((c) => c.dsNorm === m || c.dsNorm.startsWith(m))
    return hit ? { id: hit.id_rechazo, ds: hit.ds_rechazo } : { id: GESCOM_ID_RECHAZO, ds: GESCOM_DS_RECHAZO }
  }

  // DEV-RE revertidos por una nota de débito que los referencia.
  const revertidos = new Set<number>()
  for (const v of ventas) {
    if (v.codigoTipoVenta === "DEB" && v.ventaReferenciada?.id != null) {
      revertidos.add(v.ventaReferenciada.id)
    }
  }

  // ---- numerador: rechazos (DEV-RE, no revertidos) ----
  const devRe = ventas.filter(
    (v) => v.codigoTipoVenta === "DEV-RE" && esFinalizada(v) && !revertidos.has(v.id),
  )
  result.dev_re_revertidos = ventas.filter(
    (v) => v.codigoTipoVenta === "DEV-RE" && revertidos.has(v.id),
  ).length

  for (const v of devRe) {
    const fecha = diaDe(v)
    if (!fecha) continue
    const motivo = mapMotivo(v.motivo)
    if (motivo === "excluir") { result.rechazos_excluidos_admin++; continue }
    const idCliente = normalizarCodigoCliente(v.codigoCliente)
    const nombreCliente = idCliente != null ? (nombres.get(idCliente) ?? null) : null

    for (const item of v.items ?? []) {
      const idArt = Number(item.codigoItem)
      if (!Number.isFinite(idArt)) continue
      const { bultos, hl } = bultosYHlDeItem(item, factores)
      const row = {
        origen: "gestion",
        fecha,
        fecha_venta: fecha,            // GESCOM no expone la fecha de la venta original; sin desfasaje relevante
        serie: 0,
        nrodoc: v.id,                  // id global único del comprobante GESCOM
        id_articulo: idArt,
        ds_articulo: factores.get(idArt)?.desCorta ?? `Art ${idArt}`,  // NOT NULL: fallback si el SKU no está en el maestro Chess
        id_fletero_carga: null,
        ds_fletero_carga: fleteroDe(v),
        id_rechazo: motivo.id,
        ds_rechazo: motivo.ds,
        bultos_rechazados: Math.round(bultos * 100) / 100,
        hl_rechazados: Math.round(hl * 10000) / 10000,
        id_cliente: idCliente,
        nombre_cliente: nombreCliente,
        monto_neto: item.importeNeto == null ? null : Math.abs(Number(item.importeNeto) || 0),
        id_documento: "DEV-RE",
      }
      const { error } = await supabase
        .from("rechazos")
        .upsert(row, { onConflict: "origen,serie,nrodoc,id_articulo" })
      if (error) result.errors.push({ kind: "rechazo", message: error.message })
      else result.rechazos_upserted++
    }
  }

  // ---- denominador: ventas VEN agrupadas por día y chofer (ds_fletero_carga = 'GESTION-<cod>') ----
  type Agg = { bultos: number; hl: number; comprobantes: number }
  const porDiaFletero = new Map<string, Agg>()          // key "fecha|fletero"
  // Detalle por SKU/día (drill-down de "Bultos vendidos" en reuniones, mig 110)
  type AggSku = { bultos: number; hl: number }
  const porDiaSku = new Map<string, Map<number, AggSku>>()
  for (const v of ventas) {
    if (v.codigoTipoVenta !== "VEN" || v.esCredito || !esFinalizada(v)) continue
    const fecha = diaDe(v)
    if (!fecha) continue
    const key = `${fecha}|${fleteroDe(v)}`
    const a = porDiaFletero.get(key) ?? { bultos: 0, hl: 0, comprobantes: 0 }
    const skus = porDiaSku.get(fecha) ?? new Map<number, AggSku>()
    for (const item of v.items ?? []) {
      const { bultos, hl } = bultosYHlDeItem(item, factores)
      a.bultos += bultos
      a.hl += hl
      const idArt = Number(item.codigoItem)
      if (Number.isFinite(idArt)) {
        const s = skus.get(idArt) ?? { bultos: 0, hl: 0 }
        s.bultos += bultos
        s.hl += hl
        skus.set(idArt, s)
      }
    }
    a.comprobantes++
    porDiaFletero.set(key, a)
    porDiaSku.set(fecha, skus)
  }
  for (const [key, a] of porDiaFletero) {
    const [fecha, fletero] = key.split("|")
    const { error } = await supabase.from("ventas_diarias").upsert({
      origen: "gestion",
      fecha,
      ds_fletero_carga: fletero,
      total_bultos: Math.round(a.bultos * 100) / 100,
      total_unidades: 0,
      total_hl: Math.round(a.hl * 10000) / 10000,
      viajes: a.comprobantes,
    }, { onConflict: "fecha,ds_fletero_carga,origen" })
    if (error) result.errors.push({ kind: "ventas_diarias", message: error.message })
    else result.ventas_diarias_upserted++
  }

  // ---- ventas_diarias_sku: detalle por artículo/día (batch por fecha) ----
  for (const [fecha, skus] of porDiaSku) {
    if (skus.size === 0) continue
    const skuRows = [...skus.entries()].map(([idArt, s]) => ({
      fecha,
      origen: "gestion",
      id_articulo: idArt,
      ds_articulo: factores.get(idArt)?.desCorta ?? `Art ${idArt}`,
      bultos: Math.round(s.bultos * 100) / 100,
      hl: Math.round(s.hl * 10000) / 10000,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from("ventas_diarias_sku")
      .upsert(skuRows, { onConflict: "fecha,origen,id_articulo" })
    if (error) console.warn(`[gescom-sync] ventas_diarias_sku ${fecha}: ${error.message}`)
  }

  return result
}
