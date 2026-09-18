/**
 * Los numeros de CERRADO vs. horario, para el Arbol del Sueno.
 *
 * Leen la tabla ya materializada (`cerrado_horario_analisis`), que la calcula
 * el cron: aca no se cruza nada. La instancia de Supabase es Micro y esto se
 * consulta en cada vista del arbol.
 *
 * Todo tolera que las tablas no existan todavia (el SQL se aplica a mano en
 * cada tenant, y Misiones no tiene relevamiento de horarios): si no estan,
 * devuelven null y el arbol cae al valor persistido, como hacen TLP y OTIF.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface CerradoHorarioResumen {
  /** Veces que fuimos dentro de la ventana y estaba cerrado. */
  dentro: number
  /** Veces que fuimos fuera de su horario. */
  fuera: number
  /** dentro + fuera: las que entran al calculo. */
  base: number
  /** Todas las veces de CERRADO miradas, clasificables o no. */
  total: number
  /** Pedidos del año (pares cliente×fecha), el denominador del arbol. */
  pedidos: number
  /** dentro / pedidos, en % — el valor del nodo «En horario». */
  pctDentro: number | null
  /** fuera / pedidos, en % — el valor del nodo «Fuera de horario». */
  pctFuera: number | null
  /** dentro / base, en %: la tasa de cumplimiento de horario. */
  tasa: number | null
  /** base / total, en %. Va SIEMPRE al lado de la tasa. */
  cobertura: number | null
}

export interface CerradoHorarioMes {
  mes: number
  dentro: number
  temprano: number
  tarde: number
  siesta: number
  noAbre: number
  borde: number
  sinVh: number
  sinHora: number
  total: number
  tasa: number | null
  cobertura: number | null
}

const num = (v: unknown): number => Number(v ?? 0)
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

export async function cerradoHorarioResumen(
  supabase: SupabaseClient,
  anio: number,
): Promise<CerradoHorarioResumen | null> {
  const { data, error } = await supabase.rpc("cerrado_horario_resumen", {
    p_anio: anio,
  })
  if (error || !data) return null
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
  if (!r) return null
  // Sin nada clasificado todavia no hay numero que mostrar: mejor que el arbol
  // caiga al valor persistido a que dibuje un cero que parece un logro.
  const total = num(r.total)
  if (total === 0) return null
  return {
    dentro: num(r.dentro),
    fuera: num(r.fuera),
    base: num(r.base),
    total,
    pedidos: num(r.pedidos),
    pctDentro: numOrNull(r.pct_dentro),
    pctFuera: numOrNull(r.pct_fuera),
    tasa: numOrNull(r.tasa),
    cobertura: numOrNull(r.cobertura),
  }
}

export async function cerradoHorarioMensual(
  supabase: SupabaseClient,
  anio: number,
): Promise<CerradoHorarioMes[]> {
  const { data, error } = await supabase.rpc("cerrado_horario_mensual", {
    p_anio: anio,
  })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map((r) => ({
    mes: num(r.mes),
    dentro: num(r.dentro),
    temprano: num(r.temprano),
    tarde: num(r.tarde),
    siesta: num(r.siesta),
    noAbre: num(r.no_abre),
    borde: num(r.borde),
    sinVh: num(r.sin_vh),
    sinHora: num(r.sin_hora),
    total: num(r.total),
    tasa: numOrNull(r.tasa),
    cobertura: numOrNull(r.cobertura),
  }))
}
