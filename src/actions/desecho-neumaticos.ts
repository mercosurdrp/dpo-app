"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type { RetiroCubiertas } from "@/lib/vehiculos/neumaticos-tipos"

/**
 * Desecho de cubiertas: la bandeja de las que ya no sirven y el remito de
 * retiro a la recicladora.
 *
 * Antes "dar de baja" era instantáneo, pero en el patio la goma se apila hasta
 * que pasa la recicladora a llevarse la tanda: ese paso ahora existe
 * (`para_desecho`) y la baja recién ocurre cuando se registra el retiro.
 *
 * El retiro se guarda en `mantenimiento_residuos` — la tabla de disposición de
 * residuos que ya estaba en el módulo, con certificado de descarte y el campo
 * `numeros_fuego` para los códigos — así el mismo acto da de baja las cubiertas
 * y deja la evidencia ambiental del pilar.
 */

// La tabla restringe `material` por CHECK a neumaticos/aceite/filtros/baterias/
// chatarra/otros (migración 20260711160000). "Cubiertas" no pasa la constraint.
const MATERIAL_CUBIERTAS = "neumaticos"

// ==================== LECTURA ====================

/** Retiros de cubiertas ya registrados (los residuos de material Cubiertas). */
export async function getRetirosCubiertas(): Promise<
  { data: RetiroCubiertas[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_residuos")
      .select("*")
      .eq("material", MATERIAL_CUBIERTAS)
      .order("fecha", { ascending: false })
    if (error) return { error: error.message }
    return { data: (data || []) as RetiroCubiertas[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== BANDEJA ====================

/**
 * Manda cubiertas a la bandeja de desecho: no se pueden montar más, pero
 * todavía no son baja — están en el patio esperando el retiro.
 */
export async function marcarParaDesecho(input: {
  ids: string[]
  motivo?: string
}): Promise<{ success: true; marcadas: number } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const ids = Array.from(new Set(input.ids ?? []))
    if (ids.length === 0) return { error: "Elegí al menos una cubierta" }

    const { data: previas } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id, numero, medida, dominio, posicion, eje, estado")
      .in("id", ids)

    const enRecapador = (previas ?? []).find((n) => n.estado === "en_recapado")
    if (enRecapador)
      return {
        error: `La cubierta ${enRecapador.numero ?? "sin código"} está en el recapador: registrá primero la vuelta`,
      }

    const { error } = await supabase
      .from("mantenimiento_neumaticos")
      .update({
        estado: "para_desecho",
        dominio: null,
        posicion: null,
        eje: null,
        motivo_baja: input.motivo?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)
    if (error) return { error: error.message }

    // El paso a la bandeja se registra como desmontaje cuando venía de una
    // unidad; si ya estaba en el depósito no hay movimiento que registrar.
    const desdeUnidad = (previas ?? []).filter((n) => n.estado === "instalado")
    if (desdeUnidad.length > 0) {
      await supabase.from("mantenimiento_neumatico_movimientos").insert(
        desdeUnidad.map((n) => ({
          neumatico_id: n.id,
          tipo: "desmontaje",
          dominio: n.dominio,
          posicion: n.posicion,
          eje: n.eje,
          numero: n.numero,
          medida: n.medida,
          observaciones: input.motivo?.trim()
            ? `Desmontada para desecho: ${input.motivo.trim()}`
            : "Desmontada para desecho",
          created_by: profile.id,
        }))
      )
    }
    return { success: true, marcadas: ids.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Saca una cubierta de la bandeja de desecho (se marcó por error). */
export async function volverDeDesecho(input: {
  id: string
  destino?: "stock" | "para_recapar"
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_neumaticos")
      .update({
        estado: input.destino ?? "stock",
        motivo_baja: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("estado", "para_desecho")
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== RETIRO A LA RECICLADORA ====================

/**
 * Registra que la recicladora se llevó una tanda: crea el residuo (con su
 * certificado de descarte y los códigos de las cubiertas) y recién ahí da de
 * baja cada cubierta, dejándola apuntada a ese retiro.
 */
export async function registrarRetiroRecicladora(input: {
  fecha: string
  /** La recicladora / quien se lleva las cubiertas. */
  proveedor: string
  neumatico_ids: string[]
  /** Certificado de descarte que entrega la recicladora. */
  certificado_urls?: string[]
  observaciones?: string
}): Promise<{ success: true; retiradas: number } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const proveedor = input.proveedor?.trim()
    if (!proveedor) return { error: "Indicá a quién se le entregan las cubiertas" }
    const ids = Array.from(new Set(input.neumatico_ids ?? []))
    if (ids.length === 0) return { error: "Elegí al menos una cubierta" }

    const { data: cubiertas, error: cubErr } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id, numero, marca, medida, motivo_baja, estado")
      .in("id", ids)
    if (cubErr) return { error: cubErr.message }
    if (!cubiertas || cubiertas.length !== ids.length)
      return { error: "Alguna de las cubiertas elegidas ya no existe" }

    const yaDeBaja = cubiertas.find((c) => c.estado === "baja")
    if (yaDeBaja)
      return {
        error: `La cubierta ${yaDeBaja.numero ?? "sin código"} ya está dada de baja`,
      }

    const fecha = input.fecha || new Date().toISOString().slice(0, 10)
    const codigos = cubiertas
      .map((c) => c.numero)
      .filter((n): n is string => !!n)
      .join(", ")
    const medidas = Array.from(
      new Set(cubiertas.map((c) => c.medida).filter((m): m is string => !!m))
    ).join(" · ")

    const { data: residuo, error: resErr } = await supabase
      .from("mantenimiento_residuos")
      .insert({
        fecha,
        material: MATERIAL_CUBIERTAS,
        descripcion: medidas || null,
        cantidad: cubiertas.length,
        unidad: "unidades",
        proveedor,
        numeros_fuego: codigos || null,
        certificado_url: input.certificado_urls?.[0] ?? null,
        observaciones: input.observaciones?.trim() || null,
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (resErr) return { error: resErr.message }

    const { error: bajaErr } = await supabase
      .from("mantenimiento_neumaticos")
      .update({
        estado: "baja",
        dominio: null,
        posicion: null,
        eje: null,
        fecha_baja: fecha,
        residuo_id: residuo.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)
    if (bajaErr) {
      // Sin cubiertas dadas de baja el residuo no representa nada.
      await supabase.from("mantenimiento_residuos").delete().eq("id", residuo.id)
      return { error: bajaErr.message }
    }

    // El motivo por el que se desechó cada una se conserva; si no tenía, queda
    // el retiro como motivo para que la baja nunca aparezca sin explicación.
    for (const c of cubiertas) {
      if (c.motivo_baja?.trim()) continue
      await supabase
        .from("mantenimiento_neumaticos")
        .update({ motivo_baja: `Retirada por ${proveedor} para reciclado` })
        .eq("id", c.id)
    }

    await supabase.from("mantenimiento_neumatico_movimientos").insert(
      cubiertas.map((c) => ({
        neumatico_id: c.id,
        tipo: "retiro_reciclado",
        fecha,
        numero: c.numero,
        medida: c.medida,
        factura_urls: input.certificado_urls?.length ? input.certificado_urls : null,
        observaciones: `Retirada por ${proveedor} para reciclado${
          c.motivo_baja?.trim() ? ` · ${c.motivo_baja.trim()}` : ""
        }`,
        created_by: profile.id,
      }))
    )

    return { success: true, retiradas: cubiertas.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
