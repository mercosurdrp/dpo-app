"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { fetchFueraRutaSheet, type FueraRutaFila } from "@/lib/fuera-ruta/sheet"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA = "El registro de fuera de ruta solo está disponible en Pampeana."

export interface FueraRutaDia {
  fecha: string
  filas: FueraRutaFila[]
  total_monto: number
  /**
   * false = el sheet no contestó y se muestra el último snapshot guardado.
   * La solapa lo avisa para que nadie tome el registro por completo ese día.
   */
  sheet_ok: boolean
}

/**
 * Pedidos FUERA DE RUTA de una fecha de entrega.
 *
 * Sync-al-leer, estilo Pampeana: baja el sheet de Novedades Logísticas, upserta el
 * snapshot en `fuera_ruta_registros` (identidad = clave fecha|pedido|cliente, así
 * re-sincronizar no duplica y una corrección en el sheet actualiza la misma fila)
 * y devuelve las filas del día desde la base. El snapshot NUNCA borra: si en el
 * sheet borran filas o queda un filtro puesto, la historia registrada se conserva.
 */
export async function getFueraRuta(fecha: string): Promise<Result<FueraRutaDia>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." }

  let sheetOk = true
  try {
    const filas = await fetchFueraRutaSheet()
    if (filas.length > 0) {
      const admin = createAdminClient()
      const ahora = new Date().toISOString()
      // primera_vez NO va en el payload: la pone el default en el insert y el
      // upsert no la pisa (queda cuándo apareció el registro por primera vez).
      const rows = filas.map((f) => ({ ...f, synced_at: ahora }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin
          .from("fuera_ruta_registros")
          .upsert(rows.slice(i, i + 500), { onConflict: "clave" })
        if (error) throw new Error(`snapshot fuera de ruta: ${error.message}`)
      }
    }
  } catch (e) {
    // Sheet caído o descompartido: la solapa sigue con el último snapshot.
    console.warn("[fuera-ruta] sync falló:", e instanceof Error ? e.message : e)
    sheetOk = false
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("fuera_ruta_registros")
    .select(
      "clave, fecha_entrega, sucursal, deposito, cod_cliente, cliente, comprobante, nro_pedido, tipo_comprobante, monto, localidad, bultos, descripcion, cod_cliente_entregado, cliente_entregado, direccion_entrega, localidad_entrega, observaciones, patente, canal",
    )
    .eq("fecha_entrega", fecha)
    .order("monto", { ascending: false, nullsFirst: false })
  if (error) return { error: `No se pudo leer el registro de fuera de ruta: ${error.message}` }

  const filas = (data ?? []) as FueraRutaFila[]
  return {
    data: {
      fecha,
      filas,
      total_monto: filas.reduce((a, f) => a + (f.monto ?? 0), 0),
      sheet_ok: sheetOk,
    },
  }
}
