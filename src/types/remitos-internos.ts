export type DescargaEstado = "ok" | "con_novedad"

export interface RemitoOperacion {
  id: string
  nombre: string
  origen: string | null
  destino: string | null
  activa: boolean
  created_at: string
}

export interface RemitoItem {
  id?: string
  orden: number
  /** null = renglón libre (racks, muebles, equipos). */
  id_articulo: number | null
  descripcion: string
  cantidad: number
  unidad: string
}

export interface RemitoInterno {
  id: string
  operacion_id: string
  operacion_nombre: string
  numero: number
  fecha: string
  origen: string | null
  destino: string | null
  vehiculo_id: string | null
  patente: string
  chofer_id: string | null
  chofer_nombre: string
  observaciones: string | null
  anulado: boolean
  descarga_estado: DescargaEstado | null
  descarga_comentario: string | null
  descargado_por_nombre: string | null
  descargado_at: string | null
  creado_por_nombre: string | null
  created_at: string
  items: RemitoItem[]
}

export interface RemitoVehiculoOpcion {
  id: string
  dominio: string
  descripcion: string | null
}

export interface RemitoChoferOpcion {
  id: string
  nombre: string
}

export interface RemitoArticuloOpcion {
  id: number
  descripcion: string
  corta: string | null
}

export interface RemitoInput {
  operacion_id: string
  fecha: string
  origen: string
  destino: string
  patente: string
  chofer_nombre: string
  observaciones: string
  items: RemitoItem[]
}

export const UNIDADES_REMITO = ["bultos", "pallets", "unidades", "cajones", "kg"] as const
