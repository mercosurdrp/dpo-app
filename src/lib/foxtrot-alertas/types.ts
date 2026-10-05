// Tipos compartidos del módulo de alertas WhatsApp de rechazos Foxtrot.

export interface RechazoItemAlerta {
  producto: string
  cantidad: number
  // Bultos pedidos de la línea. En un rechazo parcial Foxtrot no dice cuántos
  // volvieron (cantidad = 0), así que se muestra el producto con lo pedido.
  pedido?: number
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

// Lo que respondió el vendedor en el seguimiento (1 / 2 / 3), o nadie.
export type ResultadoSeguimiento = "evitado" | "reprogramado" | "perdido" | "sin_respuesta"

export type EstadoPregunta =
  | "en_cola"
  | "preguntada"
  | "esperando_como"
  | "respondida"
  | "sin_respuesta"
  | "cerrada_por_otro"

export interface PreguntaSeguimiento {
  id: string
  alerta_id: string
  fecha: string
  id_promotor: string
  nombre: string | null
  phone: string
  estado: EstadoPregunta
  preguntada_at: string | null
  recordada_at: string | null
  respondida_at: string | null
  opcion: 1 | 2 | 3 | null
  como: string | null
}

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
  seguimiento_resultado: ResultadoSeguimiento | null
  seguimiento_como: string | null
  seguimiento_categoria: string | null
  seguimiento_resumen: string | null
  seguimiento_por_id: string | null
  seguimiento_por_nombre: string | null
  seguimiento_at: string | null
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
  seguimiento_activo: boolean
  seguimiento_demora_min: number
  resumen_diario_activo: boolean
  resumen_ultima_fecha: string | null
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
