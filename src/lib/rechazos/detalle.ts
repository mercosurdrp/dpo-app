/**
 * Lógica del drill-down de rechazos (rows individuales).
 * Pura: recibe el cliente Supabase como parámetro, sin tocar cookies().
 * El server action en `src/actions/rechazos-detalle.ts` la wrappea.
 */
import type { SupaClient } from "./comparado"
import type {
  RechazoCategoria,
  RechazosDetalleRequest,
  RechazosDetalleResponse,
  RechazosDetalleRow,
} from "@/lib/types/rechazos"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000

interface RawRechazoRow {
  id: string
  fecha: string
  fecha_venta: string
  ds_fletero_carga: string
  id_rechazo: number
  ds_rechazo: string
  id_cliente: number | null
  nombre_cliente: string | null
  id_articulo: number
  ds_articulo: string | null
  hl_rechazados: number | null
  bultos_rechazados: number
  monto_neto: number | null
  monto_bruto: number | null
  ds_localidad: string | null
  ds_canal_mkt: string | null
  ds_supervisor: string | null
  id_documento: string | null
  fecha_pedido: string | null
}

export async function getRechazosDetalle(
  supa: SupaClient,
  request: RechazosDetalleRequest,
): Promise<RechazosDetalleResponse> {
  const offset = Math.max(0, request.offset ?? 0)
  const limit = Math.min(MAX_LIMIT, Math.max(1, request.limit ?? DEFAULT_LIMIT))
  const filters = request.filters ?? {}

  // Cargamos catalogo + mapeo en paralelo al armado de la query principal
  const [catalogo, mapeo, page, total] = await Promise.all([
    loadCatalogoMin(supa),
    loadMapeoMin(supa),
    loadPage(supa, request, filters, offset, limit),
    loadCount(supa, request, filters),
  ])

  const catalogoMap = new Map(catalogo.map(c => [c.id_rechazo, c]))
  const mapeoMap = new Map(mapeo.map(m => [m.patente, m.chofer_nombre]))

  const rows: RechazosDetalleRow[] = page.map(r => {
    const cat = catalogoMap.get(r.id_rechazo)
    const chofer_nombre = mapeoMap.get(r.ds_fletero_carga) ?? null
    return {
      id: r.id,
      fecha: r.fecha,
      fecha_venta: r.fecha_venta,
      patente: r.ds_fletero_carga,
      chofer_display: chofer_nombre ?? r.ds_fletero_carga,
      id_rechazo: r.id_rechazo,
      ds_rechazo: cat?.ds_rechazo ?? r.ds_rechazo,
      categoria: cat?.categoria ?? "POR_CLASIFICAR",
      controlable: cat?.controlable ?? false,
      id_cliente: r.id_cliente,
      nombre_cliente: r.nombre_cliente,
      id_articulo: r.id_articulo,
      ds_articulo: r.ds_articulo ?? "(sin descripción)",
      hl_rechazados: Number(r.hl_rechazados ?? 0),
      bultos_rechazados: Number(r.bultos_rechazados ?? 0),
      monto_neto: r.monto_neto != null ? Number(r.monto_neto) : null,
      monto_bruto: r.monto_bruto != null ? Number(r.monto_bruto) : null,
      ds_localidad: r.ds_localidad,
      ds_canal_mkt: r.ds_canal_mkt,
      ds_supervisor: r.ds_supervisor,
      id_documento: r.id_documento,
      fecha_pedido: r.fecha_pedido,
    }
  })

  return { rows, total, offset, limit }
}

async function loadPage(
  supa: SupaClient, request: RechazosDetalleRequest,
  filters: NonNullable<RechazosDetalleRequest["filters"]>, offset: number, limit: number,
): Promise<RawRechazoRow[]> {
  let q = supa.from("rechazos").select(
    "id,fecha,fecha_venta,ds_fletero_carga,id_rechazo,ds_rechazo,id_cliente,nombre_cliente,id_articulo,ds_articulo,hl_rechazados,bultos_rechazados,monto_neto,monto_bruto,ds_localidad,ds_canal_mkt,ds_supervisor,id_documento,fecha_pedido"
  )
  q = applyFilters(q, request, filters)
  // Orden: por monto_neto desc (más impacto primero), tiebreak por fecha_venta desc + id
  q = q
    .order("monto_neto", { ascending: false, nullsFirst: false })
    .order("fecha_venta", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1)
  const { data, error } = await q
  if (error) throw new Error(`rechazos detalle: ${error.message}`)
  return (data ?? []) as RawRechazoRow[]
}

async function loadCount(
  supa: SupaClient, request: RechazosDetalleRequest,
  filters: NonNullable<RechazosDetalleRequest["filters"]>,
): Promise<number> {
  let q = supa.from("rechazos").select("id", { count: "exact", head: true })
  q = applyFilters(q, request, filters)
  const { count, error } = await q
  if (error) throw new Error(`rechazos detalle count: ${error.message}`)
  return count ?? 0
}

type Query = ReturnType<SupaClient["from"]> extends infer T ? T : never
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, request: RechazosDetalleRequest, filters: NonNullable<RechazosDetalleRequest["filters"]>): any {
  q = q.gte("fecha_venta", request.desde).lte("fecha_venta", request.hasta)
  if (filters.ds_fletero_carga?.length) q = q.in("ds_fletero_carga", filters.ds_fletero_carga)
  if (filters.id_cliente?.length)        q = q.in("id_cliente", filters.id_cliente)
  if (filters.id_rechazo?.length)        q = q.in("id_rechazo", filters.id_rechazo)
  if (filters.id_articulo?.length)       q = q.in("id_articulo", filters.id_articulo)
  if (filters.ds_canal_mkt?.length)      q = q.in("ds_canal_mkt", filters.ds_canal_mkt)
  if (filters.ds_supervisor?.length)     q = q.in("ds_supervisor", filters.ds_supervisor)

  // Drill-down: filtro AND adicional sobre el dim seleccionado.
  if (request.drill) {
    const { tipo, value } = request.drill
    switch (tipo) {
      case "motivo":   q = q.eq("id_rechazo", Number(value));        break
      case "chofer":   q = q.eq("ds_fletero_carga", String(value));  break
      case "canal":    q = q.eq("ds_canal_mkt", String(value));      break
      case "cliente":  q = q.eq("id_cliente", Number(value));        break
      case "producto": q = q.eq("id_articulo", Number(value));       break
      case "fecha":    q = q.eq("fecha_venta", String(value));       break
    }
  }
  return q
}

interface CatalogoEntry {
  id_rechazo: number
  ds_rechazo: string
  categoria: RechazoCategoria
  controlable: boolean
}
interface MapeoEntry {
  patente: string
  chofer_nombre: string | null
}

async function loadCatalogoMin(supa: SupaClient): Promise<CatalogoEntry[]> {
  const { data, error } = await supa
    .from("catalogo_rechazos")
    .select("id_rechazo,ds_rechazo,categoria,controlable")
  if (error) throw new Error(`catalogo_rechazos: ${error.message}`)
  return (data ?? []) as CatalogoEntry[]
}

async function loadMapeoMin(supa: SupaClient): Promise<MapeoEntry[]> {
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

// el alias Query queda para futuras tipificaciones más estrictas — TS lo deja como warning
void (null as unknown as Query)
