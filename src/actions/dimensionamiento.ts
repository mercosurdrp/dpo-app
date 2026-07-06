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

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

/** Promedio y pico (sobre valores > 0) de un Map fecha→valor. */
function statsPorDia(m: Map<string, number>): { prom: number; pico: number; dias: number } {
  const vals = [...m.values()].filter((v) => v > 0)
  if (!vals.length) return { prom: 0, pico: 0, dias: 0 }
  return { prom: vals.reduce((s, x) => s + x, 0) / vals.length, pico: Math.max(...vals), dias: vals.length }
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
}

export interface RolFte {
  volumenProm: number          // bultos/día (pickeros) o pallets/día (maquinistas)
  volumenPico: number
  productividad: number         // bul/HH (pickeros) o pal/HH (maquinistas)
  diasConDatos: number
  fteNecesariosProm: number
  fteNecesariosPico: number
  dotacion: number
  dotacionEfectiva: number      // dotación × (1 − ausentismo): contra esto se compara
  utilizacion: number           // % del turno aplicado a la tarea (0–1)
  capDiariaFte: number          // capacidad efectiva por persona/día = prod × horas × utilización
}

export interface AlmacenData {
  mes: string
  pickeros: RolFte
  clasificadores: RolFte       // envases; se dimensiona sobre el PICO de paletas/día
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
  enTaller: boolean
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
  indice: number          // hl / hlBase
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
  prodH: number            // productividad horaria del rol (para derivar horas extra en el modal)
}
// Flota: por recurso (camiones/choferes/ayudantes), dotación fija → días/mes que requieren refuerzo.
export interface ProyeccionFlotaRol {
  rol: string                    // "Camiones" | "Choferes" | "Ayudantes"
  dotacion: number
  tripulacion: number            // unidades del recurso por camión (camiones = 1)
  diasRefuerzo: number[]         // por mes: días con necesarios > dotación
  picoNecesario: number[]        // por mes: necesarios el día más cargado
  segundaVueltaMeses: boolean[]  // por mes: algún día supera los camiones disponibles (2ª vuelta obligada)
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
}

// camiones necesarios para un volumen CEq, por zona: máx(mínimo de cobertura, volumen×peso ÷ capacidad).
function camionesPorZonas(volCeq: number, zonas: ZonaReparto[], capCamionViaje: number): number {
  if (capCamionViaje <= 0 || zonas.length === 0) return 0
  return zonas.reduce((s, z) => s + Math.max(z.camiones_minimos, Math.ceil((volCeq * z.peso) / capCamionViaje)), 0)
}

export interface DimData {
  config: DimConfig
  objetivos: KpiObjetivo[]
  flota: FlotaUnidad[]
  zonas: ZonaReparto[]
  capacidadInstaladaDiaria: number // CEq: Σ capacidad_ceq (disponibles) × viajes_por_dia
  unidadesDisponibles: number
  metricas: MetricasDistribucion | null
  metricasError: string | null
  almacen: AlmacenData | null
  almacenError: string | null
  reparto: RepartoData | null
  repartoError: string | null
  proyeccion: ProyeccionData | null
  proyeccionError: string | null
  planes: DimPlan[]
}

// ─── Carga principal ────────────────────────────────────────────────────────

export async function getDatosDimensionamiento(): Promise<Result<DimData>> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()

    const [configRes, objetivosRes, capacidadRes, vehiculosRes, tallerRes, planesRes, zonasRes] =
      await Promise.all([
        supabase.from("dim_config").select("peso_kg_bulto, dias_operativos_mes, viajes_por_dia, factor_ceq_bulto, prod_bul_hh, horas_turno, dotacion_almacen, prod_pal_h, dotacion_maquinistas, factor_retorno_distrib, util_pickeros, util_maquinistas, choferes_por_camion, ayudantes_por_camion, dotacion_choferes, dotacion_ayudantes, peso_lun, peso_mar, peso_mie, peso_jue, peso_vie, peso_sab, prod_clasif_pal_h, util_clasif, dotacion_clasif, prod_reempaque_bul_hh, util_reempaque, dotacion_reempaque, ausentismo_almacen, ausentismo_reparto").eq("id", 1).maybeSingle(),
        supabase.from("dim_kpi_objetivos").select("kpi, nombre, unidad, objetivo, mejor_si").order("kpi"),
        supabase.from("dim_flota_capacidad").select("dominio, capacidad_ceq, capacidad_kg, activo"),
        supabase.from("catalogo_vehiculos").select("dominio, descripcion, tipo, active").eq("sector", "distribucion").eq("active", true),
        supabase.from("mantenimiento_realizados").select("dominio").eq("estado", "en_taller"),
        supabase.from("dim_planes").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("dim_zonas_reparto").select("id, zona, peso, camiones_minimos, orden").order("orden"),
      ])

    const zonas: ZonaReparto[] = (zonasRes.data ?? []).map((z) => ({
      id: z.id as string, zona: z.zona as string,
      peso: Number(z.peso ?? 0), camiones_minimos: Number(z.camiones_minimos ?? 1), orden: Number(z.orden ?? 0),
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
    }
    // Dotación efectiva de almacén: descuenta el ausentismo promedio (1 decimal).
    const efAlmacen = (dot: number) => Math.round(dot * (1 - config.ausentismo_almacen) * 10) / 10
    const objetivos = (objetivosRes.data ?? []) as KpiObjetivo[]

    const capMap = new Map(
      (capacidadRes.data ?? []).map((c) => [c.dominio as string, c]),
    )
    const enTaller = new Set((tallerRes.data ?? []).map((t) => t.dominio as string))

    const flota: FlotaUnidad[] = (vehiculosRes.data ?? []).map((v) => {
      const cap = capMap.get(v.dominio as string)
      return {
        dominio: v.dominio as string,
        descripcion: (v.descripcion as string | null) ?? null,
        tipo: (v.tipo as string | null) ?? null,
        capacidad_ceq: Number(cap?.capacidad_ceq ?? 0),
        capacidad_kg: cap?.capacidad_kg != null ? Number(cap.capacidad_kg) : null,
        activo: cap ? Boolean(cap.activo) : true,
        enTaller: enTaller.has(v.dominio as string),
      }
    })

    const disponibles = flota.filter((u) => u.activo && !u.enTaller)
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
    const { data: cierres, error: cierresErr } = await supabase
      .from("ruteo_cierres")
      .select("fecha, pergamino_bultos, pergamino_clientes, ramallo_bultos, ramallo_clientes, bultos_no_ruteados")
      .eq("estado", "cerrado")
      .gte("fecha", desde)
      .order("fecha", { ascending: false })

    if (cierresErr) {
      metricasError = cierresErr.message
    } else if (cierres && cierres.length > 0) {
      const filas = cierres.map((c) => {
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
      // capUnidad = capacidad de un camión por día (capacidadInstaladaDiaria ya incluye viajes/día).
      const capUnidad = disponibles.length > 0 ? capacidadInstaladaDiaria / disponibles.length : 0
      // Camiones por COBERTURA DE ZONAS: máx(mínimo, volumen×peso ÷ capacidad) por zona; fallback a capacidad pura.
      const camionesNec = (vol: number) => zonas.length > 0
        ? camionesPorZonas(vol, zonas, capUnidad)
        : (capUnidad > 0 ? Math.ceil(vol / capUnidad) : 0)
      metricas = {
        mes: mesAA,
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

    // Almacén (FTE): pickeros (bultos procesados) + maquinistas (pallets a procesar).
    let almacen: AlmacenData | null = null
    let almacenError: string | null = null
    try {
      // Pickeros: bultos/día de ocupacion_bodega_diaria
      const { data: ob } = await supabase.from("ocupacion_bodega_diaria").select("fecha, bultos_total").gte("fecha", desde)
      const bultosPorDia = new Map<string, number>()
      for (const r of ob ?? []) {
        const k = r.fecha as string
        bultosPorDia.set(k, (bultosPorDia.get(k) ?? 0) + Number(r.bultos_total ?? 0))
      }
      const pk = statsPorDia(bultosPorDia)
      const capPicker = config.prod_bul_hh * config.horas_turno * config.util_pickeros
      const pickeros: RolFte = {
        volumenProm: Math.round(pk.prom), volumenPico: Math.round(pk.pico), productividad: config.prod_bul_hh,
        diasConDatos: pk.dias,
        fteNecesariosProm: capPicker > 0 ? Math.ceil(pk.prom / capPicker) : 0,
        fteNecesariosPico: capPicker > 0 ? Math.ceil(pk.pico / capPicker) : 0,
        dotacion: config.dotacion_almacen,
        dotacionEfectiva: efAlmacen(config.dotacion_almacen),
        utilizacion: config.util_pickeros,
        capDiariaFte: Math.round(capPicker),
      }

      // Maquinistas: pallets acarreo (recepcion_acarreos) + carga distribución (carga-camiones)
      const acarreoPorDia = new Map<string, number>()
      try {
        const acarreo = createAcarreoClient()
        if (acarreo) {
          const { data: rec } = await acarreo.from("recepcion_acarreos").select("fecha, pallets").gte("fecha", desde)
          for (const r of rec ?? []) {
            const k = r.fecha as string
            acarreoPorDia.set(k, (acarreoPorDia.get(k) ?? 0) + Number(r.pallets ?? 0))
          }
        }
      } catch {
        // acarreo-rdf no configurado → maquinistas solo con carga de distribución
      }
      const cargaPorDia = new Map<string, number>()
      for (const r of await fetchDepositoFilas("carga-camiones")) {
        const fch = String((r as { fecha?: string }).fecha ?? "")
        if (fch >= desde) cargaPorDia.set(fch, (cargaPorDia.get(fch) ?? 0) + Number((r as { pallets?: number }).pallets ?? 0))
      }
      const palPorDia = new Map<string, number>()
      const acaVals: number[] = [], cargaVals: number[] = []
      for (const fch of new Set([...acarreoPorDia.keys(), ...cargaPorDia.keys()])) {
        const aca = acarreoPorDia.get(fch) ?? 0
        const car = cargaPorDia.get(fch) ?? 0
        palPorDia.set(fch, aca + car * (1 + config.factor_retorno_distrib))
        acaVals.push(aca); cargaVals.push(car)
      }
      const mq = statsPorDia(palPorDia)
      const capMaq = config.prod_pal_h * config.horas_turno * config.util_maquinistas
      const avgArr = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0)
      const maquinistas = {
        volumenProm: Math.round(mq.prom), volumenPico: Math.round(mq.pico), productividad: config.prod_pal_h,
        diasConDatos: mq.dias,
        fteNecesariosProm: capMaq > 0 ? Math.ceil(mq.prom / capMaq) : 0,
        fteNecesariosPico: capMaq > 0 ? Math.ceil(mq.pico / capMaq) : 0,
        dotacion: config.dotacion_maquinistas,
        dotacionEfectiva: efAlmacen(config.dotacion_maquinistas),
        utilizacion: config.util_maquinistas,
        capDiariaFte: Math.round(capMaq),
        palAcarreoProm: avgArr(acaVals),
        palCargaProm: avgArr(cargaVals),
        factorRetorno: config.factor_retorno_distrib,
      }

      // Clasificadores: paletas/día de clasificacion_envases. Se dimensiona sobre el PICO.
      const { data: clz } = await supabase.from("clasificacion_envases").select("fecha, pallets_total").gte("fecha", desde)
      const palClasifPorDia = new Map<string, number>()
      for (const r of clz ?? []) {
        const k = r.fecha as string
        palClasifPorDia.set(k, (palClasifPorDia.get(k) ?? 0) + Number(r.pallets_total ?? 0))
      }
      const cl = statsPorDia(palClasifPorDia)
      const capClasif = config.prod_clasif_pal_h * config.horas_turno * config.util_clasif
      const clasificadores: RolFte = {
        volumenProm: Math.round(cl.prom), volumenPico: Math.round(cl.pico), productividad: config.prod_clasif_pal_h,
        diasConDatos: cl.dias,
        // dimensiona contra el pico (pedido del usuario): prom y pico usan el pico.
        fteNecesariosProm: capClasif > 0 ? Math.ceil(cl.pico / capClasif) : 0,
        fteNecesariosPico: capClasif > 0 ? Math.ceil(cl.pico / capClasif) : 0,
        dotacion: config.dotacion_clasif,
        dotacionEfectiva: efAlmacen(config.dotacion_clasif),
        utilizacion: config.util_clasif,
        capDiariaFte: Math.round(capClasif),
      }

      // Reempaque (tareas generales): bultos/día de deposito-esteban /api/reempaque/diario.
      const reJson = await fetchDepositoJson(`/api/reempaque/diario?mes=${hoy.getMonth() + 1}&anio=${hoy.getFullYear()}`)
      const reempaquePorDia = new Map<string, number>()
      for (const r of (reJson?.diario as Array<{ fecha?: string; bultos?: number }> | undefined) ?? []) {
        const b = Number(r.bultos ?? 0)
        if (b > 0 && String(r.fecha ?? "") >= desde) reempaquePorDia.set(String(r.fecha), b)
      }
      const re = statsPorDia(reempaquePorDia)
      const capReempaque = config.prod_reempaque_bul_hh * config.horas_turno * config.util_reempaque
      const reempaque: RolFte = {
        volumenProm: Math.round(re.prom), volumenPico: Math.round(re.pico), productividad: config.prod_reempaque_bul_hh,
        diasConDatos: re.dias,
        fteNecesariosProm: capReempaque > 0 ? Math.ceil(re.prom / capReempaque) : 0,
        fteNecesariosPico: capReempaque > 0 ? Math.ceil(re.pico / capReempaque) : 0,
        dotacion: config.dotacion_reempaque,
        dotacionEfectiva: efAlmacen(config.dotacion_reempaque),
        utilizacion: config.util_reempaque,
        capDiariaFte: Math.round(capReempaque),
      }

      if (pk.dias > 0 || mq.dias > 0 || cl.dias > 0 || re.dias > 0)
        almacen = { mes: mesAA, pickeros, clasificadores, reempaque, maquinistas }
    } catch (e) {
      almacenError = e instanceof Error ? e.message : "Error almacén"
    }

    // Reparto (FTE flota/entrega): necesarios = camiones necesarios × tripulación;
    // dotación actual = FTE promedio real de dpo-app (registros_vehiculos, egresos).
    let reparto: RepartoData | null = null
    let repartoError: string | null = null
    try {
      const { data: regs } = await supabase
        .from("registros_vehiculos")
        .select("fecha, chofer, ayudante1, ayudante2")
        .eq("tipo", "egreso")
        .gte("fecha", desde)
      const choByDia = new Map<string, Set<string>>()
      const ayuByDia = new Map<string, Set<string>>()
      for (const r of regs ?? []) {
        const k = r.fecha as string
        const cho = String(r.chofer ?? "").trim()
        if (cho) (choByDia.get(k) ?? choByDia.set(k, new Set()).get(k)!).add(cho)
        for (const a of [r.ayudante1, r.ayudante2]) {
          const ay = String(a ?? "").trim()
          if (ay) (ayuByDia.get(k) ?? ayuByDia.set(k, new Set()).get(k)!).add(ay)
        }
      }
      const sizes = (m: Map<string, Set<string>>) => [...m.values()].map((s) => s.size)
      const avgN = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
      const maxN = (a: number[]) => (a.length ? Math.max(...a) : 0)
      const choC = sizes(choByDia), ayuC = sizes(ayuByDia)
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

    // Proyección de dotación vs volumen futuro (HL/mes presupuesto). Escala los necesarios
    // de cada recurso por el índice hl_mes/hl_mes_actual y compara con la dotación fija.
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
      if (hlBase > 0) {
        const meses: ProyeccionMes[] = []
        for (let m = mesActual + 1; m <= 12; m++) {
          const v = hlPorMes.get(m)
          if (v && v.hl > 0) {
            // escenario: el % de ajuste del mes escala el HL del presupuesto (y por lo tanto el índice)
            const hl = v.hl * (1 + v.pct / 100)
            meses.push({ mes: `${anioActual}-${String(m).padStart(2, "0")}`, hl, hlPresupuesto: v.hl, ajustePct: v.pct, indice: hl / hlBase })
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
          const rolesAlm: Array<{ rol: string; rolFte?: RolFte; prodH: number; dotacion: number; unidad: string }> = [
            { rol: "Pickeros", rolFte: almacen?.pickeros, prodH: config.prod_bul_hh, dotacion: config.dotacion_almacen, unidad: "bultos" },
            { rol: "Clasificadores", rolFte: almacen?.clasificadores, prodH: config.prod_clasif_pal_h, dotacion: config.dotacion_clasif, unidad: "paletas" },
            { rol: "Tareas grales (reempaque)", rolFte: almacen?.reempaque, prodH: config.prod_reempaque_bul_hh, dotacion: config.dotacion_reempaque, unidad: "bultos" },
            { rol: "Maquinistas", rolFte: almacen?.maquinistas, prodH: config.prod_pal_h, dotacion: config.dotacion_maquinistas, unidad: "pallets" },
          ]
          const maxPesoNorm = Math.max(...pesos) / sumaPesos
          const almacenProy: ProyeccionAlmacenRol[] = rolesAlm.map((r) => {
            const volBase = r.rolFte?.volumenProm ?? 0                            // promedio diario (NO el pico)
            const dotEfectiva = efAlmacen(r.dotacion)                             // descuenta ausentismo
            const capDiaria = (r.rolFte?.capDiariaFte ?? 0) * dotEfectiva         // dotación efectiva
            const capPersona = r.rolFte?.capDiariaFte ?? 0                        // por persona
            const horasExtra: number[] = [], faltanPico: number[] = [], volPicoDia: number[] = []
            for (const mm of meses) {
              const volMes = volBase * mm.indice
              let hh = 0
              for (const wd of weekdaysDelMes(Number(mm.mes.split("-")[1]))) {
                const w = pesoDe(wd)
                if (w <= 0) continue
                const volDia = volMes * DIAS_SEMANA * w
                if (volDia > capDiaria && r.prodH > 0) hh += (volDia - capDiaria) / r.prodH
              }
              const pico = volMes * DIAS_SEMANA * maxPesoNorm                     // volumen del día más cargado (jue/vie)
              horasExtra.push(Math.round(hh * 10) / 10)
              volPicoDia.push(Math.round(pico))
              // personas extra para cubrir el pico SIN horas extra; redondeo normal (evita "falta 1" por excedente mínimo)
              faltanPico.push(capPersona > 0 ? Math.max(0, Math.round((pico - capDiaria) / capPersona)) : 0)
            }
            return { rol: r.rol, dotacion: r.dotacion, dotacionEfectiva: dotEfectiva, capDiaria: Math.round(capDiaria), capPersona: Math.round(capPersona), unidadVol: r.unidad, horasExtra, faltanPico, volPicoDia, volPromBase: Math.round(volBase), prodH: r.prodH }
          })

          // Flota → por recurso, días que requieren refuerzo (2ª vuelta o contratar).
          const dispCap = flota.filter((f) => f.activo && !f.enTaller && f.capacidad_ceq > 0)
          const camionesDisp = dispCap.length
          const capCamion = camionesDisp > 0 ? dispCap.reduce((s, f) => s + f.capacidad_ceq, 0) / camionesDisp : 0
          const viajes = config.viajes_por_dia || 1
          const capCamionViaje = capCamion * viajes
          const choferesDisp = Math.round(reparto?.choferes.dotacionProm ?? 0)
          const ayudantesDisp = Math.round(reparto?.ayudantes.dotacionProm ?? 0)
          const ceqProm = metricas?.volumenCeqPromedio ?? 0
          const recursosFlota = [
            { rol: "Camiones", dotacion: camionesDisp, tripulacion: 1 },
            { rol: "Choferes", dotacion: choferesDisp, tripulacion: config.choferes_por_camion },
            { rol: "Ayudantes", dotacion: ayudantesDisp, tripulacion: config.ayudantes_por_camion },
          ]
          const flotaProy: ProyeccionFlotaRol[] = recursosFlota.map((rf) => {
            const diasRefuerzo: number[] = [], picoNecesario: number[] = [], segundaVueltaMeses: boolean[] = []
            for (const mm of meses) {
              const ceqMes = ceqProm * mm.indice
              let dias = 0, pico = 0, sv = false
              for (const wd of weekdaysDelMes(Number(mm.mes.split("-")[1]))) {
                const w = pesoDe(wd)
                if (w <= 0) continue
                const ceqDia = ceqMes * DIAS_SEMANA * w
                const camionesDia = zonas.length > 0 ? camionesPorZonas(ceqDia, zonas, capCamionViaje) : (capCamionViaje > 0 ? Math.ceil(ceqDia / capCamionViaje) : 0)
                const necesarios = camionesDia * rf.tripulacion
                if (necesarios > rf.dotacion) dias++
                if (camionesDia > camionesDisp) sv = true
                pico = Math.max(pico, necesarios)
              }
              diasRefuerzo.push(dias); picoNecesario.push(pico); segundaVueltaMeses.push(sv)
            }
            return { rol: rf.rol, dotacion: rf.dotacion, tripulacion: rf.tripulacion, diasRefuerzo, picoNecesario, segundaVueltaMeses }
          })

          proyeccion = {
            mesBase: `${anioActual}-${String(mesActual).padStart(2, "0")}`,
            hlBase, hlBasePresupuesto, ajusteBasePct,
            meses, almacen: almacenProy, flota: flotaProy,
            flotaCeqPromBase: Math.round(ceqProm), capCamionViaje: Math.round(capCamionViaje),
            choferesDisp, camionesDisp, capCamion: Math.round(capCamion),
            pesos: pesos.map((x) => Math.round((x / sumaPesos) * 1000) / 1000),
          }
        }
      }
    } catch (e) {
      proyeccionError = e instanceof Error ? e.message : "Error proyección"
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

// Reemplaza el set completo de zonas de reparto (cobertura de flota).
export async function guardarZonasReparto(zonas: { zona: string; peso: number; camiones_minimos: number }[]): Promise<Result<true>> {
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
