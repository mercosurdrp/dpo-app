"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"

// ---------- Types ----------

export interface MiEntregaHoy {
  dominio: string | null
  tml_minutos: number | null
  bultos_entregados: number
  total_hl: number
  viajes: number
  bultos_rechazados: number
  cantidad_rechazos: number
  pct_rechazo: number
}

export interface MiEntregaResumenMes {
  total_bultos: number
  total_viajes: number
  total_rechazados: number
  pct_rechazo_mes: number
  promedio_bultos_dia: number
  dias_con_entrega: number
}

export interface MiEntregaDia {
  fecha: string
  dominio: string | null
  bultos: number
  viajes: number
  rechazos: number
  tml_minutos: number | null
}

export interface MiEntregaData {
  hoy: MiEntregaHoy | null
  resumen_mes: MiEntregaResumenMes
  historial: MiEntregaDia[]
  vinculado: boolean
  nombre_chofer: string | null
}

// ---------- Action ----------

export async function getMiEntrega(): Promise<
  { data: MiEntregaData } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // 1. Get empleado
    const { data: empleado } = await supabase
      .from("empleados")
      .select("id, legajo, nombre")
      .eq("profile_id", profile.id)
      .single()

    if (!empleado) return { error: "No se encontró tu legajo" }

    // 2. Get mappings (use admin client to bypass RLS on mapping tables)
    const admin = createAdminClient()
    const [choferRes, fleteroRes] = await Promise.all([
      admin
        .from("mapeo_empleado_chofer")
        .select("nombre_chofer")
        .eq("empleado_id", empleado.id)
        .limit(1)
        .maybeSingle(),
      admin
        .from("mapeo_empleado_fletero")
        .select("ds_fletero_carga")
        .eq("empleado_id", empleado.id),
    ])

    const nombreChofer = choferRes.data?.nombre_chofer ?? null
    const fleteroPaltes = (fleteroRes.data ?? []).map((f) => f.ds_fletero_carga)

    // Not linked at all
    if (!nombreChofer && fleteroPaltes.length === 0) {
      return {
        data: {
          hoy: null,
          resumen_mes: { total_bultos: 0, total_viajes: 0, total_rechazados: 0, pct_rechazo_mes: 0, promedio_bultos_dia: 0, dias_con_entrega: 0 },
          historial: [],
          vinculado: false,
          nombre_chofer: null,
        },
      }
    }

    // 3. Date ranges
    const hoy = new Date().toISOString().slice(0, 10)
    const mes = new Date().getMonth() + 1
    const anio = new Date().getFullYear()
    const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

    // 4. Fetch data in parallel
    // 4a. TML records (via chofer name OR ayudante) — for dominio + tml_minutos
    const tmlPromise = nombreChofer
      ? admin
          .from("registros_vehiculos")
          .select("fecha, dominio, tml_minutos, tipo")
          .or(`chofer.eq.${nombreChofer},ayudante1.eq.${nombreChofer},ayudante2.eq.${nombreChofer}`)
          .gte("fecha", primerDia)
          .lte("fecha", ultimaFecha)
          .order("fecha", { ascending: false })
      : Promise.resolve({ data: [] as { fecha: string; dominio: string; tml_minutos: number | null; tipo: string }[] })

    // 4b. For ventas + rechazos, we need to know which plates to query
    // Strategy: use fletero mapping plates + any plates from TML records
    // First get TML data to discover plates driven this month
    const tmlResult = await tmlPromise
    const tmlRecords = (tmlResult.data ?? []) as {
      fecha: string; dominio: string; tml_minutos: number | null; tipo: string
    }[]

    // Build set of all plates: static mapping + dynamic from TML
    const allPlates = new Set(fleteroPaltes)
    for (const r of tmlRecords) {
      if (r.dominio) allPlates.add(r.dominio)
    }

    // If no plates found, we can only show TML data
    const platesArr = [...allPlates]

    // 4c. Ventas diarias for all plates this month
    const ventasPromise = platesArr.length > 0
      ? admin
          .from("ventas_diarias")
          .select("fecha, ds_fletero_carga, total_bultos, total_hl, viajes")
          .in("ds_fletero_carga", platesArr)
          .gte("fecha", primerDia)
          .lte("fecha", ultimaFecha)
      : Promise.resolve({ data: [] as { fecha: string; ds_fletero_carga: string; total_bultos: number; total_hl: number; viajes: number }[] })

    // 4d. Rechazos for all plates this month
    const rechazosPromise = platesArr.length > 0
      ? admin
          .from("rechazos")
          .select("fecha, ds_fletero_carga, bultos_rechazados")
          .in("ds_fletero_carga", platesArr)
          .gte("fecha", primerDia)
          .lte("fecha", ultimaFecha)
      : Promise.resolve({ data: [] as { fecha: string; ds_fletero_carga: string; bultos_rechazados: number }[] })

    const [ventasResult, rechazosResult] = await Promise.all([ventasPromise, rechazosPromise])

    const ventas = (ventasResult.data ?? []) as {
      fecha: string; ds_fletero_carga: string; total_bultos: number; total_hl: number; viajes: number
    }[]
    const rechazos = (rechazosResult.data ?? []) as {
      fecha: string; ds_fletero_carga: string; bultos_rechazados: number
    }[]

    // 5. Build TML lookup: fecha → { dominio, tml_minutos } (use latest egreso)
    const tmlByDate = new Map<string, { dominio: string; tml_minutos: number | null }>()
    // Process in ascending order so last egreso wins
    const sortedTml = [...tmlRecords].sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (const r of sortedTml) {
      if (r.tipo === "egreso") {
        tmlByDate.set(r.fecha, { dominio: r.dominio, tml_minutos: r.tml_minutos })
      } else if (!tmlByDate.has(r.fecha)) {
        tmlByDate.set(r.fecha, { dominio: r.dominio, tml_minutos: null })
      }
    }

    // 6. Build ventas lookup: fecha → aggregated
    const ventasByDate = new Map<string, { bultos: number; hl: number; viajes: number }>()
    for (const v of ventas) {
      const prev = ventasByDate.get(v.fecha) ?? { bultos: 0, hl: 0, viajes: 0 }
      prev.bultos += Number(v.total_bultos) || 0
      prev.hl += Number(v.total_hl) || 0
      prev.viajes += Number(v.viajes) || 0
      ventasByDate.set(v.fecha, prev)
    }

    // 7. Build rechazos lookup: fecha → aggregated
    const rechazosByDate = new Map<string, { bultos: number; count: number }>()
    for (const r of rechazos) {
      const prev = rechazosByDate.get(r.fecha) ?? { bultos: 0, count: 0 }
      prev.bultos += Number(r.bultos_rechazados) || 0
      prev.count += 1
      rechazosByDate.set(r.fecha, prev)
    }

    // 8. Build TODAY
    const tmlHoy = tmlByDate.get(hoy)
    const ventasHoy = ventasByDate.get(hoy)
    const rechazosHoy = rechazosByDate.get(hoy)

    const entregaHoy: MiEntregaHoy | null = (ventasHoy || tmlHoy) ? {
      dominio: tmlHoy?.dominio ?? null,
      tml_minutos: tmlHoy?.tml_minutos ?? null,
      bultos_entregados: ventasHoy?.bultos ?? 0,
      total_hl: ventasHoy?.hl ?? 0,
      viajes: ventasHoy?.viajes ?? 0,
      bultos_rechazados: rechazosHoy?.bultos ?? 0,
      cantidad_rechazos: rechazosHoy?.count ?? 0,
      pct_rechazo: ventasHoy && ventasHoy.bultos > 0
        ? Math.round((rechazosHoy?.bultos ?? 0) / ventasHoy.bultos * 10000) / 100
        : 0,
    } : null

    // 9. Build MONTHLY SUMMARY
    let totalBultos = 0
    let totalViajes = 0
    let totalRechazados = 0
    let diasConEntrega = 0

    for (const [, v] of ventasByDate) {
      totalBultos += v.bultos
      totalViajes += v.viajes
      diasConEntrega++
    }
    for (const [, r] of rechazosByDate) {
      totalRechazados += r.bultos
    }

    const resumenMes: MiEntregaResumenMes = {
      total_bultos: Math.round(totalBultos),
      total_viajes: totalViajes,
      total_rechazados: Math.round(totalRechazados),
      pct_rechazo_mes: totalBultos > 0
        ? Math.round(totalRechazados / totalBultos * 10000) / 100
        : 0,
      promedio_bultos_dia: diasConEntrega > 0
        ? Math.round(totalBultos / diasConEntrega)
        : 0,
      dias_con_entrega: diasConEntrega,
    }

    // 10. Build LAST 7 DAYS
    const historial: MiEntregaDia[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const fecha = d.toISOString().slice(0, 10)

      const tml = tmlByDate.get(fecha)
      const venta = ventasByDate.get(fecha)
      const rechazo = rechazosByDate.get(fecha)

      historial.push({
        fecha,
        dominio: tml?.dominio ?? null,
        bultos: venta?.bultos ?? 0,
        viajes: venta?.viajes ?? 0,
        rechazos: rechazo?.bultos ?? 0,
        tml_minutos: tml?.tml_minutos ?? null,
      })
    }

    return {
      data: {
        hoy: entregaHoy,
        resumen_mes: resumenMes,
        historial,
        vinculado: true,
        nombre_chofer: nombreChofer,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando entregas" }
  }
}
