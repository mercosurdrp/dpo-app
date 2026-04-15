"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  SopCertificacion,
  SkapMatriz,
  SkapEmpleadoRow,
  EstadoCertificacion,
} from "@/types/database"

interface EmpleadoRow {
  id: string
  legajo: number
  nombre: string
  sector: string | null
}

function computeEstado(
  cert: SopCertificacion | null,
  today: Date,
): { estado: EstadoCertificacion; diasParaVencer: number | null } {
  if (!cert || !cert.aprobado) {
    return { estado: "sin_certificar", diasParaVencer: null }
  }
  if (!cert.vencimiento) {
    return { estado: "vigente", diasParaVencer: null }
  }
  const venc = new Date(cert.vencimiento + "T12:00:00")
  const diff = Math.round((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { estado: "vencida", diasParaVencer: diff }
  if (diff <= 30) return { estado: "por_vencer", diasParaVencer: diff }
  return { estado: "vigente", diasParaVencer: diff }
}

const ESTADO_ORDER: Record<EstadoCertificacion, number> = {
  vencida: 0,
  sin_certificar: 1,
  por_vencer: 2,
  vigente: 3,
}

export async function getSkapMatriz(
  sopCodigo: string = "1.1",
): Promise<{ data: SkapMatriz } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: empleados, error: errEmp } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre", { ascending: true })

    if (errEmp) return { error: errEmp.message }

    const empleadosList = (empleados || []) as EmpleadoRow[]

    const { data: certs, error: errCerts } = await supabase
      .from("sop_certificaciones")
      .select("*")
      .eq("sop_codigo", sopCodigo)
      .order("fecha_certificacion", { ascending: false })

    if (errCerts) return { error: errCerts.message }

    const certsList = (certs || []) as SopCertificacion[]
    const latestByEmpleado = new Map<string, SopCertificacion>()
    for (const c of certsList) {
      if (!latestByEmpleado.has(c.empleado_id)) {
        latestByEmpleado.set(c.empleado_id, c)
      }
    }

    const today = new Date()
    today.setHours(12, 0, 0, 0)

    const sopTitulo =
      certsList[0]?.sop_titulo ??
      (sopCodigo === "1.1" ? "Procesos de Pre-Ruta" : `SOP ${sopCodigo}`)

    const rows: SkapEmpleadoRow[] = empleadosList.map((e) => {
      const cert = latestByEmpleado.get(e.id) ?? null
      const { estado, diasParaVencer } = computeEstado(cert, today)
      return {
        empleado_id: e.id,
        legajo: e.legajo,
        nombre: e.nombre,
        sector: e.sector,
        certificacion: cert,
        estado,
        dias_para_vencer: diasParaVencer,
      }
    })

    rows.sort((a, b) => {
      const d = ESTADO_ORDER[a.estado] - ESTADO_ORDER[b.estado]
      if (d !== 0) return d
      return a.nombre.localeCompare(b.nombre)
    })

    const total = rows.length
    const vigentes = rows.filter((r) => r.estado === "vigente").length
    const por_vencer = rows.filter((r) => r.estado === "por_vencer").length
    const vencidas = rows.filter((r) => r.estado === "vencida").length
    const sin_certificar = rows.filter((r) => r.estado === "sin_certificar").length
    const pct_cobertura = total === 0 ? 0 : Math.round((vigentes / total) * 10000) / 100

    return {
      data: {
        sop_codigo: sopCodigo,
        sop_titulo: sopTitulo,
        total_empleados: total,
        vigentes,
        por_vencer,
        vencidas,
        sin_certificar,
        pct_cobertura,
        rows,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface UpsertCertificacionInput {
  empleadoId: string
  sopCodigo: string
  sopTitulo: string
  fechaCertificacion: string
  score?: number | null
  aprobado: boolean
  vencimiento?: string | null
  evidenciaUrl?: string | null
  notas?: string | null
}

export async function upsertCertificacion(
  input: UpsertCertificacionInput,
): Promise<{ data: SopCertificacion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const payload = {
      empleado_id: input.empleadoId,
      sop_codigo: input.sopCodigo.trim(),
      sop_titulo: input.sopTitulo.trim(),
      fecha_certificacion: input.fechaCertificacion,
      score: input.score ?? null,
      aprobado: input.aprobado,
      vencimiento: input.vencimiento || null,
      evidencia_url: input.evidenciaUrl?.trim() || null,
      notas: input.notas?.trim() || null,
      created_by: profile.id,
    }

    const { data: existing } = await supabase
      .from("sop_certificaciones")
      .select("id")
      .eq("empleado_id", input.empleadoId)
      .eq("sop_codigo", payload.sop_codigo)
      .eq("fecha_certificacion", input.fechaCertificacion)
      .maybeSingle()

    if (existing?.id) {
      const { data, error } = await supabase
        .from("sop_certificaciones")
        .update({
          sop_titulo: payload.sop_titulo,
          score: payload.score,
          aprobado: payload.aprobado,
          vencimiento: payload.vencimiento,
          evidencia_url: payload.evidencia_url,
          notas: payload.notas,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single()
      if (error) return { error: error.message }
      return { data: data as SopCertificacion }
    }

    const { data, error } = await supabase
      .from("sop_certificaciones")
      .insert(payload)
      .select("*")
      .single()

    if (error) return { error: error.message }
    return { data: data as SopCertificacion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteCertificacion(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Solo admin puede eliminar certificaciones" }
    }
    const supabase = await createClient()
    const { error } = await supabase.from("sop_certificaciones").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getCertificacionesEmpleado(
  empleadoId: string,
  sopCodigo?: string,
): Promise<{ data: SopCertificacion[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    let query = supabase
      .from("sop_certificaciones")
      .select("*")
      .eq("empleado_id", empleadoId)
      .order("fecha_certificacion", { ascending: false })
    if (sopCodigo) query = query.eq("sop_codigo", sopCodigo)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as SopCertificacion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getEmpleadosActivos(): Promise<
  { data: Array<{ id: string; legajo: number; nombre: string; sector: string | null }> }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data || []) as Array<{ id: string; legajo: number; nombre: string; sector: string | null }> }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
