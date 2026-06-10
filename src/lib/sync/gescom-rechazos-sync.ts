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
 *   - Numerador (rechazos)  = comprobantes `DEV-RE` (devolución por rechazo). Una fila por item.
 *   - Denominador (ventas)  = comprobantes `VEN`, agrupados por día bajo ds_fletero_carga='GESTION'.
 *   - HL = cantidad × unidadFactor / unidades_bulto × valor_unidad_medida (maestro chess_articulos).
 *   - id_cliente = codigoCliente sin prefijo "200" (normalizarCodigoCliente).
 *   - motivo = 9000 / "Devolución Gestión" (GESCOM no trae motivo desagregado).
 *   - Una nota de débito `DEB` que referencia un `DEV-RE` lo REVIERTE → ese DEV-RE se excluye.
 *   - AJU-MAS/AJU-MEN (ajustes de stock) y DEV-CA (canje) se ignoran.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type GescomCredentials, type GescomVenta, type GescomItem,
  gescomLogin, fetchVentasRecientes, fetchVentasPorRango, normalizarCodigoCliente,
} from "@/lib/gescom/client"

export const GESCOM_FLETERO = "GESTION"
export const GESCOM_ID_RECHAZO = 9000
// GESCOM no trae motivo desagregado en sus DEV-RE → "Sin motivo" (también sirve para
// identificar de un vistazo que el rechazo proviene del sistema Gestión).
export const GESCOM_DS_RECHAZO = "Sin motivo"

export interface GescomSyncResult {
  desde: string
  hasta: string
  modo: "recientes" | "full"
  ventas_consideradas: number
  rechazos_upserted: number
  ventas_diarias_upserted: number
  dev_re_revertidos: number
  errors: Array<{ kind: "rechazo" | "ventas_diarias" | "fatal"; message: string }>
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
    ventas_consideradas: 0, rechazos_upserted: 0, ventas_diarias_upserted: 0,
    dev_re_revertidos: 0, errors: [],
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
  result.ventas_consideradas = ventas.length

  const [factores, nombres] = await Promise.all([
    loadArticulosFactores(supabase),
    loadNombresClientes(supabase),
  ])

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
        ds_fletero_carga: GESCOM_FLETERO,
        id_rechazo: GESCOM_ID_RECHAZO,
        ds_rechazo: GESCOM_DS_RECHAZO,
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

  // ---- denominador: ventas VEN agrupadas por día (ds_fletero_carga = 'GESTION') ----
  type Agg = { bultos: number; hl: number; comprobantes: number }
  const porDia = new Map<string, Agg>()
  for (const v of ventas) {
    if (v.codigoTipoVenta !== "VEN" || v.esCredito || !esFinalizada(v)) continue
    const fecha = diaDe(v)
    if (!fecha) continue
    const a = porDia.get(fecha) ?? { bultos: 0, hl: 0, comprobantes: 0 }
    for (const item of v.items ?? []) {
      const { bultos, hl } = bultosYHlDeItem(item, factores)
      a.bultos += bultos
      a.hl += hl
    }
    a.comprobantes++
    porDia.set(fecha, a)
  }
  for (const [fecha, a] of porDia) {
    const { error } = await supabase.from("ventas_diarias").upsert({
      origen: "gestion",
      fecha,
      ds_fletero_carga: GESCOM_FLETERO,
      total_bultos: Math.round(a.bultos * 100) / 100,
      total_unidades: 0,
      total_hl: Math.round(a.hl * 10000) / 10000,
      viajes: a.comprobantes,
    }, { onConflict: "fecha,ds_fletero_carga,origen" })
    if (error) result.errors.push({ kind: "ventas_diarias", message: error.message })
    else result.ventas_diarias_upserted++
  }

  return result
}
