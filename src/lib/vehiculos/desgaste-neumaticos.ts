import { POSICION_AUXILIO } from "@/lib/vehiculos/neumaticos-layout"
import type { EjeNeumatico } from "@/lib/vehiculos/neumaticos-layout"
import { PROF_MIN_MM } from "@/lib/flota/neumaticos-control"

/**
 * Desgaste real de las cubiertas, medido en mm de dibujo por cada 1.000 km.
 *
 * Por qué existe: hasta ahora la vida de una cubierta se estimaba con un número
 * fijo por tipo (`VIDA_UTIL_DEFAULT_KM`: 100.000 km una nueva, 50.000 una
 * recapada). Eso no distingue una unidad que come gomas de otra que no, ni una
 * marca de otra, ni avisa que la 1I se está gastando al doble que la 1D —que es
 * el síntoma clásico de alineación o presión, no de la goma—. La ronda mensual
 * de DPO 3.4 ya deja el dato en `mantenimiento_neumatico_mediciones`: acá se lo
 * convierte en una tasa y en una proyección de cambio.
 *
 * 🚨 Cuatro cosas que hacen mentir al cálculo si no se las contempla, todas
 * vistas en los datos reales de Pampeana al 21/08/2026:
 *
 *  1. Una cubierta que vuelve del recapador ARRANCA CON MÁS GOMA que la que
 *     tenía. Ocho cubiertas (AE908DG y AF028YB) dan desgaste negativo si se
 *     toma la primera y la última medición de toda su historia. Por eso el
 *     cálculo trabaja sobre un TRAMO DE VIDA: se corta en el último montaje y,
 *     por las dudas, en cualquier salto de profundidad hacia arriba.
 *  2. Un tramo corto es ruido, no medición. La 2DE del AF399KY marcaría 1,58
 *     mm/1.000 km sobre 1.533 km; con un calibre que lee de a 0,5 mm eso no
 *     significa nada. De ahí `MIN_KM_TRAMO`.
 *  3. La rueda de auxilio viaja pero no apoya: hereda los km de la unidad y
 *     aparece gastándose sola (el AUX del OJA403 figuraría con 13 mm comidos).
 *     Se excluye, igual que hace `vidaNeumatico`.
 *  4. 82 de las 236 mediciones no traen km. Se completan con el odómetro de las
 *     lecturas diarias; si no hay ninguna lectura cerca, la cubierta queda
 *     "sin datos" — nunca en cero, que se leería como "no se gasta".
 */

/**
 * Km mínimos entre la primera y la última medición del tramo para que la tasa
 * signifique algo. Con 3.000 km, un error de lectura de 0,5 mm se traduce en
 * 0,17 mm/1.000 km de incertidumbre: alto, pero ya del orden de la señal.
 */
export const MIN_KM_TRAMO = 3_000

/**
 * Desgaste mínimo medible en el tramo. Por debajo de esto la diferencia se
 * explica por el calibre y no por la goma.
 */
export const MIN_DELTA_MM = 0.3

/**
 * Un salto de profundidad hacia arriba mayor que esto solo puede ser un
 * recapado o un cambio de cubierta que nadie registró como movimiento: corta el
 * tramo. Por debajo es el calibre (dos operarios no miden igual el mismo taco).
 */
const SALTO_RECAPADO_MM = 0.4

/** Días de tolerancia para tomar una lectura de odómetro como km de la medición. */
export const TOLERANCIA_ODOMETRO_DIAS = 7

/** Profundidad a la que la cubierta sale de circulación (misma que el KPI). */
export const PROF_OBJETIVO_MM = PROF_MIN_MM

/**
 * Desde cuándo una fila de `mantenimiento_neumatico_mediciones` es una MEDICIÓN.
 *
 * 🚨 Lo anterior a esta fecha NO se midió con calibre: es el valor nominal que
 * se carga al dar de alta la cubierta (`registrarMedicionInicial`). Está a la
 * vista en los datos —revisadas las 243 filas el 25/08/2026—: antes de
 * julio/2026 son números redondos y repetidos (2025-03 seis filas en 10;
 * 2025-07 lotes de 10, 12,5, 15 y 20; 2025-12 nueve en 12; 2026-06 ocho en 13).
 * Las mediciones de verdad arrancan el 10/07/2026 y se reconocen por los dos
 * decimales del calibre: 4,68 / 5,15 / 10,84.
 *
 * Por qué importa: ese nominal trae ~1,5–2 mm de más contra lo que después mide
 * el calibre, y como punto de arranque del tramo mete ese offset entero en el
 * numerador. El sesgo quedaba a la vista: el AC165AJ 2IE perdía 1,90 mm en
 * 34.047 km (0,056 mm/1.000 km) y el AF664NY 1D perdía 1,96 mm en 6.286 km
 * (0,312) — la misma goma, cinco veces la tasa, según cuán vieja fuera el alta.
 * Las 33 cubiertas que tenían tasa arrancaban TODAS de un nominal.
 *
 * El nominal sigue visible en la evolución: como profundidad registrada es un
 * dato real; lo que no es es una medición contra la que restar.
 *
 * A futuro esto tiene que salir de una columna `origen` ('alta' | 'ronda') y no
 * de una fecha, porque un alta cargada el mes que viene también va a ser
 * nominal. La fecha es lo único que se puede aplicar sobre lo ya cargado.
 */
export const INICIO_MEDICIONES = "2026-07-01"

/**
 * Ventana sobre la que se mide la tasa.
 *
 * 🚨 Quedó UNA sola, y no es una simplificación a medio hacer: con el piso de
 * `INICIO_MEDICIONES` no hay historia anterior a julio/2026, así que "últimos 6
 * meses" y "últimos 12" agarraban exactamente los mismos puntos que "todo" y el
 * selector ofrecía tres veces el mismo número. Vuelve a tener sentido cuando
 * haya más de un año de rondas.
 *
 * Tampoco hay opción "por mes": el dibujo se mide una vez por mes (ronda de DPO
 * 3.4) y entre dos rondas un camión hace ~2.000 km, donde el desgaste real
 * (~0,3 mm) es MENOR que la dispersión del calibre. Medido sobre las rondas de
 * julio y agosto de 2026: la mitad de los deltas dan negativo (AF028YB 2IE
 * −2,94 mm, AF399KY 2DI −1,90 mm) y en el mismo eje del AF399KY una cubierta da
 * +2,42 y la de al lado −1,90. La lectura mensual honesta no es la tasa sino la
 * profundidad ronda por ronda: eso es `PuntoEvolucion`.
 */
export type PeriodoDesgaste = "todo"

export const PERIODOS_DESGASTE: PeriodoDesgaste[] = ["todo"]

export const PERIODO_DESGASTE_LABEL: Record<PeriodoDesgaste, string> = {
  todo: "Desde el inicio de las rondas",
}

/**
 * Una profundidad medida, con la cubierta y la posición donde estaba. Es la
 * materia prima del gráfico de evolución: la serie va por POSICIÓN, no por
 * cubierta, porque lo que el taller mira es "cómo viene la 1I de este camión".
 * Un salto hacia arriba en una posición significa que ahí entró goma nueva o
 * recapada — no es un error del gráfico.
 */
export interface PuntoEvolucion {
  neumatico_id: string
  dominio: string | null
  posicion: string | null
  numero: string | null
  fecha: string
  profundidad_mm: number
}

export type MotivoSinTasa =
  | "auxilio"
  | "sin_mediciones"
  | "un_solo_punto"
  | "sin_km"
  | "tramo_corto"
  | "sin_desgaste"

export const MOTIVO_SIN_TASA_LABEL: Record<MotivoSinTasa, string> = {
  auxilio: "Auxilio (no rueda)",
  sin_mediciones: "Sin mediciones de ronda",
  un_solo_punto: "Una sola ronda medida",
  sin_km: "Mediciones de ronda sin km",
  tramo_corto: `Menos de ${MIN_KM_TRAMO.toLocaleString("es-AR")} km medidos`,
  sin_desgaste: "Todavía sin desgaste medible",
}

export interface PuntoMedicion {
  fecha: string
  profundidad_mm: number | null
  km: number | null
  /**
   * 'alta' = dibujo nominal declarado (alta de la cubierta o retorno del
   * recapado). 'ronda' = medido con calibre. Sólo la ronda entra al cálculo.
   * Opcional porque no todo llamador la trae; sin ella manda el piso de fecha.
   */
  origen?: "alta" | "ronda" | null
}

export interface MovimientoCubierta {
  tipo: "montaje" | "desmontaje" | "baja"
  fecha: string
  km: number | null
}

/** Lo mínimo que el cálculo necesita saber de una cubierta. */
export interface CubiertaDesgaste {
  id: string
  numero: string | null
  marca: string | null
  medida: string | null
  tipo: "nuevo" | "recapado"
  dominio: string | null
  posicion: string | null
  eje: EjeNeumatico | null
  profundidad_actual_mm: number | null
  fecha_instalacion: string | null
}

export interface DesgasteNeumatico {
  neumatico_id: string
  /** mm de dibujo consumidos cada 1.000 km. NULL = no se pudo medir (ver `motivo`). */
  mmPorMilKm: number | null
  /** Inversa legible para el taller: cuántos km aguanta por cada mm de goma. */
  kmPorMm: number | null
  /** Km del tramo efectivamente medido (no los km de vida de la cubierta). */
  kmMedidos: number | null
  /**
   * mm consumidos en ese tramo SEGÚN LA RECTA ajustada (pendiente × km), no la
   * resta de la primera contra la última medición. Es lo que corresponde ahora
   * que la tasa sale de una regresión: si el último punto vino con el calibre
   * corrido, la resta se lo come entero y la recta lo promedia.
   */
  mmGastados: number | null
  /** La resta cruda primera−última, para poder mostrar el dato observado. */
  mmObservados: number | null
  /**
   * Qué tan bien la recta explica los puntos (0 a 1). Es la medida honesta de
   * si el número ya sirve: con dos rondas siempre da 1 y no dice nada; con
   * cinco o seis, un R² alto es lo que separa una tendencia de una nube.
   * NULL con menos de tres puntos.
   */
  r2: number | null
  desde: string | null
  hasta: string | null
  /** Cuántas mediciones con profundidad entraron en el tramo. */
  puntos: number
  /**
   * Los puntos del tramo con km resuelto (km acumulado y profundidad). Salen
   * acá para que la tasa agregada por unidad+eje pueda juntar los de las 6
   * cubiertas del eje: agrupar tasas ya calculadas dejaba afuera justamente a
   * las que todavía no llegan al piso individual, que son la mayoría.
   */
  tramoPuntos: Array<{ fecha: string; km: number; prof: number }>
  /** Km que le quedan hasta PROF_OBJETIVO_MM, al ritmo medido. */
  kmHastaCambio: number | null
  diasHastaCambio: number | null
  /** Fecha estimada de cambio (ISO). Necesita la tasa de km/día de la unidad. */
  fechaCambio: string | null
  motivo: MotivoSinTasa | null
}

// ---------------------------------------------------------------- odómetro

/** Lectura de odómetro de una unidad, para completar mediciones sin km. */
export interface LecturaOdometro {
  fecha: string
  km: number
}

function diasEntre(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86_400_000
  )
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T12:00:00")
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Odómetro de una unidad en una fecha, tomando la lectura más cercana dentro de
 * `TOLERANCIA_ODOMETRO_DIAS`. Devuelve NULL si no hay ninguna cerca: preferimos
 * no calcular a calcular con un km inventado.
 */
export function odometroEnFecha(
  lecturas: LecturaOdometro[] | undefined,
  fecha: string
): number | null {
  if (!lecturas?.length) return null
  let mejor: LecturaOdometro | null = null
  let mejorDist = Infinity
  for (const l of lecturas) {
    const d = Math.abs(diasEntre(l.fecha, fecha))
    if (d < mejorDist) {
      mejorDist = d
      mejor = l
    }
  }
  return mejor != null && mejorDist <= TOLERANCIA_ODOMETRO_DIAS ? mejor.km : null
}

// ------------------------------------------------------------------ tramo

interface PuntoResuelto {
  fecha: string
  prof: number
  km: number | null
}

/**
 * Recorta el historial al tramo de vida vigente: desde el último montaje (o la
 * fecha de instalación) y descartando todo lo anterior al último salto de
 * profundidad hacia arriba, que delata un recapado.
 */
function tramoVigente(
  puntos: PuntoResuelto[],
  movimientos: MovimientoCubierta[],
  fechaInstalacion: string | null
): PuntoResuelto[] {
  let corte: string | null = fechaInstalacion
  for (const m of movimientos) {
    if (m.tipo !== "montaje") continue
    if (corte == null || m.fecha > corte) corte = m.fecha
  }
  // El montaje se registra el mismo día que a veces se mide la cubierta recién
  // puesta: esa medición SÍ entra (es el punto de arranque del tramo).
  let vigentes = corte ? puntos.filter((p) => p.fecha >= corte) : puntos
  // Si el corte dejó menos de dos puntos, el montaje es más nuevo que el
  // historial útil: no hay nada que medir todavía, pero tampoco tiene sentido
  // volver al historial de la vuelta anterior.

  // Salto hacia arriba = goma nueva sin movimiento registrado. Se arranca ahí.
  for (let i = vigentes.length - 1; i > 0; i--) {
    if (vigentes[i].prof - vigentes[i - 1].prof > SALTO_RECAPADO_MM) {
      vigentes = vigentes.slice(i)
      break
    }
  }
  return vigentes
}

/**
 * Pendiente de desgaste por mínimos cuadrados: cuántos mm baja el dibujo por km.
 *
 * Por qué una recta y no la resta primera−última: el calibre tiene una
 * dispersión de ±1–2 mm y el desgaste real de un mes es de ~0,3 mm. Con la
 * resta, TODO el error de esos dos puntos entra en el numerador —por eso en las
 * rondas de julio y agosto de 2026 la mitad de los deltas daban negativo, y en
 * el mismo eje del AF399KY una cubierta daba +2,42 y la de al lado −1,90—.
 * Ajustando una recta sobre las N rondas el ruido cae con √N, así que cada
 * ronda que se suma mejora el número en vez de sólo estirar el tramo.
 *
 * Devuelve la pendiente en mm/km (positiva = se gasta) y el R². Con dos puntos
 * la recta pasa por los dos y el R² es 1: no informa nada, se devuelve null.
 */
function pendienteDesgaste(
  puntos: Array<{ km: number; prof: number }>
): { mmPorKm: number; r2: number | null } | null {
  const n = puntos.length
  if (n < 2) return null
  let sx = 0
  let sy = 0
  for (const p of puntos) {
    sx += p.km
    sy += p.prof
  }
  const mx = sx / n
  const my = sy / n
  let sxy = 0
  let sxx = 0
  for (const p of puntos) {
    sxy += (p.km - mx) * (p.prof - my)
    sxx += (p.km - mx) * (p.km - mx)
  }
  // Todas las mediciones al mismo km (unidad parada entre rondas): sin recta.
  if (sxx <= 0) return null
  const pendiente = sxy / sxx

  let r2: number | null = null
  if (n >= 3) {
    let ssTot = 0
    let ssRes = 0
    for (const p of puntos) {
      const esperado = my + pendiente * (p.km - mx)
      ssTot += (p.prof - my) * (p.prof - my)
      ssRes += (p.prof - esperado) * (p.prof - esperado)
    }
    r2 = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : null
  }

  // La profundidad BAJA con los km: la pendiente del ajuste es negativa y el
  // desgaste es su opuesto.
  return { mmPorKm: -pendiente, r2 }
}

/**
 * Calcula el desgaste por km de una cubierta.
 *
 * @param n cubierta
 * @param mediciones su historial (en cualquier orden)
 * @param movimientos sus montajes/desmontajes, para cortar el tramo de vida
 * @param lecturas odómetro de la unidad, para completar mediciones sin km
 * @param kmDia ritmo de la unidad, para pasar de km restantes a fecha
 * @param hoy fecha de referencia (ISO) para proyectar el cambio
 */
export function desgasteNeumatico(
  n: CubiertaDesgaste,
  mediciones: PuntoMedicion[],
  movimientos: MovimientoCubierta[],
  lecturas: LecturaOdometro[] | undefined,
  kmDia: number | null,
  hoy: string
): DesgasteNeumatico {
  const vacio = (motivo: MotivoSinTasa, extra?: Partial<DesgasteNeumatico>): DesgasteNeumatico => ({
    neumatico_id: n.id,
    mmPorMilKm: null,
    kmPorMm: null,
    kmMedidos: null,
    mmGastados: null,
    mmObservados: null,
    r2: null,
    desde: null,
    hasta: null,
    puntos: 0,
    tramoPuntos: [],
    kmHastaCambio: null,
    diasHastaCambio: null,
    fechaCambio: null,
    motivo,
    ...extra,
  })

  if (n.posicion === POSICION_AUXILIO) return vacio("auxilio")

  // 🚨 El piso de `INICIO_MEDICIONES` va acá y no en el llamador: cualquiera
  // que use esta función tiene que quedar afuera del nominal del alta, o vuelve
  // el sesgo que hacía que la misma goma diera 0,056 o 0,312 mm/1.000 km según
  // la antigüedad del alta.
  // Dos barreras contra el nominal, y las dos hacen falta: `origen` es lo que
  // va a funcionar de acá en adelante (un alta cargada mañana también es
  // nominal y cae del lado bueno de la fecha), y el piso de fecha cubre
  // cualquier fila vieja que quedara sin marcar.
  const conProf = mediciones
    .filter(
      (m) =>
        m.profundidad_mm != null && m.origen !== "alta" && m.fecha >= INICIO_MEDICIONES
    )
    .map<PuntoResuelto>((m) => ({
      fecha: m.fecha,
      prof: Number(m.profundidad_mm),
      km: m.km != null ? Number(m.km) : odometroEnFecha(lecturas, m.fecha),
    }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

  if (conProf.length === 0) return vacio("sin_mediciones")
  if (conProf.length === 1) return vacio("un_solo_punto", { puntos: 1 })

  const tramo = tramoVigente(conProf, movimientos, n.fecha_instalacion)
  if (tramo.length < 2) return vacio("un_solo_punto", { puntos: tramo.length })

  const conKm = tramo.filter((p) => p.km != null)
  if (conKm.length < 2) return vacio("sin_km", { puntos: tramo.length })

  const a = conKm[0]
  const b = conKm[conKm.length - 1]
  const kmMedidos = Math.round(b.km! - a.km!)
  const mmObservados = Math.round((a.prof - b.prof) * 100) / 100

  const tramoPuntos = conKm.map((p) => ({ fecha: p.fecha, km: p.km!, prof: p.prof }))
  const ajuste = pendienteDesgaste(tramoPuntos)
  // mm del tramo según la recta, que es de donde sale la tasa.
  const mmGastados =
    ajuste != null ? Math.round(ajuste.mmPorKm * kmMedidos * 100) / 100 : mmObservados

  const base: Partial<DesgasteNeumatico> = {
    puntos: conKm.length,
    kmMedidos,
    mmGastados,
    mmObservados,
    r2: ajuste?.r2 ?? null,
    desde: a.fecha,
    hasta: b.fecha,
    tramoPuntos,
  }

  if (kmMedidos < MIN_KM_TRAMO) return vacio("tramo_corto", base)
  if (ajuste == null || mmGastados < MIN_DELTA_MM) return vacio("sin_desgaste", base)

  const mmPorMilKm = Math.round(ajuste.mmPorKm * 1_000 * 1000) / 1000
  const kmPorMm = Math.round(kmMedidos / mmGastados)

  // Proyección hasta el límite de circulación. Se apoya en la profundidad
  // actual de la cubierta (la última medida), no en la del tramo: si hubo una
  // medición posterior sin km, igual es el mejor dato de cuánta goma queda.
  const profHoy = n.profundidad_actual_mm ?? b.prof
  const mmDisponibles = profHoy - PROF_OBJETIVO_MM
  const kmHastaCambio =
    mmDisponibles > 0 ? Math.round((mmDisponibles / mmGastados) * kmMedidos) : 0
  const diasHastaCambio =
    kmDia && kmDia > 0 ? Math.round(kmHastaCambio / kmDia) : null
  const fechaCambio = diasHastaCambio != null ? sumarDias(hoy, diasHastaCambio) : null

  return {
    neumatico_id: n.id,
    mmPorMilKm,
    kmPorMm,
    kmMedidos,
    mmGastados,
    mmObservados,
    r2: ajuste.r2,
    desde: a.fecha,
    hasta: b.fecha,
    puntos: conKm.length,
    tramoPuntos,
    kmHastaCambio,
    diasHastaCambio,
    fechaCambio,
    motivo: null,
  }
}

// ------------------------------------------------------------- agregados

export interface FilaDesgaste extends DesgasteNeumatico {
  cubierta: CubiertaDesgaste
}

export interface PromedioDesgaste {
  clave: string
  mmPorMilKm: number
  /** Cubiertas que aportaron puntos al ajuste. */
  cubiertas: number
  /** Km medidos sumados: el peso del número y la confianza que merece. */
  kmMedidos: number
  /** Mediciones que entraron en el ajuste (la suma de las de cada cubierta). */
  puntos: number
  /** R² del ajuste conjunto. NULL con menos de tres puntos. */
  r2: number | null
}

/**
 * Tasa agregada: una sola recta ajustada sobre los puntos de TODAS las
 * cubiertas del grupo.
 *
 * 🚨 Esto no es el promedio de las tasas individuales, y la diferencia es la
 * razón de ser del cálculo. Promediar tasas ya calculadas dejaba afuera a toda
 * cubierta que no llegaba al piso individual de `MIN_KM_TRAMO` — que al
 * 25/08/2026 son casi todas: con dos rondas a 15–23 días de distancia, una
 * cubierta sola no junta 3.000 km. El eje entero sí: seis cubiertas recorriendo
 * los mismos km aportan seis veces los puntos, el ruido del calibre cae con
 * √6 y el número se vuelve usable meses antes.
 *
 * Cada cubierta entra normalizada a su propio arranque (km y mm consumidos
 * desde su primer punto del tramo) y la recta se fuerza por el origen: son
 * gomas distintas con espesores distintos, lo que comparten es el ritmo.
 */
function tasaAgregada(filas: FilaDesgaste[]): Omit<PromedioDesgaste, "clave"> | null {
  let sxy = 0
  let sxx = 0
  let kmTotal = 0
  let puntos = 0
  let cubiertas = 0
  const nube: Array<{ x: number; y: number }> = []

  for (const f of filas) {
    const ps = f.tramoPuntos
    if (ps.length < 2) continue
    const km0 = ps[0].km
    const prof0 = ps[0].prof
    cubiertas++
    puntos += ps.length
    kmTotal += ps[ps.length - 1].km - km0
    for (const p of ps) {
      const x = p.km - km0
      const y = prof0 - p.prof
      nube.push({ x, y })
      sxy += x * y
      sxx += x * x
    }
  }

  if (cubiertas === 0 || sxx <= 0 || kmTotal < MIN_KM_TRAMO) return null
  const mmPorKm = sxy / sxx
  const mmPorMilKm = Math.round(mmPorKm * 1_000 * 1000) / 1000
  if (mmPorMilKm <= 0) return null

  // R² de la recta por el origen sobre la nube normalizada.
  let r2: number | null = null
  if (nube.length >= 3) {
    const my = nube.reduce((s, p) => s + p.y, 0) / nube.length
    let ssTot = 0
    let ssRes = 0
    for (const p of nube) {
      ssTot += (p.y - my) * (p.y - my)
      ssRes += (p.y - mmPorKm * p.x) * (p.y - mmPorKm * p.x)
    }
    r2 = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : null
  }

  return { mmPorMilKm, cubiertas, kmMedidos: Math.round(kmTotal), puntos, r2 }
}

/** Tasa de toda la flota, con el mismo criterio agregado. */
export function promedioPonderado(filas: FilaDesgaste[]): number | null {
  return tasaAgregada(filas)?.mmPorMilKm ?? null
}

function agrupar(
  filas: FilaDesgaste[],
  clave: (f: FilaDesgaste) => string | null
): PromedioDesgaste[] {
  const grupos = new Map<string, FilaDesgaste[]>()
  for (const f of filas) {
    // Ya no se pide `mmPorMilKm != null`: justamente las cubiertas sin tasa
    // propia son las que el agregado rescata.
    if (f.tramoPuntos.length < 2) continue
    const k = clave(f)
    if (!k) continue
    const arr = grupos.get(k) ?? []
    arr.push(f)
    grupos.set(k, arr)
  }
  const out: PromedioDesgaste[] = []
  for (const [k, arr] of grupos) {
    const t = tasaAgregada(arr)
    if (t == null) continue
    out.push({ clave: k, ...t })
  }
  return out.sort((a, b) => b.mmPorMilKm - a.mmPorMilKm)
}

export const porUnidad = (filas: FilaDesgaste[]) => agrupar(filas, (f) => f.cubierta.dominio)
export const porEje = (filas: FilaDesgaste[]) => agrupar(filas, (f) => f.cubierta.eje)
export const porTipo = (filas: FilaDesgaste[]) => agrupar(filas, (f) => f.cubierta.tipo)
export const porMarca = (filas: FilaDesgaste[]) =>
  agrupar(filas, (f) => f.cubierta.marca?.trim() || null)

/**
 * Cuánto se desvía una cubierta del promedio de SUS PARES: las cubiertas del
 * mismo camión y del mismo eje. Es la lectura que detecta alineación, presión o
 * rotación atrasada — si dos gomas que comparten unidad y eje se gastan a
 * ritmos distintos, el problema no es la goma.
 *
 * 🚨 Los pares son unidad + eje, NO la unidad sola. Contra el promedio de toda
 * la unidad las direccionales del AF664NY daban +140 % y quedaban marcadas como
 * problema, cuando en realidad se gastan idénticas entre sí: lo que las separa
 * del resto es que las tracción de ese camión se gastan mucho más despacio.
 * Comparar peras con peras es lo único que hace accionable el número.
 */
export function paresPorUnidadEje(filas: FilaDesgaste[]): PromedioDesgaste[] {
  return agrupar(filas, (f) =>
    f.cubierta.dominio && f.cubierta.eje ? `${f.cubierta.dominio}|${f.cubierta.eje}` : null
  )
}

export function desvioContraPares(
  fila: FilaDesgaste,
  pares: PromedioDesgaste[]
): number | null {
  const { dominio, eje } = fila.cubierta
  if (fila.mmPorMilKm == null || !dominio || !eje) return null
  const prom = pares.find((p) => p.clave === `${dominio}|${eje}`)
  // Con una sola cubierta medida en el eje no hay con qué comparar: el promedio
  // sería ella misma y el desvío daría 0 %, que se lee como "está bien".
  if (!prom || prom.mmPorMilKm <= 0 || prom.cubiertas < 2) return null
  return Math.round((fila.mmPorMilKm / prom.mmPorMilKm - 1) * 100)
}

/** Desde este desvío una cubierta se marca: se gasta mucho más rápido que sus pares. */
export const DESVIO_ALERTA_PCT = 40
