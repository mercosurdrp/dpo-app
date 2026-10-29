// Semáforo de un indicador de reunión, en versión pura (sin clases de CSS).
// Replica las reglas de la grilla de `reunion-detalle-page-client.tsx` para
// que el bot de cada pilar lea lo mismo que se ve en la reunión:
//   - 2 zonas (default): cumple la meta → verde, no cumple → rojo.
//   - 3 zonas (SEMAFORO_3_ZONAS): cumple → verde; peor que el gatillo → rojo;
//     entre meta y gatillo (o sin gatillo) → amarillo.
//   - Sin meta o sin polaridad → neutro (no hay contra qué comparar).
// OJO: si cambia el coloreo de la grilla, actualizar acá también.

export type EstadoSemaforo = "verde" | "amarillo" | "rojo" | "neutro" | "sin_dato"

export const SEMAFORO_3_ZONAS = new Set([
  "auto_wqi",
  "auto_wnp",
  "auto_productividad_picking",
  "auto_errores_picking",
  "auto_ausentismo",
  "auto_fx_tiempo_ruta",
  "auto_fx_desvio_plan",
  "auto_tlp",
])

/** Indicadores con umbral MENSUAL: se juzgan sobre el MTD, no sobre el día. */
export const SEMAFORO_MENSUAL = new Set(["auto_sho"])

/** Conteos informativos que la grilla nunca pinta. */
const NEUTROS = new Set(["auto_camiones_calle", "auto_km_recorridos", "auto_horas_calle"])

export interface IndicadorSemaforo {
  id: string
  meta: number | null
  gatillo?: number | null
  mejor_si?: "menor" | "mayor"
  metas_dia?: Record<string, { meta: number; gatillo: number }>
  meta_mtd?: number | null
  gatillo_mtd?: number | null
}

/**
 * `fecha`: día de la celda (o "mtd" para el acumulado). Las filas con target
 * por día (Bultos/HL vendidos) se juzgan contra el de ese día, en 3 zonas;
 * sin `fecha` se usa el target de la fila (el del día de la reunión).
 */
export function estadoIndicador(
  ind: IndicadorSemaforo,
  valor: number | null | undefined,
  fecha?: string,
): EstadoSemaforo {
  if (valor == null || !Number.isFinite(valor)) return "sin_dato"
  if (NEUTROS.has(ind.id)) return "neutro"
  if (ind.metas_dia && fecha && ind.mejor_si) {
    const t =
      fecha === "mtd"
        ? ind.meta_mtd != null
          ? { meta: ind.meta_mtd, gatillo: ind.gatillo_mtd ?? ind.meta_mtd }
          : null
        : ind.metas_dia[fecha] ?? null
    if (!t) return "neutro"
    const menor = ind.mejor_si === "menor"
    if (menor ? valor <= t.meta : valor >= t.meta) return "verde"
    return (menor ? valor > t.gatillo : valor < t.gatillo) ? "rojo" : "amarillo"
  }
  if (!ind.mejor_si || ind.meta == null) return "neutro"
  const cumple = ind.mejor_si === "menor" ? valor <= ind.meta : valor >= ind.meta
  if (cumple) return "verde"
  const tresZonas = SEMAFORO_3_ZONAS.has(ind.id) || SEMAFORO_MENSUAL.has(ind.id)
  if (!tresZonas) return "rojo"
  if (ind.gatillo == null) return "amarillo"
  const peorQueGatillo =
    ind.mejor_si === "menor" ? valor > ind.gatillo : valor < ind.gatillo
  return peorQueGatillo ? "rojo" : "amarillo"
}
