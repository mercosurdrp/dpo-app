// Análisis de incidencias de mantenimiento correctivo (DPO Flota 2.4 / R2.4.2).
//
// El verificador pide que «los datos de las órdenes correctivas puedan
// ESTRATIFICARSE para su análisis». Esta lib corta las OT correctivas por los
// cuatro ejes que explican una falla —sistema, unidad, mes y taller (interno /
// externo)— y arma la matriz unidad × sistema. Cada corte trae OT, unidades,
// costo, días parado, auxilios y % acumulado (Pareto), que es lo que permite
// decir "el 90 % del costo son cuatro sistemas" en una reunión.
//
// Función pura sobre `MantenimientoRealizado[]`: la pantalla ya recibe 24 meses
// de OT, así que no hace falta otra consulta.

import type { MantenimientoRealizado, MantenimientoSistema } from "@/types/database"
import { labelSistema } from "./sistemas-ot"
import { descripcionDeOt, sistemaDeOt } from "./recurrencia-correctivos"
import { esRotura } from "./rotura"

export type EjeEstratificacion = "sistema" | "unidad" | "mes" | "taller"

export interface OtCorrectiva {
  id: string
  numeroOt: string | null
  fecha: string
  ym: string
  dominio: string
  taller: string
  /** Interna = hecha en depósito (origen checklist o taller Depósito / sin taller). */
  interna: boolean
  sistema: MantenimientoSistema
  sistemaSugerido: boolean
  descripcion: string
  costo: number
  diasParado: number
  auxilio: boolean
  /** Rotura de flota: dejó la unidad parada ≥ 1 día o fue auxilio en ruta. */
  rotura: boolean
  horasTaller: number | null
}

export interface FilaEstrato {
  clave: string
  label: string
  n: number
  unidades: number
  costo: number
  diasParado: number
  auxilios: number
  roturas: number
  internas: number
  /** % del total de OT del período. */
  pctN: number
  /** % acumulado de OT (Pareto, ordenado por n desc). */
  pctAcumN: number
  pctCosto: number
  pctAcumCosto: number
  ots: OtCorrectiva[]
}

export interface CeldaMatriz {
  dominio: string
  sistema: MantenimientoSistema
  n: number
  costo: number
  diasParado: number
}

export interface AnalisisCorrectivos {
  desde: string
  hasta: string
  ots: OtCorrectiva[]
  totales: {
    n: number
    unidades: number
    costo: number
    diasParado: number
    auxilios: number
    roturas: number
    internas: number
    externas: number
    horasTallerPromedio: number | null
  }
  porSistema: FilaEstrato[]
  porUnidad: FilaEstrato[]
  porMes: FilaEstrato[]
  porTaller: FilaEstrato[]
  matriz: CeldaMatriz[]
  dominios: string[]
  sistemas: MantenimientoSistema[]
}

const DIA = 86_400_000

function restarMeses(fechaISO: string, meses: number): string {
  const d = new Date(fechaISO + "T12:00:00Z")
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 10)
}

function diasEntre(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0
  return Math.max(
    0,
    Math.round((Date.parse(b.slice(0, 10) + "T12:00:00Z") - Date.parse(a.slice(0, 10) + "T12:00:00Z")) / DIA)
  )
}

/** Taller «Depósito», vacío o la OT nació del checklist: trabajo hecho en casa. */
export function esOtInterna(m: Pick<MantenimientoRealizado, "taller" | "origen">): boolean {
  if (m.origen === ("checklist" as string)) return true
  const t = (m.taller ?? "").trim().toLowerCase()
  return t === "" || t.startsWith("dep") || t === "casa" || t === "interno"
}

export function aOtCorrectiva(m: MantenimientoRealizado, hoy?: string): OtCorrectiva {
  const { sistema, sugerido } = sistemaDeOt(m)
  const tareas = (m.tareas ?? []).reduce((a, t) => a + Number(t.costo || 0), 0)
  const repuestos = (m.repuestos ?? []).reduce(
    (a, r) => a + Number(r.cantidad || 1) * Number(r.costo_unitario || 0),
    0
  )
  const costo = Math.max(Number(m.costo || 0), tareas + Number(m.costo_mano_obra || 0) + repuestos)
  const diasParado = diasEntre(m.fuera_servicio_desde, m.fuera_servicio_hasta)
  const horasTaller =
    m.entrada_taller && m.salida_taller
      ? Math.max(0, (Date.parse(m.salida_taller) - Date.parse(m.entrada_taller)) / 3_600_000)
      : null
  const interna = esOtInterna(m)
  return {
    id: m.id,
    numeroOt: m.numero_ot ?? null,
    fecha: m.fecha.slice(0, 10),
    ym: m.fecha.slice(0, 7),
    dominio: m.dominio,
    taller: interna ? "Depósito (interno)" : (m.taller ?? "").trim() || "(sin taller)",
    interna,
    sistema,
    sistemaSugerido: sugerido,
    descripcion: descripcionDeOt(m),
    costo,
    diasParado,
    auxilio: !!m.auxilio_ruta,
    // Misma definición que la pirámide DPO 4.2 y el KPI roturas_flota.
    rotura: esRotura(m, hoy ?? new Date().toISOString().slice(0, 10)),
    horasTaller,
  }
}

function estratificar(ots: OtCorrectiva[], clave: (o: OtCorrectiva) => string, label: (k: string) => string, ordenar: "n" | "clave" = "n"): FilaEstrato[] {
  const grupos = new Map<string, OtCorrectiva[]>()
  for (const o of ots) {
    const k = clave(o)
    const arr = grupos.get(k) ?? []
    arr.push(o)
    grupos.set(k, arr)
  }
  const totalN = ots.length || 1
  const totalCosto = ots.reduce((a, o) => a + o.costo, 0) || 1
  const filas: FilaEstrato[] = [...grupos.entries()].map(([k, arr]) => ({
    clave: k,
    label: label(k),
    n: arr.length,
    unidades: new Set(arr.map((o) => o.dominio)).size,
    costo: arr.reduce((a, o) => a + o.costo, 0),
    diasParado: arr.reduce((a, o) => a + o.diasParado, 0),
    auxilios: arr.filter((o) => o.auxilio).length,
    roturas: arr.filter((o) => o.rotura).length,
    internas: arr.filter((o) => o.interna).length,
    pctN: (arr.length / totalN) * 100,
    pctAcumN: 0,
    pctCosto: (arr.reduce((a, o) => a + o.costo, 0) / totalCosto) * 100,
    pctAcumCosto: 0,
    ots: arr.sort((a, b) => b.fecha.localeCompare(a.fecha)),
  }))
  if (ordenar === "n") filas.sort((a, b) => b.n - a.n || b.costo - a.costo)
  else filas.sort((a, b) => a.clave.localeCompare(b.clave))
  // Pareto por OT y por costo (el acumulado por costo se calcula sobre el orden por costo).
  let acum = 0
  for (const f of filas) {
    acum += f.pctN
    f.pctAcumN = acum
  }
  const porCosto = [...filas].sort((a, b) => b.costo - a.costo)
  let acumC = 0
  for (const f of porCosto) {
    acumC += f.pctCosto
    f.pctAcumCosto = acumC
  }
  return filas
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
export function labelMes(ym: string): string {
  const [y, m] = ym.split("-")
  return `${MESES[Number(m) - 1] ?? m} ${y.slice(2)}`
}

export function analizarCorrectivos(params: {
  mantenimientos: MantenimientoRealizado[]
  hoy: string
  meses?: number
}): AnalisisCorrectivos {
  const meses = params.meses ?? 12
  const desde = restarMeses(params.hoy, meses)
  const ots = params.mantenimientos
    .filter((m) => m.tipo === "correctivo" && m.estado !== "cancelado")
    .map((m) => aOtCorrectiva(m, params.hoy))
    .filter((o) => o.fecha >= desde && o.fecha <= params.hoy)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const conHoras = ots.filter((o) => o.horasTaller != null)
  const totales = {
    n: ots.length,
    unidades: new Set(ots.map((o) => o.dominio)).size,
    costo: ots.reduce((a, o) => a + o.costo, 0),
    diasParado: ots.reduce((a, o) => a + o.diasParado, 0),
    auxilios: ots.filter((o) => o.auxilio).length,
    roturas: ots.filter((o) => o.rotura).length,
    internas: ots.filter((o) => o.interna).length,
    externas: ots.filter((o) => !o.interna).length,
    horasTallerPromedio:
      conHoras.length > 0 ? conHoras.reduce((a, o) => a + (o.horasTaller ?? 0), 0) / conHoras.length : null,
  }

  const matrizMap = new Map<string, CeldaMatriz>()
  for (const o of ots) {
    const k = `${o.dominio}|${o.sistema}`
    const c = matrizMap.get(k) ?? { dominio: o.dominio, sistema: o.sistema, n: 0, costo: 0, diasParado: 0 }
    c.n++
    c.costo += o.costo
    c.diasParado += o.diasParado
    matrizMap.set(k, c)
  }
  const dominios = [...new Set(ots.map((o) => o.dominio))].sort(
    (a, b) => ots.filter((o) => o.dominio === b).length - ots.filter((o) => o.dominio === a).length
  )
  const sistemas = [...new Set(ots.map((o) => o.sistema))].sort(
    (a, b) => ots.filter((o) => o.sistema === b).length - ots.filter((o) => o.sistema === a).length
  )

  return {
    desde,
    hasta: params.hoy,
    ots,
    totales,
    porSistema: estratificar(ots, (o) => o.sistema, (k) => labelSistema(k as MantenimientoSistema)),
    porUnidad: estratificar(ots, (o) => o.dominio, (k) => k),
    porMes: estratificar(ots, (o) => o.ym, labelMes, "clave"),
    porTaller: estratificar(ots, (o) => o.taller, (k) => k),
    matriz: [...matrizMap.values()],
    dominios,
    sistemas,
  }
}
