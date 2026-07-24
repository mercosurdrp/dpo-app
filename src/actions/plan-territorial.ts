"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { getKmCiudades } from "./costo-pdv"

const PATH = "/planeamiento/plan-territorial"
const ROLES_EDITORES = ["admin", "supervisor", "admin_rrhh"]

type Result<T> = { data: T } | { error: string }

function esEditor(role: string): boolean {
  return ROLES_EDITORES.includes(role)
}

// ==================================================================
// Diagnóstico territorial: el costo y la operación agregados por ciudad
//
// No guardamos nada de esto: sale en vivo de la misma RPC que alimenta
// Costo por PDV, así que el $/HL de acá es por construcción el mismo que
// muestra ese indicador. Si divergiera, sería un bug.
// ==================================================================

export interface CiudadMes {
  anio: number
  mes: number
  hl: number
  bultos: number
  venta_neta: number
  costo_total: number
  costo_x_hl: number
  entregas: number
  pdv: number
}

export interface CiudadResumen {
  ciudad: string
  /** Km de ruta desde el CD. null si la ciudad no está cargada en costo_km_ciudad. */
  km: number | null
  pdv: number
  hl: number
  bultos: number
  venta_neta: number
  costo_total: number
  costo_distancia: number
  /** La métrica del 5.1: VLC/HL de la ciudad, acumulado del período. */
  costo_x_hl: number
  entregas: number
  /** Drop size en HL. Es lo que sube cuando bajás frecuencia sin perder volumen. */
  hl_por_entrega: number
  /** Drop size en bultos, que es como lo mira la operación. */
  bultos_por_entrega: number
  /** Proxy de frecuencia: cuántas veces al período se visita cada PDV. */
  entregas_por_pdv: number
  pct_rechazo: number
  serie: CiudadMes[]
}

export interface Territorio {
  anio: number
  meses: number[]
  ciudades: CiudadResumen[]
  total: {
    pdv: number
    hl: number
    costo_total: number
    costo_x_hl: number
    entregas: number
  }
}

/**
 * Diagnóstico por ciudad de todos los meses con costo cargado del año.
 *
 * Los derivados ($/HL, drop size) se recalculan sobre los totales acumulados,
 * nunca promediando ratios mensuales: el promedio de ratios da distinto y
 * sobre-pondera los meses flojos.
 */
export async function getTerritorio(anio: number): Promise<Result<Territorio>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: mesesData, error: eMeses } = await supabase
      .from("costo_logistico_mensual")
      .select("mes")
      .eq("anio", anio)
      .order("mes", { ascending: true })
    if (eMeses) return { error: eMeses.message }

    const meses = (mesesData ?? []).map((r) => Number(r.mes))
    if (meses.length === 0) {
      return {
        data: {
          anio,
          meses: [],
          ciudades: [],
          total: { pdv: 0, hl: 0, costo_total: 0, costo_x_hl: 0, entregas: 0 },
        },
      }
    }

    // Una sola RPC que agrega por ciudad del lado del servidor.
    //
    // Antes esto era `Promise.all(meses.map(getCostoPorPdv))` con un
    // `if ("error" in res) return` que descartaba en silencio cualquier mes caído por
    // statement_timeout (8s para `authenticated`). Con varios meses cargados las RPC
    // salían juntas, competían por la CPU y algunas morían: los costos por ciudad
    // quedaban cortos y una línea base de plan podía nacer contra un total
    // incompleto, sin ninguna señal. Ahora un fallo se propaga como error.
    const [{ data: terr, error: eTerr }, kmCiudades] = await Promise.all([
      supabase.rpc("get_territorio_json", { p_anio: anio }),
      getKmCiudades(),
    ])
    if (eTerr) return { error: eTerr.message }
    const kmPorCiudad = new Map(kmCiudades.map((k) => [k.ciudad, k.km]))

    const payload = (terr ?? {}) as { ciudades?: unknown }
    const crudas = Array.isArray(payload.ciudades)
      ? (payload.ciudades as Record<string, unknown>[])
      : []

    const ciudades: CiudadResumen[] = crudas
      .map((c) => {
        const hl = Number(c.hl ?? 0)
        const bultos = Number(c.bultos ?? 0)
        const entregas = Number(c.entregas ?? 0)
        const rech = Number(c.bultos_rechazados ?? 0)
        const pdv = Number(c.pdv ?? 0)
        const serie = (Array.isArray(c.serie) ? (c.serie as Record<string, unknown>[]) : []).map(
          (m) => ({
            anio: Number(m.anio),
            mes: Number(m.mes),
            hl: Number(m.hl ?? 0),
            bultos: Number(m.bultos ?? 0),
            venta_neta: Number(m.venta_neta ?? 0),
            costo_total: Number(m.costo_total ?? 0),
            costo_x_hl: Number(m.costo_x_hl ?? 0),
            entregas: Number(m.entregas ?? 0),
            pdv: Number(m.pdv ?? 0),
          }),
        )
        return {
          ciudad: String(c.ciudad ?? "(sin ciudad)"),
          km: kmPorCiudad.get(String(c.ciudad ?? "")) ?? null,
          pdv,
          hl,
          bultos,
          venta_neta: Number(c.venta_neta ?? 0),
          costo_total: Number(c.costo_total ?? 0),
          costo_distancia: Number(c.costo_distancia ?? 0),
          costo_x_hl: Number(c.costo_x_hl ?? 0),
          entregas,
          hl_por_entrega: entregas ? hl / entregas : 0,
          bultos_por_entrega: entregas ? bultos / entregas : 0,
          entregas_por_pdv: pdv ? entregas / pdv : 0,
          pct_rechazo: bultos + rech ? (100 * rech) / (bultos + rech) : 0,
          serie,
        }
      })
      .sort((x, y) => y.costo_x_hl - x.costo_x_hl)

    const total = ciudades.reduce(
      (t, c) => ({
        pdv: t.pdv + c.pdv,
        hl: t.hl + c.hl,
        costo_total: t.costo_total + c.costo_total,
        costo_x_hl: 0,
        entregas: t.entregas + c.entregas,
      }),
      { pdv: 0, hl: 0, costo_total: 0, costo_x_hl: 0, entregas: 0 },
    )
    total.costo_x_hl = total.hl ? total.costo_total / total.hl : 0

    return { data: { anio, meses, ciudades, total } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el territorio",
    }
  }
}

// ==================================================================
// Escenarios (R5.1.1)
// ==================================================================

export type TipoEscenario = "base" | "objetivo" | "dream"

export interface Escenario {
  id: string
  anio: number
  tipo: TipoEscenario
  nombre: string
  vlc_hl: number | null
  supuestos: string | null
  km_ciudad: Record<string, number> | null
  updated_at: string
}

export async function getEscenarios(anio: number): Promise<Result<Escenario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("territorial_escenarios")
      .select("id, anio, tipo, nombre, vlc_hl, supuestos, km_ciudad, updated_at")
      .eq("anio", anio)
    if (error) return { error: error.message }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        anio: Number(r.anio),
        tipo: r.tipo as TipoEscenario,
        nombre: r.nombre as string,
        vlc_hl: r.vlc_hl != null ? Number(r.vlc_hl) : null,
        supuestos: (r.supuestos as string) ?? null,
        km_ciudad: (r.km_ciudad as Record<string, number> | null) ?? null,
        updated_at: r.updated_at as string,
      })),
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando escenarios",
    }
  }
}

export async function guardarEscenario(input: {
  anio: number
  tipo: TipoEscenario
  nombre: string
  vlc_hl: number | null
  supuestos: string | null
  km_ciudad: Record<string, number> | null
}): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) {
      return { error: "Solo editores pueden modificar los escenarios" }
    }
    if (!input.nombre.trim()) return { error: "El nombre es obligatorio" }
    if (input.vlc_hl != null && input.vlc_hl < 0) {
      return { error: "El VLC/HL no puede ser negativo" }
    }

    const supabase = await createClient()
    const { error } = await supabase.from("territorial_escenarios").upsert(
      {
        anio: input.anio,
        tipo: input.tipo,
        nombre: input.nombre.trim(),
        vlc_hl: input.vlc_hl,
        supuestos: input.supuestos,
        km_ciudad: input.km_ciudad,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      },
      { onConflict: "anio,tipo" },
    )
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error guardando el escenario",
    }
  }
}

// ==================================================================
// Simulación de relocalización del CD
//
// NO vive acá: el escenario de ensueño es siempre el CD en San Nicolás y se
// muestra como supuestos + ahorro. Probar OTRAS ubicaciones (km editables) es
// el simulador de Costo por PDV, al que la página linkea — no se duplica.
// ==================================================================

// ==================================================================
// Planes territoriales (R5.1.2 y R5.1.4)
// ==================================================================

export type PalancaPlan =
  | "frecuencia"
  | "drop_size"
  | "cartera"
  | "relocalizacion"
  | "otro"
export type EstadoPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadPlan = "alta" | "media" | "baja"

const PALANCAS: PalancaPlan[] = [
  "frecuencia",
  "drop_size",
  "cartera",
  "relocalizacion",
  "otro",
]
const ESTADOS: EstadoPlan[] = ["pendiente", "en_progreso", "completado"]
const PRIORIDADES: PrioridadPlan[] = ["alta", "media", "baja"]

export interface PlanTerritorial {
  id: string
  ciudad: string
  titulo: string
  descripcion: string | null
  palanca: PalancaPlan
  linea_base: number | null
  linea_base_desde: string | null
  linea_base_hasta: string | null
  meta: number | null
  fecha_implementacion: string | null
  responsable_comercial_id: string | null
  responsable_comercial_nombre: string | null
  responsable_logistica_id: string | null
  responsable_logistica_nombre: string | null
  prioridad: PrioridadPlan
  estado: EstadoPlan
  fecha_objetivo: string | null
  created_at: string
  updated_at: string
  avances_count: number
  /** Los avances cargados, más nuevo primero. Es la bitácora del plan. */
  avances: AvanceTerritorial[]
  /** $/HL vigente de la ciudad. Se completa en la página con el territorio. */
  costo_actual?: number | null
}

export async function listarPlanesTerritoriales(): Promise<
  Result<PlanTerritorial[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("territorial_planes")
      .select(
        "*, comercial:profiles!territorial_planes_responsable_comercial_id_fkey(id, nombre), logistica:profiles!territorial_planes_responsable_logistica_id_fkey(id, nombre)",
      )
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    const ids = rows.map((r) => String(r.id))

    // Traemos los avances enteros (no sólo el conteo): la tarjeta del plan los
    // lista como bitácora. Antes esto sólo contaba y el avance cargado no se
    // veía en ningún lado.
    const avancesMap = new Map<string, AvanceTerritorial[]>()
    if (ids.length) {
      const { data: avs } = await supabase
        .from("territorial_planes_avances")
        .select(
          "*, autor:profiles!territorial_planes_avances_autor_id_fkey(id, nombre)",
        )
        .in("plan_id", ids)
        .order("created_at", { ascending: false })
      for (const row of (avs ?? []) as unknown as Array<
        Record<string, unknown>
      >) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = row as any
        const av: AvanceTerritorial = {
          id: a.id,
          plan_id: a.plan_id,
          comentario: a.comentario ?? null,
          estado_resultante: (a.estado_resultante as EstadoPlan | null) ?? null,
          costo_x_hl: a.costo_x_hl != null ? Number(a.costo_x_hl) : null,
          autor_nombre: a.autor?.nombre ?? null,
          created_at: a.created_at,
        }
        const arr = avancesMap.get(av.plan_id) ?? []
        arr.push(av)
        avancesMap.set(av.plan_id, arr)
      }
    }

    return {
      data: rows.map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any
        return {
          id: r.id,
          ciudad: r.ciudad,
          titulo: r.titulo,
          descripcion: r.descripcion ?? null,
          palanca: (r.palanca as PalancaPlan) ?? "otro",
          linea_base: r.linea_base != null ? Number(r.linea_base) : null,
          linea_base_desde: r.linea_base_desde ?? null,
          linea_base_hasta: r.linea_base_hasta ?? null,
          meta: r.meta != null ? Number(r.meta) : null,
          fecha_implementacion: r.fecha_implementacion ?? null,
          responsable_comercial_id: r.responsable_comercial_id ?? null,
          responsable_comercial_nombre: r.comercial?.nombre ?? null,
          responsable_logistica_id: r.responsable_logistica_id ?? null,
          responsable_logistica_nombre: r.logistica?.nombre ?? null,
          prioridad: (r.prioridad as PrioridadPlan) ?? "media",
          estado: (r.estado as EstadoPlan) ?? "pendiente",
          fecha_objetivo: r.fecha_objetivo ?? null,
          created_at: r.created_at,
          updated_at: r.updated_at,
          avances_count: avancesMap.get(String(r.id))?.length ?? 0,
          avances: avancesMap.get(String(r.id)) ?? [],
        }
      }),
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los planes",
    }
  }
}

export async function crearPlanTerritorial(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) {
      return { error: "Solo editores pueden crear planes territoriales" }
    }

    const ciudad = String(formData.get("ciudad") ?? "").trim()
    const titulo = String(formData.get("titulo") ?? "").trim()
    if (!ciudad) return { error: "La ciudad es obligatoria" }
    if (!titulo) return { error: "El título es obligatorio" }

    const palancaRaw = String(formData.get("palanca") ?? "otro").trim()
    const palanca = PALANCAS.includes(palancaRaw as PalancaPlan)
      ? (palancaRaw as PalancaPlan)
      : "otro"
    const prioridadRaw = String(formData.get("prioridad") ?? "media").trim()
    const prioridad = PRIORIDADES.includes(prioridadRaw as PrioridadPlan)
      ? (prioridadRaw as PrioridadPlan)
      : "media"

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("territorial_planes")
      .insert({
        ciudad,
        titulo,
        descripcion: String(formData.get("descripcion") ?? "").trim() || null,
        palanca,
        linea_base: numOrNull(formData.get("linea_base")),
        linea_base_desde: strOrNull(formData.get("linea_base_desde")),
        linea_base_hasta: strOrNull(formData.get("linea_base_hasta")),
        meta: numOrNull(formData.get("meta")),
        fecha_implementacion: strOrNull(formData.get("fecha_implementacion")),
        responsable_comercial_id: strOrNull(
          formData.get("responsable_comercial_id"),
        ),
        responsable_logistica_id: strOrNull(
          formData.get("responsable_logistica_id"),
        ),
        prioridad,
        estado: "pendiente",
        fecha_objetivo: strOrNull(formData.get("fecha_objetivo")),
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "No se pudo crear el plan" }
    }
    revalidatePath(PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando el plan",
    }
  }
}

export async function actualizarPlanTerritorial(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }
    const supabase = await createClient()

    const { data: plan, error: errP } = await supabase
      .from("territorial_planes")
      .select("created_by, responsable_comercial_id, responsable_logistica_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const p = plan as {
      created_by: string | null
      responsable_comercial_id: string | null
      responsable_logistica_id: string | null
    }
    if (
      !esEditor(profile.role) &&
      p.created_by !== profile.id &&
      p.responsable_comercial_id !== profile.id &&
      p.responsable_logistica_id !== profile.id
    ) {
      return { error: "No tenés permiso para editar este plan" }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (formData.has("titulo")) {
      const t = String(formData.get("titulo") ?? "").trim()
      if (!t) return { error: "El título no puede quedar vacío" }
      updates.titulo = t
    }
    if (formData.has("descripcion"))
      updates.descripcion = strOrNull(formData.get("descripcion"))
    if (formData.has("palanca")) {
      const v = String(formData.get("palanca") ?? "").trim()
      if (PALANCAS.includes(v as PalancaPlan)) updates.palanca = v
    }
    if (formData.has("estado")) {
      const v = String(formData.get("estado") ?? "").trim()
      if (!ESTADOS.includes(v as EstadoPlan)) return { error: "Estado inválido" }
      updates.estado = v
    }
    if (formData.has("prioridad")) {
      const v = String(formData.get("prioridad") ?? "").trim()
      if (PRIORIDADES.includes(v as PrioridadPlan)) updates.prioridad = v
    }
    for (const campo of ["linea_base", "meta"]) {
      if (formData.has(campo)) updates[campo] = numOrNull(formData.get(campo))
    }
    for (const campo of [
      "linea_base_desde",
      "linea_base_hasta",
      "fecha_implementacion",
      "fecha_objetivo",
      "responsable_comercial_id",
      "responsable_logistica_id",
    ]) {
      if (formData.has(campo)) updates[campo] = strOrNull(formData.get(campo))
    }

    const { error } = await supabase
      .from("territorial_planes")
      .update(updates)
      .eq("id", planId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando el plan",
    }
  }
}

export async function eliminarPlanTerritorial(
  planId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }
    const supabase = await createClient()

    const { data: plan, error: errP } = await supabase
      .from("territorial_planes")
      .select("created_by")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    if (
      !esEditor(profile.role) &&
      (plan as { created_by: string | null }).created_by !== profile.id
    ) {
      return { error: "No tenés permiso para eliminar este plan" }
    }

    const { error } = await supabase
      .from("territorial_planes")
      .delete()
      .eq("id", planId)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Avances
// ------------------------------------------------------------------

export interface AvanceTerritorial {
  id: string
  plan_id: string
  comentario: string | null
  estado_resultante: EstadoPlan | null
  costo_x_hl: number | null
  autor_nombre: string | null
  created_at: string
}

export async function listarAvancesPlanTerritorial(
  planId: string,
): Promise<Result<AvanceTerritorial[]>> {
  try {
    await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("territorial_planes_avances")
      .select(
        "*, autor:profiles!territorial_planes_avances_autor_id_fkey(id, nombre)",
      )
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    return {
      data: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
        (row) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = row as any
          return {
            id: r.id,
            plan_id: r.plan_id,
            comentario: r.comentario ?? null,
            estado_resultante: (r.estado_resultante as EstadoPlan | null) ?? null,
            costo_x_hl: r.costo_x_hl != null ? Number(r.costo_x_hl) : null,
            autor_nombre: r.autor?.nombre ?? null,
            created_at: r.created_at,
          }
        },
      ),
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los avances",
    }
  }
}

export async function agregarAvancePlanTerritorial(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!planId) return { error: "ID de plan inválido" }
    const supabase = await createClient()

    const { data: plan, error: errP } = await supabase
      .from("territorial_planes")
      .select("estado, created_by, responsable_comercial_id, responsable_logistica_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const p = plan as {
      estado: EstadoPlan
      created_by: string | null
      responsable_comercial_id: string | null
      responsable_logistica_id: string | null
    }
    if (
      !esEditor(profile.role) &&
      p.created_by !== profile.id &&
      p.responsable_comercial_id !== profile.id &&
      p.responsable_logistica_id !== profile.id
    ) {
      return { error: "Solo los responsables o un editor pueden cargar avances" }
    }

    const comentario = strOrNull(formData.get("comentario"))
    if (!comentario) return { error: "Escribí un comentario del avance" }

    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()
    let nuevoEstado: EstadoPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS.includes(nuevoEstadoRaw as EstadoPlan))
        return { error: "Estado inválido" }
      nuevoEstado = nuevoEstadoRaw as EstadoPlan
    }

    const { error } = await supabase.from("territorial_planes_avances").insert({
      plan_id: planId,
      comentario,
      estado_resultante: nuevoEstado,
      costo_x_hl: numOrNull(formData.get("costo_x_hl")),
      autor_id: profile.id,
    })
    if (error) return { error: error.message }

    if (nuevoEstado && nuevoEstado !== p.estado) {
      await supabase
        .from("territorial_planes")
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", planId)
    }

    revalidatePath(PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error registrando el avance",
    }
  }
}

// ==================================================================
// Revisiones mensuales (R5.1.3)
// ==================================================================

export interface RevisionTerritorial {
  id: string
  anio: number
  mes: number
  participantes: string | null
  conclusion: string | null
  vlc_hl_mes: number | null
  created_at: string
}

export async function listarRevisiones(
  anio: number,
): Promise<Result<RevisionTerritorial[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("territorial_revisiones")
      .select("id, anio, mes, participantes, conclusion, vlc_hl_mes, created_at")
      .eq("anio", anio)
      .order("mes", { ascending: false })
    if (error) return { error: error.message }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        anio: Number(r.anio),
        mes: Number(r.mes),
        participantes: (r.participantes as string) ?? null,
        conclusion: (r.conclusion as string) ?? null,
        vlc_hl_mes: r.vlc_hl_mes != null ? Number(r.vlc_hl_mes) : null,
        created_at: r.created_at as string,
      })),
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando las revisiones",
    }
  }
}

export async function registrarRevision(input: {
  anio: number
  mes: number
  participantes: string
  conclusion: string
  vlc_hl_mes: number | null
}): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!esEditor(profile.role)) {
      return { error: "Solo editores pueden registrar la revisión mensual" }
    }
    if (input.mes < 1 || input.mes > 12) return { error: "Mes inválido" }
    if (!input.participantes.trim()) {
      return {
        error:
          "Anotá quiénes participaron: la revisión vale como evidencia sólo si están ventas y operaciones",
      }
    }

    const supabase = await createClient()
    const { error } = await supabase.from("territorial_revisiones").upsert(
      {
        anio: input.anio,
        mes: input.mes,
        participantes: input.participantes.trim(),
        conclusion: input.conclusion.trim() || null,
        vlc_hl_mes: input.vlc_hl_mes,
        created_by: profile.id,
      },
      { onConflict: "anio,mes" },
    )
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error registrando la revisión",
    }
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = strOrNull(v)
  if (s == null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
