/**
 * Presupuesto de costo de las capacitaciones DPO — el mismo cálculo que la
 * planilla de Cinia («Presupuesto_Costo_Capacitaciones_DPO», hojas Detalle /
 * Escenario 3 x mes), pero vivo sobre lo que está cargado en la app.
 *
 * - **Costo/hora del capacitador** = sueldo mensual ÷ horas laborales del mes.
 * - **Costo de una capacitación** = duración × costo/hora (dictado)
 *   + horas de preparación × costo/hora + logística fija + material × asistente.
 * - **Presupuesto** = todas las capacitaciones del año no canceladas.
 * - **Ejecutado** = las cumplidas (estado derivado `completada`).
 * - **Escenario**: cada capacitador da N capacitaciones por mes en el período;
 *   cada una cuesta (duración estándar + preparación) × su costo/hora.
 *
 * Las horas-hombre de los asistentes son informativas y no se suman.
 */
import type { EstadoCapacitacion } from "@/types/database"

export const CLAVE_COSTO_CONFIG = "capacitaciones:presupuesto_costo"

export const PILARES_COSTO = [
  "Seguridad",
  "Gente",
  "Gestion",
  "Entrega",
  "Almacen",
  "Flota",
  "Planeamiento",
] as const

export interface CostoConfig {
  horasMes: number
  horasPreparacion: number
  logisticaFija: number
  materialPorAsistente: number
  /** Escenario: capacitaciones por capacitador por mes. */
  capsPorMes: number
  /** Escenario: duración estándar de cada capacitación (h). */
  duracionEstandar: number
  /** Escenario: meses 0-based, inclusive. */
  mesDesde: number
  mesHasta: number
  /** Capacitador y sueldo mensual por pilar. */
  instructores: Record<string, { nombre: string; sueldo: number }>
  /** Presupuesto oficial (PxQ MRP, línea GENTE/CAPACITACIONES) por mes, Ene→Dic. */
  oficialPxQ: number[]
}

export const COSTO_CONFIG_DEFAULT: CostoConfig = {
  horasMes: 200,
  horasPreparacion: 2,
  logisticaFija: 0,
  materialPorAsistente: 0,
  capsPorMes: 3,
  duracionEstandar: 0.5,
  mesDesde: 3,
  mesHasta: 10,
  instructores: {
    Almacen: { nombre: "Esteban Altube", sueldo: 2_500_000 },
    Entrega: { nombre: "Fausto Azzaretti", sueldo: 2_500_000 },
    Seguridad: { nombre: "Daniel Avaro", sueldo: 3_000_000 },
    Gente: { nombre: "Cinia Morel", sueldo: 1_900_000 },
    Planeamiento: { nombre: "Sebastian Roselli", sueldo: 3_000_000 },
    Gestion: { nombre: "Sebastian Roselli", sueldo: 3_000_000 },
    Flota: { nombre: "Fausto Azzaretti", sueldo: 2_500_000 },
  },
  oficialPxQ: [0, 0, 750_000, 1_413_000, 1_350_000, 0, 0, 0, 1_350_000, 600_000, 600_000, 0],
}

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : d)

/** Mezcla lo guardado con los valores por defecto (lo que falte o venga roto queda en default). */
export function parseCostoConfig(raw: string | null | undefined): CostoConfig {
  const d = COSTO_CONFIG_DEFAULT
  let j: Partial<CostoConfig> = {}
  try {
    j = raw ? (JSON.parse(raw) as Partial<CostoConfig>) : {}
  } catch {
    j = {}
  }
  const instructores: CostoConfig["instructores"] = {}
  for (const p of PILARES_COSTO) {
    const g = j.instructores?.[p]
    instructores[p] = {
      nombre: typeof g?.nombre === "string" && g.nombre.trim() ? g.nombre.trim() : d.instructores[p].nombre,
      sueldo: num(g?.sueldo, d.instructores[p].sueldo),
    }
  }
  const mesDesde = Math.min(11, Math.floor(num(j.mesDesde, d.mesDesde)))
  const mesHasta = Math.max(mesDesde, Math.min(11, Math.floor(num(j.mesHasta, d.mesHasta))))
  return {
    horasMes: num(j.horasMes, d.horasMes) || d.horasMes,
    horasPreparacion: num(j.horasPreparacion, d.horasPreparacion),
    logisticaFija: num(j.logisticaFija, d.logisticaFija),
    materialPorAsistente: num(j.materialPorAsistente, d.materialPorAsistente),
    capsPorMes: num(j.capsPorMes, d.capsPorMes),
    duracionEstandar: num(j.duracionEstandar, d.duracionEstandar),
    mesDesde,
    mesHasta,
    instructores,
    oficialPxQ: Array.from({ length: 12 }, (_, i) => num(j.oficialPxQ?.[i], d.oficialPxQ[i])),
  }
}

export interface ItemCosto {
  id: string
  titulo: string
  fecha: string
  pilar: string | null
  duracion_horas: number
  total_asistentes: number
  estadoReal: EstadoCapacitacion
}

export interface FilaCosto extends ItemCosto {
  mes: number
  pilarN: string
  capacitador: string
  costoHora: number
  dictado: number
  preparacion: number
  logistica: number
  material: number
  total: number
  cumplida: boolean
}

export interface ResumenCosto {
  anio: number
  filas: FilaCosto[]
  presupuesto: number
  ejecutado: number
  oficial: number
  cumplidas: number
  horasHombre: number
  porMes: { mes: number; caps: number; presupuesto: number; ejecutado: number; oficial: number }[]
  porPilar: {
    pilar: string
    capacitador: string
    caps: number
    asistentes: number
    presupuesto: number
    ejecutado: number
  }[]
  escenario: {
    meses: number[]
    metaMes: number
    capacitadores: {
      nombre: string
      pilares: string[]
      costoHora: number
      porMes: number[]
      real: number
      meta: number
      costoPorCap: number
      costoEscenario: number
      costoReal: number
    }[]
    totalMes: number[]
    real: number
    meta: number
    costoEscenario: number
    costoReal: number
  }
}

/** "Almacén" / "flota" → "Almacen" / "Flota". */
export function normalizarPilarCosto(p: string | null): string {
  const s = (p ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
  return PILARES_COSTO.find((x) => x.toLowerCase() === s) ?? (p?.trim() || "Sin pilar")
}

export function calcularCosto(items: ItemCosto[], cfg: CostoConfig, anio: number): ResumenCosto {
  const filas: FilaCosto[] = items
    .filter((c) => c.fecha?.slice(0, 4) === String(anio) && c.estadoReal !== "cancelada")
    .map((c) => {
      const pilarN = normalizarPilarCosto(c.pilar)
      const inst = cfg.instructores[pilarN]
      const costoHora = inst ? inst.sueldo / cfg.horasMes : 0
      const dur = Number(c.duracion_horas) || 0
      const dictado = dur * costoHora
      const preparacion = cfg.horasPreparacion * costoHora
      const logistica = cfg.logisticaFija
      const material = c.total_asistentes * cfg.materialPorAsistente
      const total = dictado + preparacion + logistica + material
      return {
        ...c,
        mes: Number(c.fecha.slice(5, 7)) - 1,
        pilarN,
        capacitador: inst?.nombre ?? "Sin capacitador",
        costoHora,
        dictado,
        preparacion,
        logistica,
        material,
        total,
        cumplida: c.estadoReal === "completada",
      }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo))

  const sum = (xs: FilaCosto[], f: (x: FilaCosto) => number) => xs.reduce((s, x) => s + f(x), 0)

  const porMes = Array.from({ length: 12 }, (_, mes) => {
    const del = filas.filter((f) => f.mes === mes)
    return {
      mes,
      caps: del.length,
      presupuesto: sum(del, (f) => f.total),
      ejecutado: sum(del, (f) => (f.cumplida ? f.total : 0)),
      oficial: cfg.oficialPxQ[mes] ?? 0,
    }
  })

  const pilares = [...new Set([...PILARES_COSTO, ...filas.map((f) => f.pilarN)])]
  const porPilar = pilares
    .map((pilar) => {
      const del = filas.filter((f) => f.pilarN === pilar)
      return {
        pilar,
        capacitador: cfg.instructores[pilar]?.nombre ?? "Sin capacitador",
        caps: del.length,
        asistentes: sum(del, (f) => f.total_asistentes),
        presupuesto: sum(del, (f) => f.total),
        ejecutado: sum(del, (f) => (f.cumplida ? f.total : 0)),
      }
    })
    .filter((p) => p.caps > 0 || PILARES_COSTO.includes(p.pilar as (typeof PILARES_COSTO)[number]))
    .sort((a, b) => b.presupuesto - a.presupuesto)

  // Escenario: un renglón por capacitador (puede tener varios pilares).
  const meses: number[] = []
  for (let m = cfg.mesDesde; m <= cfg.mesHasta; m++) meses.push(m)
  const nombres = [...new Set(PILARES_COSTO.map((p) => cfg.instructores[p].nombre))]
  const capacitadores = nombres.map((nombre) => {
    const pils = PILARES_COSTO.filter((p) => cfg.instructores[p].nombre === nombre)
    const costoHora = Math.max(...pils.map((p) => cfg.instructores[p].sueldo)) / cfg.horasMes
    const suyas = filas.filter((f) => f.capacitador === nombre && meses.includes(f.mes))
    const porMesC = meses.map((m) => suyas.filter((f) => f.mes === m).length)
    const meta = cfg.capsPorMes * meses.length
    const costoPorCap = (cfg.duracionEstandar + cfg.horasPreparacion) * costoHora
    return {
      nombre,
      pilares: [...pils],
      costoHora,
      porMes: porMesC,
      real: suyas.length,
      meta,
      costoPorCap,
      costoEscenario: meta * costoPorCap,
      costoReal: sum(suyas, (f) => f.total),
    }
  })
  const sumC = (f: (c: (typeof capacitadores)[number]) => number) => capacitadores.reduce((s, c) => s + f(c), 0)

  return {
    anio,
    filas,
    presupuesto: sum(filas, (f) => f.total),
    ejecutado: sum(filas, (f) => (f.cumplida ? f.total : 0)),
    oficial: cfg.oficialPxQ.reduce((s, v) => s + v, 0),
    cumplidas: filas.filter((f) => f.cumplida).length,
    horasHombre: sum(filas, (f) => (Number(f.duracion_horas) || 0) * f.total_asistentes),
    porMes,
    porPilar,
    escenario: {
      meses,
      metaMes: cfg.capsPorMes * capacitadores.length,
      capacitadores,
      totalMes: meses.map((_, i) => sumC((c) => c.porMes[i])),
      real: sumC((c) => c.real),
      meta: sumC((c) => c.meta),
      costoEscenario: sumC((c) => c.costoEscenario),
      costoReal: sumC((c) => c.costoReal),
    },
  }
}
