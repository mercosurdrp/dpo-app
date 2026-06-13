"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole } from "@/lib/session"
import type { AusentismoSerie, AusentismoPersona } from "@/actions/asistencia"
import type {
  AusentismoEmpleadoOpcion,
  AusentismoEvento,
  AusentismoEventoConEmpleado,
  AusentismoLicenciasMedicasMesBucket,
  AusentismoLicenciasMedicasReporte,
  AusentismoMotivo,
  AusentismoRepitenciaEmpleado,
  AusentismoResumenMes,
  AusentismoResumenMotivo,
} from "@/types/database"
import {
  AUSENTISMO_MOTIVOS,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

const BUCKET = "ausentismo"

interface EmpleadoRow {
  id: string
  legajo: number
  nombre: string
  sector: string | null
}

async function fetchEmpleadosMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, EmpleadoRow>> {
  const map = new Map<string, EmpleadoRow>()
  if (ids.length === 0) return map
  const { data } = await supabase
    .from("empleados")
    .select("id, legajo, nombre, sector")
    .in("id", ids)
  for (const e of (data ?? []) as EmpleadoRow[]) {
    map.set(e.id, e)
  }
  return map
}

export async function listarEmpleadosOpciones(): Promise<
  Result<AusentismoEmpleadoOpcion[]>
> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data ?? []) as AusentismoEmpleadoOpcion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface ListarFiltros {
  motivo?: AusentismoMotivo
  empleado_id?: string
  desde?: string // YYYY-MM-DD
  hasta?: string // YYYY-MM-DD
}

export async function listarEventos(
  filtros: ListarFiltros = {},
): Promise<Result<AusentismoEventoConEmpleado[]>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    let query = supabase
      .from("ausentismo_eventos")
      .select("*")
      .order("fecha_inicio", { ascending: false })

    if (filtros.motivo) query = query.eq("motivo", filtros.motivo)
    if (filtros.empleado_id) query = query.eq("empleado_id", filtros.empleado_id)
    // El filtro de rango usa intersección: el evento solapa [desde, hasta]
    // si fecha_inicio <= hasta AND fecha_fin >= desde.
    if (filtros.hasta) query = query.lte("fecha_inicio", filtros.hasta)
    if (filtros.desde) query = query.gte("fecha_fin", filtros.desde)

    const { data, error } = await query
    if (error) return { error: error.message }

    const eventos = (data ?? []) as AusentismoEvento[]
    const empleadosMap = await fetchEmpleadosMap(
      supabase,
      Array.from(new Set(eventos.map((e) => e.empleado_id))),
    )

    const out: AusentismoEventoConEmpleado[] = eventos.map((e) => {
      const emp = empleadosMap.get(e.empleado_id)
      return {
        ...e,
        empleado_nombre: emp?.nombre ?? "(empleado eliminado)",
        empleado_legajo: emp?.legajo ?? 0,
        empleado_sector: emp?.sector ?? null,
      }
    })

    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface CrearEventoInput {
  empleado_id: string
  fecha_inicio: string
  dias: number
  motivo: AusentismoMotivo
  comentario?: string | null
  // El cliente sube el archivo al bucket "ausentismo" (bypass del límite
  // 4.5MB de Vercel Functions) y pasa los metadatos.
  archivo_path?: string | null
  archivo_nombre?: string | null
  archivo_mime?: string | null
  archivo_size?: number | null
}

function validarMotivo(m: string): m is AusentismoMotivo {
  return (AUSENTISMO_MOTIVOS as string[]).includes(m)
}

export async function crearEvento(
  input: CrearEventoInput,
): Promise<Result<AusentismoEvento>> {
  try {
    const profile = await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    if (!input.empleado_id) return { error: "Empleado requerido" }
    if (!input.fecha_inicio) return { error: "Fecha de inicio requerida" }
    if (!Number.isFinite(input.dias) || input.dias < 1 || input.dias > 365) {
      return { error: "Días debe ser entre 1 y 365" }
    }
    if (!validarMotivo(input.motivo)) return { error: "Motivo inválido" }

    const { data, error } = await supabase
      .from("ausentismo_eventos")
      .insert({
        empleado_id: input.empleado_id,
        fecha_inicio: input.fecha_inicio,
        dias: input.dias,
        // fecha_fin lo pone el trigger; mando un placeholder válido para no
        // chocar con el NOT NULL (el trigger lo sobreescribe BEFORE INSERT).
        fecha_fin: input.fecha_inicio,
        motivo: input.motivo,
        comentario: input.comentario?.toString().trim() || null,
        archivo_path: input.archivo_path?.toString().trim() || null,
        archivo_nombre: input.archivo_nombre?.toString().trim() || null,
        archivo_mime: input.archivo_mime?.toString().trim() || null,
        archivo_size: input.archivo_size ?? null,
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("*")
      .single()

    if (error) {
      if (input.archivo_path) {
        await supabase.storage.from(BUCKET).remove([input.archivo_path])
      }
      return { error: error.message }
    }
    return { data: data as AusentismoEvento }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface EditarEventoInput {
  id: string
  empleado_id?: string
  fecha_inicio?: string
  dias?: number
  motivo?: AusentismoMotivo
  comentario?: string | null
  archivo_path?: string | null
  archivo_nombre?: string | null
  archivo_mime?: string | null
  archivo_size?: number | null
  // Si se reemplaza el archivo, el cliente sube el nuevo y manda el path
  // viejo acá para que el server lo borre del bucket.
  archivo_path_a_borrar?: string | null
}

export async function editarEvento(
  input: EditarEventoInput,
): Promise<Result<AusentismoEvento>> {
  try {
    const profile = await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    if (!input.id) return { error: "ID requerido" }

    const update: Record<string, unknown> = {
      updated_by: profile.id,
    }
    if (input.empleado_id !== undefined) update.empleado_id = input.empleado_id
    if (input.fecha_inicio !== undefined) update.fecha_inicio = input.fecha_inicio
    if (input.dias !== undefined) {
      if (!Number.isFinite(input.dias) || input.dias < 1 || input.dias > 365) {
        return { error: "Días debe ser entre 1 y 365" }
      }
      update.dias = input.dias
    }
    if (input.motivo !== undefined) {
      if (!validarMotivo(input.motivo)) return { error: "Motivo inválido" }
      update.motivo = input.motivo
    }
    if (input.comentario !== undefined) {
      update.comentario = input.comentario?.toString().trim() || null
    }
    if (input.archivo_path !== undefined) {
      update.archivo_path = input.archivo_path
      update.archivo_nombre = input.archivo_nombre ?? null
      update.archivo_mime = input.archivo_mime ?? null
      update.archivo_size = input.archivo_size ?? null
    }

    const { data, error } = await supabase
      .from("ausentismo_eventos")
      .update(update)
      .eq("id", input.id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    if (input.archivo_path_a_borrar) {
      await supabase.storage
        .from(BUCKET)
        .remove([input.archivo_path_a_borrar])
    }

    return { data: data as AusentismoEvento }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarEvento(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    const { data: existente, error: errEx } = await supabase
      .from("ausentismo_eventos")
      .select("archivo_path")
      .eq("id", id)
      .single()
    if (errEx) return { error: errEx.message }

    const { error: errDel } = await supabase
      .from("ausentismo_eventos")
      .delete()
      .eq("id", id)
    if (errDel) return { error: errDel.message }

    if (existente?.archivo_path) {
      await supabase.storage
        .from(BUCKET)
        .remove([existente.archivo_path as string])
    }

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getArchivoUrl(
  eventoId: string,
): Promise<Result<{ url: string; filename: string }>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("ausentismo_eventos")
      .select("archivo_path, archivo_nombre")
      .eq("id", eventoId)
      .single()
    if (error) return { error: error.message }
    if (!data?.archivo_path) return { error: "El evento no tiene archivo" }

    const { data: signed, error: errSign } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.archivo_path as string, 60 * 10)
    if (errSign || !signed) return { error: errSign?.message || "No se pudo firmar URL" }

    return {
      data: {
        url: signed.signedUrl,
        filename: (data.archivo_nombre as string | null) ?? "archivo",
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ===== Resúmenes / reportes =====

function ymOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function diasSolapados(
  fInicio: string,
  fFin: string,
  rangoDesde: string,
  rangoHasta: string,
): number {
  const ini = fInicio > rangoDesde ? fInicio : rangoDesde
  const fin = fFin < rangoHasta ? fFin : rangoHasta
  if (ini > fin) return 0
  const a = new Date(ini + "T00:00:00Z").getTime()
  const b = new Date(fin + "T00:00:00Z").getTime()
  return Math.round((b - a) / 86400000) + 1
}

export async function resumenMes(
  yearMonth: string,
): Promise<Result<AusentismoResumenMes>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { error: "yearMonth inválido (YYYY-MM)" }
    }
    const [y, m] = yearMonth.split("-").map((n) => parseInt(n, 10))
    const desde = `${yearMonth}-01`
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const hasta = `${yearMonth}-${String(lastDay).padStart(2, "0")}`

    // Trae eventos que intersecan el mes.
    const { data, error } = await supabase
      .from("ausentismo_eventos")
      .select("fecha_inicio, fecha_fin, dias, motivo")
      .lte("fecha_inicio", hasta)
      .gte("fecha_fin", desde)

    if (error) return { error: error.message }

    const acc = new Map<AusentismoMotivo, { eventos: number; dias: number }>()
    let eventosTotal = 0
    let diasTotal = 0
    for (const e of (data ?? []) as Array<{
      fecha_inicio: string
      fecha_fin: string
      dias: number
      motivo: AusentismoMotivo
    }>) {
      const dias = diasSolapados(e.fecha_inicio, e.fecha_fin, desde, hasta)
      if (dias <= 0) continue
      const prev = acc.get(e.motivo) ?? { eventos: 0, dias: 0 }
      prev.eventos += 1
      prev.dias += dias
      acc.set(e.motivo, prev)
      eventosTotal += 1
      diasTotal += dias
    }

    const por_motivo: AusentismoResumenMotivo[] = AUSENTISMO_MOTIVOS.map((m) => ({
      motivo: m,
      eventos: acc.get(m)?.eventos ?? 0,
      dias_totales: acc.get(m)?.dias ?? 0,
    }))

    return {
      data: {
        year_month: yearMonth,
        eventos_total: eventosTotal,
        dias_total: diasTotal,
        por_motivo,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface RangoInput {
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD
  soloMotivo?: AusentismoMotivo
}

async function obtenerEventosRango(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rango: RangoInput,
): Promise<AusentismoEventoConEmpleado[]> {
  let q = supabase
    .from("ausentismo_eventos")
    .select("*")
    .lte("fecha_inicio", rango.hasta)
    .gte("fecha_fin", rango.desde)
  if (rango.soloMotivo) q = q.eq("motivo", rango.soloMotivo)
  const { data } = await q
  const evs = (data ?? []) as AusentismoEvento[]
  const empleadosMap = await fetchEmpleadosMap(
    supabase,
    Array.from(new Set(evs.map((e) => e.empleado_id))),
  )
  return evs.map((e) => {
    const emp = empleadosMap.get(e.empleado_id)
    return {
      ...e,
      empleado_nombre: emp?.nombre ?? "(empleado eliminado)",
      empleado_legajo: emp?.legajo ?? 0,
      empleado_sector: emp?.sector ?? null,
    }
  })
}

function agregarRepitencia(
  eventos: AusentismoEventoConEmpleado[],
  rango: { desde: string; hasta: string },
): AusentismoRepitenciaEmpleado[] {
  const byEmp = new Map<string, {
    nombre: string
    legajo: number
    sector: string | null
    eventos: number
    dias_totales: number
    ultimo: string
    motivos: Map<AusentismoMotivo, number>
  }>()
  for (const e of eventos) {
    const dias = diasSolapados(e.fecha_inicio, e.fecha_fin, rango.desde, rango.hasta)
    if (dias <= 0) continue
    const prev = byEmp.get(e.empleado_id) ?? {
      nombre: e.empleado_nombre,
      legajo: e.empleado_legajo,
      sector: e.empleado_sector,
      eventos: 0,
      dias_totales: 0,
      ultimo: e.fecha_inicio,
      motivos: new Map<AusentismoMotivo, number>(),
    }
    prev.eventos += 1
    prev.dias_totales += dias
    if (e.fecha_inicio > prev.ultimo) prev.ultimo = e.fecha_inicio
    prev.motivos.set(e.motivo, (prev.motivos.get(e.motivo) ?? 0) + 1)
    byEmp.set(e.empleado_id, prev)
  }

  const out: AusentismoRepitenciaEmpleado[] = []
  for (const [id, v] of byEmp.entries()) {
    let motivoTop: AusentismoMotivo = "ausencia"
    let max = -1
    for (const [mt, c] of v.motivos.entries()) {
      if (c > max) {
        max = c
        motivoTop = mt
      }
    }
    out.push({
      empleado_id: id,
      empleado_nombre: v.nombre,
      empleado_legajo: v.legajo,
      empleado_sector: v.sector,
      eventos: v.eventos,
      dias_totales: v.dias_totales,
      promedio_dias: v.eventos > 0
        ? Math.round((v.dias_totales / v.eventos) * 10) / 10
        : 0,
      ultimo_evento: v.ultimo,
      motivo_predominante: motivoTop,
    })
  }
  out.sort((a, b) => {
    if (b.eventos !== a.eventos) return b.eventos - a.eventos
    return b.dias_totales - a.dias_totales
  })
  return out
}

export async function reporteRepitencia(
  rango: RangoInput,
): Promise<Result<AusentismoRepitenciaEmpleado[]>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    if (!rango.desde || !rango.hasta) return { error: "Rango requerido" }
    const eventos = await obtenerEventosRango(supabase, rango)
    return { data: agregarRepitencia(eventos, rango) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function reporteLicenciasMedicas(
  rango: RangoInput,
): Promise<Result<AusentismoLicenciasMedicasReporte>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    if (!rango.desde || !rango.hasta) return { error: "Rango requerido" }

    const eventos = await obtenerEventosRango(supabase, {
      ...rango,
      soloMotivo: "licencia_medica",
    })

    const repitencia = agregarRepitencia(eventos, rango)
    const empleadosConLm = repitencia.length
    const empleadosConRepitencia = repitencia.filter((r) => r.eventos >= 2).length

    // Bucket mensual: cuántos eventos y días totales caen en cada YYYY-MM
    // dentro del rango (split entre meses si solapa). Iteramos por mes para
    // poder dibujar la mini-bar chart.
    const meses: AusentismoLicenciasMedicasMesBucket[] = []
    const desdeYm = ymOf(rango.desde)
    const hastaYm = ymOf(rango.hasta)
    let cursor = desdeYm
    while (cursor <= hastaYm) {
      const [y, m] = cursor.split("-").map((n) => parseInt(n, 10))
      const desdeM = `${cursor}-01`
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const hastaM = `${cursor}-${String(lastDay).padStart(2, "0")}`
      let eventosM = 0
      let diasM = 0
      for (const e of eventos) {
        const dias = diasSolapados(e.fecha_inicio, e.fecha_fin, desdeM, hastaM)
        if (dias > 0) {
          eventosM += 1
          diasM += dias
        }
      }
      meses.push({ year_month: cursor, eventos: eventosM, dias_totales: diasM })

      // siguiente mes
      const nextM = m === 12 ? 1 : m + 1
      const nextY = m === 12 ? y + 1 : y
      cursor = `${nextY}-${String(nextM).padStart(2, "0")}`
    }

    const totalEventos = eventos.length
    const totalDias = repitencia.reduce((a, r) => a + r.dias_totales, 0)

    return {
      data: {
        total_eventos: totalEventos,
        total_dias: totalDias,
        empleados_con_lm: empleadosConLm,
        empleados_con_repitencia: empleadosConRepitencia,
        top_empleados: repitencia.slice(0, 20),
        por_mes: meses,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ===== Serie diaria para el tablero de reuniones (fila "Ausentismo") =====
// La fila "Ausentismo" de la reunión de Logística se alimenta de ESTE módulo
// (ausentismo_eventos), no del fichaje. Cada evento se expande día por día
// dentro de su rango [fecha_inicio, fecha_fin]; cada persona cuenta 1 por cada
// fecha caída. Se replica el formato de AusentismoSerie/AusentismoPersona para
// no tener que tocar el diálogo de detalle ni la grilla del tablero.

const MOTIVO_TIPO_TABLERO: Record<
  AusentismoMotivo,
  AusentismoPersona["tipo"]
> = {
  licencia_medica: "licencia_medica",
  ausencia: "ausente",
  enfermedad_profesional: "ausente",
  accidente: "ausente",
  otras_licencias: "ausente",
  licencia_gremial: "ausente",
}

// El tablero de Logística SOLO suma Ausencia y Licencia Médica. El resto de
// motivos (gremial, otras licencias, accidente, enfermedad profesional) queda
// registrado en el módulo /ausentismo pero NO se replica en la fila del tablero.
const MOTIVOS_TABLERO: AusentismoMotivo[] = ["ausencia", "licencia_medica"]

export async function getAusentismoSerieEventos(
  mes: number,
  anio: number,
  sectores: string[] = ["Depósito", "Distribución", "Acarreo - T1"],
): Promise<Result<AusentismoSerie>> {
  try {
    // Lectura agregada para el tablero: se usa service-role porque la reunión
    // la abren roles más allá de admin/admin_rrhh (la RLS de ausentismo_eventos
    // es admin/admin_rrhh-only). Solo se expone el conteo + detalle del día,
    // igual que hacía el cálculo anterior basado en fichaje.
    const admin = createAdminClient()

    const ultimoDia = new Date(anio, mes, 0).getDate()
    const mm = String(mes).padStart(2, "0")
    const desde = `${anio}-${mm}-01`
    const hasta = `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}`

    // Eventos que solapan el mes: fecha_inicio <= fin_mes AND fecha_fin >= ini_mes.
    const { data: eventosRaw, error } = await admin
      .from("ausentismo_eventos")
      .select("empleado_id, fecha_inicio, fecha_fin, motivo, comentario")
      .lte("fecha_inicio", hasta)
      .gte("fecha_fin", desde)
    if (error) return { error: error.message }

    const eventos = (eventosRaw ?? []) as Array<{
      empleado_id: string
      fecha_inicio: string
      fecha_fin: string
      motivo: AusentismoMotivo
      comentario: string | null
    }>

    // Datos de los empleados involucrados (legajo/nombre/sector) para el detalle.
    const ids = Array.from(new Set(eventos.map((e) => e.empleado_id)))
    const empMap = new Map<
      string,
      { legajo: number; nombre: string; sector: string | null }
    >()
    if (ids.length > 0) {
      const { data: emps } = await admin
        .from("empleados")
        .select("id, legajo, nombre, sector")
        .in("id", ids)
      for (const e of (emps ?? []) as Array<{
        id: string
        legajo: number
        nombre: string
        sector: string | null
      }>) {
        empMap.set(e.id, { legajo: e.legajo, nombre: e.nombre, sector: e.sector })
      }
    }

    const sectoresSet = new Set(sectores)
    const hoyIso = new Date().toISOString().slice(0, 10)
    const por_fecha: Record<string, number | null> = {}
    const detalle_por_fecha: Record<string, AusentismoPersona[]> = {}

    for (let d = 1; d <= ultimoDia; d++) {
      const fecha = `${anio}-${mm}-${String(d).padStart(2, "0")}`
      // Futuro: aún no hay info.
      if (fecha > hoyIso) {
        por_fecha[fecha] = null
        continue
      }
      // Domingo: no laborable en Pampeana, no se cuenta (igual que el cálculo
      // anterior y que los días laborales de /asistencia).
      const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay()
      if (diaSemana === 0) {
        por_fecha[fecha] = null
        continue
      }

      const personas: AusentismoPersona[] = []
      const vistos = new Set<number>()
      for (const ev of eventos) {
        // Solo Ausencia y Licencia Médica suman al tablero.
        if (!MOTIVOS_TABLERO.includes(ev.motivo)) continue
        // La fecha cae dentro del evento (días caídos).
        if (fecha < ev.fecha_inicio || fecha > ev.fecha_fin) continue
        const emp = empMap.get(ev.empleado_id)
        if (!emp) continue
        if (!sectoresSet.has(emp.sector ?? "")) continue
        // Una persona cuenta una sola vez por día aunque tenga eventos solapados.
        if (vistos.has(emp.legajo)) continue
        vistos.add(emp.legajo)
        personas.push({
          legajo: emp.legajo,
          nombre: emp.nombre,
          sector: emp.sector ?? "—",
          tipo: MOTIVO_TIPO_TABLERO[ev.motivo] ?? "ausente",
          observaciones: ev.comentario,
        })
      }
      por_fecha[fecha] = personas.length
      detalle_por_fecha[fecha] = personas
    }

    return { data: { sectores, por_fecha, detalle_por_fecha } }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Error calculando ausentismo",
    }
  }
}

export async function getAusentismoDelDiaEventos(
  fecha: string,
  sectores: string[] = ["Depósito", "Distribución", "Acarreo - T1"],
): Promise<{ data: AusentismoPersona[] } | { error: string }> {
  const partes = fecha.split("-").map((s) => parseInt(s, 10))
  if (partes.length !== 3 || !partes.every(Number.isFinite)) {
    return { error: "Fecha inválida" }
  }
  const res = await getAusentismoSerieEventos(partes[1], partes[0], sectores)
  if ("error" in res) return res
  return { data: res.data.detalle_por_fecha[fecha] ?? [] }
}
