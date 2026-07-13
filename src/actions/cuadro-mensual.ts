"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getCumplimientoMes } from "@/actions/sla"
import { buildWarehouseSerieDiaria } from "@/lib/warehouse/auto-indicadores"
import {
  INDICADORES,
  mesesEntre,
  mesActualARG,
  hoyARG,
  diasDelMes,
  resumirFila,
  type CuadroMensual,
  type CeldaMes,
  type FilaIndicador,
} from "@/lib/indicadores/cuadro-mensual"
import {
  clasificarFamilia,
  armarItems,
  ORDEN_FAMILIAS,
  type DetalleBultos,
  type DetalleRechazos,
  type DetalleRechazoItem,
} from "@/lib/indicadores/cuadro-mensual-detalle"
import { contarTripulacion } from "@/lib/tml/calculo"
import { esRutaLimpia } from "@/lib/foxtrot/tiempo-ruta-limpias"

type Result<T> = { data: T } | { error: string }

const INICIO = "2026-01"

// ── helpers locales ──
function avg(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/** Días enteros entre dos fechas "YYYY-MM-DD" (b - a). */
function diffDias(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  return Math.round((db - da) / (24 * 60 * 60 * 1000))
}

/**
 * Cuadro Mensual de Indicadores por Pilar (Pampeana), de enero al mes en curso.
 * Calcula todo automáticamente desde las fuentes existentes; los meses/celdas
 * sin dato quedan en null (gris en la UI). Solo Pampeana.
 */
export async function getCuadroMensualIndicadores(): Promise<
  Result<CuadroMensual>
> {
  await requireAuth()
  if (IS_MISIONES) {
    return {
      error: "El cuadro mensual de indicadores solo está disponible en Pampeana.",
    }
  }

  const mesActual = mesActualARG()
  const meses = mesesEntre(INICIO, mesActual)
  const hoy = hoyARG()
  const desde = `${INICIO}-01`
  const diasMesActual = diasDelMes(mesActual)
  const hasta = diasMesActual[diasMesActual.length - 1]

  // Acumulador: id de indicador -> { mesKey -> celda }.
  const celdas: Record<string, Record<string, CeldaMes>> = {}
  for (const def of INDICADORES) celdas[def.id] = {}

  const supabase = await createClient()

  // PostgREST corta cada request en 1000 filas. ventas_diarias y rechazos
  // superan eso en el rango ene→hoy (≈2k y ≈7k filas), así que hay que paginar
  // o las sumas quedan truncadas. Se ordena por id (uuid, único) para que la
  // paginación sea estable entre requests.
  async function ventasDiariasTodas() {
    const PAGE = 1000
    const rows: Array<{
      fecha: string
      origen: string | null
      total_hl: number | null
      total_bultos: number | null
    }> = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("ventas_diarias")
        .select("fecha, origen, total_hl, total_bultos")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }
  // Ventas NO distribuidas (mostrador FCVTA + presupuesto PRVTA) — tabla
  // propia, muy por debajo de 1000 filas/rango pero se pagina igual.
  async function ventasNoDistribuidasTodas() {
    const PAGE = 1000
    const rows: Array<{
      fecha: string
      ds_documento: string | null
      total_hl: number | null
      total_bultos: number | null
    }> = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("ventas_mostrador_diarias")
        .select("fecha, ds_documento, total_hl, total_bultos")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }
  // foxtrot_routes supera las 1000 filas en el rango ene→hoy desde el
  // backfill histórico (≈180 rutas/mes), así que también se pagina.
  async function foxtrotRoutesTodas() {
    const PAGE = 1000
    const rows: Array<{
      route_id: string
      fecha: string
      is_finalized: boolean | null
      tiempo_ruta_minutos: number | null
      raw_data: { started_timestamp?: string | null; finalized_timestamp?: string | null } | null
    }> = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("foxtrot_routes")
        .select("route_id, fecha, is_finalized, tiempo_ruta_minutos, raw_data")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("route_id", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }
  // Egresos de camión para el FTE de reparto (chofer + ayudantes por viaje):
  // ~200 filas/mes, pero un rango de varios meses supera el tope de 1000 de
  // PostgREST → paginar.
  async function egresosTodos() {
    const PAGE = 1000
    const rows: Array<{
      fecha: string
      ayudante1: string | null
      ayudante2: string | null
    }> = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("registros_vehiculos")
        .select("fecha, ayudante1, ayudante2")
        .eq("tipo", "egreso")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }
  async function rechazosTodos() {
    const PAGE = 1000
    const rows: Array<{ fecha_venta: string; hl_rechazados: number | null }> =
      []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("rechazos")
        .select("fecha_venta, hl_rechazados")
        .gte("fecha_venta", desde)
        .lte("fecha_venta", hasta)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }

  // ── Fetches de rango (en paralelo) ──
  // reportes_seguridad está muy por debajo de 1000 filas en el rango, así que
  // no necesita paginación.
  const [repRes, ventasRows, mostradorRows, rechazosRows, foxRows, egresosRows] = await Promise.all([
    // Seguridad: traigo TODO el histórico ≤ hasta (sin gte) para poder calcular
    // "días sin accidentes" mirando hacia atrás de cada mes.
    supabase
      .from("reportes_seguridad")
      .select("tipo_accidente, fecha")
      .lte("fecha", hasta)
      .order("fecha", { ascending: true }),
    ventasDiariasTodas(),
    ventasNoDistribuidasTodas(),
    rechazosTodos(),
    foxtrotRoutesTodas(),
    egresosTodos(),
  ])

  // ── SEGURIDAD ──
  const reportes = (repRes.data ?? []) as Array<{
    tipo_accidente: string | null
    fecha: string
  }>
  const ltiFechas = reportes
    .filter((r) => (r.tipo_accidente ?? "").toLowerCase() === "lti")
    .map((r) => r.fecha)
    .sort()

  for (const mes of meses) {
    const dias = diasDelMes(mes)
    const primero = dias[0]
    const esActual = mes === mesActual
    const corte = esActual ? hoy : dias[dias.length - 1]

    let lti = 0
    let tri = 0
    for (const r of reportes) {
      if (r.fecha < primero || r.fecha > corte) continue
      const ta = (r.tipo_accidente ?? "").toLowerCase()
      if (ta === "lti") lti++
      if (ta === "lti" || ta === "mdi" || ta === "mti") tri++
    }
    celdas.lti[mes] = { mes, valor: lti, parcial: esActual }
    celdas.tri[mes] = { mes, valor: tri, parcial: esActual }

    // Días sin accidentes (LTI) al corte: corte − último LTI ≤ corte.
    // Si nunca hubo LTI, se cuenta desde el inicio del período (2026-01-01).
    let ultimoLti: string | null = null
    for (let i = ltiFechas.length - 1; i >= 0; i--) {
      if (ltiFechas[i] <= corte) {
        ultimoLti = ltiFechas[i]
        break
      }
    }
    const ref = ultimoLti ?? `${INICIO}-01`
    celdas.dias_sin_acc[mes] = {
      mes,
      valor: Math.max(0, diffDias(ref, corte)),
      parcial: esActual,
    }
  }

  // ── ENTREGA: HL distribuidos + % rechazo (de los fetches de rango) ──
  const ventasHlPorMes: Record<string, number> = {}
  const ventasBultosPorMes: Record<string, number> = {}
  // Solo origen='chess' de lo distribuido — base de "facturados Chess".
  const chessDistHlPorMes: Record<string, number> = {}
  const chessDistBultosPorMes: Record<string, number> = {}
  for (const v of ventasRows) {
    const mes = v.fecha.slice(0, 7)
    const hl = Number(v.total_hl ?? 0)
    if (Number.isFinite(hl)) {
      ventasHlPorMes[mes] = (ventasHlPorMes[mes] ?? 0) + hl
      if (v.origen === "chess")
        chessDistHlPorMes[mes] = (chessDistHlPorMes[mes] ?? 0) + hl
    }
    const bultos = Number(v.total_bultos ?? 0)
    if (Number.isFinite(bultos)) {
      ventasBultosPorMes[mes] = (ventasBultosPorMes[mes] ?? 0) + bultos
      if (v.origen === "chess")
        chessDistBultosPorMes[mes] = (chessDistBultosPorMes[mes] ?? 0) + bultos
    }
  }
  // No distribuido, por documento: 'FCVTA' = mostrador físico, 'PRVTA' =
  // factura presupuesto, 'DVVTA' = notas de crédito, 'PRDVO' = devoluciones
  // presupuesto (los dos últimos vienen en absoluto y acá se restan).
  const mostradorHlPorMes: Record<string, number> = {}
  const mostradorBultosPorMes: Record<string, number> = {}
  const presupuestoHlPorMes: Record<string, number> = {}
  const presupuestoBultosPorMes: Record<string, number> = {}
  const ncHlPorMes: Record<string, number> = {}
  const ncBultosPorMes: Record<string, number> = {}
  const devPresHlPorMes: Record<string, number> = {}
  const devPresBultosPorMes: Record<string, number> = {}
  for (const v of mostradorRows) {
    const mes = v.fecha.slice(0, 7)
    let hlMap = mostradorHlPorMes
    let bultosMap = mostradorBultosPorMes
    if (v.ds_documento === "PRVTA") {
      hlMap = presupuestoHlPorMes
      bultosMap = presupuestoBultosPorMes
    } else if (v.ds_documento === "DVVTA") {
      hlMap = ncHlPorMes
      bultosMap = ncBultosPorMes
    } else if (v.ds_documento === "PRDVO") {
      hlMap = devPresHlPorMes
      bultosMap = devPresBultosPorMes
    }
    const hl = Number(v.total_hl ?? 0)
    if (Number.isFinite(hl)) hlMap[mes] = (hlMap[mes] ?? 0) + hl
    const bultos = Number(v.total_bultos ?? 0)
    if (Number.isFinite(bultos)) bultosMap[mes] = (bultosMap[mes] ?? 0) + bultos
  }
  const rechHlPorMes: Record<string, number> = {}
  for (const r of rechazosRows) {
    const hl = Number(r.hl_rechazados ?? 0)
    if (!Number.isFinite(hl)) continue
    const mes = r.fecha_venta.slice(0, 7)
    rechHlPorMes[mes] = (rechHlPorMes[mes] ?? 0) + hl
  }
  for (const mes of meses) {
    const esActual = mes === mesActual
    const ventas = ventasHlPorMes[mes] ?? 0
    const bultos = ventasBultosPorMes[mes] ?? 0
    const rech = rechHlPorMes[mes] ?? 0
    celdas.bultos_vendidos[mes] = {
      mes,
      valor: bultos > 0 ? bultos : null,
      parcial: esActual,
    }
    celdas.hl_vendidos[mes] = {
      mes,
      valor: ventas > 0 ? ventas : null,
      parcial: esActual,
    }
    celdas.rechazo[mes] = {
      mes,
      valor: ventas > 0 ? (rech / ventas) * 100 : null,
      parcial: esActual,
    }
    // Volumen rechazado del mes (misma base que el %): con distribución en el
    // mes se muestra aunque sea 0; sin distribución queda sin dato.
    celdas.hl_rechazados[mes] = {
      mes,
      valor: ventas > 0 ? rech : null,
      parcial: esActual,
    }

    const mostBultos = mostradorBultosPorMes[mes] ?? 0
    const mostHl = mostradorHlPorMes[mes] ?? 0
    const presBultos = presupuestoBultosPorMes[mes] ?? 0
    const presHl = presupuestoHlPorMes[mes] ?? 0
    // Facturado Chess NETO (sistema madre, sin Gestión):
    // FCVTA (distribuido chess + mostrador) + PRVTA − DVVTA − PRDVO.
    const chessDistBultos = chessDistBultosPorMes[mes] ?? 0
    const chessDistHl = chessDistHlPorMes[mes] ?? 0
    const factBultos =
      chessDistBultos + mostBultos + presBultos -
      (ncBultosPorMes[mes] ?? 0) - (devPresBultosPorMes[mes] ?? 0)
    const factHl =
      chessDistHl + mostHl + presHl -
      (ncHlPorMes[mes] ?? 0) - (devPresHlPorMes[mes] ?? 0)
    celdas.facturado_chess_bultos[mes] = {
      mes,
      valor: chessDistBultos > 0 ? factBultos : null,
      parcial: esActual,
    }
    celdas.facturado_chess_hl[mes] = {
      mes,
      valor: chessDistHl > 0 ? factHl : null,
      parcial: esActual,
    }
    // Venta mostrador = resta directa de las dos filas del cuadro:
    // Vendidos (facturado Chess neto) − Distribuidos (chess + gestión).
    celdas.mostrador_bultos[mes] = {
      mes,
      valor: chessDistBultos > 0 && bultos > 0 ? factBultos - bultos : null,
      parcial: esActual,
    }
    celdas.mostrador_hl[mes] = {
      mes,
      valor: chessDistHl > 0 && ventas > 0 ? factHl - ventas : null,
      parcial: esActual,
    }
  }

  // ── ENTREGA/VENTAS: CEq (bultos × ceq_factor, vía funciones SQL) ──
  // cuadro_ceq_mensual: distribuido chess+gestion (fila de Entrega).
  // cuadro_ceq_chess_mensual: distribuido SOLO chess (base de Ventas neto).
  // cuadro_ceq_no_distribuido_mensual: mostrador (FCVTA) + presupuesto (PRVTA)
  // + notas de crédito (DVVTA) + devoluciones presupuesto (PRDVO).
  {
    const [ceqRes, ceqChessRes, ceqNoDistRes] = await Promise.all([
      supabase.rpc("cuadro_ceq_mensual", { p_desde: desde }),
      supabase.rpc("cuadro_ceq_chess_mensual", { p_desde: desde }),
      supabase.rpc("cuadro_ceq_no_distribuido_mensual", { p_desde: desde }),
    ])
    const ceqPorMes: Record<string, number> = {}
    for (const r of (ceqRes.data ?? []) as Array<{ mes: string; ceq: number | null }>) {
      const v = Number(r.ceq ?? 0)
      if (Number.isFinite(v)) ceqPorMes[r.mes] = v
    }
    const ceqChessDistPorMes: Record<string, number> = {}
    for (const r of (ceqChessRes.data ?? []) as Array<{ mes: string; ceq: number | null }>) {
      const v = Number(r.ceq ?? 0)
      if (Number.isFinite(v)) ceqChessDistPorMes[r.mes] = v
    }
    const ceqMostPorMes: Record<string, number> = {}
    const ceqPresPorMes: Record<string, number> = {}
    const ceqNcPorMes: Record<string, number> = {}
    const ceqDevPresPorMes: Record<string, number> = {}
    for (const r of (ceqNoDistRes.data ?? []) as Array<{
      mes: string
      ds_documento: string | null
      ceq: number | null
    }>) {
      const v = Number(r.ceq ?? 0)
      if (!Number.isFinite(v)) continue
      const map =
        r.ds_documento === "PRVTA" ? ceqPresPorMes
        : r.ds_documento === "DVVTA" ? ceqNcPorMes
        : r.ds_documento === "PRDVO" ? ceqDevPresPorMes
        : ceqMostPorMes
      map[r.mes] = (map[r.mes] ?? 0) + v
    }
    for (const mes of meses) {
      const esActual = mes === mesActual
      const v = ceqPorMes[mes]
      celdas.ceq_vendidas[mes] = {
        mes,
        valor: v !== undefined && v > 0 ? v : null,
        parcial: esActual,
      }
      const most = ceqMostPorMes[mes] ?? 0
      const pres = ceqPresPorMes[mes] ?? 0
      const chessDist = ceqChessDistPorMes[mes] ?? 0
      const factCeq =
        chessDist + most + pres - (ceqNcPorMes[mes] ?? 0) - (ceqDevPresPorMes[mes] ?? 0)
      celdas.facturado_chess_ceq[mes] = {
        mes,
        valor: chessDist > 0 ? factCeq : null,
        parcial: esActual,
      }
      // Venta mostrador = Vendidos − Distribuidos (resta de las dos filas).
      const distTotal = ceqPorMes[mes] ?? 0
      celdas.mostrador_ceq[mes] = {
        mes,
        valor: chessDist > 0 && distTotal > 0 ? factCeq - distTotal : null,
        parcial: esActual,
      }
    }
  }

  // ── COSTO LOGÍSTICO: Distribución + Almacén por mes (costo_logistico_mensual,
  // la misma tabla que carga el panel de Costo por Punto de Venta). Tabla chica
  // (una fila por mes), no necesita paginación.
  {
    const anioInicio = Number(INICIO.slice(0, 4))
    const { data } = await supabase
      .from("costo_logistico_mensual")
      .select("anio, mes, distribucion, almacen")
      .gte("anio", anioInicio)
    for (const r of (data ?? []) as Array<{
      anio: number
      mes: number
      distribucion: number | null
      almacen: number | null
    }>) {
      const mesKey = `${r.anio}-${String(r.mes).padStart(2, "0")}`
      if (!meses.includes(mesKey)) continue
      const esActual = mesKey === mesActual
      const dist = Number(r.distribucion ?? 0)
      const alm = Number(r.almacen ?? 0)
      celdas.costo_distribucion[mesKey] = {
        mes: mesKey,
        valor: Number.isFinite(dist) && dist > 0 ? dist : null,
        parcial: esActual,
      }
      celdas.costo_almacen[mesKey] = {
        mes: mesKey,
        valor: Number.isFinite(alm) && alm > 0 ? alm : null,
        parcial: esActual,
      }
    }
    // Meses del cuadro sin fila en la tabla → celda gris (sin dato).
    for (const mes of meses) {
      const esActual = mes === mesActual
      celdas.costo_distribucion[mes] ??= { mes, valor: null, parcial: esActual }
      celdas.costo_almacen[mes] ??= { mes, valor: null, parcial: esActual }
    }
  }

  // ── FLOTA: tiempo en ruta + camiones/día (Foxtrot) ──
  const foxPorMes: Record<
    string,
    { tiempos: number[]; rutas: number; fechas: Set<string> }
  > = {}
  for (const r of foxRows) {
    const mes = r.fecha.slice(0, 7)
    const acc = (foxPorMes[mes] ??= { tiempos: [], rutas: 0, fechas: new Set() })
    acc.rutas++
    acc.fechas.add(r.fecha)
    const t = Number(r.tiempo_ruta_minutos ?? 0)
    // 🚨 Solo RUTAS LIMPIAS (cerradas el mismo día que arrancaron): las que el
    // chofer no finalizó en la app las cierra Foxtrot horas o días después y su
    // duración ya no es tiempo de trabajo. Contándolas, enero daba 11,8 hs
    // promedio por ruta en vez de 7,4 — ver lib/foxtrot/tiempo-ruta-limpias.ts.
    if (r.is_finalized && Number.isFinite(t) && t > 0 && esRutaLimpia(r.raw_data)) {
      acc.tiempos.push(t)
    }
  }
  for (const mes of meses) {
    const esActual = mes === mesActual
    const acc = foxPorMes[mes]
    celdas.tiempo_ruta[mes] = {
      mes,
      valor: acc && acc.tiempos.length > 0 ? avg(acc.tiempos) / 60 : null,
      parcial: esActual,
    }
    // Horas en ruta del mes: suma de las duraciones de las rutas finalizadas
    // (misma base que el promedio de arriba).
    celdas.horas_ruta[mes] = {
      mes,
      valor:
        acc && acc.tiempos.length > 0
          ? acc.tiempos.reduce((a, b) => a + b, 0) / 60
          : null,
      parcial: esActual,
    }
    celdas.camiones_dia[mes] = {
      mes,
      valor: acc && acc.fechas.size > 0 ? acc.rutas / acc.fechas.size : null,
      parcial: esActual,
    }
    // Entrega: viajes del mes = total de rutas Foxtrot (suma de camiones
    // que salieron por día; un camión con viaje un día cuenta 1).
    celdas.viajes_mes[mes] = {
      mes,
      valor: acc && acc.rutas > 0 ? acc.rutas : null,
      parcial: esActual,
    }
    // Mantenimiento: sin histórico mensual disponible → siempre gris.
    celdas.mantenimiento[mes] = { mes, valor: null, parcial: esActual }
  }

  // ── ENTREGA: FTE promedio (personas por camión que sale a reparto) ──
  // Chofer + ayudantes cargados, promediado sobre los egresos del mes. Misma
  // base que el TML (registros_vehiculos). El chofer siempre suma 1: un egreso
  // sin ayudantes vale 1, no 0.
  const ftePorMes: Record<string, { personas: number; viajes: number }> = {}
  for (const r of egresosRows) {
    const mes = r.fecha.slice(0, 7)
    const acc = (ftePorMes[mes] ??= { personas: 0, viajes: 0 })
    acc.personas += contarTripulacion(r)
    acc.viajes += 1
  }
  for (const mes of meses) {
    const acc = ftePorMes[mes]
    celdas.fte_prom[mes] = {
      mes,
      valor: acc && acc.viajes > 0 ? acc.personas / acc.viajes : null,
      parcial: mes === mesActual,
    }
  }

  // ── ENTREGA: SLA (secuencial por mes) ──
  for (const mes of meses) {
    const [a, m] = mes.split("-").map(Number)
    const esActual = mes === mesActual

    const sla = await getCumplimientoMes(a, m)
    if ("data" in sla) {
      const filas = sla.data.filas.filter((f) => !f.mtdLabel)
      const cumplidos = filas.reduce((s, f) => s + f.cumplidos, 0)
      const total = filas.reduce((s, f) => s + f.totalAplica, 0)
      celdas.sla[mes] = {
        mes,
        valor: total > 0 ? (cumplidos / total) * 100 : null,
        parcial: esActual,
      }
    } else {
      celdas.sla[mes] = { mes, valor: null, parcial: esActual }
    }
  }

  // ── ALMACÉN: WQI / productividad / precisión (deposito-esteban, por mes) ──
  await Promise.all(
    meses.map(async (mes) => {
      const dias = diasDelMes(mes)
      const esActual = mes === mesActual
      // fechaReunion: mes en curso → hoy (enmascara hoy/futuro);
      // mes cerrado → último día del mes (como quedó en el pasado, no
      // enmascara ningún día). OJO: tiene que caer DENTRO del mes — el
      // endpoint serie-diaria del depósito consulta year/month de esta fecha
      // (con "día siguiente al fin de mes" pedía el mes siguiente y la
      // precisión de meses cerrados venía vacía).
      const fechaRef = esActual ? hoy : dias[dias.length - 1]
      try {
        const serie = await buildWarehouseSerieDiaria(dias, fechaRef)
        // WQI: último MTD acumulado no nulo del mes (= WQI consolidado del mes).
        const wqiVals = dias
          .map((d) => serie.wqi[d])
          .filter((v): v is number => v !== null && Number.isFinite(v))
        const wqi = wqiVals.length > 0 ? wqiVals[wqiVals.length - 1] : null
        // Productividad: promedio de los valores DIARIOS no nulos.
        const prodVals = dias
          .map((d) => serie.productividad[d])
          .filter((v): v is number => v !== null && Number.isFinite(v))
        const prod = prodVals.length > 0 ? avg(prodVals) : null
        // Precisión: promedio de los valores DIARIOS no nulos. La serie ya
        // viene en PORCENTAJE 0..100 (endpoint serie-diaria del depósito,
        // igual que la reunión de logística) — multiplicarla ×100 mostraba
        // "9.996,4%".
        const precVals = dias
          .map((d) => serie.precision[d])
          .filter((v): v is number => v !== null && Number.isFinite(v))
        const prec = precVals.length > 0 ? avg(precVals) : null

        celdas.wqi[mes] = {
          mes,
          valor: wqi,
          meta: serie.targets.wqi,
          parcial: esActual,
        }
        celdas.productividad[mes] = { mes, valor: prod, parcial: esActual }
        celdas.precision[mes] = { mes, valor: prec, parcial: esActual }
      } catch {
        celdas.wqi[mes] = { mes, valor: null, parcial: esActual }
        celdas.productividad[mes] = { mes, valor: null, parcial: esActual }
        celdas.precision[mes] = { mes, valor: null, parcial: esActual }
      }
    }),
  )

  // ── Ensamblar filas ──
  const filas: FilaIndicador[] = INDICADORES.map((def) => ({
    def,
    celdas: celdas[def.id],
    resumen: resumirFila(celdas[def.id], def.resumen),
  }))

  return {
    data: {
      meses,
      mesActual,
      filas,
      generadoEn: new Date().toISOString(),
    },
  }
}

/**
 * Detalle de % Rechazo de un mes: top de rechazos agrupados por comprobante
 * (origen+serie+nrodoc, sumando sus líneas de artículos), ordenados por HL.
 * Misma base que la celda del cuadro (tabla rechazos, por fecha_venta).
 */
export async function getDetalleRechazosMes(
  mes: string,
): Promise<Result<DetalleRechazos>> {
  await requireAuth()
  if (IS_MISIONES) {
    return { error: "Solo disponible en Pampeana." }
  }
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return { error: "Mes inválido." }
  }

  const dias = diasDelMes(mes)
  const desde = dias[0]
  const hasta = dias[dias.length - 1]
  const supabase = await createClient()

  // Rechazos del mes (paginado: abril supera las 1000 filas).
  const PAGE = 1000
  type Fila = {
    fecha_venta: string
    serie: number | null
    nrodoc: number | null
    origen: string | null
    id_cliente: number | null
    nombre_cliente: string | null
    ds_rechazo: string | null
    bultos_rechazados: number | null
    hl_rechazados: number | null
  }
  const rows: Fila[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("rechazos")
      .select(
        "fecha_venta, serie, nrodoc, origen, id_cliente, nombre_cliente, ds_rechazo, bultos_rechazados, hl_rechazados",
      )
      .gte("fecha_venta", desde)
      .lte("fecha_venta", hasta)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { error: error.message }
    if (!data || data.length === 0) break
    rows.push(...(data as Fila[]))
    if (data.length < PAGE) break
  }

  let totalHl = 0
  const porDoc = new Map<
    string,
    { fecha: string; cliente: string; motivos: Set<string>; bultos: number; hl: number }
  >()
  for (const r of rows) {
    const hl = Number(r.hl_rechazados ?? 0)
    if (Number.isFinite(hl)) totalHl += hl
    const k = `${r.origen}|${r.serie}|${r.nrodoc}`
    let d = porDoc.get(k)
    if (!d) {
      d = {
        fecha: r.fecha_venta,
        cliente: r.nombre_cliente ?? (r.id_cliente ? `Cliente ${r.id_cliente}` : "—"),
        motivos: new Set(),
        bultos: 0,
        hl: 0,
      }
      porDoc.set(k, d)
    }
    if (Number.isFinite(hl)) d.hl += hl
    const bultos = Number(r.bultos_rechazados ?? 0)
    if (Number.isFinite(bultos)) d.bultos += bultos
    if (r.ds_rechazo) d.motivos.add(r.ds_rechazo)
  }

  const top: DetalleRechazoItem[] = [...porDoc.values()]
    .sort((a, b) => b.hl - a.hl)
    .slice(0, 10)
    .map((d) => ({
      fecha: d.fecha,
      cliente: d.cliente,
      motivo: [...d.motivos].join(" / ") || "Sin motivo",
      bultos: d.bultos,
      hl: d.hl,
      pctMes: totalHl > 0 ? (d.hl / totalHl) * 100 : 0,
    }))

  return { data: { mes, totalHl, cantidad: rows.length, top } }
}

/**
 * Desglose de Bultos vendidos de un mes por FAMILIA de producto
 * (Cervezas/Aguas/Gaseosas/Otros). Cruza ventas_diarias_sku (bultos por SKU,
 * misma base que la celda) con la clasificación uneg/segmento de chess_articulos.
 * Cuadra con la celda porque incluye "Otros" (los SKU sin clasificación).
 */
export async function getDetalleBultosFamilia(
  mes: string,
): Promise<Result<DetalleBultos>> {
  await requireAuth()
  if (IS_MISIONES) {
    return { error: "Solo disponible en Pampeana." }
  }
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return { error: "Mes inválido." }
  }

  const dias = diasDelMes(mes)
  const desde = dias[0]
  const hasta = dias[dias.length - 1]
  const supabase = await createClient()

  // 1. Bultos por id_articulo del mes (paginado: >1000 filas/mes).
  const bultosPorArticulo = new Map<number, number>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ventas_diarias_sku")
      .select("id_articulo, bultos")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const r of data as Array<{
      id_articulo: number
      bultos: number | null
    }>) {
      const b = Number(r.bultos ?? 0)
      if (Number.isFinite(b)) {
        bultosPorArticulo.set(
          r.id_articulo,
          (bultosPorArticulo.get(r.id_articulo) ?? 0) + b,
        )
      }
    }
    if (data.length < PAGE) break
  }

  // 2. Clasificación uneg/segmento de los SKU presentes (chunks por el límite de IN).
  const ids = [...bultosPorArticulo.keys()]
  const clasePorArticulo = new Map<
    number,
    { uneg: string | null; segmento: string | null }
  >()
  const CHUNK = 400
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from("chess_articulos")
      .select("id_articulo, uneg, segmento")
      .in("id_articulo", ids.slice(i, i + CHUNK))
    for (const a of (data ?? []) as Array<{
      id_articulo: number
      uneg: string | null
      segmento: string | null
    }>) {
      clasePorArticulo.set(a.id_articulo, { uneg: a.uneg, segmento: a.segmento })
    }
  }

  // 3. Sumar por familia.
  const porFamilia: Record<string, number> = {}
  for (const [id, bultos] of bultosPorArticulo) {
    const c = clasePorArticulo.get(id)
    const fam = clasificarFamilia(c?.uneg ?? null, c?.segmento ?? null)
    porFamilia[fam] = (porFamilia[fam] ?? 0) + bultos
  }

  const { items, total } = armarItems(porFamilia, ORDEN_FAMILIAS)
  return { data: { mes, total, items } }
}
