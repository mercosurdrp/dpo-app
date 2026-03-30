"use server"

import { createClient } from "@supabase/supabase-js"
import type { CatalogoChofer, CatalogoVehiculo } from "@/types/database"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function calcTml(hora: string, horaEntrada: number): number {
  const [h, m] = hora.split(":").map(Number)
  return h * 60 + m - horaEntrada * 60
}

// ==================== CATÁLOGOS (público) ====================

export async function getChoferesPublic(): Promise<CatalogoChofer[]> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from("catalogo_choferes")
    .select("*")
    .eq("active", true)
    .order("nombre")
  return (data || []) as CatalogoChofer[]
}

export async function getVehiculosPublic(): Promise<CatalogoVehiculo[]> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from("catalogo_vehiculos")
    .select("*")
    .eq("active", true)
    .order("dominio")
  return (data || []) as CatalogoVehiculo[]
}

// ==================== CREAR REGISTRO (público) ====================

interface CreateRegistroPublicInput {
  tipo: "ingreso" | "egreso"
  fecha: string
  dominio: string
  chofer: string
  ayudante1?: string
  ayudante2?: string
  odometro?: number
  hora: string // "HH:MM"
  horaEntrada?: number // 6 o 7
  observaciones?: string
}

export async function createRegistroPublic(
  input: CreateRegistroPublicInput
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = getServiceClient()
    const horaEntrada = input.horaEntrada ?? 7
    const tml = input.tipo === "egreso" ? calcTml(input.hora, horaEntrada) : null

    // Calculate week number
    const date = new Date(input.fecha + "T12:00:00")
    const startOfYear = new Date(date.getFullYear(), 0, 1)
    const diff = date.getTime() - startOfYear.getTime()
    const semana = Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7)

    const { error } = await supabase.from("registros_vehiculos").insert({
      tipo: input.tipo,
      fecha: input.fecha,
      dominio: input.dominio.trim().toUpperCase(),
      chofer: input.chofer.trim().toUpperCase(),
      ayudante1: input.ayudante1?.trim().toUpperCase() || null,
      ayudante2: input.ayudante2?.trim().toUpperCase() || null,
      odometro: input.odometro || null,
      hora: input.hora + ":00",
      semana,
      hora_entrada: horaEntrada,
      tml_minutos: tml,
      observaciones: input.observaciones?.trim() || null,
    })

    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
