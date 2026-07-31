"use server"

import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
import {
  puedeOperarAcarreo,
  puedeDarIngreso,
  esMaquinistaDescarga,
} from "@/lib/acarreo-operadores"
import { notasConEquipo } from "@/lib/acarreo-equipo"

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
  // "finalizado" = descarga terminada pero el camión sigue en planta,
  // esperando que le den la salida del almacén.
  estado: "anunciado" | "ingresado" | "descargando" | "finalizado"
  hora_arribo: string
  hora_ingreso_deposito: string | null
  hora_inicio_descarga: string | null
  hora_fin_descarga: string | null
  /** Quién inició la descarga: se pre-tilda al preguntar quiénes descargaron. */
  registrado_por: string | null
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
      .select("id, patente, transportista, origen, remito, pallets, estado, hora_arribo, hora_ingreso_deposito, hora_inicio_descarga, hora_fin_descarga, registrado_por")
      // "finalizado" sigue en la lista: el camión está en planta hasta que le dan la salida.
      .in("estado", ["anunciado", "ingresado", "descargando", "finalizado"])
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
  maquinistas?: string[],
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
  // descarga. La productividad se atribuye al equipo real (que puede ser de a
  // dos); registrado_por es el fallback del histórico.
  let cambios: Record<string, unknown>
  if (estado === "finalizado") {
    // Sólo emails de la lista: un valor suelto se convertiría en un
    // "maquinista" fantasma en el tablero de productividad.
    const validos = (maquinistas ?? []).filter(esMaquinistaDescarga)
    if (validos.length === 0) {
      return { error: "Elegí al menos un maquinista para cerrar la descarga." }
    }
    // El equipo se guarda dentro de `notas` (ver src/lib/acarreo-equipo.ts):
    // hay que leer la nota actual para no pisar lo que escribió el operador.
    const { data: actual } = await acarreo
      .from("recepcion_acarreos")
      .select("notas")
      .eq("id", id)
      .maybeSingle()
    cambios = {
      estado,
      notas: notasConEquipo(
        (actual as { notas?: string | null } | null)?.notas ?? null,
        validos,
      ),
    }
  } else {
    cambios = { estado, registrado_por: profile.email }
  }
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

export async function finalizarDescargaAcarreo(id: string, maquinistas: string[]) {
  return operarRecepcion(id, "finalizado", maquinistas)
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

// Salida del almacén: el camión se retira de planta. Cierra la estadía total
// (arribo → salida), distinta del tiempo del SLA (arribo → fin de descarga).
// Acción reservada, igual que el ingreso a depósito.
export async function marcarSalidaAcarreo(id: string): Promise<{ error?: string }> {
  const profile = await requireAuth()
  if (IS_MISIONES) return { error: "Solo disponible en Pampeana." }
  if (!puedeDarIngreso(profile.role, profile.email)) {
    return { error: "No tenés permiso para marcar la salida del almacén." }
  }
  const acarreo = createAcarreoClient()
  if (!acarreo) return { error: "Integración con acarreo-rdf no configurada." }
  // El trigger de la tabla sella hora_salida.
  const { error } = await acarreo
    .from("recepcion_acarreos")
    .update({ estado: "salido" })
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
