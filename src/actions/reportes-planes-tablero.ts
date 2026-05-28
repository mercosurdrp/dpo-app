"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  HerramientaGestionTipo,
  HerramientaGestionContenido,
  CincoPorquesContenido,
  CausaEfectoContenido,
  PdcaContenido,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

export type PlanTableroFuente =
  | "plan_simple"
  | "herramienta_5porques"
  | "herramienta_ishikawa"
  | "herramienta_pdca"

export type PlanTableroEstado = "pendiente" | "en_curso" | "terminado"

export interface PlanTableroFila {
  id: string
  fuente: PlanTableroFuente
  reporte_id: string
  reporte_tipo: string | null
  reporte_fecha: string
  reporte_descripcion: string | null
  plan_descripcion: string
  responsable_nombre: string | null
  responsable_id: string | null
  fecha_planificada: string | null
  fecha_completado: string | null
  estado: PlanTableroEstado
  origen_label: string
  created_at: string
}

const ORIGEN_LABELS: Record<PlanTableroFuente, string> = {
  plan_simple: "Plan simple",
  herramienta_5porques: "5 Porqués",
  herramienta_ishikawa: "Ishikawa",
  herramienta_pdca: "PDCA",
}

function tipoHerramientaAFuente(tipo: HerramientaGestionTipo): PlanTableroFuente {
  switch (tipo) {
    case "cinco_porques":
      return "herramienta_5porques"
    case "causa_efecto":
      return "herramienta_ishikawa"
    case "pdca":
      return "herramienta_pdca"
  }
}

// Heurística "terminado" para herramientas (no tienen campo explícito):
// - 5 Porqués: contramedida no vacía (paso final accionable)
// - Ishikawa: causa_raiz no vacía (output final del análisis)
// - PDCA: actuar.estandarizacion no vacía (última fase del ciclo)
function herramientaEstaTerminada(
  tipo: HerramientaGestionTipo,
  contenido: HerramientaGestionContenido | null,
): boolean {
  if (!contenido) return false
  if (tipo === "cinco_porques") {
    const c = contenido as CincoPorquesContenido
    return !!c.contramedida && c.contramedida.trim().length > 0
  }
  if (tipo === "causa_efecto") {
    const c = contenido as CausaEfectoContenido
    return !!c.causa_raiz && c.causa_raiz.trim().length > 0
  }
  // pdca
  const c = contenido as PdcaContenido
  return !!c.actuar?.estandarizacion && c.actuar.estandarizacion.trim().length > 0
}

// Texto resumen visible en la columna "Plan de acción":
// - 5 Porqués: contramedida (o causa_raiz si no hay contramedida)
// - Ishikawa: causa_raiz (o efecto si no hay)
// - PDCA: actuar.estandarizacion (o hacer.acciones, o plan.problema)
function herramientaResumen(
  tipo: HerramientaGestionTipo,
  contenido: HerramientaGestionContenido | null,
  titulo: string,
): string {
  if (!contenido) return titulo || "—"
  if (tipo === "cinco_porques") {
    const c = contenido as CincoPorquesContenido
    return (
      (c.contramedida && c.contramedida.trim()) ||
      (c.causa_raiz && c.causa_raiz.trim()) ||
      titulo ||
      "—"
    )
  }
  if (tipo === "causa_efecto") {
    const c = contenido as CausaEfectoContenido
    return (
      (c.causa_raiz && c.causa_raiz.trim()) ||
      (c.efecto && c.efecto.trim()) ||
      titulo ||
      "—"
    )
  }
  const c = contenido as PdcaContenido
  return (
    (c.actuar?.estandarizacion && c.actuar.estandarizacion.trim()) ||
    (c.hacer?.acciones && c.hacer.acciones.trim()) ||
    (c.plan?.problema && c.plan.problema.trim()) ||
    titulo ||
    "—"
  )
}

function estadoPlanSimple(
  fecha_planificada: string | null,
  fecha_completado: string | null,
): PlanTableroEstado {
  if (fecha_completado) return "terminado"
  if (fecha_planificada) return "en_curso"
  return "pendiente"
}

export async function getReportePlanesTablero(): Promise<Result<PlanTableroFila[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // 1) Planes simples — JOIN al reporte y al creador.
    const { data: planesData, error: planesErr } = await supabase
      .from("reporte_seguridad_planes")
      .select(
        `id, reporte_id, descripcion, fecha_planificada, fecha_completado, creado_por, created_at,
         reporte:reportes_seguridad!reporte_seguridad_planes_reporte_id_fkey(id, tipo, fecha, descripcion),
         autor:profiles!reporte_seguridad_planes_creado_por_fkey(id, nombre)`,
      )
      .order("created_at", { ascending: false })
    if (planesErr) return { error: planesErr.message }

    // 2) Herramientas con reporte_seguridad_id no null — JOIN al reporte y autor.
    const { data: herrData, error: herrErr } = await supabase
      .from("plan_herramientas_gestion")
      .select(
        `id, reporte_seguridad_id, tipo, titulo, contenido, autor_id, created_at, updated_at,
         reporte:reportes_seguridad!plan_herramientas_gestion_reporte_seguridad_id_fkey(id, tipo, fecha, descripcion),
         autor:profiles!plan_herramientas_gestion_autor_id_fkey(id, nombre)`,
      )
      .not("reporte_seguridad_id", "is", null)
      .order("created_at", { ascending: false })
    if (herrErr) return { error: herrErr.message }

    const filas: PlanTableroFila[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (planesData ?? []) as any[]) {
      const reporte = row.reporte
      if (!reporte) continue
      filas.push({
        id: row.id,
        fuente: "plan_simple",
        reporte_id: row.reporte_id,
        reporte_tipo: reporte.tipo ?? null,
        reporte_fecha: reporte.fecha,
        reporte_descripcion: reporte.descripcion ?? null,
        plan_descripcion: row.descripcion ?? "",
        responsable_nombre: row.autor?.nombre ?? null,
        responsable_id: row.autor?.id ?? row.creado_por ?? null,
        fecha_planificada: row.fecha_planificada ?? null,
        fecha_completado: row.fecha_completado ?? null,
        estado: estadoPlanSimple(row.fecha_planificada, row.fecha_completado),
        origen_label: ORIGEN_LABELS.plan_simple,
        created_at: row.created_at,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (herrData ?? []) as any[]) {
      const reporte = row.reporte
      if (!reporte) continue
      const tipo = row.tipo as HerramientaGestionTipo
      const fuente = tipoHerramientaAFuente(tipo)
      const contenido = (row.contenido ?? null) as HerramientaGestionContenido | null
      const terminada = herramientaEstaTerminada(tipo, contenido)
      const resumen = herramientaResumen(tipo, contenido, row.titulo ?? "")

      filas.push({
        id: row.id,
        fuente,
        reporte_id: row.reporte_seguridad_id,
        reporte_tipo: reporte.tipo ?? null,
        reporte_fecha: reporte.fecha,
        reporte_descripcion: reporte.descripcion ?? null,
        plan_descripcion: resumen,
        responsable_nombre: row.autor?.nombre ?? null,
        responsable_id: row.autor?.id ?? row.autor_id ?? null,
        // Herramientas no tienen fecha planificada; fecha_completado = updated_at si terminada.
        fecha_planificada: null,
        fecha_completado: terminada ? (row.updated_at ?? row.created_at) : null,
        estado: terminada ? "terminado" : "pendiente",
        origen_label: ORIGEN_LABELS[fuente],
        created_at: row.created_at,
      })
    }

    // Orden por created_at DESC global.
    filas.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

    return { data: filas }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el tablero de planes",
    }
  }
}
