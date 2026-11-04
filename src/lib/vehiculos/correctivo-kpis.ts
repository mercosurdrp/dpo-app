// KPIs del mantenimiento correctivo (DPO Flota 2.4 / R2.4.3) para la foto
// mensual del cron `/api/vehiculos/flota-kpi-cron`. Misma definición que la
// serie en vivo de Indicadores (`getFlotaKpiSeriesExtra`):
//   · correctivo_dias_parado      Σ días fuera de servicio de las OT correctivas del mes
//   · roturas_flota               OT correctivas con unidad parada ≥ 1 día o auxilio en ruta
//   · correctivo_tiempo_servicio  horas promedio entrada→salida de taller (OT con ambas fechas)
//   · rechazos_rotura_flota       rechazos de entrega con motivo ROTURA DE CAMION - SINIESTRO

import type { SupabaseClient } from "@supabase/supabase-js"

export const MOTIVO_RECHAZO_ROTURA = "ROTURA DE CAMION - SINIESTRO"

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export async function kpisCorrectivoMes(
  client: SupabaseClient,
  year: number,
  mes: number
): Promise<Record<string, number | null>> {
  const desde = `${year}-${pad2(mes)}-01`
  const hasta = new Date(Date.UTC(year, mes, 1)).toISOString().slice(0, 10) // exclusivo

  const [otRes, rechRes] = await Promise.all([
    client
      .from("mantenimiento_realizados")
      .select("dominio, fecha, fuera_servicio_desde, fuera_servicio_hasta, auxilio_ruta, entrada_taller, salida_taller")
      .eq("tipo", "correctivo")
      .neq("estado", "cancelado")
      .gte("fecha", desde)
      .lt("fecha", hasta),
    client
      .from("rechazos")
      .select("id", { count: "exact", head: true })
      .eq("ds_rechazo", MOTIVO_RECHAZO_ROTURA)
      .gte("fecha", desde)
      .lt("fecha", hasta),
  ])

  const out: Record<string, number | null> = {
    correctivo_dias_parado: null,
    roturas_flota: null,
    correctivo_tiempo_servicio: null,
    rechazos_rotura_flota: null,
  }

  if (!otRes.error) {
    const ots = (otRes.data || []) as Array<{
      fecha: string
      fuera_servicio_desde: string | null
      fuera_servicio_hasta: string | null
      auxilio_ruta: boolean | null
      entrada_taller: string | null
      salida_taller: string | null
    }>
    // Días parado = unidad-días distintos dentro del mes (igual que la serie en
    // vivo): dos OT de la misma unidad el mismo día no cuentan doble.
    const unidadDias = new Set<string>()
    let roturas = 0
    let horas = 0
    let conHoras = 0
    const iniMes = Date.parse(desde)
    const finMes = Date.parse(hasta)
    for (const o of ots) {
      let d = 0
      if (o.fuera_servicio_desde) {
        const a = Math.max(Date.parse(o.fuera_servicio_desde.slice(0, 10)), iniMes)
        const b = Math.min(
          o.fuera_servicio_hasta ? Date.parse(o.fuera_servicio_hasta.slice(0, 10)) : Date.now(),
          finMes
        )
        for (let t = a; t < b; t += 86_400_000) {
          unidadDias.add(`${(o as { dominio?: string }).dominio ?? ""}|${new Date(t).toISOString().slice(0, 10)}`)
          d++
        }
      }
      if (d >= 1 || o.auxilio_ruta) roturas++
      if (o.entrada_taller && o.salida_taller) {
        horas += Math.max(0, (Date.parse(o.salida_taller) - Date.parse(o.entrada_taller)) / 3_600_000)
        conHoras++
      }
    }
    out.correctivo_dias_parado = unidadDias.size
    out.roturas_flota = roturas
    out.correctivo_tiempo_servicio = conHoras > 0 ? horas / conHoras : null
  }
  if (!rechRes.error) out.rechazos_rotura_flota = rechRes.count ?? 0

  return out
}
