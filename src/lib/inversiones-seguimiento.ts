/**
 * Seguimiento de inversiones (DPO 5.3 · 3YP & CAPEX): real vs planificado en
 * tiempo y en presupuesto, y la curva mensual contra el presupuesto CAPEX.
 *
 * Todo trabaja con fechas ISO "YYYY-MM-DD" sin pasar por Date para evitar el
 * corrimiento de zona horaria.
 */
import type { Inversion } from "@/types/database"

const DAY = 86400000

export function parseFecha(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function isoHoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Días de b − a (0 si es el mismo día; negativo si b está antes). */
export function diasEntre(a: string, b: string): number {
  return Math.round((parseFecha(b).getTime() - parseFecha(a).getTime()) / DAY)
}

export function formatFechaCorta(s: string | null | undefined): string {
  if (!s) return "—"
  const [y, m, d] = s.slice(0, 10).split("-")
  return `${d}/${m}/${y.slice(2)}`
}

/** Una fecha es válida si tiene forma ISO y un año razonable (filtra tipeos como 22026). */
export function fechaValida(s: string | null | undefined): s is string {
  if (!s) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return false
  const y = Number(m[1])
  return y >= 2000 && y <= 2100
}

// ---------------------------------------------------------------------------
// Desvíos por inversión
// ---------------------------------------------------------------------------

export type Semaforo = "ok" | "atencion" | "critico"

export interface DesvioTiempo {
  /** Días entre el fin planificado y el fin real (o hoy si está vencida y abierta). + = tarde. */
  dias: number
  /** true cuando la inversión sigue abierta y ya pasó su fecha programada. */
  vencida: boolean
  semaforo: Semaforo
}

export interface DesvioMonto {
  /** Diferencia real − estimado en $. + = se pasó. */
  monto: number
  /** Diferencia en % del estimado. */
  pct: number
  semaforo: Semaforo
}

export function semaforoDias(dias: number): Semaforo {
  if (dias <= 0) return "ok"
  if (dias <= 30) return "atencion"
  return "critico"
}

export function semaforoPct(pct: number): Semaforo {
  const abs = Math.abs(pct)
  if (abs < 5) return "ok"
  if (abs < 15) return "atencion"
  return "critico"
}

export function estaCerrada(inv: Pick<Inversion, "estado">): boolean {
  return inv.estado === "realizada" || inv.estado === "cancelada"
}

/**
 * Desvío de plazo: realizada → fin real vs programado; abierta y vencida →
 * hoy vs programado; si no hay con qué comparar, null.
 */
export function desvioTiempo(
  inv: Pick<Inversion, "estado" | "fecha_programada" | "fecha_realizada">,
  hoy = isoHoy(),
): DesvioTiempo | null {
  if (!fechaValida(inv.fecha_programada)) return null
  if (inv.estado === "realizada" && fechaValida(inv.fecha_realizada)) {
    const dias = diasEntre(inv.fecha_programada, inv.fecha_realizada)
    return { dias, vencida: false, semaforo: semaforoDias(dias) }
  }
  if (!estaCerrada(inv) && inv.fecha_programada < hoy) {
    const dias = diasEntre(inv.fecha_programada, hoy)
    return { dias, vencida: true, semaforo: semaforoDias(dias) }
  }
  return null
}

/** Desvío de presupuesto: sólo cuando hay estimado y real. */
export function desvioMonto(
  inv: Pick<Inversion, "monto_estimado" | "monto_real">,
): DesvioMonto | null {
  const est = inv.monto_estimado
  const real = inv.monto_real
  if (est === null || real === null || est === 0) return null
  const monto = real - est
  const pct = (monto / est) * 100
  return { monto, pct, semaforo: semaforoPct(pct) }
}

// ---------------------------------------------------------------------------
// Barras del Gantt
// ---------------------------------------------------------------------------

export interface BarraGantt {
  inicio: string
  fin: string
  /** Sin inicio cargado: se dibuja como hito en `fin`. */
  hito: boolean
}

/** Barra planificada: [inicio programado, fecha programada]. */
export function barraPlan(
  inv: Pick<Inversion, "fecha_inicio_programada" | "fecha_programada">,
): BarraGantt | null {
  if (!fechaValida(inv.fecha_programada)) return null
  const fin = inv.fecha_programada
  if (fechaValida(inv.fecha_inicio_programada) && inv.fecha_inicio_programada <= fin) {
    return { inicio: inv.fecha_inicio_programada, fin, hito: false }
  }
  return { inicio: fin, fin, hito: true }
}

/**
 * Barra real: realizada → [inicio real, fecha real]; en curso → [inicio real
 * (o inicio programado, o hoy), hoy] abierta. Programada/aprobada/cancelada: nada.
 */
export function barraReal(
  inv: Pick<
    Inversion,
    | "estado"
    | "fecha_inicio_programada"
    | "fecha_inicio_real"
    | "fecha_realizada"
  >,
  hoy = isoHoy(),
): (BarraGantt & { abierta: boolean }) | null {
  if (inv.estado === "realizada") {
    if (!fechaValida(inv.fecha_realizada)) return null
    const fin = inv.fecha_realizada
    if (fechaValida(inv.fecha_inicio_real) && inv.fecha_inicio_real <= fin) {
      return { inicio: inv.fecha_inicio_real, fin, hito: false, abierta: false }
    }
    return { inicio: fin, fin, hito: true, abierta: false }
  }
  if (inv.estado === "en_curso") {
    const inicio = fechaValida(inv.fecha_inicio_real)
      ? inv.fecha_inicio_real
      : fechaValida(inv.fecha_inicio_programada)
        ? inv.fecha_inicio_programada
        : hoy
    const fin = inicio > hoy ? inicio : hoy
    return { inicio, fin, hito: false, abierta: true }
  }
  return null
}

// ---------------------------------------------------------------------------
// Seguimiento mensual contra el presupuesto CAPEX
// ---------------------------------------------------------------------------

export interface MesSeguimiento {
  mes: number // 1..12
  /** $ estimados de las inversiones programadas para ese mes (sin canceladas). */
  plan: number
  /** $ reales de las inversiones realizadas en ese mes. */
  real: number
  planAcum: number
  realAcum: number
  nPlan: number
  nReal: number
}

export interface ResumenCapex {
  /**
   * Presupuesto CAPEX del año. Si no se cargó un monto aprobado aparte, el
   * presupuesto ES lo planificado: la suma de lo estimado de las inversiones
   * del año (así se maneja hoy; ver `presupuestoPlanificado`).
   */
  presupuesto: number
  /** true cuando el presupuesto salió de lo planificado y no de un monto cargado. */
  presupuestoPlanificado: boolean
  /** $ estimados de todas las inversiones vivas del año (sin canceladas). */
  comprometido: number
  /** $ reales de las realizadas (si falta el real, cuenta el estimado). */
  ejecutado: number
  /** $ estimados de lo que todavía no se hizo. */
  pendiente: number
  /**
   * presupuesto − comprometido (negativo = las inversiones superan el monto
   * aprobado). null cuando el presupuesto es lo planificado: ahí no hay margen
   * que medir, lo que importa es cuánto se ejecutó de lo planificado.
   */
  disponible: number | null
  nTotal: number
  nRealizadas: number
  nEnPlazo: number
  nTarde: number
  nEnPresupuesto: number
  nSobrePresupuesto: number
  meses: MesSeguimiento[]
}

function mesDe(iso: string | null | undefined, anio: number): number | null {
  if (!fechaValida(iso)) return null
  const [y, m] = iso.split("-").map(Number)
  return y === anio ? m : null
}

/** Qué monto cuenta como ejecutado para una realizada: el real, o el estimado si no se cargó. */
export function montoEjecutado(
  inv: Pick<Inversion, "monto_estimado" | "monto_real">,
): number {
  return inv.monto_real ?? inv.monto_estimado ?? 0
}

export function resumenCapex(
  inversiones: Inversion[],
  anio: number,
  presupuesto: number | null,
  hoy = isoHoy(),
): ResumenCapex {
  const meses: MesSeguimiento[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    plan: 0,
    real: 0,
    planAcum: 0,
    realAcum: 0,
    nPlan: 0,
    nReal: 0,
  }))

  let comprometido = 0
  let ejecutado = 0
  let pendiente = 0
  let nTotal = 0
  let nRealizadas = 0
  let nEnPlazo = 0
  let nTarde = 0
  let nEnPresupuesto = 0
  let nSobrePresupuesto = 0

  for (const inv of inversiones) {
    if (inv.estado === "cancelada") continue
    // CAPEX del año: sólo las inversiones del año. Las de 2 a 5 años son 3YP
    // y se siguen aparte; si entraran acá el comprometido sumaría 2027-2030.
    if (inv.horizonte_anios !== 1) continue
    nTotal++
    comprometido += inv.monto_estimado ?? 0

    const mPlan = mesDe(inv.fecha_programada, anio)
    if (mPlan !== null) {
      meses[mPlan - 1].plan += inv.monto_estimado ?? 0
      meses[mPlan - 1].nPlan++
    }

    if (inv.estado === "realizada") {
      nRealizadas++
      const ej = montoEjecutado(inv)
      ejecutado += ej
      const mReal = mesDe(inv.fecha_realizada, anio)
      if (mReal !== null) {
        meses[mReal - 1].real += ej
        meses[mReal - 1].nReal++
      }
      const dt = desvioTiempo(inv, hoy)
      if (dt) {
        if (dt.dias <= 0) nEnPlazo++
        else nTarde++
      }
      const dm = desvioMonto(inv)
      if (dm) {
        if (dm.monto <= 0) nEnPresupuesto++
        else nSobrePresupuesto++
      }
    } else {
      pendiente += inv.monto_estimado ?? 0
    }
  }

  let pa = 0
  let ra = 0
  for (const m of meses) {
    pa += m.plan
    ra += m.real
    m.planAcum = pa
    m.realAcum = ra
  }

  const presupuestoPlanificado = presupuesto === null
  return {
    presupuesto: presupuestoPlanificado ? comprometido : presupuesto,
    presupuestoPlanificado,
    comprometido,
    ejecutado,
    pendiente,
    disponible: presupuestoPlanificado ? null : presupuesto - comprometido,
    nTotal,
    nRealizadas,
    nEnPlazo,
    nTarde,
    nEnPresupuesto,
    nSobrePresupuesto,
    meses,
  }
}
