"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  S5Tipo,
  S5Categoria,
  S5ItemCatalogo,
  S5Auditoria,
  S5AuditoriaConMeta,
  S5AuditoriaFull,
  S5AuditoriaItem,
  S5AuditoriaItemConCatalogo,
  S5SectorResponsableFull,
  S5VehiculoPendiente,
  S5KpisMes,
  S5TendenciaMes,
  S5RankingRow,
  S5ItemCriticoRow,
} from "@/types/database"
import { S5_CATEGORIA_ORDEN, S5_MAX_PUNTAJE } from "@/types/database"

const DASHBOARD_PATH = "/5s"

// ===================================================
// Utils
// ===================================================

function firstDayOfMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

function assertAuditorOrAdmin(role: string) {
  if (role !== "admin" && role !== "auditor") {
    throw new Error("Sólo admin o auditor puede realizar esta acción.")
  }
}

// ===================================================
// Catálogo
// ===================================================

export async function getItemsCatalogo(
  tipo: S5Tipo
): Promise<{ data: S5ItemCatalogo[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("s5_items_catalogo")
      .select("*")
      .eq("tipo", tipo)
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("numero", { ascending: true })

    if (error) return { error: error.message }
    return { data: (data ?? []) as S5ItemCatalogo[] }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando catálogo",
    }
  }
}

// ===================================================
// Responsables de sector
// ===================================================

export async function getSectorResponsables(
  periodo: string
): Promise<{ data: S5SectorResponsableFull[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("s5_sector_responsables")
      .select(
        "*, empleado:empleados!s5_sector_responsables_empleado_id_fkey(id, legajo, nombre)"
      )
      .eq("periodo", periodo)
      .order("sector_numero", { ascending: true })

    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: S5SectorResponsableFull[] = ((data ?? []) as any[]).map(
      (row) => ({
        id: row.id,
        periodo: row.periodo,
        sector_numero: row.sector_numero,
        empleado_id: row.empleado_id,
        nombre: row.nombre ?? null,
        asignado_por: row.asignado_por,
        created_at: row.created_at,
        updated_at: row.updated_at,
        empleado_nombre: row.empleado?.nombre ?? "—",
        empleado_legajo: row.empleado?.legajo ?? null,
      })
    )

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando responsables",
    }
  }
}

export async function upsertSectorResponsable(
  periodo: string,
  sectorNumero: number,
  empleadoId: string,
  nombre?: string | null
): Promise<{ data: S5SectorResponsableFull } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)

    if (sectorNumero < 1 || sectorNumero > 4) {
      return { error: "Sector inválido (1..4)" }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("s5_sector_responsables")
      .upsert(
        {
          periodo,
          sector_numero: sectorNumero,
          empleado_id: empleadoId,
          nombre: nombre?.trim() || null,
          asignado_por: profile.id,
        },
        { onConflict: "periodo,sector_numero" }
      )
      .select(
        "*, empleado:empleados!s5_sector_responsables_empleado_id_fkey(id, legajo, nombre)"
      )
      .single()

    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any

    const enriched: S5SectorResponsableFull = {
      id: row.id,
      periodo: row.periodo,
      sector_numero: row.sector_numero,
      empleado_id: row.empleado_id,
      nombre: row.nombre ?? null,
      asignado_por: row.asignado_por,
      created_at: row.created_at,
      updated_at: row.updated_at,
      empleado_nombre: row.empleado?.nombre ?? "—",
      empleado_legajo: row.empleado?.legajo ?? null,
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: enriched }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error asignando responsable",
    }
  }
}

// ===================================================
// Empleados activos (para dropdown de sector responsables)
// ===================================================

export async function getEmpleadosActivos5S(): Promise<
  | { data: { id: string; legajo: number; nombre: string }[] }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados")
      .select("id, legajo, nombre")
      .eq("activo", true)
      .order("nombre", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data ?? []) as { id: string; legajo: number; nombre: string }[] }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando empleados",
    }
  }
}

// ===================================================
// Vehículos activos / pendientes
// ===================================================

export async function getVehiculosActivos(): Promise<
  | { data: { id: string; dominio: string; descripcion: string | null }[] }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("catalogo_vehiculos")
      .select("id, dominio, descripcion")
      .eq("active", true)
      .order("dominio", { ascending: true })
    if (error) return { error: error.message }
    return {
      data: (data ?? []) as {
        id: string
        dominio: string
        descripcion: string | null
      }[],
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando vehículos",
    }
  }
}

export async function getVehiculosPendientesMes(
  periodo: string
): Promise<{ data: S5VehiculoPendiente[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: vehiculos, error: errVeh } = await supabase
      .from("catalogo_vehiculos")
      .select("id, dominio, descripcion")
      .eq("active", true)
      .order("dominio", { ascending: true })

    if (errVeh) return { error: errVeh.message }

    const { data: auditorias, error: errAud } = await supabase
      .from("s5_auditorias")
      .select("vehiculo_id, estado")
      .eq("tipo", "flota")
      .eq("periodo", periodo)
      .eq("estado", "completada")

    if (errAud) return { error: errAud.message }

    const completados = new Set(
      (auditorias ?? [])
        .map((a: { vehiculo_id: string | null }) => a.vehiculo_id)
        .filter((v): v is string => Boolean(v))
    )

    const pendientes: S5VehiculoPendiente[] = (vehiculos ?? [])
      .filter(
        (v: { id: string; dominio: string; descripcion: string | null }) =>
          !completados.has(v.id)
      )
      .map((v: { id: string; dominio: string; descripcion: string | null }) => ({
        id: v.id,
        dominio: v.dominio,
        descripcion: v.descripcion,
      }))

    return { data: pendientes }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error calculando pendientes",
    }
  }
}

// ===================================================
// Auditorías: listado
// ===================================================

interface GetAuditoriasFilters {
  tipo?: S5Tipo
  periodo?: string
  limit?: number
}

export async function getAuditorias(
  filters: GetAuditoriasFilters = {}
): Promise<{ data: S5AuditoriaConMeta[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("s5_auditorias")
      .select(
        "*, auditor:profiles!s5_auditorias_auditor_id_fkey(id, nombre), vehiculo:catalogo_vehiculos!s5_auditorias_vehiculo_id_fkey(id, dominio)"
      )
      .order("created_at", { ascending: false })
      .limit(filters.limit ?? 50)

    if (filters.tipo) query = query.eq("tipo", filters.tipo)
    if (filters.periodo) query = query.eq("periodo", filters.periodo)

    const { data, error } = await query
    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: S5AuditoriaConMeta[] = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      tipo: row.tipo,
      periodo: row.periodo,
      fecha: row.fecha,
      auditor_id: row.auditor_id,
      vehiculo_id: row.vehiculo_id,
      chofer_nombre: row.chofer_nombre,
      ayudante_1: row.ayudante_1,
      ayudante_2: row.ayudante_2,
      sector_numero: row.sector_numero,
      estado: row.estado,
      nota_total: row.nota_total !== null ? Number(row.nota_total) : null,
      notas_por_s: row.notas_por_s,
      observaciones_generales: row.observaciones_generales,
      created_at: row.created_at,
      updated_at: row.updated_at,
      auditor_nombre: row.auditor?.nombre ?? "—",
      vehiculo_dominio: row.vehiculo?.dominio ?? null,
    }))

    return { data: rows }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando auditorías",
    }
  }
}

// ===================================================
// Auditoría: detalle
// ===================================================

export async function getAuditoria(
  id: string
): Promise<{ data: S5AuditoriaFull } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("s5_auditorias")
      .select(
        "*, auditor:profiles!s5_auditorias_auditor_id_fkey(id, nombre), vehiculo:catalogo_vehiculos!s5_auditorias_vehiculo_id_fkey(id, dominio)"
      )
      .eq("id", id)
      .single()

    if (error || !data) {
      return { error: error?.message ?? "Auditoría no encontrada" }
    }

    const { data: itemsRaw, error: errItems } = await supabase
      .from("s5_auditoria_items")
      .select("*, catalogo:s5_items_catalogo!s5_auditoria_items_item_id_fkey(*)")
      .eq("auditoria_id", id)

    if (errItems) return { error: errItems.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: S5AuditoriaItemConCatalogo[] = ((itemsRaw ?? []) as any[])
      .map((r) => ({
        id: r.id,
        auditoria_id: r.auditoria_id,
        item_id: r.item_id,
        puntaje: r.puntaje,
        observaciones: r.observaciones,
        catalogo: r.catalogo as S5ItemCatalogo,
      }))
      .sort((a, b) => {
        const catOrden =
          S5_CATEGORIA_ORDEN.indexOf(a.catalogo.categoria) -
          S5_CATEGORIA_ORDEN.indexOf(b.catalogo.categoria)
        if (catOrden !== 0) return catOrden
        return a.catalogo.orden - b.catalogo.orden
      })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    const full: S5AuditoriaFull = {
      id: row.id,
      tipo: row.tipo,
      periodo: row.periodo,
      fecha: row.fecha,
      auditor_id: row.auditor_id,
      vehiculo_id: row.vehiculo_id,
      chofer_nombre: row.chofer_nombre,
      ayudante_1: row.ayudante_1,
      ayudante_2: row.ayudante_2,
      sector_numero: row.sector_numero,
      estado: row.estado,
      nota_total: row.nota_total !== null ? Number(row.nota_total) : null,
      notas_por_s: row.notas_por_s,
      observaciones_generales: row.observaciones_generales,
      created_at: row.created_at,
      updated_at: row.updated_at,
      auditor_nombre: row.auditor?.nombre ?? "—",
      vehiculo_dominio: row.vehiculo?.dominio ?? null,
      items,
    }

    return { data: full }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando auditoría",
    }
  }
}

// ===================================================
// Crear auditoría + inicializar filas vacías de ítems
// ===================================================

async function initItemsParaAuditoria(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  auditoriaId: string,
  tipo: S5Tipo
) {
  const { data: catalogo, error: errCat } = await supabase
    .from("s5_items_catalogo")
    .select("id")
    .eq("tipo", tipo)
    .eq("activo", true)

  if (errCat) throw new Error(errCat.message)

  const rows = (catalogo ?? []).map((c: { id: string }) => ({
    auditoria_id: auditoriaId,
    item_id: c.id,
    puntaje: null,
    observaciones: null,
  }))

  if (rows.length > 0) {
    const { error: errIns } = await supabase
      .from("s5_auditoria_items")
      .insert(rows)
    if (errIns) throw new Error(errIns.message)
  }
}

interface CrearFlotaInput {
  fecha: string // YYYY-MM-DD
  vehiculoId: string
  choferNombre?: string
  ayudante1?: string
  ayudante2?: string
}

export async function crearAuditoriaFlota(
  input: CrearFlotaInput
): Promise<{ data: S5Auditoria } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)

    const supabase = await createClient()
    const periodo = firstDayOfMonth(new Date(input.fecha))

    const { data, error } = await supabase
      .from("s5_auditorias")
      .insert({
        tipo: "flota",
        periodo,
        fecha: input.fecha,
        auditor_id: profile.id,
        vehiculo_id: input.vehiculoId,
        chofer_nombre: input.choferNombre?.trim() || null,
        ayudante_1: input.ayudante1?.trim() || null,
        ayudante_2: input.ayudante2?.trim() || null,
        estado: "borrador",
      })
      .select()
      .single()

    if (error) return { error: error.message }

    try {
      await initItemsParaAuditoria(supabase, data.id, "flota")
    } catch (e) {
      // rollback best effort
      await supabase.from("s5_auditorias").delete().eq("id", data.id)
      return {
        error: e instanceof Error ? e.message : "Error inicializando ítems",
      }
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: data as S5Auditoria }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando auditoría",
    }
  }
}

interface CrearAlmacenInput {
  fecha: string
  sectorNumero: number
}

export async function crearAuditoriaAlmacen(
  input: CrearAlmacenInput
): Promise<{ data: S5Auditoria } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)

    if (input.sectorNumero < 1 || input.sectorNumero > 4) {
      return { error: "Sector inválido (1..4)" }
    }

    const supabase = await createClient()
    const periodo = firstDayOfMonth(new Date(input.fecha))

    const { data, error } = await supabase
      .from("s5_auditorias")
      .insert({
        tipo: "almacen",
        periodo,
        fecha: input.fecha,
        auditor_id: profile.id,
        sector_numero: input.sectorNumero,
        estado: "borrador",
      })
      .select()
      .single()

    if (error) return { error: error.message }

    try {
      await initItemsParaAuditoria(supabase, data.id, "almacen")
    } catch (e) {
      await supabase.from("s5_auditorias").delete().eq("id", data.id)
      return {
        error: e instanceof Error ? e.message : "Error inicializando ítems",
      }
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: data as S5Auditoria }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando auditoría",
    }
  }
}

// ===================================================
// Guardar puntaje por ítem
// ===================================================

export async function guardarPuntajeItem(
  auditoriaId: string,
  itemId: string,
  puntaje: number | null,
  observaciones: string | null
): Promise<{ data: S5AuditoriaItem } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)

    const supabase = await createClient()

    // Validar que la auditoría no esté completada y obtener tipo para validar rango
    const { data: aud, error: errAud } = await supabase
      .from("s5_auditorias")
      .select("estado, tipo")
      .eq("id", auditoriaId)
      .single()

    if (errAud || !aud) {
      return { error: errAud?.message ?? "Auditoría no encontrada" }
    }
    if (aud.estado === "completada") {
      return { error: "La auditoría ya fue completada y no admite cambios." }
    }

    if (puntaje !== null) {
      const tipo = aud.tipo as S5Tipo
      if (tipo === "almacen" && ![0, 1, 2, 3, 4].includes(puntaje)) {
        return { error: "Puntaje inválido para almacén (0..4)" }
      }
      if (tipo === "flota" && ![0, 1, 3].includes(puntaje)) {
        return { error: "Puntaje inválido para flota (0, 1 o 3)" }
      }
    }

    const { data, error } = await supabase
      .from("s5_auditoria_items")
      .update({
        puntaje,
        observaciones: observaciones?.trim() || null,
      })
      .eq("auditoria_id", auditoriaId)
      .eq("item_id", itemId)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(`${DASHBOARD_PATH}/auditoria/${auditoriaId}`)
    return { data: data as S5AuditoriaItem }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error guardando puntaje",
    }
  }
}

// ===================================================
// Finalizar auditoría (calcula notas y bloquea)
// ===================================================

export async function finalizarAuditoria(
  id: string
): Promise<{ data: S5Auditoria } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)

    const supabase = await createClient()

    const { data: aud, error: errAud } = await supabase
      .from("s5_auditorias")
      .select("id, tipo, estado")
      .eq("id", id)
      .single()

    if (errAud || !aud) {
      return { error: errAud?.message ?? "Auditoría no encontrada" }
    }
    if (aud.estado === "completada") {
      return { error: "La auditoría ya está completada" }
    }

    const tipo = aud.tipo as S5Tipo
    const maxPuntaje = S5_MAX_PUNTAJE[tipo]

    const { data: itemsRaw, error: errItems } = await supabase
      .from("s5_auditoria_items")
      .select(
        "puntaje, catalogo:s5_items_catalogo!s5_auditoria_items_item_id_fkey(categoria)"
      )
      .eq("auditoria_id", id)

    if (errItems) return { error: errItems.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (itemsRaw ?? []) as any[]
    if (items.length === 0) {
      return { error: "La auditoría no tiene ítems cargados" }
    }
    if (items.some((i) => i.puntaje === null || i.puntaje === undefined)) {
      return {
        error: "Faltan ítems por puntuar. Completá todos los ítems antes de finalizar.",
      }
    }

    // Notas por categoría
    const acumPorCat: Record<string, { sum: number; n: number }> = {}
    let totalSum = 0
    let totalN = 0
    for (const it of items) {
      const cat = it.catalogo?.categoria as S5Categoria | undefined
      if (!cat) continue
      const pct = (Number(it.puntaje) / maxPuntaje) * 100
      if (!acumPorCat[cat]) acumPorCat[cat] = { sum: 0, n: 0 }
      acumPorCat[cat].sum += pct
      acumPorCat[cat].n += 1
      totalSum += pct
      totalN += 1
    }

    const notasPorS: Record<string, number> = {}
    for (const cat of S5_CATEGORIA_ORDEN) {
      const a = acumPorCat[cat]
      notasPorS[cat] = a ? Number((a.sum / a.n).toFixed(2)) : 0
    }
    const notaTotal = totalN > 0 ? Number((totalSum / totalN).toFixed(2)) : 0

    const { data, error } = await supabase
      .from("s5_auditorias")
      .update({
        estado: "completada",
        nota_total: notaTotal,
        notas_por_s: notasPorS,
      })
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    revalidatePath(`${DASHBOARD_PATH}/auditoria/${id}`)
    return { data: data as S5Auditoria }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error finalizando",
    }
  }
}

// ===================================================
// Helpers de período actual (export por conveniencia)
// ===================================================

export async function getPeriodoActual(): Promise<string> {
  return firstDayOfMonth(new Date())
}

// ===================================================
// Indicadores 5S
// ===================================================

function addMonths(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map((n) => parseInt(n, 10))
  const d = new Date(y, m - 1 + delta, 1)
  return firstDayOfMonth(d)
}

const MES_LABELS_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
]

function formatMesCorto(periodo: string): string {
  const [y, m] = periodo.split("-").map((n) => parseInt(n, 10))
  const yy = String(y).slice(-2)
  return `${MES_LABELS_CORTOS[m - 1]} ${yy}`
}

async function computePromedioMes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tipo: S5Tipo,
  periodo: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("s5_auditorias")
    .select("nota_total")
    .eq("tipo", tipo)
    .eq("periodo", periodo)
    .eq("estado", "completada")
    .not("nota_total", "is", null)

  if (error) return null
  const rows = (data ?? []) as { nota_total: number | null }[]
  if (rows.length === 0) return null
  const sum = rows.reduce((acc, r) => acc + Number(r.nota_total ?? 0), 0)
  return Number((sum / rows.length).toFixed(2))
}

export async function getS5KpisMes(
  tipo: S5Tipo,
  periodo: string
): Promise<{ data: S5KpisMes } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Auditorías completadas del período
    const { data: audRaw, error: errAud } = await supabase
      .from("s5_auditorias")
      .select(
        "id, nota_total, vehiculo_id, sector_numero, estado, vehiculo:catalogo_vehiculos!s5_auditorias_vehiculo_id_fkey(id, dominio)"
      )
      .eq("tipo", tipo)
      .eq("periodo", periodo)
      .eq("estado", "completada")

    if (errAud) return { error: errAud.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditorias = (audRaw ?? []) as any[]

    // Total auditorías del mes (completadas + borrador)
    const { count: totalAuditorias } = await supabase
      .from("s5_auditorias")
      .select("id", { count: "exact", head: true })
      .eq("tipo", tipo)
      .eq("periodo", periodo)

    // Pendientes
    let pendientes = 0
    if (tipo === "flota") {
      const { count: activos } = await supabase
        .from("catalogo_vehiculos")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
      pendientes = Math.max((activos ?? 0) - auditorias.length, 0)
    } else {
      pendientes = Math.max(4 - auditorias.length, 0)
    }

    // Promedio
    const promedio =
      auditorias.length > 0
        ? Number(
            (
              auditorias.reduce(
                (acc, a) => acc + Number(a.nota_total ?? 0),
                0
              ) / auditorias.length
            ).toFixed(2)
          )
        : null

    // Promedio mes anterior
    const periodoAnterior = addMonths(periodo, -1)
    const promedioMesAnterior = await computePromedioMes(
      supabase,
      tipo,
      periodoAnterior
    )

    // Mejor / peor performer
    let mejor: { nombre: string; nota: number } | null = null
    let peor: { nombre: string; nota: number } | null = null

    if (auditorias.length > 0) {
      // Resolver nombre sector con responsables si tipo = almacen
      let respBySector: Map<number, string> | null = null
      if (tipo === "almacen") {
        const { data: resp } = await supabase
          .from("s5_sector_responsables")
          .select("sector_numero, nombre")
          .eq("periodo", periodo)
        respBySector = new Map<number, string>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (resp ?? []) as any[]) {
          if (r.nombre) respBySector.set(r.sector_numero, r.nombre)
        }
      }

      const rows = auditorias.map((a) => {
        let nombre = "—"
        if (tipo === "flota") {
          nombre = a.vehiculo?.dominio ?? "—"
        } else {
          const base = `Sector ${a.sector_numero}`
          const nom = respBySector?.get(a.sector_numero)
          nombre = nom ? `${base} — ${nom}` : base
        }
        return { nombre, nota: Number(a.nota_total ?? 0) }
      })

      const ordenAsc = [...rows].sort((a, b) => a.nota - b.nota)
      peor = ordenAsc[0] ?? null
      mejor = ordenAsc[ordenAsc.length - 1] ?? null
    }

    // Ítems críticos: promedio puntaje < 50% del máximo
    const maxPuntaje = S5_MAX_PUNTAJE[tipo]
    let itemsCriticos = 0
    if (auditorias.length > 0) {
      const audIds = auditorias.map((a) => a.id as string)
      const { data: itemsRaw } = await supabase
        .from("s5_auditoria_items")
        .select("item_id, puntaje")
        .in("auditoria_id", audIds)
        .not("puntaje", "is", null)

      const acum = new Map<string, { sum: number; n: number }>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (itemsRaw ?? []) as any[]) {
        const id = r.item_id as string
        const p = Number(r.puntaje ?? 0)
        const cur = acum.get(id) ?? { sum: 0, n: 0 }
        cur.sum += p
        cur.n += 1
        acum.set(id, cur)
      }

      for (const v of acum.values()) {
        if (v.n === 0) continue
        const avg = v.sum / v.n
        if (avg / maxPuntaje < 0.5) itemsCriticos += 1
      }
    }

    return {
      data: {
        promedio_nota: promedio,
        total_auditorias: totalAuditorias ?? 0,
        pendientes,
        promedio_mes_anterior: promedioMesAnterior,
        mejor_nombre: mejor?.nombre ?? null,
        mejor_nota: mejor?.nota ?? null,
        peor_nombre: peor?.nombre ?? null,
        peor_nota: peor?.nota ?? null,
        items_criticos_count: itemsCriticos,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error calculando KPIs 5S",
    }
  }
}

export async function getS5TendenciaMensual(
  tipo: S5Tipo,
  periodoFin: string,
  meses: number = 12
): Promise<{ data: S5TendenciaMes[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const periodos: string[] = []
    for (let i = meses - 1; i >= 0; i--) {
      periodos.push(addMonths(periodoFin, -i))
    }
    const inicio = periodos[0]

    const { data: audRaw, error } = await supabase
      .from("s5_auditorias")
      .select("periodo, nota_total, notas_por_s")
      .eq("tipo", tipo)
      .eq("estado", "completada")
      .gte("periodo", inicio)
      .lte("periodo", periodoFin)

    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (audRaw ?? []) as any[]

    // Agrupar por período
    const acumByPeriodo = new Map<
      string,
      {
        total: { sum: number; n: number }
        porCat: Record<S5Categoria, { sum: number; n: number }>
      }
    >()

    for (const r of rows) {
      const p = r.periodo as string
      if (!acumByPeriodo.has(p)) {
        acumByPeriodo.set(p, {
          total: { sum: 0, n: 0 },
          porCat: {
            organizacion: { sum: 0, n: 0 },
            orden: { sum: 0, n: 0 },
            limpieza: { sum: 0, n: 0 },
            estandarizacion: { sum: 0, n: 0 },
            disciplina: { sum: 0, n: 0 },
          },
        })
      }
      const slot = acumByPeriodo.get(p)!
      if (r.nota_total !== null && r.nota_total !== undefined) {
        slot.total.sum += Number(r.nota_total)
        slot.total.n += 1
      }
      const notas = (r.notas_por_s ?? null) as Record<
        S5Categoria,
        number
      > | null
      if (notas) {
        for (const cat of S5_CATEGORIA_ORDEN) {
          const v = notas[cat]
          if (v !== null && v !== undefined) {
            slot.porCat[cat].sum += Number(v)
            slot.porCat[cat].n += 1
          }
        }
      }
    }

    const out: S5TendenciaMes[] = periodos.map((p) => {
      const slot = acumByPeriodo.get(p)
      const avg = (s: { sum: number; n: number }) =>
        s.n > 0 ? Number((s.sum / s.n).toFixed(2)) : null
      return {
        periodo: p,
        mes_label: formatMesCorto(p),
        organizacion: slot ? avg(slot.porCat.organizacion) : null,
        orden: slot ? avg(slot.porCat.orden) : null,
        limpieza: slot ? avg(slot.porCat.limpieza) : null,
        estandarizacion: slot ? avg(slot.porCat.estandarizacion) : null,
        disciplina: slot ? avg(slot.porCat.disciplina) : null,
        total: slot ? avg(slot.total) : null,
      }
    })

    return { data: out }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando tendencia 5S",
    }
  }
}

export async function getS5Ranking(
  tipo: S5Tipo,
  periodo: string
): Promise<{ data: S5RankingRow[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: audRaw, error } = await supabase
      .from("s5_auditorias")
      .select(
        "id, estado, nota_total, vehiculo_id, sector_numero, vehiculo:catalogo_vehiculos!s5_auditorias_vehiculo_id_fkey(id, dominio)"
      )
      .eq("tipo", tipo)
      .eq("periodo", periodo)
      .eq("estado", "completada")
      .not("nota_total", "is", null)

    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditorias = (audRaw ?? []) as any[]

    let respBySector: Map<number, string> | null = null
    if (tipo === "almacen") {
      const { data: resp } = await supabase
        .from("s5_sector_responsables")
        .select("sector_numero, nombre")
        .eq("periodo", periodo)
      respBySector = new Map<number, string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (resp ?? []) as any[]) {
        if (r.nombre) respBySector.set(r.sector_numero, r.nombre)
      }
    }

    const rows: S5RankingRow[] = auditorias.map((a) => {
      let id = ""
      let nombre = "—"
      if (tipo === "flota") {
        id = (a.vehiculo_id as string) ?? a.id
        nombre = a.vehiculo?.dominio ?? "—"
      } else {
        id = String(a.sector_numero ?? "")
        const base = `Sector ${a.sector_numero}`
        const nom = respBySector?.get(a.sector_numero)
        nombre = nom ? `${base} — ${nom}` : base
      }
      return {
        id,
        nombre,
        nota_total: Number(a.nota_total ?? 0),
        estado: a.estado,
      }
    })

    rows.sort((a, b) => a.nota_total - b.nota_total)
    return { data: rows }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando ranking 5S",
    }
  }
}

export async function getS5TopItemsCriticos(
  tipo: S5Tipo,
  periodo: string,
  limit: number = 5
): Promise<{ data: S5ItemCriticoRow[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: audRaw, error: errAud } = await supabase
      .from("s5_auditorias")
      .select("id")
      .eq("tipo", tipo)
      .eq("periodo", periodo)
      .eq("estado", "completada")

    if (errAud) return { error: errAud.message }
    const audIds = ((audRaw ?? []) as { id: string }[]).map((a) => a.id)

    if (audIds.length === 0) return { data: [] }

    const { data: itemsRaw, error: errItems } = await supabase
      .from("s5_auditoria_items")
      .select(
        "item_id, puntaje, observaciones, catalogo:s5_items_catalogo!s5_auditoria_items_item_id_fkey(id, numero, titulo, categoria, tipo)"
      )
      .in("auditoria_id", audIds)
      .not("puntaje", "is", null)

    if (errItems) return { error: errItems.message }

    const maxPuntaje = S5_MAX_PUNTAJE[tipo]

    interface Acum {
      sum: number
      n: number
      numero: number
      titulo: string
      categoria: S5Categoria
      obs: Map<string, number>
    }

    const acum = new Map<string, Acum>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (itemsRaw ?? []) as any[]) {
      const cat = r.catalogo
      if (!cat || cat.tipo !== tipo) continue
      const id = r.item_id as string
      const cur: Acum =
        acum.get(id) ?? {
          sum: 0,
          n: 0,
          numero: cat.numero,
          titulo: cat.titulo,
          categoria: cat.categoria,
          obs: new Map<string, number>(),
        }
      cur.sum += Number(r.puntaje ?? 0)
      cur.n += 1
      const obs = (r.observaciones as string | null)?.trim()
      if (obs) cur.obs.set(obs, (cur.obs.get(obs) ?? 0) + 1)
      acum.set(id, cur)
    }

    const list: S5ItemCriticoRow[] = []
    for (const [item_id, v] of acum.entries()) {
      if (v.n === 0) continue
      const avgPct = Number(((v.sum / v.n / maxPuntaje) * 100).toFixed(2))
      let obsComun: string | null = null
      let maxCount = 1
      for (const [txt, c] of v.obs.entries()) {
        if (c > maxCount) {
          maxCount = c
          obsComun = txt
        }
      }
      list.push({
        item_id,
        numero: v.numero,
        titulo: v.titulo,
        categoria: v.categoria,
        promedio_pct: avgPct,
        veces_evaluado: v.n,
        observacion_comun: obsComun,
      })
    }

    list.sort((a, b) => a.promedio_pct - b.promedio_pct)
    return { data: list.slice(0, limit) }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando ítems críticos 5S",
    }
  }
}

// ===================================================
// Eliminar auditoría (borra items + auditoría)
// ===================================================
export async function eliminarAuditoria(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin" && profile.role !== "auditor") {
      return { error: "Sin permisos para eliminar auditorías" }
    }

    const supabase = await createClient()

    const { error: errItems } = await supabase
      .from("s5_auditoria_items")
      .delete()
      .eq("auditoria_id", id)
    if (errItems) return { error: errItems.message }

    const { error } = await supabase.from("s5_auditorias").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath("/5s")
    return { success: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error eliminando auditoría",
    }
  }
}
