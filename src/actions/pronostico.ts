"use server"

/**
 * Rutina de Pronóstico — DPO Planeamiento 3.2 (solo Pampeana).
 *
 * R3.2.1 reunión mensual con TOR + asistencia · R3.2.2 política de inventario
 * y % de SKUs fuera de rango (debajo/encima) · R3.2.3 SKUs nuevos/retirados ·
 * R3.2.4 OOS teórico + planes de acción.
 *
 * La cobertura por SKU (stock kardex + VPD 30d) viene live de chess-dashboard
 * (/api/inventario-cobertura, header x-api-key = PLANIFICADOR_API_KEY).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

const CHESS_DASHBOARD_BASE = "https://chess-dashboard-mercosurdrps-projects.vercel.app"
const PATH = "/planeamiento/pronostico"
const ROLES_EDICION: ("admin" | "admin_rrhh" | "supervisor")[] = [
  "admin",
  "admin_rrhh",
  "supervisor",
]

type Result<T> = { data: T } | { error: string }

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type EstadoCobertura = "debajo" | "ok" | "encima" | "sin_vpd"

export interface CoberturaItem {
  articulo: string
  descripcion: string
  division: string
  segmento: string
  stockBultos: number
  stockHl: number
  vpdBultos: number
  vpdHl: number
  coberturaDias: number | null
  estado: EstadoCobertura
  minDias: number
  maxDias: number
}

export interface PoliticaSegmento {
  segmento: string
  nombre: string
  min_dias: number
  max_dias: number
}

export interface CoberturaResumen {
  totalSkus: number
  conVpd: number
  pctDebajo: number
  pctEncima: number
  pctOk: number
  kardexMes: string
  generado: string
}

export interface PronosticoSnapshot {
  id: string
  anio: number
  mes: number
  total_skus: number
  pct_debajo: number
  pct_encima: number
  pct_ok: number
  created_at: string
}

export interface SkuCambio {
  id: string
  tipo: "alta" | "baja"
  articulo: string
  descripcion: string
  fecha: string
  configurado_sistema: boolean
  comunicado_equipo: boolean
  evidencia_url: string | null
  notas: string | null
}

export interface ReunionAsistente {
  id?: string
  nombre: string
  area: "ventas" | "operaciones" | "otro"
  presente: boolean
}

export interface PronosticoReunion {
  id: string
  fecha: string
  metrica: Record<string, unknown>
  notas: string | null
  acta_url: string | null
  created_at: string
  asistentes: ReunionAsistente[]
}

export interface OosPlan {
  id: string
  articulo: string
  descripcion: string
  brecha: string | null
  accion: string
  responsable: string | null
  estado: "pendiente" | "en_progreso" | "completado"
  fecha_objetivo: string | null
  created_at: string
}

export interface RetirosMetrica {
  mes: number
  anio: number
  objetivo: Record<string, number>
  retirado: Record<string, number>
  cumplimiento: Record<string, number>
}

export interface PronosticoData {
  cobertura: CoberturaItem[]
  resumen: CoberturaResumen | null
  coberturaError: string | null
  politica: PoliticaSegmento[]
  snapshots: PronosticoSnapshot[]
  cambios: SkuCambio[]
  reuniones: PronosticoReunion[]
  planes: OosPlan[]
  retiros: RetirosMetrica | null
}

// ─── Fuentes externas (chess-dashboard) ─────────────────────────────────────

async function fetchChess<T>(path: string): Promise<T | null> {
  const key = process.env.PLANIFICADOR_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${CHESS_DASHBOARD_BASE}${path}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

interface CoberturaApiResponse {
  kardexMes: string
  generado: string
  items: Array<Omit<CoberturaItem, "estado" | "minDias" | "maxDias">>
}

function clasificarCobertura(
  items: CoberturaApiResponse["items"],
  politica: PoliticaSegmento[],
): { items: CoberturaItem[]; resumen: Omit<CoberturaResumen, "kardexMes" | "generado"> } {
  const polMap = new Map(politica.map((p) => [p.segmento, p]))
  const out: CoberturaItem[] = items.map((it) => {
    const pol = polMap.get(it.segmento) ?? polMap.get("otro")
    const min = Number(pol?.min_dias ?? 3)
    const max = Number(pol?.max_dias ?? 45)
    let estado: EstadoCobertura
    if (it.coberturaDias == null) estado = "sin_vpd"
    else if (it.coberturaDias < min) estado = "debajo"
    else if (it.coberturaDias > max) estado = "encima"
    else estado = "ok"
    return { ...it, estado, minDias: min, maxDias: max }
  })
  const conVpd = out.filter((i) => i.estado !== "sin_vpd")
  const pct = (n: number) => (conVpd.length ? Math.round((n / conVpd.length) * 1000) / 10 : 0)
  const nDebajo = conVpd.filter((i) => i.estado === "debajo").length
  const nEncima = conVpd.filter((i) => i.estado === "encima").length
  return {
    items: out,
    resumen: {
      totalSkus: out.length,
      conVpd: conVpd.length,
      pctDebajo: pct(nDebajo),
      pctEncima: pct(nEncima),
      pctOk: pct(conVpd.length - nDebajo - nEncima),
    },
  }
}

// ─── Carga principal ────────────────────────────────────────────────────────

export async function getDatosPronostico(): Promise<Result<PronosticoData>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = new Date()

    const [coberturaApi, retiros, politicaRes, snapshotsRes, cambiosRes, reunionesRes, planesRes] =
      await Promise.all([
        fetchChess<CoberturaApiResponse>("/api/inventario-cobertura?empresa=pampeana"),
        fetchChess<RetirosMetrica>(
          `/api/planificador-retiro?mes=${hoy.getMonth() + 1}&anio=${hoy.getFullYear()}&empresa=pampeana`,
        ),
        supabase.from("pronostico_politica").select("*").order("segmento"),
        supabase
          .from("pronostico_snapshots")
          .select("id, anio, mes, total_skus, pct_debajo, pct_encima, pct_ok, created_at")
          .order("anio", { ascending: false })
          .order("mes", { ascending: false })
          .limit(12),
        supabase.from("pronostico_sku_cambios").select("*").order("fecha", { ascending: false }).limit(100),
        supabase
          .from("pronostico_reuniones")
          .select("*, asistentes:pronostico_reuniones_asistentes(*)")
          .order("fecha", { ascending: false })
          .limit(24),
        supabase.from("pronostico_oos_planes").select("*").order("created_at", { ascending: false }).limit(100),
      ])

    const politica = (politicaRes.data ?? []) as PoliticaSegmento[]

    let cobertura: CoberturaItem[] = []
    let resumen: CoberturaResumen | null = null
    let coberturaError: string | null = null
    if (coberturaApi?.items) {
      const r = clasificarCobertura(coberturaApi.items, politica)
      cobertura = r.items
      resumen = { ...r.resumen, kardexMes: coberturaApi.kardexMes, generado: coberturaApi.generado }
    } else {
      coberturaError =
        "No se pudo obtener la cobertura live de chess-dashboard (¿PLANIFICADOR_API_KEY configurada?)"
    }

    return {
      data: {
        cobertura,
        resumen,
        coberturaError,
        politica,
        snapshots: (snapshotsRes.data ?? []) as PronosticoSnapshot[],
        cambios: (cambiosRes.data ?? []) as SkuCambio[],
        reuniones: (reunionesRes.data ?? []).map((r) => ({
          ...r,
          asistentes: (r as { asistentes?: ReunionAsistente[] }).asistentes ?? [],
        })) as PronosticoReunion[],
        planes: (planesRes.data ?? []) as OosPlan[],
        retiros: retiros && retiros.cumplimiento ? retiros : null,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando pronóstico" }
  }
}

// ─── Política de inventario (R3.2.2) ────────────────────────────────────────

export async function guardarPolitica(
  segmento: string,
  minDias: number,
  maxDias: number,
): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (!(minDias >= 0 && maxDias > minDias)) return { error: "Rango inválido (min < max)" }
    const supabase = await createClient()
    const { error } = await supabase
      .from("pronostico_politica")
      .update({ min_dias: minDias, max_dias: maxDias, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("segmento", segmento)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ─── Snapshot mensual (evidencia R3.2.2) ────────────────────────────────────

export async function guardarSnapshotMensual(): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    const supabase = await createClient()

    const [{ data: politica }, coberturaApi] = await Promise.all([
      supabase.from("pronostico_politica").select("*"),
      fetchChess<CoberturaApiResponse>("/api/inventario-cobertura?empresa=pampeana"),
    ])
    if (!coberturaApi?.items) return { error: "Sin datos live de cobertura para snapshotear" }

    const r = clasificarCobertura(coberturaApi.items, (politica ?? []) as PoliticaSegmento[])
    const hoy = new Date()
    const { error } = await supabase.from("pronostico_snapshots").upsert(
      {
        anio: hoy.getFullYear(),
        mes: hoy.getMonth() + 1,
        total_skus: r.resumen.conVpd,
        pct_debajo: r.resumen.pctDebajo,
        pct_encima: r.resumen.pctEncima,
        pct_ok: r.resumen.pctOk,
        detalle: r.items.filter((i) => i.estado === "debajo" || i.estado === "encima"),
        created_by: profile.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: "anio,mes" },
    )
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ─── SKUs nuevos / retirados (R3.2.3) ───────────────────────────────────────

export async function crearSkuCambio(input: {
  tipo: "alta" | "baja"
  articulo: string
  descripcion: string
  fecha: string
  evidencia_url?: string
  notas?: string
}): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (!input.articulo.trim()) return { error: "Falta el código de artículo" }
    const supabase = await createClient()
    const { error } = await supabase.from("pronostico_sku_cambios").insert({
      tipo: input.tipo,
      articulo: input.articulo.trim(),
      descripcion: input.descripcion.trim(),
      fecha: input.fecha,
      evidencia_url: input.evidencia_url?.trim() || null,
      notas: input.notas?.trim() || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function toggleSkuCambio(
  id: string,
  campo: "configurado_sistema" | "comunicado_equipo",
  valor: boolean,
): Promise<Result<true>> {
  try {
    await requireRole(ROLES_EDICION)
    const supabase = await createClient()
    const { error } = await supabase
      .from("pronostico_sku_cambios")
      .update({ [campo]: valor })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarSkuCambio(id: string): Promise<Result<true>> {
  try {
    await requireRole(ROLES_EDICION)
    const supabase = await createClient()
    const { error } = await supabase.from("pronostico_sku_cambios").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ─── Reunión mensual (R3.2.1) ───────────────────────────────────────────────

export async function crearReunionPronostico(input: {
  fecha: string
  notas?: string
  acta_url?: string
  asistentes: ReunionAsistente[]
}): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (!input.fecha) return { error: "Falta la fecha" }
    const asistentes = input.asistentes.filter((a) => a.nombre.trim())
    if (!asistentes.length) return { error: "Cargá al menos un asistente" }

    const supabase = await createClient()

    // métrica del momento: % fuera de rango + cumplimiento de retiros (auto)
    const hoy = new Date()
    const [{ data: politica }, coberturaApi, retiros] = await Promise.all([
      supabase.from("pronostico_politica").select("*"),
      fetchChess<CoberturaApiResponse>("/api/inventario-cobertura?empresa=pampeana"),
      fetchChess<RetirosMetrica>(
        `/api/planificador-retiro?mes=${hoy.getMonth() + 1}&anio=${hoy.getFullYear()}&empresa=pampeana`,
      ),
    ])
    const metrica: Record<string, unknown> = {}
    if (coberturaApi?.items) {
      const r = clasificarCobertura(coberturaApi.items, (politica ?? []) as PoliticaSegmento[])
      metrica.fuera_rango = {
        pct_debajo: r.resumen.pctDebajo,
        pct_encima: r.resumen.pctEncima,
        pct_ok: r.resumen.pctOk,
        skus_con_vpd: r.resumen.conVpd,
      }
    }
    if (retiros?.cumplimiento) {
      metrica.retiros = {
        mes: retiros.mes,
        anio: retiros.anio,
        objetivo: retiros.objetivo,
        retirado: retiros.retirado,
        cumplimiento: retiros.cumplimiento,
      }
    }

    const { data: reunion, error } = await supabase
      .from("pronostico_reuniones")
      .insert({
        fecha: input.fecha,
        metrica,
        notas: input.notas?.trim() || null,
        acta_url: input.acta_url?.trim() || null,
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (error || !reunion) return { error: error?.message ?? "No se pudo crear la reunión" }

    const { error: asistErr } = await supabase.from("pronostico_reuniones_asistentes").insert(
      asistentes.map((a) => ({
        reunion_id: reunion.id,
        nombre: a.nombre.trim(),
        area: a.area,
        presente: a.presente,
      })),
    )
    if (asistErr) return { error: asistErr.message }

    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarReunionPronostico(id: string): Promise<Result<true>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase.from("pronostico_reuniones").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ─── OOS teórico: planes (R3.2.4) ───────────────────────────────────────────

export async function crearOosPlan(input: {
  articulo: string
  descripcion: string
  brecha?: string
  accion: string
  responsable?: string
  fecha_objetivo?: string
}): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (!input.accion.trim()) return { error: "Falta la acción" }
    const supabase = await createClient()
    const { error } = await supabase.from("pronostico_oos_planes").insert({
      articulo: input.articulo.trim(),
      descripcion: input.descripcion.trim(),
      brecha: input.brecha?.trim() || null,
      accion: input.accion.trim(),
      responsable: input.responsable?.trim() || null,
      fecha_objetivo: input.fecha_objetivo || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function actualizarOosPlanEstado(
  id: string,
  estado: "pendiente" | "en_progreso" | "completado",
): Promise<Result<true>> {
  try {
    await requireRole(ROLES_EDICION)
    const supabase = await createClient()
    const { error } = await supabase
      .from("pronostico_oos_planes")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarOosPlan(id: string): Promise<Result<true>> {
  try {
    await requireRole(ROLES_EDICION)
    const supabase = await createClient()
    const { error } = await supabase.from("pronostico_oos_planes").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}
