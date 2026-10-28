/**
 * Semáforo y "Lectura del período" del mapa de Costo por PDV.
 *
 * Lógica pura (sin React ni Supabase) para que la usen la solapa Mapa y la
 * Reunión de Presupuesto con el mismo criterio:
 *
 * - Bandas por percentil de costo/HL dentro del período. Los PDV de volumen muy
 *   bajo (HL < p10) quedan aparte porque su costo/HL se infla por el componente
 *   fijo de parada sobre pocos litros. Sobre los representativos: rojo ≥ p90
 *   (el "10% más caro" de las tablas), amarillo p70–p90, verde el resto.
 * - La lectura son cuatro o cinco frases que la app arma sola con cada foto:
 *   ciudad más cara, concentración del costo en los rojos, rojos por drop chico
 *   vs. por distancia y movimiento contra el período anterior.
 */

export type BandaKey = "caro" | "atencion" | "ok" | "bajo"

/** Lo mínimo que necesita la lectura de cada PDV (lo cumplen PdvMapa y CostoPorPdvRow mapeado). */
export interface PdvLectura {
  id: number
  nombre: string
  ciudad: string
  bultos: number
  comprobantes: number
  hl: number
  costo_total: number
  costo_x_hl: number
}

export interface Cortes {
  floorHl: number
  p70: number
  p90: number
}

/** Interpolación lineal de percentil sobre un array YA ordenado ascendente. */
export function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base]
}

export function calcularCortes(filas: PdvLectura[]): Cortes {
  const conHl = filas.filter((f) => f.hl > 0)
  const hlSorted = conHl.map((f) => f.hl).sort((a, b) => a - b)
  const floorHl = quantile(hlSorted, 0.1)
  const chl = conHl
    .filter((f) => f.hl >= floorHl)
    .map((f) => f.costo_x_hl)
    .sort((a, b) => a - b)
  return { floorHl, p70: quantile(chl, 0.7), p90: quantile(chl, 0.9) }
}

export function bandaDe(f: PdvLectura, c: Cortes): BandaKey {
  if (f.hl <= 0 || f.hl < c.floorHl) return "bajo"
  if (f.costo_x_hl >= c.p90) return "caro"
  if (f.costo_x_hl >= c.p70) return "atencion"
  return "ok"
}

export interface Hallazgo {
  /** mal = problema claro, atencion = a mirar, bien = mejora, neutro = dato. */
  tono: "mal" | "atencion" | "bien" | "neutro"
  texto: string
}

export interface Lectura {
  hallazgos: Hallazgo[]
  /** Ids de los PDV que entraron en rojo respecto del período anterior (vacío si no hay anterior). */
  nuevosRojos: number[]
  /** Ids de los que salieron del rojo. */
  salieronDelRojo: number[]
  /** Umbral de "drop chico" usado (bultos por entrega). */
  dropChico: number
}

const fmtNum = (n: number, d = 0) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n || 0)
const fmtMoney = (n: number) => "$" + fmtNum(Math.round(n || 0))

/**
 * Arma la lectura del período.
 * @param filas PDV del período (la foto).
 * @param kmPorCiudad km de ruta desde el CD por ciudad (costo_km_ciudad).
 * @param previas PDV del período anterior (mes anterior), si hay, para el movimiento de rojos.
 * @param nombrePrevio etiqueta del período anterior ("agosto 2026").
 */
export function armarLectura(
  filas: PdvLectura[],
  kmPorCiudad: Map<string, number>,
  previas: PdvLectura[] | null = null,
  nombrePrevio: string | null = null,
): Lectura {
  const cortes = calcularCortes(filas)
  const conBanda = filas.map((f) => ({ f, banda: bandaDe(f, cortes) }))
  const representativos = conBanda.filter((x) => x.banda !== "bajo")
  const rojos = representativos.filter((x) => x.banda === "caro")
  const hallazgos: Hallazgo[] = []

  const hlTotal = filas.reduce((s, f) => s + f.hl, 0)
  const costoTotal = filas.reduce((s, f) => s + f.costo_total, 0)
  const promedio = hlTotal > 0 ? costoTotal / hlTotal : 0

  // Drop chico: la mitad de la mediana de bultos por entrega de los representativos.
  const drops = representativos
    .map((x) => (x.f.comprobantes > 0 ? x.f.bultos / x.f.comprobantes : 0))
    .filter((d) => d > 0)
    .sort((a, b) => a - b)
  const medianaDrop = quantile(drops, 0.5)
  const dropChico = Math.max(1, Math.round((medianaDrop / 2) * 10) / 10)

  if (representativos.length === 0) {
    return { hallazgos: [{ tono: "neutro", texto: "Sin PDV representativos en el período." }], nuevosRojos: [], salieronDelRojo: [], dropChico }
  }

  // 1) Ciudad más cara (con al menos 15 PDV representativos para que el % tenga sentido).
  const porCiudad = new Map<string, { pdv: number; rojos: number; hl: number; costo: number }>()
  for (const x of representativos) {
    const r = porCiudad.get(x.f.ciudad) ?? { pdv: 0, rojos: 0, hl: 0, costo: 0 }
    r.pdv++
    if (x.banda === "caro") r.rojos++
    r.hl += x.f.hl
    r.costo += x.f.costo_total
    porCiudad.set(x.f.ciudad, r)
  }
  const ciudades = [...porCiudad.entries()]
    .filter(([, r]) => r.pdv >= 15)
    .map(([ciudad, r]) => ({ ciudad, ...r, pctRojo: (100 * r.rojos) / r.pdv, costoXHl: r.hl > 0 ? r.costo / r.hl : 0 }))
    .sort((a, b) => b.pctRojo - a.pctRojo)
  const peor = ciudades[0]
  if (peor && peor.rojos > 0) {
    const veces = promedio > 0 ? peor.costoXHl / promedio : 0
    hallazgos.push({
      tono: peor.pctRojo >= 25 ? "mal" : "atencion",
      texto:
        `${peor.ciudad} es la ciudad más cara de servir: ${fmtNum(peor.pctRojo)} % de sus PDV en rojo ` +
        `(${peor.rojos} de ${peor.pdv}) y ${fmtMoney(peor.costoXHl)}/HL` +
        (veces > 0 ? `, ${fmtNum(veces, 1)} veces el promedio de ${fmtMoney(promedio)}/HL.` : "."),
    })
    const mejor = [...ciudades].sort((a, b) => a.costoXHl - b.costoXHl)[0]
    if (mejor && mejor.ciudad !== peor.ciudad) {
      const kmMejor = kmPorCiudad.get(mejor.ciudad)
      hallazgos.push({
        tono: "neutro",
        texto:
          `La más barata es ${mejor.ciudad}${kmMejor !== undefined ? ` (${fmtNum(kmMejor)} km)` : ""}: ` +
          `${fmtNum(mejor.pctRojo)} % de rojos y ${fmtMoney(mejor.costoXHl)}/HL.`,
      })
    }
  }

  // 2) Concentración del costo en los rojos.
  if (rojos.length > 0) {
    const costoRojos = rojos.reduce((s, x) => s + x.f.costo_total, 0)
    const hlRojos = rojos.reduce((s, x) => s + x.f.hl, 0)
    const pctCosto = costoTotal > 0 ? (100 * costoRojos) / costoTotal : 0
    const pctHl = hlTotal > 0 ? (100 * hlRojos) / hlTotal : 0
    hallazgos.push({
      tono: pctCosto >= 2 * pctHl ? "mal" : "atencion",
      texto:
        `Los ${rojos.length} PDV en rojo se llevan ${fmtNum(pctCosto, 1)} % del costo logístico del período ` +
        `(${fmtMoney(costoRojos)}) y entregan sólo ${fmtNum(pctHl, 1)} % de los HL.`,
    })
  }

  // 3) Dónde están los rojos y si son caros por el pedido chico o por la distancia.
  if (rojos.length > 0) {
    const rojosPorCiudad = new Map<string, number>()
    for (const x of rojos) rojosPorCiudad.set(x.f.ciudad, (rojosPorCiudad.get(x.f.ciudad) ?? 0) + 1)
    const top = [...rojosPorCiudad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    hallazgos.push({
      tono: "neutro",
      texto:
        `Dónde están los ${rojos.length} rojos: ` +
        top.map(([c, n]) => `${c} ${n}`).join(", ") +
        (rojosPorCiudad.size > 3 ? ` y ${rojos.length - top.reduce((s, [, n]) => s + n, 0)} en otras ciudades.` : "."),
    })
    const conDropChico = rojos.filter((x) => x.f.comprobantes > 0 && x.f.bultos / x.f.comprobantes < dropChico).length
    const pctDrop = (100 * conDropChico) / rojos.length
    hallazgos.push({
      tono: pctDrop >= 50 ? "mal" : "atencion",
      texto:
        `${fmtNum(pctDrop)} % de los rojos (${conDropChico}) entrega menos de ${fmtNum(dropChico, 1)} bultos por visita ` +
        `(la mediana del período es ${fmtNum(medianaDrop, 1)}): para esos el camino es orden mínima y frecuencia de visita. ` +
        `Los otros ${rojos.length - conDropChico} son caros por la distancia: rutas y días de reparto.`,
    })
  }

  // 4) Movimiento contra el período anterior.
  let nuevosRojos: number[] = []
  let salieronDelRojo: number[] = []
  if (previas && previas.length > 0) {
    const cortesPrev = calcularCortes(previas)
    const rojosPrev = new Set(previas.filter((f) => bandaDe(f, cortesPrev) === "caro").map((f) => f.id))
    const idsPrev = new Set(previas.map((f) => f.id))
    const rojosAhora = new Set(rojos.map((x) => x.f.id))
    nuevosRojos = rojos.filter((x) => !rojosPrev.has(x.f.id) && idsPrev.has(x.f.id)).map((x) => x.f.id)
    salieronDelRojo = [...rojosPrev].filter((id) => !rojosAhora.has(id) && filas.some((f) => f.id === id))
    // El rojo es siempre ~10 % de los PDV, así que lo que importa no es si crece sino
    // si son los mismos: rojos persistentes = problema estructural (ruta, orden mínima);
    // mucha rotación = depende del pedido del mes.
    const persistentes = rojos.filter((x) => rojosPrev.has(x.f.id)).length
    const pctPersist = (100 * persistentes) / rojos.length
    const etiqueta = nombrePrevio ? ` en ${nombrePrevio}` : " el período anterior"
    hallazgos.push({
      tono: pctPersist >= 60 ? "mal" : "atencion",
      texto:
        `De los ${rojos.length} rojos, ${persistentes} ya estaban en rojo${etiqueta} (${fmtNum(pctPersist)} %); ` +
        `${nuevosRojos.length} entraron y ${salieronDelRojo.length} salieron. ` +
        (pctPersist >= 60
          ? "Son casi siempre los mismos: el problema es estructural."
          : "Hay rotación: una parte depende del pedido de cada mes."),
    })
  }

  return { hallazgos, nuevosRojos, salieronDelRojo, dropChico }
}
