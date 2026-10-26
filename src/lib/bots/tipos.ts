// Tipos de los bots por pilar (tablas bots_pilar / bots_corridas /
// bots_planes_propuestos, migración 20261026120000_bots_pilar.sql).

export interface BotPilar {
  key: string
  nombre: string
  emoji: string
  reunion_tipo: string
  /** ids (`auto_*`) o nombres de indicador a mirar; vacío = todos. */
  indicadores: string[]
  encargado_profile_id: string | null
  telefono: string | null
  prompt_extra: string | null
  activo: boolean
}

export interface PlanPropuesto {
  titulo: string
  indicador: string
  causa_probable: string
  accion: string
  responsable_sugerido: string
  /** YYYY-MM-DD */
  fecha_objetivo: string
}

export interface SalidaRonda {
  mensaje_whatsapp: string
  hallazgos: Array<{
    indicador: string
    severidad: "rojo" | "amarillo"
    lectura: string
  }>
  planes_propuestos: PlanPropuesto[]
}

export type EstadoPlanPropuesto = "propuesto" | "aprobado" | "descartado"

export interface BotCorrida {
  id: string
  bot_key: string
  fecha: string
  tipo: "ronda" | "reunion"
  contexto: unknown
  salida: SalidaRonda | null
  mensaje: string | null
  modo: "ia" | "plantilla"
  dry: boolean
  enviado: boolean
  destino: string | null
  error: string | null
  created_at: string
}

export interface BotPlanPropuesto extends PlanPropuesto {
  id: string
  corrida_id: string
  bot_key: string
  estado: EstadoPlanPropuesto
  plan_accion_id: string | null
  resuelto_por: string | null
  resuelto_at: string | null
  created_at: string
}
