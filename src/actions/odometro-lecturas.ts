"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { FuenteLectura } from "@/types/database"
import { TIPO_CARGA_GASOIL } from "@/lib/vehiculos/tipos-carga"

// Corrección puntual del odómetro de una lectura ya cargada.
//
// El km actual de una unidad es el odómetro MÁS ALTO que registró, así que un
// dedazo queda pegado para siempre: infla los km rodados de las cubiertas y
// además BLOQUEA el próximo checklist, porque `validarLectura` no deja cargar
// un número menor al último conocido (caso AF399KY 27/07/2026: se tipeó
// 106.819 en la carga de combustible cuando el camión marcaba 106.019).
// `validarLectura` evita que entren datos malos nuevos; esto es la salida para
// los que ya entraron.

const TABLA: Record<FuenteLectura, string> = {
  registros: "registros_vehiculos",
  checklist: "checklist_vehiculos",
  combustible: "registro_combustible",
}

/** Tope de sanidad: nadie tiene un odómetro de 8 dígitos. */
const ODOMETRO_MAX = 9_999_999

interface ActualizarOdometroInput {
  fuente: FuenteLectura
  id: string
  /** null borra la lectura (no permitido en cargas de combustible). */
  odometro: number | null
}

export async function actualizarOdometroLectura(
  input: ActualizarOdometroInput
): Promise<{ data: { dominio: string; odometro: number | null } } | { error: string }> {
  try {
    await requireAuth()

    const tabla = TABLA[input.fuente]
    if (!tabla) return { error: "Origen de la lectura desconocido" }

    const valor = input.odometro
    if (valor != null) {
      if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor <= 0) {
        return { error: "El odómetro tiene que ser un número entero mayor a 0" }
      }
      if (valor > ODOMETRO_MAX) {
        return { error: "Ese odómetro tiene dígitos de más" }
      }
    } else if (input.fuente === "combustible") {
      return { error: "La carga de combustible necesita el odómetro para calcular el rendimiento" }
    }

    const supabase = await createClient()

    const { data: fila, error: errFila } = await supabase
      .from(tabla)
      .select("id, dominio, odometro")
      .eq("id", input.id)
      .maybeSingle()
    if (errFila) return { error: errFila.message }
    if (!fila) return { error: "No encontré esa lectura" }

    const { error: errUpd } = await supabase
      .from(tabla)
      .update({ odometro: valor })
      .eq("id", input.id)
    if (errUpd) return { error: errUpd.message }

    const dominio = fila.dominio as string

    // Km recorridos y rendimiento de las cargas se calculan contra la carga
    // anterior, así que tocar un odómetro desacomoda también a la carga
    // siguiente. Se recalcula la serie completa del vehículo.
    if (input.fuente === "combustible") {
      const errorRecalculo = await recalcularCargas(supabase, dominio)
      if (errorRecalculo) return { error: errorRecalculo }
    }

    revalidatePath("/vehiculos")
    revalidatePath(`/vehiculos/${encodeURIComponent(dominio)}`)
    revalidatePath("/vehiculos/mantenimiento")

    return { data: { dominio, odometro: valor } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Recalcula km_recorridos y rendimiento de TODAS las cargas del vehículo, en
 * orden de odómetro. Sólo escribe las filas que quedaron distintas.
 */
async function recalcularCargas(
  supabase: SupabaseServerClient,
  dominio: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("registro_combustible")
    .select("id, odometro, litros, km_recorridos, rendimiento, tipo_combustible")
    .eq("dominio", dominio)
    .order("odometro", { ascending: true })
  if (error) return error.message

  const cargas = (data || []) as Array<{
    id: string
    odometro: number
    litros: number | string
    km_recorridos: number | null
    rendimiento: number | string | null
    tipo_combustible: string | null
  }>

  // 🚨 Cada tipo de carga se encadena con las de SU tipo. La urea comparte esta
  // tabla, y recorrer todo junto mediría el gasoil contra la carga de urea
  // anterior: km_recorridos y rendimiento saldrían inventados en las dos series.
  const odometroPrevioPorTipo = new Map<string, number>()
  for (const carga of cargas) {
    const tipo = carga.tipo_combustible || TIPO_CARGA_GASOIL
    const odometroPrevio = odometroPrevioPorTipo.get(tipo) ?? null
    let kmRecorridos: number | null = null
    let rendimiento: number | null = null

    if (odometroPrevio != null) {
      kmRecorridos = carga.odometro - odometroPrevio
      const litros = Number(carga.litros)
      if (litros > 0 && kmRecorridos > 0) {
        rendimiento = Math.round((kmRecorridos / litros) * 100) / 100
      }
    }

    const cambioKm = (carga.km_recorridos ?? null) !== kmRecorridos
    const rendActual = carga.rendimiento == null ? null : Number(carga.rendimiento)
    const cambioRend = rendActual !== rendimiento

    if (cambioKm || cambioRend) {
      const { error: errUpd } = await supabase
        .from("registro_combustible")
        .update({ km_recorridos: kmRecorridos, rendimiento })
        .eq("id", carga.id)
      if (errUpd) return errUpd.message
    }

    odometroPrevioPorTipo.set(tipo, carga.odometro)
  }

  return null
}
