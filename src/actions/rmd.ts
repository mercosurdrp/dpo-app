"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

// RMD = Rate My Delivery (Power BI de Quilmes). Cada entrega se puntúa 1-5.
// Detractor = puntuación 1-3. La base individual vive en nps_rmd_cliente.

export interface RmdResumen {
  anio: number
  /** Promedio simple de todas las puntuaciones del año (1-5). */
  rmd: number | null
  /** Cantidad de entregas puntuadas. */
  rmd_respuestas: number
  /** Puntuaciones 1-3. */
  detractores: number
  /** % de detractoras sobre el total. */
  pct_detractores: number | null
  /** Clientes distintos que puntuaron. */
  clientes: number
  ultima_puntuacion: string | null
  /** Última corrida OK del sync con el Power BI (nps_sync_log). */
  actualizado_en: string | null
}

export interface RmdMes {
  mes: number // 1-12
  rmd: number | null
  puntuadas: number
  detractores: number
  otif_interno: number | null // 1 - bultos_rechazados/bultos_entregados (def. 109)
}

export interface RmdDistribucion {
  puntuacion: number // 1-5
  cantidad: number
  pct: number
}

export interface RmdMotivo {
  motivo: string
  cantidad: number
}

export interface RmdPromotor {
  promotor: string
  rmd: number
  puntuaciones: number
  detractoras: number
}

export interface RmdCliente {
  cod_cliente: number
  nombre_cliente: string
  promotor: string | null
  localidad: string | null
  /** Chofer de la última entrega del cliente (reemplaza al promotor en la UI). */
  chofer: string | null
  rmd: number
  puntuaciones: number
  detractoras: number
  ultima_fecha: string
  ultima_puntuacion: number
}

/** Cliente que puntuó bajo (1-3) y después se recuperó (última 4-5). */
export interface RmdRecuperado {
  cod_cliente: number
  nombre_cliente: string
  localidad: string | null
  chofer: string | null
  punt_antes: number
  fecha_antes: string
  punt_ahora: number
  fecha_ahora: string
}

export interface RmdDashboardData {
  resumen: RmdResumen
  por_mes: RmdMes[]
  distribucion: RmdDistribucion[]
  motivos: RmdMotivo[]
  por_promotor: RmdPromotor[]
  clientes: RmdCliente[]
  recuperados: RmdRecuperado[]
}

interface RmdRow {
  cod_cliente: number
  nombre_cliente: string | null
  promotor: string | null
  localidad: string | null
  fecha_puntuacion: string
  puntuacion: number
  motivos: string | null
  vehiculo_entrega: string | null
  fecha_entrega: string | null
}

export interface RmdPunto {
  fecha_puntuacion: string
  fecha_entrega: string | null
  nro_pedido: string | null
  puntuacion: number
  motivos: string | null
  comentario: string | null
  /** Patente(s) del camión que entregó (Chess dsFleteroCarga). */
  vehiculo_entrega: string | null
  /** Chofer(es) que entregó. Preferimos el del TML/check de ESE día. */
  chofer: string | null
  /** true = chofer del TML/check de ese día (exacto); false = chofer asignado al camión (aproximado, no hubo TML ese día). */
  chofer_exacto: boolean
}

const ANIO = 2026
const PAGE = 1000

export async function getRmdDashboard(): Promise<Result<RmdDashboardData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // La base de RMD puede superar el tope por defecto de PostgREST: paginamos.
    const filas: RmdRow[] = []
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await supabase
        .from("nps_rmd_cliente")
        .select(
          "cod_cliente, nombre_cliente, promotor, localidad, fecha_puntuacion, puntuacion, motivos, vehiculo_entrega, fecha_entrega",
        )
        .gte("fecha_puntuacion", `${ANIO}-01-01`)
        .lt("fecha_puntuacion", `${ANIO + 1}-01-01`)
        .order("fecha_puntuacion", { ascending: true })
        .range(desde, desde + PAGE - 1)
      if (error) return { error: error.message }
      const lote = (data ?? []) as unknown as RmdRow[]
      filas.push(...lote)
      if (lote.length < PAGE) break
    }

    const [rechRes, syncRes] = await Promise.all([
      supabase
        .from("v_nps_otif_mensual")
        .select("mes, otif_interno")
        .eq("anio", ANIO),
      supabase
        .from("nps_sync_log")
        .select("ejecutado_en")
        .eq("ok", true)
        .order("ejecutado_en", { ascending: false })
        .limit(1),
    ])

    const otifPorMes = new Map<number, number | null>()
    for (const r of (rechRes.data ?? []) as Array<{
      mes: number
      otif_interno: number | null
    }>) {
      otifPorMes.set(r.mes, r.otif_interno)
    }

    // ---- resumen anual ----
    const total = filas.length
    let suma = 0
    let detractores = 0
    const clientesSet = new Set<number>()
    for (const f of filas) {
      suma += f.puntuacion
      if (f.puntuacion <= 3) detractores += 1
      clientesSet.add(f.cod_cliente)
    }
    const resumen: RmdResumen = {
      anio: ANIO,
      rmd: total ? round2(suma / total) : null,
      rmd_respuestas: total,
      detractores,
      pct_detractores: total ? round1((detractores / total) * 100) : null,
      clientes: clientesSet.size,
      ultima_puntuacion: total ? filas[total - 1].fecha_puntuacion : null,
      actualizado_en:
        ((syncRes.data ?? []) as Array<{ ejecutado_en: string }>)[0]
          ?.ejecutado_en ?? null,
    }

    // ---- por mes ----
    const meses = new Map<number, { suma: number; n: number; det: number }>()
    for (const f of filas) {
      const mes = Number(f.fecha_puntuacion.slice(5, 7))
      const cur = meses.get(mes) ?? { suma: 0, n: 0, det: 0 }
      cur.suma += f.puntuacion
      cur.n += 1
      if (f.puntuacion <= 3) cur.det += 1
      meses.set(mes, cur)
    }
    const mesMax = Math.max(...meses.keys(), ...otifPorMes.keys(), 1)
    const por_mes: RmdMes[] = []
    for (let mes = 1; mes <= mesMax; mes++) {
      const c = meses.get(mes)
      por_mes.push({
        mes,
        rmd: c && c.n ? round2(c.suma / c.n) : null,
        puntuadas: c?.n ?? 0,
        detractores: c?.det ?? 0,
        otif_interno: otifPorMes.get(mes) ?? null,
      })
    }

    // ---- distribución de puntuaciones 1-5 ----
    const distCount = new Map<number, number>()
    for (const f of filas) {
      distCount.set(f.puntuacion, (distCount.get(f.puntuacion) ?? 0) + 1)
    }
    const distribucion: RmdDistribucion[] = []
    for (let p = 1; p <= 5; p++) {
      const cantidad = distCount.get(p) ?? 0
      distribucion.push({
        puntuacion: p,
        cantidad,
        pct: total ? round1((cantidad / total) * 100) : 0,
      })
    }

    // ---- motivos de baja puntuación (texto libre del Power BI) ----
    const motivoCount = new Map<string, number>()
    for (const f of filas) {
      const m = (f.motivos ?? "").trim()
      if (!m) continue
      motivoCount.set(m, (motivoCount.get(m) ?? 0) + 1)
    }
    const motivos: RmdMotivo[] = [...motivoCount.entries()]
      .map(([motivo, cantidad]) => ({ motivo, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)

    // ---- por promotor ----
    const porProm = new Map<string, { suma: number; n: number; det: number }>()
    for (const f of filas) {
      if (!f.promotor) continue
      const cur = porProm.get(f.promotor) ?? { suma: 0, n: 0, det: 0 }
      cur.suma += f.puntuacion
      cur.n += 1
      if (f.puntuacion <= 3) cur.det += 1
      porProm.set(f.promotor, cur)
    }
    const por_promotor: RmdPromotor[] = [...porProm.entries()]
      .map(([promotor, c]) => ({
        promotor,
        rmd: round2(c.suma / c.n),
        puntuaciones: c.n,
        detractoras: c.det,
      }))
      .sort((a, b) => a.rmd - b.rmd || b.detractoras - a.detractoras)

    // ---- por cliente (agregado; el detalle se trae on-demand) ----
    const porCli = new Map<
      number,
      {
        nombre: string | null
        promotor: string | null
        localidad: string | null
        suma: number
        n: number
        det: number
        ultimaFecha: string
        ultimaPunt: number
        // patente/fecha de la última entrega con vehículo (para el chofer)
        ultimaPatente: string | null
        ultimaFechaEntrega: string | null
        // última puntuación baja (1-3) vista, para detectar recuperación
        ultimaBajaPunt: number | null
        ultimaBajaFecha: string | null
      }
    >()
    for (const f of filas) {
      const cur = porCli.get(f.cod_cliente) ?? {
        nombre: null,
        promotor: null,
        localidad: null,
        suma: 0,
        n: 0,
        det: 0,
        ultimaFecha: f.fecha_puntuacion,
        ultimaPunt: f.puntuacion,
        ultimaPatente: null,
        ultimaFechaEntrega: null,
        ultimaBajaPunt: null,
        ultimaBajaFecha: null,
      }
      cur.suma += f.puntuacion
      cur.n += 1
      // "baja" = 1-3. filas asc por fecha → guardamos la baja más reciente.
      if (f.puntuacion <= 3) {
        cur.det += 1
        cur.ultimaBajaPunt = f.puntuacion
        cur.ultimaBajaFecha = f.fecha_puntuacion
      }
      // filas vienen ordenadas asc por fecha → la última gana
      cur.ultimaFecha = f.fecha_puntuacion
      cur.ultimaPunt = f.puntuacion
      cur.nombre = f.nombre_cliente ?? cur.nombre
      cur.promotor = f.promotor ?? cur.promotor
      cur.localidad = f.localidad ?? cur.localidad
      // el chofer mostrado es el de la entrega más reciente que tenga patente
      if (f.vehiculo_entrega) {
        cur.ultimaPatente = f.vehiculo_entrega
        cur.ultimaFechaEntrega = f.fecha_entrega
      }
      porCli.set(f.cod_cliente, cur)
    }

    // Chofer de la última entrega de cada cliente (fecha-aware + regla OJA403).
    const patentesDash = [
      ...new Set(
        filas
          .flatMap((f) => (f.vehiculo_entrega ?? "").split("/"))
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    ]
    const [choferPorDiaD, choferAsignadoD] = await Promise.all([
      getChoferPorDia(supabase, patentesDash),
      getChoferAsignado(supabase),
    ])

    const clientes: RmdCliente[] = [...porCli.entries()]
      .map(([cod, c]) => ({
        cod_cliente: cod,
        nombre_cliente: c.nombre ?? `Cliente ${cod}`,
        promotor: c.promotor,
        localidad: c.localidad,
        chofer: resolverChofer(
          c.ultimaPatente,
          c.ultimaFechaEntrega,
          c.localidad,
          choferPorDiaD,
          choferAsignadoD,
        ).chofer,
        rmd: round2(c.suma / c.n),
        puntuaciones: c.n,
        detractoras: c.det,
        ultima_fecha: c.ultimaFecha,
        ultima_puntuacion: c.ultimaPunt,
      }))
      // peores RMD primero, desempate por más detractoras
      .sort((a, b) => a.rmd - b.rmd || b.detractoras - a.detractoras)

    // ---- clientes recuperados: tuvieron una baja (1-3) y su última es alta (4-5) ----
    const choferCli = new Map(clientes.map((c) => [c.cod_cliente, c.chofer]))
    const recuperados: RmdRecuperado[] = [...porCli.entries()]
      .filter(
        // recuperado = su última puntuación es 5 (el tope) y antes tuvo una baja (1-4)
        ([, c]) => c.ultimaPunt === 5 && c.ultimaBajaFecha != null,
      )
      .map(([cod, c]) => ({
        cod_cliente: cod,
        nombre_cliente: c.nombre ?? `Cliente ${cod}`,
        localidad: c.localidad,
        chofer: choferCli.get(cod) ?? null,
        punt_antes: c.ultimaBajaPunt as number,
        fecha_antes: c.ultimaBajaFecha as string,
        punt_ahora: c.ultimaPunt,
        fecha_ahora: c.ultimaFecha,
      }))
      // los que se recuperaron más recientemente primero
      .sort((a, b) => b.fecha_ahora.localeCompare(a.fecha_ahora))

    return {
      data: {
        resumen,
        por_mes,
        distribucion,
        motivos,
        por_promotor,
        clientes,
        recuperados,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando el dashboard RMD",
    }
  }
}

interface RmdPuntoRow {
  fecha_puntuacion: string
  fecha_entrega: string | null
  nro_pedido: string | null
  puntuacion: number
  motivos: string | null
  comentario: string | null
  vehiculo_entrega: string | null
  localidad: string | null
}

/** Puntuaciones individuales de un cliente (para el modal del explorador). */
export async function getRmdPuntuacionesCliente(
  codCliente: number,
): Promise<Result<RmdPunto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("nps_rmd_cliente")
      .select(
        "fecha_puntuacion, fecha_entrega, nro_pedido, puntuacion, motivos, comentario, vehiculo_entrega, localidad",
      )
      .eq("cod_cliente", codCliente)
      .gte("fecha_puntuacion", `${ANIO}-01-01`)
      .lt("fecha_puntuacion", `${ANIO + 1}-01-01`)
      .order("fecha_puntuacion", { ascending: false })
    if (error) return { error: error.message }
    const filas = (data ?? []) as unknown as RmdPuntoRow[]

    // Un mismo camión lo maneja distinto chofer según el día. Por eso el chofer
    // se resuelve por (patente + fecha de entrega) contra el TML/check de ESE
    // día (registros_vehiculos / checklist_vehiculos). Si ese día no hubo TML,
    // caemos al chofer asignado al camión (mapeo_empleado_fletero), marcándolo
    // como aproximado.
    const patentes = [
      ...new Set(
        filas
          .flatMap((f) => (f.vehiculo_entrega ?? "").split("/"))
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    ]
    const [choferPorDia, choferAsignado] = await Promise.all([
      getChoferPorDia(supabase, patentes),
      getChoferAsignado(supabase),
    ])
    const puntos: RmdPunto[] = filas.map((f) => {
      const r = resolverChofer(
        f.vehiculo_entrega,
        f.fecha_entrega,
        f.localidad,
        choferPorDia,
        choferAsignado,
      )
      return { ...f, chofer: r.chofer, chofer_exacto: r.exacto }
    })
    return { data: puntos }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando las puntuaciones del cliente",
    }
  }
}

/**
 * Mapa "PATENTE|FECHA" → chofer que hizo el TML/check de ese camión ese día.
 * Fuentes: registros_vehiculos (TML) y checklist_vehiculos (check diario).
 * Es la fuente fecha-aware: el chofer real de la entrega, no el asignado fijo.
 */
async function getChoferPorDia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patentes: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (patentes.length === 0) return map
  const [reg, chk] = await Promise.all([
    supabase
      .from("registros_vehiculos")
      .select("dominio, fecha, chofer")
      .in("dominio", patentes),
    supabase
      .from("checklist_vehiculos")
      .select("dominio, fecha, chofer")
      .in("dominio", patentes),
  ])
  type DiaRow = { dominio: string | null; fecha: string | null; chofer: string | null }
  // El TML (registros_vehiculos) manda; el check completa lo que falte.
  for (const src of [chk.data, reg.data] as Array<DiaRow[] | null>) {
    for (const r of src ?? []) {
      const dom = (r.dominio ?? "").trim()
      const chofer = (r.chofer ?? "").trim()
      if (dom && r.fecha && chofer) map.set(`${dom}|${r.fecha}`, chofer)
    }
  }
  return map
}

/** Mapa patente → chofer asignado al camión (fallback), mapeo_empleado_fletero. */
async function getChoferAsignado(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data: mapeo } = await supabase
    .from("mapeo_empleado_fletero")
    .select("ds_fletero_carga, empleado_id")
  const filas = (mapeo ?? []) as Array<{
    ds_fletero_carga: string | null
    empleado_id: string | null
  }>
  const ids = [...new Set(filas.map((f) => f.empleado_id).filter(Boolean))] as string[]
  if (ids.length === 0) return map
  const { data: emps } = await supabase
    .from("empleados")
    .select("id, nombre")
    .in("id", ids)
  const nombrePorId = new Map<string, string>()
  for (const e of (emps ?? []) as Array<{ id: string; nombre: string | null }>) {
    if (e.nombre) nombrePorId.set(e.id, e.nombre)
  }
  for (const f of filas) {
    const pat = (f.ds_fletero_carga ?? "").trim()
    const nom = f.empleado_id ? nombrePorId.get(f.empleado_id) : undefined
    if (pat && nom) map.set(pat, nom)
  }
  return map
}

/**
 * Resuelve el/los chofer(es) de una entrega. Por cada patente busca primero el
 * chofer del TML/check de esa fecha (exacto); si no hay, cae al asignado.
 * Regla especial: OJA403 no carga TML; cuando entrega a Pergamino lo maneja
 * FRIAS ANGEL. exacto = true sólo si TODOS los nombres salieron del día.
 */
function resolverChofer(
  patentes: string | null,
  fecha: string | null,
  localidad: string | null,
  porDia: Map<string, string>,
  asignado: Map<string, string>,
): { chofer: string | null; exacto: boolean } {
  if (!patentes) return { chofer: null, exacto: false }
  const esPergamino = (localidad ?? "").toUpperCase().includes("PERGAMINO")
  const nombres = new Set<string>()
  let todosDelDia = true
  let huboMatch = false
  for (const raw of patentes.split("/")) {
    const pat = raw.trim()
    if (!pat) continue
    const delDia = fecha ? porDia.get(`${pat}|${fecha}`) : undefined
    if (delDia) {
      nombres.add(delDia)
      huboMatch = true
      continue
    }
    const asig = asignado.get(pat)
    if (asig) {
      nombres.add(asig)
      huboMatch = true
      todosDelDia = false
      continue
    }
    if (pat === "OJA403" && esPergamino) {
      nombres.add("FRIAS ANGEL")
      huboMatch = true
      todosDelDia = false
    }
  }
  if (!huboMatch) return { chofer: null, exacto: false }
  return { chofer: [...nombres].join(" / "), exacto: todosDelDia }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
