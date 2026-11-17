/**
 * Semáforo diario de fuera de ruta (estilo SLA) y motivos de justificación.
 * Vive aparte del archivo "use server" porque exporta constantes.
 */

export const MOTIVOS_FUERA_RUTA = [
  { id: "feriado", label: "Feriado / día posterior a feriado" },
  { id: "pedido_ventas", label: "Pedido de Ventas / cliente" },
  { id: "reestructuracion", label: "Reestructuración de rutas" },
  { id: "dia_pactado", label: "Día pactado desactualizado en Chess" },
  { id: "operativo", label: "Problema operativo (flota, carga, stock)" },
  { id: "otro", label: "Otro" },
] as const

export type MotivoFueraRuta = (typeof MOTIVOS_FUERA_RUTA)[number]["id"]

export function motivoLabel(id: string): string {
  return MOTIVOS_FUERA_RUTA.find((m) => m.id === id)?.label ?? id
}

/**
 * Estado del día:
 * - verde: hubo reparto y ningún fuera de ruta entregado
 * - rojo: hubo fuera de ruta y nadie lo justificó
 * - justificado: hubo fuera de ruta y hay una observación que lo justifica
 * - pendiente: hoy o futuro (lo que hay es el ruteo, todavía no salió)
 * - sin_reparto: domingo o feriado
 */
export type EstadoDiaFueraRuta = "verde" | "rojo" | "justificado" | "pendiente" | "sin_reparto"

/** Marca que ata un plan de planes_accion a un día de fuera de ruta. */
export const NOTA_FECHA_PREFIJO = "fuera_ruta_fecha="
