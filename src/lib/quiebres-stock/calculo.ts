/**
 * Lógica pura del indicador de Quiebres de Stock (Almacén).
 *
 * Dos decisiones que definen el número y que conviene tener a la vista:
 *
 * 1. EL UNIVERSO SE AGRUPA POR PRODUCTO FÍSICO (marca + calibre), no por SKU.
 *    Los códigos migran —envases Mundial, relanzamientos, cambios de
 *    proveedor— y una migración de código imita un quiebre perfecto: el SKU
 *    viejo cae a cero el mismo día que el nuevo arranca. Ver el comentario de
 *    la migración 20260806160000 para el caso Quilmes litro (7026 ↔ 46629).
 *
 * 2. EL CALENDARIO ES OPERATIVO, NO CALENDARIO. Un domingo sin reparto no es
 *    un día de quiebre. Se descartan los domingos y los días con actividad
 *    residual (menos del 15% de la mediana del mes), que son feriados con una
 *    venta mostrador suelta o cierres parciales. Sin esto, una racha que
 *    cruza un domingo se cuenta un día más larga de lo que fue.
 */

/** Un día del mes que quedó afuera del calendario operativo, con el motivo. */
export interface DiaDescartado {
  fecha: string
  bultos: number
  motivo: "domingo" | "residual"
}

export interface CalendarioOperativo {
  dias: string[]
  descartados: DiaDescartado[]
  medianaBultos: number
}

/** Fracción de la mediana diaria por debajo de la cual el día no es operativo. */
const UMBRAL_RESIDUAL = 0.15

/**
 * Arma el calendario operativo del mes a partir del volumen total por día.
 * `bultosPorDia` sólo trae los días que tuvieron alguna venta: los días sin
 * ninguna fila (domingos cerrados, feriados) no entran ni como descartados.
 */
export function calendarioOperativo(
  bultosPorDia: Map<string, number>,
): CalendarioOperativo {
  const valores = [...bultosPorDia.values()].sort((a, b) => a - b)
  const mediana = valores.length ? valores[Math.floor(valores.length / 2)] : 0

  const dias: string[] = []
  const descartados: DiaDescartado[] = []
  for (const [fecha, bultos] of [...bultosPorDia.entries()].sort()) {
    if (esDomingo(fecha)) {
      descartados.push({ fecha, bultos, motivo: "domingo" })
    } else if (bultos < mediana * UMBRAL_RESIDUAL) {
      descartados.push({ fecha, bultos, motivo: "residual" })
    } else {
      dias.push(fecha)
    }
  }
  return { dias, descartados, medianaBultos: mediana }
}

/** Domingo en hora local de Argentina (las fechas vienen como YYYY-MM-DD). */
export function esDomingo(fecha: string): boolean {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0
}

export interface Ventana {
  desde: string
  hasta: string
  dias: number
}

/**
 * Rachas de días operativos consecutivos SIN venta, de `minDias` o más.
 * `diasConVenta` es el conjunto de días en que la familia movió algo.
 */
export function ventanasDeQuiebre(
  diasConVenta: Set<string>,
  calendario: string[],
  minDias = 2,
): Ventana[] {
  const out: Ventana[] = []
  let inicio: string | null = null
  let ultimo: string | null = null
  let cuenta = 0

  const cerrar = () => {
    if (cuenta >= minDias && inicio && ultimo) {
      out.push({ desde: inicio, hasta: ultimo, dias: cuenta })
    }
    inicio = null
    ultimo = null
    cuenta = 0
  }

  for (const dia of calendario) {
    if (diasConVenta.has(dia)) {
      cerrar()
    } else {
      if (cuenta === 0) inicio = dia
      ultimo = dia
      cuenta++
    }
  }
  cerrar()
  return out
}

/**
 * Clave de familia. Cae al SKU sólo si el maestro no tiene marca o calibre
 * (POP, combos, artículos sin clasificar): ahí el código ES el producto.
 */
export function claveFamilia(
  marca: string | null | undefined,
  calibre: string | null | undefined,
  fallback: string,
): string {
  const m = marca?.trim()
  const c = calibre?.trim()
  if (m && c) return `${m} | ${c}`
  return fallback
}

// ─── Agregación ─────────────────────────────────────────────────────────────
// Vive acá y no en el server action a propósito: es el cálculo que define
// cuánto cobra alguien, así que tiene que poder correrse fuera de la app —
// con las filas crudas sobre la mesa— para auditarlo o rehacerlo a mano.

export interface FilaVentaCruda {
  fecha: string
  id_articulo: number
  ds_articulo: string | null
  bultos: number | null
}

export interface FilaFotoCruda {
  fecha: string
  id_articulo: number
  bultos: number | null
}

export interface ArticuloMaestro {
  des_articulo: string
  marca: string | null
  calibre: string | null
  anulado: boolean
}

export interface SkuDeFamilia {
  id_articulo: number
  ds_articulo: string
  bultos_mes: number
  bultos_previo: number
  anulado: boolean
}

export interface FamiliaQuiebre {
  familia: string
  marca: string | null
  calibre: string | null
  /** Bultos del trimestre móvil — define el ranking de rotación. */
  rotacion: number
  bultos_mes: number
  dias_con_venta: number
  dias_quiebre: number
  ventanas: Ventana[]
  /** Bultos por fecha del mes (sólo días con movimiento). */
  por_dia: Record<string, number>
  /** Días en que la foto de stock marcó la familia entera en cero. */
  dias_stock_cero: string[]
  /** Rechazos con motivo SIN STOCK del mes sobre SKUs de la familia. */
  rechazos_sin_stock: number
  skus: SkuDeFamilia[]
}

export interface QuiebresKpis {
  familias_con_quiebre: number
  universo: number
  dias_familia_quiebre: number
  dias_familia_posibles: number
  pct_quiebre: number
  rechazos_sin_stock: number
}

export interface ResultadoQuiebres {
  min_dias: number
  dias_operativos: string[]
  dias_descartados: DiaDescartado[]
  mediana_bultos: number
  /** Días operativos que tienen foto de stock (evidencia). */
  dias_con_foto: string[]
  fuente: "stock" | "venta" | "mixta"
  familias: FamiliaQuiebre[]
  kpis: QuiebresKpis
}

export interface EntradaQuiebres {
  /** Ventas del trimestre móvil: distribución + mostrador, sin deduplicar. */
  ventas: FilaVentaCruda[]
  /** Fotos de stock del mes analizado. */
  fotos: FilaFotoCruda[]
  /** SKUs rechazados con motivo SIN STOCK en el mes. */
  rechazosSinStock: number[]
  maestro: Map<number, ArticuloMaestro>
  /** Primer día del mes analizado (YYYY-MM-DD). */
  desdeMes: string
  /** Primer día del mes anterior, para el contraste por SKU. */
  desdePrevio: string
  universo: number
  minDias: number
}

export function agregarQuiebres(e: EntradaQuiebres): ResultadoQuiebres {
  // ── Calendario operativo del mes
  const bultosPorDia = new Map<string, number>()
  for (const v of e.ventas) {
    if (v.fecha < e.desdeMes) continue
    bultosPorDia.set(v.fecha, (bultosPorDia.get(v.fecha) ?? 0) + (Number(v.bultos) || 0))
  }
  const cal = calendarioOperativo(bultosPorDia)

  // ── Agregación por familia
  interface Acum {
    marca: string | null
    calibre: string | null
    rotacion: number
    bultosMes: number
    diasConVenta: Set<string>
    porDia: Map<string, number>
    skus: Map<number, SkuDeFamilia>
  }
  const familias = new Map<string, Acum>()
  const familiaDeSku = new Map<number, string>()

  for (const v of e.ventas) {
    const a = e.maestro.get(v.id_articulo)
    const desc = a?.des_articulo ?? v.ds_articulo ?? String(v.id_articulo)
    const clave = claveFamilia(a?.marca, a?.calibre, desc)
    familiaDeSku.set(v.id_articulo, clave)

    const f = familias.get(clave) ?? {
      marca: a?.marca ?? null,
      calibre: a?.calibre ?? null,
      rotacion: 0,
      bultosMes: 0,
      diasConVenta: new Set<string>(),
      porDia: new Map<string, number>(),
      skus: new Map<number, SkuDeFamilia>(),
    }
    const bultos = Number(v.bultos) || 0
    f.rotacion += bultos

    const sku = f.skus.get(v.id_articulo) ?? {
      id_articulo: v.id_articulo,
      ds_articulo: desc,
      bultos_mes: 0,
      bultos_previo: 0,
      anulado: a?.anulado ?? false,
    }
    if (v.fecha >= e.desdeMes) {
      f.bultosMes += bultos
      f.porDia.set(v.fecha, (f.porDia.get(v.fecha) ?? 0) + bultos)
      if (bultos > 0) f.diasConVenta.add(v.fecha)
      sku.bultos_mes += bultos
    } else if (v.fecha >= e.desdePrevio) {
      sku.bultos_previo += bultos
    }
    f.skus.set(v.id_articulo, sku)
    familias.set(clave, f)
  }

  // ── Rechazos SIN STOCK del mes, por familia
  const rechazosPorFamilia = new Map<string, number>()
  for (const idArticulo of e.rechazosSinStock) {
    const clave = familiaDeSku.get(idArticulo)
    if (!clave) continue
    rechazosPorFamilia.set(clave, (rechazosPorFamilia.get(clave) ?? 0) + 1)
  }

  // ── Fotos de stock, agregadas por familia y día
  const diasConFoto = [...new Set(e.fotos.map((f) => f.fecha))].sort()
  const stockPorFamiliaDia = new Map<string, Map<string, number>>()
  for (const f of e.fotos) {
    const clave = familiaDeSku.get(f.id_articulo)
    if (!clave) continue
    const porDia = stockPorFamiliaDia.get(clave) ?? new Map<string, number>()
    porDia.set(f.fecha, (porDia.get(f.fecha) ?? 0) + (Number(f.bultos) || 0))
    stockPorFamiliaDia.set(clave, porDia)
  }

  // ── Universo: las N familias de mayor rotación en el trimestre
  const top = [...familias.entries()]
    .map(([familia, f]) => ({ familia, ...f }))
    .sort((a, b) => b.rotacion - a.rotacion)
    .slice(0, e.universo)

  const salida: FamiliaQuiebre[] = top.map((f) => {
    const stockDias = stockPorFamiliaDia.get(f.familia)
    const diasStockCero = stockDias
      ? [...stockDias.entries()].filter(([, b]) => b <= 0).map(([d]) => d).sort()
      : []

    // Un día con foto manda sobre el proxy: si había stock, no fue quiebre
    // aunque no se haya vendido (puede no haber habido pedido ese día).
    const diasQueCuentanComoVenta = new Set(f.diasConVenta)
    for (const dia of diasConFoto) {
      const stock = stockDias?.get(dia)
      if (stock !== undefined && stock > 0) diasQueCuentanComoVenta.add(dia)
    }

    const ventanas = ventanasDeQuiebre(diasQueCuentanComoVenta, cal.dias, e.minDias)
    return {
      familia: f.familia,
      marca: f.marca,
      calibre: f.calibre,
      rotacion: f.rotacion,
      bultos_mes: f.bultosMes,
      dias_con_venta: f.diasConVenta.size,
      dias_quiebre: ventanas.reduce((a, v) => a + v.dias, 0),
      ventanas,
      por_dia: Object.fromEntries(f.porDia),
      dias_stock_cero: diasStockCero,
      rechazos_sin_stock: rechazosPorFamilia.get(f.familia) ?? 0,
      skus: [...f.skus.values()].sort((a, b) => b.bultos_previo - a.bultos_previo),
    }
  })

  const diasFamiliaQuiebre = salida.reduce((a, f) => a + f.dias_quiebre, 0)
  const posibles = salida.length * cal.dias.length
  const diasOperativosConFoto = cal.dias.filter((d) => diasConFoto.includes(d))

  return {
    min_dias: e.minDias,
    dias_operativos: cal.dias,
    dias_descartados: cal.descartados,
    mediana_bultos: cal.medianaBultos,
    dias_con_foto: diasOperativosConFoto,
    fuente:
      diasOperativosConFoto.length === 0
        ? "venta"
        : diasOperativosConFoto.length === cal.dias.length
          ? "stock"
          : "mixta",
    familias: salida,
    kpis: {
      familias_con_quiebre: salida.filter((f) => f.dias_quiebre > 0).length,
      universo: salida.length,
      dias_familia_quiebre: diasFamiliaQuiebre,
      dias_familia_posibles: posibles,
      pct_quiebre: posibles > 0 ? (diasFamiliaQuiebre / posibles) * 100 : 0,
      rechazos_sin_stock: e.rechazosSinStock.length,
    },
  }
}
