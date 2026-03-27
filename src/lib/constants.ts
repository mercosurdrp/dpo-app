// Pillar colors (hex)
export const PILLAR_COLORS: Record<string, string> = {
  "Gestión": "#3B82F6",
  "Seguridad Alimentaria": "#EF4444",
  "Personas": "#8B5CF6",
  "Calidad": "#F59E0B",
  "Medio Ambiente": "#10B981",
  "Seguridad y Salud": "#F97316",
  "Mantenimiento": "#6366F1",
}

// Pillar icons (lucide-react icon names)
export const PILLAR_ICONS: Record<string, string> = {
  "Gestión": "settings",
  "Seguridad Alimentaria": "shield-check",
  "Personas": "users",
  "Calidad": "award",
  "Medio Ambiente": "leaf",
  "Seguridad y Salud": "hard-hat",
  "Mantenimiento": "wrench",
}

// Score levels for DPO audit questions
export const SCORE_LEVELS = [
  { value: 0, label: "Nivel 0", description: "No cumple", color: "#EF4444" },
  { value: 1, label: "Nivel 1", description: "Cumple parcialmente", color: "#F97316" },
  { value: 3, label: "Nivel 3", description: "Cumple", color: "#F59E0B" },
  { value: 5, label: "Nivel 5", description: "Cumple plenamente", color: "#10B981" },
] as const

// Estado colors for auditorias
export const ESTADO_AUDITORIA_COLORS: Record<string, string> = {
  borrador: "#94A3B8",
  en_progreso: "#3B82F6",
  completada: "#10B981",
  archivada: "#6B7280",
}

// Estado colors for acciones
export const ESTADO_ACCION_COLORS: Record<string, string> = {
  pendiente: "#EF4444",
  en_progreso: "#F59E0B",
  completado: "#10B981",
}

// Estado labels
export const ESTADO_AUDITORIA_LABELS: Record<string, string> = {
  borrador: "Borrador",
  en_progreso: "En Progreso",
  completada: "Completada",
  archivada: "Archivada",
}

export const ESTADO_ACCION_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En Progreso",
  completado: "Completado",
}
