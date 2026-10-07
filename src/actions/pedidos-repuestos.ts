"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

/**
 * Pedidos de repuestos (DPO Flota 2.3).
 *
 * Reemplaza a Novedades + Órdenes de compra, que hacían la mitad de esto cada
 * una. Un pedido dice QUÉ piezas faltan, para qué unidad y qué OT, a quién se
 * compran, cuándo se compran y cuándo se retiran.
 *
 * Los días entre que se detecta la falta y que se retira la pieza son el tiempo
 * que el trabajo estuvo esperando: ese es el PI que R2.3.3 nombra textualmente
 * ("pedidos de servicio retrasados debido a las piezas") y que hasta ahora no se
 * podía medir porque no había dónde anotarlo.
 */

export type PedidoEstado = "abierto" | "comprado" | "retirado" | "anulado"
export type PedidoPrioridad = "baja" | "media" | "alta"

export interface PedidoItem {
  id: string
  repuestoId: string | null
  /** Nombre del catálogo, o el texto libre si la pieza todavía no está. */
  nombre: string
  cantidad: number
}

export interface PedidoRepuestos {
  id: string
  dominio: string | null
  otId: string | null
  /** N° de la OT asociada, para mostrarlo sin ir a buscarla. */
  otNumero: string | null
  fecha: string
  fechaCompra: string | null
  fechaRetiro: string | null
  proveedor: string | null
  prioridad: PedidoPrioridad
  estado: PedidoEstado
  monto: number | null
  descripcion: string | null
  items: PedidoItem[]
  /**
   * Días que el pedido estuvo (o lleva) esperando la pieza: de la detección al
   * retiro. Es el numerador del PI.
   */
  diasEspera: number | null
  createdAt: string
}

/** Pieza elegible al pedir: las del pañol y las que sólo se compran. */
export interface RepuestoCatalogo {
  id: string
  nombre: string
  unidad: string | null
  enPanol: boolean
  stockActual: number
  stockMin: number
}

const DIA_MS = 86_400_000

function diasEntre(desde: string, hasta: string): number {
  return Math.max(
    0,
    Math.round((Date.parse(`${hasta}T00:00:00`) - Date.parse(`${desde}T00:00:00`)) / DIA_MS)
  )
}

/** El catálogo para tildar. Primero lo del pañol, después lo de compra. */
export async function getCatalogoRepuestos(): Promise<
  { data: RepuestoCatalogo[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_repuestos")
      .select("id, nombre, unidad, en_panol, stock_actual, stock_min")
      .order("nombre")
    if (error) {
      // 42703 = la migración del catálogo no está aplicada: se cae a todo-pañol.
      if (error.code !== "42703") return { error: error.message }
      const legacy = await supabase
        .from("mantenimiento_repuestos")
        .select("id, nombre, unidad, stock_actual, stock_min")
        .order("nombre")
      if (legacy.error) return { error: legacy.error.message }
      return {
        data: ((legacy.data || []) as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          nombre: r.nombre as string,
          unidad: (r.unidad as string | null) ?? null,
          enPanol: true,
          stockActual: Number(r.stock_actual ?? 0),
          stockMin: Number(r.stock_min ?? 0),
        })),
      }
    }
    type Row = {
      id: string
      nombre: string
      unidad: string | null
      en_panol: boolean
      stock_actual: number | null
      stock_min: number | null
    }
    const filas = ((data || []) as unknown as Row[]).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      unidad: r.unidad,
      enPanol: r.en_panol,
      stockActual: Number(r.stock_actual ?? 0),
      stockMin: Number(r.stock_min ?? 0),
    }))
    return {
      data: filas.sort(
        (a, b) => Number(b.enPanol) - Number(a.enPanol) || a.nombre.localeCompare(b.nombre)
      ),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getPedidosRepuestos(): Promise<
  { data: PedidoRepuestos[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_pedidos")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(300)
    if (error) {
      // Sin la tabla aplicada, la solapa muestra vacío en vez de romperse.
      if (error.code === "42P01" || error.code === "42703") return { data: [] }
      return { error: error.message }
    }
    type Row = {
      id: string
      dominio: string | null
      ot_id: string | null
      fecha: string
      fecha_compra: string | null
      fecha_retiro: string | null
      proveedor: string | null
      prioridad: PedidoPrioridad
      estado: PedidoEstado
      monto: number | null
      descripcion: string | null
      created_at: string
    }
    const filas = (data || []) as unknown as Row[]
    if (filas.length === 0) return { data: [] }

    const [itemsRes, otsRes] = await Promise.all([
      supabase
        .from("mantenimiento_pedido_items")
        .select("id, pedido_id, repuesto_id, descripcion, cantidad, repuesto:mantenimiento_repuestos(nombre)")
        .in("pedido_id", filas.map((f) => f.id)),
      (() => {
        const ids = [...new Set(filas.map((f) => f.ot_id).filter((x): x is string => !!x))]
        return ids.length
          ? supabase.from("mantenimiento_realizados").select("id, numero_ot").in("id", ids)
          : Promise.resolve({ data: [], error: null })
      })(),
    ])
    const numeroOt = new Map(
      ((otsRes.data || []) as unknown as Array<{ id: string; numero_ot: string | null }>).map(
        (o) => [o.id, o.numero_ot]
      )
    )
    const porPedido = new Map<string, PedidoItem[]>()
    for (const it of (itemsRes.data || []) as unknown as Array<{
      id: string
      pedido_id: string
      repuesto_id: string | null
      descripcion: string | null
      cantidad: number | null
      repuesto: { nombre: string } | null
    }>) {
      const arr = porPedido.get(it.pedido_id) ?? []
      arr.push({
        id: it.id,
        repuestoId: it.repuesto_id,
        nombre: it.repuesto?.nombre ?? it.descripcion ?? "sin nombre",
        cantidad: Number(it.cantidad ?? 1),
      })
      porPedido.set(it.pedido_id, arr)
    }

    const hoy = new Date().toISOString().slice(0, 10)
    return {
      data: filas.map((f) => ({
        id: f.id,
        dominio: f.dominio,
        otId: f.ot_id,
        otNumero: f.ot_id ? (numeroOt.get(f.ot_id) ?? null) : null,
        fecha: f.fecha,
        fechaCompra: f.fecha_compra,
        fechaRetiro: f.fecha_retiro,
        proveedor: f.proveedor,
        prioridad: f.prioridad,
        estado: f.estado,
        monto: f.monto == null ? null : Number(f.monto),
        descripcion: f.descripcion,
        items: (porPedido.get(f.id) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        // El pedido anulado no espera nada; el abierto sigue corriendo contra hoy.
        diasEspera:
          f.estado === "anulado"
            ? null
            : diasEntre(f.fecha, f.fecha_retiro ?? hoy),
        createdAt: f.created_at,
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export interface PedidoItemInput {
  /** Pieza del catálogo. */
  repuestoId?: string | null
  /** Pieza nueva escrita a mano: se da de alta en el catálogo y queda para la próxima. */
  nombreNuevo?: string | null
  cantidad?: number | null
}

export async function upsertPedidoRepuestos(input: {
  id?: string
  dominio?: string | null
  otId?: string | null
  fecha: string
  fechaCompra?: string | null
  fechaRetiro?: string | null
  proveedor?: string | null
  prioridad?: PedidoPrioridad
  estado?: PedidoEstado
  monto?: number | null
  descripcion?: string | null
  items: PedidoItemInput[]
}): Promise<{ success: true; id: string } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    if (!input.fecha) return { error: "Falta la fecha del pedido" }

    /**
     * Las piezas escritas a mano se dan de alta en el catálogo antes de guardar.
     * Es lo que pidió el Gestor de Flota: que la próxima vez ya esté en la lista
     * para tildar, en vez de volver a tipearla distinto —que es exactamente como
     * terminamos con "filtro gasoil", "FILTRO COMBUSTIBLEE" y "filtro trampa
     * agua" conviviendo para dos piezas—.
     *
     * Entra marcada como pieza de compra (`en_panol = false`): que la hayas
     * pedido una vez no la convierte en stock del pañol.
     */
    const items: Array<{ repuesto_id: string | null; descripcion: string | null; cantidad: number }> = []
    for (const it of input.items) {
      const cantidad = it.cantidad && it.cantidad > 0 ? it.cantidad : 1
      if (it.repuestoId) {
        items.push({ repuesto_id: it.repuestoId, descripcion: null, cantidad })
        continue
      }
      const nombre = it.nombreNuevo?.trim()
      if (!nombre) continue
      const { data: ya } = await supabase
        .from("mantenimiento_repuestos")
        .select("id")
        .ilike("nombre", nombre)
        .maybeSingle()
      if (ya?.id) {
        items.push({ repuesto_id: ya.id as string, descripcion: null, cantidad })
        continue
      }
      const alta = await supabase
        .from("mantenimiento_repuestos")
        .insert({
          nombre,
          stock_actual: 0,
          stock_min: 0,
          en_panol: false,
          created_by: profile.id,
        })
        .select("id")
        .single()
      if (alta.error) {
        // Sin la columna, la pieza nueva queda como texto del ítem y no se pierde.
        if (alta.error.code !== "42703") return { error: alta.error.message }
        items.push({ repuesto_id: null, descripcion: nombre, cantidad })
        continue
      }
      items.push({ repuesto_id: alta.data.id as string, descripcion: null, cantidad })
    }
    if (items.length === 0) return { error: "Elegí al menos una pieza" }

    // El estado se deduce de las fechas, salvo que venga uno explícito: retirado
    // gana sobre comprado, y comprado sobre abierto.
    const estado: PedidoEstado =
      input.estado ??
      (input.fechaRetiro ? "retirado" : input.fechaCompra ? "comprado" : "abierto")

    const fila = {
      dominio: input.dominio?.trim() || null,
      ot_id: input.otId || null,
      fecha: input.fecha,
      fecha_compra: input.fechaCompra || null,
      fecha_retiro: input.fechaRetiro || null,
      proveedor: input.proveedor?.trim() || null,
      prioridad: input.prioridad ?? "media",
      estado,
      monto: input.monto ?? null,
      descripcion: input.descripcion?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let pedidoId = input.id
    if (pedidoId) {
      const { error } = await supabase
        .from("mantenimiento_pedidos")
        .update(fila)
        .eq("id", pedidoId)
      if (error) return { error: error.message }
      await supabase.from("mantenimiento_pedido_items").delete().eq("pedido_id", pedidoId)
    } else {
      const { data, error } = await supabase
        .from("mantenimiento_pedidos")
        .insert({ ...fila, created_by: profile.id })
        .select("id")
        .single()
      if (error) return { error: error.message }
      pedidoId = data.id as string
    }

    const { error: itErr } = await supabase
      .from("mantenimiento_pedido_items")
      .insert(items.map((i) => ({ ...i, pedido_id: pedidoId })))
    if (itErr) return { error: itErr.message }

    return { success: true, id: pedidoId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** El botón "Ya se retiró": cierra el pedido con la fecha del día. */
export async function marcarPedidoRetirado(
  id: string,
  fecha?: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const hoy = fecha || new Date().toISOString().slice(0, 10)
    const { error } = await supabase
      .from("mantenimiento_pedidos")
      .update({ estado: "retirado", fecha_retiro: hoy, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarPedidoRepuestos(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase.from("mantenimiento_pedidos").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
