// Lógica pura de productividad de clasificación de envases.
// Sin dependencias de Next/Supabase: la usan tanto la página (server action,
// sesión del usuario) como el endpoint /api (service role para DepositoDashboard).
//
// Modelo: el operador carga el TOTAL a clasificar + los rotos. Los clasificados
// se derivan (clasificados = total - rotos). La productividad es de la TAREA,
// agregada (no se segmenta por operador).

export interface ClasificacionEnvaseRow {
  fecha: string // YYYY-MM-DD
  hora_inicio: string // "HH:MM" o "HH:MM:SS"
  hora_fin: string
  pallets_total: number
  pallets_rotos: number
  cajones_total: number
  cajones_rotos: number
  botellas_rotas: number
  creado_por?: string | null // id del perfil que cargó el registro
}

export interface ProductividadTotales {
  cargas: number
  horas: number
  pallets_total: number
  pallets_rotos: number
  pallets_clasificados: number
  cajones_total: number
  cajones_rotos: number
  cajones_clasificados: number
  botellas_rotas: number
  cajones_por_hora: number
  pallets_por_hora: number
  pct_rotura_cajones: number
  pct_rotura_pallets: number
}

export interface ProductividadDia extends ProductividadTotales {
  fecha: string // YYYY-MM-DD
}

// Productividad de una persona en una fecha (una fila por persona × día).
// Permite a los consumidores agregar por el período/mes que quieran.
export interface ProductividadPersonaDia extends ProductividadTotales {
  fecha: string // YYYY-MM-DD
  creado_por: string | null
  nombre: string // nombre del perfil, ya resuelto y remapeado
}

export interface ProductividadResp {
  rango: { desde: string; hasta: string }
  totales: ProductividadTotales
  serie: ProductividadDia[] // por fecha, ascendente
  por_persona_dia: ProductividadPersonaDia[] // por persona × fecha
}

const SIN_ASIGNAR = "Sin asignar"

/**
 * Duración en horas entre dos horas "HH:MM[:SS]". Si la hora de fin es menor o
 * igual a la de inicio se asume que el turno cruza la medianoche (+24 h).
 */
export function duracionHoras(horaInicio: string, horaFin: string): number {
  const aMin = (t: string): number => {
    const [h, m] = t.split(":").map((n) => parseInt(n, 10))
    return (h || 0) * 60 + (m || 0)
  }
  let diff = aMin(horaFin) - aMin(horaInicio)
  if (diff <= 0) diff += 24 * 60 // cruza medianoche
  return diff / 60
}

function round(n: number, dec: number): number {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

function totalesDesde(rows: ClasificacionEnvaseRow[]): ProductividadTotales {
  let horas = 0
  let pallets_total = 0
  let pallets_rotos = 0
  let cajones_total = 0
  let cajones_rotos = 0
  let botellas_rotas = 0

  for (const r of rows) {
    horas += duracionHoras(r.hora_inicio, r.hora_fin)
    pallets_total += r.pallets_total ?? 0
    pallets_rotos += r.pallets_rotos ?? 0
    cajones_total += r.cajones_total ?? 0
    cajones_rotos += r.cajones_rotos ?? 0
    botellas_rotas += r.botellas_rotas ?? 0
  }

  const pallets_clasificados = pallets_total - pallets_rotos
  const cajones_clasificados = cajones_total - cajones_rotos

  return {
    cargas: rows.length,
    horas: round(horas, 2),
    pallets_total,
    pallets_rotos,
    pallets_clasificados,
    cajones_total,
    cajones_rotos,
    cajones_clasificados,
    botellas_rotas,
    // Throughput = total procesado por hora trabajada.
    cajones_por_hora: horas > 0 ? round(cajones_total / horas, 1) : 0,
    pallets_por_hora: horas > 0 ? round(pallets_total / horas, 1) : 0,
    // % rotura = rotos sobre total declarado.
    pct_rotura_cajones: cajones_total > 0 ? round((cajones_rotos / cajones_total) * 100, 1) : 0,
    pct_rotura_pallets: pallets_total > 0 ? round((pallets_rotos / pallets_total) * 100, 1) : 0,
  }
}

/**
 * Agrega un conjunto de cargas en totales del período + serie diaria + una
 * serie por persona × día. `nombresPorId` mapea creado_por → nombre a mostrar
 * (ya remapeado por quien llama); si falta, se rotula "Sin asignar".
 */
export function agregarProductividad(
  rows: ClasificacionEnvaseRow[],
  desde: string,
  hasta: string,
  nombresPorId: Record<string, string> = {}
): ProductividadResp {
  const porDia = new Map<string, ClasificacionEnvaseRow[]>()
  for (const r of rows) {
    const arr = porDia.get(r.fecha) ?? []
    arr.push(r)
    porDia.set(r.fecha, arr)
  }

  const serie: ProductividadDia[] = Array.from(porDia.keys())
    .sort()
    .map((fecha) => ({ fecha, ...totalesDesde(porDia.get(fecha)!) }))

  // Agrupar por (creado_por, fecha) para la serie por persona × día.
  const porPersonaDia = new Map<string, ClasificacionEnvaseRow[]>()
  for (const r of rows) {
    const pid = r.creado_por ?? ""
    const key = `${pid}|${r.fecha}`
    const arr = porPersonaDia.get(key) ?? []
    arr.push(r)
    porPersonaDia.set(key, arr)
  }

  const por_persona_dia: ProductividadPersonaDia[] = Array.from(porPersonaDia.keys())
    .sort()
    .map((key) => {
      const grupo = porPersonaDia.get(key)!
      const creado_por = grupo[0].creado_por ?? null
      const nombre = (creado_por && nombresPorId[creado_por]) || SIN_ASIGNAR
      return { fecha: grupo[0].fecha, creado_por, nombre, ...totalesDesde(grupo) }
    })

  return {
    rango: { desde, hasta },
    totales: totalesDesde(rows),
    serie,
    por_persona_dia,
  }
}
