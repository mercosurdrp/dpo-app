import type { HerramientaGestionTipo, PdcaCampoEditable } from "@/types/database"

/** Cuadrantes del PDCA que se editan desde la vista (PLAN queda afuera). */
export const PDCA_CAMPOS_EDITABLES: PdcaCampoEditable[] = [
  "hacer",
  "verificar",
  "actuar",
]

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

// ---------------------------------------------------------------------------
// Revisiones mensuales del PDCA
//
// El manual DPO pide revisar el avance del PDCA al menos una vez por mes, así
// que la grilla de revisiones se precarga con TODOS los meses desde que se
// creó la herramienta hasta el mes en curso (los vacíos son justo lo que el
// auditor busca). Los meses se manejan como 'YYYY-MM' y se calculan en hora
// argentina: el server corre en UTC y, si no, a las 21hs del 31 el mes en
// curso ya sería el siguiente.
// ---------------------------------------------------------------------------

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Fecha de hoy en Argentina, 'YYYY-MM-DD'. */
export function hoyAR(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/** Mes 'YYYY-MM' de una fecha ISO. Devuelve "" si no hay fecha. */
export function mesDe(iso: string | null | undefined): string {
  const mes = (iso ?? "").slice(0, 7)
  return MES_RE.test(mes) ? mes : ""
}

/** Mes en curso en Argentina, 'YYYY-MM'. */
export function mesActual(now: Date = new Date()): string {
  return mesDe(hoyAR(now))
}

/** Último día del mes 'YYYY-MM', en formato 'YYYY-MM-DD'. */
export function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number)
  const dia = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${mes}-${String(dia).padStart(2, "0")}`
}

/**
 * Meses 'YYYY-MM' entre `desde` y `hasta`, ambos inclusive, ascendente.
 * Tope de 120 meses por si llega una fecha corrupta.
 */
export function mesesEntre(desde: string, hasta: string): string[] {
  if (!MES_RE.test(desde) || !MES_RE.test(hasta) || desde > hasta) return []
  const [yHasta, mHasta] = hasta.split("-").map(Number)
  let [y, m] = desde.split("-").map(Number)
  const out: string[] = []
  while ((y < yHasta || (y === yHasta && m <= mHasta)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}
