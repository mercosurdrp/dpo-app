export type ZonaName = "Norte" | "Central" | "Este"

export interface Zona {
  color: string
  coords: [number, number][]
}

export type ZonasConfig = Record<string, Zona>

export interface SnapshotKpis {
  total_rutas: number
  finalized: number
  active: number
  pdvs_total: number
  pdvs_completed: number
  pdvs_pct: number
  bultos_entregados: number
  bultos_rechazados: number
  pct_rechazo: number
  rechazos_count: number
  avg_service_min: number
  avg_ruta_min: number
  km_driven: number | null
  km_planned: number | null
  km_status: string
}

export interface RouteRow {
  dc: string
  fecha: string
  ruta: string
  ruta_raw: string[]
  recarga: boolean
  num_vueltas: number
  route_ids: string[]
  driver_id: string | null
  chofer: string
  pdvs_total: number
  pdvs_done: number
  bultos_ok: number
  bultos_rech: number
  rechazos: number
  driven_m: number
  planned_m: number
  duracion_min: number | null
  activa: boolean
  finalizada: boolean
  cumplimiento_pct: number
  avg_service_min: number | null
  service_source: "analytics" | "timestamps" | null
}

export interface RechazoItem {
  producto: string
  cantidad: number
  motivo: string
  codigo: string | null
  notas: string | null
  ts_ms: number
}

export interface RechazoVisita {
  fecha: string
  dc: string
  ruta: string
  chofer: string
  cliente_id: string | null
  cliente_nombre: string
  bultos: number
  motivos: string[]
  items: RechazoItem[]
}

export interface MapWaypointAgg {
  customer_id: string
  status: string | null
  completed_ts: number | null
  bultos_ok: number
  bultos_rech: number
  svc_ana_sum: number
  svc_ana_count: number
  svc_ts_sum: number
  svc_ts_count: number
  motivos_bultos: Record<string, number>
}

export interface MapPoint {
  dc: string
  ruta: string
  chofer: string
  waypoints: MapWaypointAgg[]
}

export interface LiveTruck {
  dc: string
  chofer: string
  ruta: string
  lat: number
  lng: number
  ts_ms: number
  stale: boolean
}

export interface ClienteReiterante {
  dc: string
  cliente_id: string
  cliente_nombre: string
  dias_con_rechazo: number
  visitas_con_rechazo: number
  visitas_totales: number
  pct_rechazo_visitas: number
  bultos_rech: number
  bultos_pedidos: number
  pct_rech_bultos: number
  motivos_top: string[]
}

export interface ClienteRepase {
  dc: string
  cliente_id: string
  cliente_nombre: string
  visitas: number
  repases: number
  dias_distintos: number
  choferes: string[]
  camiones: string[]
  bultos_ok: number
}

export interface FranjaHoraria {
  labels: string[]
  motivos: string[]
  series: { motivo: string; values: number[] }[]
  clientes_distintos: number[]
  bultos_total: number[]
}

export interface Snapshot {
  range: string
  dates: string[]
  dcs: string[]
  generated_at: string
  all_finalized: boolean
  km_status: string
  kpis: SnapshotKpis
  routes: RouteRow[]
  rechazos_por_motivo: { motivo: string; cantidad: number }[]
  rechazos_por_chofer: { chofer: string; cantidad: number }[]
  rechazos_por_sku: { sku: string; bultos: number }[]
  rechazos_detalle: RechazoVisita[]
  rechazos_franja_horaria: FranjaHoraria
  clientes_reiterantes: ClienteReiterante[]
  clientes_repases: ClienteRepase[]
  service_time_hist: { labels: string[]; values: number[] }
  repases_por_chofer: { chofer: string; cantidad: number }[]
  map_points: MapPoint[]
  live_trucks: LiveTruck[]
}

export type RangeKey = "today" | "yesterday" | "week" | "month" | "custom"
