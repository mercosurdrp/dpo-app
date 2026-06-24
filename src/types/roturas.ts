// Tipos del módulo "Roturas en la calle" (distribución / ruta).
// Archivo sin "use server": seguro para exportar tipos y constantes
// (exportar tipos desde un archivo "use server" rompe el build de Turbopack).

export type RoturaTipo = "rotura" | "faltante"

export const ROTURA_TIPO_LABELS: Record<RoturaTipo, string> = {
  rotura: "Rotura en distribución",
  faltante: "Faltante en distribución",
}

export type RoturaMotivo =
  | "manipulacion"
  | "transporte"
  | "carga_descarga"
  | "mal_estado_previo"
  | "accidente_vial"
  | "otro"

export const ROTURA_MOTIVO_LABELS: Record<RoturaMotivo, string> = {
  manipulacion: "Manipulación",
  transporte: "Transporte",
  carga_descarga: "Carga / descarga",
  mal_estado_previo: "Mal estado previo",
  accidente_vial: "Accidente vial",
  otro: "Otro",
}

export type RoturaEstado = "reportada" | "en_revision" | "cerrada"

export const ROTURA_ESTADO_LABELS: Record<RoturaEstado, string> = {
  reportada: "Reportada",
  en_revision: "En revisión",
  cerrada: "Cerrada",
}

// ── Item de SKU dentro de un reporte ──────────────────────────────
export interface RoturaItem {
  id: string
  rotura_id: string
  id_articulo: number | null
  des_articulo: string | null
  cantidad: number
  created_at: string
}

export interface RoturaItemInput {
  id_articulo: number | null
  des_articulo: string | null
  cantidad: number
}

// ── Adjunto (foto) ────────────────────────────────────────────────
export interface RoturaAdjunto {
  id: string
  rotura_id: string
  storage_path: string
  mime_type: string
  tamaño_bytes: number | null
  creado_por: string | null
  created_at: string
}

export interface RoturaAdjuntoConUrl extends RoturaAdjunto {
  url: string
}

export interface UploadedRoturaFoto {
  storage_path: string
  mime_type: string
  tamano_bytes: number
}

// ── Cabecera del reporte ──────────────────────────────────────────
export interface Rotura {
  id: string
  fecha: string
  hora: string | null
  patente: string
  chofer_nombre: string | null
  tipo: RoturaTipo
  motivo: RoturaMotivo
  observaciones: string | null
  localidad: string | null
  estado: RoturaEstado
  creado_por: string
  created_at: string
  updated_at: string
}

export interface RoturaInput {
  fecha: string
  hora?: string | null
  patente: string
  tipo: RoturaTipo
  motivo: RoturaMotivo
  observaciones?: string | null
  localidad?: string | null
  items: RoturaItemInput[]
}

// Reporte enriquecido para listados (con autor, items y fotos).
export interface RoturaConDetalle extends Rotura {
  autor_nombre: string
  items: RoturaItem[]
  adjuntos: RoturaAdjuntoConUrl[]
}

// ── Plan de acción (1:1 con la rotura) ────────────────────────────
export interface RoturaPlan {
  id: string
  rotura_id: string
  descripcion: string
  responsable: string | null
  fecha_planificada: string | null
  fecha_completado: string | null
  comentario_cierre: string | null
  creado_por: string
  created_at: string
  updated_at: string
}

export interface RoturaPlanInput {
  descripcion: string
  responsable?: string | null
  fecha_planificada?: string | null
}

// Rotura + su plan (para la matinal de logística).
export interface RoturaConPlan extends RoturaConDetalle {
  plan: RoturaPlan | null
}

// Opción de catálogo de SKU para el selector del formulario.
export interface RoturaSkuOption {
  id_articulo: number
  des_articulo: string
}
