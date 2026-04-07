"use server"

import { createClient } from "@/lib/supabase/server"

// ---------- Types ----------

export interface RechazoDetalle {
  fecha: string
  ds_fletero_carga: string
  id_rechazo: number
  ds_rechazo: string
  ds_articulo: string
  bultos_rechazados: number
  nombre_cliente: string | null
  ds_vendedor: string | null
}

export interface RechazosPorFletero {
  ds_fletero_carga: string
  bultos_entregados: number
  bultos_rechazados: number
  pct_rechazo: number
  cantidad_rechazos: number
}

export interface RechazosDiario {
  fecha: string
  bultos_entregados: number
  bultos_rechazados: number
  pct_rechazo: number
}

export interface RechazosResumen {
  fecha: string
  total_bultos_entregados: number
  total_bultos_rechazados: number
  pct_rechazo: number
  por_fletero: RechazosPorFletero[]
  por_motivo: { ds_rechazo: string; bultos: number; cantidad: number }[]
  detalle: RechazoDetalle[]
}

export interface RechazosResumenDia {
  fecha: string
  bultos_entregados: number
  bultos_rechazados: number
  pct_rechazo: number
}

// META exported via async getter (use server files can only export async functions)
export async function getMetaRechazo() { return 1.5 }

// ---------- Categorización de motivos ----------

const CATEGORIA_MOTIVO: Record<string, string> = {
  "ERROR DE CARGA": "Operativo",
  "ERROR DE DISTRIBUCIÓN": "Operativo",
  "PRODUCTO NO APTO": "Operativo",
  "SIN STOCK": "Operativo",
  "ERROR DE PREVENTA": "Comercial",
  "SIN ENVASES": "Comercial",
  "CERRADO": "Cliente",
  "SIN DINERO": "Cliente",
  "DEV X TRÁMITES INTERNOS": "Interno",
}

function getCategoria(motivo: string): string {
  return CATEGORIA_MOTIVO[motivo] ?? "Otro"
}

function esControlable(motivo: string): boolean {
  const cat = getCategoria(motivo)
  return cat === "Operativo" || cat === "Comercial"
}

// ---------- Types for acumulado ----------

export interface MotivoAcumulado {
  ds_rechazo: string
  categoria: string
  bultos: number
  cantidad: number
  pct_del_total: number
}

export interface FleteroAcumulado {
  ds_fletero_carga: string
  bultos_entregados: number
  bultos_rechazados: number
  pct_rechazo: number
  cantidad: number
  motivo_principal: string
}

export interface ClienteAcumulado {
  nombre_cliente: string
  ds_vendedor: string
  bultos_rechazados: number
  cantidad_rechazos: number
  fechas_distintas: number
  motivos: string[]
  fleteros: string[]
}

export interface RechazosAcumulado {
  total_bultos_entregados: number
  total_bultos_rechazados: number
  pct_rechazo: number
  pct_controlable: number
  clientes_recurrentes: number
  top_motivo: { ds_rechazo: string; bultos: number; pct: number } | null
  por_motivo: MotivoAcumulado[]
  por_fletero: FleteroAcumulado[]
  por_cliente: ClienteAcumulado[]
  por_dia: RechazosResumenDia[]
  detalle: RechazoDetalle[]
}

// ---------- getRechazosAcumulado ----------

export async function getRechazosAcumulado(
  mes: number,
  anio: number
): Promise<{ data: RechazosAcumulado } | { error: string }> {
  try {
    const supabase = await createClient()

    const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

    // Fetch rechazos + ventas_diarias in parallel
    const [rechRes, ventasRes] = await Promise.all([
      supabase
        .from("rechazos")
        .select("*")
        .gte("fecha", primerDia)
        .lte("fecha", ultimaFecha)
        .order("fecha"),
      supabase
        .from("ventas_diarias")
        .select("fecha, ds_fletero_carga, total_bultos")
        .gte("fecha", primerDia)
        .lte("fecha", ultimaFecha),
    ])

    if (rechRes.error) return { error: rechRes.error.message }
    if (ventasRes.error) return { error: ventasRes.error.message }

    const rechazos = (rechRes.data ?? []) as Array<{
      fecha: string
      serie: number
      nrodoc: number
      id_articulo: number
      ds_articulo: string
      id_fletero_carga: number | null
      ds_fletero_carga: string | null
      id_rechazo: number
      ds_rechazo: string
      bultos_rechazados: number
      bultos_entregados: number
      id_cliente: number | null
      nombre_cliente: string | null
      id_vendedor: number | null
      ds_vendedor: string | null
      planilla_carga: string | null
    }>

    const ventas = (ventasRes.data ?? []) as Array<{
      fecha: string
      ds_fletero_carga: string
      total_bultos: number
    }>

    // Total entregados from ventas_diarias
    const totalEntregados = ventas.reduce((s, v) => s + Number(v.total_bultos), 0)

    // Entregados por fletero (from ventas_diarias)
    const entregadosPorFletero = new Map<string, number>()
    for (const v of ventas) {
      entregadosPorFletero.set(
        v.ds_fletero_carga,
        (entregadosPorFletero.get(v.ds_fletero_carga) ?? 0) + Number(v.total_bultos)
      )
    }

    // Entregados por dia (from ventas_diarias)
    const entregadosPorDia = new Map<string, number>()
    for (const v of ventas) {
      entregadosPorDia.set(v.fecha, (entregadosPorDia.get(v.fecha) ?? 0) + Number(v.total_bultos))
    }

    // Process rechazos
    let totalRechazados = 0
    let totalControlable = 0

    const motivoMap = new Map<string, { bultos: number; cantidad: number }>()
    const fleteroMap = new Map<string, { rechazados: number; cantidad: number; motivos: Map<string, number> }>()
    const clienteMap = new Map<string, {
      vendedor: string
      bultos: number
      cantidad: number
      fechas: Set<string>
      motivos: Set<string>
      fleteros: Set<string>
    }>()
    const diarioRechMap = new Map<string, number>()
    const detalle: RechazoDetalle[] = []

    for (const r of rechazos) {
      const bultos = Number(r.bultos_rechazados)
      totalRechazados += bultos
      if (esControlable(r.ds_rechazo)) totalControlable += bultos

      // Por motivo
      const mData = motivoMap.get(r.ds_rechazo) ?? { bultos: 0, cantidad: 0 }
      mData.bultos += bultos
      mData.cantidad++
      motivoMap.set(r.ds_rechazo, mData)

      // Por fletero
      const fletero = r.ds_fletero_carga ?? "SIN ASIGNAR"
      const fData = fleteroMap.get(fletero) ?? { rechazados: 0, cantidad: 0, motivos: new Map() }
      fData.rechazados += bultos
      fData.cantidad++
      fData.motivos.set(r.ds_rechazo, (fData.motivos.get(r.ds_rechazo) ?? 0) + bultos)
      fleteroMap.set(fletero, fData)

      // Por cliente
      const cliente = r.nombre_cliente ?? "SIN CLIENTE"
      const cData = clienteMap.get(cliente) ?? {
        vendedor: r.ds_vendedor ?? "—",
        bultos: 0,
        cantidad: 0,
        fechas: new Set(),
        motivos: new Set(),
        fleteros: new Set(),
      }
      cData.bultos += bultos
      cData.cantidad++
      cData.fechas.add(r.fecha)
      cData.motivos.add(r.ds_rechazo)
      cData.fleteros.add(fletero)
      if (r.ds_vendedor) cData.vendedor = r.ds_vendedor
      clienteMap.set(cliente, cData)

      // Por dia
      diarioRechMap.set(r.fecha, (diarioRechMap.get(r.fecha) ?? 0) + bultos)

      // Detalle
      detalle.push({
        fecha: r.fecha,
        ds_fletero_carga: fletero,
        id_rechazo: r.id_rechazo,
        ds_rechazo: r.ds_rechazo,
        ds_articulo: r.ds_articulo,
        bultos_rechazados: bultos,
        nombre_cliente: r.nombre_cliente,
        ds_vendedor: r.ds_vendedor,
      })
    }

    // Build por_motivo sorted desc by bultos (Pareto)
    const porMotivo: MotivoAcumulado[] = [...motivoMap.entries()]
      .map(([ds_rechazo, d]) => ({
        ds_rechazo,
        categoria: getCategoria(ds_rechazo),
        bultos: Math.round(d.bultos * 100) / 100,
        cantidad: d.cantidad,
        pct_del_total: totalRechazados > 0 ? Math.round((d.bultos / totalRechazados) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.bultos - a.bultos)

    // Build por_fletero sorted desc by pct_rechazo
    const porFletero: FleteroAcumulado[] = [...fleteroMap.entries()]
      .map(([fletero, d]) => {
        const entregados = entregadosPorFletero.get(fletero) ?? 0
        let motivoPrincipal = ""
        let maxBultos = 0
        for (const [m, b] of d.motivos) {
          if (b > maxBultos) { maxBultos = b; motivoPrincipal = m }
        }
        return {
          ds_fletero_carga: fletero,
          bultos_entregados: Math.round(entregados * 100) / 100,
          bultos_rechazados: Math.round(d.rechazados * 100) / 100,
          pct_rechazo: entregados > 0 ? Math.round((d.rechazados / entregados) * 10000) / 100 : 0,
          cantidad: d.cantidad,
          motivo_principal: motivoPrincipal,
        }
      })
      .sort((a, b) => b.pct_rechazo - a.pct_rechazo)

    // Build por_cliente sorted desc by cantidad
    const porCliente: ClienteAcumulado[] = [...clienteMap.entries()]
      .map(([cliente, d]) => ({
        nombre_cliente: cliente,
        ds_vendedor: d.vendedor,
        bultos_rechazados: Math.round(d.bultos * 100) / 100,
        cantidad_rechazos: d.cantidad,
        fechas_distintas: d.fechas.size,
        motivos: [...d.motivos],
        fleteros: [...d.fleteros],
      }))
      .sort((a, b) => b.cantidad_rechazos - a.cantidad_rechazos)

    // Build por_dia
    const allFechas = new Set([...diarioRechMap.keys(), ...entregadosPorDia.keys()])
    const porDia: RechazosResumenDia[] = [...allFechas]
      .sort()
      .map((fecha) => {
        const ent = entregadosPorDia.get(fecha) ?? 0
        const rech = diarioRechMap.get(fecha) ?? 0
        return {
          fecha,
          bultos_entregados: Math.round(ent * 100) / 100,
          bultos_rechazados: Math.round(rech * 100) / 100,
          pct_rechazo: ent > 0 ? Math.round((rech / ent) * 10000) / 100 : 0,
        }
      })

    // Clientes recurrentes (3+ fechas distintas)
    const clientesRecurrentes = [...clienteMap.values()].filter((c) => c.fechas.size >= 3).length

    // Top motivo
    const topMotivo = porMotivo.length > 0
      ? { ds_rechazo: porMotivo[0].ds_rechazo, bultos: porMotivo[0].bultos, pct: porMotivo[0].pct_del_total }
      : null

    const pctRechazo = totalEntregados > 0
      ? Math.round((totalRechazados / totalEntregados) * 10000) / 100
      : 0
    const pctControlable = totalEntregados > 0
      ? Math.round((totalControlable / totalEntregados) * 10000) / 100
      : 0

    return {
      data: {
        total_bultos_entregados: Math.round(totalEntregados * 100) / 100,
        total_bultos_rechazados: Math.round(totalRechazados * 100) / 100,
        pct_rechazo: pctRechazo,
        pct_controlable: pctControlable,
        clientes_recurrentes: clientesRecurrentes,
        top_motivo: topMotivo,
        por_motivo: porMotivo,
        por_fletero: porFletero,
        por_cliente: porCliente,
        por_dia: porDia,
        detalle,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando acumulado" }
  }
}

// ---------- getRechazosDelDia ----------

export async function getRechazosDelDia(
  fecha: string
): Promise<{ data: RechazosResumen } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get all rechazos for the date
    const { data: rechazos, error: rechErr } = await supabase
      .from("rechazos")
      .select("*")
      .eq("fecha", fecha)
      .order("ds_fletero_carga")

    if (rechErr) return { error: rechErr.message }

    const rows = (rechazos ?? []) as Array<{
      fecha: string
      serie: number
      nrodoc: number
      id_articulo: number
      ds_articulo: string
      id_fletero_carga: number | null
      ds_fletero_carga: string | null
      id_rechazo: number
      ds_rechazo: string
      bultos_rechazados: number
      bultos_entregados: number
      id_cliente: number | null
      nombre_cliente: string | null
      id_vendedor: number | null
      ds_vendedor: string | null
      planilla_carga: string | null
    }>

    // Aggregate totals
    let totalEntregados = 0
    let totalRechazados = 0

    const fleteroMap = new Map<string, { entregados: number; rechazados: number; cantidad: number }>()
    const motivoMap = new Map<string, { bultos: number; cantidad: number }>()
    const detalle: RechazoDetalle[] = []

    for (const r of rows) {
      totalEntregados += Number(r.bultos_entregados)
      totalRechazados += Number(r.bultos_rechazados)

      const fletero = r.ds_fletero_carga ?? "SIN ASIGNAR"
      const fData = fleteroMap.get(fletero) ?? { entregados: 0, rechazados: 0, cantidad: 0 }
      fData.entregados += Number(r.bultos_entregados)
      fData.rechazados += Number(r.bultos_rechazados)
      fData.cantidad++
      fleteroMap.set(fletero, fData)

      const motivo = r.ds_rechazo
      const mData = motivoMap.get(motivo) ?? { bultos: 0, cantidad: 0 }
      mData.bultos += Number(r.bultos_rechazados)
      mData.cantidad++
      motivoMap.set(motivo, mData)

      detalle.push({
        fecha: r.fecha,
        ds_fletero_carga: fletero,
        id_rechazo: r.id_rechazo,
        ds_rechazo: r.ds_rechazo,
        ds_articulo: r.ds_articulo,
        bultos_rechazados: Number(r.bultos_rechazados),
        nombre_cliente: r.nombre_cliente,
        ds_vendedor: r.ds_vendedor,
      })
    }

    const porFletero: RechazosPorFletero[] = [...fleteroMap.entries()]
      .map(([fletero, d]) => ({
        ds_fletero_carga: fletero,
        bultos_entregados: Math.round(d.entregados * 100) / 100,
        bultos_rechazados: Math.round(d.rechazados * 100) / 100,
        pct_rechazo: d.entregados > 0 ? Math.round((d.rechazados / d.entregados) * 10000) / 100 : 0,
        cantidad_rechazos: d.cantidad,
      }))
      .sort((a, b) => b.pct_rechazo - a.pct_rechazo)

    const porMotivo = [...motivoMap.entries()]
      .map(([ds_rechazo, d]) => ({
        ds_rechazo,
        bultos: Math.round(d.bultos * 100) / 100,
        cantidad: d.cantidad,
      }))
      .sort((a, b) => b.bultos - a.bultos)

    const pctRechazo = totalEntregados > 0
      ? Math.round((totalRechazados / totalEntregados) * 10000) / 100
      : 0

    return {
      data: {
        fecha,
        total_bultos_entregados: Math.round(totalEntregados * 100) / 100,
        total_bultos_rechazados: Math.round(totalRechazados * 100) / 100,
        pct_rechazo: pctRechazo,
        por_fletero: porFletero,
        por_motivo: porMotivo,
        detalle,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando rechazos" }
  }
}

// ---------- getRechazosResumenMensual ----------

export async function getRechazosResumenMensual(
  mes: number,
  anio: number
): Promise<{ data: RechazosResumenDia[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

    const { data: rechazos, error: rechErr } = await supabase
      .from("rechazos")
      .select("fecha, bultos_entregados, bultos_rechazados")
      .gte("fecha", primerDia)
      .lte("fecha", ultimaFecha)
      .order("fecha")

    if (rechErr) return { error: rechErr.message }

    const rows = (rechazos ?? []) as Array<{
      fecha: string
      bultos_entregados: number
      bultos_rechazados: number
    }>

    // Group by date
    const porDia = new Map<string, { entregados: number; rechazados: number }>()
    for (const r of rows) {
      const d = porDia.get(r.fecha) ?? { entregados: 0, rechazados: 0 }
      d.entregados += Number(r.bultos_entregados)
      d.rechazados += Number(r.bultos_rechazados)
      porDia.set(r.fecha, d)
    }

    const result: RechazosResumenDia[] = [...porDia.entries()]
      .map(([fecha, d]) => ({
        fecha,
        bultos_entregados: Math.round(d.entregados * 100) / 100,
        bultos_rechazados: Math.round(d.rechazados * 100) / 100,
        pct_rechazo: d.entregados > 0
          ? Math.round((d.rechazados / d.entregados) * 10000) / 100
          : 0,
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando resumen mensual" }
  }
}

// ---------- getRechazosRankingFleteros ----------

export async function getRechazosRankingFleteros(
  mes: number,
  anio: number
): Promise<{ data: RechazosPorFletero[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

    const { data: rechazos, error: rechErr } = await supabase
      .from("rechazos")
      .select("ds_fletero_carga, bultos_entregados, bultos_rechazados")
      .gte("fecha", primerDia)
      .lte("fecha", ultimaFecha)

    if (rechErr) return { error: rechErr.message }

    const rows = (rechazos ?? []) as Array<{
      ds_fletero_carga: string | null
      bultos_entregados: number
      bultos_rechazados: number
    }>

    const fleteroMap = new Map<string, { entregados: number; rechazados: number; cantidad: number }>()
    for (const r of rows) {
      const fletero = r.ds_fletero_carga ?? "SIN ASIGNAR"
      const d = fleteroMap.get(fletero) ?? { entregados: 0, rechazados: 0, cantidad: 0 }
      d.entregados += Number(r.bultos_entregados)
      d.rechazados += Number(r.bultos_rechazados)
      d.cantidad++
      fleteroMap.set(fletero, d)
    }

    const result: RechazosPorFletero[] = [...fleteroMap.entries()]
      .map(([fletero, d]) => ({
        ds_fletero_carga: fletero,
        bultos_entregados: Math.round(d.entregados * 100) / 100,
        bultos_rechazados: Math.round(d.rechazados * 100) / 100,
        pct_rechazo: d.entregados > 0 ? Math.round((d.rechazados / d.entregados) * 10000) / 100 : 0,
        cantidad_rechazos: d.cantidad,
      }))
      .sort((a, b) => b.pct_rechazo - a.pct_rechazo)

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando ranking fleteros" }
  }
}

