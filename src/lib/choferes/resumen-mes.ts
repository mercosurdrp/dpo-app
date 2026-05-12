/**
 * Agregaciones por chofer para el ranking mensual de
 * `/indicadores/choferes`. Lectura pura.
 *
 * Resolución patente→chofer para una fecha F y patente P:
 *   1) registros_vehiculos WHERE fecha=F AND dominio=P AND tipo='egreso'
 *      (chofer del egreso registrado por seguridad — fuente preferida).
 *   2) mapeo_patente_chofer.chofer_id (asignación nominal — fallback).
 *   3) Bucket "Sin asignar" (chofer_id=null).
 *
 * El match `registros_vehiculos.chofer` (TEXT) ↔ catalogo_choferes.nombre
 * funciona porque el form lo guarda en UPPER (ver
 * `src/actions/registros-vehiculos.ts:60-63`).
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

export interface ChoferResumenRow {
  /** ID del catálogo, o null si "Sin asignar". */
  chofer_id: string | null
  chofer_nombre: string
  dias_trabajados: number
  bultos: number
  hl: number
  viajes: number
  tml_promedio: number | null
  tml_egresos: number
  rechazos_bultos: number
  rechazos_eventos: number
  /** % rechazo en bultos = bultos_rechazados / bultos_entregados × 100 */
  rechazos_pct: number | null
  /** Distintas patentes que manejó en el rango (ordenadas). */
  patentes_usadas: string[]
  /** "tml" = todos los días resueltos por egreso TML.
   *  "mapeo" = todos por mapeo nominal.
   *  "mixto" = combinación. */
  fuente: "tml" | "mapeo" | "mixto"
}

export interface ChoferesResumenMes {
  desde: string
  hasta: string
  filas: ChoferResumenRow[]
  /** Patentes que vendieron en el rango y no resolvieron a ningún chofer
   *  (ni TML ni mapeo). Útil para el CTA "mapear patente". */
  patentes_sin_resolver: string[]
}

const BUCKET_SIN_ASIGNAR_ID: string | null = null
const BUCKET_SIN_ASIGNAR_NOMBRE = "(Sin asignar)"

export async function getChoferesResumenMes(
  supa: SupaClient,
  fechaDesde: string,
  fechaHasta: string,
): Promise<ChoferesResumenMes> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta) ||
    fechaDesde > fechaHasta
  ) {
    throw new Error("Rango de fechas inválido")
  }

  const [ventasRaw, registrosRaw, rechazosRaw, mapeoRaw, choferesRaw] =
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
    ])

  if (ventasRaw.error) throw new Error(`ventas_diarias: ${ventasRaw.error.message}`)
  if (registrosRaw.error)
    throw new Error(`registros_vehiculos: ${registrosRaw.error.message}`)
  if (rechazosRaw.error) throw new Error(`rechazos: ${rechazosRaw.error.message}`)

  // Catálogo: id → nombre y nombre.upper() → id
  const idToNombre = new Map<string, string>()
  const nombreUpperToId = new Map<string, string>()
  for (const c of (choferesRaw.data ?? []) as Array<{
    id: string
    nombre: string
  }>) {
    idToNombre.set(c.id, c.nombre)
    nombreUpperToId.set(c.nombre.toUpperCase().trim(), c.id)
  }

  // Mapeo nominal: patente → chofer_id
  const mapeoNominal = new Map<string, string>()
  for (const m of (mapeoRaw.data ?? []) as Array<{
    patente: string
    chofer_id: string | null
  }>) {
    if (m.chofer_id) mapeoNominal.set(m.patente, m.chofer_id)
  }

  // Egresos TML: (fecha + dominio) → { chofer_id, tml_minutos }
  // Si hay varios egresos del mismo (fecha, patente), agarro el primero por hora.
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

  // Resolver chofer para una (fecha, patente):
  // 1) egreso TML del día → 2) mapeo nominal → 3) sin asignar
  function resolveChofer(fecha: string, patente: string): {
    chofer_id: string | null
    chofer_nombre: string
    fuente: "tml" | "mapeo" | null
    tml: number | null
  } {
    const egreso = egresoIdx.get(`${fecha}|${patente}`)
    if (egreso) {
      const nombre =
        egreso.chofer_id != null
          ? (idToNombre.get(egreso.chofer_id) ?? egreso.chofer_nombre_raw)
          : egreso.chofer_nombre_raw
      return {
        chofer_id: egreso.chofer_id,
        chofer_nombre: nombre || BUCKET_SIN_ASIGNAR_NOMBRE,
        fuente: "tml",
        tml: egreso.tml,
      }
    }
    const nominalId = mapeoNominal.get(patente)
    if (nominalId) {
      return {
        chofer_id: nominalId,
        chofer_nombre: idToNombre.get(nominalId) ?? BUCKET_SIN_ASIGNAR_NOMBRE,
        fuente: "mapeo",
        tml: null,
      }
    }
    return {
      chofer_id: BUCKET_SIN_ASIGNAR_ID,
      chofer_nombre: BUCKET_SIN_ASIGNAR_NOMBRE,
      fuente: null,
      tml: null,
    }
  }

  // Acumulador por chofer
  interface Acc {
    chofer_id: string | null
    chofer_nombre: string
    dias: Set<string>
    bultos: number
    hl: number
    viajes: number
    tml_sum: number
    tml_count: number
    rechazos_bultos: number
    rechazos_eventos: number
    patentes: Set<string>
    fuente_tml: number
    fuente_mapeo: number
  }
  const accBy = new Map<string, Acc>()
  const patentesSinResolver = new Set<string>()

  function keyOf(id: string | null, nombre: string): string {
    return id ?? `__none__|${nombre}`
  }

  function ensureAcc(
    id: string | null,
    nombre: string,
  ): Acc {
    const k = keyOf(id, nombre)
    let a = accBy.get(k)
    if (!a) {
      a = {
        chofer_id: id,
        chofer_nombre: nombre,
        dias: new Set(),
        bultos: 0,
        hl: 0,
        viajes: 0,
        tml_sum: 0,
        tml_count: 0,
        rechazos_bultos: 0,
        rechazos_eventos: 0,
        patentes: new Set(),
        fuente_tml: 0,
        fuente_mapeo: 0,
      }
      accBy.set(k, a)
    }
    return a
  }

  // 1) Sumar ventas por chofer
  for (const v of (ventasRaw.data ?? []) as Array<{
    fecha: string
    ds_fletero_carga: string
    total_bultos: number | null
    total_hl: number | null
    viajes: number | null
  }>) {
    const res = resolveChofer(v.fecha, v.ds_fletero_carga)
    if (res.chofer_id == null && res.fuente == null) {
      patentesSinResolver.add(v.ds_fletero_carga)
    }
    const acc = ensureAcc(res.chofer_id, res.chofer_nombre)
    const b = Number(v.total_bultos ?? 0)
    const h = Number(v.total_hl ?? 0)
    const vj = Number(v.viajes ?? 0)
    if (Number.isFinite(b)) acc.bultos += b
    if (Number.isFinite(h)) acc.hl += h
    if (Number.isFinite(vj)) acc.viajes += vj
    acc.patentes.add(v.ds_fletero_carga)
    acc.dias.add(v.fecha)
    if (res.tml != null && Number.isFinite(res.tml)) {
      acc.tml_sum += res.tml
      acc.tml_count += 1
    }
    if (res.fuente === "tml") acc.fuente_tml += 1
    else if (res.fuente === "mapeo") acc.fuente_mapeo += 1
  }

  // 2) Sumar rechazos por chofer (numerador del % rechazo)
  for (const r of (rechazosRaw.data ?? []) as Array<{
    fecha: string
    ds_fletero_carga: string
    bultos_rechazados: number | null
  }>) {
    const res = resolveChofer(r.fecha, r.ds_fletero_carga)
    const acc = ensureAcc(res.chofer_id, res.chofer_nombre)
    const b = Number(r.bultos_rechazados ?? 0)
    if (Number.isFinite(b)) {
      acc.rechazos_bultos += b
      acc.rechazos_eventos += 1
    }
    // patentes set se completa también acá para que un chofer con solo rechazos
    // (raro, pero posible si la venta de ese día se perdió en sync) aparezca.
    acc.patentes.add(r.ds_fletero_carga)
  }

  // 3) Agregar TML promedio de egresos sin venta (jornadas administrativas).
  //    Si una patente registró egreso pero NO vendió, igual debería contar
  //    para el promedio TML del chofer.
  for (const [key, egreso] of egresoIdx.entries()) {
    const [, patente] = key.split("|")
    const nombre =
      egreso.chofer_id != null
        ? (idToNombre.get(egreso.chofer_id) ?? egreso.chofer_nombre_raw)
        : egreso.chofer_nombre_raw
    const acc = ensureAcc(egreso.chofer_id, nombre || BUCKET_SIN_ASIGNAR_NOMBRE)
    // Si ya contabilicé esta venta arriba, no doblar el TML.
    // Evito el doble conteo verificando si el día/patente ya tienen TML:
    // estrategia simple — sólo agrego TML acá si NO hubo venta para esa
    // (fecha, patente). El doble conteo se evita en el bloque de ventas.
    if (!acc.patentes.has(patente)) {
      acc.patentes.add(patente)
      if (egreso.tml != null && Number.isFinite(egreso.tml)) {
        acc.tml_sum += egreso.tml
        acc.tml_count += 1
      }
    }
  }

  const filas: ChoferResumenRow[] = [...accBy.values()].map((a) => {
    let fuente: "tml" | "mapeo" | "mixto" = "tml"
    if (a.fuente_tml > 0 && a.fuente_mapeo > 0) fuente = "mixto"
    else if (a.fuente_mapeo > 0) fuente = "mapeo"
    else if (a.fuente_tml > 0) fuente = "tml"
    return {
      chofer_id: a.chofer_id,
      chofer_nombre: a.chofer_nombre,
      dias_trabajados: a.dias.size,
      bultos: Math.round(a.bultos),
      hl: Math.round(a.hl * 10) / 10,
      viajes: a.viajes,
      tml_promedio: a.tml_count > 0 ? Math.round(a.tml_sum / a.tml_count) : null,
      tml_egresos: a.tml_count,
      rechazos_bultos: a.rechazos_bultos,
      rechazos_eventos: a.rechazos_eventos,
      rechazos_pct:
        a.bultos > 0
          ? Math.round((a.rechazos_bultos / a.bultos) * 100 * 100) / 100
          : null,
      patentes_usadas: [...a.patentes].sort(),
      fuente,
    }
  })

  // Ordenar por bultos desc
  filas.sort((a, b) => b.bultos - a.bultos)

  return {
    desde: fechaDesde,
    hasta: fechaHasta,
    filas,
    patentes_sin_resolver: [...patentesSinResolver].sort(),
  }
}
