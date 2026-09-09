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
import {
  esOperacionAcarreo,
  llevaVacios,
  notasConVacios,
  vaciosDeNotas,
  type OperacionAcarreo,
} from "@/lib/acarreo-vacios"

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
  /** Qué vino a hacer el camión. Sin marcador en `notas` ⇒ "descarga". */
  operacion: OperacionAcarreo
  /** Tramo de carga de envases vacíos (sale del marcador de `notas`). */
  hora_inicio_vacios: string | null
  hora_fin_vacios: string | null
}

type FilaPendiente = Omit<RecepcionPendiente, "operacion" | "hora_inicio_vacios" | "hora_fin_vacios"> & {
  notas: string | null
}

function conVacios(fila: FilaPendiente): RecepcionPendiente {
  const { notas, ...resto } = fila
  const v = vaciosDeNotas(notas)
  return {
    ...resto,
    operacion: v?.operacion ?? "descarga",
    hora_inicio_vacios: v?.inicio ?? null,
    hora_fin_vacios: v?.fin ?? null,
  }
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
      .select("id, patente, transportista, origen, remito, pallets, estado, hora_arribo, hora_ingreso_deposito, hora_inicio_descarga, hora_fin_descarga, registrado_por, notas")
      // "finalizado" sigue en la lista: el camión está en planta hasta que le dan la salida.
      .in("estado", ["anunciado", "ingresado", "descargando", "finalizado"])
      .order("hora_arribo", { ascending: true })

    if (error) return { error: error.message }
    return { data: ((data ?? []) as FilaPendiente[]).map(conVacios) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando pendientes" }
  }
}

/** Autoriza al operador y devuelve el cliente de acarreo-rdf, o el error para el usuario. */
async function clienteOperacion() {
  const profile = await requireAuth()
  if (IS_MISIONES) return { error: "Solo disponible en Pampeana." as const }
  if (!puedeOperarAcarreo(profile.role, profile.email)) {
    return { error: "No tenés permiso para operar la recepción." as const }
  }
  const acarreo = createAcarreoClient()
  if (!acarreo) return { error: "Integración con acarreo-rdf no configurada." as const }
  return { acarreo, profile }
}

/**
 * Sólo emails de la lista: un valor suelto se convertiría en un "maquinista"
 * fantasma en el tablero de productividad.
 */
function equipoValido(maquinistas: string[] | undefined): string[] | { error: string } {
  const validos = (maquinistas ?? []).filter(esMaquinistaDescarga)
  if (validos.length === 0) return { error: "Elegí al menos un maquinista para cerrar." }
  return validos
}

/**
 * Iniciar: el maquinista elige qué vino a hacer el camión (tres botones, un
 * paso). La operación viaja en el marcador de `notas` (src/lib/acarreo-vacios.ts);
 * «sólo descarga» no escribe marcador, es el caso histórico.
 *
 * El trigger de la tabla sella hora_inicio_descarga al pasar a "descargando".
 * Para el de sólo vacíos ese sello no es una descarga (el SLA #7 lo excluye
 * por el marcador): el tramo real de vacíos arranca acá mismo.
 */
export async function iniciarDescargaAcarreo(
  id: string,
  operacion: OperacionAcarreo = "descarga",
): Promise<{ error?: string }> {
  if (!esOperacionAcarreo(operacion)) return { error: "Operación desconocida." }
  const c = await clienteOperacion()
  if ("error" in c) return { error: c.error }
  const { acarreo, profile } = c
  const cambios: Record<string, unknown> = { estado: "descargando", registrado_por: profile.email }
  if (llevaVacios(operacion)) {
    const { data: actual } = await acarreo
      .from("recepcion_acarreos")
      .select("notas")
      .eq("id", id)
      .maybeSingle()
    cambios.notas = notasConVacios(
      (actual as { notas?: string | null } | null)?.notas ?? null,
      {
        operacion,
        inicio: operacion === "solo_vacios" ? new Date().toISOString() : null,
        fin: null,
      },
    )
  }
  const { error } = await acarreo.from("recepcion_acarreos").update(cambios).eq("id", id)
  if (error) return { error: error.message }
  return {}
}

/**
 * Cierra la descarga de producto. Al FINALIZAR no se pisa registrado_por:
 * queda sellado con quien INICIÓ. La productividad se atribuye al equipo real
 * (que puede ser de a dos); registrado_por es el fallback del histórico.
 *
 * Si el camión además carga vacíos, «Empezar vacíos» cierra la descarga y
 * abre ese tramo de una (`empezarVacios`): un solo toque, no dos.
 */
export async function finalizarDescargaAcarreo(
  id: string,
  maquinistas: string[],
  empezarVacios = false,
): Promise<{ error?: string }> {
  const validos = equipoValido(maquinistas)
  if (!Array.isArray(validos)) return validos
  const c = await clienteOperacion()
  if ("error" in c) return { error: c.error }
  const { acarreo } = c
  // El equipo y los vacíos se guardan dentro de `notas`: hay que leer la nota
  // actual para no pisar lo que escribió el operador ni el otro marcador.
  const { data: actual } = await acarreo
    .from("recepcion_acarreos")
    .select("notas")
    .eq("id", id)
    .maybeSingle()
  const notasActuales = (actual as { notas?: string | null } | null)?.notas ?? null
  let notas = notasConEquipo(notasActuales, validos)
  if (empezarVacios) {
    const v = vaciosDeNotas(notasActuales)
    if (!v || !llevaVacios(v.operacion)) {
      return { error: "Este camión se inició como sólo descarga: no tiene carga de vacíos." }
    }
    notas = notasConVacios(notas, { ...v, inicio: v.inicio ?? new Date().toISOString() })
  }
  // El trigger de la tabla sella hora_fin_descarga.
  const { error } = await acarreo
    .from("recepcion_acarreos")
    .update({ estado: "finalizado", notas })
    .eq("id", id)
  if (error) return { error: error.message }
  return {}
}

/**
 * Cierra el tramo de carga de vacíos. Para «descarga + vacíos» el camión ya
 * está "finalizado" (la descarga cerró al empezar los vacíos) y sólo se sella
 * la hora de fin. Para «sólo vacíos» este ES el cierre de la operación: pasa
 * a "finalizado" y pregunta quiénes cargaron, igual que una descarga.
 */
export async function finalizarVaciosAcarreo(
  id: string,
  maquinistas?: string[],
): Promise<{ error?: string }> {
  const c = await clienteOperacion()
  if ("error" in c) return { error: c.error }
  const { acarreo } = c
  const { data: actual } = await acarreo
    .from("recepcion_acarreos")
    .select("notas, estado")
    .eq("id", id)
    .maybeSingle()
  const fila = actual as { notas?: string | null; estado?: string } | null
  const v = vaciosDeNotas(fila?.notas ?? null)
  if (!v || !llevaVacios(v.operacion)) {
    return { error: "Este camión no tiene carga de vacíos." }
  }
  if (!v.inicio) return { error: "La carga de vacíos todavía no empezó." }
  if (v.fin) return { error: "La carga de vacíos ya está cerrada." }
  const cambios: Record<string, unknown> = {}
  let notas = fila?.notas ?? null
  if (v.operacion === "solo_vacios") {
    const validos = equipoValido(maquinistas)
    if (!Array.isArray(validos)) return validos
    notas = notasConEquipo(notas, validos)
    cambios.estado = "finalizado"
  }
  cambios.notas = notasConVacios(notas, { ...v, fin: new Date().toISOString() })
  const { error } = await acarreo.from("recepcion_acarreos").update(cambios).eq("id", id)
  if (error) return { error: error.message }
  return {}
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
