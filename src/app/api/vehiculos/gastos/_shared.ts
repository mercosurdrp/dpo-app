/** Fetch paginado del libro de gastos para las descargas Excel/PDF (PostgREST corta en 1000). */
import { createClient } from "@/lib/supabase/server"
import type { MantenimientoGasto } from "@/types/database"

export async function fetchGastosExport(opts: {
  mes?: string | null
  tipo?: string | null
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
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as MantenimientoGasto[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
  }
  return rows
}
