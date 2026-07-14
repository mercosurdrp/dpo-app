/**
 * Score de PRIORIZACIÓN DE ENTREGA (Planeamiento).
 *
 * CUÁNDO SE USA: el día del ruteo. Los pedidos se toman un día, al día siguiente se
 * rutean, se pickean y se preparan, y se entregan al otro. La pantalla se mira el día
 * del ruteo, sobre los pedidos con fecha de entrega del día siguiente hábil.
 *
 * QUÉ RESUELVE: cuando la capacidad de reparto no alcanza para todos los pedidos, a
 * quién se le entrega y a quién se le REPROGRAMA.
 *
 * DECISIONES DE DISEÑO (validadas con datos reales, 2026-07-14):
 *
 * 1) NO hay cupo fijo. El cupo cambia todos los días según los camiones que salen.
 *    Lo que produce esto es un ORDEN estable por ciudad; el cupo del día sólo decide
 *    dónde cae la línea. Se corta desde abajo hasta donde alcance.
 *
 * 2) El ranking es POR CIUDAD. Un pedido de Arrecifes no compite por lugar con uno de
 *    Pergamino: son camiones distintos. Rankearlos juntos no significa nada.
 *
 * 3) El COMPORTAMIENTO manda (50%). Y comportamiento = lo que el cliente HACE, medido
 *    por sus rechazos por causa propia (sin dinero / cerrado / sin envases) sobre las
 *    entregas REALES de la ventana.
 *    🚨 RMD y NPS NO entran al score, y no es un olvido: se midieron sobre los clientes
 *    con pedido y NO DISCRIMINAN. El RMD promedia 4,97 (sólo 3 de 199 clientes bajo
 *    4,5; las notas 1-3 son el 0,2% de toda la base) y el NPS cubre apenas el 17% de
 *    los clientes (30 promotores, 2 detractores). Ponderarlos movería 3 clientes sobre
 *    199: sería decoración. Se muestran como BANDERA en la fila, no como puntos.
 *
 * 4) La IMPORTANCIA del cliente (35%) es el cluster, no el precio de lo que pidió. Sin
 *    este eje, un Ganador que compra producto barato en volumen queda al fondo.
 *
 * 5) El VALOR del pedido ($/bulto) es sólo el desempate (15%). El cupo es de bultos, así
 *    que entre dos clientes iguales entra el que rinde más por bulto de camión.
 *
 * 6) La URGENCIA por postergaciones previas es lo que impide que esto sea una injusticia
 *    automatizada: sin memoria, el mismo cliente queda último todos los días. Cada corte
 *    previo lo sube, y a las `POSPUESTO_INTOCABLE` veces deja de competir: entra sí o sí.
 */
import type { ClusterId } from "@/actions/clusterizacion-tipos"

// ── Parámetros (editables desde la UI) ───────────────────────────────────────

export interface PesosPriorizacion {
  /** Peso de los 3 ejes. Deben sumar 1. */
  w_comportamiento: number
  w_importancia: number
  w_valor: number
  /** Cuánto suma cada postergación previa al score (puntos). */
  puntos_por_postergacion: number
  /** Postergaciones a partir de las cuales el pedido es INTOCABLE (entra siempre). */
  pospuesto_intocable: number
}

export const PESOS_DEFAULT: PesosPriorizacion = {
  w_comportamiento: 0.5,
  w_importancia: 0.35,
  w_valor: 0.15,
  puntos_por_postergacion: 15,
  pospuesto_intocable: 2,
}

/** Importancia (0-100) por clase de cliente. */
export const IMPORTANCIA_CLUSTER: Record<ClusterId, number> = {
  ganador: 100,
  en_crecimiento: 75,
  basico: 70,
  ventas_bajas: 40,
}

/**
 * Peso del motivo de rechazo. Sin dinero y cerrado son viaje perdido puro; sin envases
 * es más leve (la entrega igual se hace, falta el retorno).
 * Los rechazos por falla NUESTRA (error de preventa, de distribución, sin stock, mal
 * facturado…) NO cuentan: no son comportamiento del cliente.
 */
export const PESO_MOTIVO: Record<string, number> = {
  "SIN DINERO": 1,
  "CERRADO": 1,
  "SIN ENVASES": 0.5,
}

/** Ventana de comportamiento. A 45 días casi no hay señal (17 clientes); a 180, hay 71. */
export const VENTANA_DIAS = 180

// ── Entrada / salida ─────────────────────────────────────────────────────────

export interface EntradaPriorizacion {
  id_cliente: number
  nombre: string | null
  localidad: string | null
  /** Bultos pedidos: es lo que OCUPA CUPO. */
  bultos: number
  /** Volumen en HL del pedido. Alimenta el VRL (Volumen Reprogramado Logístico). */
  hl: number
  monto: number
  /** Clase del cliente. null = sin historia de ventas. */
  cluster: ClusterId | null
  /** Entregas REALES del cliente en la ventana (días con compra). Es el DENOMINADOR. */
  entregas: number
  /** Entregas rechazadas por causa del cliente en la ventana. */
  rechazos: number
  /** Suma ponderada por motivo de esos rechazos (ver PESO_MOTIVO). */
  rechazos_pesados: number
  /** Detalle "SIN DINERO×3, CERRADO×1" para mostrar el porqué en la fila. */
  motivos: string
  /** Veces que ya le pospusimos este pedido (de `entrega_cortes`). */
  veces_pospuesto: number
  /** Banderas informativas: NO entran al score (medidos: no discriminan). */
  rmd_prom: number | null
  nps_categoria: string | null
}

export interface FilaPriorizada extends EntradaPriorizacion {
  /** 0-100. Lo que el cliente HACE. */
  comportamiento: number
  /** 0-100. Cuánto vale el cliente (cluster). */
  importancia: number
  /** 0-100. Percentil de $/bulto. Desempate. */
  valor: number
  /** Tasa de rechazo por causa propia (0-1). */
  tasa_rechazo: number
  /** SCORE final 0-100+. Mayor = se entrega primero. */
  score: number
  /** Posición dentro de SU ciudad (1 = el que nunca se cae). */
  posicion: number
  /** Bultos acumulados de la ciudad hasta esta fila: con X bultos de camión, entra hasta acá. */
  bultos_acum: number
  /** Rechazó 2+ veces por su culpa en la ventana. */
  reincidente: boolean
  /** Ya fue pospuesto `pospuesto_intocable` veces: entra sí o sí. */
  intocable: boolean
}

export interface CiudadPriorizada {
  ciudad: string
  clientes: number
  bultos: number
  hl: number
  monto: number
  filas: FilaPriorizada[]
}

/** Comportamiento 0-100 a partir de los rechazos por causa del cliente. */
export function calcularComportamiento(
  rechazosPesados: number,
  eventos: number,
  entregas: number,
): number {
  // Sin historia de entregas (cliente nuevo): 85. No lo premiamos ni lo hundimos por
  // falta de datos — castigarlo sería el mismo error del denominador vacío.
  if (entregas <= 0) return 85
  const tasa = Math.min(1, rechazosPesados / entregas)
  const penalReincidencia = (eventos >= 2 ? 10 : 0) + (eventos >= 4 ? 10 : 0)
  return Math.max(0, 100 - 100 * tasa * 2.5 - penalReincidencia)
}

/**
 * Rankea los pedidos AGRUPADOS POR CIUDAD. No aplica ningún cupo: devuelve el orden y
 * el acumulado de bultos, para que la pantalla dibuje la línea donde el usuario diga.
 */
export function priorizarPorCiudad(
  entradas: EntradaPriorizacion[],
  pesos: PesosPriorizacion = PESOS_DEFAULT,
): CiudadPriorizada[] {
  // Percentil de $/bulto sobre TODO el universo del día (no por ciudad: así el eje de
  // valor significa lo mismo en todas las listas).
  const vpb = entradas.map((e) => (e.bultos > 0 ? e.monto / e.bultos : 0)).sort((a, b) => a - b)
  const percentil = (v: number) =>
    vpb.length === 0 ? 0 : (100 * vpb.filter((x) => x <= v).length) / vpb.length

  const calculadas = entradas.map((e) => {
    const comportamiento = calcularComportamiento(e.rechazos_pesados, e.rechazos, e.entregas)
    const importancia = IMPORTANCIA_CLUSTER[e.cluster ?? "en_crecimiento"]
    const valor = percentil(e.bultos > 0 ? e.monto / e.bultos : 0)
    const tasa_rechazo = e.entregas > 0 ? Math.min(1, e.rechazos_pesados / e.entregas) : 0
    const intocable = e.veces_pospuesto >= pesos.pospuesto_intocable
    const score =
      pesos.w_comportamiento * comportamiento +
      pesos.w_importancia * importancia +
      pesos.w_valor * valor +
      pesos.puntos_por_postergacion * e.veces_pospuesto
    return {
      ...e, comportamiento, importancia, valor, tasa_rechazo, score,
      reincidente: e.rechazos >= 2, intocable,
      posicion: 0, bultos_acum: 0,
    }
  })

  const porCiudad = new Map<string, FilaPriorizada[]>()
  for (const f of calculadas) {
    const c = (f.localidad ?? "SIN LOCALIDAD").trim().toUpperCase()
    if (!porCiudad.has(c)) porCiudad.set(c, [])
    porCiudad.get(c)!.push(f)
  }

  const salida: CiudadPriorizada[] = []
  for (const [ciudad, filas] of porCiudad) {
    // Los INTOCABLES primero (regla dura: no compiten), después por score desc.
    filas.sort((a, b) => {
      if (a.intocable !== b.intocable) return a.intocable ? -1 : 1
      return b.score - a.score
    })
    let acum = 0
    filas.forEach((f, i) => {
      acum += f.bultos
      f.posicion = i + 1
      f.bultos_acum = acum
    })
    salida.push({
      ciudad,
      clientes: filas.length,
      bultos: filas.reduce((a, f) => a + f.bultos, 0),
      hl: filas.reduce((a, f) => a + f.hl, 0),
      monto: filas.reduce((a, f) => a + f.monto, 0),
      filas,
    })
  }
  return salida.sort((a, b) => b.bultos - a.bultos)
}
