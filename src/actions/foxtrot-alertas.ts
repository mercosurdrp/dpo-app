"use server"

// Server actions del módulo de alertas WhatsApp de rechazos Foxtrot.
// Lecturas de alertas con el cliente de sesión (RLS SELECT authenticated);
// el ABM de equipo y la config son solo-admin y escriben vía service-role
// (las tablas bot_* / config no tienen policies de escritura).

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, requireRole } from "@/lib/session"
import type {
  AlertaRechazo,
  AlertasConfig,
  VendedorWa,
  RolVendedorWa,
} from "@/lib/foxtrot-alertas/types"

const ALERTAS_PATH = "/indicadores/foxtrot-tracking/alertas"
const PHONE_RE = /^\d{8,15}$/

type Result<T> = { data: T } | { error: string }

export interface AlertasFiltro {
  desde?: string
  hasta?: string
}

export async function getAlertas(filtro: AlertasFiltro = {}): Promise<Result<AlertaRechazo[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    let query = supabase
      .from("foxtrot_alertas_rechazo")
      .select("*")
      .order("fecha", { ascending: false })
      .order("rechazo_ts", { ascending: false })
      .limit(1000)
    if (filtro.desde) query = query.gte("fecha", filtro.desde)
    if (filtro.hasta) query = query.lte("fecha", filtro.hasta)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data ?? []) as AlertaRechazo[] }
  } catch {
    return { error: "No autorizado" }
  }
}

export async function getConfigAlertas(): Promise<Result<AlertasConfig>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("foxtrot_alertas_config")
      .select("*")
      .eq("id", 1)
      .single()
    if (error) return { error: error.message }
    return { data: data as AlertasConfig }
  } catch {
    return { error: "No autorizado" }
  }
}

export async function updateConfigAlertas(
  input: Partial<
    Pick<
      AlertasConfig,
      | "envios_activos"
      | "dry_run"
      | "ventana_desde"
      | "ventana_hasta"
      | "max_intentos_envio"
      | "dias_seguimiento_outcome"
    >
  >,
): Promise<Result<AlertasConfig>> {
  try {
    const profile = await requireRole(["admin"])
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("foxtrot_alertas_config")
      .update({ ...input, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath(ALERTAS_PATH)
    return { data: data as AlertasConfig }
  } catch {
    return { error: "Solo administradores" }
  }
}

export async function getEquipoWa(): Promise<Result<VendedorWa[]>> {
  try {
    await requireAuth()
    // Admin client: la UI de equipo la ven admin y supervisor; la policy
    // vieja de bot_vendedores_wa era solo-admin y la lectura acá ya pasó
    // por requireAuth.
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("bot_vendedores_wa")
      .select("*")
      .order("rol", { ascending: false })
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data ?? []) as VendedorWa[] }
  } catch {
    return { error: "No autorizado" }
  }
}

export interface VendedorWaInput {
  id_promotor: string
  nombre: string
  phone_number: string
  rol: RolVendedorWa
  supervisor_id: string | null
  activo: boolean
  recibe_alertas_rechazo: boolean
}

export async function upsertVendedorWa(input: VendedorWaInput): Promise<Result<VendedorWa>> {
  try {
    await requireRole(["admin"])
    const idPromotor = input.id_promotor.trim()
    const nombre = input.nombre.trim()
    const phone = input.phone_number.trim().replace(/[^\d]/g, "")
    if (!idPromotor || !nombre) return { error: "ID de promotor y nombre son obligatorios" }
    if (input.activo && !PHONE_RE.test(phone)) {
      return { error: "Teléfono inválido: formato internacional sin '+' (ej 5492477123456)" }
    }
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("bot_vendedores_wa")
      .upsert(
        {
          id_promotor: idPromotor,
          nombre,
          // Placeholder único si aún no hay teléfono (columna NOT NULL UNIQUE)
          phone_number: phone || `pendiente-${idPromotor}`,
          rol: input.rol,
          supervisor_id: input.rol === "supervisor" ? null : input.supervisor_id,
          activo: input.activo,
          recibe_alertas_rechazo: input.recibe_alertas_rechazo,
        },
        { onConflict: "id_promotor" },
      )
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath(`${ALERTAS_PATH}/equipo`)
    return { data: data as VendedorWa }
  } catch {
    return { error: "Solo administradores" }
  }
}

export async function deleteVendedorWa(idPromotor: string): Promise<Result<true>> {
  try {
    await requireRole(["admin"])
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("bot_vendedores_wa")
      .delete()
      .eq("id_promotor", idPromotor)
    if (error) return { error: error.message }
    revalidatePath(`${ALERTAS_PATH}/equipo`)
    return { data: true }
  } catch {
    return { error: "Solo administradores" }
  }
}
