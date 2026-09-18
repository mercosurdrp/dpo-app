/**
 * Replica el relevamiento de horarios del PDV a Supabase.
 *
 * El relevamiento trimestral vive en la base del dashboard Mercosur (Railway) y
 * los rechazos y Foxtrot viven en Supabase. Cruzar dos bases no se puede hacer
 * en una query, asi que se replica: son ~2.000 filas por ciclo, sale barato y
 * convierte el cruce en un JOIN.
 *
 * Se traen TODOS los ciclos, no solo el vigente: un rechazo de mayo tiene que
 * clasificarse con la ventana que estaba relevada en mayo, no con la de hoy.
 *
 * Hace upsert, nunca truncate: si la corrida se cae a la mitad, lo que ya
 * estaba sigue sirviendo.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { getPool } from "@/lib/mercosur-dashboard"

const BATCH_SIZE = 500

export interface ResultadoSyncHorarios {
  leidos: number
  upserted: number
  ciclos: string[]
  duration_ms: number
}

interface FilaRelevamiento {
  id_cliente: number
  ciclo: string
  horario: unknown
  modo_carga: string | null
  promotor_nombre: string | null
  razon_social: string | null
  fecha_carga: Date | null
}

export async function syncPdvHorarios(
  supabase: SupabaseClient,
): Promise<ResultadoSyncHorarios> {
  const t0 = Date.now()

  // Solo lectura contra la Railway. Se descartan las filas sin JSON de objeto:
  // hay relevamientos guardados como null y no aportan una ventana.
  const { rows } = await getPool().query<FilaRelevamiento>(
    `SELECT id_cliente, ciclo, horario, modo_carga, promotor_nombre,
            razon_social, fecha_carga
       FROM horarios_relevamientos
      WHERE id_cliente IS NOT NULL
        AND horario IS NOT NULL
        AND jsonb_typeof(horario) = 'object'`,
  )

  // Un cliente puede tener una fila por ciclo, y la PK es (id_cliente, ciclo).
  // Si el origen trajera dos del mismo par, gana la carga mas nueva.
  const porClave = new Map<string, FilaRelevamiento>()
  for (const r of rows) {
    const clave = `${r.id_cliente}|${r.ciclo}`
    const previa = porClave.get(clave)
    const masNueva =
      !previa ||
      (r.fecha_carga?.getTime() ?? 0) >= (previa.fecha_carga?.getTime() ?? 0)
    if (masNueva) porClave.set(clave, r)
  }

  const filas = [...porClave.values()].map((r) => ({
    id_cliente: r.id_cliente,
    ciclo: r.ciclo,
    horario: r.horario,
    modo_carga: r.modo_carga,
    relevado_por: r.promotor_nombre,
    razon_social: r.razon_social,
    fecha_carga: r.fecha_carga,
    synced_at: new Date().toISOString(),
  }))

  let upserted = 0
  for (let i = 0; i < filas.length; i += BATCH_SIZE) {
    const chunk = filas.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from("pdv_horarios")
      .upsert(chunk, { onConflict: "id_cliente,ciclo" })
    if (error) throw new Error(`upsert pdv_horarios: ${error.message}`)
    upserted += chunk.length
  }

  return {
    leidos: rows.length,
    upserted,
    ciclos: [...new Set(filas.map((f) => f.ciclo))].sort(),
    duration_ms: Date.now() - t0,
  }
}
