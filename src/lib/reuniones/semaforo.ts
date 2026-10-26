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
}

export function estadoIndicador(
  ind: IndicadorSemaforo,
  valor: number | null | undefined,
): EstadoSemaforo {
  if (valor == null || !Number.isFinite(valor)) return "sin_dato"
  if (NEUTROS.has(ind.id)) return "neutro"
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
