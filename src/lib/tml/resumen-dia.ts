/**
 * Resumen del día de TML (Tiempo Medio de Liberación) para el drill-down
 * del tablero de reuniones. Lectura pura.
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

const META_MINUTOS = 25

export interface TmlRegistroRow {
  id: string
  dominio: string
  chofer: string
  hora_entrada: number
  hora_egreso: string
  tml_minutos: number
  dentro_meta: boolean
}

export interface TmlResumenDia {
  fecha: string
  meta_minutos: number
  promedio: number | null
  total_egresos: number
  dentro_meta: number
  pct_dentro_meta: number
  registros: TmlRegistroRow[]
}

export async function getTmlResumenDia(
  supa: SupaClient,
  fecha: string,
): Promise<TmlResumenDia> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida (esperado YYYY-MM-DD)")
  }

  const { data, error } = await supa
    .from("registros_vehiculos")
    .select("id, dominio, chofer, hora_entrada, hora, tml_minutos")
    .eq("fecha", fecha)
    .eq("tipo", "egreso")
    .not("tml_minutos", "is", null)
    .order("tml_minutos", { ascending: false })

  if (error) throw new Error(`registros_vehiculos: ${error.message}`)

  const rows = (data ?? []) as Array<{
    id: string
    dominio: string
    chofer: string
    hora_entrada: number
    hora: string
    tml_minutos: number | null
  }>

  const registros: TmlRegistroRow[] = rows
    .filter((r) => r.tml_minutos != null && Number.isFinite(Number(r.tml_minutos)))
    .map((r) => {
      const tml = Number(r.tml_minutos)
      return {
        id: r.id,
        dominio: r.dominio,
        chofer: r.chofer,
        hora_entrada: r.hora_entrada,
        hora_egreso: r.hora,
        tml_minutos: tml,
        dentro_meta: tml <= META_MINUTOS,
      }
    })

  const totalEgresos = registros.length
  const promedio =
    totalEgresos > 0
      ? Math.round(
          registros.reduce((acc, r) => acc + r.tml_minutos, 0) / totalEgresos,
        )
      : null
  const dentroMeta = registros.filter((r) => r.dentro_meta).length
  const pctDentroMeta =
    totalEgresos > 0 ? Math.round((dentroMeta / totalEgresos) * 100) : 0

  return {
    fecha,
    meta_minutos: META_MINUTOS,
    promedio,
    total_egresos: totalEgresos,
    dentro_meta: dentroMeta,
    pct_dentro_meta: pctDentroMeta,
    registros,
  }
}
