import type { HerramientaGestionTipo } from "@/types/database"

export const HERRAMIENTA_GESTION_TIPOS: HerramientaGestionTipo[] = [
  "cinco_porques",
  "causa_efecto",
  "pdca",
]

export const HERRAMIENTA_GESTION_LABELS: Record<HerramientaGestionTipo, string> = {
  cinco_porques: "5 Porqués",
  causa_efecto: "Causa-Efecto (Ishikawa)",
  pdca: "PDCA",
}

export const HERRAMIENTA_GESTION_DESCRIPCIONES: Record<HerramientaGestionTipo, string> = {
  cinco_porques:
    "Para anomalías simples: preguntar «¿por qué?» en cascada hasta la causa raíz.",
  causa_efecto:
    "Para problemas recurrentes: agrupar causas por 6M (Mano de obra, Método, Máquina, Material, Medición, Medio ambiente).",
  pdca: "Para problemas grandes o crónicos: Planificar – Hacer – Verificar – Actuar.",
}

export const CAUSA_EFECTO_CATEGORIAS_6M = [
  "Mano de obra",
  "Método",
  "Máquina",
  "Material",
  "Medición",
  "Medio ambiente",
] as const
