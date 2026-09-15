import type { IniciativaAhorroConDetalle } from "@/types/database"
import type { EjecucionRubro } from "@/actions/presupuesto-generador"
import type { KpiPerdidas } from "@/actions/presupuesto-perdidas-kpi"
import type { KpiCombustible } from "@/actions/presupuesto-combustible-kpi"

/**
 * Reunión de Iniciativas de Ahorro (2º día hábil del mes, 10:00): qué
 * iniciativas trae y en qué orden. Vive acá y no en el componente porque la
 * página de la reunión (server) necesita el año para hacer las lecturas y el
 * componente (client) necesita el orden: un archivo sin "use client" lo pueden
 * importar los dos.
 */

export interface IniciativasAhorroReunionData {
  anio: number
  iniciativas: IniciativaAhorroConDetalle[]
  ejecucionRubros: Record<string, EjecucionRubro>
  kpiPerdidas: Record<string, KpiPerdidas>
  kpiCombustible: Record<string, KpiCombustible>
  responsables: { id: string; nombre: string; email: string }[]
}

export type FocoIniciativa = "obsolescencia" | "roturas" | "combustible" | "otras"

export const FOCO_LABEL: Record<FocoIniciativa, string> = {
  obsolescencia: "Obsolescencia (producto vencido)",
  roturas: "Roturas y derrames",
  combustible: "Ahorro de combustible",
  otras: "Otras iniciativas",
}

const ORDEN_FOCO: FocoIniciativa[] = [
  "obsolescencia",
  "roturas",
  "combustible",
  "otras",
]

/**
 * Año cuyas iniciativas mira la reunión: el del mes ANTERIOR a la fecha de la
 * reunión. La reunión se hace a principio de mes con el cierre del mes previo,
 * así que la del 2º día hábil de enero cierra el año anterior y no mira un año
 * que todavía no tiene un mes cargado.
 */
export function anioIniciativasDe(fechaReunionISO: string): number {
  const anio = Number(fechaReunionISO.slice(0, 4))
  const mes = Number(fechaReunionISO.slice(5, 7))
  return mes === 1 ? anio - 1 : anio
}

/**
 * Foco de cada iniciativa para la reunión. Primero por el rubro del EERR o el
 * tipo del catálogo, y si no alcanza, por lo que dice el título: las
 * iniciativas de vencidos y roturas cargadas en 2026 son de tipo "otro" con el
 * foco escrito en el título ("Vencidos", "Reduccion de Roturas").
 */
export function focoDe(ini: IniciativaAhorroConDetalle): FocoIniciativa {
  const rubro = (ini.rubro ?? "").trim().toUpperCase()
  if (rubro === "PRODUCTO VENCIDO") return "obsolescencia"
  if (rubro === "ROTURAS Y DERRAMES") return "roturas"
  if (
    ini.tipo === "consumo_combustible" ||
    ini.tipo === "cambio_glp" ||
    ini.tipo === "renovacion_flota"
  ) {
    return "combustible"
  }
  if (ini.tipo === "mermas_wh_del") return "roturas"

  const texto = [ini.titulo, ini.tipo_otro, ini.descripcion, ini.kpi_nombre]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  if (/vencid|obsolesc/.test(texto)) return "obsolescencia"
  if (/rotura|derrame|merma/.test(texto)) return "roturas"
  if (/combustible|gasoil|km\/l|litro/.test(texto)) return "combustible"
  return "otras"
}

/** Iniciativas en el orden del temario: obsolescencia, roturas, combustible, otras. */
export function ordenarPorFoco(
  iniciativas: IniciativaAhorroConDetalle[],
): IniciativaAhorroConDetalle[] {
  return [...iniciativas].sort(
    (a, b) => ORDEN_FOCO.indexOf(focoDe(a)) - ORDEN_FOCO.indexOf(focoDe(b)),
  )
}
