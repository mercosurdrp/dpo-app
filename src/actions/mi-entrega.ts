"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { hoyAR } from "@/lib/herramientas-gestion"
import {
  loadResolucionGescom,
  resolverFleteroGescom,
} from "@/lib/gescom/ventas-patente"

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

// ---------- Helpers ----------

/** SELECT paginado: PostgREST corta en 1000 filas y las de Gestión (un mes de
 *  todos los repartos) pueden superarlo. */
async function fetchTodo<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return rows
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

    // 3. Date ranges — en hora ARGENTINA: el server corre en UTC, y con
    // toISOString() después de las 21:00 el "hoy" ya era mañana (la tarjeta
    // del día mostraba 0 justo cuando el chofer volvía del reparto).
    const hoy = hoyAR()
    const anio = Number(hoy.slice(0, 4))
    const mes = Number(hoy.slice(5, 7))
    const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

    // 4. Fetch data in parallel
    // 4a. TML records (via chofer name OR ayudante) — for dominio + tml_minutos
    const tmlPromise = nombreChofer
      ? admin
          .from("registros_vehiculos")
          .select("fecha, dominio, tml_minutos, tipo")
          // Comillas: sin ellas, una coma o paréntesis en el nombre rompe el
          // filtro de PostgREST y el chofer queda sin patentes (bultos 0).
          .or(`chofer.eq."${nombreChofer}",ayudante1.eq."${nombreChofer}",ayudante2.eq."${nombreChofer}"`)
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

    // 4e. Ventas y rechazos de GESCOM ("Gestión"): se guardan con
    // ds_fletero_carga = 'GESTION-<codigoChofer>', NO con la patente, así que
    // el .in() por patentes de arriba no los ve — un chofer que reparte carga
    // de Gestión veía solo la mitad Chess de sus bultos. Se resuelve la
    // patente del día (checklist → patente_default de mapeo_chofer_gescom) y
    // se suma lo que caiga en las patentes del empleado.
    if (platesArr.length > 0) {
      const resolucion = await loadResolucionGescom(admin, primerDia, ultimaFecha)
      if (resolucion.choferes.size > 0) {
        const platesNorm = new Set(platesArr.map((p) => (p ?? "").trim().toUpperCase()))
        const [ventasGescom, rechazosGescom] = await Promise.all([
          fetchTodo<(typeof ventas)[number]>((a, b) =>
            admin
              .from("ventas_diarias")
              .select("fecha, ds_fletero_carga, total_bultos, total_hl, viajes")
              .like("ds_fletero_carga", "GESTION%")
              .gte("fecha", primerDia)
              .lte("fecha", ultimaFecha)
              .order("id")
              .range(a, b),
          ),
          fetchTodo<(typeof rechazos)[number]>((a, b) =>
            admin
              .from("rechazos")
              .select("fecha, ds_fletero_carga, bultos_rechazados")
              .like("ds_fletero_carga", "GESTION%")
              .gte("fecha", primerDia)
              .lte("fecha", ultimaFecha)
              .order("id")
              .range(a, b),
          ),
        ])
        const patenteDelEmpleado = (row: { fecha: string; ds_fletero_carga: string }): string | null => {
          // Si el código GESTION-xxxx está mapeado a mano como fletero del
          // empleado, ya entró por el .in() de arriba: no doble-contar.
          if (platesNorm.has((row.ds_fletero_carga ?? "").trim().toUpperCase())) return null
          const r = resolverFleteroGescom(row.ds_fletero_carga, row.fecha, resolucion)
          return r.tipo === "patente" && platesNorm.has(r.patente) ? r.patente : null
        }
        // En Gestión `viajes` guarda COMPROBANTES (decenas), no planillas como
        // Chess — y la carga va arriba del mismo camión: 0 viajes si Chess ya
        // contó el viaje de esa patente ese día, 1 si fue solo de Gestión.
        const viajesChess = new Set(
          ventas.map((v) => `${v.fecha}|${(v.ds_fletero_carga ?? "").trim().toUpperCase()}`),
        )
        for (const row of ventasGescom) {
          const patente = patenteDelEmpleado(row)
          if (!patente) continue
          ventas.push({ ...row, viajes: viajesChess.has(`${row.fecha}|${patente}`) ? 0 : 1 })
        }
        for (const row of rechazosGescom) {
          if (patenteDelEmpleado(row)) rechazos.push(row)
        }
      }
    }

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
      // Derivar del "hoy" argentino, no del reloj UTC del server.
      const d = new Date(`${hoy}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - i)
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
