"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { UserRole } from "@/types/database"
import type {
  DescargaEstado,
  RemitoArticuloOpcion,
  RemitoChoferOpcion,
  RemitoInput,
  RemitoInterno,
  RemitoItem,
  RemitoOperacion,
  RemitoVehiculoOpcion,
} from "@/types/remitos-internos"

type Result<T> = { data: T } | { error: string }

const ROLES_EDITORES: UserRole[] = ["admin", "supervisor", "admin_rrhh"]
const RUTA = "/remitos-internos"

/** La tabla todavía no existe (migración sin aplicar). */
function faltaMigracion(error: { code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205")
}

const MSG_MIGRACION =
  "El módulo todavía no está habilitado en esta base: falta aplicar APLICAR_EN_PAMPEANA_REMITOS_INTERNOS.sql."

export async function puedeEditarRemitos(): Promise<boolean> {
  const profile = await requireAuth()
  return ROLES_EDITORES.includes(profile.role)
}

async function requireEditor() {
  const profile = await requireAuth()
  if (!ROLES_EDITORES.includes(profile.role)) throw new Error("Sólo admin o supervisor pueden cargar remitos")
  return profile
}

function normPatente(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, "")
}

function normNombre(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase()
}

// ── Operaciones ──────────────────────────────────────────────────────────────

export async function listOperaciones(): Promise<Result<RemitoOperacion[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("remitos_operaciones")
      .select("id, nombre, origen, destino, activa, created_at")
      .order("activa", { ascending: false })
      .order("created_at", { ascending: false })
    if (faltaMigracion(error)) return { error: MSG_MIGRACION }
    if (error) return { error: error.message }
    return { data: (data ?? []) as RemitoOperacion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando operaciones" }
  }
}

export async function crearOperacion(input: {
  nombre: string
  origen: string
  destino: string
}): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const nombre = input.nombre.trim()
    if (!nombre) return { error: "Poné un nombre a la operación" }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("remitos_operaciones")
      .insert({
        nombre,
        origen: input.origen.trim() || null,
        destino: input.destino.trim() || null,
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (error) return { error: error.message }
    revalidatePath(RUTA)
    return { data: { id: data.id as string } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error creando la operación" }
  }
}

export async function setOperacionActiva(id: string, activa: boolean): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase.from("remitos_operaciones").update({ activa }).eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(RUTA)
    return { data: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error actualizando la operación" }
  }
}

// ── Remitos ──────────────────────────────────────────────────────────────────

const SELECT_REMITO =
  "*, operacion:remitos_operaciones(nombre), items:remitos_internos_items(id, orden, id_articulo, descripcion, cantidad, unidad)"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapearRemitos(supabase: any, rows: any[]): Promise<RemitoInterno[]> {
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.created_by) ids.add(r.created_by)
    if (r.descargado_por) ids.add(r.descargado_por)
  }
  const nombres = new Map<string, string>()
  if (ids.size) {
    const { data } = await supabase.from("profiles").select("id, nombre").in("id", [...ids])
    for (const p of data ?? []) nombres.set(p.id, p.nombre)
  }
  return rows.map((r) => ({
    id: r.id,
    operacion_id: r.operacion_id,
    operacion_nombre: r.operacion?.nombre ?? "",
    numero: r.numero,
    fecha: r.fecha,
    origen: r.origen ?? null,
    destino: r.destino ?? null,
    vehiculo_id: r.vehiculo_id ?? null,
    patente: r.patente,
    chofer_id: r.chofer_id ?? null,
    chofer_nombre: r.chofer_nombre,
    observaciones: r.observaciones ?? null,
    anulado: !!r.anulado,
    descarga_estado: (r.descarga_estado ?? null) as DescargaEstado | null,
    descarga_comentario: r.descarga_comentario ?? null,
    descargado_por_nombre: r.descargado_por ? (nombres.get(r.descargado_por) ?? null) : null,
    descargado_at: r.descargado_at ?? null,
    creado_por_nombre: r.created_by ? (nombres.get(r.created_by) ?? null) : null,
    created_at: r.created_at,
    items: ((r.items ?? []) as RemitoItem[])
      .map((i) => ({ ...i, cantidad: Number(i.cantidad) }))
      .sort((a, b) => a.orden - b.orden),
  }))
}

export async function listRemitos(operacionId: string): Promise<Result<RemitoInterno[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("remitos_internos")
      .select(SELECT_REMITO)
      .eq("operacion_id", operacionId)
      .order("numero", { ascending: false })
    if (faltaMigracion(error)) return { error: MSG_MIGRACION }
    if (error) return { error: error.message }
    return { data: await mapearRemitos(supabase, data ?? []) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando remitos" }
  }
}

export async function getRemito(id: string): Promise<Result<RemitoInterno | null>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.from("remitos_internos").select(SELECT_REMITO).eq("id", id).maybeSingle()
    if (faltaMigracion(error)) return { error: MSG_MIGRACION }
    if (error) {
      // id con formato inválido → como si no existiera
      if (error.code === "22P02") return { data: null }
      return { error: error.message }
    }
    if (!data) return { data: null }
    const [r] = await mapearRemitos(supabase, [data])
    return { data: r }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando el remito" }
  }
}

function validarInput(input: RemitoInput): string | null {
  if (!input.operacion_id) return "Elegí la operación"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return "Fecha inválida"
  if (!input.patente.trim()) return "Falta el camión (patente)"
  if (!input.chofer_nombre.trim()) return "Falta el chofer"
  const items = input.items.filter((i) => i.descripcion.trim())
  if (!items.length) return "Cargá al menos un renglón"
  for (const i of items) {
    if (!(Number(i.cantidad) > 0)) return `Cantidad inválida en «${i.descripcion}»`
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolverFlota(supabase: any, patente: string, chofer: string) {
  const [{ data: vehs }, { data: chofs }] = await Promise.all([
    supabase.from("catalogo_vehiculos").select("id, dominio"),
    supabase.from("catalogo_choferes").select("id, nombre"),
  ])
  const p = normPatente(patente)
  const c = normNombre(chofer)
  const veh = (vehs ?? []).find((v: { dominio: string }) => normPatente(v.dominio) === p)
  const cho = (chofs ?? []).find((x: { nombre: string }) => normNombre(x.nombre) === c)
  return {
    vehiculo_id: (veh?.id as string | undefined) ?? null,
    patente: veh ? (veh.dominio as string) : patente.trim().toUpperCase(),
    chofer_id: (cho?.id as string | undefined) ?? null,
    chofer_nombre: cho ? (cho.nombre as string) : chofer.trim(),
  }
}

function itemsParaGuardar(remitoId: string, items: RemitoItem[]) {
  return items
    .filter((i) => i.descripcion.trim())
    .map((i, idx) => ({
      remito_id: remitoId,
      orden: idx + 1,
      id_articulo: i.id_articulo ?? null,
      descripcion: i.descripcion.trim(),
      cantidad: Number(i.cantidad),
      unidad: i.unidad || "bultos",
    }))
}

export async function crearRemito(input: RemitoInput): Promise<Result<{ id: string; numero: number }>> {
  try {
    const profile = await requireEditor()
    const err = validarInput(input)
    if (err) return { error: err }
    const supabase = await createClient()
    const flota = await resolverFlota(supabase, input.patente, input.chofer_nombre)
    const { data, error } = await supabase
      .from("remitos_internos")
      .insert({
        operacion_id: input.operacion_id,
        fecha: input.fecha,
        origen: input.origen.trim() || null,
        destino: input.destino.trim() || null,
        ...flota,
        observaciones: input.observaciones.trim() || null,
        created_by: profile.id,
      })
      .select("id, numero")
      .single()
    if (error) return { error: error.message }
    const { error: errItems } = await supabase
      .from("remitos_internos_items")
      .insert(itemsParaGuardar(data.id, input.items))
    if (errItems) {
      // Sin renglones el remito no sirve: se borra para no dejar un número vacío.
      await supabase.from("remitos_internos").delete().eq("id", data.id)
      return { error: `No se pudieron guardar los renglones: ${errItems.message}` }
    }
    revalidatePath(RUTA)
    return { data: { id: data.id as string, numero: data.numero as number } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error creando el remito" }
  }
}

export async function actualizarRemito(id: string, input: RemitoInput): Promise<Result<true>> {
  try {
    await requireEditor()
    const err = validarInput(input)
    if (err) return { error: err }
    const supabase = await createClient()
    const { data: actual } = await supabase
      .from("remitos_internos")
      .select("descarga_estado, anulado")
      .eq("id", id)
      .maybeSingle()
    if (!actual) return { error: "El remito no existe" }
    if (actual.descarga_estado) return { error: "Ya se confirmó la descarga: no se puede editar" }
    if (actual.anulado) return { error: "El remito está anulado" }
    const flota = await resolverFlota(supabase, input.patente, input.chofer_nombre)
    const { error } = await supabase
      .from("remitos_internos")
      .update({
        fecha: input.fecha,
        origen: input.origen.trim() || null,
        destino: input.destino.trim() || null,
        ...flota,
        observaciones: input.observaciones.trim() || null,
      })
      .eq("id", id)
    if (error) return { error: error.message }
    const { error: errDel } = await supabase.from("remitos_internos_items").delete().eq("remito_id", id)
    if (errDel) return { error: errDel.message }
    const { error: errIns } = await supabase.from("remitos_internos_items").insert(itemsParaGuardar(id, input.items))
    if (errIns) return { error: errIns.message }
    revalidatePath(RUTA)
    revalidatePath(`${RUTA}/${id}`)
    return { data: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error guardando el remito" }
  }
}

export async function setRemitoAnulado(id: string, anulado: boolean): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase.from("remitos_internos").update({ anulado }).eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(RUTA)
    revalidatePath(`${RUTA}/${id}`)
    return { data: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error anulando el remito" }
  }
}

/** Confirmación en destino. Cualquier usuario logueado; `null` deshace (sólo editores). */
export async function marcarDescarga(
  id: string,
  estado: DescargaEstado | null,
  comentario: string,
): Promise<Result<true>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase.rpc("remito_interno_marcar_descarga", {
      p_id: id,
      p_estado: estado,
      p_comentario: comentario,
    })
    if (error) return { error: error.message }
    revalidatePath(RUTA)
    revalidatePath(`${RUTA}/${id}`)
    return { data: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error confirmando la descarga" }
  }
}

// ── Catálogos para el formulario ─────────────────────────────────────────────

export async function getCatalogosRemito(): Promise<
  Result<{ vehiculos: RemitoVehiculoOpcion[]; choferes: RemitoChoferOpcion[]; articulos: RemitoArticuloOpcion[] }>
> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const [veh, cho, art] = await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("id, dominio, descripcion, tipo")
        .eq("active", true)
        .neq("tipo", "autoelevador")
        .order("dominio"),
      supabase.from("catalogo_choferes").select("id, nombre").eq("active", true).order("nombre"),
      supabase
        .from("chess_articulos")
        .select("id_articulo, des_articulo, des_corta")
        .eq("anulado", false)
        .order("des_articulo")
        .range(0, 4999),
    ])
    if (veh.error) return { error: veh.error.message }
    if (cho.error) return { error: cho.error.message }
    if (art.error) return { error: art.error.message }
    return {
      data: {
        vehiculos: (veh.data ?? []).map((v) => ({ id: v.id, dominio: v.dominio, descripcion: v.descripcion ?? null })),
        choferes: (cho.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre })),
        articulos: (art.data ?? []).map((a) => ({
          id: a.id_articulo as number,
          descripcion: a.des_articulo as string,
          corta: (a.des_corta as string | null) ?? null,
        })),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando catálogos" }
  }
}
