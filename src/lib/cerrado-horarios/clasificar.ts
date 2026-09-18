/**
 * Clasificar una vez de CERRADO contra la ventana horaria relevada del PDV.
 *
 * Esta es la parte que decide de quien es la culpa, asi que vive separada del
 * acceso a datos y no toca ni Supabase ni la base Mercosur: entra la hora y la
 * ventana, sale la etiqueta. Se puede correr contra casos a mano.
 *
 * La regla de fondo: si fuimos DENTRO de la ventana que el cliente declaro y
 * estaba cerrado, el problema es del cliente. Si fuimos fuera, el problema es
 * nuestro. Lo que no se puede saber NO se reparte a conveniencia: cae en su
 * propio balde y queda afuera del denominador.
 */

/** Como llega el horario relevado: una entrada por dia de la semana. */
export interface DiaHorario {
  abre: boolean
  /** Primer tramo, ["08:00", "13:00"]. null si ese dia no abre. */
  t1: [string, string] | null
  /** Segundo tramo de un horario partido. null si es corrido. */
  t2: [string, string] | null
}

export type HorarioPdv = Partial<Record<DiaSemana, DiaHorario>>

export type DiaSemana = "dom" | "lun" | "mar" | "mie" | "jue" | "vie" | "sab"

/** Indice 0..6 = getDay() de JS y extract(dow) de Postgres: 0 es domingo. */
export const DIAS: readonly DiaSemana[] = [
  "dom",
  "lun",
  "mar",
  "mie",
  "jue",
  "vie",
  "sab",
] as const

export type Clasificacion =
  /** Fuimos dentro de su horario y estaba cerrado. Culpa del cliente. */
  | "DENTRO"
  /** Llegamos antes de que abriera. Nuestro. */
  | "TEMPRANO"
  /** Llegamos despues de que cerrara. Nuestro. */
  | "TARDE"
  /** Caimos entre los dos tramos de un horario partido. Nuestro. */
  | "SIESTA"
  /** Fuimos un dia que el cliente no abre nunca. Nuestro, y el mas evitable. */
  | "NO_ABRE"
  /** A minutos del borde: no se le imputa a nadie. */
  | "BORDE"
  /** Ese cliente no tiene horario relevado. Fuera del denominador. */
  | "SIN_VH"
  /** No sabemos a que hora fuimos. Fuera del denominador. */
  | "SIN_HORA"

/**
 * Minutos de gracia a cada lado de la ventana.
 *
 * No es un capricho: la hora que guarda Foxtrot es `completed_timestamp`, o sea
 * cuando el chofer CERRO la parada en la app, no cuando llego. Trae un atraso
 * estructural de minutos. Sin un margen explicito, cada caso de borde termina
 * en una discusion y el indicador pierde autoridad.
 */
export const MARGEN_MIN_DEFAULT = 15

export interface Resultado {
  clasificacion: Clasificacion
  /** Minutos hasta el borde mas cercano. 0 si cayo adentro, null si no aplica. */
  desvioMin: number | null
}

/** "08:30" -> 510. null si no es una hora valida. */
export function aMinutos(hhmm: string | null | undefined): number | null {
  if (typeof hhmm !== "string") return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Los tramos utilizables de un dia, ya en minutos y descartando la basura. */
function tramosDe(dia: DiaHorario): Array<[number, number]> {
  const salida: Array<[number, number]> = []
  for (const tramo of [dia.t1, dia.t2]) {
    if (!Array.isArray(tramo) || tramo.length !== 2) continue
    const ini = aMinutos(tramo[0])
    const fin = aMinutos(tramo[1])
    // Un tramo al reves o incompleto es un error de carga: se ignora en vez de
    // inventar una ventana que nadie declaro.
    if (ini === null || fin === null || fin <= ini) continue
    salida.push([ini, fin])
  }
  return salida.sort((a, b) => a[0] - b[0])
}

/**
 * Clasifica una visita.
 *
 * @param horaVisita  hora local "HH:MM" en que pasamos, o null si no se sabe
 * @param diaSemana   0 domingo .. 6 sabado (getDay / extract dow)
 * @param horario     el JSON relevado del cliente, o null si no tiene
 */
export function clasificar(
  horaVisita: string | null,
  diaSemana: number,
  horario: HorarioPdv | null,
  margenMin: number = MARGEN_MIN_DEFAULT,
): Resultado {
  const t = aMinutos(horaVisita)
  if (t === null) return { clasificacion: "SIN_HORA", desvioMin: null }
  if (!horario) return { clasificacion: "SIN_VH", desvioMin: null }

  const dia = horario[DIAS[diaSemana]]
  // Sin la entrada de ese dia no hay nada contra que comparar: es un
  // relevamiento incompleto, y se trata como si no existiera.
  if (!dia) return { clasificacion: "SIN_VH", desvioMin: null }
  if (dia.abre === false) return { clasificacion: "NO_ABRE", desvioMin: null }

  const tramos = tramosDe(dia)
  if (tramos.length === 0) return { clasificacion: "SIN_VH", desvioMin: null }

  // Adentro de cualquiera de los tramos: no hay mas que mirar.
  for (const [ini, fin] of tramos) {
    if (t >= ini && t <= fin) return { clasificacion: "DENTRO", desvioMin: 0 }
  }

  // Afuera: contra que borde quedo mas cerca, y de que lado.
  let mejor: { lado: "TEMPRANO" | "TARDE"; desvio: number } | null = null
  for (const [ini, fin] of tramos) {
    const antes = t < ini
    const desvio = antes ? ini - t : t - fin
    if (mejor === null || desvio < mejor.desvio) {
      mejor = { lado: antes ? "TEMPRANO" : "TARDE", desvio }
    }
  }
  if (mejor === null) return { clasificacion: "SIN_VH", desvioMin: null }

  if (mejor.desvio <= margenMin) {
    return { clasificacion: "BORDE", desvioMin: mejor.desvio }
  }

  // La siesta se detecta por la forma del horario, no por un rango fijo: es
  // caer en el hueco ENTRE dos tramos. Va aparte de "tarde" porque la accion es
  // otra — resecuenciar la ruta, no acortarla.
  const enElHueco =
    tramos.length >= 2 && t > tramos[0][1] && t < tramos[tramos.length - 1][0]
  if (enElHueco) return { clasificacion: "SIESTA", desvioMin: mejor.desvio }

  return { clasificacion: mejor.lado, desvioMin: mejor.desvio }
}

/** Los baldes que entran al indicador: el resto es cobertura, no resultado. */
export const CLASIFICABLES: readonly Clasificacion[] = [
  "DENTRO",
  "TEMPRANO",
  "TARDE",
  "SIESTA",
  "NO_ABRE",
] as const

/** Las que son responsabilidad nuestra (ruteo), no del cliente. */
export const NUESTRAS: readonly Clasificacion[] = [
  "TEMPRANO",
  "TARDE",
  "SIESTA",
  "NO_ABRE",
] as const

export interface Tasa {
  /** Veces que fuimos en horario y estaba cerrado. */
  dentro: number
  /** Veces que fuimos fuera de su horario. */
  fuera: number
  /** Las que entran al calculo. */
  base: number
  /** Total mirado, incluyendo lo que no se pudo clasificar. */
  total: number
  /** dentro / base, en %. null si no hay base. */
  tasa: number | null
  /** base / total, en %: SIEMPRE se publica al lado de la tasa. */
  cobertura: number | null
}

/**
 * La tasa, con su cobertura al lado.
 *
 * Las dos juntas y no por separado a proposito: un porcentaje sin la base sobre
 * la que se calculo es un numero que miente, y aca la base va a ser parcial por
 * un buen tiempo.
 */
export function calcularTasa(clasificaciones: Clasificacion[]): Tasa {
  const total = clasificaciones.length
  let dentro = 0
  let fuera = 0
  for (const c of clasificaciones) {
    if (c === "DENTRO") dentro++
    else if ((NUESTRAS as readonly string[]).includes(c)) fuera++
  }
  const base = dentro + fuera
  return {
    dentro,
    fuera,
    base,
    total,
    tasa: base > 0 ? (100 * dentro) / base : null,
    cobertura: total > 0 ? (100 * base) / total : null,
  }
}
