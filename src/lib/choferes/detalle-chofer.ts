/**
 * Detalle por chofer en un rango de fechas, para la página
 * `/indicadores/choferes/[choferId]`. Timeline diario con bultos, HL,
 * TML, rechazos y patentes manejadas cada día.
 *
 * Misma lógica de resolución que `resumen-mes.ts`:
 *   egreso TML del día > mapeo nominal > "Sin asignar"
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

export interface ChoferDetalleDia {
  fecha: string
  patentes: string[]
  bultos: number
  hl: number
  viajes: number
  tml_minutos: number | null
  /** Cantidad de egresos registrados ese día (para promedios ponderados). */
  tml_egresos: number
  rechazos_bultos: number
  rechazos_eventos: number
  rechazos_pct: number | null
  fuente: "tml" | "mapeo" | "mixto"
  /** ID de la reunión si hay alguna ese día (cualquier tipo). */
  reunion_id: string | null
}

export interface ChoferDetalle {
  chofer_id: string | null
  chofer_nombre: string
  desde: string
  hasta: string
  kpis: {
    dias_trabajados: number
    bultos: number
    hl: number
    viajes: number
    tml_promedio: number | null
    rechazos_bultos: number
    rechazos_pct: number | null
  }
  por_dia: ChoferDetalleDia[]
}

const BUCKET_SIN_ASIGNAR_NOMBRE = "(Sin asignar)"
/** Sentinel que usa la página para representar "Sin asignar" en la URL. */
export const SIN_ASIGNAR_SENTINEL = "sin-asignar"

export async function getChoferDetalle(
  supa: SupaClient,
  choferIdOrSentinel: string,
  fechaDesde: string,
  fechaHasta: string,
): Promise<ChoferDetalle> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta) ||
    fechaDesde > fechaHasta
  ) {
    throw new Error("Rango de fechas inválido")
  }

  const buscarSinAsignar = choferIdOrSentinel === SIN_ASIGNAR_SENTINEL
  const choferIdBuscado = buscarSinAsignar ? null : choferIdOrSentinel

  const [ventasRaw, registrosRaw, rechazosRaw, mapeoRaw, choferesRaw, reunionesRaw] =
    await Promise.all([
      supa
        .from("ventas_diarias")
        .select("fecha, ds_fletero_carga, total_bultos, total_hl, viajes")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta),
      supa
        .from("registros_vehiculos")
        .select("fecha, dominio, chofer, hora, tml_minutos")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .eq("tipo", "egreso"),
      supa
        .from("rechazos")
        .select("fecha, ds_fletero_carga, bultos_rechazados")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta),
      supa
        .from("mapeo_patente_chofer")
        .select("patente, chofer_id")
        .eq("activo", true),
      supa
        .from("catalogo_choferes")
        .select("id, nombre")
        .eq("active", true),
      supa
        .from("reuniones")
        .select("id, fecha")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta),
    ])

  if (ventasRaw.error) throw new Error(`ventas_diarias: ${ventasRaw.error.message}`)
  if (registrosRaw.error)
    throw new Error(`registros_vehiculos: ${registrosRaw.error.message}`)
  if (rechazosRaw.error) throw new Error(`rechazos: ${rechazosRaw.error.message}`)

  const idToNombre = new Map<string, string>()
  const nombreUpperToId = new Map<string, string>()
  for (const c of (choferesRaw.data ?? []) as Array<{
    id: string
    nombre: string
  }>) {
    idToNombre.set(c.id, c.nombre)
    nombreUpperToId.set(c.nombre.toUpperCase().trim(), c.id)
  }

  // Si no es "sin asignar" y no aparece en el catálogo, devolvemos vacío
  let nombreBuscado = BUCKET_SIN_ASIGNAR_NOMBRE
  if (!buscarSinAsignar) {
    nombreBuscado = idToNombre.get(choferIdOrSentinel) ?? choferIdOrSentinel
  }

  const mapeoNominal = new Map<string, string>()
  for (const m of (mapeoRaw.data ?? []) as Array<{
    patente: string
    chofer_id: string | null
  }>) {
    if (m.chofer_id) mapeoNominal.set(m.patente, m.chofer_id)
  }

  // Egresos: (fecha + patente) → primer egreso del día por hora
  const egresoIdx = new Map<
    string,
    { chofer_id: string | null; chofer_nombre_raw: string; tml: number | null; hora: string }
  >()
  for (const r of (registrosRaw.data ?? []) as Array<{
    fecha: string
    dominio: string
    chofer: string
    hora: string
    tml_minutos: number | null
  }>) {
    const key = `${r.fecha}|${r.dominio}`
    const choferUpper = (r.chofer ?? "").toUpperCase().trim()
    const chofer_id = nombreUpperToId.get(choferUpper) ?? null
    const exist = egresoIdx.get(key)
    if (!exist || r.hora < exist.hora) {
      egresoIdx.set(key, {
        chofer_id,
        chofer_nombre_raw: r.chofer,
        tml: r.tml_minutos,
        hora: r.hora,
      })
    }
  }

  function resolveChofer(fecha: string, patente: string): {
    chofer_id: string | null
    fuente: "tml" | "mapeo" | null
    tml: number | null
  } {
    const egreso = egresoIdx.get(`${fecha}|${patente}`)
    if (egreso) {
      return {
        chofer_id: egreso.chofer_id,
        fuente: "tml",
        tml: egreso.tml,
      }
    }
    const nominalId = mapeoNominal.get(patente)
    if (nominalId) return { chofer_id: nominalId, fuente: "mapeo", tml: null }
    return { chofer_id: null, fuente: null, tml: null }
  }

  function matchChofer(id: string | null): boolean {
    if (buscarSinAsignar) return id == null
    return id === choferIdBuscado
  }

  // Day-level accumulator
  interface DayAcc {
    patentes: Set<string>
    bultos: number
    hl: number
    viajes: number
    tml_sum: number
    tml_count: number
    rechazos_bultos: number
    rechazos_eventos: number
    fuentes: Set<"tml" | "mapeo">
  }
  const days = new Map<string, DayAcc>()
  function ensureDay(fecha: string): DayAcc {
    let d = days.get(fecha)
    if (!d) {
      d = {
        patentes: new Set(),
        bultos: 0,
        hl: 0,
        viajes: 0,
        tml_sum: 0,
        tml_count: 0,
        rechazos_bultos: 0,
        rechazos_eventos: 0,
        fuentes: new Set(),
      }
      days.set(fecha, d)
    }
    return d
  }

  // Ventas → acreditar al chofer del día
  for (const v of (ventasRaw.data ?? []) as Array<{
    fecha: string
    ds_fletero_carga: string
    total_bultos: number | null
    total_hl: number | null
    viajes: number | null
  }>) {
    const res = resolveChofer(v.fecha, v.ds_fletero_carga)
    if (!matchChofer(res.chofer_id)) continue
    const d = ensureDay(v.fecha)
    d.patentes.add(v.ds_fletero_carga)
    const b = Number(v.total_bultos ?? 0)
    const h = Number(v.total_hl ?? 0)
    const vj = Number(v.viajes ?? 0)
    if (Number.isFinite(b)) d.bultos += b
    if (Number.isFinite(h)) d.hl += h
    if (Number.isFinite(vj)) d.viajes += vj
    if (res.tml != null && Number.isFinite(res.tml)) {
      d.tml_sum += res.tml
      d.tml_count += 1
    }
    if (res.fuente) d.fuentes.add(res.fuente)
  }

  // Rechazos
  for (const r of (rechazosRaw.data ?? []) as Array<{
    fecha: string
    ds_fletero_carga: string
    bultos_rechazados: number | null
  }>) {
    const res = resolveChofer(r.fecha, r.ds_fletero_carga)
    if (!matchChofer(res.chofer_id)) continue
    const d = ensureDay(r.fecha)
    d.patentes.add(r.ds_fletero_carga)
    const b = Number(r.bultos_rechazados ?? 0)
    if (Number.isFinite(b)) {
      d.rechazos_bultos += b
      d.rechazos_eventos += 1
    }
  }

  // Egresos sin venta (jornada administrativa) — incluir el TML para que cuente
  for (const [key, egreso] of egresoIdx.entries()) {
    if (!matchChofer(egreso.chofer_id)) continue
    const [fecha, patente] = key.split("|")
    const d = ensureDay(fecha)
    if (!d.patentes.has(patente)) {
      d.patentes.add(patente)
      if (egreso.tml != null && Number.isFinite(egreso.tml)) {
        d.tml_sum += egreso.tml
        d.tml_count += 1
      }
      d.fuentes.add("tml")
    }
  }

  // Reuniones por fecha
  const reunionesByFecha = new Map<string, string>()
  for (const r of (reunionesRaw.data ?? []) as Array<{
    id: string
    fecha: string
  }>) {
    // Si hay más de una reunión por fecha, agarro la primera arbitrariamente.
    if (!reunionesByFecha.has(r.fecha)) reunionesByFecha.set(r.fecha, r.id)
  }

  const por_dia: ChoferDetalleDia[] = [...days.entries()]
    .map(([fecha, d]) => {
      let fuente: "tml" | "mapeo" | "mixto" = "tml"
      if (d.fuentes.has("tml") && d.fuentes.has("mapeo")) fuente = "mixto"
      else if (d.fuentes.has("mapeo")) fuente = "mapeo"
      return {
        fecha,
        patentes: [...d.patentes].sort(),
        bultos: Math.round(d.bultos),
        hl: Math.round(d.hl * 10) / 10,
        viajes: d.viajes,
        tml_minutos: d.tml_count > 0 ? Math.round(d.tml_sum / d.tml_count) : null,
        tml_egresos: d.tml_count,
        rechazos_bultos: d.rechazos_bultos,
        rechazos_eventos: d.rechazos_eventos,
        rechazos_pct:
          d.bultos > 0
            ? Math.round((d.rechazos_bultos / d.bultos) * 100 * 100) / 100
            : null,
        fuente,
        reunion_id: reunionesByFecha.get(fecha) ?? null,
      }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // KPIs totales
  let totBultos = 0
  let totHl = 0
  let totViajes = 0
  let totRechazos = 0
  let tmlSum = 0
  let tmlCount = 0
  for (const d of por_dia) {
    totBultos += d.bultos
    totHl += d.hl
    totViajes += d.viajes
    totRechazos += d.rechazos_bultos
    if (d.tml_minutos != null) {
      tmlSum += d.tml_minutos * d.tml_egresos
      tmlCount += d.tml_egresos
    }
  }

  return {
    chofer_id: buscarSinAsignar ? null : choferIdOrSentinel,
    chofer_nombre: nombreBuscado,
    desde: fechaDesde,
    hasta: fechaHasta,
    kpis: {
      dias_trabajados: por_dia.length,
      bultos: totBultos,
      hl: Math.round(totHl * 10) / 10,
      viajes: totViajes,
      tml_promedio: tmlCount > 0 ? Math.round(tmlSum / tmlCount) : null,
      rechazos_bultos: totRechazos,
      rechazos_pct:
        totBultos > 0
          ? Math.round((totRechazos / totBultos) * 100 * 100) / 100
          : null,
    },
    por_dia,
  }
}
