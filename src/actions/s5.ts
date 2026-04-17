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
  empleadoId: string
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
