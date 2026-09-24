"use server"

/**
 * Dimensionamiento de Distribución/Flota (DPO Planeamiento 3.1) — SOLO Pampeana.
 * Trabaja en CAJAS EQUIVALENTES (CEq): la capacidad de la flota se carga en CEq
 * y el volumen a distribuir (ruteo_cierres, en bultos) se convierte a CEq con un
 * factor promedio editable (dim_config.factor_ceq_bulto). Demanda vs capacidad
 * instalada → camiones necesarios, ocupación y KPIs (dropsize, % no ruteado).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
import { requireAuth, requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  hlRetornablePorDia,
  diasHabilesDelMes,
  sabadosDelMes,
  HL_POR_PALETA_RETORNABLE,
} from "@/lib/dimensionamiento/retornable"

const DEPOSITO_API_BASE = "https://deposito-regionpampeana.vercel.app"

/** Promedio y pico (sobre valores > 0) de un Map fecha→valor. */
function statsPorDia(m: Map<string, number>): { prom: number; pico: number; dias: number } {
  const vals = [...m.values()].filter((v) => v > 0)
  if (!vals.length) return { prom: 0, pico: 0, dias: 0 }
  return { prom: vals.reduce((s, x) => s + x, 0) / vals.length, pico: Math.max(...vals), dias: vals.length }
}

/** Sub-map de un Map fecha→valor con las fechas del mes "YYYY-MM". */
function soloMes(m: Map<string, number>, mes: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [k, v] of m) if (k.startsWith(mes)) out.set(k, v)
  return out
}

/** Trae todas las filas paginando de a 1000 (PostgREST corta en 1000 por pedido). */
async function todas<T>(mk: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await mk(off, off + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** Lee las filas de un blob de deposito-esteban (shared/load). [] si falla. */
async function fetchDepositoFilas(module: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${DEPOSITO_API_BASE}/api/shared/load?module=${module}`, { cache: "no-store" })
    if (!res.ok) return []
    const j = (await res.json()) as { data?: { filas?: Record<string, unknown>[] } }
    return j.data?.filas ?? []
  } catch {
    return []
  }
}

// Endpoints propios de deposito-esteban (no son blobs shared): reempaque diario/productividad.
async function fetchDepositoJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${DEPOSITO_API_BASE}${path}`, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

// "HH:MM:SS" → horas decimales.
function horasEntre(inicio?: string | null, fin?: string | null): number {
  const toH = (t?: string | null) => {
    if (!t) return NaN
    const [h, m, s] = String(t).split(":").map(Number)
    return (h || 0) + (m || 0) / 60 + (s || 0) / 3600
  }
  const a = toH(inicio), b = toH(fin)
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? b - a : 0
}

type Result<T> = { data: T } | { error: string }

const ROLES_EDICION: ("admin" | "admin_rrhh" | "supervisor")[] = ["admin", "admin_rrhh", "supervisor"]
const SOLO_PAMPEANA = "El dimensionamiento solo está disponible en Región Pampeana."
const CHESS_DASHBOARD_BASE = "https://chess-dashboard-mercosurdrps-projects.vercel.app"

export interface FactorCeqResult {
  factor: number
  periodo: { desde: string; hasta: string }
  sumCeq: number
  sumBultos: number
  skusConPallet: number
  bultosEnvaseExcluidos: number
}

async function fetchFactorCeq(): Promise<FactorCeqResult | null> {
  const key = process.env.PLANIFICADOR_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${CHESS_DASHBOARD_BASE}/api/factor-ceq?empresa=pampeana`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as FactorCeqResult
  } catch {
    return null
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface DimConfig {
  peso_kg_bulto: number
  dias_operativos_mes: number
  viajes_por_dia: number
  factor_ceq_bulto: number
  prod_bul_hh: number
  horas_turno: number
  dotacion_almacen: number
  prod_pal_h: number
  dotacion_maquinistas: number
  factor_retorno_distrib: number
  util_pickeros: number      // % del turno dedicado a picking puro (0–1)
  util_maquinistas: number   // % del turno dedicado a mover pallets (0–1)
  choferes_por_camion: number   // tripulación de choferes por camión (≈1)
  ayudantes_por_camion: number  // tripulación de ayudantes por camión
  dotacion_choferes: number     // plantel de choferes (0 = usar promedio real de registros_vehiculos)
  dotacion_ayudantes: number    // plantel de ayudantes (0 = usar promedio real)
  peso_lun: number              // ponderación de volumen por día de semana (suman ~1)
  peso_mar: number
  peso_mie: number
  peso_jue: number
  peso_vie: number
  peso_sab: number
  prod_clasif_pal_h: number     // productividad clasificación de envases (paletas/HH)
  util_clasif: number           // % del turno aplicado a clasificar (0–1)
  dotacion_clasif: number       // clasificadores actuales
  prod_reempaque_bul_hh: number // productividad reempaque (bultos/HH)
  util_reempaque: number        // % del turno aplicado a reempaque (0–1)
  dotacion_reempaque: number    // tareas generales / reempaque actuales
  ausentismo_almacen: number    // fracción 0–1 no disponible en promedio (vacaciones/licencias/faltas)
  ausentismo_reparto: number    // ídem reparto; 0 = la dotación observada ya lo trae implícito
  horas_vuelta_extra: number    // horas extra por persona en un día de refuerzo de flota (días → hora-hombre)
  horas_fijas_generales: number // horas/día de tareas generales que no dependen del volumen (limpieza, prensa, orden)
  umbral_ocupacion_ociosa: number // ocupación (0–1) por debajo de la cual se marca "capacidad ociosa" (SOP: 0,70)
  pct_distribuido: number       // fracción del presupuesto de venta que se pickea y sale con flota propia (0,80)
  // Sábados del ALMACÉN: turno normal hasta sabado_fin_normal (11 h); la operación termina a
  // sabado_fin_alta (14) en temporada alta y sabado_fin_baja (12) en baja → horas extra al 100 %
  // por persona = fin − 11, para toda la dotación efectiva, cada sábado del mes.
  sabado_fin_normal: number
  sabado_fin_alta: number
  sabado_fin_baja: number
  meses_temporada_alta: string  // "1,2,3,11,12"
}

/** Horas extra por persona de un sábado del mes (0 si el fin no supera el turno normal). */
function horasSabadoDe(config: Pick<DimConfig, "sabado_fin_normal" | "sabado_fin_alta" | "sabado_fin_baja" | "meses_temporada_alta">, mes: number): number {
  const alta = new Set(String(config.meses_temporada_alta ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 12))
  const fin = alta.has(mes) ? config.sabado_fin_alta : config.sabado_fin_baja
  return Math.max(0, Math.round((fin - config.sabado_fin_normal) * 10) / 10)
}

// Volumen del año, mes a mes, en HL: año anterior (AA), presupuesto, forecast
// (= presupuesto × escenario) y real. Es la fila "presupuesto vs real" que
// pide R2.3.1 y el comentario del auditor H1 2026 ("comparar con volumen real").
// AA y real salen de pc_volumen_diario (HL distribuidos con flota propia,
// Chess + GESCOM, la misma base de Períodos Críticos).
export interface EscenarioVolumenMes {
  mes: number
  aa: number | null           // HL DISTRIBUIDOS del mismo mes del año anterior (pc_volumen_diario)
  presupuesto: number | null  // HL del presupuesto anual ("Total en HL" del EERR: venta facturada)
  forecast: number | null     // presupuesto × (1 + ajuste_pct/100); null si no hay presupuesto
  aDistribuir: number | null  // presupuesto × pct_distribuido: lo que el depósito y la flota tienen que mover
  forecastDistribuir: number | null // forecast × pct_distribuido: el volumen sobre el que se dimensiona
  pctReal: number | null      // distribuido real ÷ vendido real del mes (para calibrar pct_distribuido)
  vendido: number | null      // HL VENDIDOS del mes = facturado Chess neto (chess + mostrador − NC), la misma
                              // definición que el VLC/HL del Sueño y el Presupuesto → comparable con el presupuesto
  real: number | null         // HL DISTRIBUIDOS con flota propia (Chess + GESCOM sin patentes, base de Períodos
                              // Críticos) → lo que mueve la flota y el depósito; comparable con el año anterior
  diasReal: number            // días con dato en el mes
  parcial: boolean            // mes en curso (real incompleto)
}

// Costo de la hora-hombre EXTRA por sector (EERR PxQ; recargo 50/100% ya incluido).
export interface CostoHhMes {
  mes: number
  almacen: number       // $/hora extra almacén
  entrega: number       // $/hora extra entrega
  hhPptoAlmacen: number // horas extra PRESUPUESTADAS del mes (EERR), almacén
  hhPptoEntrega: number // ídem entrega
}

// Costo/HL de referencia: lo que hoy cuesta la logística por HL (VLC/HL del Árbol del Sueño).
export interface VlcReferencia {
  mesBase: string | null   // último mes con costo cargado
  valorMes: number | null  // $/HL de ese mes
  hlMes: number | null     // HL vendidos de ese mes
  ytd: number | null       // $/HL acumulado del año
  meta: number | null      // meta del KPI
}

export interface RolFte {
  volumenProm: number          // bultos/día (pickeros) o pallets/día (maquinistas)
  volumenPico: number
  productividad: number         // bul/HH (pickeros) o pal/HH (maquinistas)
  diasConDatos: number
  fteNecesariosProm: number     // con 1 decimal: comparable con la dotación efectiva
  fteNecesariosPico: number
  dotacion: number
  dotacionEfectiva: number      // dotación × (1 − ausentismo): contra esto se compara
  utilizacion: number           // % del turno aplicado a la tarea (0–1)
  capDiariaFte: number          // capacidad efectiva por persona/día = prod × horas × utilización
}

export interface AlmacenData {
  mes: string
  pickeros: RolFte
  clasificadores: RolFte & { prodRealPalHH: number | null } // envases retornables; demanda en HL/día del presupuesto de Quilmes
  reempaque: RolFte            // tareas generales
  maquinistas: RolFte & { palAcarreoProm: number; palCargaProm: number; factorRetorno: number }
}

export interface KpiObjetivo {
  kpi: string
  nombre: string
  unidad: string
  objetivo: number
  mejor_si: "mayor" | "menor"
}

export interface FlotaUnidad {
  dominio: string
  descripcion: string | null
  tipo: string | null
  capacidad_ceq: number
  capacidad_kg: number | null
  activo: boolean
}

export interface MetricasDistribucion {
  mes: string
  diasCerrados: number
  volumenCeqPromedio: number
  volumenCeqPico: number
  clientesPromedio: number
  dropsizeCeqPromedio: number
  pctNoRuteadoPromedio: number
  ocupacionPromedio: number
  camionesNecesariosPromedio: number
  camionesNecesariosPico: number
}

// FTE de reparto (flota/entrega): atado a camiones necesarios × tripulación.
// Dotación actual = FTE promedio real observado en registros_vehiculos (egresos).
export interface RolReparto {
  porCamion: number             // tripulación de este rol por camión
  fteNecesariosProm: number     // camiones necesarios (prom) × porCamion
  fteNecesariosPico: number
  dotacionProm: number          // dotación EFECTIVA (cargada manual si >0; si no, promedio real dpo-app)
  dotacionPico: number
  dotacionObservada: number     // promedio real observado (registros_vehiculos), siempre, como referencia
}
export interface RepartoData {
  mes: string
  diasConDatos: number
  camionesNecesariosProm: number
  camionesNecesariosPico: number
  choferes: RolReparto
  ayudantes: RolReparto
}

// Proyección de dotación vs volumen futuro (HL/mes del presupuesto). Necesarios escalados
// por el índice hl_mes / hl_mes_actual; dotación fija → anticipa horas extra / refuerzo.
export interface ProyeccionMes {
  mes: string             // "2026-07"
  hl: number              // HL del escenario = presupuesto × (1 + ajuste_pct/100)
  hlPresupuesto: number   // HL original del presupuesto anual
  ajustePct: number       // % de ajuste de escenario cargado para el mes (0 = sin ajuste)
  diasHabiles: number     // lun-sáb sin feriados: el HL/mes se lleva a HL/día con esto
  hlDistribuir: number    // hl × pct_distribuido: el volumen que se dimensiona
  indice: number          // (hl ÷ díasHábiles) ÷ (hlBase ÷ díasHábilesBase): volumen POR DÍA relativo al mes base
}
// Almacén: dotación fija → horas extra (hora-hombre) por mes en los días que el volumen supera la capacidad.
export interface ProyeccionAlmacenRol {
  rol: string
  dotacion: number
  dotacionEfectiva: number // dotación × (1 − ausentismo)
  capDiaria: number        // volumen/día que cubre la dotación EFECTIVA en jornada normal
  capPersona: number       // capacidad de 1 persona/día (para "falta N" sin depender del client)
  unidadVol: string        // "bultos" | "paletas" | "pallets"
  horasExtra: number[]     // hora-hombre extra por mes (mismo orden que meses)
  faltanPico: number[]     // personas que faltarían en el día pico de cada mes (0 = cubre)
  volPicoDia: number[]     // volumen del día más cargado del mes
  volPromBase: number      // volumen promedio diario base (mes actual); el modal reconstruye por día
  volFijo: number          // parte de la demanda diaria que NO escala con el volumen (horas fijas de tareas generales); 0 en el resto
  prodH: number            // productividad horaria del rol (para derivar horas extra en el modal)
  // Lectura mensual estilo Casa Central: necesarios en el día promedio del mes,
  // llevados a nómina (÷ (1 − ausentismo)), contra la dotación nominal.
  necesariosProm: number[] // por mes: FTE necesarios con ausentismo (1 decimal)
  sobran: number[]         // por mes: dotación − necesarios, si > 0 ("jornales sobrantes")
  temporales: number[]     // por mes: necesarios − dotación, si > 0 ("temporales requeridos")
  horasSabado: number[]    // por mes: horas extra estructurales de sábado (dotación efectiva × (fin − 11) × sábados); YA incluidas en horasExtra
}
// Regla de sábado del almacén, para mostrarla y recalcularla en el cliente.
export interface SabadosAlmacen {
  finNormal: number
  finAlta: number
  finBaja: number
  mesesAlta: string
  sabadosMes: number[]      // por mes de la proyección: sábados operativos
  horasPersonaMes: number[] // por mes: horas extra por persona y sábado (fin − normal)
}
// Flota: por recurso (camiones/choferes/ayudantes), dotación fija → días/mes que requieren refuerzo.
export interface ProyeccionFlotaRol {
  rol: string                    // "Camiones" | "Choferes" | "Ayudantes"
  dotacion: number
  tripulacion: number            // unidades del recurso por camión (camiones = 1)
  diasRefuerzo: number[]         // por mes: días con necesarios > dotación
  picoNecesario: number[]        // por mes: necesarios el día más cargado
  segundaVueltaMeses: boolean[]  // por mes: algún día supera los camiones disponibles (2ª vuelta obligada)
  necesariosProm: number[]       // por mes: necesarios en el día promedio (camiones por zonas × tripulación)
  sobran: number[]               // por mes: dotación − necesarios en el día promedio, si > 0
}
export interface ProyeccionData {
  mesBase: string
  hlBase: number                 // HL del escenario para el mes base = presupuesto × (1 + ajuste/100)
  hlBasePresupuesto: number      // HL original del presupuesto para el mes base
  ajusteBasePct: number          // % de ajuste de escenario del mes base (recalibra el índice de todos los meses)
  meses: ProyeccionMes[]
  almacen: ProyeccionAlmacenRol[]
  flota: ProyeccionFlotaRol[]
  flotaCeqPromBase: number       // CEq/día promedio (mes base) para el modal de flota
  capCamionViaje: number         // capacidad de un camión por día = capCeq × viajes
  choferesDisp: number
  camionesDisp: number
  capCamion: number
  pesos: number[]                // [lun..sab]
  costoHh: CostoHhMes[]          // $/hora extra por mes y sector (mismo orden que meses)
  vlc: VlcReferencia             // costo logístico por HL de referencia (Árbol del Sueño)
  ocupacionMes: number[]         // por mes: CEq promedio diario ÷ capacidad instalada diaria (0–1)
  capacidadInstalada: number     // CEq/día de toda la flota activa × viajes
  umbralOciosa: number           // ocupación mínima antes de marcar capacidad ociosa (0–1)
  // Anclaje al presupuesto a distribuir: la proyección no escala el volumen real de hoy,
  // escala el volumen que el PRESUPUESTO (× pct_distribuido) dice que hay que mover.
  // anclaje = (presupuesto a distribuir por día hábil del mes base) ÷ (distribuido real por día del mes base);
  // se multiplica sobre el volumen base de flota y de almacén (no de clasificadores, que ya van por presupuesto).
  pctDistribuido: number
  diasHabilesBase: number
  realDistDiaBase: number        // HL distribuidos por día, real del mes base (pc_volumen_diario)
  pptoDistDiaBase: number        // hlBase × pct ÷ días hábiles del mes base
  anclaje: number                // 1 si no hay real del mes base
  sabados: SabadosAlmacen
}

export interface DimPlan {
  id: string
  que: string
  por_que: string | null
  quien: string | null
  donde: string | null
  cuando: string | null
  como: string | null
  cuanto: string | null
  estado: "pendiente" | "en_curso" | "completado"
  created_at: string
}

export interface ZonaReparto {
  id: string
  zona: string
  peso: number              // fracción del volumen diario (0–1)
  camiones_minimos: number  // piso de cobertura por distancia
  orden: number
  absorbe_crecimiento: boolean // el volumen por encima del base cae solo en estas zonas
}

// camiones necesarios para un volumen CEq, por zona: máx(mínimo de cobertura, volumen×peso ÷ capacidad).
/**
 * Volumen que le toca a cada zona. El volumen BASE (el del mes en curso) se
 * reparte por peso; todo lo que exceda ese base —crecimiento del mes o día
 * pico— cae solo en las zonas marcadas `absorbe_crecimiento`, repartido por su
 * peso relativo. Es cómo opera realmente el reparto: las zonas chicas se cubren
 * con su camión de siempre y el camión extra sale a San Nicolás o a Ramallo.
 *
 * Si no hay ninguna zona marcada, se cae al reparto por peso puro (comportamiento
 * anterior), para no romper si alguien destilda todas.
 */
function volumenPorZona(volCeq: number, volBase: number, zonas: ZonaReparto[]): Map<string, number> {
  const out = new Map<string, number>()
  const absorben = zonas.filter((z) => z.absorbe_crecimiento)
  const pesoAbsorbente = absorben.reduce((s, z) => s + z.peso, 0)
  const base = Math.min(volCeq, volBase)
  const excedente = Math.max(0, volCeq - base)
  for (const z of zonas) {
    let v = base * z.peso
    if (excedente > 0) {
      if (absorben.length === 0 || pesoAbsorbente <= 0) v += excedente * z.peso
      else if (z.absorbe_crecimiento) v += excedente * (z.peso / pesoAbsorbente)
    }
    out.set(z.zona, v)
  }
  return out
}

function camionesPorZonas(volCeq: number, zonas: ZonaReparto[], capCamionViaje: number, volBase: number): number {
  if (capCamionViaje <= 0 || zonas.length === 0) return 0
  const vol = volumenPorZona(volCeq, volBase, zonas)
  return zonas.reduce((s, z) => s + Math.max(z.camiones_minimos, Math.ceil((vol.get(z.zona) ?? 0) / capCamionViaje)), 0)
}

// ─── Cuadro anual: meses cerrados con volumen REAL (misma estructura que hoy) ──
export interface HistoricoRol {
  volumenProm: number       // demanda promedio/día real del mes (bultos, HL, horas o pallets)
  volumenPico: number
  dias: number
  necesariosProm: number    // FTE necesarios en el día promedio, con ausentismo (÷ (1 − aus))
  necesariosPico: number
  sobran: number            // dotación − necesarios, si > 0
  temporales: number        // necesarios − dotación, si > 0
  horasExtra: number        // hora-hombre que el modelo hubiera pedido (Σ lun-vie con demanda > capacidad + regla de sábado)
  horasSabado: number       // de las cuales, regla de sábado (dotación efectiva × (fin − 11) × sábados del mes)
}
export interface HistoricoMes {
  mes: string               // "2026-03"
  flota: MetricasDistribucion | null          // métricas reales de los cierres de ruteo del mes
  repartoObs: { choferes: number; ayudantes: number } | null // dotación observada (personas distintas/día)
  diasRefuerzoFlota: number // días del mes con camiones necesarios > disponibles
  almacen: {
    pickeros: HistoricoRol | null
    clasificadores: HistoricoRol | null
    reempaque: HistoricoRol | null
    maquinistas: HistoricoRol | null
  }
}
// Horas extra de ALMACÉN por mes: reales (depósito), dimensionadas (modelo) y presupuestadas
// (EERR, dim_costo_hh). Es la fila "real vs dimensionado vs presupuesto". Flota / Entrega se
// dimensiona sólo en camiones y gente: sus horas extra quedan fuera (decisión del 24/09/2026).
export interface HorasExtraMes {
  mes: number
  realAlmacen: number | null     // Σ horas extra de almacén (deposito-esteban, indicador DPO #39)
  dimAlmacen: number | null      // modelo: histórico (meses cerrados) o proyección (mes en curso y futuros)
  dimSabadoAlmacen: number | null // de las cuales, regla de sábado del almacén
  pptoAlmacen: number | null     // dim_costo_hh.hh_ppto_almacen
}

export interface DimData {
  config: DimConfig
  objetivos: KpiObjetivo[]
  flota: FlotaUnidad[]
  zonas: ZonaReparto[]
  capacidadInstaladaDiaria: number // CEq: Σ capacidad_ceq (unidades activas, todas operativas) × viajes_por_dia
  unidadesDisponibles: number   // unidades activas; NO descuenta taller (capacidad instalada)
  metricas: MetricasDistribucion | null
  metricasError: string | null
  almacen: AlmacenData | null
  almacenError: string | null
  reparto: RepartoData | null
  repartoError: string | null
  proyeccion: ProyeccionData | null
  proyeccionError: string | null
  escenarios: EscenarioVolumenMes[]   // 12 meses del año en curso: AA / presupuesto / forecast / real
  historico: HistoricoMes[]           // meses cerrados del año con datos reales
  horasExtra: HorasExtraMes[]         // 12 meses: reales / dimensionadas / presupuestadas por sector
  retornable: RetornablePresupuesto   // retornables a clasificar, del presupuesto (viajes × paletas)
  planes: DimPlan[]
}

// Retornables a clasificar según el presupuesto de acarreo: viajes de cerveza retornable por mes
// × paletas por viaje. Paletas a clasificar por día = viajes × paletas ÷ días hábiles.
export interface RetornablePresupuesto {
  anio: number
  fuente: "presupuesto" | "codigo"   // tabla dim_retornable_presupuesto, o constantes 2026 de retornable.ts
  paletasPorViaje: number
  hlPorPaleta: number
  meses: { mes: number; viajes: number; hl: number; diasHabiles: number; paletasDia: number }[]
}

// ─── Carga principal ────────────────────────────────────────────────────────

export async function getDatosDimensionamiento(): Promise<Result<DimData>> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()

    const [configRes, objetivosRes, capacidadRes, vehiculosRes, planesRes, zonasRes] =
      await Promise.all([
        supabase.from("dim_config").select("peso_kg_bulto, dias_operativos_mes, viajes_por_dia, factor_ceq_bulto, prod_bul_hh, horas_turno, dotacion_almacen, prod_pal_h, dotacion_maquinistas, factor_retorno_distrib, util_pickeros, util_maquinistas, choferes_por_camion, ayudantes_por_camion, dotacion_choferes, dotacion_ayudantes, peso_lun, peso_mar, peso_mie, peso_jue, peso_vie, peso_sab, prod_clasif_pal_h, util_clasif, dotacion_clasif, prod_reempaque_bul_hh, util_reempaque, dotacion_reempaque, ausentismo_almacen, ausentismo_reparto").eq("id", 1).maybeSingle(),
        supabase.from("dim_kpi_objetivos").select("kpi, nombre, unidad, objetivo, mejor_si").order("kpi"),
        supabase.from("dim_flota_capacidad").select("dominio, capacidad_ceq, capacidad_kg, activo"),
        supabase.from("catalogo_vehiculos").select("dominio, descripcion, tipo, active").eq("sector", "distribucion").eq("active", true),
        supabase.from("dim_planes").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("dim_zonas_reparto").select("id, zona, peso, camiones_minimos, orden, absorbe_crecimiento").order("orden"),
      ])

    const zonas: ZonaReparto[] = (zonasRes.data ?? []).map((z) => ({
      id: z.id as string, zona: z.zona as string,
      peso: Number(z.peso ?? 0), camiones_minimos: Number(z.camiones_minimos ?? 1), orden: Number(z.orden ?? 0),
      absorbe_crecimiento: Boolean((z as { absorbe_crecimiento?: boolean }).absorbe_crecimiento),
    }))

    const config: DimConfig = {
      peso_kg_bulto: Number(configRes.data?.peso_kg_bulto ?? 0),
      dias_operativos_mes: Number(configRes.data?.dias_operativos_mes ?? 26),
      viajes_por_dia: Number(configRes.data?.viajes_por_dia ?? 1) || 1,
      factor_ceq_bulto: Number(configRes.data?.factor_ceq_bulto ?? 1) || 1,
      prod_bul_hh: Number(configRes.data?.prod_bul_hh ?? 300) || 300,
      horas_turno: Number(configRes.data?.horas_turno ?? 8) || 8,
      dotacion_almacen: Number(configRes.data?.dotacion_almacen ?? 0),
      prod_pal_h: Number(configRes.data?.prod_pal_h ?? 15) || 15,
      dotacion_maquinistas: Number(configRes.data?.dotacion_maquinistas ?? 3),
      factor_retorno_distrib: Number(configRes.data?.factor_retorno_distrib ?? 0),
      util_pickeros: Number(configRes.data?.util_pickeros ?? 0.35) || 0.35,
      util_maquinistas: Number(configRes.data?.util_maquinistas ?? 0.875) || 0.875,
      choferes_por_camion: Number(configRes.data?.choferes_por_camion ?? 1) || 1,
      ayudantes_por_camion: Number(configRes.data?.ayudantes_por_camion ?? 1) || 1,
      dotacion_choferes: Number(configRes.data?.dotacion_choferes ?? 0),
      dotacion_ayudantes: Number(configRes.data?.dotacion_ayudantes ?? 0),
      peso_lun: Number(configRes.data?.peso_lun ?? 0.1),
      peso_mar: Number(configRes.data?.peso_mar ?? 0.1),
      peso_mie: Number(configRes.data?.peso_mie ?? 0.15),
      peso_jue: Number(configRes.data?.peso_jue ?? 0.25),
      peso_vie: Number(configRes.data?.peso_vie ?? 0.25),
      peso_sab: Number(configRes.data?.peso_sab ?? 0.15),
      prod_clasif_pal_h: Number(configRes.data?.prod_clasif_pal_h ?? 5) || 5,
      util_clasif: Number(configRes.data?.util_clasif ?? 0.875) || 0.875,
      dotacion_clasif: Number(configRes.data?.dotacion_clasif ?? 1),
      prod_reempaque_bul_hh: Number(configRes.data?.prod_reempaque_bul_hh ?? 37) || 37,
      util_reempaque: Number(configRes.data?.util_reempaque ?? 0.875) || 0.875,
      dotacion_reempaque: Number(configRes.data?.dotacion_reempaque ?? 1),
      ausentismo_almacen: Math.min(0.9, Math.max(0, Number(configRes.data?.ausentismo_almacen ?? 0.08))),
      ausentismo_reparto: Math.min(0.9, Math.max(0, Number(configRes.data?.ausentismo_reparto ?? 0))),
      // columnas nuevas: se leen aparte para no romper el select si la migración aún no corrió
      horas_vuelta_extra: 4,
      horas_fijas_generales: 2,
      umbral_ocupacion_ociosa: 0.7,
      pct_distribuido: 0.8,
      sabado_fin_normal: 11,
      sabado_fin_alta: 14,
      sabado_fin_baja: 12,
      meses_temporada_alta: "1,2,3,11,12",
    }
    {
      const { data: hve } = await supabase.from("dim_config").select("horas_vuelta_extra").eq("id", 1).maybeSingle()
      const v = Number(hve?.horas_vuelta_extra)
      if (Number.isFinite(v) && v > 0) config.horas_vuelta_extra = v
    }
    {
      // migración 20260922120000: si no corrió, quedan los defaults
      const { data: ext } = await supabase.from("dim_config").select("horas_fijas_generales, umbral_ocupacion_ociosa").eq("id", 1).maybeSingle()
      const hf = Number(ext?.horas_fijas_generales)
      if (Number.isFinite(hf) && hf >= 0) config.horas_fijas_generales = hf
      const uo = Number(ext?.umbral_ocupacion_ociosa)
      if (Number.isFinite(uo) && uo > 0 && uo < 1) config.umbral_ocupacion_ociosa = uo
    }
    {
      // migración 20260923120000: fracción del presupuesto que se distribuye
      const { data: ext } = await supabase.from("dim_config").select("pct_distribuido").eq("id", 1).maybeSingle()
      const pd = Number(ext?.pct_distribuido)
      if (Number.isFinite(pd) && pd > 0 && pd <= 1.5) config.pct_distribuido = pd
    }
    {
      // migración 20260924120000: regla de sábado del almacén
      const { data: ext } = await supabase.from("dim_config").select("sabado_fin_normal, sabado_fin_alta, sabado_fin_baja, meses_temporada_alta").eq("id", 1).maybeSingle()
      const h = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 24 ? n : null }
      const fn = h(ext?.sabado_fin_normal), fa = h(ext?.sabado_fin_alta), fb = h(ext?.sabado_fin_baja)
      if (fn != null) config.sabado_fin_normal = fn
      if (fa != null) config.sabado_fin_alta = fa
      if (fb != null) config.sabado_fin_baja = fb
      if (typeof ext?.meses_temporada_alta === "string" && ext.meses_temporada_alta.trim()) config.meses_temporada_alta = ext.meses_temporada_alta
    }
    const hSabado = (mes: number) => horasSabadoDe(config, mes)

    const anioHoyR = new Date().getFullYear(), mesHoyR = new Date().getMonth() + 1
    // Retornables a clasificar: viajes de acarreo de cerveza retornable presupuestados por mes
    // (hoja ACARREO PXQ del presupuesto anual) × paletas por viaje (26) × 6 HL/paleta. Si el año
    // no está cargado en la tabla, cae a los HL fijos de retornable.ts (sólo 2026).
    const retMeses = new Map<string, { viajes: number; pal: number; hlPal: number }>()
    {
      const { data: rp } = await supabase.from("dim_retornable_presupuesto").select("anio, mes, viajes, paletas_por_viaje, hl_por_paleta").in("anio", [anioHoyR, anioHoyR + 1])
      for (const r of rp ?? []) retMeses.set(`${r.anio}-${r.mes}`, { viajes: Number(r.viajes ?? 0), pal: Number(r.paletas_por_viaje ?? 26) || 26, hlPal: Number(r.hl_por_paleta ?? 6) || 6 })
    }
    const retDe = (anio: number, mes: number) => retMeses.get(`${anio}-${mes}`)
    const hlPorPaleta = retDe(anioHoyR, mesHoyR)?.hlPal ?? HL_POR_PALETA_RETORNABLE
    /** HL de retornable a clasificar por día hábil del mes (tabla del presupuesto, o constantes 2026). */
    const hlRetDia = (mes: number, anio: number): number => {
      const r = retDe(anio, mes)
      if (!r) return hlRetornablePorDia(mes, anio)
      const dias = diasHabilesDelMes(anio, mes)
      return r.viajes > 0 && dias > 0 ? (r.viajes * r.pal * r.hlPal) / dias : 0
    }
    const retornable: RetornablePresupuesto = {
      anio: anioHoyR,
      fuente: retDe(anioHoyR, mesHoyR) ? "presupuesto" : "codigo",
      paletasPorViaje: retDe(anioHoyR, mesHoyR)?.pal ?? 26,
      hlPorPaleta,
      meses: Array.from({ length: 12 }, (_, i) => {
        const m = i + 1, r = retDe(anioHoyR, m), dias = diasHabilesDelMes(anioHoyR, m)
        const hl = r ? r.viajes * r.pal * r.hlPal : hlRetornablePorDia(m, anioHoyR) * dias
        return { mes: m, viajes: r ? r.viajes : Math.round(hl / (26 * HL_POR_PALETA_RETORNABLE)), hl: Math.round(hl), diasHabiles: dias, paletasDia: dias > 0 ? Math.round((hl / hlPorPaleta / dias) * 10) / 10 : 0 }
      }),
    }
    // Dotación efectiva de almacén: descuenta el ausentismo promedio (1 decimal).
    const efAlmacen = (dot: number) => Math.round(dot * (1 - config.ausentismo_almacen) * 10) / 10
    const objetivos = (objetivosRes.data ?? []) as KpiObjetivo[]

    const capMap = new Map(
      (capacidadRes.data ?? []).map((c) => [c.dominio as string, c]),
    )

    // El dimensionamiento mide CAPACIDAD INSTALADA, no disponibilidad del día: se
    // consideran operativas TODAS las unidades activas, sin descontar las que el
    // módulo de mantenimiento tenga en taller (pedido del usuario 2026-07-22).
    const flota: FlotaUnidad[] = (vehiculosRes.data ?? []).map((v) => {
      const cap = capMap.get(v.dominio as string)
      return {
        dominio: v.dominio as string,
        descripcion: (v.descripcion as string | null) ?? null,
        tipo: (v.tipo as string | null) ?? null,
        capacidad_ceq: Number(cap?.capacidad_ceq ?? 0),
        capacidad_kg: cap?.capacidad_kg != null ? Number(cap.capacidad_kg) : null,
        activo: cap ? Boolean(cap.activo) : true,
      }
    })

    const disponibles = flota.filter((u) => u.activo)
    const capacidadInstaladaDiaria =
      disponibles.reduce((s, u) => s + u.capacidad_ceq, 0) * config.viajes_por_dia

    // Métricas de distribución del mes en curso (ruteo_cierres cerrados).
    // Volumen en bultos → CEq con el factor promedio.
    let metricas: MetricasDistribucion | null = null
    let metricasError: string | null = null
    const f = config.factor_ceq_bulto
    const hoy = new Date()
    const mesAA = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`
    const desde = `${mesAA}-01`
    // Todo el año: el mes en curso alimenta el "hoy" y los meses cerrados el cuadro anual.
    const inicioAnio = `${hoy.getFullYear()}-01-01`
    const { data: cierresAnio, error: cierresErr } = await supabase
      .from("ruteo_cierres")
      .select("fecha, pergamino_bultos, pergamino_clientes, ramallo_bultos, ramallo_clientes, bultos_no_ruteados")
      .eq("estado", "cerrado")
      .gte("fecha", inicioAnio)
      .order("fecha", { ascending: false })
      .limit(1000)
    type Cierre = NonNullable<typeof cierresAnio>[number]
    const cierres = (cierresAnio ?? []).filter((c) => String(c.fecha) >= desde)
    // capUnidad = capacidad de un camión por día (capacidadInstaladaDiaria ya incluye viajes/día).
    const capUnidad = disponibles.length > 0 ? capacidadInstaladaDiaria / disponibles.length : 0
    // Métricas de un conjunto de cierres (un mes). El promedio del mes ES el volumen base:
    // en el día pico, el excedente cae en las zonas que absorben (San Nicolás / Ramallo).
    const metricasDe = (mes: string, cs: Cierre[]): MetricasDistribucion => {
      const filas = cs.map((c) => {
        const ceq = (Number(c.pergamino_bultos ?? 0) + Number(c.ramallo_bultos ?? 0)) * f
        const clientes = Number(c.pergamino_clientes ?? 0) + Number(c.ramallo_clientes ?? 0)
        const noRutCeq = Number(c.bultos_no_ruteados ?? 0) * f
        return {
          ceq,
          clientes,
          dropsize: clientes > 0 ? ceq / clientes : 0,
          pctNoRut: ceq + noRutCeq > 0 ? (noRutCeq / (ceq + noRutCeq)) * 100 : 0,
        }
      })
      const n = filas.length
      const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / n
      const volProm = avg(filas.map((x) => x.ceq))
      const volPico = Math.max(...filas.map((x) => x.ceq))
      // Camiones por COBERTURA DE ZONAS: máx(mínimo, volumen×peso ÷ capacidad) por zona; fallback a capacidad pura.
      const camionesNec = (vol: number) => zonas.length > 0
        ? camionesPorZonas(vol, zonas, capUnidad, volProm)
        : (capUnidad > 0 ? Math.ceil(vol / capUnidad) : 0)
      return {
        mes,
        diasCerrados: n,
        volumenCeqPromedio: Math.round(volProm),
        volumenCeqPico: Math.round(volPico),
        clientesPromedio: Math.round(avg(filas.map((x) => x.clientes))),
        dropsizeCeqPromedio: Math.round(avg(filas.map((x) => x.dropsize)) * 10) / 10,
        pctNoRuteadoPromedio: Math.round(avg(filas.map((x) => x.pctNoRut)) * 10) / 10,
        ocupacionPromedio:
          capacidadInstaladaDiaria > 0 ? Math.round((volProm / capacidadInstaladaDiaria) * 1000) / 10 : 0,
        camionesNecesariosPromedio: camionesNec(volProm),
        camionesNecesariosPico: camionesNec(volPico),
      }
    }
    if (cierresErr) metricasError = cierresErr.message
    else if (cierres.length > 0) metricas = metricasDe(mesAA, cierres)
    // Meses cerrados del año con cierres de ruteo → métricas reales por mes.
    const metricasPorMes = new Map<string, MetricasDistribucion>()
    for (const c of cierresAnio ?? []) {
      const k = String(c.fecha).slice(0, 7)
      if (k >= mesAA || metricasPorMes.has(k)) continue
      metricasPorMes.set(k, metricasDe(k, (cierresAnio ?? []).filter((x) => String(x.fecha).startsWith(k))))
    }

    // Almacén (FTE): pickeros (bultos procesados) + maquinistas (pallets a procesar).
    let almacen: AlmacenData | null = null
    let almacenError: string | null = null
    const almacenHist = new Map<string, HistoricoMes["almacen"]>()
    try {
      // Pickeros: bultos/día de ocupacion_bodega_diaria (todo el año; el "hoy" es el mes en curso)
      const ob = await todas<{ fecha: string; bultos_total: number | string | null }>((a, b) =>
        supabase.from("ocupacion_bodega_diaria").select("fecha, bultos_total").gte("fecha", inicioAnio).order("fecha").range(a, b))
      const bultosPorDiaAnio = new Map<string, number>()
      for (const r of ob) {
        const k = r.fecha as string
        bultosPorDiaAnio.set(k, (bultosPorDiaAnio.get(k) ?? 0) + Number(r.bultos_total ?? 0))
      }
      const bultosPorDia = soloMes(bultosPorDiaAnio, mesAA)
      const pk = statsPorDia(bultosPorDia)
      // Productividad de picking = valor YTD del Árbol del Sueño (Prod Picking, Bul/HH),
      // que vive en deposito-esteban. Fallback al override de config si el depósito no responde.
      const pickResumen = await fetchDepositoJson(`/api/productividad/picking-resumen?anio=${hoy.getFullYear()}`)
      const prodPicking = Number(pickResumen?.promedio_anual) || config.prod_bul_hh
      const capPicker = prodPicking * config.horas_turno * config.util_pickeros
      const pickeros: RolFte = {
        volumenProm: Math.round(pk.prom), volumenPico: Math.round(pk.pico), productividad: prodPicking,
        diasConDatos: pk.dias,
        fteNecesariosProm: capPicker > 0 ? Math.round((pk.prom / capPicker) * 10) / 10 : 0,
        fteNecesariosPico: capPicker > 0 ? Math.round((pk.pico / capPicker) * 10) / 10 : 0,
        dotacion: config.dotacion_almacen,
        dotacionEfectiva: efAlmacen(config.dotacion_almacen),
        utilizacion: config.util_pickeros,
        capDiariaFte: Math.round(capPicker),
      }

      // Maquinistas: pallets acarreo (recepcion_acarreos) + carga distribución (carga-camiones)
      const acarreoPorDiaAnio = new Map<string, number>()
      try {
        const acarreo = createAcarreoClient()
        if (acarreo) {
          const rec = await todas<{ fecha: string; pallets: number | string | null }>((a, b) =>
            acarreo.from("recepcion_acarreos").select("fecha, pallets").gte("fecha", inicioAnio).order("fecha").range(a, b))
          for (const r of rec) {
            const k = r.fecha as string
            acarreoPorDiaAnio.set(k, (acarreoPorDiaAnio.get(k) ?? 0) + Number(r.pallets ?? 0))
          }
        }
      } catch {
        // acarreo-rdf no configurado → maquinistas solo con carga de distribución
      }
      const cargaPorDiaAnio = new Map<string, number>()
      for (const r of await fetchDepositoFilas("carga-camiones")) {
        const fch = String((r as { fecha?: string }).fecha ?? "")
        if (fch >= inicioAnio) cargaPorDiaAnio.set(fch, (cargaPorDiaAnio.get(fch) ?? 0) + Number((r as { pallets?: number }).pallets ?? 0))
      }
      const palPorDiaAnio = new Map<string, number>()
      for (const fch of new Set([...acarreoPorDiaAnio.keys(), ...cargaPorDiaAnio.keys()])) {
        const aca = acarreoPorDiaAnio.get(fch) ?? 0
        const car = cargaPorDiaAnio.get(fch) ?? 0
        palPorDiaAnio.set(fch, aca + car * (1 + config.factor_retorno_distrib))
      }
      const acarreoPorDia = soloMes(acarreoPorDiaAnio, mesAA), cargaPorDia = soloMes(cargaPorDiaAnio, mesAA)
      const palPorDia = soloMes(palPorDiaAnio, mesAA)
      const acaVals: number[] = [], cargaVals: number[] = []
      for (const fch of new Set([...acarreoPorDia.keys(), ...cargaPorDia.keys()])) {
        acaVals.push(acarreoPorDia.get(fch) ?? 0); cargaVals.push(cargaPorDia.get(fch) ?? 0)
      }
      const mq = statsPorDia(palPorDia)
      const capMaq = config.prod_pal_h * config.horas_turno * config.util_maquinistas
      const avgArr = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0)
      const maquinistas = {
        volumenProm: Math.round(mq.prom), volumenPico: Math.round(mq.pico), productividad: config.prod_pal_h,
        diasConDatos: mq.dias,
        fteNecesariosProm: capMaq > 0 ? Math.round((mq.prom / capMaq) * 10) / 10 : 0,
        fteNecesariosPico: capMaq > 0 ? Math.round((mq.pico / capMaq) * 10) / 10 : 0,
        dotacion: config.dotacion_maquinistas,
        dotacionEfectiva: efAlmacen(config.dotacion_maquinistas),
        utilizacion: config.util_maquinistas,
        capDiariaFte: Math.round(capMaq),
        palAcarreoProm: avgArr(acaVals),
        palCargaProm: avgArr(cargaVals),
        factorRetorno: config.factor_retorno_distrib,
      }

      // Clasificadores (envases retornables). Demanda = presupuesto de retiros de
      // Quilmes en HL (acarreo-rdf), repartido uniforme entre días hábiles → HL/día.
      // NO es auto-reportado: reemplaza al pallets_total manual de clasificacion_envases.
      // Todo en HL: la productividad (config, en pal/HH) se convierte con 6 HL/paleta.
      const hlClasifDia = hlRetDia(hoy.getMonth() + 1, hoy.getFullYear())
      const prodClasifHlHh = config.prod_clasif_pal_h * hlPorPaleta
      const capClasif = prodClasifHlHh * config.horas_turno * config.util_clasif
      // Productividad REAL medida del mes (pal/HH), solo como control/referencia en la UI.
      const { data: clz } = await supabase
        .from("clasificacion_envases")
        .select("hora_inicio, hora_fin, pallets_total, pallets_rotos")
        .gte("fecha", desde)
      let horasClasif = 0, palClasifReal = 0
      for (const r of clz ?? []) {
        horasClasif += horasEntre(r.hora_inicio as string, r.hora_fin as string)
        palClasifReal += Number(r.pallets_total ?? 0) - Number(r.pallets_rotos ?? 0)
      }
      const prodRealPalHH = horasClasif > 0 ? Math.round((palClasifReal / horasClasif) * 100) / 100 : null
      const fteClasif = capClasif > 0 && hlClasifDia > 0 ? Math.round((hlClasifDia / capClasif) * 10) / 10 : 0
      const clasificadores: RolFte & { prodRealPalHH: number | null } = {
        // reparto uniforme → promedio = pico
        volumenProm: Math.round(hlClasifDia), volumenPico: Math.round(hlClasifDia),
        productividad: Math.round(prodClasifHlHh * 10) / 10,
        diasConDatos: diasHabilesDelMes(hoy.getFullYear(), hoy.getMonth() + 1),
        fteNecesariosProm: fteClasif,
        fteNecesariosPico: fteClasif,
        dotacion: config.dotacion_clasif,
        dotacionEfectiva: efAlmacen(config.dotacion_clasif),
        utilizacion: config.util_clasif,
        capDiariaFte: Math.round(capClasif),
        prodRealPalHH,
      }

      // Reempaque (tareas generales): bultos/día de deposito-esteban /api/reempaque/diario,
      // un pedido por mes del año (en paralelo) para el cuadro anual.
      const reempaquePorDiaAnio = new Map<string, number>()
      const reJsons = await Promise.all(
        Array.from({ length: hoy.getMonth() + 1 }, (_, i) => fetchDepositoJson(`/api/reempaque/diario?mes=${i + 1}&anio=${hoy.getFullYear()}`)),
      )
      for (const reJson of reJsons) {
        for (const r of (reJson?.diario as Array<{ fecha?: string; bultos?: number }> | undefined) ?? []) {
          const b = Number(r.bultos ?? 0)
          if (b > 0 && String(r.fecha ?? "") >= inicioAnio) reempaquePorDiaAnio.set(String(r.fecha), b)
        }
      }
      const reempaquePorDia = soloMes(reempaquePorDiaAnio, mesAA)
      const re = statsPorDia(reempaquePorDia)
      // Tareas generales se dimensionan en HORAS/día (modelo de Casa Central): la parte
      // variable son los bultos de reempaque ÷ bul/HH, y se le suman las horas fijas
      // (limpieza, prensa, orden) que no dependen del volumen. Capacidad por persona =
      // horas de turno × utilización. Con 6-11 bultos/día el FTE por bultos daba 0,1 y
      // escondía que la persona está ocupada igual.
      const prodRe = config.prod_reempaque_bul_hh
      const horasFijas = config.horas_fijas_generales
      const horasVar = (b: number) => (prodRe > 0 ? b / prodRe : 0)
      const capReempaque = config.horas_turno * config.util_reempaque // horas/persona/día
      const hProm = horasVar(re.prom) + horasFijas
      const hPico = horasVar(re.pico) + horasFijas
      const reempaque: RolFte = {
        volumenProm: Math.round(hProm * 10) / 10, volumenPico: Math.round(hPico * 10) / 10, productividad: prodRe,
        diasConDatos: re.dias,
        fteNecesariosProm: capReempaque > 0 ? Math.round((hProm / capReempaque) * 10) / 10 : 0,
        fteNecesariosPico: capReempaque > 0 ? Math.round((hPico / capReempaque) * 10) / 10 : 0,
        dotacion: config.dotacion_reempaque,
        dotacionEfectiva: efAlmacen(config.dotacion_reempaque),
        utilizacion: config.util_reempaque,
        capDiariaFte: Math.round(capReempaque * 10) / 10,
      }

      if (pk.dias > 0 || mq.dias > 0 || hlClasifDia > 0 || re.dias > 0 || horasFijas > 0)
        almacen = { mes: mesAA, pickeros, clasificadores, reempaque, maquinistas }

      // ── Cuadro anual: meses cerrados con volumen REAL, misma estructura y parámetros de hoy ──
      const ausAlm = 1 - config.ausentismo_almacen
      const esSabado = (fecha: string) => /^\d{4}-\d{2}-\d{2}$/.test(fecha) && new Date(`${fecha}T12:00:00`).getDay() === 6
      const rolHist = (m: Map<string, number>, capPersona: number, dotacion: number, prodH: number, mesN: number, fijo = 0): HistoricoRol | null => {
        const st = statsPorDia(m)
        if (st.dias === 0 && fijo === 0) return null
        const capEquipo = capPersona * efAlmacen(dotacion)
        // horas extra por volumen sólo de lunes a viernes: el sábado va por la regla propia
        let hh = 0
        for (const [f, v] of m) { if (esSabado(f)) continue; const d = v + fijo; if (d > capEquipo && prodH > 0) hh += (d - capEquipo) / prodH }
        const hhSab = efAlmacen(dotacion) * hSabado(mesN) * sabadosDelMes(hoy.getFullYear(), mesN)
        const volProm = st.prom + fijo, volPico = st.pico + fijo
        const nec = capPersona > 0 && ausAlm > 0 ? Math.round((volProm / capPersona / ausAlm) * 10) / 10 : 0
        return {
          volumenProm: Math.round(volProm * 10) / 10, volumenPico: Math.round(volPico * 10) / 10, dias: st.dias,
          necesariosProm: nec,
          necesariosPico: capPersona > 0 ? Math.round((volPico / capPersona) * 10) / 10 : 0,
          sobran: Math.max(0, Math.round((dotacion - nec) * 10) / 10),
          temporales: Math.max(0, Math.round((nec - dotacion) * 10) / 10),
          horasExtra: Math.round((hh + hhSab) * 10) / 10,
          horasSabado: Math.round(hhSab * 10) / 10,
        }
      }
      for (let mN = 1; mN < hoy.getMonth() + 1; mN++) {
        const k = `${hoy.getFullYear()}-${String(mN).padStart(2, "0")}`
        const hlDia = hlRetDia(mN, hoy.getFullYear())
        const clasifMap = new Map<string, number>()
        if (hlDia > 0) for (let d = 1; d <= diasHabilesDelMes(hoy.getFullYear(), mN); d++) clasifMap.set(`${k}-h${d}`, hlDia)
        const reMap = new Map([...soloMes(reempaquePorDiaAnio, k)].map(([f, b]) => [f, horasVar(b)]))
        const almHist = {
          pickeros: rolHist(soloMes(bultosPorDiaAnio, k), capPicker, config.dotacion_almacen, prodPicking, mN),
          clasificadores: rolHist(clasifMap, capClasif, config.dotacion_clasif, prodClasifHlHh, mN),
          reempaque: rolHist(reMap, capReempaque, config.dotacion_reempaque, 1, mN, horasFijas),
          maquinistas: rolHist(soloMes(palPorDiaAnio, k), capMaq, config.dotacion_maquinistas, config.prod_pal_h, mN),
        }
        if (Object.values(almHist).some((x) => x && x.dias > 0)) almacenHist.set(k, almHist)
      }
    } catch (e) {
      almacenError = e instanceof Error ? e.message : "Error almacén"
    }

    // Reparto (FTE flota/entrega): necesarios = camiones necesarios × tripulación;
    // dotación actual = FTE promedio real de dpo-app (registros_vehiculos, egresos).
    let reparto: RepartoData | null = null
    let repartoError: string | null = null
    const repartoObsPorMes = new Map<string, { choferes: number; ayudantes: number }>()
    try {
      const regs = await todas<{ fecha: string; chofer: string | null; ayudante1: string | null; ayudante2: string | null }>((a, b) =>
        supabase.from("registros_vehiculos").select("fecha, chofer, ayudante1, ayudante2").eq("tipo", "egreso").gte("fecha", inicioAnio).order("fecha").range(a, b))
      const choByDiaAnio = new Map<string, Set<string>>()
      const ayuByDiaAnio = new Map<string, Set<string>>()
      for (const r of regs) {
        const k = r.fecha as string
        const cho = String(r.chofer ?? "").trim()
        if (cho) (choByDiaAnio.get(k) ?? choByDiaAnio.set(k, new Set()).get(k)!).add(cho)
        for (const a of [r.ayudante1, r.ayudante2]) {
          const ay = String(a ?? "").trim()
          if (ay) (ayuByDiaAnio.get(k) ?? ayuByDiaAnio.set(k, new Set()).get(k)!).add(ay)
        }
      }
      const sizes = (m: Map<string, Set<string>>, mes?: string) => [...m.entries()].filter(([k]) => !mes || k.startsWith(mes)).map(([, s]) => s.size)
      const avgN = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
      const maxN = (a: number[]) => (a.length ? Math.max(...a) : 0)
      const choByDia = new Map([...choByDiaAnio].filter(([k]) => k.startsWith(mesAA)))
      const ayuByDia = new Map([...ayuByDiaAnio].filter(([k]) => k.startsWith(mesAA)))
      const choC = sizes(choByDia), ayuC = sizes(ayuByDia)
      // Cuadro anual: dotación observada por mes cerrado (promedio de personas distintas por día).
      for (const [k] of metricasPorMes) {
        repartoObsPorMes.set(k, { choferes: Math.round(avgN(sizes(choByDiaAnio, k)) * 10) / 10, ayudantes: Math.round(avgN(sizes(ayuByDiaAnio, k)) * 10) / 10 })
      }
      const cnProm = metricas?.camionesNecesariosPromedio ?? 0
      const cnPico = metricas?.camionesNecesariosPico ?? 0
      // dotación efectiva: plantel cargado a mano si >0, si no el promedio real observado.
      // Al plantel se le descuenta el ausentismo de reparto (el observado ya lo trae implícito,
      // pero el parámetro aplica igual por si se quiere simular; default 0).
      const ausRep = 1 - config.ausentismo_reparto
      const rol = (porCamion: number, counts: number[], override: number): RolReparto => {
        const obsProm = Math.round(avgN(counts) * 10) / 10
        const obsPico = maxN(counts)
        const efectiva = Math.round((override > 0 ? override : obsProm) * ausRep * 10) / 10
        return {
          porCamion,
          fteNecesariosProm: Math.ceil(cnProm * porCamion),
          fteNecesariosPico: Math.ceil(cnPico * porCamion),
          dotacionProm: efectiva,
          dotacionPico: Math.round((override > 0 ? override : obsPico) * ausRep * 10) / 10,
          dotacionObservada: obsProm,
        }
      }
      if (choByDia.size > 0 || ayuByDia.size > 0) {
        reparto = {
          mes: mesAA,
          diasConDatos: choByDia.size,
          camionesNecesariosProm: cnProm,
          camionesNecesariosPico: cnPico,
          choferes: rol(config.choferes_por_camion, choC, config.dotacion_choferes),
          ayudantes: rol(config.ayudantes_por_camion, ayuC, config.dotacion_ayudantes),
        }
      }
    } catch (e) {
      repartoError = e instanceof Error ? e.message : "Error reparto"
    }

    // HL DISTRIBUIDOS con flota propia por mes (pc_volumen_diario, Chess + GESCOM sin patentes),
    // año anterior y en curso. Alimenta el anclaje de la proyección y el cuadro anual.
    const hlMesDist = new Map<string, { hl: number; dias: number }>()
    {
      const filas = await todas<{ fecha: string; bultos_distribuidos: number | string | null }>((a, b) =>
        supabase.from("pc_volumen_diario").select("fecha, bultos_distribuidos")
          .gte("fecha", `${hoy.getFullYear() - 1}-01-01`).lte("fecha", `${hoy.getFullYear()}-12-31`).order("fecha").range(a, b))
      for (const r of filas) {
        const k = String(r.fecha).slice(0, 7)
        const hl = Number(r.bultos_distribuidos ?? 0)
        if (!Number.isFinite(hl) || hl <= 0) continue
        const cur = hlMesDist.get(k) ?? { hl: 0, dias: 0 }
        cur.hl += hl; cur.dias++
        hlMesDist.set(k, cur)
      }
    }

    // Proyección de dotación vs volumen futuro (HL/mes presupuesto × pct_distribuido). Escala
    // los necesarios de cada recurso por el índice de volumen POR DÍA de cada mes respecto
    // del mes base, ancla el volumen base al presupuesto a distribuir y compara con la dotación fija.
    let proyeccion: ProyeccionData | null = null
    let proyeccionError: string | null = null
    try {
      const anioActual = hoy.getFullYear()
      const mesActual = hoy.getMonth() + 1
      // fallback sin ajuste_pct por si la migración aún no corrió en esta base
      let vol: { mes: number; hl: number; ajuste_pct?: number }[] | null =
        (await supabase.from("dim_volumen_proyectado").select("mes, hl, ajuste_pct").eq("anio", anioActual)).data
      if (!vol) vol = (await supabase.from("dim_volumen_proyectado").select("mes, hl").eq("anio", anioActual)).data
      const hlPorMes = new Map<number, { hl: number; pct: number }>()
      for (const r of vol ?? []) hlPorMes.set(Number(r.mes), { hl: Number(r.hl), pct: Number(r.ajuste_pct ?? 0) })
      // El ajuste del mes base también escala su HL → recalibra el índice de TODOS los meses.
      const base = hlPorMes.get(mesActual)
      const hlBasePresupuesto = base?.hl ?? 0
      const ajusteBasePct = base?.pct ?? 0
      const hlBase = hlBasePresupuesto * (1 + ajusteBasePct / 100)
      const pctDist = config.pct_distribuido
      const diasHabilesBase = diasHabilesDelMes(anioActual, mesActual) || 1
      // Anclaje: volumen a distribuir por día que dice el presupuesto del mes base, contra
      // lo que realmente se distribuyó por día en lo que va del mes base.
      const distBase = hlMesDist.get(mesAA)
      const realDistDiaBase = distBase && distBase.dias > 0 ? distBase.hl / distBase.dias : 0
      const pptoDistDiaBase = (hlBase * pctDist) / diasHabilesBase
      const anclaje = realDistDiaBase > 0 && pptoDistDiaBase > 0 ? pptoDistDiaBase / realDistDiaBase : 1
      if (hlBase > 0) {
        const meses: ProyeccionMes[] = []
        // Arranca en el mes EN CURSO (no en el siguiente): la reunión de cierre del
        // mes anterior necesita comunicar este mes, que para ella es "el que entra".
        // Su índice es 1,0 por definición, así que no altera el resto de la serie.
        for (let m = mesActual; m <= 12; m++) {
          const v = hlPorMes.get(m)
          if (v && v.hl > 0) {
            // escenario: el % de ajuste del mes escala el HL del presupuesto (y por lo tanto el índice)
            const hl = v.hl * (1 + v.pct / 100)
            const dh = diasHabilesDelMes(anioActual, m) || 1
            meses.push({
              mes: `${anioActual}-${String(m).padStart(2, "0")}`, hl, hlPresupuesto: v.hl, ajustePct: v.pct,
              diasHabiles: dh, hlDistribuir: hl * pctDist,
              indice: (hl / dh) / (hlBase / diasHabilesBase),
            })
          }
        }
        if (meses.length > 0) {
          // Pesos de volumen por día de semana (lun..sáb), normalizados.
          const pesos = [config.peso_lun, config.peso_mar, config.peso_mie, config.peso_jue, config.peso_vie, config.peso_sab]
          const sumaPesos = pesos.reduce((s, x) => s + x, 0) || 1
          const DIAS_SEMANA = 6
          // weekday JS: 0=dom..6=sáb → peso lun..sáb = pesos[wd-1]; domingo no opera.
          const pesoDe = (wd: number) => (wd === 0 ? 0 : (pesos[wd - 1] ?? 0) / sumaPesos)
          const weekdaysDelMes = (m: number) => {
            const out: number[] = []
            const last = new Date(anioActual, m, 0).getDate()
            for (let d = 1; d <= last; d++) out.push(new Date(anioActual, m - 1, d).getDay())
            return out
          }

          // Almacén (dotación fija) → horas-hombre extra por mes en los días que el volumen supera la capacidad.
          // Base = volumen PROMEDIO diario; el pico del día lo genera el peso del día de semana (jue/vie ×1,5).
          // Tareas generales va en HORAS: la parte variable (bultos de reempaque ÷ bul/HH)
          // escala con el volumen, las horas fijas (volFijo) no. prodH = 1 (una hora es una hora).
          const rolesAlm: Array<{ rol: string; rolFte?: RolFte; prodH: number; dotacion: number; unidad: string; volFijo: number }> = [
            { rol: "Pickeros", rolFte: almacen?.pickeros, prodH: config.prod_bul_hh, dotacion: config.dotacion_almacen, unidad: "bultos", volFijo: 0 },
            { rol: "Clasificadores", rolFte: almacen?.clasificadores, prodH: config.prod_clasif_pal_h * hlPorPaleta, dotacion: config.dotacion_clasif, unidad: "HL", volFijo: 0 },
            { rol: "Tareas grales (reempaque)", rolFte: almacen?.reempaque, prodH: 1, dotacion: config.dotacion_reempaque, unidad: "horas", volFijo: config.horas_fijas_generales },
            { rol: "Maquinistas", rolFte: almacen?.maquinistas, prodH: config.prod_pal_h, dotacion: config.dotacion_maquinistas, unidad: "pallets", volFijo: 0 },
          ]
          const maxPesoNorm = Math.max(...pesos) / sumaPesos
          const ausAlm = 1 - config.ausentismo_almacen
          const almacenProy: ProyeccionAlmacenRol[] = rolesAlm.map((r) => {
            // promedio diario VARIABLE (NO el pico), anclado al presupuesto a distribuir
            // (clasificadores ya van por presupuesto: sin anclaje)
            const volBase = Math.max(0, (r.rolFte?.volumenProm ?? 0) - r.volFijo) * (r.unidad === "HL" ? 1 : anclaje)
            const dotEfectiva = efAlmacen(r.dotacion)                             // descuenta ausentismo
            const capDiaria = (r.rolFte?.capDiariaFte ?? 0) * dotEfectiva         // dotación efectiva
            const capPersona = r.rolFte?.capDiariaFte ?? 0                        // por persona
            const horasExtra: number[] = [], faltanPico: number[] = [], volPicoDia: number[] = []
            const necesariosProm: number[] = [], sobran: number[] = [], temporales: number[] = []
            const horasSabado: number[] = []
            // Regla de sábado: toda la dotación efectiva hace (fin − 11) h extra cada sábado del mes.
            const sabadoDe = (mesN: number) => Math.round(dotEfectiva * hSabado(mesN) * sabadosDelMes(anioActual, mesN) * 10) / 10
            // Lectura mensual (Casa Central): necesarios del día promedio llevados a nómina
            // (÷ (1 − ausentismo)) contra la dotación nominal → sobran / temporales.
            const mensual = (volPromDia: number) => {
              const nec = capPersona > 0 && ausAlm > 0 ? Math.round((volPromDia / capPersona / ausAlm) * 10) / 10 : 0
              necesariosProm.push(nec)
              sobran.push(Math.max(0, Math.round((r.dotacion - nec) * 10) / 10))
              temporales.push(Math.max(0, Math.round((nec - r.dotacion) * 10) / 10))
            }
            const base = { rol: r.rol, dotacion: r.dotacion, dotacionEfectiva: dotEfectiva, capDiaria: Math.round(capDiaria), capPersona: Math.round(capPersona * 10) / 10, unidadVol: r.unidad, volPromBase: Math.round(volBase * 10) / 10, volFijo: r.volFijo, prodH: r.prodH }
            // Clasificadores: la demanda es el presupuesto retornable del mes (HL) repartido
            // uniforme entre días hábiles → no escala por índice ni tiene pico por día de semana.
            if (r.rol === "Clasificadores") {
              for (const mm of meses) {
                const mesN = Number(mm.mes.split("-")[1])
                const volDia = hlRetDia(mesN, anioActual)
                // horas extra por volumen sólo lun-vie (los sábados van por la regla propia)
                const diasLV = diasHabilesDelMes(anioActual, mesN) - sabadosDelMes(anioActual, mesN)
                const hh = volDia > capDiaria && r.prodH > 0 ? ((volDia - capDiaria) / r.prodH) * diasLV : 0
                const hs = sabadoDe(mesN)
                horasExtra.push(Math.round((hh + hs) * 10) / 10)
                horasSabado.push(hs)
                volPicoDia.push(Math.round(volDia))
                faltanPico.push(capPersona > 0 ? Math.max(0, Math.round((volDia - capDiaria) / capPersona)) : 0)
                mensual(volDia)
              }
              return { ...base, horasExtra, faltanPico, volPicoDia, necesariosProm, sobran, temporales, horasSabado }
            }
            for (const mm of meses) {
              const mesN = Number(mm.mes.split("-")[1])
              const volMes = volBase * mm.indice
              let hh = 0
              for (const wd of weekdaysDelMes(mesN)) {
                const w = pesoDe(wd)
                if (w <= 0 || wd === 6) continue // sábado: va por la regla propia, no por volumen
                const volDia = volMes * DIAS_SEMANA * w + r.volFijo
                if (volDia > capDiaria && r.prodH > 0) hh += (volDia - capDiaria) / r.prodH
              }
              const hs = sabadoDe(mesN)
              const pico = volMes * DIAS_SEMANA * maxPesoNorm + r.volFijo         // volumen del día más cargado
              horasExtra.push(Math.round((hh + hs) * 10) / 10)
              horasSabado.push(hs)
              volPicoDia.push(Math.round(pico))
              // personas extra para cubrir el pico SIN horas extra; redondeo normal (evita "falta 1" por excedente mínimo)
              faltanPico.push(capPersona > 0 ? Math.max(0, Math.round((pico - capDiaria) / capPersona)) : 0)
              mensual(volMes + r.volFijo)
            }
            return { ...base, horasExtra, faltanPico, volPicoDia, necesariosProm, sobran, temporales, horasSabado }
          })

          // Flota → por recurso, días que requieren refuerzo (2ª vuelta o contratar).
          const dispCap = flota.filter((f) => f.activo && f.capacidad_ceq > 0)
          const camionesDisp = dispCap.length
          const capCamion = camionesDisp > 0 ? dispCap.reduce((s, f) => s + f.capacidad_ceq, 0) / camionesDisp : 0
          const viajes = config.viajes_por_dia || 1
          const capCamionViaje = capCamion * viajes
          const choferesDisp = Math.round(reparto?.choferes.dotacionProm ?? 0)
          const ayudantesDisp = Math.round(reparto?.ayudantes.dotacionProm ?? 0)
          const ceqProm = (metricas?.volumenCeqPromedio ?? 0) * anclaje // CEq/día anclado al presupuesto a distribuir
          const recursosFlota = [
            { rol: "Camiones", dotacion: camionesDisp, tripulacion: 1 },
            { rol: "Choferes", dotacion: choferesDisp, tripulacion: config.choferes_por_camion },
            { rol: "Ayudantes", dotacion: ayudantesDisp, tripulacion: config.ayudantes_por_camion },
          ]
          const camionesDe = (ceqDia: number) => zonas.length > 0 ? camionesPorZonas(ceqDia, zonas, capCamionViaje, ceqProm) : (capCamionViaje > 0 ? Math.ceil(ceqDia / capCamionViaje) : 0)
          const flotaProy: ProyeccionFlotaRol[] = recursosFlota.map((rf) => {
            const diasRefuerzo: number[] = [], picoNecesario: number[] = [], segundaVueltaMeses: boolean[] = []
            const necesariosProm: number[] = [], sobran: number[] = []
            for (const mm of meses) {
              const ceqMes = ceqProm * mm.indice
              let dias = 0, pico = 0, sv = false
              for (const wd of weekdaysDelMes(Number(mm.mes.split("-")[1]))) {
                const w = pesoDe(wd)
                if (w <= 0) continue
                const ceqDia = ceqMes * DIAS_SEMANA * w
                const camionesDia = camionesDe(ceqDia)
                const necesarios = camionesDia * rf.tripulacion
                if (necesarios > rf.dotacion) dias++
                if (camionesDia > camionesDisp) sv = true
                pico = Math.max(pico, necesarios)
              }
              diasRefuerzo.push(dias); picoNecesario.push(pico); segundaVueltaMeses.push(sv)
              // día promedio del mes: cuántos hacen falta y cuántos sobran de la dotación
              const necProm = camionesDe(ceqMes) * rf.tripulacion
              necesariosProm.push(necProm)
              sobran.push(Math.max(0, rf.dotacion - necProm))
            }
            return { rol: rf.rol, dotacion: rf.dotacion, tripulacion: rf.tripulacion, diasRefuerzo, picoNecesario, segundaVueltaMeses, necesariosProm, sobran }
          })
          // Ocupación proyectada de la flota por mes (capacidad instalada, no descuenta taller).
          const ocupacionMes = meses.map((mm) => (capacidadInstaladaDiaria > 0 ? Math.round(((ceqProm * mm.indice) / capacidadInstaladaDiaria) * 1000) / 1000 : 0))

          // Costo de la hora extra por mes/sector + VLC/HL de referencia, para valorizar
          // las horas extra que el modelo proyecta y traducirlas a $/HL incremental.
          const costoHh: CostoHhMes[] = []
          try {
            const { data: ch } = await supabase
              .from("dim_costo_hh").select("mes, costo_hh_almacen, costo_hh_entrega, hh_ppto_almacen, hh_ppto_entrega").eq("anio", anioActual)
            const porMes = new Map((ch ?? []).map((r) => [Number(r.mes), r]))
            for (const mm of meses) {
              const r = porMes.get(Number(mm.mes.split("-")[1]))
              costoHh.push({
                mes: Number(mm.mes.split("-")[1]),
                almacen: Number(r?.costo_hh_almacen ?? 0),
                entrega: Number(r?.costo_hh_entrega ?? 0),
                hhPptoAlmacen: Number((r as { hh_ppto_almacen?: number } | undefined)?.hh_ppto_almacen ?? 0),
                hhPptoEntrega: Number((r as { hh_ppto_entrega?: number } | undefined)?.hh_ppto_entrega ?? 0),
              })
            }
          } catch {
            // tabla aún no creada → la UI pide cargar los valores
          }

          const vlc: VlcReferencia = { mesBase: null, valorMes: null, hlMes: null, ytd: null, meta: null }
          try {
            const { data: det } = await supabase.rpc("sueno_kpi_detalle", { p_kpi: "vlc_hl", p_anio: anioActual })
            const filas = (det ?? []) as Array<{ mes: number; valor: number; detalle: number }>
            const ult = filas.filter((f) => Number(f.valor) > 0).sort((a, b) => Number(b.mes) - Number(a.mes))[0]
            if (ult) {
              vlc.mesBase = `${anioActual}-${String(ult.mes).padStart(2, "0")}`
              vlc.valorMes = Number(ult.valor)
              vlc.hlMes = Number(ult.detalle)
            }
            const { data: kv } = await supabase
              .from("sueno_kpi_valores").select("valor_ytd, meta").eq("kpi_key", "vlc_hl").eq("anio", anioActual).maybeSingle()
            if (kv) { vlc.ytd = Number(kv.valor_ytd); vlc.meta = Number(kv.meta) }
          } catch {
            // el KPI del Árbol del Sueño no está disponible → se muestra solo el incremental
          }

          proyeccion = {
            mesBase: `${anioActual}-${String(mesActual).padStart(2, "0")}`,
            hlBase, hlBasePresupuesto, ajusteBasePct,
            meses, almacen: almacenProy, flota: flotaProy,
            flotaCeqPromBase: Math.round(ceqProm), capCamionViaje: Math.round(capCamionViaje),
            choferesDisp, camionesDisp, capCamion: Math.round(capCamion),
            pesos: pesos.map((x) => Math.round((x / sumaPesos) * 1000) / 1000),
            costoHh, vlc,
            ocupacionMes, capacidadInstalada: Math.round(capacidadInstaladaDiaria), umbralOciosa: config.umbral_ocupacion_ociosa,
            pctDistribuido: pctDist, diasHabilesBase,
            realDistDiaBase: Math.round(realDistDiaBase * 10) / 10, pptoDistDiaBase: Math.round(pptoDistDiaBase * 10) / 10,
            anclaje: Math.round(anclaje * 1000) / 1000,
            sabados: {
              finNormal: config.sabado_fin_normal, finAlta: config.sabado_fin_alta, finBaja: config.sabado_fin_baja, mesesAlta: config.meses_temporada_alta,
              sabadosMes: meses.map((mm) => sabadosDelMes(anioActual, Number(mm.mes.split("-")[1]))),
              horasPersonaMes: meses.map((mm) => hSabado(Number(mm.mes.split("-")[1]))),
            },
          }
        }
      }
    } catch (e) {
      proyeccionError = e instanceof Error ? e.message : "Error proyección"
    }

    // Escenarios de volumen del año (HL/mes): AA, presupuesto, forecast y real.
    // Real y AA = HL distribuidos con flota propia (pc_volumen_diario, Chess + GESCOM).
    const escenarios: EscenarioVolumenMes[] = []
    try {
      const anio = hoy.getFullYear()
      const mesHoy = hoy.getMonth() + 1
      const hlMes = hlMesDist
      const { data: ppto } = await supabase.from("dim_volumen_proyectado").select("mes, hl, ajuste_pct").eq("anio", anio)
      const pptoMes = new Map((ppto ?? []).map((r) => [Number(r.mes), { hl: Number(r.hl), pct: Number((r as { ajuste_pct?: number }).ajuste_pct ?? 0) }]))
      // HL VENDIDOS (facturado Chess neto): misma cuenta que `sueno_kpi_detalle('vlc_hl')` —
      // ventas_diarias origen chess + mostrador (FCVTA, PRVTA) − notas de crédito (DVVTA, PRDVO).
      const vendidoMes = new Map<number, number>()
      const vd = await todas<{ fecha: string; total_hl: number | string | null }>((a, b) =>
        supabase.from("ventas_diarias").select("fecha, total_hl").eq("origen", "chess").gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`).order("fecha").range(a, b))
      for (const r of vd) { const m = Number(String(r.fecha).slice(5, 7)); vendidoMes.set(m, (vendidoMes.get(m) ?? 0) + Number(r.total_hl ?? 0)) }
      const vm = await todas<{ fecha: string; ds_documento: string | null; total_hl: number | string | null }>((a, b) =>
        supabase.from("ventas_mostrador_diarias").select("fecha, ds_documento, total_hl").gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`).order("fecha").range(a, b))
      for (const r of vm) {
        const m = Number(String(r.fecha).slice(5, 7))
        const hl = Number(r.total_hl ?? 0) * (r.ds_documento === "DVVTA" || r.ds_documento === "PRDVO" ? -1 : 1)
        vendidoMes.set(m, (vendidoMes.get(m) ?? 0) + hl)
      }
      for (let m = 1; m <= 12; m++) {
        const k = `${anio}-${String(m).padStart(2, "0")}`
        const kAA = `${anio - 1}-${String(m).padStart(2, "0")}`
        const real = hlMes.get(k), aa = hlMes.get(kAA), p = pptoMes.get(m)
        const vend = vendidoMes.get(m)
        const fc = p && p.hl > 0 ? p.hl * (1 + p.pct / 100) : null
        escenarios.push({
          mes: m,
          aa: aa ? Math.round(aa.hl) : null,
          presupuesto: p && p.hl > 0 ? Math.round(p.hl) : null,
          forecast: fc != null ? Math.round(fc) : null,
          aDistribuir: p && p.hl > 0 ? Math.round(p.hl * config.pct_distribuido) : null,
          forecastDistribuir: fc != null ? Math.round(fc * config.pct_distribuido) : null,
          pctReal: real && vend != null && vend > 0 ? Math.round((real.hl / vend) * 1000) / 1000 : null,
          vendido: vend != null && vend > 0 ? Math.round(vend) : null,
          real: real ? Math.round(real.hl) : null,
          diasReal: real?.dias ?? 0,
          parcial: m === mesHoy,
        })
      }
    } catch {
      // sin pc_volumen_diario (o sin permisos) la tabla de escenarios queda vacía
    }

    // ── Cuadro anual: meses cerrados con datos reales, misma estructura y parámetros de hoy ──
    const historico: HistoricoMes[] = []
    {
      const mesesCerrados = new Set<string>([...metricasPorMes.keys(), ...almacenHist.keys()])
      for (const k of [...mesesCerrados].sort()) {
        const mf = metricasPorMes.get(k) ?? null
        const obs = repartoObsPorMes.get(k) ?? null
        // día por día: cuántos superaron los camiones disponibles
        let diasRef = 0
        if (mf) {
          for (const c of (cierresAnio ?? []).filter((x) => String(x.fecha).startsWith(k))) {
            const ceq = (Number(c.pergamino_bultos ?? 0) + Number(c.ramallo_bultos ?? 0)) * f
            if (ceq <= 0) continue
            const cam = zonas.length > 0 ? camionesPorZonas(ceq, zonas, capUnidad, mf.volumenCeqPromedio) : (capUnidad > 0 ? Math.ceil(ceq / capUnidad) : 0)
            if (cam > disponibles.length) diasRef++
          }
        }
        historico.push({
          mes: k, flota: mf, repartoObs: obs, diasRefuerzoFlota: diasRef,
          almacen: almacenHist.get(k) ?? { pickeros: null, clasificadores: null, reempaque: null, maquinistas: null },
        })
      }
    }

    // ── Horas extra por mes y sector: reales / dimensionadas / presupuestadas ──
    const horasExtra: HorasExtraMes[] = []
    try {
      const anio = hoy.getFullYear()
      // Reales de almacén: deposito-esteban (Σ horas extra del indicador DPO #39, campo "registros").
      const hsAlm = await fetchDepositoJson(`/api/productividad/hs-extras-resumen?anio=${anio}`)
      const realAlm = new Map<number, number>()
      for (const m of (hsAlm?.meses as Array<{ mes?: number; registros?: number }> | undefined) ?? [])
        if (m.mes) realAlm.set(Number(m.mes), Number(m.registros ?? 0))
      const { data: ch } = await supabase.from("dim_costo_hh").select("mes, hh_ppto_almacen").eq("anio", anio)
      const ppto = new Map((ch ?? []).map((r) => [Number(r.mes), r as { hh_ppto_almacen?: number }]))
      // Dimensionadas: histórico para los meses cerrados, proyección para el mes en curso y los que vienen.
      const dimAlm = new Map<number, number>(), dimSab = new Map<number, number>()
      for (const h of historico) {
        const m = Number(h.mes.slice(5, 7))
        dimAlm.set(m, Object.values(h.almacen).reduce((s, r) => s + (r?.horasExtra ?? 0), 0))
        dimSab.set(m, Object.values(h.almacen).reduce((s, r) => s + (r?.horasSabado ?? 0), 0))
      }
      if (proyeccion) {
        proyeccion.meses.forEach((mm, i) => {
          const m = Number(mm.mes.slice(5, 7))
          dimAlm.set(m, proyeccion!.almacen.reduce((s, r) => s + (r.horasExtra[i] ?? 0), 0))
          dimSab.set(m, proyeccion!.almacen.reduce((s, r) => s + (r.horasSabado?.[i] ?? 0), 0))
        })
      }
      const r1 = (v: number) => Math.round(v * 10) / 10
      for (let m = 1; m <= 12; m++) {
        const p = ppto.get(m)
        horasExtra.push({
          mes: m,
          realAlmacen: realAlm.has(m) ? r1(realAlm.get(m)!) : null,
          dimAlmacen: dimAlm.has(m) ? r1(dimAlm.get(m)!) : null,
          dimSabadoAlmacen: dimSab.has(m) ? r1(dimSab.get(m)!) : null,
          pptoAlmacen: p ? Number(p.hh_ppto_almacen ?? 0) : null,
        })
      }
    } catch {
      // sin depósito / tarifas: la fila de horas extra queda vacía
    }

    return {
      data: {
        config,
        objetivos,
        flota,
        zonas,
        capacidadInstaladaDiaria,
        unidadesDisponibles: disponibles.length,
        metricas,
        metricasError,
        almacen,
        almacenError,
        reparto,
        repartoError,
        proyeccion,
        proyeccionError,
        escenarios,
        historico,
        horasExtra,
        retornable,
        planes: (planesRes.data ?? []) as DimPlan[],
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ─── Mutaciones ───────────────────────────────────────────────────────────

export async function guardarCapacidadFlota(
  dominio: string,
  capacidadCeq: number,
  capacidadKg: number | null,
  activo: boolean,
): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase.from("dim_flota_capacidad").upsert({
      dominio,
      capacidad_ceq: Math.max(0, Number(capacidadCeq) || 0),
      capacidad_kg: capacidadKg != null && Number.isFinite(capacidadKg) ? Math.max(0, capacidadKg) : null,
      activo,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function guardarConfigDim(config: DimConfig): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_config")
      .update({
        peso_kg_bulto: Math.max(0, Number(config.peso_kg_bulto) || 0),
        dias_operativos_mes: Math.max(1, Number(config.dias_operativos_mes) || 26),
        viajes_por_dia: Math.max(0.1, Number(config.viajes_por_dia) || 1),
        factor_ceq_bulto: Math.max(0.0001, Number(config.factor_ceq_bulto) || 1),
        prod_bul_hh: Math.max(1, Number(config.prod_bul_hh) || 300),
        horas_turno: Math.max(0.1, Number(config.horas_turno) || 8),
        dotacion_almacen: Math.max(0, Number(config.dotacion_almacen) || 0),
        prod_pal_h: Math.max(0.1, Number(config.prod_pal_h) || 15),
        dotacion_maquinistas: Math.max(0, Number(config.dotacion_maquinistas) || 0),
        factor_retorno_distrib: Math.max(0, Number(config.factor_retorno_distrib) || 0),
        util_pickeros: Math.min(1, Math.max(0.01, Number(config.util_pickeros) || 0.35)),
        util_maquinistas: Math.min(1, Math.max(0.01, Number(config.util_maquinistas) || 0.875)),
        choferes_por_camion: Math.max(0, Number(config.choferes_por_camion) || 1),
        ayudantes_por_camion: Math.max(0, Number(config.ayudantes_por_camion) || 1),
        dotacion_choferes: Math.max(0, Number(config.dotacion_choferes) || 0),
        dotacion_ayudantes: Math.max(0, Number(config.dotacion_ayudantes) || 0),
        peso_lun: Math.max(0, Number(config.peso_lun) || 0),
        peso_mar: Math.max(0, Number(config.peso_mar) || 0),
        peso_mie: Math.max(0, Number(config.peso_mie) || 0),
        peso_jue: Math.max(0, Number(config.peso_jue) || 0),
        peso_vie: Math.max(0, Number(config.peso_vie) || 0),
        peso_sab: Math.max(0, Number(config.peso_sab) || 0),
        prod_clasif_pal_h: Math.max(0.1, Number(config.prod_clasif_pal_h) || 5),
        util_clasif: Math.min(1, Math.max(0.01, Number(config.util_clasif) || 0.875)),
        dotacion_clasif: Math.max(0, Number(config.dotacion_clasif) || 0),
        prod_reempaque_bul_hh: Math.max(0.1, Number(config.prod_reempaque_bul_hh) || 37),
        util_reempaque: Math.min(1, Math.max(0.01, Number(config.util_reempaque) || 0.875)),
        dotacion_reempaque: Math.max(0, Number(config.dotacion_reempaque) || 0),
        ausentismo_almacen: Math.min(0.9, Math.max(0, Number(config.ausentismo_almacen) || 0)),
        ausentismo_reparto: Math.min(0.9, Math.max(0, Number(config.ausentismo_reparto) || 0)),
        horas_vuelta_extra: Math.min(12, Math.max(0.5, Number(config.horas_vuelta_extra) || 4)),
        horas_fijas_generales: Math.min(24, Math.max(0, Number(config.horas_fijas_generales) || 0)),
        umbral_ocupacion_ociosa: Math.min(0.99, Math.max(0.05, Number(config.umbral_ocupacion_ociosa) || 0.7)),
        pct_distribuido: Math.min(1.5, Math.max(0.05, Number(config.pct_distribuido) || 0.8)),
        sabado_fin_normal: Math.min(24, Math.max(0, Number(config.sabado_fin_normal) || 11)),
        sabado_fin_alta: Math.min(24, Math.max(0, Number(config.sabado_fin_alta) || 14)),
        sabado_fin_baja: Math.min(24, Math.max(0, Number(config.sabado_fin_baja) || 12)),
        meses_temporada_alta: String(config.meses_temporada_alta ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 12).join(",") || "1,2,3,11,12",
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// Costo de la hora extra por mes y sector. Se pisa el set completo del año.
export async function guardarCostoHh(anio: number, filas: Array<{ mes: number; almacen: number; entrega: number; pptoAlmacen?: number; pptoEntrega?: number }>) {
  try {
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const profile = await requireRole(ROLES_EDICION)
    if (!profile) return { error: "Sin permisos" }
    const supabase = await createClient()
    const rows = filas
      .filter((f) => Number(f.mes) >= 1 && Number(f.mes) <= 12)
      .map((f) => ({
        anio,
        mes: Number(f.mes),
        costo_hh_almacen: Math.max(0, Number(f.almacen) || 0),
        costo_hh_entrega: Math.max(0, Number(f.entrega) || 0),
        hh_ppto_almacen: Math.max(0, Number(f.pptoAlmacen) || 0),
        hh_ppto_entrega: Math.max(0, Number(f.pptoEntrega) || 0),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }))
    if (rows.length === 0) return { data: true }
    const { error } = await supabase.from("dim_costo_hh").upsert(rows, { onConflict: "anio,mes" })
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// Reemplaza el set completo de zonas de reparto (cobertura de flota).
export async function guardarZonasReparto(zonas: { zona: string; peso: number; camiones_minimos: number; absorbe_crecimiento?: boolean }[]): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    await supabase.from("dim_zonas_reparto").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    const rows = zonas
      .filter((z) => z.zona.trim())
      .map((z, i) => ({
        zona: z.zona.trim(),
        peso: Math.max(0, Number(z.peso) || 0),
        camiones_minimos: Math.max(0, Math.round(Number(z.camiones_minimos) || 0)),
        absorbe_crecimiento: Boolean(z.absorbe_crecimiento),
        orden: i + 1,
        updated_by: profile.id,
      }))
    if (rows.length) {
      const { error } = await supabase.from("dim_zonas_reparto").insert(rows)
      if (error) return { error: error.message }
    }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Guarda el % de ajuste de escenario del volumen proyectado, mes a mes. */
export async function guardarAjustesVolumen(
  ajustes: { anio: number; mes: number; ajustePct: number }[],
): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    for (const a of ajustes) {
      const { error } = await supabase
        .from("dim_volumen_proyectado")
        .update({ ajuste_pct: Math.max(-90, Math.min(500, Number(a.ajustePct) || 0)), updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq("anio", a.anio)
        .eq("mes", a.mes)
      if (error) return { error: error.message }
    }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function guardarObjetivoKpi(kpi: string, objetivo: number): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_kpi_objetivos")
      .update({ objetivo: Number(objetivo) || 0, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("kpi", kpi)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function crearPlanDim(
  plan: Omit<DimPlan, "id" | "created_at" | "estado"> & { estado?: DimPlan["estado"] },
): Promise<Result<DimPlan>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    if (!plan.que?.trim()) return { error: "El 'Qué' es obligatorio." }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("dim_planes")
      .insert({
        que: plan.que.trim(),
        por_que: plan.por_que?.trim() || null,
        quien: plan.quien?.trim() || null,
        donde: plan.donde?.trim() || null,
        cuando: plan.cuando || null,
        como: plan.como?.trim() || null,
        cuanto: plan.cuanto?.trim() || null,
        estado: plan.estado ?? "pendiente",
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: data as DimPlan }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function actualizarEstadoPlanDim(
  id: string,
  estado: DimPlan["estado"],
): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_planes")
      .update({ estado, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Recalcula el factor CEq/bulto desde chess-dashboard (mes anterior, sin envases) y lo guarda. */
export async function recalcularFactorCeq(): Promise<Result<FactorCeqResult>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const r = await fetchFactorCeq()
    if (!r || !r.factor) {
      return { error: "No se pudo calcular el factor desde chess-dashboard (¿PLANIFICADOR_API_KEY configurada?)." }
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_config")
      .update({ factor_ceq_bulto: r.factor, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: r }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export interface ProductividadReal {
  picking: { prod: number; dias: number } | null
  maquinistas: { prod: number; dias: number } | null
  clasif: { prod: number; dias: number } | null
  reempaque: { prod: number; dias: number } | null
}

/** Trae el promedio real de productividad del mes (deposito-esteban) y lo guarda en config. */
export async function recalcularProductividadAlmacen(): Promise<Result<ProductividadReal>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const hoy = new Date()
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`

    const promedio = (filas: Record<string, unknown>[], campo: string): { prod: number; dias: number } | null => {
      const vals = filas
        .filter((r) => String(r.fecha ?? "") >= desde)
        .map((r) => Number(r[campo] ?? 0))
        .filter((v) => v > 0)
      if (!vals.length) return null
      return { prod: Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 10) / 10, dias: vals.length }
    }

    const picking = promedio(await fetchDepositoFilas("productividad-picking"), "bul_hh")
    const maquinistas = promedio(await fetchDepositoFilas("productividad-maquinistas"), "pal_hh")

    const supabase = await createClient()

    // Clasificación: paletas ÷ horas del mes (tabla clasificacion_envases).
    let clasif: { prod: number; dias: number } | null = null
    {
      const { data: clz } = await supabase
        .from("clasificacion_envases").select("pallets_total, hora_inicio, hora_fin").gte("fecha", desde)
      let tb = 0, th = 0, dias = 0
      for (const r of clz ?? []) {
        const pal = Number(r.pallets_total ?? 0)
        const h = horasEntre(r.hora_inicio as string, r.hora_fin as string)
        if (pal > 0 && h > 0) { tb += pal; th += h; dias++ }
      }
      if (th > 0) clasif = { prod: Math.round((tb / th) * 10) / 10, dias }
    }

    // Reempaque: bultos ÷ horas del mes (deposito-esteban /api/reempaque/productividad, ponderado).
    let reempaque: { prod: number; dias: number } | null = null
    {
      const j = await fetchDepositoJson("/api/reempaque/productividad")
      const filas = ((j?.productividad as Array<{ fecha?: string; bultos?: number; horas?: number }> | undefined) ?? [])
        .filter((f) => String(f.fecha ?? "") >= desde)
      const tb = filas.reduce((s, f) => s + Number(f.bultos ?? 0), 0)
      const th = filas.reduce((s, f) => s + Number(f.horas ?? 0), 0)
      if (th > 0) reempaque = { prod: Math.round((tb / th) * 10) / 10, dias: filas.length }
    }

    if (!picking && !maquinistas && !clasif && !reempaque)
      return { error: "deposito-esteban no devolvió productividad de este mes." }

    const patch: Record<string, unknown> = { updated_by: profile.id, updated_at: new Date().toISOString() }
    if (picking) patch.prod_bul_hh = picking.prod
    if (maquinistas) patch.prod_pal_h = maquinistas.prod
    if (clasif) patch.prod_clasif_pal_h = clasif.prod
    if (reempaque) patch.prod_reempaque_bul_hh = reempaque.prod

    const { error } = await supabase.from("dim_config").update(patch).eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: { picking, maquinistas, clasif, reempaque } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Guarda los viajes de retornable presupuestados por mes (y paletas por viaje) del año. */
export async function guardarRetornablePresupuesto(
  anio: number,
  filas: { mes: number; viajes: number }[],
  paletasPorViaje: number,
): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const rows = filas
      .filter((f) => Number(f.mes) >= 1 && Number(f.mes) <= 12)
      .map((f) => ({
        anio, mes: Number(f.mes),
        viajes: Math.max(0, Number(f.viajes) || 0),
        paletas_por_viaje: Math.max(1, Number(paletasPorViaje) || 26),
        updated_by: profile.id, updated_at: new Date().toISOString(),
      }))
    if (!rows.length) return { error: "Sin filas." }
    const { error } = await supabase.from("dim_retornable_presupuesto").upsert(rows, { onConflict: "anio,mes" })
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/**
 * Importa los viajes de retornable del presupuesto anual cargado en la app (bucket
 * `presupuestos`, tabla presupuestos_anuales): hoja "ACARREO PXQ mrp", fila
 * "CERVEZAS CMQ Retornable" del bloque "Q - CANTIDAD DE VIAJES", y las paletas por
 * viaje del bloque "Q - PALETAS X VIAJE".
 */
export async function importarRetornablePresupuesto(anio: number): Promise<Result<{ viajes: number[]; paletasPorViaje: number }>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { data: pa } = await supabase.from("presupuestos_anuales").select("archivo_url").eq("anio", anio).maybeSingle()
    if (!pa?.archivo_url) return { error: `No hay presupuesto anual ${anio} cargado en Presupuesto.` }
    const { data: blob, error: errDl } = await supabase.storage.from("presupuestos").download(pa.archivo_url)
    if (errDl || !blob) return { error: `Descargando el presupuesto: ${errDl?.message ?? "sin archivo"}` }
    const XLSX = await import("xlsx")
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" })
    const nombreHoja = wb.SheetNames.find((n) => n.trim().toUpperCase().startsWith("ACARREO PXQ"))
    if (!nombreHoja) return { error: `El presupuesto ${anio} no tiene la hoja "ACARREO PXQ".` }
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombreHoja], { header: 1, defval: null, blankrows: false })
    const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase()
    let bloque = ""
    let viajes: number[] | null = null
    let paletas = 26
    for (const row of filas) {
      const c0 = norm(row[0]), c1 = norm(row[1])
      if (c0.startsWith("Q - CANTIDAD DE VIAJES")) bloque = "viajes"
      else if (c0.startsWith("Q - PALETAS X VIAJE")) bloque = "paletas"
      else if (c0.startsWith("Q -") || c0.startsWith("P -") || c0.startsWith("P X Q")) bloque = ""
      if (c1 === "CERVEZAS CMQ RETORNABLE") {
        if (bloque === "viajes" && !viajes) viajes = Array.from({ length: 12 }, (_, i) => Number(row[2 + i] ?? 0) || 0)
        if (bloque === "paletas") { const p = Number(row[2]); if (Number.isFinite(p) && p > 0) paletas = p }
      }
    }
    if (!viajes || viajes.every((v) => v === 0)) return { error: `No encontré la fila de viajes de "CERVEZAS CMQ Retornable" en la hoja ${nombreHoja}.` }
    const rows = viajes.map((v, i) => ({ anio, mes: i + 1, viajes: v, paletas_por_viaje: paletas, updated_by: profile.id, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from("dim_retornable_presupuesto").upsert(rows, { onConflict: "anio,mes" })
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: { viajes, paletasPorViaje: paletas } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarPlanDim(id: string): Promise<Result<true>> {
  try {
    await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase.from("dim_planes").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}
