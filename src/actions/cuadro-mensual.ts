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
} from "@/lib/indicadores/cuadro-mensual-detalle"

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

/** Día siguiente a "YYYY-MM-DD". */
function diaSiguiente(fecha: string): string {
  const t = Date.parse(`${fecha}T00:00:00Z`) + 24 * 60 * 60 * 1000
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
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
  // reportes_seguridad y foxtrot_routes están muy por debajo de 1000 filas en
  // el rango, así que no necesitan paginación.
  const [repRes, ventasRows, mostradorRows, rechazosRows, foxRes] = await Promise.all([
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
    supabase
      .from("foxtrot_routes")
      .select("route_id, fecha, is_finalized, tiempo_ruta_minutos")
      .gte("fecha", desde)
      .lte("fecha", hasta),
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

    const mostBultos = mostradorBultosPorMes[mes] ?? 0
    const mostHl = mostradorHlPorMes[mes] ?? 0
    const presBultos = presupuestoBultosPorMes[mes] ?? 0
    const presHl = presupuestoHlPorMes[mes] ?? 0
    celdas.mostrador_bultos[mes] = {
      mes,
      valor: mostBultos > 0 ? mostBultos : null,
      parcial: esActual,
    }
    celdas.mostrador_hl[mes] = {
      mes,
      valor: mostHl > 0 ? mostHl : null,
      parcial: esActual,
    }
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
      celdas.mostrador_ceq[mes] = {
        mes,
        valor: most > 0 ? most : null,
        parcial: esActual,
      }
      const chessDist = ceqChessDistPorMes[mes] ?? 0
      const factCeq =
        chessDist + most + pres - (ceqNcPorMes[mes] ?? 0) - (ceqDevPresPorMes[mes] ?? 0)
      celdas.facturado_chess_ceq[mes] = {
        mes,
        valor: chessDist > 0 ? factCeq : null,
        parcial: esActual,
      }
    }
  }

  // ── FLOTA: tiempo en ruta + camiones/día (Foxtrot) ──
  const foxPorMes: Record<
    string,
    { tiempos: number[]; rutas: number; fechas: Set<string> }
  > = {}
  for (const r of (foxRes.data ?? []) as Array<{
    route_id: string
    fecha: string
    is_finalized: boolean | null
    tiempo_ruta_minutos: number | null
  }>) {
    const mes = r.fecha.slice(0, 7)
    const acc = (foxPorMes[mes] ??= { tiempos: [], rutas: 0, fechas: new Set() })
    acc.rutas++
    acc.fechas.add(r.fecha)
    const t = Number(r.tiempo_ruta_minutos ?? 0)
    if (r.is_finalized && Number.isFinite(t) && t > 0) acc.tiempos.push(t)
  }
  for (const mes of meses) {
    const esActual = mes === mesActual
    const acc = foxPorMes[mes]
    celdas.tiempo_ruta[mes] = {
      mes,
      valor: acc && acc.tiempos.length > 0 ? avg(acc.tiempos) / 60 : null,
      parcial: esActual,
    }
    celdas.camiones_dia[mes] = {
      mes,
      valor: acc && acc.fechas.size > 0 ? acc.rutas / acc.fechas.size : null,
      parcial: esActual,
    }
    // Mantenimiento: sin histórico mensual disponible → siempre gris.
    celdas.mantenimiento[mes] = { mes, valor: null, parcial: esActual }
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
      // mes cerrado → día siguiente al fin de mes (no enmascara ningún día).
      const fechaRef = esActual ? hoy : diaSiguiente(dias[dias.length - 1])
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
        // Precisión: promedio de los valores DIARIOS (0..1) no nulos → %.
        const precVals = dias
          .map((d) => serie.precision[d])
          .filter((v): v is number => v !== null && Number.isFinite(v))
        const prec = precVals.length > 0 ? avg(precVals) * 100 : null

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
