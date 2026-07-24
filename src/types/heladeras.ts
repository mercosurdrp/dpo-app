// Tipos del módulo "Heladeras" (colocación / retiro de equipos de frío en ruta).
// Archivo sin "use server": seguro para exportar tipos y constantes
// (exportar tipos desde un archivo "use server" rompe el build de Turbopack).

export type HeladeraTipoMov = "colocacion" | "retiro"

export const HELADERA_TIPO_LABELS: Record<HeladeraTipoMov, string> = {
  colocacion: "Llevó / colocó en el cliente",
  retiro: "Trajo / levantó al camión",
}

// Etiqueta corta para chips y tablas.
export const HELADERA_TIPO_LABELS_CORTO: Record<HeladeraTipoMov, string> = {
  colocacion: "Colocación",
  retiro: "Retiro",
}

export const HELADERA_FOTO_AYUDA: Record<HeladeraTipoMov, string> = {
  colocacion: "Sacá la foto de la heladera ya instalada en el cliente.",
  retiro: "Sacá la foto de la heladera cargada en el camión.",
}

export type HeladeraEstado = "registrado" | "validado" | "observado"

export const HELADERA_ESTADO_LABELS: Record<HeladeraEstado, string> = {
  registrado: "Registrado",
  validado: "Validado",
  observado: "Observado",
}

// ── Adjunto (foto) ────────────────────────────────────────────────
export interface HeladeraAdjunto {
  id: string
  movimiento_id: string
  storage_path: string
  mime_type: string
  tamaño_bytes: number | null
  creado_por: string | null
  created_at: string
}

export interface HeladeraAdjuntoConUrl extends HeladeraAdjunto {
  url: string
}

export interface UploadedHeladeraFoto {
  storage_path: string
  mime_type: string
  tamano_bytes: number
}

// ── Cabecera del movimiento ───────────────────────────────────────
export interface HeladeraMovimiento {
  id: string
  fecha: string
  hora: string | null
  tipo: HeladeraTipoMov
  id_cliente: number
  nombre_cliente: string | null
  localidad: string | null
  cod_activo: string | null
  descripcion: string | null
  patente: string | null
  chofer_nombre: string | null
  observaciones: string | null
  estado: HeladeraEstado
  comentario_gestion: string | null
  revisado_por: string | null
  revisado_at: string | null
  creado_por: string
  created_at: string
  updated_at: string
}

export interface HeladeraMovimientoInput {
  fecha: string
  hora?: string | null
  tipo: HeladeraTipoMov
  id_cliente: number
  nombre_cliente?: string | null
  localidad?: string | null
  cod_activo?: string | null
  descripcion?: string | null
  patente?: string | null
  observaciones?: string | null
}

// Movimiento enriquecido para listados (con autor y fotos).
export interface HeladeraMovimientoConDetalle extends HeladeraMovimiento {
  autor_nombre: string
  adjuntos: HeladeraAdjuntoConUrl[]
}

// Resultado de la búsqueda de cliente por código.
export interface HeladeraClienteLookup {
  id_cliente: number
  nombre_cliente: string | null
  localidad: string | null
}

export interface HeladeraResumen {
  total: number
  colocaciones: number
  retiros: number
  sin_foto: number
  pendientes: number
}

// Vive acá (y no en actions/heladeras.ts) porque un archivo "use server" sólo
// puede exportar funciones async.
export function resumirMovimientos(movs: HeladeraMovimientoConDetalle[]): HeladeraResumen {
  return {
    total: movs.length,
    colocaciones: movs.filter((m) => m.tipo === "colocacion").length,
    retiros: movs.filter((m) => m.tipo === "retiro").length,
    sin_foto: movs.filter((m) => m.adjuntos.length === 0).length,
    pendientes: movs.filter((m) => m.estado === "registrado").length,
  }
}
