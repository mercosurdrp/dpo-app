/**
 * Generador del CSV de export del dashboard de rechazos.
 *
 * Aplica los mismos filtros del dashboard (request.filters) pero sin drill —
 * el export es del dataset filtrado completo.
 *
 * Hard cap: 50.000 filas. Si la query devuelve más, el handler retorna 413
 * con el total — la UI debe pedirle al usuario que achique el rango o sume
 * filtros. No truncamos silenciosamente: gerencia no debe creer que tiene
 * "todo" cuando le faltan filas.
 *
 * Encoding: UTF-8 con BOM (﻿), separador ; — Excel argentino lo
 * abre nativo sin pasos extra.
 */

import type { SupaClient } from "./comparado"
import type { RechazoCategoria, RechazosFilters } from "@/lib/types/rechazos"

export const EXPORT_MAX_ROWS = 50_000

export interface ExportRequest {
  desde: string
  hasta: string
  filters?: RechazosFilters
}

export type ExportResult =
  | { ok: true; csv: string; total: number; filename: string }
  | { ok: false; total: number; max: number }

/** Columnas del CSV en orden. La key matchea la propiedad del row procesado. */
const COLUMNS: { header: string; key: string }[] = [
  { header: "fecha",              key: "fecha" },
  { header: "chofer",             key: "chofer" },
  { header: "patente",            key: "patente" },
  { header: "vendedor",           key: "vendedor" },
  { header: "cliente_id",         key: "cliente_id" },
  { header: "nombre_cliente",     key: "nombre_cliente" },
  { header: "articulo_id",        key: "articulo_id" },
  { header: "ds_articulo",        key: "ds_articulo" },
  { header: "motivo",             key: "motivo" },
  { header: "categoria",          key: "categoria" },
  { header: "controlable",        key: "controlable" },
  { header: "hl_rechazados",      key: "hl_rechazados" },
  { header: "bultos_rechazados",  key: "bultos_rechazados" },
  { header: "monto_neto",         key: "monto_neto" },
  { header: "monto_bruto",        key: "monto_bruto" },
  { header: "localidad",          key: "localidad" },
  { header: "provincia",          key: "provincia" },
  { header: "canal_mkt",          key: "canal_mkt" },
  { header: "subcanal_mkt",       key: "subcanal_mkt" },
  { header: "segmento_mkt",       key: "segmento_mkt" },
  { header: "supervisor",         key: "supervisor" },
  { header: "planilla_carga",     key: "planilla_carga" },
]

const SELECT = [
  "fecha", "ds_fletero_carga", "ds_vendedor",
  "id_cliente", "nombre_cliente", "id_articulo", "ds_articulo",
  "id_rechazo", "ds_rechazo",
  "hl_rechazados", "bultos_rechazados", "monto_neto", "monto_bruto",
  "ds_localidad", "ds_provincia",
  "ds_canal_mkt", "ds_subcanal_mkt", "ds_segmento_mkt",
  "ds_supervisor", "planilla_carga",
].join(",")

interface RawRow {
  fecha: string
  ds_fletero_carga: string
  ds_vendedor: string | null
  id_cliente: number | null
  nombre_cliente: string | null
  id_articulo: number
  ds_articulo: string | null
  id_rechazo: number
  ds_rechazo: string
  hl_rechazados: number | null
  bultos_rechazados: number
  monto_neto: number | null
  monto_bruto: number | null
  ds_localidad: string | null
  ds_provincia: string | null
  ds_canal_mkt: string | null
  ds_subcanal_mkt: string | null
  ds_segmento_mkt: string | null
  ds_supervisor: string | null
  planilla_carga: string | null
}

interface CatalogoEntry { id_rechazo: number; ds_rechazo: string; categoria: RechazoCategoria; controlable: boolean }

export async function buildRechazosCSV(supa: SupaClient, request: ExportRequest): Promise<ExportResult> {
  const filters = request.filters ?? {}

  // 1. Count primero — si excede, ni intentamos traer las filas
  const total = await loadCount(supa, request, filters)
  if (total > EXPORT_MAX_ROWS) {
    return { ok: false, total, max: EXPORT_MAX_ROWS }
  }

  // 2. Cargar catalogo + mapeo + rows en paralelo
  const [catalogo, mapeo, rows] = await Promise.all([
    loadCatalogo(supa),
    loadMapeo(supa),
    loadRows(supa, request, filters, total),
  ])

  const catalogoMap = new Map(catalogo.map(c => [c.id_rechazo, c]))
  const mapeoMap = new Map(mapeo.map(m => [m.patente, m.chofer_nombre]))

  const csv = renderCSV(rows, catalogoMap, mapeoMap)
  const filename = buildFilename(request.desde, request.hasta)
  return { ok: true, csv, total, filename }
}

async function loadCount(
  supa: SupaClient, request: ExportRequest,
  filters: RechazosFilters,
): Promise<number> {
  let q = supa.from("rechazos").select("id", { count: "exact", head: true })
  q = applyFilters(q, request, filters)
  const { count, error } = await q
  if (error) throw new Error(`rechazos count: ${error.message}`)
  return count ?? 0
}

async function loadRows(
  supa: SupaClient, request: ExportRequest,
  filters: RechazosFilters, total: number,
): Promise<RawRow[]> {
  if (total === 0) return []
  // PostgREST hard limits a 1000 por default — paginamos en chunks.
  const CHUNK = 1000
  const chunks: RawRow[] = []
  for (let off = 0; off < total; off += CHUNK) {
    let q = supa.from("rechazos").select(SELECT)
    q = applyFilters(q, request, filters)
    q = q
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
      .range(off, Math.min(off + CHUNK - 1, total - 1))
    const { data, error } = await q
    if (error) throw new Error(`rechazos page off=${off}: ${error.message}`)
    chunks.push(...((data ?? []) as unknown as RawRow[]))
  }
  return chunks
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, request: ExportRequest, filters: RechazosFilters): any {
  q = q.gte("fecha", request.desde).lte("fecha", request.hasta)
  if (filters.ds_fletero_carga?.length) q = q.in("ds_fletero_carga", filters.ds_fletero_carga)
  if (filters.id_cliente?.length)        q = q.in("id_cliente", filters.id_cliente)
  if (filters.id_rechazo?.length)        q = q.in("id_rechazo", filters.id_rechazo)
  if (filters.id_articulo?.length)       q = q.in("id_articulo", filters.id_articulo)
  if (filters.ds_canal_mkt?.length)      q = q.in("ds_canal_mkt", filters.ds_canal_mkt)
  if (filters.ds_supervisor?.length)     q = q.in("ds_supervisor", filters.ds_supervisor)
  return q
}

async function loadCatalogo(supa: SupaClient): Promise<CatalogoEntry[]> {
  const { data, error } = await supa
    .from("catalogo_rechazos")
    .select("id_rechazo,ds_rechazo,categoria,controlable")
  if (error) throw new Error(`catalogo_rechazos: ${error.message}`)
  return (data ?? []) as CatalogoEntry[]
}

async function loadMapeo(supa: SupaClient): Promise<{ patente: string; chofer_nombre: string | null }[]> {
  const { data, error } = await supa
    .from("mapeo_patente_chofer")
    .select("patente, catalogo_choferes(nombre)")
  if (error) throw new Error(`mapeo_patente_chofer: ${error.message}`)
  type Row = { patente: string; catalogo_choferes: { nombre: string | null } | null }
  return ((data ?? []) as unknown as Row[]).map(r => ({
    patente: r.patente,
    chofer_nombre: r.catalogo_choferes?.nombre ?? null,
  }))
}

function renderCSV(
  rows: RawRow[],
  catalogo: Map<number, CatalogoEntry>,
  mapeo: Map<string, string | null>,
): string {
  // BOM UTF-8 (﻿) primero — Excel-AR lo detecta y abre con encoding correcto
  let out = "﻿"
  out += COLUMNS.map(c => csvCell(c.header)).join(";") + "\r\n"
  for (const r of rows) {
    const cat = catalogo.get(r.id_rechazo)
    const choferNombre = mapeo.get(r.ds_fletero_carga) ?? null
    const record: Record<string, unknown> = {
      fecha:              r.fecha,
      chofer:             choferNombre ?? r.ds_fletero_carga, // COALESCE
      patente:            r.ds_fletero_carga,
      vendedor:           r.ds_vendedor ?? "",
      cliente_id:         r.id_cliente ?? "",
      nombre_cliente:     r.nombre_cliente ?? "",
      articulo_id:        r.id_articulo,
      ds_articulo:        r.ds_articulo ?? "",
      motivo:             cat?.ds_rechazo ?? r.ds_rechazo,
      categoria:          cat?.categoria ?? "",
      controlable:        cat?.controlable == null ? "" : (cat.controlable ? "Si" : "No"),
      hl_rechazados:      r.hl_rechazados != null ? formatNumberAr(r.hl_rechazados) : "",
      bultos_rechazados:  formatNumberAr(r.bultos_rechazados),
      monto_neto:         r.monto_neto != null ? formatNumberAr(r.monto_neto) : "",
      monto_bruto:        r.monto_bruto != null ? formatNumberAr(r.monto_bruto) : "",
      localidad:          r.ds_localidad ?? "",
      provincia:          r.ds_provincia ?? "",
      canal_mkt:          r.ds_canal_mkt ?? "",
      subcanal_mkt:       r.ds_subcanal_mkt ?? "",
      segmento_mkt:       r.ds_segmento_mkt ?? "",
      supervisor:         r.ds_supervisor ?? "",
      planilla_carga:     r.planilla_carga ?? "",
    }
    out += COLUMNS.map(c => csvCell(record[c.key])).join(";") + "\r\n"
  }
  return out
}

/** Escape para CSV con separador `;` — envuelve en comillas si tiene `;`, `"`, salto de línea. */
function csvCell(v: unknown): string {
  if (v == null) return ""
  const s = String(v)
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Formato numérico es-AR: coma decimal, sin separador de miles (Excel los aplica). */
function formatNumberAr(v: number): string {
  if (!Number.isFinite(v)) return ""
  // Hasta 4 decimales (bultos pueden ser 0.25; montos suelen tener 2-3 decimales)
  const fixed = Math.round(v * 10000) / 10000
  return String(fixed).replace(".", ",")
}

function buildFilename(desde: string, hasta: string): string {
  const now = new Date()
  const dPart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now).replace(/-/g, "")
  const tPart = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now).replace(":", "")
  return `rechazos-pampeana-${desde}_${hasta}-export-${dPart}-${tPart}.csv`
}
