// Definición ÚNICA de «rotura de flota» (DPO Flota 2.4 / 4.2).
//
// Hasta el 06/11/2026 convivían cuatro cuentas distintas: el análisis de
// correctivos y los dos KPI usaban «parada ≥ 1 día o auxilio», pero la pirámide
// pedía 2 días para la «avería grave». Con dos criterios la punta de la
// pirámide no cerraba con el KPI `roturas_flota`, y el auditor ve las dos.
//
// Rotura = OT CORRECTIVA no cancelada que:
//   · fue auxilio en ruta (la unidad quedó tirada afuera), o
//   · dejó la unidad fuera de servicio 1 día o más (no volvió a la calle al día
//     siguiente). Sin fecha de alta cargada la unidad sigue parada: se mide
//     contra hoy.
//
// Un reemplazo de foco que entra y sale del taller en el día NO es rotura: el
// período fuera de servicio se carga en toda OT que pasa por el taller, por eso
// el corte es en días y no en "tiene período cargado".

import type { MantenimientoRealizado } from "@/types/database"

export const MIN_DIAS_ROTURA = 1

const DIA = 86_400_000

export function diasFueraServicio(
  m: Pick<MantenimientoRealizado, "fuera_servicio_desde" | "fuera_servicio_hasta">,
  hoy: string
): number | null {
  if (!m.fuera_servicio_desde) return null
  const desde = m.fuera_servicio_desde.slice(0, 10)
  const hasta = (m.fuera_servicio_hasta ?? hoy).slice(0, 10)
  return Math.max(
    0,
    Math.round((Date.parse(hasta + "T12:00:00Z") - Date.parse(desde + "T12:00:00Z")) / DIA)
  )
}

export function esRotura(
  m: Pick<
    MantenimientoRealizado,
    "tipo" | "estado" | "auxilio_ruta" | "fuera_servicio_desde" | "fuera_servicio_hasta"
  >,
  hoy: string
): boolean {
  if (m.tipo !== "correctivo" || m.estado === "cancelado") return false
  if (m.auxilio_ruta) return true
  const d = diasFueraServicio(m, hoy)
  return d !== null && d >= MIN_DIAS_ROTURA
}
