"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type {
  NeumaticoDibujo,
  Recapado,
  RecapadoItem,
  RecapadoResultado,
} from "@/lib/vehiculos/neumaticos-tipos"

/**
 * Envíos a recapado: el remito de ida y vuelta al recapador.
 *
 * Un envío junta cubiertas de VARIAS unidades (por eso no puede ser una OT, que
 * es siempre de un vehículo) y la factura llega por el total de la tanda, así
 * que el costo se prorratea entre las cubiertas que efectivamente volvieron
 * recapadas — las que el recapador descarta no se cobran y van a baja.
 *
 * El recapador devuelve la goma con el MISMO código, así que la cubierta sigue
 * siendo la misma fila de `mantenimiento_neumaticos` toda su vida: lo único que
 * se lleva es el contador `vueltas_recapado`. Si en algún envío el recapador le
 * pusiera un código nuevo, se carga en `numero_retorno` y la cubierta se
 * renumera sin perder el historial.
 */

// ==================== LECTURA ====================

export async function getRecapados(): Promise<
  { data: Recapado[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_recapados")
      .select("*")
      .order("fecha_envio", { ascending: false })
    if (error) return { error: error.message }

    const ids = (data || []).map((r) => r.id)
    let itemsPorRemito = new Map<string, RecapadoItem[]>()
    if (ids.length > 0) {
      const { data: items, error: itErr } = await supabase
        .from("mantenimiento_recapado_items")
        .select("*")
        .in("recapado_id", ids)
        .order("created_at", { ascending: true })
      if (itErr) return { error: itErr.message }
      itemsPorRemito = (items || []).reduce((acc, it) => {
        const arr = acc.get(it.recapado_id) ?? []
        arr.push(it as RecapadoItem)
        acc.set(it.recapado_id, arr)
        return acc
      }, new Map<string, RecapadoItem[]>())
    }

    return {
      data: (data || []).map((r) => ({
        ...(r as Recapado),
        items: itemsPorRemito.get(r.id) ?? [],
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ENVÍO ====================

/**
 * Manda una tanda de cubiertas al recapador: crea el remito, copia la foto de
 * cada cubierta (código, marca, medida, profundidad y de qué unidad venía) y
 * las pasa a `en_recapado`, así dejan de figurar en el depósito.
 */
export async function crearEnvioRecapado(input: {
  proveedor: string
  fecha_envio: string
  numero_remito?: string
  observaciones?: string
  neumatico_ids: string[]
}): Promise<{ success: true; id: string } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const proveedor = input.proveedor?.trim()
    if (!proveedor) return { error: "Indicá a qué recapador se envían" }
    const ids = Array.from(new Set(input.neumatico_ids ?? []))
    if (ids.length === 0) return { error: "Elegí al menos una cubierta" }

    // Foto de las cubiertas al momento de salir.
    const { data: cubiertas, error: cubErr } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id, numero, marca, medida, profundidad_actual_mm, estado")
      .in("id", ids)
    if (cubErr) return { error: cubErr.message }
    if (!cubiertas || cubiertas.length !== ids.length)
      return { error: "Alguna de las cubiertas elegidas ya no existe" }

    const yaEnviada = cubiertas.find((c) => c.estado === "en_recapado")
    if (yaEnviada)
      return {
        error: `La cubierta ${yaEnviada.numero ?? "sin código"} ya está en el recapador`,
      }
    const instalada = cubiertas.find((c) => c.estado === "instalado")
    if (instalada)
      return {
        error: `La cubierta ${instalada.numero ?? "sin código"} está montada: desmontala antes de enviarla`,
      }

    // De qué unidad venía cada una (último desmontaje). Solo para el remito.
    const { data: movs } = await supabase
      .from("mantenimiento_neumatico_movimientos")
      .select("neumatico_id, dominio, fecha")
      .in("neumatico_id", ids)
      .eq("tipo", "desmontaje")
      .order("fecha", { ascending: false })
    const origenPorId = new Map<string, string | null>()
    for (const m of movs ?? []) {
      if (!origenPorId.has(m.neumatico_id)) origenPorId.set(m.neumatico_id, m.dominio)
    }

    const { data: remito, error: remErr } = await supabase
      .from("mantenimiento_recapados")
      .insert({
        proveedor,
        fecha_envio: input.fecha_envio || new Date().toISOString().slice(0, 10),
        numero_remito: input.numero_remito?.trim() || null,
        observaciones: input.observaciones?.trim() || null,
        estado: "enviado",
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (remErr) return { error: remErr.message }

    const { error: itErr } = await supabase
      .from("mantenimiento_recapado_items")
      .insert(
        cubiertas.map((c) => ({
          recapado_id: remito.id,
          neumatico_id: c.id,
          numero_envio: c.numero,
          marca: c.marca,
          medida: c.medida,
          dominio_origen: origenPorId.get(c.id) ?? null,
          profundidad_envio_mm: c.profundidad_actual_mm,
          resultado: "pendiente" as const,
        }))
      )
    if (itErr) {
      // Sin cubiertas el remito no sirve: se deshace para no dejarlo huérfano.
      await supabase.from("mantenimiento_recapados").delete().eq("id", remito.id)
      return { error: itErr.message }
    }

    const { error: updErr } = await supabase
      .from("mantenimiento_neumaticos")
      .update({ estado: "en_recapado", updated_at: new Date().toISOString() })
      .in("id", ids)
    if (updErr) return { error: updErr.message }

    await supabase.from("mantenimiento_neumatico_movimientos").insert(
      cubiertas.map((c) => ({
        neumatico_id: c.id,
        tipo: "envio_recapado",
        fecha: input.fecha_envio || new Date().toISOString().slice(0, 10),
        numero: c.numero,
        medida: c.medida,
        dominio: origenPorId.get(c.id) ?? null,
        observaciones: `Enviada a recapar a ${proveedor}${
          input.numero_remito?.trim() ? ` (remito ${input.numero_remito.trim()})` : ""
        }`,
        created_by: profile.id,
      }))
    )

    return { success: true, id: remito.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Deshace un envío que todavía está en el recapador (se cargó mal): devuelve
 * las cubiertas a la bandeja "Para recapar" y borra el remito.
 */
export async function eliminarEnvioRecapado(input: {
  id: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: remito } = await supabase
      .from("mantenimiento_recapados")
      .select("estado")
      .eq("id", input.id)
      .maybeSingle()
    if (!remito) return { error: "El envío ya no existe" }
    if (remito.estado === "recibido")
      return {
        error: "El envío ya se recibió: no se puede borrar sin deshacer la recepción",
      }

    const { data: items } = await supabase
      .from("mantenimiento_recapado_items")
      .select("neumatico_id")
      .eq("recapado_id", input.id)
    const ids = (items ?? []).map((i) => i.neumatico_id)
    if (ids.length > 0) {
      await supabase
        .from("mantenimiento_neumaticos")
        .update({ estado: "para_recapar", updated_at: new Date().toISOString() })
        .in("id", ids)
        .eq("estado", "en_recapado")
    }

    const { error } = await supabase
      .from("mantenimiento_recapados")
      .delete()
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== RECEPCIÓN ====================

/**
 * Reparte el total facturado entre las cubiertas que volvieron recapadas. El
 * redondeo se acumula en la primera para que la suma dé exactamente el total
 * (si no, 3 cubiertas de $100.000 dan $99.999,99).
 */
function prorratear(total: number, cantidad: number): number[] {
  if (cantidad <= 0) return []
  const centavosTotal = Math.round(total * 100)
  const base = Math.floor(centavosTotal / cantidad)
  const resto = centavosTotal - base * cantidad
  return Array.from({ length: cantidad }, (_, i) => (base + (i < resto ? 1 : 0)) / 100)
}

export interface RecepcionItemInput {
  neumatico_id: string
  resultado: Exclude<RecapadoResultado, "pendiente">
  /** Con cuánta goma volvió (pasa a ser su profundidad de origen). */
  profundidad_retorno_mm?: number | null
  /**
   * Dibujo con el que la devolvió el recapador. Es lo que explica la profundidad
   * de retorno: no vuelve igual una lisa que una de taco o semi taco.
   */
  dibujo_retorno?: NeumaticoDibujo | null
  /** Código con el que volvió, si el recapador se lo cambió. */
  numero_retorno?: string | null
  observaciones?: string | null
}

/**
 * Registra la vuelta del recapador: la factura, el costo prorrateado y qué pasó
 * con cada cubierta. Las recapadas entran al stock como `recapado` con la vida
 * en cero y una vuelta más en el contador; las descartadas van a baja.
 */
export async function registrarRecepcionRecapado(input: {
  recapado_id: string
  fecha_retorno: string
  factura_numero?: string
  factura_urls?: string[]
  costo_total?: number | null
  items: RecepcionItemInput[]
}): Promise<{ success: true; recapadas: number; descartadas: number } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: remito } = await supabase
      .from("mantenimiento_recapados")
      .select("id, proveedor, estado")
      .eq("id", input.recapado_id)
      .maybeSingle()
    if (!remito) return { error: "El envío ya no existe" }
    if (remito.estado === "recibido") return { error: "Este envío ya se recibió" }
    if (!input.items?.length) return { error: "No hay cubiertas para recibir" }

    const fecha = input.fecha_retorno || new Date().toISOString().slice(0, 10)
    const recapadas = input.items.filter((i) => i.resultado === "recapada")
    const descartadas = input.items.filter((i) => i.resultado === "descartada")

    // El costo lo pagan solo las que volvieron recapadas.
    const costos =
      input.costo_total != null && recapadas.length > 0
        ? prorratear(Number(input.costo_total), recapadas.length)
        : []
    const costoPorId = new Map<string, number>()
    recapadas.forEach((it, i) => {
      if (costos[i] != null) costoPorId.set(it.neumatico_id, costos[i])
    })

    // Vueltas que ya llevaba cada cubierta (el contador se incrementa acá).
    const ids = input.items.map((i) => i.neumatico_id)
    const { data: cubiertas } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id, numero, medida, vueltas_recapado")
      .in("id", ids)
    const previaPorId = new Map(
      (cubiertas ?? []).map((c) => [c.id as string, c])
    )

    for (const it of input.items) {
      const previa = previaPorId.get(it.neumatico_id)
      const esRecapada = it.resultado === "recapada"

      const { error: itErr } = await supabase
        .from("mantenimiento_recapado_items")
        .update({
          resultado: it.resultado,
          profundidad_retorno_mm: esRecapada ? (it.profundidad_retorno_mm ?? null) : null,
          dibujo_retorno: esRecapada ? (it.dibujo_retorno ?? null) : null,
          numero_retorno: it.numero_retorno?.trim() || null,
          costo: costoPorId.get(it.neumatico_id) ?? null,
          observaciones: it.observaciones?.trim() || null,
        })
        .eq("recapado_id", input.recapado_id)
        .eq("neumatico_id", it.neumatico_id)
      if (itErr) return { error: itErr.message }

      if (esRecapada) {
        // Vida nueva: se limpian los km de la vuelta anterior y la profundidad
        // con la que volvió pasa a ser su profundidad de origen.
        const prof = it.profundidad_retorno_mm ?? null
        const numeroNuevo = it.numero_retorno?.trim()
        const { error: updErr } = await supabase
          .from("mantenimiento_neumaticos")
          .update({
            estado: "stock",
            tipo: "recapado",
            km_instalacion: null,
            vida_util_km: null,
            profundidad_inicial_mm: prof,
            profundidad_actual_mm: prof,
            vueltas_recapado: (previa?.vueltas_recapado ?? 0) + 1,
            // Si volvió con otro dibujo, la cubierta pasa a tener ese; si no se
            // indicó, se deja el que tenía en vez de pisarlo con null.
            ...(it.dibujo_retorno ? { dibujo: it.dibujo_retorno } : {}),
            ...(numeroNuevo ? { numero: numeroNuevo } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", it.neumatico_id)
        if (updErr) return { error: updErr.message }

        if (prof != null) {
          await supabase.from("mantenimiento_neumatico_mediciones").insert({
            neumatico_id: it.neumatico_id,
            fecha,
            profundidad_mm: prof,
            nota: `Volvió del recapado (${remito.proveedor})`,
            created_by: profile.id,
          })
        }
      } else {
        // La que el recapador descarta vuelve igual al depósito: no es baja
        // todavía, entra en la bandeja de desecho y la baja la hace el retiro
        // de la recicladora (con su certificado).
        const { error: descErr } = await supabase
          .from("mantenimiento_neumaticos")
          .update({
            estado: "para_desecho",
            dominio: null,
            posicion: null,
            eje: null,
            motivo_baja:
              it.observaciones?.trim() ||
              `Descartada por el recapador (${remito.proveedor})`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", it.neumatico_id)
        if (descErr) return { error: descErr.message }
      }

      await supabase.from("mantenimiento_neumatico_movimientos").insert({
        neumatico_id: it.neumatico_id,
        tipo: esRecapada ? "retorno_recapado" : "desmontaje",
        fecha,
        numero: it.numero_retorno?.trim() || previa?.numero || null,
        medida: previa?.medida ?? null,
        factura_urls: input.factura_urls?.length ? input.factura_urls : null,
        observaciones: esRecapada
          ? `Volvió recapada de ${remito.proveedor}${
              it.profundidad_retorno_mm != null
                ? ` con ${it.profundidad_retorno_mm} mm`
                : ""
            }`
          : `Descartada por ${remito.proveedor}: no era recapable. Queda para desechar`,
        created_by: profile.id,
      })
    }

    const { error: remErr } = await supabase
      .from("mantenimiento_recapados")
      .update({
        estado: "recibido",
        fecha_retorno: fecha,
        factura_numero: input.factura_numero?.trim() || null,
        factura_urls: input.factura_urls?.length ? input.factura_urls : null,
        costo_total: input.costo_total ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.recapado_id)
    if (remErr) return { error: remErr.message }

    return {
      success: true,
      recapadas: recapadas.length,
      descartadas: descartadas.length,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Corrige los datos de la factura de un envío ya recibido (o los carga tarde). */
export async function actualizarFacturaRecapado(input: {
  id: string
  factura_numero?: string | null
  factura_urls?: string[] | null
  costo_total?: number | null
  observaciones?: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: items } = await supabase
      .from("mantenimiento_recapado_items")
      .select("neumatico_id, resultado")
      .eq("recapado_id", input.id)
    const recapadas = (items ?? []).filter((i) => i.resultado === "recapada")

    const { error } = await supabase
      .from("mantenimiento_recapados")
      .update({
        factura_numero: input.factura_numero?.trim() || null,
        ...(input.factura_urls !== undefined
          ? { factura_urls: input.factura_urls?.length ? input.factura_urls : null }
          : {}),
        costo_total: input.costo_total ?? null,
        ...(input.observaciones !== undefined
          ? { observaciones: input.observaciones?.trim() || null }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
    if (error) return { error: error.message }

    // El total cambió ⇒ hay que repartirlo de nuevo entre las recapadas.
    const costos =
      input.costo_total != null && recapadas.length > 0
        ? prorratear(Number(input.costo_total), recapadas.length)
        : []
    for (let i = 0; i < recapadas.length; i++) {
      await supabase
        .from("mantenimiento_recapado_items")
        .update({ costo: costos[i] ?? null })
        .eq("recapado_id", input.id)
        .eq("neumatico_id", recapadas[i].neumatico_id)
    }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
