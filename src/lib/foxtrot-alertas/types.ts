// Tipos compartidos del módulo de alertas WhatsApp de rechazos Foxtrot.

export interface RechazoItemAlerta {
  producto: string
  cantidad: number
  motivo: string
  notas: string | null
  ts_ms: number
}

export type EstadoEnvio =
  | "pendiente"
  | "enviada"
  | "parcial"
  | "sin_telefono"
  | "error"
  | "dry_run"
  | "desactivada"

export type OutcomeAlerta =
  | "pendiente"
  | "recuperado_mismo_dia"
  | "proxima_entrega_ok"
  | "reincidio"
  | "sin_nueva_entrega"

export interface EnvioDetalle {
  destinatario: "promotor" | "supervisor"
  phone: string | null
  ok: boolean
  status: number | null
  ts: string
  error?: string
  texto?: string // solo en dry-run, para previsualizar el mensaje
}

export interface AlertaRechazo {
  id: string
  dedup_key: string
  dc: string
  fecha: string
  route_id: string
  waypoint_id: string
  cliente_id_foxtrot: string | null
  id_cliente: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_localidad: string | null
  chofer_nombre: string | null
  ruta: string | null
  motivos: string[]
  bultos: number
  parcial: boolean
  items: RechazoItemAlerta[]
  rechazo_ts: string | null
  id_promotor: string | null
  promotor_nombre: string | null
  promotor_phone: string | null
  supervisor_id: string | null
  supervisor_nombre: string | null
  supervisor_phone: string | null
  estado_envio: EstadoEnvio
  envio_detalle: EnvioDetalle[]
  intentos_envio: number
  enviada_at: string | null
  outcome: OutcomeAlerta
  outcome_at: string | null
  outcome_detalle: string | null
  proxima_entrega_fecha: string | null
  created_at: string
  updated_at: string
}

export interface AlertasConfig {
  id: number
  envios_activos: boolean
  dry_run: boolean
  ventana_desde: string // "07:00:00"
  ventana_hasta: string
  max_intentos_envio: number
  dias_seguimiento_outcome: number
  updated_at: string
}

export type RolVendedorWa = "promotor" | "supervisor"

export interface VendedorWa {
  id_promotor: string
  nombre: string
  phone_number: string
  empresa: string
  activo: boolean
  notes: string | null
  rol: RolVendedorWa
  supervisor_id: string | null
  recibe_alertas_rechazo: boolean
}

export interface AlertasKpis {
  total: number
  enviadas: number
  sin_telefono: number
  recuperado_mismo_dia: number
  proxima_entrega_ok: number
  reincidio: number
  sin_nueva_entrega: number
  pendientes: number
  mediana_min_rechazo_alerta: number | null
}
