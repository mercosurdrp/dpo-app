/**
 * «Cómo venimos» de Pampeana — los mismos 5 PI del tablero de Distribuciones
 * (DPO Entrega 2.1 · R2.1.1 y R2.1.4), calculados con las fuentes de acá.
 *
 * Distribuciones arma la tripulación con `orden_salida_camion_diario` y cruza
 * la ruta de Foxtrot por patente. En Pampeana no hay orden de salida cargada y
 * `foxtrot_routes.dominio` viene vacío, así que:
 *
 *   quién iba en cada camión-día → egreso TML (chofer/ayudantes, texto libre),
 *        salida programada (/salidas, por empleado_id) y checklist del día
 *        (chofer). Es la misma evidencia que usa «Mis Rechazos»; el mapeo fijo
 *        de fletero queda de respaldo sólo para camión-días sin dueño conocido.
 *   ruta de Foxtrot → persona   por `driver_name` (el chofer) y, vía la patente
 *        que ese chofer tuvo ese día, al resto de su tripulación.
 *
 * Los PI del EQUIPO se calculan igual que en la matinal de Distribución de
 * Pampeana, para que el número que ve el chofer sea el que se discute en la
 * reunión:
 *   asistencia pre-ruta  check-in en `reunion_preruta` de los que salieron
 *   TML                  promedio de `registros_vehiculos.tml_minutos` (egresos)
 *   entregas exitosas    Σ deliveries_successful / Σ total_deliveries, rutas
 *                        finalizadas (auto-indicadores-pampeana.ts)
 *   rechazo              HL rechazados / HL vendidos por `fecha_venta`
 *                        (indicador AUTO «Rechazos %» de reuniones.ts)
 *   clickeo              promedio de `driver_click_score`
 *
 * Por PERSONA el rechazo va en bultos sobre sus camión-días (el mismo número
 * que «Mis Rechazos»): las filas de rechazo no traen HL por camión confiable.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadResolucionGescom, traducirFilasGescom } from "@/lib/gescom/ventas-patente"
import { normTexto } from "@/lib/gescom/patente-chofer"

const PAGE = 1000

/** Motivos que el programa de incentivos NO le imputa a Entrega. */
export const MOTIVOS_NO_IMPUTABLES = ["ERROR DE PREVENTA", "SIN STOCK"]

/**
 * CD de Foxtrot sin reunión pre-ruta con check-in en la app: sus choferes nunca
 * marcan (Frías y Cordone, 0 check-ins desde agosto).
 */
const CDS_SIN_PRERUTA = ["pergamino"]

export type SeriePorFecha = Record<string, number | null>

export interface NumerosPersonaPampeana {
  empleado_id: string
  legajo: number | null
  nombre: string
  /** CD donde más rutas hizo en el mes (Foxtrot), null si no tuvo rutas. */
  cd: string | null
  /** "chofer" si manejó al menos un día del rango; si no, "ayudante". */
  rol: "chofer" | "ayudante"
  /** Días en que salió a la calle. */
  dias_con_ruta: number
  /** De esos días, en cuántos marcó la reunión pre-ruta. */
  dias_con_checkin: number
  /**
   * % de días con ruta en que marcó la pre-ruta. null en los CD sin reunión
   * pre-ruta con check-in (Pergamino): ahí un 0 sería un castigo, no un dato.
   */
  asistencia_preruta: number | null
  /** TML promedio de los egresos de sus camiones, en minutos. */
  tml: number | null
  entregas_ok: number | null
  /** % de rechazo en bultos de sus camión-días (todos los motivos). */
  rechazo: number | null
  /** Ídem sin ERROR DE PREVENTA ni SIN STOCK (el del programa de incentivos). */
  rechazo_imputable: number | null
  clickeo: number | null
  /** Rutas de Foxtrot atribuidas en el mes: con 1 o 2, entregas y clickeo dicen poco. */
  rutas_foxtrot: number
  bultos_entregados: number
}

export interface SeriesEquipoPampeana {
  asistencia_preruta: SeriePorFecha
  tml: SeriePorFecha
  entregas_ok: SeriePorFecha
  rechazo: SeriePorFecha
  clickeo: SeriePorFecha
}

interface EmpleadoRow {
  id: string
  legajo: number | null
  nombre: string
  sector: string | null
}
interface RegistroRow {
  fecha: string
  dominio: string | null
  chofer: string | null
  ayudante1: string | null
  ayudante2: string | null
  tml_minutos: number | null
}
interface SalidaRow {
  fecha: string
  patente: string | null
  chofer_empleado_id: string | null
  ayudante1_empleado_id: string | null
  ayudante2_empleado_id: string | null
}
interface RouteRow {
  route_id: string
  fecha: string
  dc_id: string | null
  driver_name: string | null
  is_finalized: boolean | null
  total_deliveries: number | null
  deliveries_successful: number | null
  driver_click_score: number | null
}
interface VentaRow {
  fecha: string
  ds_fletero_carga: string | null
  total_bultos: number | null
}
interface RechazoRow {
  fecha: string
  ds_fletero_carga: string | null
  bultos_rechazados: number | null
  ds_rechazo: string | null
}

async function fetchAll<T>(
  build: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(String((error as { message?: string }).message ?? error))
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

function normPatente(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "").trim()
}

/** Palabras de un nombre, sin acentos ni paréntesis: "CORDONE LUIS (LQ)" → CORDONE, LUIS, LQ. */
function tokens(nombre: string | null | undefined): Set<string> {
  return new Set(normTexto(nombre ?? "").match(/[A-Z]{2,}/g) ?? [])
}

/**
 * Resuelve el texto libre de un nombre (egreso TML, checklist, Foxtrot) al
 * empleado: dos palabras en común con su nombre o con su nombre de chofer
 * alcanzan ("FRIAS ANGEL" ↔ "FRIAS ANGEL ERMINDO"), y sólo si hay un único
 * candidato con el mejor puntaje — ante un empate no se adivina.
 */
function crearResolverNombre(
  empleados: EmpleadoRow[],
  nombreChoferPorEmpleado: Map<string, string>,
): (texto: string | null | undefined) => string | null {
  const candidatos = empleados.map((e) => ({
    id: e.id,
    tokens: [tokens(e.nombre), tokens(nombreChoferPorEmpleado.get(e.id))],
  }))
  const cache = new Map<string, string | null>()
  return (texto) => {
    const clave = normTexto(texto ?? "")
    if (!clave) return null
    const hit = cache.get(clave)
    if (hit !== undefined) return hit
    const t = tokens(clave)
    let mejor: string | null = null
    let mejorPuntaje = 1
    let empate = false
    for (const c of candidatos) {
      let puntaje = 0
      for (const set of c.tokens) {
        let comunes = 0
        for (const x of t) if (set.has(x)) comunes++
        puntaje = Math.max(puntaje, comunes)
      }
      if (puntaje > mejorPuntaje) {
        mejor = c.id
        mejorPuntaje = puntaje
        empate = false
      } else if (puntaje === mejorPuntaje && puntaje >= 2 && mejor !== c.id) {
        empate = true
      }
    }
    const res = empate ? null : mejor
    cache.set(clave, res)
    return res
  }
}

export interface ComoVenimosPampeanaData {
  equipo: SeriesEquipoPampeana
  personas: Map<string, NumerosPersonaPampeana>
}

/**
 * Serie diaria del equipo en [desdeSerie, hasta] y números por persona en
 * [desdePersonas, hasta]. Una sola pasada por la base para las dos cosas.
 */
export async function buildComoVenimosPampeana(
  admin: SupabaseClient,
  desdePersonas: string,
  desdeSerie: string,
  hasta: string,
): Promise<ComoVenimosPampeanaData> {
  const desde = desdePersonas < desdeSerie ? desdePersonas : desdeSerie

  const [
    empleados,
    choferMaps,
    fleteroMaps,
    registros,
    salidas,
    routes,
    ventasRaw,
    rechazosRaw,
    rechazosHl,
    ventasHl,
    checkins,
    resolucion,
  ] = await Promise.all([
    fetchAll<EmpleadoRow>((a, b) =>
      admin.from("empleados").select("id, legajo, nombre, sector").eq("activo", true).order("id").range(a, b),
    ),
    fetchAll<{ empleado_id: string; nombre_chofer: string | null }>((a, b) =>
      admin.from("mapeo_empleado_chofer").select("empleado_id, nombre_chofer").order("empleado_id").range(a, b),
    ),
    fetchAll<{ empleado_id: string; ds_fletero_carga: string | null }>((a, b) =>
      admin.from("mapeo_empleado_fletero").select("empleado_id, ds_fletero_carga").order("empleado_id").range(a, b),
    ),
    fetchAll<RegistroRow>((a, b) =>
      admin
        .from("registros_vehiculos")
        .select("fecha, dominio, chofer, ayudante1, ayudante2, tml_minutos")
        .eq("tipo", "egreso")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("id")
        .range(a, b),
    ),
    fetchAll<SalidaRow>((a, b) =>
      admin
        .from("salidas_programadas")
        .select("fecha, patente, chofer_empleado_id, ayudante1_empleado_id, ayudante2_empleado_id")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("id")
        .range(a, b),
    ),
    fetchAll<RouteRow>((a, b) =>
      admin
        .from("foxtrot_routes")
        .select(
          "route_id, fecha, dc_id, driver_name, is_finalized, total_deliveries, deliveries_successful, driver_click_score",
        )
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("route_id")
        .range(a, b),
    ),
    fetchAll<VentaRow>((a, b) =>
      admin
        .from("ventas_diarias")
        .select("fecha, ds_fletero_carga, total_bultos")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("id")
        .range(a, b),
    ),
    fetchAll<RechazoRow>((a, b) =>
      admin
        .from("rechazos")
        .select("fecha, ds_fletero_carga, bultos_rechazados, ds_rechazo")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("id")
        .range(a, b),
    ),
    // Rechazo del equipo: HL por fecha de venta, como la matinal.
    fetchAll<{ fecha_venta: string; hl_rechazados: number | null }>((a, b) =>
      admin
        .from("rechazos")
        .select("fecha_venta, hl_rechazados")
        .gte("fecha_venta", desdeSerie)
        .lte("fecha_venta", hasta)
        .order("fecha_venta")
        .order("id")
        .range(a, b),
    ),
    fetchAll<{ fecha: string; total_hl: number | null }>((a, b) =>
      admin
        .from("ventas_diarias")
        .select("fecha, total_hl")
        .gte("fecha", desdeSerie)
        .lte("fecha", hasta)
        .order("fecha")
        .order("id")
        .range(a, b),
    ),
    fetchAll<{ legajo: number; fecha: string }>((a, b) =>
      admin
        .from("reunion_preruta")
        .select("legajo, fecha")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("id")
        .range(a, b),
    ),
    loadResolucionGescom(admin, desde, hasta),
  ])

  const empleadoPorId = new Map(empleados.map((e) => [e.id, e]))
  const nombreChoferPorEmpleado = new Map<string, string>()
  for (const m of choferMaps) {
    if (m.nombre_chofer && !nombreChoferPorEmpleado.has(m.empleado_id)) {
      nombreChoferPorEmpleado.set(m.empleado_id, m.nombre_chofer)
    }
  }
  const resolver = crearResolverNombre(empleados, nombreChoferPorEmpleado)

  // ── 1. Tripulación de cada camión-día ("fecha|PATENTE") ──
  const tripulacion = new Map<string, Map<string, "chofer" | "ayudante">>()
  const sumar = (clave: string, empleadoId: string | null, rol: "chofer" | "ayudante") => {
    if (!empleadoId || !empleadoPorId.has(empleadoId)) return
    let t = tripulacion.get(clave)
    if (!t) {
      t = new Map()
      tripulacion.set(clave, t)
    }
    // Si figura de chofer en alguna fuente, manda chofer.
    if (t.get(empleadoId) !== "chofer") t.set(empleadoId, rol)
  }

  const tmlPorCamionDia = new Map<string, number[]>()
  const tmlPorFecha = new Map<string, number[]>()
  for (const r of registros) {
    if (r.tml_minutos != null && Number.isFinite(r.tml_minutos)) {
      const arr = tmlPorFecha.get(r.fecha) ?? []
      arr.push(r.tml_minutos)
      tmlPorFecha.set(r.fecha, arr)
    }
    const patente = normPatente(r.dominio)
    if (!patente) continue
    const clave = `${r.fecha}|${patente}`
    if (r.tml_minutos != null && Number.isFinite(r.tml_minutos)) {
      const arr = tmlPorCamionDia.get(clave) ?? []
      arr.push(r.tml_minutos)
      tmlPorCamionDia.set(clave, arr)
    }
    sumar(clave, resolver(r.chofer), "chofer")
    sumar(clave, resolver(r.ayudante1), "ayudante")
    sumar(clave, resolver(r.ayudante2), "ayudante")
  }
  for (const s of salidas) {
    const patente = normPatente(s.patente)
    if (!patente) continue
    const clave = `${s.fecha}|${patente}`
    sumar(clave, s.chofer_empleado_id, "chofer")
    sumar(clave, s.ayudante1_empleado_id, "ayudante")
    sumar(clave, s.ayudante2_empleado_id, "ayudante")
  }
  for (const [key, dominio] of resolucion.checklists) {
    const sep = key.indexOf("|")
    sumar(`${key.slice(0, sep)}|${normPatente(dominio)}`, resolver(key.slice(sep + 1)), "chofer")
  }

  // Ventas y rechazos por camión-día (Gestión traducida a patente, venta directa afuera).
  const ventas = traducirFilasGescom(ventasRaw, resolucion)
  const rechazos = traducirFilasGescom(rechazosRaw, resolucion)
  const bultosPorCamionDia = new Map<string, number>()
  for (const v of ventas) {
    const patente = normPatente(v.ds_fletero_carga)
    const b = Number(v.total_bultos ?? 0)
    if (!patente || !Number.isFinite(b)) continue
    const clave = `${v.fecha}|${patente}`
    bultosPorCamionDia.set(clave, (bultosPorCamionDia.get(clave) ?? 0) + b)
  }
  const rechPorCamionDia = new Map<string, { total: number; imputable: number }>()
  for (const r of rechazos) {
    const patente = normPatente(r.ds_fletero_carga)
    const b = Number(r.bultos_rechazados ?? 0)
    if (!patente || !Number.isFinite(b)) continue
    const clave = `${r.fecha}|${patente}`
    const acc = rechPorCamionDia.get(clave) ?? { total: 0, imputable: 0 }
    acc.total += b
    if (!MOTIVOS_NO_IMPUTABLES.includes((r.ds_rechazo ?? "").trim().toUpperCase())) acc.imputable += b
    rechPorCamionDia.set(clave, acc)
  }

  // Respaldo: el mapeo fijo de fletero, sólo para camión-días con venta y sin
  // nadie conocido arriba (el mapeo no tiene vigencia: aplicarlo siempre le
  // cobraba a cada uno los días en que el camión lo manejó otro).
  for (const m of fleteroMaps) {
    const patente = normPatente(m.ds_fletero_carga)
    if (!patente) continue
    for (const clave of bultosPorCamionDia.keys()) {
      if (clave.endsWith(`|${patente}`) && !tripulacion.has(clave)) sumar(clave, m.empleado_id, "chofer")
    }
  }

  // "Salió a la calle" = camión-día con venta o con egreso. Un checklist solo
  // (autoelevadores, un camión que no salió) no cuenta como día de ruta.
  const salio = (clave: string) => bultosPorCamionDia.has(clave) || tmlPorCamionDia.has(clave)

  // Patente de cada chofer por día, para llevar la ruta de Foxtrot a su camión.
  const patentePorChoferDia = new Map<string, string>()
  for (const [clave, t] of tripulacion) {
    if (!salio(clave)) continue
    const [fecha, patente] = clave.split("|")
    for (const [id, rol] of t) if (rol === "chofer") patentePorChoferDia.set(`${fecha}|${id}`, patente)
  }

  // ── 2. Rutas de Foxtrot → personas ──
  const rutasPorPersona = new Map<string, RouteRow[]>()
  for (const r of routes) {
    const choferId = resolver(r.driver_name)
    if (!choferId) continue
    const patente = patentePorChoferDia.get(`${r.fecha}|${choferId}`)
    const ids = patente ? Array.from(tripulacion.get(`${r.fecha}|${patente}`)?.keys() ?? []) : [choferId]
    for (const id of ids) {
      const arr = rutasPorPersona.get(id) ?? []
      arr.push(r)
      rutasPorPersona.set(id, arr)
    }
  }

  // ── 3. Números por persona (desdePersonas → hasta) ──
  const checkinSet = new Set(checkins.map((c) => `${c.legajo}|${c.fecha}`))
  const camionDiasPorPersona = new Map<string, { clave: string; rol: "chofer" | "ayudante" }[]>()
  for (const [clave, t] of tripulacion) {
    if (!salio(clave)) continue
    for (const [id, rol] of t) {
      const arr = camionDiasPorPersona.get(id) ?? []
      arr.push({ clave, rol })
      camionDiasPorPersona.set(id, arr)
    }
  }

  // CD de cada persona: donde más rutas hizo en el rango.
  const cdPorPersona = new Map<string, string | null>()
  for (const [id, rs] of rutasPorPersona) {
    const n = new Map<string, number>()
    for (const r of rs) if (r.dc_id) n.set(r.dc_id, (n.get(r.dc_id) ?? 0) + 1)
    let mejor: string | null = null
    for (const [dc, c] of n) if (!mejor || c > (n.get(mejor) ?? 0)) mejor = dc
    cdPorPersona.set(id, mejor)
  }
  const sinPreruta = (id: string) => CDS_SIN_PRERUTA.includes(cdPorPersona.get(id) ?? "")

  // Días en la calle: camión-días con venta/egreso y, además, días con ruta de
  // Foxtrot (un chofer sin patente conocida ese día igual salió).
  const diasPorPersona = new Map<string, Set<string>>()
  const anotarDia = (id: string, fecha: string) => {
    const d = diasPorPersona.get(id) ?? new Set<string>()
    d.add(fecha)
    diasPorPersona.set(id, d)
  }
  for (const [id, cds] of camionDiasPorPersona) for (const { clave } of cds) anotarDia(id, clave.slice(0, 10))
  for (const [id, rs] of rutasPorPersona) for (const r of rs) anotarDia(id, r.fecha)

  const personas = new Map<string, NumerosPersonaPampeana>()
  const salieronPorFecha = new Map<string, Set<string>>()
  for (const [id, diasTodos] of diasPorPersona) {
    const e = empleadoPorId.get(id)!
    if (!sinPreruta(id)) {
      for (const fecha of diasTodos) {
        const s = salieronPorFecha.get(fecha) ?? new Set<string>()
        s.add(id)
        salieronPorFecha.set(fecha, s)
      }
    }

    const cds = camionDiasPorPersona.get(id) ?? []
    const delMes = cds.filter((c) => c.clave.slice(0, 10) >= desdePersonas)
    const dias = new Set([...diasTodos].filter((d) => d >= desdePersonas))
    if (dias.size === 0) continue
    let checkinDias = 0
    for (const d of dias) if (e.legajo != null && checkinSet.has(`${e.legajo}|${d}`)) checkinDias++
    const rutasMes = (rutasPorPersona.get(id) ?? []).filter((r) => r.fecha >= desdePersonas)

    const tmls: number[] = []
    let bultos = 0
    let rech = 0
    let rechImp = 0
    for (const { clave } of delMes) {
      tmls.push(...(tmlPorCamionDia.get(clave) ?? []))
      bultos += bultosPorCamionDia.get(clave) ?? 0
      const r = rechPorCamionDia.get(clave)
      if (r) {
        rech += r.total
        rechImp += r.imputable
      }
    }

    let delTotal = 0
    let delOk = 0
    let clickSum = 0
    let clickN = 0
    for (const r of rutasMes) {
      if (r.is_finalized === true) {
        delTotal += r.total_deliveries ?? 0
        delOk += r.deliveries_successful ?? 0
      }
      if (r.driver_click_score != null && Number.isFinite(r.driver_click_score)) {
        clickSum += r.driver_click_score
        clickN++
      }
    }

    // Denominador del rechazo: lo que salió (entregado + rechazado), como Mis Rechazos.
    const denom = bultos
    personas.set(id, {
      empleado_id: id,
      legajo: e.legajo,
      nombre: e.nombre,
      cd: cdPorPersona.get(id) ?? null,
      // Manejó si figura de chofer en su camión o si Foxtrot lo tiene de driver.
      rol:
        delMes.some((c) => c.rol === "chofer") || rutasMes.some((r) => resolver(r.driver_name) === id)
          ? "chofer"
          : "ayudante",
      dias_con_ruta: dias.size,
      dias_con_checkin: checkinDias,
      asistencia_preruta: sinPreruta(id) ? null : round1((100 * checkinDias) / dias.size),
      tml: tmls.length > 0 ? Math.round(tmls.reduce((a, b) => a + b, 0) / tmls.length) : null,
      entregas_ok: delTotal > 0 ? round1((100 * delOk) / delTotal) : null,
      rechazo: denom > 0 ? round2((100 * rech) / denom) : null,
      rechazo_imputable: denom > 0 ? round2((100 * rechImp) / denom) : null,
      clickeo: clickN > 0 ? round1(clickSum / clickN) : null,
      rutas_foxtrot: rutasMes.length,
      bultos_entregados: Math.round(bultos),
    })
  }

  // ── 4. Serie del equipo (desdeSerie → hasta) ──
  const equipo: SeriesEquipoPampeana = {
    asistencia_preruta: {},
    tml: {},
    entregas_ok: {},
    rechazo: {},
    clickeo: {},
  }
  for (const [fecha, ids] of salieronPorFecha) {
    if (fecha < desdeSerie) continue
    let conCheckin = 0
    for (const id of ids) {
      const legajo = empleadoPorId.get(id)?.legajo
      if (legajo != null && checkinSet.has(`${legajo}|${fecha}`)) conCheckin++
    }
    equipo.asistencia_preruta[fecha] = ids.size > 0 ? round1((100 * conCheckin) / ids.size) : null
  }
  for (const [fecha, arr] of tmlPorFecha) {
    if (fecha < desdeSerie) continue
    equipo.tml[fecha] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
  }
  const fx = new Map<string, { tot: number; ok: number; cs: number; cn: number }>()
  for (const r of routes) {
    if (r.fecha < desdeSerie) continue
    const a = fx.get(r.fecha) ?? { tot: 0, ok: 0, cs: 0, cn: 0 }
    if (r.is_finalized === true) {
      a.tot += r.total_deliveries ?? 0
      a.ok += r.deliveries_successful ?? 0
    }
    if (r.driver_click_score != null && Number.isFinite(r.driver_click_score)) {
      a.cs += r.driver_click_score
      a.cn++
    }
    fx.set(r.fecha, a)
  }
  for (const [fecha, a] of fx) {
    if (a.tot > 0) equipo.entregas_ok[fecha] = round1((100 * a.ok) / a.tot)
    if (a.cn > 0) equipo.clickeo[fecha] = round1(a.cs / a.cn)
  }
  const hlRech = new Map<string, number>()
  for (const r of rechazosHl) {
    const hl = Number(r.hl_rechazados ?? 0)
    if (Number.isFinite(hl)) hlRech.set(r.fecha_venta, (hlRech.get(r.fecha_venta) ?? 0) + hl)
  }
  const hlVenta = new Map<string, number>()
  for (const v of ventasHl) {
    const hl = Number(v.total_hl ?? 0)
    if (Number.isFinite(hl)) hlVenta.set(v.fecha, (hlVenta.get(v.fecha) ?? 0) + hl)
  }
  for (const [fecha, venta] of hlVenta) {
    if (venta > 0) equipo.rechazo[fecha] = round2((100 * (hlRech.get(fecha) ?? 0)) / venta)
  }

  return { equipo, personas }
}
