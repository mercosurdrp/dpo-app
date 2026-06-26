"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

/** Una fila del cálculo de costo logístico por PDV (devuelto por la RPC). */
export interface CostoPorPdvRow {
  id_cliente: number
  nombre_cliente: string
  ciudad: string
  bultos: number
  comprobantes: number
  hl: number
  venta_neta: number
  costo_almacen: number
  costo_distrib: number
  costo_distancia: number
  costo_total: number
  costo_x_bulto: number
  costo_x_hl: number
  pct_venta: number
  bultos_rechazados: number
  eventos_rechazo: number
  pct_rechazo: number
}

/** Costo mensual cargado por sector (input del modelo). */
export interface CostoMensual {
  anio: number
  mes: number
  distribucion: number
  almacen: number
  w_rodaje: number
  /** Km totales de la flota en el mes. Si es null, se calcula automático de registro_combustible. */
  km_totales: number | null
  updated_at: string
}

/** Distancia (km de ruta) desde el centro de distribución a cada ciudad. */
export interface KmCiudad {
  ciudad: string
  km: number
}

const ROLES_EDITORES = ["admin", "supervisor", "admin_rrhh"]

/** Meses cargados (con costos), ordenados del más reciente al más viejo. */
export async function getCostosMensuales(): Promise<CostoMensual[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("costo_logistico_mensual")
    .select("anio, mes, distribucion, almacen, w_rodaje, km_totales, updated_at")
    .order("anio", { ascending: false })
    .order("mes", { ascending: false })
  return (data ?? []).map((r) => ({
    anio: r.anio,
    mes: r.mes,
    distribucion: Number(r.distribucion),
    almacen: Number(r.almacen),
    w_rodaje: Number(r.w_rodaje),
    km_totales: r.km_totales != null ? Number(r.km_totales) : null,
    updated_at: r.updated_at,
  }))
}

/** Distancias por ciudad (km de ruta desde el CD), ordenadas de la más lejana a la más cercana. */
export async function getKmCiudades(): Promise<KmCiudad[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("costo_km_ciudad")
    .select("ciudad, km")
    .order("km", { ascending: false })
  return (data ?? []).map((r) => ({ ciudad: r.ciudad, km: Number(r.km) }))
}

/** Alta/edición de la distancia de una ciudad (solo roles de gestión). */
export async function guardarKmCiudad(
  ciudad: string,
  km: number,
): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile || !ROLES_EDITORES.includes(profile.role)) {
    return { error: "No tenés permiso para editar las distancias." }
  }
  if (!ciudad.trim()) return { error: "Ciudad inválida." }
  if (km < 0 || !Number.isFinite(km)) return { error: "La distancia no puede ser negativa." }

  const supabase = await createClient()
  const { error } = await supabase.from("costo_km_ciudad").upsert(
    { ciudad, km, updated_at: new Date().toISOString() },
    { onConflict: "ciudad" },
  )
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/costo-por-pdv")
  return { ok: true }
}

/** Costo logístico por PDV para un (año, mes), vía la función SQL. */
export async function getCostoPorPdv(
  anio: number,
  mes: number,
): Promise<{ data: CostoPorPdvRow[] } | { error: string }> {
  const supabase = await createClient()
  // Usamos la variante _json (devuelve un único jsonb con TODOS los PDV) para que
  // PostgREST no trunque la respuesta a 1000 filas: con el corte se perdían los PDV
  // más chicos y tanto el costo total como los percentiles de costo/HL daban mal.
  const { data, error } = await supabase.rpc("get_costo_por_pdv_json", {
    p_anio: anio,
    p_mes: mes,
  })
  if (error) return { error: error.message }
  const filas = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  return {
    data: filas.map((r: Record<string, unknown>) => ({
      id_cliente: Number(r.id_cliente),
      nombre_cliente: (r.nombre_cliente as string) ?? "",
      ciudad: (r.ciudad as string) ?? "(sin ciudad)",
      bultos: Number(r.bultos),
      comprobantes: Number(r.comprobantes),
      hl: Number(r.hl),
      venta_neta: Number(r.venta_neta),
      costo_almacen: Number(r.costo_almacen),
      costo_distrib: Number(r.costo_distrib),
      costo_distancia: Number(r.costo_distancia ?? 0),
      costo_total: Number(r.costo_total),
      costo_x_bulto: Number(r.costo_x_bulto),
      costo_x_hl: Number(r.costo_x_hl),
      pct_venta: Number(r.pct_venta),
      bultos_rechazados: Number(r.bultos_rechazados ?? 0),
      eventos_rechazo: Number(r.eventos_rechazo ?? 0),
      pct_rechazo: Number(r.pct_rechazo ?? 0),
    })),
  }
}

/** Resumen de un mes dentro del acumulado YTD. */
export interface CostoYtdMes {
  anio: number
  mes: number
  costo_total: number
  venta_neta: number
  bultos: number
  hl: number
  pdv: number
}

/**
 * ACUMULADO (YTD): suma el costo logístico por PDV de TODOS los meses cargados de
 * un año. Cada PDV se acumula sumando bultos/HL/venta/costos de cada mes; los
 * derivados ($/HL, $/bulto, % venta, % rechazo) se recalculan sobre el total para
 * que sigan siendo coherentes (no se promedian). Devuelve además el resumen por mes
 * para mostrar la evolución.
 */
export async function getCostoPorPdvYtd(
  anio: number,
): Promise<{ data: CostoPorPdvRow[]; meses: CostoYtdMes[] } | { error: string }> {
  const supabase = await createClient()
  const { data: mesesData, error: eMeses } = await supabase
    .from("costo_logistico_mensual")
    .select("mes")
    .eq("anio", anio)
    .order("mes", { ascending: true })
  if (eMeses) return { error: eMeses.message }
  const meses = (mesesData ?? []).map((r) => Number(r.mes))
  if (meses.length === 0) return { data: [], meses: [] }

  // Un mes por RPC, en paralelo (Promise.all preserva el orden de `meses`).
  const resultados = await Promise.all(meses.map((m) => getCostoPorPdv(anio, m)))

  const acc = new Map<number, CostoPorPdvRow>()
  const resumen: CostoYtdMes[] = []
  meses.forEach((mes, i) => {
    const res = resultados[i]
    if ("error" in res) return
    let cTot = 0, venta = 0, bultos = 0, hl = 0
    for (const f of res.data) {
      cTot += f.costo_total
      venta += f.venta_neta
      bultos += f.bultos
      hl += f.hl
      const cur = acc.get(f.id_cliente)
      if (!cur) {
        acc.set(f.id_cliente, { ...f })
      } else {
        cur.bultos += f.bultos
        cur.comprobantes += f.comprobantes
        cur.hl += f.hl
        cur.venta_neta += f.venta_neta
        cur.costo_almacen += f.costo_almacen
        cur.costo_distrib += f.costo_distrib
        cur.costo_distancia += f.costo_distancia
        cur.costo_total += f.costo_total
        cur.bultos_rechazados += f.bultos_rechazados
        cur.eventos_rechazo += f.eventos_rechazo
        // Me quedo con la ciudad/nombre informados (por si un mes vino sin ciudad).
        if ((!cur.ciudad || cur.ciudad === "(sin ciudad)") && f.ciudad) cur.ciudad = f.ciudad
        if (!cur.nombre_cliente && f.nombre_cliente) cur.nombre_cliente = f.nombre_cliente
      }
    }
    resumen.push({ anio, mes, costo_total: cTot, venta_neta: venta, bultos, hl, pdv: res.data.length })
  })

  // Recalcular los derivados sobre los totales acumulados.
  const filas = [...acc.values()].map((f) => ({
    ...f,
    costo_x_bulto: f.bultos ? f.costo_total / f.bultos : 0,
    costo_x_hl: f.hl ? f.costo_total / f.hl : 0,
    pct_venta: f.venta_neta ? (100 * f.costo_total) / f.venta_neta : 0,
    pct_rechazo:
      f.bultos + f.bultos_rechazados
        ? (100 * f.bultos_rechazados) / (f.bultos + f.bultos_rechazados)
        : 0,
  }))
  return { data: filas, meses: resumen }
}

/**
 * SIMULACIÓN: costo logístico por PDV recalculando el modelo con un centro de
 * distribución y distancias (km por ciudad) ALTERNATIVOS, sin tocar la tabla
 * costo_km_ciudad ni los datos reales. Usa la RPC get_costo_por_pdv_sim, idéntica
 * a get_costo_por_pdv salvo que los km salen del parámetro p_km.
 *
 * @param km mapa ciudad -> km de ruta desde el CD simulado (ej. {"San Nicolás":8,...}).
 */
export async function getCostoPorPdvSim(
  anio: number,
  mes: number,
  km: Record<string, number>,
): Promise<{ data: CostoPorPdvRow[] } | { error: string }> {
  const supabase = await createClient()
  // Variante _json (jsonb con TODOS los PDV) para que PostgREST no trunque a 1000 filas.
  const { data, error } = await supabase.rpc("get_costo_por_pdv_sim_json", {
    p_anio: anio,
    p_mes: mes,
    p_km: km,
  })
  if (error) return { error: error.message }
  const filas = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  return {
    data: filas.map((r: Record<string, unknown>) => ({
      id_cliente: Number(r.id_cliente),
      nombre_cliente: (r.nombre_cliente as string) ?? "",
      ciudad: (r.ciudad as string) ?? "(sin ciudad)",
      bultos: Number(r.bultos),
      comprobantes: Number(r.comprobantes),
      hl: Number(r.hl),
      venta_neta: Number(r.venta_neta),
      costo_almacen: Number(r.costo_almacen),
      costo_distrib: Number(r.costo_distrib),
      costo_distancia: Number(r.costo_distancia ?? 0),
      costo_total: Number(r.costo_total),
      costo_x_bulto: Number(r.costo_x_bulto),
      costo_x_hl: Number(r.costo_x_hl),
      pct_venta: Number(r.pct_venta),
      bultos_rechazados: Number(r.bultos_rechazados ?? 0),
      eventos_rechazo: Number(r.eventos_rechazo ?? 0),
      pct_rechazo: Number(r.pct_rechazo ?? 0),
    })),
  }
}

/** Alta/edición de los costos mensuales (solo roles de gestión). */
export async function guardarCostoMensual(input: {
  anio: number
  mes: number
  distribucion: number
  almacen: number
  w_rodaje: number
  km_totales: number | null
}): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile || !ROLES_EDITORES.includes(profile.role)) {
    return { error: "No tenés permiso para editar costos." }
  }
  if (input.mes < 1 || input.mes > 12) return { error: "Mes inválido." }
  if (input.w_rodaje < 0 || input.w_rodaje > 1)
    return { error: "El peso de rodaje debe estar entre 0 y 1." }
  if (input.distribucion < 0 || input.almacen < 0)
    return { error: "Los costos no pueden ser negativos." }
  if (input.km_totales != null && input.km_totales < 0)
    return { error: "El kilometraje no puede ser negativo." }

  const supabase = await createClient()
  const { error } = await supabase.from("costo_logistico_mensual").upsert(
    {
      anio: input.anio,
      mes: input.mes,
      distribucion: input.distribucion,
      almacen: input.almacen,
      w_rodaje: input.w_rodaje,
      km_totales: input.km_totales,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: "anio,mes" },
  )
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/costo-por-pdv")
  return { ok: true }
}
