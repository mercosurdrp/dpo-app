/**
 * Control de aceite del CIL — PI de ATO del DPO Flota 4.1 (R4.1.4).
 *
 * Por qué existe: el checklist diario marcó «Nivel de aceite motor» OK en
 * todas las respuestas de jul–nov 2026, y en el mismo período la I del CIL
 * repuso aceite 4 veces (AE908DG, AE591EI dos meses seguidos, OJA403). Ese es
 * el valor de la inspección incremental del operador, pero quedaba en texto
 * libre y no se podía medir. Desde el 06/11/2026 se carga estructurado.
 *
 * 🚨 Va en la fila de la I (`inspeccion`), que ya es mensual y obligatoria:
 * NO es una cuarta letra del ciclo. Ver `CICLO_CIL_MENSUAL`.
 *
 * Módulo puro (sin "use server"): lo usan `/mi-cil` y la carga del supervisor,
 * y las constantes se pueden importar desde el cliente.
 */

export const TAREA_CONTROL_ACEITE = "inspeccion" as const

export const NIVELES_ACEITE = [
  { id: "ok", label: "OK", detalle: "Entre mínimo y máximo, no hizo falta agregar" },
  { id: "bajo", label: "Bajo", detalle: "Estaba por debajo del mínimo o hubo que agregar" },
  { id: "sobre_nivel", label: "Pasado", detalle: "Por encima del máximo" },
] as const

export const CIRCUITOS_ACEITE = [
  { id: "motor", label: "Motor" },
  { id: "hidraulico", label: "Hidráulico" },
  { id: "caja", label: "Caja" },
  { id: "diferencial", label: "Diferencial" },
  { id: "otro", label: "Otro" },
] as const

export type NivelAceite = (typeof NIVELES_ACEITE)[number]["id"]
export type CircuitoAceite = (typeof CIRCUITOS_ACEITE)[number]["id"]

export interface ControlAceite {
  aceite_nivel: NivelAceite
  aceite_litros: number | null
  aceite_circuito: CircuitoAceite
  perdida_detectada: boolean
  perdida_ubicacion: string | null
}

/** Columnas del control, para los `select` de las lecturas. */
export const COLUMNAS_ACEITE =
  "aceite_nivel, aceite_litros, aceite_circuito, perdida_detectada, perdida_ubicacion, mantenimiento_id"

/**
 * ¿La fila es un HALLAZGO? Nivel fuera de rango, litros repuestos o pérdida a
 * la vista. Es exactamente lo que cuenta el KPI `cil_fugas_detectadas`, así que
 * la pantalla y el indicador no pueden diferir.
 */
export function esHallazgoAceite(f: {
  aceite_nivel?: string | null
  aceite_litros?: number | string | null
  perdida_detectada?: boolean | null
}): boolean {
  return (
    f.aceite_nivel === "bajo" ||
    f.aceite_nivel === "sobre_nivel" ||
    Number(f.aceite_litros ?? 0) > 0 ||
    f.perdida_detectada === true
  )
}

/** Texto corto del hallazgo: «Bajo · +2,5 L · pérdida en el cárter». */
export function resumenAceite(f: {
  aceite_nivel?: string | null
  aceite_litros?: number | string | null
  aceite_circuito?: string | null
  perdida_detectada?: boolean | null
  perdida_ubicacion?: string | null
}): string | null {
  if (!f.aceite_nivel && f.perdida_detectada == null) return null
  const partes: string[] = []
  const nivel = NIVELES_ACEITE.find((n) => n.id === f.aceite_nivel)
  if (nivel) partes.push(`Nivel ${nivel.label.toLowerCase()}`)
  if (f.aceite_circuito && f.aceite_circuito !== "motor") {
    const c = CIRCUITOS_ACEITE.find((x) => x.id === f.aceite_circuito)
    if (c) partes.push(c.label.toLowerCase())
  }
  const litros = Number(f.aceite_litros ?? 0)
  if (litros > 0) partes.push(`+${litros.toLocaleString("es-AR")} L`)
  if (f.perdida_detectada)
    partes.push(f.perdida_ubicacion ? `pérdida: ${f.perdida_ubicacion}` : "pérdida")
  else if (f.perdida_detectada === false) partes.push("sin pérdidas")
  return partes.join(" · ")
}

/**
 * Lee y valida el control de aceite del FormData. Sólo se llama cuando la
 * carga incluye la I del CIL.
 *
 * 🚨 El nivel y el «¿hay pérdida?» son OBLIGATORIOS: un control sin resultado
 * es lo mismo que el texto libre de antes y no suma al PI. Los litros no: si el
 * nivel está OK lo normal es no haber agregado nada.
 *
 * En los autoelevadores el circuito se elige (motor o hidráulico: la fuga de
 * HELI1 de julio fue hidráulica); en el resto es siempre motor.
 */
export function leerControlAceite(
  formData: FormData,
  tipoVehiculo: string | null,
): { data: ControlAceite } | { error: string } {
  const nivel = String(formData.get("aceite_nivel") || "").trim()
  if (!NIVELES_ACEITE.some((n) => n.id === nivel))
    return { error: "Marcá cómo estaba el nivel de aceite." }

  const litrosRaw = String(formData.get("aceite_litros") || "").trim().replace(",", ".")
  let litros: number | null = null
  if (litrosRaw) {
    litros = Number(litrosRaw)
    if (!Number.isFinite(litros) || litros < 0 || litros > 60)
      return { error: "Los litros de aceite tienen que ser un número entre 0 y 60." }
  }

  const perdidaRaw = String(formData.get("perdida_detectada") || "").trim()
  if (perdidaRaw !== "si" && perdidaRaw !== "no")
    return { error: "Indicá si viste alguna pérdida de aceite." }
  const perdida = perdidaRaw === "si"
  const ubicacion = String(formData.get("perdida_ubicacion") || "").trim()
  if (perdida && !ubicacion)
    return { error: "Contá dónde está la pérdida (ej.: debajo del cárter)." }

  let circuito: CircuitoAceite = "motor"
  if (tipoVehiculo === "autoelevador") {
    const c = String(formData.get("aceite_circuito") || "").trim()
    if (!CIRCUITOS_ACEITE.some((x) => x.id === c))
      return { error: "Elegí qué aceite controlaste (motor o hidráulico)." }
    circuito = c as CircuitoAceite
  }

  // Nivel OK con litros repuestos es contradictorio: si hubo que agregar,
  // estaba bajo. Se corrige solo en vez de rebotar la carga del chofer.
  const nivelFinal: NivelAceite =
    nivel === "ok" && litros !== null && litros > 0 ? "bajo" : (nivel as NivelAceite)

  return {
    data: {
      aceite_nivel: nivelFinal,
      aceite_litros: litros,
      aceite_circuito: circuito,
      perdida_detectada: perdida,
      perdida_ubicacion: perdida ? ubicacion.slice(0, 200) : null,
    },
  }
}
