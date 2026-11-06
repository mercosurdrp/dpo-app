// Juicio de un PI contra su meta. Es la ÚNICA función que decide el semáforo:
// la tarjeta, la tira de meses, el resumen de salud y los chips de filtro leen
// de acá, así un "Fuera de meta 4" nunca cuenta distinto de lo que se ve.

import type { FlotaMeta } from "@/actions/flota-indicadores"
import type { EstadoKpi } from "../kpi-card"

export type { EstadoKpi }

/** Por qué un PI quedó sin semáforo. */
export type MotivoSinJuzgar = "sin_dato" | "sin_meta" | "mes_en_curso" | "poca_cobertura"

export function cumpleMeta(valor: number, meta: FlotaMeta | null): boolean | null {
  if (!meta || meta.meta == null) return null
  return meta.comparador === "<=" ? valor <= Number(meta.meta) : valor >= Number(meta.meta)
}

/**
 * Margen dentro del cual un PI que no llega a la meta se muestra en AMARILLO en
 * vez de rojo: 10 % de la meta.
 *
 * 🚨 Antes el semáforo era binario y 94,9 % contra una meta de 95 % se pintaba
 * exactamente igual que un 20 %. Con metas exigentes —que es lo correcto— eso
 * dejaba el tablero entero en rojo y el rojo dejaba de querer decir algo.
 * El amarillo no afloja ninguna meta: sigue sin cumplir, pero se distingue "a un
 * pelo" de "lejos".
 */
export const MARGEN_ALERTA = 0.1

export interface OpcionesJuicio {
  acumulativo?: boolean
  /** El mes todavía está corriendo (siempre contra el mes REAL, nunca el foco). */
  parcial?: boolean
  /** Cobertura del PI, en % (n ÷ nTotal), cuando el PI la informa. */
  cobertura?: number | null
  coberturaMinima?: number
}

/**
 * Semáforo de un PI, con el motivo cuando no se juzga.
 *
 * 🚨 `parcial` = el mes todavía está corriendo. Para los KPI ACUMULATIVOS eso
 * hace que el número no signifique nada todavía y se devuelve neutro: comparar
 * 8 tareas de CIL contra la meta de 30 el día 7 pinta rojo algo que va bien, y
 * comparar el costo del mes contra el tope el día 2 pinta verde algo que no se
 * sabe. Los porcentuales sí se evalúan siempre: valen igual el día 7 que el 30.
 *
 * El orden de las reglas es el de siempre y no se toca: sin dato → sin meta →
 * acumulativo parcial → cobertura → cumple → meta 0 → margen.
 */
export function juzgarKpi(
  valor: number | null,
  meta: FlotaMeta | null,
  opts: OpcionesJuicio = {},
): { estado: EstadoKpi; motivo: MotivoSinJuzgar | null } {
  if (valor == null) return { estado: "neutro", motivo: "sin_dato" }
  const cumple = cumpleMeta(valor, meta)
  if (cumple == null) return { estado: "neutro", motivo: "sin_meta" }
  if (opts.acumulativo && opts.parcial) return { estado: "neutro", motivo: "mes_en_curso" }
  // 🚨 Sin cobertura suficiente el KPI no se juzga: el cumplimiento del plan
  // preventivo mostraba 100 % en verde calculado sobre 13 de 122 tareas. Un
  // verde así no dice "el plan se cumple", dice "casi nadie cargó nada", y es
  // exactamente lo que hay que ver.
  if (
    opts.coberturaMinima != null &&
    opts.cobertura != null &&
    opts.cobertura < opts.coberturaMinima
  ) {
    return { estado: "neutro", motivo: "poca_cobertura" }
  }
  if (cumple) return { estado: "ok", motivo: null }

  const m = Number(meta!.meta)
  // Con meta 0 ("cero services vencidos") no hay margen posible: 1 es 1.
  if (m === 0) return { estado: "critico", motivo: null }
  const cerca =
    meta!.comparador === "<="
      ? valor <= m * (1 + MARGEN_ALERTA)
      : valor >= m * (1 - MARGEN_ALERTA)
  return { estado: cerca ? "alerta" : "critico", motivo: null }
}

export const estadoDeKpi = (
  valor: number | null,
  meta: FlotaMeta | null,
  opts: OpcionesJuicio = {},
): EstadoKpi => juzgarKpi(valor, meta, opts).estado

/** n ÷ nTotal en %, o null si el PI no informa universo. */
export const coberturaDe = (p: { n?: number | null; nTotal?: number | null } | undefined) =>
  p?.n != null && p.nTotal != null && p.nTotal > 0 ? (p.n / p.nTotal) * 100 : null

export const MOTIVO_LABEL: Record<MotivoSinJuzgar, string> = {
  sin_dato: "sin dato",
  sin_meta: "sin meta definida",
  mes_en_curso: "se juzga al cierre del mes",
  poca_cobertura: "poca cobertura",
}
