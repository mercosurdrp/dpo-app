// Regla de HORAS EXTRAS de Distribución Pampeana (dictada por Fausto,
// 2026-07-04, para "Visibilidad de Resultados" — DPO Entrega 2.1).
//
// Se calcula desde la ÚLTIMA fichada de salida (S) del día; la hora de
// entrada NO afecta (llegar tarde no descuenta extras). Dos tipos que se
// acumulan POR SEPARADO (se pagan distinto):
//
// · Lunes a viernes → horas al 50%. La jornada termina 15:00. Escala por
//   hora de salida: 15:00–15:21 → 0 · 15:22–15:44 → 0,5 · 15:45–16:21 → 1 ·
//   y el patrón se repite cada hora (16:22–16:44 → 1,5 · 16:45 → 2 · …).
//   En general, sobre los minutos posteriores a las 15:00: cada hora
//   completa suma 1; el resto 0–21 min → +0 · 22–44 → +0,5 · 45–59 → +1.
// · Sábado → horas al 100%. Si trabajó (fichó), mínimo 2 hs aunque salga
//   antes de las 13:00. Salida después de las 13:00: misma escala contando
//   desde las 11:00 (13:00 ≡ 2 hs · 13:22–13:44 → 2,5 · 13:45 → 3 · …).
// · Domingo: no se trabaja — una fichada en domingo es anomalía de datos:
//   computa 0 y se marca "revisar".
//
// Nota de criterio: la pantalla "Inicio" del empleado (mi-asistencia.ts)
// muestra horas TRABAJADAS con otro criterio (primera E → última S). Acá
// solo importa la salida, por definición de la regla de pago.

export interface MarcaHheeRow {
  legajo: number
  fecha_marca: string
  tipo_marca: "E" | "S"
}

export type TipoHheeDia = "normal" | "sabado" | "sin_salida" | "revisar"

export interface HheeDia {
  /** "YYYY-MM-DD" en hora Argentina. */
  fecha: string
  /** "HH:MM" de la última salida fichada, o null si no hay S ese día. */
  salida: string | null
  hs_50: number
  hs_100: number
  tipo: TipoHheeDia
}

export interface HheeResumen {
  hs_50: number
  hs_100: number
  total: number
}

// Cómo interpretar las marcas almacenadas (mismo criterio que mi-asistencia.ts):
// - false (default): la marca está en UTC verdadero → restar 3 hs.
// - true: el reloj guardó hora Argentina etiquetada como UTC → HH:MM literal.
const MARCAS_EN_HORA_ARGENTINA = process.env.MARCAS_EN_HORA_ARGENTINA === "true"

/** Fecha local ("YYYY-MM-DD") y minutos del día (0..1439) en hora Argentina. */
export function marcaLocal(fechaMarca: string): { fecha: string; minutos: number } {
  if (MARCAS_EN_HORA_ARGENTINA) {
    const m = fechaMarca.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/)
    if (m) return { fecha: m[1], minutos: Number(m[2]) * 60 + Number(m[3]) }
  }
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(fechaMarca) ? fechaMarca : `${fechaMarca}Z`
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000)
  return {
    fecha: d.toISOString().slice(0, 10),
    minutos: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

/** Día de semana ISO (1=lunes … 7=domingo) de una fecha "YYYY-MM-DD". */
function diaSemana(fecha: string): number {
  const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  return dow === 0 ? 7 : dow
}

/**
 * Escala de medias horas sobre minutos por encima del umbral:
 * cada hora completa +1; resto 0–21 → +0 · 22–44 → +0,5 · 45–59 → +1.
 */
export function escalaMediasHoras(minutosExtra: number): number {
  if (minutosExtra <= 0) return 0
  const horas = Math.floor(minutosExtra / 60)
  const resto = minutosExtra % 60
  return horas + (resto >= 45 ? 1 : resto >= 22 ? 0.5 : 0)
}

const FIN_JORNADA_LV = 15 * 60 // 15:00
const BASE_SABADO = 11 * 60 // sábado: se cuenta desde las 11:00
const SALIDA_SOSPECHOSA = 23 * 60 // salida ≥ 23:00 → computa pero "revisar"

/**
 * HHEE de un día a partir de la última salida fichada (o null si no hubo S).
 * `tuvoMarcas` = hubo alguna fichada ese día (para el mínimo del sábado).
 */
export function calcularHheeDia(
  fecha: string,
  salidaMin: number | null,
  tuvoMarcas: boolean,
): HheeDia {
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  const salida = salidaMin !== null ? fmt(salidaMin) : null
  const dow = diaSemana(fecha)

  if (!tuvoMarcas) return { fecha, salida: null, hs_50: 0, hs_100: 0, tipo: "normal" }

  // Domingo: no se trabaja — anomalía.
  if (dow === 7) return { fecha, salida, hs_50: 0, hs_100: 0, tipo: "revisar" }

  // Sábado: al 100%, mínimo 2 hs por haber trabajado.
  if (dow === 6) {
    const escala = salidaMin !== null ? escalaMediasHoras(salidaMin - BASE_SABADO) : 0
    return {
      fecha,
      salida,
      hs_50: 0,
      hs_100: Math.max(2, escala),
      tipo: salidaMin !== null && salidaMin >= SALIDA_SOSPECHOSA ? "revisar" : "sabado",
    }
  }

  // Lunes a viernes: al 50% desde las 15:00.
  if (salidaMin === null) return { fecha, salida: null, hs_50: 0, hs_100: 0, tipo: "sin_salida" }
  return {
    fecha,
    salida,
    hs_50: escalaMediasHoras(salidaMin - FIN_JORNADA_LV),
    hs_100: 0,
    tipo: salidaMin >= SALIDA_SOSPECHOSA ? "revisar" : "normal",
  }
}

/**
 * Procesa las marcas de un rango y devuelve, POR LEGAJO, los días con
 * actividad y sus HHEE (solo días que tuvieron alguna fichada).
 */
export function hheePorLegajo(marcas: MarcaHheeRow[]): Map<number, HheeDia[]> {
  // legajo → fecha → { ultimaSalida, tuvoMarcas }
  const porLegajo = new Map<number, Map<string, { salida: number | null }>>()
  for (const m of marcas) {
    const { fecha, minutos } = marcaLocal(m.fecha_marca)
    let dias = porLegajo.get(m.legajo)
    if (!dias) {
      dias = new Map()
      porLegajo.set(m.legajo, dias)
    }
    let dia = dias.get(fecha)
    if (!dia) {
      dia = { salida: null }
      dias.set(fecha, dia)
    }
    if (m.tipo_marca === "S" && (dia.salida === null || minutos > dia.salida)) {
      dia.salida = minutos
    }
  }

  const out = new Map<number, HheeDia[]>()
  for (const [legajo, dias] of porLegajo) {
    const rows: HheeDia[] = []
    for (const [fecha, d] of dias) {
      rows.push(calcularHheeDia(fecha, d.salida, true))
    }
    rows.sort((a, b) => a.fecha.localeCompare(b.fecha))
    out.set(legajo, rows)
  }
  return out
}

/** Acumula los días en el resumen del período. */
export function resumirHhee(dias: HheeDia[]): HheeResumen {
  let hs50 = 0
  let hs100 = 0
  for (const d of dias) {
    hs50 += d.hs_50
    hs100 += d.hs_100
  }
  return { hs_50: hs50, hs_100: hs100, total: hs50 + hs100 }
}
