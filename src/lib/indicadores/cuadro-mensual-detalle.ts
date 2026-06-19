// Tipos y helpers PUROS del detalle de "Bultos vendidos" (modal del cuadro
// mensual). Sin "use server": se importa desde la action (que lo calcula) y el
// client (que lo renderiza).

export interface DetalleItem {
  /** Nombre de la categoría (familia o zona/supervisor). */
  label: string
  bultos: number
  /** Participación sobre el total del mes (0..100). */
  pct: number
}

export interface DetalleBultos {
  mes: string // "YYYY-MM"
  total: number
  items: DetalleItem[]
}

/**
 * Clasifica un artículo en familia a partir de uneg/segmento del pool gerencial
 * (mismos valores que CAT_SQL en src/lib/mercosur-dashboard.ts). Todo lo que no
 * cae en una de las 3 familias va a "Otros" — así el desglose suma el total y
 * cuadra con la celda. Los envases (segmento ENV*) se agrupan en "Otros".
 */
export function clasificarFamilia(
  uneg: string | null,
  segmento: string | null,
): string {
  const u = (uneg ?? "").toUpperCase().trim()
  const s = (segmento ?? "").toUpperCase().trim()
  if (s.startsWith("ENV")) return "Otros"
  if (u === "CERVEZAS CMQ") return "Cervezas"
  if (u === "UNG") return "Gaseosas (UNG)"
  if (u === "AGUAS") return "Aguas"
  return "Otros"
}

/** Orden fijo de familias en el desglose. */
export const ORDEN_FAMILIAS = ["Cervezas", "Aguas", "Gaseosas (UNG)", "Otros"]

/** Arma items ordenados con su % sobre el total, a partir de un mapa label→bultos. */
export function armarItems(
  porLabel: Record<string, number>,
  orden?: string[],
): { items: DetalleItem[]; total: number } {
  const total = Object.values(porLabel).reduce((a, b) => a + b, 0)
  const labels = orden
    ? // primero los del orden fijo (si tienen valor), luego el resto por bultos desc
      [
        ...orden.filter((l) => porLabel[l] !== undefined),
        ...Object.keys(porLabel)
          .filter((l) => !orden.includes(l))
          .sort((a, b) => porLabel[b] - porLabel[a]),
      ]
    : Object.keys(porLabel).sort((a, b) => porLabel[b] - porLabel[a])
  const items = labels.map((label) => ({
    label,
    bultos: porLabel[label],
    pct: total > 0 ? (porLabel[label] / total) * 100 : 0,
  }))
  return { items, total }
}
