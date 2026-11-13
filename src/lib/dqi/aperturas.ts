// =============================================
// DQI abierto por chofer, día de la semana y zona.
//
// Base: roturas EN RUTA con detalle diario (serie diaria del tablero de
// pérdidas, origen "distribucion") ÷ HL entregado del día. Es la misma base que
// la fila DQI de la matinal (dqi_dia / dqi), no la tarjeta mensual de /api/dqi.
//
// - Chofer: cada rotura (fecha + patente) va al chofer que egresó con ese camión
//   ese día según portería. El denominador es el HL despachado de sus
//   camión-día (ocupación de bodega) escalado para que la suma cierre con el HL
//   entregado del período (mismo criterio que el ranking por patente).
// - Día de la semana: HL rotos del día ÷ HL entregado del día, sumado por día.
// - Zona: cada camión-día va a su localidad con más HL ese día.
//
// Función pura: recibe los datos ya traídos, no consulta nada.
// =============================================

export interface RoturaDia {
  fecha: string // YYYY-MM-DD
  patente: string // normalizada; "" si no vino
  sku: string
  descripcion: string
  hl: number
}

export interface CamionDia {
  fecha: string
  patente: string
  hl: number
}

export interface EgresoDia {
  fecha: string
  patente: string
  chofer: string
}

export interface LocalidadCamionDia {
  fecha: string
  patente: string
  localidad: string
  hl: number
}

export interface AperturasInput {
  roturas: RoturaDia[]
  /** HL entregado oficial por día (hl_entregado_dia). */
  hlEntregadoDia: Record<string, number>
  despachos: CamionDia[]
  egresos: EgresoDia[]
  localidades: LocalidadCamionDia[]
}

export interface RoturaDetalle {
  fecha: string
  dia: string
  patente: string
  sku: string
  descripcion: string
  hl: number
}

export interface FilaApertura {
  clave: string
  nombre: string
  /** HL que movió (despachado escalado al HL entregado del período). */
  hl_movidos: number
  hl_rotos: number
  /** null = sin volumen registrado (no es 0: no se puede decir que no rompió). */
  ppm: number | null
  eventos: number
  /** Chofer: días que salió. Día de semana: días trabajados. Zona: camión-día. */
  dias: number
  /** Día de semana: días con al menos una rotura. */
  dias_con_rotura?: number
  pct_roturas: number
  base_chica: boolean
  detalle?: RoturaDetalle[]
}

export interface AperturasResultado {
  choferes: FilaApertura[]
  dias_semana: FilaApertura[]
  zonas: FilaApertura[]
  total: { hl_rotos: number; hl_entregados: number; ppm: number | null; eventos: number }
  cobertura: { pct_hl_con_chofer: number; pct_hl_con_zona: number }
}

export const SIN_CHOFER = "(sin chofer en portería)"
export const SIN_ZONA = "(sin zona)"
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

export function normalizarPatente(p: string | null | undefined): string {
  return (p ?? "").replace(/\s+/g, "").toUpperCase()
}

export function normalizarNombre(n: string | null | undefined): string {
  return (n ?? "").replace(/\s+/g, " ").trim()
}

export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

const r4 = (n: number) => Math.round(n * 10000) / 10000
const r1 = (n: number) => Math.round(n * 10) / 10
const ppmDe = (rotos: number, movidos: number) => (movidos > 0 ? Math.round((rotos / movidos) * 1e6) : null)

export function calcularAperturas(input: AperturasInput): AperturasResultado {
  const key = (f: string, p: string) => `${f}|${p}`

  // Despacho por camión-día (puede haber varias filas: se suman).
  const despacho = new Map<string, number>()
  for (const d of input.despachos) {
    if (!d.patente || !(d.hl > 0)) continue
    despacho.set(key(d.fecha, d.patente), (despacho.get(key(d.fecha, d.patente)) ?? 0) + d.hl)
  }
  const totalDespachado = [...despacho.values()].reduce((a, b) => a + b, 0)
  const hlEntregados = Object.values(input.hlEntregadoDia).reduce((a, b) => a + (b > 0 ? b : 0), 0)
  // Escala: el despacho de bodega no es el HL entregado oficial; se lleva a esa
  // base para que el PPM ponderado de todos cierre con el DQI del período.
  const escala = totalDespachado > 0 && hlEntregados > 0 ? hlEntregados / totalDespachado : 0

  // Chofer de cada camión-día: el primero con nombre que egresó ese día.
  const choferDe = new Map<string, string>()
  const nombreVisible = new Map<string, string>()
  for (const e of input.egresos) {
    const nombre = normalizarNombre(e.chofer)
    if (!e.patente || !nombre) continue
    const k = key(e.fecha, e.patente)
    if (!choferDe.has(k)) choferDe.set(k, nombre.toUpperCase())
    if (!nombreVisible.has(nombre.toUpperCase())) nombreVisible.set(nombre.toUpperCase(), nombre)
  }

  // Zona de cada camión-día: la localidad con más HL.
  const zonaHl = new Map<string, { loc: string; hl: number }>()
  for (const l of input.localidades) {
    const loc = normalizarNombre(l.localidad).toUpperCase()
    if (!l.patente || !loc) continue
    const k = key(l.fecha, l.patente)
    const cur = zonaHl.get(k)
    if (!cur || l.hl > cur.hl) zonaHl.set(k, { loc, hl: l.hl })
  }

  type Acum = { hl_movidos: number; hl_rotos: number; eventos: number; dias: Set<string>; diasRot: Set<string>; detalle: RoturaDetalle[] }
  const nuevo = (): Acum => ({ hl_movidos: 0, hl_rotos: 0, eventos: 0, dias: new Set(), diasRot: new Set(), detalle: [] })
  const choferes = new Map<string, Acum>()
  const zonas = new Map<string, Acum>()
  const dias = new Map<number, Acum>()
  const get = <K>(m: Map<K, Acum>, k: K) => {
    let a = m.get(k)
    if (!a) m.set(k, (a = nuevo()))
    return a
  }

  // Volumen: cada camión-día a su chofer y a su zona.
  for (const [k, hl] of despacho) {
    const [fecha] = k.split("|")
    const movidos = hl * escala
    const c = get(choferes, choferDe.get(k) ?? SIN_CHOFER)
    c.hl_movidos += movidos
    c.dias.add(fecha)
    const z = get(zonas, zonaHl.get(k)?.loc ?? SIN_ZONA)
    z.hl_movidos += movidos
    z.dias.add(k)
  }
  // Volumen por día de semana: HL entregado oficial del día.
  for (const [fecha, hl] of Object.entries(input.hlEntregadoDia)) {
    if (!(hl > 0)) continue
    const d = get(dias, diaSemana(fecha))
    d.hl_movidos += hl
    d.dias.add(fecha)
  }

  // Roturas.
  let hlRotos = 0
  let hlConChofer = 0
  let hlConZona = 0
  for (const r of input.roturas) {
    if (!(r.hl > 0)) continue
    hlRotos += r.hl
    const k = key(r.fecha, r.patente)
    const det: RoturaDetalle = {
      fecha: r.fecha,
      dia: DIAS[diaSemana(r.fecha)],
      patente: r.patente || "—",
      sku: r.sku,
      descripcion: r.descripcion,
      hl: r4(r.hl),
    }
    const chofer = choferDe.get(k)
    if (chofer) hlConChofer += r.hl
    const c = get(choferes, chofer ?? SIN_CHOFER)
    c.hl_rotos += r.hl
    c.eventos += 1
    c.detalle.push(det)
    const zona = zonaHl.get(k)?.loc
    if (zona) hlConZona += r.hl
    const z = get(zonas, zona ?? SIN_ZONA)
    z.hl_rotos += r.hl
    z.eventos += 1
    const d = get(dias, diaSemana(r.fecha))
    d.hl_rotos += r.hl
    d.eventos += 1
    d.diasRot.add(r.fecha)
  }

  const promedio = (m: Map<string, Acum>) => {
    const vals = [...m.entries()].filter(([k, a]) => k !== SIN_CHOFER && k !== SIN_ZONA && a.hl_movidos > 0)
    return vals.length ? vals.reduce((s, [, a]) => s + a.hl_movidos, 0) / vals.length : 0
  }
  const fila = (clave: string, nombre: string, a: Acum, umbral: number, conDetalle: boolean): FilaApertura => ({
    clave,
    nombre,
    hl_movidos: r1(a.hl_movidos),
    hl_rotos: r4(a.hl_rotos),
    ppm: ppmDe(a.hl_rotos, a.hl_movidos),
    eventos: a.eventos,
    dias: a.dias.size,
    dias_con_rotura: a.diasRot.size,
    pct_roturas: hlRotos > 0 ? r1((a.hl_rotos / hlRotos) * 100) : 0,
    base_chica: umbral > 0 && a.hl_movidos > 0 && a.hl_movidos < umbral,
    ...(conDetalle ? { detalle: a.detalle.sort((x, y) => y.fecha.localeCompare(x.fecha)) } : {}),
  })
  const orden = (a: FilaApertura, b: FilaApertura) => {
    const sinA = a.clave === SIN_CHOFER || a.clave === SIN_ZONA
    const sinB = b.clave === SIN_CHOFER || b.clave === SIN_ZONA
    if (sinA !== sinB) return sinA ? 1 : -1
    // Base chica al final: su PPM se dispara con una sola rotura y no es comparable.
    if (a.base_chica !== b.base_chica) return a.base_chica ? 1 : -1
    if (a.ppm == null && b.ppm == null) return b.hl_rotos - a.hl_rotos
    if (a.ppm == null) return 1
    if (b.ppm == null) return -1
    return b.ppm - a.ppm || b.hl_rotos - a.hl_rotos
  }

  // Base chica: menos de un tercio de lo que movió el chofer / la zona promedio.
  const umbralChofer = promedio(choferes) / 3
  const umbralZona = promedio(zonas) / 3
  const filasChofer = [...choferes.entries()]
    .map(([k, a]) => fila(k, k === SIN_CHOFER ? SIN_CHOFER : (nombreVisible.get(k) ?? k), a, umbralChofer, true))
    .sort(orden)
  const filasZona = [...zonas.entries()]
    .map(([k, a]) => fila(k, k, a, umbralZona, false))
    .sort(orden)
  // Lunes a sábado siempre; el domingo sólo si hubo entregas.
  const filasDia = [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => d !== 0 || dias.has(0))
    .map((d) => fila(String(d), DIAS[d], dias.get(d) ?? nuevo(), 0, false))

  return {
    choferes: filasChofer,
    dias_semana: filasDia,
    zonas: filasZona,
    total: {
      hl_rotos: r4(hlRotos),
      hl_entregados: r1(hlEntregados),
      ppm: ppmDe(hlRotos, hlEntregados),
      eventos: input.roturas.filter((r) => r.hl > 0).length,
    },
    cobertura: {
      pct_hl_con_chofer: hlRotos > 0 ? r1((hlConChofer / hlRotos) * 100) : 100,
      pct_hl_con_zona: hlRotos > 0 ? r1((hlConZona / hlRotos) * 100) : 100,
    },
  }
}
