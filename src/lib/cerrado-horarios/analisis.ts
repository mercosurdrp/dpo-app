/**
 * Recalcula el analisis de CERRADO vs. horario para un rango de fechas.
 *
 * El cruce pesado lo hace la base (`cerrado_horario_casos`); aca solo se
 * clasifica cada caso con la funcion pura y se materializa el resultado.
 *
 * Reconcilia: si un rechazo dejo de existir —el sync de Chess borra las lineas
 * que el origen ya no reporta— su fila de analisis se va con el. Si no, el
 * indicador arrastraria casos fantasma.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  clasificar,
  calcularTasa,
  MARGEN_MIN_DEFAULT,
  type Clasificacion,
  type HorarioPdv,
} from "@/lib/cerrado-horarios/clasificar"

const BATCH_SIZE = 500

interface CasoCrudo {
  id_cliente: number
  dia: string
  nombre_cliente: string | null
  hora_visita: string | null
  fuente_hora: string | null
  dow: number
  ciclo_vh: string | null
  horario: HorarioPdv | null
}

export interface ResultadoAnalisis {
  desde: string
  hasta: string
  casos: number
  upserted: number
  borrados: number
  /** Cuantas veces cayo en cada balde. */
  por_clasificacion: Record<string, number>
  dentro: number
  fuera: number
  /** dentro / (dentro + fuera), en %. */
  tasa: number | null
  /** Que porcion del total se pudo clasificar, en %. Va SIEMPRE con la tasa. */
  cobertura: number | null
  duration_ms: number
}

export async function recalcularCerradoHorarios(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
  margenMin: number = MARGEN_MIN_DEFAULT,
): Promise<ResultadoAnalisis> {
  const t0 = Date.now()

  const { data, error } = await supabase.rpc("cerrado_horario_casos", {
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw new Error(`cerrado_horario_casos: ${error.message}`)
  const casos = (data ?? []) as CasoCrudo[]

  const filas = casos.map((c) => {
    const { clasificacion, desvioMin } = clasificar(
      c.hora_visita,
      c.dow,
      c.horario,
      margenMin,
    )
    return {
      id_cliente: c.id_cliente,
      dia: c.dia,
      nombre_cliente: c.nombre_cliente,
      hora_visita: c.hora_visita,
      fuente_hora: c.fuente_hora,
      // El ciclo solo tiene sentido si la ventana se llego a usar: sin horario
      // el caso es SIN_VH y guardar un ciclo ahi confunde al que lo lee.
      ciclo_vh: c.horario ? c.ciclo_vh : null,
      clasificacion,
      desvio_min: desvioMin,
      calculado_at: new Date().toISOString(),
    }
  })

  let upserted = 0
  for (let i = 0; i < filas.length; i += BATCH_SIZE) {
    const chunk = filas.slice(i, i + BATCH_SIZE)
    const { error: errUp } = await supabase
      .from("cerrado_horario_analisis")
      .upsert(chunk, { onConflict: "id_cliente,dia" })
    if (errUp) throw new Error(`upsert cerrado_horario_analisis: ${errUp.message}`)
    upserted += chunk.length
  }

  // Reconciliacion: lo que quedo en la tabla dentro del rango y ya no es un
  // caso vigente. Se compara por (cliente, dia) porque esa es la unidad.
  const vigentes = new Set(filas.map((f) => `${f.id_cliente}|${f.dia}`))
  const { data: existentes, error: errSel } = await supabase
    .from("cerrado_horario_analisis")
    .select("id_cliente, dia")
    .gte("dia", desde)
    .lte("dia", hasta)
    // Ordenar por la columna que se filtra, no por la PK: con filtro de fecha,
    // ordenar por id anula el indice y hace seq scan.
    .order("dia", { ascending: true })
  if (errSel) throw new Error(`select cerrado_horario_analisis: ${errSel.message}`)

  const sobrantes = (existentes ?? []).filter(
    (e) => !vigentes.has(`${e.id_cliente}|${e.dia}`),
  )
  let borrados = 0
  for (const s of sobrantes) {
    const { error: errDel } = await supabase
      .from("cerrado_horario_analisis")
      .delete()
      .eq("id_cliente", s.id_cliente)
      .eq("dia", s.dia)
    if (errDel) throw new Error(`delete cerrado_horario_analisis: ${errDel.message}`)
    borrados++
  }

  const por_clasificacion: Record<string, number> = {}
  for (const f of filas) {
    por_clasificacion[f.clasificacion] = (por_clasificacion[f.clasificacion] ?? 0) + 1
  }
  const tasa = calcularTasa(filas.map((f) => f.clasificacion as Clasificacion))

  return {
    desde,
    hasta,
    casos: casos.length,
    upserted,
    borrados,
    por_clasificacion,
    dentro: tasa.dentro,
    fuera: tasa.fuera,
    tasa: tasa.tasa,
    cobertura: tasa.cobertura,
    duration_ms: Date.now() - t0,
  }
}
