// Política de stock del pañol de flota (DPO Flota 2.3 / R2.3.2).
//
// El verificador pregunta tres cosas sobre cada pieza: cuál es su mínimo,
// objetivo y máximo; CÓMO se definieron ("FUERA, SOBRE, CURVA ABC"); y si se
// actualizan "en función de los cambios en el comportamiento de las salidas".
// Esta lib responde las tres desde los movimientos reales del pañol:
//
//  · CONSUMO: egresos de los últimos 90 días → unidades por día y cobertura.
//  · CURVA ABC: Pareto sobre unidades consumidas (A ≤ 80 %, B ≤ 95 %, C el
//    resto; sin salidas = C). Por unidades y no por plata: en este pañol todo
//    vale parecido y lo que define la política es cuántas salen (SOP 3.3).
//  · SUGERIDOS: mínimo = días de consumo según la clase (A 30 / B 15 / C 7,
//    SOP 7.2), objetivo = consumo × días de cobertura declarados, máximo =
//    objetivo + lote de compra habitual (el mayor ingreso de la historia).
//  · FUERA / SOBRE: stock bajo el mínimo o sobre el máximo declarados.
//  · CRITICIDAD: la matriz de la planilla oficial `2.3-Gestion-de-Inventario`
//    (tipo de repuesto + bajo mínimo + parada por falta + tiempo de reposición).
//  · VALOR: stock × precio = capital inmovilizado (R2.3.3 "capital circulante").
//
// Es una función pura: la action trae las filas y la pantalla muestra. Lo
// sugerido NUNCA pisa lo declarado solo: la decisión es del Gestor de Flota y
// se registra cuando la adopta (`politica_actualizada_at`).

export type ClaseAbc = "A" | "B" | "C"
export type EstadoStock = "fuera" | "sobre" | "ok" | "sin_politica"
export type NivelCriticidad = "ALTA" | "MEDIA" | "BAJA"

/** Ventana de consumo que se mira para la política (SOP 3.3: "últimos 90 días"). */
export const VENTANA_CONSUMO_DIAS = 90
/** Días de cobertura asumidos cuando la pieza no los tiene declarados. */
export const DIAS_STOCK_POR_DEFECTO = 30
/** Días de consumo que cubre el mínimo según la clase (SOP 7.2). */
export const DIAS_MINIMO_POR_CLASE: Record<ClaseAbc, number> = { A: 30, B: 15, C: 7 }
/** Umbral de la planilla oficial: criticidad ALTA con 30 puntos o más. */
export const UMBRAL_CRITICIDAD_ALTA = 30
export const UMBRAL_CRITICIDAD_MEDIA = 15

export interface RepuestoPolitica {
  id: string
  nombre: string
  stock_actual: number
  stock_min: number | null
  stock_max: number | null
  stock_objetivo: number | null
  dias_stock: number | null
  clase_abc: ClaseAbc | null
  precio_unitario?: number | null
  lead_time_dias?: number | null
  parada_por_falta?: boolean | null
  en_panol?: boolean | null
  politica_actualizada_at?: string | null
}

export interface MovimientoPolitica {
  repuesto_id: string
  tipo: "ingreso" | "egreso"
  cantidad: number
  fecha: string
  motivo?: string | null
}

export interface PuntajeCriticidad {
  tipo: number
  bajoMinimo: number
  parada: number
  reposicion: number
  total: number
  nivel: NivelCriticidad
}

export interface PoliticaItem {
  repuestoId: string
  /** Unidades que salieron en la ventana. */
  consumo: number
  ventanaDias: number
  consumoDia: number
  /** Días que dura el stock actual al ritmo real. null = no se mueve. */
  coberturaDias: number | null
  claseSugerida: ClaseAbc
  minSugerido: number
  objetivoSugerido: number
  maxSugerido: number
  /** Punto de reposición = mínimo declarado (o el sugerido si no hay). */
  puntoReposicion: number
  /** Mayor ingreso de la historia: el lote con el que se repone. */
  lote: number
  estado: EstadoStock
  /** stock × precio unitario; null sin precio. */
  valor: number | null
  criticidad: PuntajeCriticidad
  /** La política declarada difiere de la sugerida en algún campo. */
  difiere: boolean
}

export interface ResumenPolitica {
  items: number
  valorTotal: number
  itemsConPrecio: number
  fuera: number
  sobre: number
  sinPolitica: number
  criticidadAlta: number
  porClase: Record<ClaseAbc, number>
}

export interface AnalisisPolitica {
  desde: string
  hasta: string
  porItem: Map<string, PoliticaItem>
  resumen: ResumenPolitica
}

function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/** Clase ABC por Pareto de unidades consumidas (80 / 95). */
export function clasificarAbc(consumoPorPieza: Map<string, number>): Map<string, ClaseAbc> {
  const total = [...consumoPorPieza.values()].reduce((a, n) => a + n, 0)
  const clase = new Map<string, ClaseAbc>()
  let acumulado = 0
  for (const [id, n] of [...consumoPorPieza.entries()].sort((a, b) => b[1] - a[1])) {
    if (n <= 0) {
      clase.set(id, "C")
      continue
    }
    acumulado += n
    const pct = total > 0 ? (acumulado / total) * 100 : 100
    clase.set(id, pct <= 80 ? "A" : pct <= 95 ? "B" : "C")
  }
  return clase
}

/**
 * Criticidad según la matriz de la planilla DPO 2.3 (hoja Seguimiento
 * Repuestos, columnas J–O):
 *   tipo de repuesto     A 10 · B 5 · C 0
 *   bajo el mínimo       NO 10 · SÍ 0   (sic: la planilla premia al que está bajo
 *                        mínimo con 0 porque ya está en reposición; se respeta
 *                        la matriz oficial para que el número cierre con la hoja)
 *   parada por falta     SÍ 10 · NO 0
 *   tiempo de reposición < 1 semana 0 · 1 semana a 1 mes 5 · > 1 mes 10
 *   ALTA ≥ 30 · MEDIA ≥ 15 · BAJA
 */
export function criticidad(params: {
  clase: ClaseAbc | null
  bajoMinimo: boolean
  paradaPorFalta: boolean
  leadTimeDias: number | null
}): PuntajeCriticidad {
  const tipo = params.clase === "A" ? 10 : params.clase === "B" ? 5 : 0
  const bajoMinimo = params.bajoMinimo ? 0 : 10
  const parada = params.paradaPorFalta ? 10 : 0
  const lt = params.leadTimeDias
  const reposicion = lt == null ? 5 : lt < 7 ? 0 : lt <= 30 ? 5 : 10
  const total = tipo + bajoMinimo + parada + reposicion
  const nivel: NivelCriticidad =
    total >= UMBRAL_CRITICIDAD_ALTA ? "ALTA" : total >= UMBRAL_CRITICIDAD_MEDIA ? "MEDIA" : "BAJA"
  return { tipo, bajoMinimo, parada, reposicion, total, nivel }
}

export function analizarPolitica(params: {
  repuestos: RepuestoPolitica[]
  /** Movimientos de la ventana (y, para el lote, todos los ingresos que haya). */
  movimientos: MovimientoPolitica[]
  hoy: string
  ventanaDias?: number
}): AnalisisPolitica {
  const { repuestos, movimientos, hoy } = params
  const ventana = params.ventanaDias ?? VENTANA_CONSUMO_DIAS
  const desde = restarDias(hoy, ventana)

  const egresos = movimientos.filter(
    (m) => m.tipo === "egreso" && m.fecha >= desde && m.fecha <= hoy && !esAjusteConteo(m.motivo)
  )
  // La ventana real es la historia que hay: con 48 días de movimientos,
  // dividir por 90 subestima el consumo a la mitad.
  const fechas = egresos.map((m) => m.fecha).sort()
  const ventanaReal = Math.max(
    1,
    fechas.length > 1
      ? Math.round((Date.parse(fechas[fechas.length - 1]) - Date.parse(fechas[0])) / 86_400_000) || 1
      : fechas.length === 1
        ? Math.max(1, Math.round((Date.parse(hoy) - Date.parse(fechas[0])) / 86_400_000) || 1)
        : ventana
  )

  const consumoPorPieza = new Map<string, number>()
  for (const r of repuestos) consumoPorPieza.set(r.id, 0)
  for (const m of egresos) {
    consumoPorPieza.set(m.repuesto_id, (consumoPorPieza.get(m.repuesto_id) ?? 0) + Number(m.cantidad))
  }
  const clases = clasificarAbc(consumoPorPieza)

  // Lote de compra = mayor ingreso histórico de la pieza (sin ajustes).
  const lotePorPieza = new Map<string, number>()
  for (const m of movimientos) {
    if (m.tipo !== "ingreso" || esAjusteConteo(m.motivo)) continue
    lotePorPieza.set(m.repuesto_id, Math.max(lotePorPieza.get(m.repuesto_id) ?? 0, Number(m.cantidad)))
  }

  const porItem = new Map<string, PoliticaItem>()
  const resumen: ResumenPolitica = {
    items: 0,
    valorTotal: 0,
    itemsConPrecio: 0,
    fuera: 0,
    sobre: 0,
    sinPolitica: 0,
    criticidadAlta: 0,
    porClase: { A: 0, B: 0, C: 0 },
  }

  for (const r of repuestos) {
    const stock = Number(r.stock_actual) || 0
    const consumo = consumoPorPieza.get(r.id) ?? 0
    const consumoDia = consumo / ventanaReal
    const claseSugerida = clases.get(r.id) ?? "C"
    const claseEfectiva: ClaseAbc | null = r.clase_abc ?? null
    const dias = r.dias_stock ?? DIAS_STOCK_POR_DEFECTO

    // Sugeridos. Con consumo cero no se inventa nada: el mínimo queda en 1 para
    // una A (nunca puede faltar), 0 para el resto; objetivo/máximo arrancan en
    // lo declarado.
    const minSugerido =
      consumoDia > 0
        ? Math.max(1, Math.ceil(consumoDia * DIAS_MINIMO_POR_CLASE[claseSugerida]))
        : claseSugerida === "A"
          ? 1
          : Number(r.stock_min ?? 0)
    const objetivoSugerido =
      consumoDia > 0
        ? Math.max(minSugerido, Math.ceil(consumoDia * dias))
        : Math.max(minSugerido, Number(r.stock_objetivo ?? r.stock_min ?? 0))
    const lote = lotePorPieza.get(r.id) ?? 0
    const maxSugerido = Math.max(objetivoSugerido + lote, Math.ceil(objetivoSugerido * 1.5), objetivoSugerido)

    const min = r.stock_min != null ? Number(r.stock_min) : null
    const max = r.stock_max != null ? Number(r.stock_max) : null
    const sinPolitica = min == null || min <= 0 || r.clase_abc == null || r.stock_objetivo == null
    const bajoMinimo = min != null && min > 0 && stock <= min
    const estado: EstadoStock = bajoMinimo
      ? "fuera"
      : max != null && stock > max
        ? "sobre"
        : sinPolitica
          ? "sin_politica"
          : "ok"

    const precio = r.precio_unitario != null ? Number(r.precio_unitario) : null
    const valor = precio != null ? stock * precio : null
    const crit = criticidad({
      clase: claseEfectiva ?? claseSugerida,
      bajoMinimo,
      paradaPorFalta: !!r.parada_por_falta,
      leadTimeDias: r.lead_time_dias ?? null,
    })
    const difiere =
      (r.clase_abc ?? null) !== claseSugerida ||
      (min ?? 0) !== minSugerido ||
      (r.stock_objetivo != null ? Number(r.stock_objetivo) : null) !== objetivoSugerido ||
      (max ?? null) !== maxSugerido

    porItem.set(r.id, {
      repuestoId: r.id,
      consumo,
      ventanaDias: ventanaReal,
      consumoDia,
      coberturaDias: consumoDia > 0 ? Math.round(stock / consumoDia) : null,
      claseSugerida,
      minSugerido,
      objetivoSugerido,
      maxSugerido,
      puntoReposicion: min != null && min > 0 ? min : minSugerido,
      lote,
      estado,
      valor,
      criticidad: crit,
      difiere,
    })

    resumen.items++
    if (valor != null) {
      resumen.valorTotal += valor
      resumen.itemsConPrecio++
    }
    if (estado === "fuera") resumen.fuera++
    if (estado === "sobre") resumen.sobre++
    if (sinPolitica) resumen.sinPolitica++
    if (crit.nivel === "ALTA") resumen.criticidadAlta++
    if (claseEfectiva) resumen.porClase[claseEfectiva]++
  }

  return { desde, hasta: hoy, porItem, resumen }
}

/** Los ajustes por conteo no son consumo ni compra: no entran en la política ni en la trazabilidad. */
export function esAjusteConteo(motivo: string | null | undefined): boolean {
  return !!motivo && /^ajuste por conteo/i.test(motivo.trim())
}

export const CAUSAS_DIFERENCIA = [
  "egreso_no_registrado",
  "ingreso_no_registrado",
  "error_conteo",
  "rotura_perdida",
  "otro",
] as const
export type CausaDiferencia = (typeof CAUSAS_DIFERENCIA)[number]

export const CAUSA_DIFERENCIA_LABEL: Record<CausaDiferencia, string> = {
  egreso_no_registrado: "Egreso no registrado (se usó sin cargar)",
  ingreso_no_registrado: "Ingreso no registrado (compra sin cargar)",
  error_conteo: "Error del conteo anterior",
  rotura_perdida: "Rotura o pérdida",
  otro: "Otro",
}

export const ESTADO_STOCK_LABEL: Record<EstadoStock, string> = {
  fuera: "FUERA (bajo mínimo)",
  sobre: "SOBRE (sobre máximo)",
  ok: "OK",
  sin_politica: "Sin política",
}
