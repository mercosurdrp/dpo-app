/**
 * Gasto de neumáticos: la plata de la goma, de las dos fuentes que la tienen.
 *
 * 🚨 Vive acá y no dentro del panel porque ahora la usan dos pantallas: el
 * panel "Costo de neumáticos por unidad" (`_components/costos-neumaticos-panel`)
 * y el PI `neumaticos_gasto_km` del tablero de indicadores. Si cada uno sumara
 * por su cuenta, el auditor abriría la tarjeta del KPI y el panel al que la
 * tarjeta lo manda, y leería dos totales distintos de la misma plata. Es el
 * mismo motivo por el que los umbrales de profundidad viven en
 * `neumaticos-control.ts`.
 *
 * Las dos fuentes:
 *  - compra de cubiertas → `mantenimiento_neumaticos` (`costo_unitario` a
 *    `fecha_compra`). Una cubierta comprada ya recapada es gasto de recapado.
 *  - servicio de recapado → los ítems del remito, que ya traen el costo
 *    repartido por cubierta y de qué unidad venía cada una.
 *
 * El fierro se imputa acá y la OT de mantenimiento se queda con la MANO DE
 * OBRA: así los dos totales se suman sin contar la misma plata dos veces (el
 * caso que lo motivó fue la OT 1772 del AE591EI).
 */

export type ConceptoGasto = "nueva" | "recapado"

export interface LineaGastoNeumatico {
  id: string
  /** Compra: fecha de factura. Recapado: fecha en que volvió del recapador. */
  fecha: string | null
  dominio: string | null
  concepto: ConceptoGasto
  detalle: string
  proveedor: string | null
  monto: number
}

/** Lo que el agregado necesita de una cubierta. El resto de la fila no se usa. */
export interface NeumaticoGasto {
  id: string
  numero: string | null
  tipo: string
  marca: string | null
  medida: string | null
  dominio: string | null
  proveedor: string | null
  costo_unitario: number | null
  fecha_compra: string | null
}

/** Lo que el agregado necesita de un remito de recapado y sus ítems. */
export interface RecapadoGasto {
  numero_remito: string | null
  proveedor: string | null
  fecha_envio: string | null
  fecha_retorno: string | null
  items?: Array<{
    id: string
    numero_envio: string | null
    numero_retorno: string | null
    dominio_origen: string | null
    costo: number | null
  }> | null
}

/**
 * Las dos fuentes de plata de goma, pasadas a una lista plana de líneas.
 *
 * La cubierta se imputa a la unidad que la tiene puesta (`dominio`); si está en
 * stock o ya se dio de baja queda sin unidad. El recapado se imputa a la unidad
 * de la que se desmontó (`dominio_origen`), que es la que gastó la goma.
 */
export function armarLineasGasto(
  neumaticos: NeumaticoGasto[],
  recapados: RecapadoGasto[]
): LineaGastoNeumatico[] {
  const lineas: LineaGastoNeumatico[] = []

  for (const n of neumaticos) {
    if (n.costo_unitario == null) continue
    const monto = Number(n.costo_unitario)
    if (!(monto > 0)) continue
    const cubierta = [n.marca, n.medida].filter(Boolean).join(" ")
    lineas.push({
      id: `cub-${n.id}`,
      fecha: n.fecha_compra,
      dominio: n.dominio,
      // Una cubierta comprada ya recapada es gasto de recapado, no de goma nueva.
      concepto: n.tipo === "recapado" ? "recapado" : "nueva",
      detalle: [cubierta || "Cubierta", n.numero ? `N° ${n.numero}` : null]
        .filter(Boolean)
        .join(" · "),
      proveedor: n.proveedor,
      monto,
    })
  }

  for (const r of recapados) {
    for (const it of r.items ?? []) {
      if (it.costo == null) continue
      const monto = Number(it.costo)
      if (!(monto > 0)) continue
      const numero = it.numero_retorno ?? it.numero_envio
      lineas.push({
        id: `rec-${it.id}`,
        // El costo se conoce cuando vuelve con la factura; si todavía está en el
        // recapador, se imputa a la fecha en que salió.
        fecha: r.fecha_retorno ?? r.fecha_envio,
        dominio: it.dominio_origen,
        concepto: "recapado",
        detalle: [
          numero ? `Cubierta N° ${numero}` : "Cubierta sin numerar",
          r.numero_remito ? `remito ${r.numero_remito}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        proveedor: r.proveedor,
        monto,
      })
    }
  }

  return lineas.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
}

/** Gasto del mes (`YYYY-MM`), de todas las líneas con fecha. */
export function gastoPorMes(lineas: LineaGastoNeumatico[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of lineas) {
    if (!l.fecha) continue
    const ym = l.fecha.slice(0, 7)
    out.set(ym, (out.get(ym) ?? 0) + l.monto)
  }
  return out
}

/**
 * Gasto acumulado del año hasta el mes `ym` inclusive.
 *
 * 🚨 El PI se mira acumulado y no mes a mes a propósito: las cubiertas se
 * compran por juego, así que el mensual puro da $0 los meses sin compra y un
 * pico el mes que se compra. Eso no es una tendencia, y la guía del punto 3.4
 * pide justamente tendencia contra la línea de base de los últimos 3 meses.
 */
export function gastoAcumuladoAlMes(lineas: LineaGastoNeumatico[], ym: string): number {
  const anio = ym.slice(0, 4)
  let total = 0
  for (const l of lineas) {
    if (!l.fecha) continue
    if (l.fecha.slice(0, 4) !== anio) continue
    if (l.fecha.slice(0, 7) > ym) continue
    total += l.monto
  }
  return total
}

/**
 * El PI: pesos de goma por cada 1.000 km, acumulado del año al mes `ym`.
 *
 * `kmAcumulado` son los km de la flota del mismo año hasta el mismo mes, de la
 * misma fuente que usa `combustible_kml` (`registro_combustible.km_recorridos`).
 * Devuelve `null` si todavía no hay km: sin denominador el número no existe, y
 * mostrar 0 haría ver un mes perfecto donde no hay dato.
 */
export function gastoPor1000Km(
  lineas: LineaGastoNeumatico[],
  ym: string,
  kmAcumulado: number
): number | null {
  if (!(kmAcumulado > 0)) return null
  return (gastoAcumuladoAlMes(lineas, ym) / kmAcumulado) * 1000
}
