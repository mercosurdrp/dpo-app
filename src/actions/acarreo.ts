"use server"

import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
import { puedeOperarAcarreo, puedeDarIngreso } from "@/lib/acarreo-operadores"

type Result<T> = { data: T } | { error: string }

// ===========================================================================
// Operación (maquinistas / almacén) — escribe en la DB de acarreo-rdf vía
// service-role, autorizando antes con el usuario de dpo-app (lista blanca).
// ===========================================================================

export interface RecepcionPendiente {
  id: string
  patente: string
  transportista: string | null
  origen: string | null
  remito: string | null
  pallets: number | null
  estado: "anunciado" | "ingresado" | "descargando"
  hora_arribo: string
  hora_ingreso_deposito: string | null
  hora_inicio_descarga: string | null
}

export async function getPendientesAcarreo(): Promise<Result<RecepcionPendiente[]>> {
  try {
    const profile = await requireAuth()
    if (IS_MISIONES) return { error: "Solo disponible en Pampeana." }
    if (!puedeOperarAcarreo(profile.role, profile.email)) {
      return { error: "No tenés permiso para operar la recepción." }
    }
    const acarreo = createAcarreoClient()
    if (!acarreo) return { error: "Integración con acarreo-rdf no configurada." }

    const { data, error } = await acarreo
      .from("recepcion_acarreos")
      .select("id, patente, transportista, origen, remito, pallets, estado, hora_arribo, hora_ingreso_deposito, hora_inicio_descarga")
      .in("estado", ["anunciado", "ingresado", "descargando"])
      .order("hora_arribo", { ascending: true })

    if (error) return { error: error.message }
    return { data: (data ?? []) as RecepcionPendiente[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando pendientes" }
  }
}

async function operarRecepcion(
  id: string,
  estado: "descargando" | "finalizado",
): Promise<{ error?: string }> {
  const profile = await requireAuth()
  if (IS_MISIONES) return { error: "Solo disponible en Pampeana." }
  if (!puedeOperarAcarreo(profile.role, profile.email)) {
    return { error: "No tenés permiso para operar la recepción." }
  }
  const acarreo = createAcarreoClient()
  if (!acarreo) return { error: "Integración con acarreo-rdf no configurada." }
  // Los triggers de la tabla sellan hora_inicio_descarga / hora_fin_descarga.
  // Al FINALIZAR no se pisa registrado_por: queda sellado con quien INICIÓ la
  // descarga, que es el dato que usa deposito-esteban para atribuir la
  // productividad (pal/h) del camión al maquinista.
  const cambios =
    estado === "finalizado"
      ? { estado }
      : { estado, registrado_por: profile.email }
  const { error } = await acarreo
    .from("recepcion_acarreos")
    .update(cambios)
    .eq("id", id)
  if (error) return { error: error.message }
  return {}
}

export async function iniciarDescargaAcarreo(id: string) {
  return operarRecepcion(id, "descargando")
}

export async function finalizarDescargaAcarreo(id: string) {
  return operarRecepcion(id, "finalizado")
}

// El ingreso a depósito y el borrado de un arribo: SOLO admin de dpo-app.
export async function ingresarDepositoAcarreo(id: string): Promise<{ error?: string }> {
  const profile = await requireAuth()
  if (IS_MISIONES) return { error: "Solo disponible en Pampeana." }
  if (!puedeDarIngreso(profile.role, profile.email)) {
    return { error: "No tenés permiso para dar el ingreso a depósito." }
  }
  const acarreo = createAcarreoClient()
  if (!acarreo) return { error: "Integración con acarreo-rdf no configurada." }
  const { error } = await acarreo
    .from("recepcion_acarreos")
    .update({ estado: "ingresado", registrado_por: profile.email })
    .eq("id", id)
  if (error) return { error: error.message }
  return {}
}

export async function borrarRecepcionAcarreo(id: string): Promise<{ error?: string }> {
  const profile = await requireAuth()
  if (IS_MISIONES) return { error: "Solo disponible en Pampeana." }
  if (profile.role !== "admin") return { error: "Solo un administrador puede borrar un arribo." }
  const acarreo = createAcarreoClient()
  if (!acarreo) return { error: "Integración con acarreo-rdf no configurada." }
  const { error } = await acarreo.from("recepcion_acarreos").delete().eq("id", id)
  if (error) return { error: error.message }
  return {}
}
