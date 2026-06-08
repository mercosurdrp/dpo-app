"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { SG_DIAS_VENCIMIENTO } from "@/lib/constants"
import type {
  SgTicketConAutor,
  SgTicketDetalle,
  SgTicketAdjunto,
  SgTicketHistorial,
  SgCategoria,
  SgEstado,
} from "@/types/database"

const BUCKET = "portal-servicios"
const LIST_PATH = "/portal/servicios"
const ADMIN_PATH = "/portal"

type Result<T> = { data: T } | { error: string }

const SELECT_TICKET =
  "*, autor:profiles!sg_tickets_creado_por_fkey(nombre), asignado:profiles!sg_tickets_asignado_a_fkey(nombre)"

function isAdmin(role: string): boolean {
  return role === "admin"
}

interface TicketFilters {
  estado?: SgEstado
  categoria?: SgCategoria
  search?: string
}

interface TicketInput {
  categoria: SgCategoria
  titulo: string
  descripcion: string
  sector?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTicket(row: any): SgTicketConAutor {
  return {
    id: row.id,
    numero: row.numero,
    categoria: row.categoria,
    titulo: row.titulo,
    descripcion: row.descripcion,
    sector: row.sector,
    estado: row.estado,
    asignado_a: row.asignado_a,
    creado_por: row.creado_por,
    resuelto_at: row.resuelto_at,
    cerrado_at: row.cerrado_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    autor_nombre: row.autor?.nombre ?? "Desconocido",
    asignado_nombre: row.asignado?.nombre ?? null,
  }
}

// ===================================================
// Lectura
// ===================================================

/** Tickets del usuario actual (RLS lo limita a propios/asignados). */
export async function getMisTickets(): Promise<Result<SgTicketConAutor[]>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("sg_tickets")
      .select(SELECT_TICKET)
      .eq("creado_por", profile.id)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: ((data ?? []) as any[]).map(mapTicket) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando solicitudes" }
  }
}

/** Todos los tickets (sólo admin). */
export async function getTickets(filters?: TicketFilters): Promise<Result<SgTicketConAutor[]>> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "No autorizado." }
    const supabase = await createClient()

    let query = supabase.from("sg_tickets").select(SELECT_TICKET).order("created_at", {
      ascending: false,
    })
    if (filters?.estado) query = query.eq("estado", filters.estado)
    if (filters?.categoria) query = query.eq("categoria", filters.categoria)

    const { data, error } = await query
    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows = ((data ?? []) as any[]).map(mapTicket)
    if (filters?.search?.trim()) {
      const q = filters.search.toLowerCase()
      rows = rows.filter(
        (t) =>
          t.titulo.toLowerCase().includes(q) ||
          t.descripcion.toLowerCase().includes(q) ||
          String(t.numero).includes(q)
      )
    }
    return { data: rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando tickets" }
  }
}

export async function getTicket(id: string): Promise<Result<SgTicketDetalle>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: row, error } = await supabase
      .from("sg_tickets")
      .select(SELECT_TICKET)
      .eq("id", id)
      .single()

    if (error || !row) return { error: error?.message ?? "Solicitud no encontrada" }

    const [{ data: adjs }, { data: coms }, { data: hist }] = await Promise.all([
      supabase.from("sg_ticket_adjuntos").select("*").eq("ticket_id", id).order("created_at"),
      supabase
        .from("sg_ticket_comentarios")
        .select("*, autor_p:profiles!sg_ticket_comentarios_autor_fkey(nombre)")
        .eq("ticket_id", id)
        .order("created_at"),
      supabase
        .from("sg_ticket_historial")
        .select("*")
        .eq("ticket_id", id)
        .order("changed_at"),
    ])

    const adjuntos = ((adjs ?? []) as SgTicketAdjunto[]).map((a) => {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path)
      return { ...a, url: pub.publicUrl }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comentarios = ((coms ?? []) as any[]).map((c) => ({
      id: c.id,
      ticket_id: c.ticket_id,
      texto: c.texto,
      interno: c.interno,
      autor: c.autor,
      created_at: c.created_at,
      autor_nombre: c.autor_p?.nombre ?? "—",
    }))

    const detalle: SgTicketDetalle = {
      ...mapTicket(row),
      adjuntos,
      comentarios,
      historial: (hist ?? []) as SgTicketHistorial[],
    }
    return { data: detalle }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando solicitud" }
  }
}

// ===================================================
// Crear (cualquier usuario autenticado)
// Los adjuntos se suben desde el cliente al bucket y se insertan luego.
// ===================================================

export async function createTicket(
  input: TicketInput
): Promise<Result<{ id: string; numero: number }>> {
  try {
    const profile = await requireAuth()
    if (!input.titulo?.trim()) return { error: "El asunto es obligatorio." }
    if (!input.descripcion?.trim()) return { error: "La descripción es obligatoria." }

    const supabase = await createClient()
    const { data: inserted, error } = await supabase
      .from("sg_tickets")
      .insert({
        categoria: input.categoria,
        titulo: input.titulo.trim(),
        descripcion: input.descripcion.trim(),
        sector: input.sector?.trim() || null,
        creado_por: profile.id,
      })
      .select("id, numero")
      .single()

    if (error || !inserted) return { error: error?.message ?? "No se pudo crear la solicitud." }

    revalidatePath(LIST_PATH)
    revalidatePath(ADMIN_PATH)
    return { data: { id: inserted.id as string, numero: inserted.numero as number } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando solicitud" }
  }
}

// ===================================================
// Gestión (sólo admin)
// ===================================================

export async function cambiarEstadoTicket(
  id: string,
  estado: SgEstado
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "Sólo un admin puede cambiar el estado." }
    const supabase = await createClient()

    const { error } = await supabase.from("sg_tickets").update({ estado }).eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(`${LIST_PATH}/${id}`)
    revalidatePath(LIST_PATH)
    revalidatePath(ADMIN_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cambiando estado" }
  }
}

export async function asignarTicket(
  id: string,
  asignadoA: string | null
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "Sólo un admin puede asignar." }
    const supabase = await createClient()

    // Al asignar, si el ticket seguía abierto/en revisión, pasarlo a "asignado".
    const { data: actual } = await supabase
      .from("sg_tickets")
      .select("estado")
      .eq("id", id)
      .single()

    const patch: { asignado_a: string | null; estado?: SgEstado } = { asignado_a: asignadoA }
    if (
      asignadoA &&
      actual &&
      (actual.estado === "abierto" || actual.estado === "en_revision")
    ) {
      patch.estado = "asignado"
    }

    const { error } = await supabase.from("sg_tickets").update(patch).eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(`${LIST_PATH}/${id}`)
    revalidatePath(LIST_PATH)
    revalidatePath(ADMIN_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error asignando" }
  }
}

export async function addComentario(
  ticketId: string,
  texto: string,
  interno: boolean
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!texto?.trim()) return { error: "El comentario está vacío." }
    // Sólo el admin puede dejar comentarios internos.
    const esInterno = interno && isAdmin(profile.role)

    const supabase = await createClient()
    const { error } = await supabase.from("sg_ticket_comentarios").insert({
      ticket_id: ticketId,
      texto: texto.trim(),
      interno: esInterno,
      autor: profile.id,
    })
    if (error) return { error: error.message }

    revalidatePath(`${LIST_PATH}/${ticketId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error agregando comentario" }
  }
}

/** Lista de perfiles a los que se puede asignar un ticket (mandos / admin). */
export async function getAsignables(): Promise<Result<{ id: string; nombre: string }[]>> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "No autorizado." }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("profiles")
      .select("id, nombre, role, active")
      .in("role", ["admin", "admin_rrhh", "supervisor"])
      .order("nombre")

    if (error) return { error: error.message }
    const rows = ((data ?? []) as { id: string; nombre: string; active: boolean | null }[])
      .filter((p) => p.active ?? true)
      .map((p) => ({ id: p.id, nombre: p.nombre }))
    return { data: rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando responsables" }
  }
}

// ===================================================
// Dashboard (sólo admin)
// ===================================================

export interface ServiciosDashboard {
  abiertos: number
  en_proceso: number
  resueltos: number
  cerrados: number
  vencidos: number
  tiempo_promedio_horas: number | null
  por_categoria: { categoria: SgCategoria; total: number }[]
  por_sector: { sector: string; total: number }[]
  tendencia_mensual: { mes: string; total: number }[]
  ultimas: SgTicketConAutor[]
}

export async function getServiciosDashboard(): Promise<Result<ServiciosDashboard>> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "No autorizado." }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("sg_tickets")
      .select(SELECT_TICKET)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tickets = ((data ?? []) as any[]).map(mapTicket)

    const ACTIVOS: SgEstado[] = ["abierto", "en_revision", "asignado", "en_proceso"]
    const now = Date.now()
    const vencimientoMs = SG_DIAS_VENCIMIENTO * 24 * 60 * 60 * 1000

    const abiertos = tickets.filter((t) => t.estado === "abierto").length
    const enProceso = tickets.filter(
      (t) => t.estado === "en_revision" || t.estado === "asignado" || t.estado === "en_proceso"
    ).length
    const resueltos = tickets.filter((t) => t.estado === "resuelto").length
    const cerrados = tickets.filter((t) => t.estado === "cerrado").length
    const vencidos = tickets.filter(
      (t) =>
        ACTIVOS.includes(t.estado) &&
        now - new Date(t.created_at).getTime() > vencimientoMs
    ).length

    const resueltosConFecha = tickets.filter((t) => t.resuelto_at)
    const tiempoPromedioHoras =
      resueltosConFecha.length > 0
        ? Math.round(
            (resueltosConFecha.reduce(
              (acc, t) =>
                acc +
                (new Date(t.resuelto_at as string).getTime() - new Date(t.created_at).getTime()),
              0
            ) /
              resueltosConFecha.length /
              (1000 * 60 * 60)) *
              10
          ) / 10
        : null

    const catMap = new Map<SgCategoria, number>()
    const sectorMap = new Map<string, number>()
    const mesMap = new Map<string, number>()
    for (const t of tickets) {
      catMap.set(t.categoria, (catMap.get(t.categoria) ?? 0) + 1)
      const sec = t.sector?.trim() || "Sin sector"
      sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + 1)
      const mes = t.created_at.slice(0, 7) // YYYY-MM
      mesMap.set(mes, (mesMap.get(mes) ?? 0) + 1)
    }

    return {
      data: {
        abiertos,
        en_proceso: enProceso,
        resueltos,
        cerrados,
        vencidos,
        tiempo_promedio_horas: tiempoPromedioHoras,
        por_categoria: Array.from(catMap.entries()).map(([categoria, total]) => ({
          categoria,
          total,
        })),
        por_sector: Array.from(sectorMap.entries())
          .map(([sector, total]) => ({ sector, total }))
          .sort((a, b) => b.total - a.total),
        tendencia_mensual: Array.from(mesMap.entries())
          .map(([mes, total]) => ({ mes, total }))
          .sort((a, b) => (a.mes > b.mes ? 1 : -1))
          .slice(-6),
        ultimas: tickets.slice(0, 8),
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando dashboard" }
  }
}
