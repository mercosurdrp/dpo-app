/** Fetch paginado del libro de gastos para las descargas Excel/PDF (PostgREST corta en 1000). */
import { createClient } from "@/lib/supabase/server"
import { GASTO_MOTIVO_SIN, type MantenimientoGasto } from "@/types/database"

/** Mismo valor que usa la pantalla para "no corresponde" en tipo de mantenimiento. */
export const MANT_SIN = "__sin_mant"

export async function fetchGastosExport(opts: {
  mes?: string | null
  tipo?: string | null
  /** Motivo del gasto (columna `rubro`); `GASTO_MOTIVO_SIN` = los que no lo tienen. */
  motivo?: string | null
  /** Tipo de mantenimiento; `MANT_SIN` = los que no corresponden a mantenimiento. */
  mantenimiento?: string | null
}): Promise<MantenimientoGasto[]> {
  const supabase = await createClient()
  const PAGE = 1000
  const rows: MantenimientoGasto[] = []
  let from = 0
  while (true) {
    let q = supabase
      .from("mantenimiento_gastos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1)
    if (opts.mes) q = q.eq("mes_imputacion", opts.mes)
    if (opts.tipo) q = q.eq("tipo", opts.tipo)
    if (opts.motivo)
      q = opts.motivo === GASTO_MOTIVO_SIN ? q.is("rubro", null) : q.eq("rubro", opts.motivo)
    if (opts.mantenimiento)
      q =
        opts.mantenimiento === MANT_SIN
          ? q.is("tipo_mantenimiento", null)
          : q.eq("tipo_mantenimiento", opts.mantenimiento)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as MantenimientoGasto[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
  }
  return rows
}
