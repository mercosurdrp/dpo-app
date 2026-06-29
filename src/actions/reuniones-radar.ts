"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { crearTareaDirecta } from "./tareas-directas"

type Result<T> = { data: T } | { error: string }

const BUCKET = "reuniones"
const TABLE = "reunion_radar_gestion"
const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]

const ID_CERRADO = 1
const ID_SIN_DINERO = 6

async function requireEditorReuniones() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Solo supervisores, jefe de venta o admin pueden gestionar el radar")
  }
  return profile
}

function cleanName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

export type RadarModo = "criticos" | "todos"

export interface RadarGestionRow {
  id_cliente: number
  nombre: string | null
  localidad: string | null
  telefono: string | null
  promotor: string | null
  reparto: string | null
  bultos_pedido: number
  monto_pedido: number
  // Conteos del AÑO CALENDARIO de la entrega (recontados desde el 1-ene).
  sin_dinero_anio: number
  cerrado_anio: number
  // Motivo principal por el que entró al radar.
  motivo: "sin_dinero" | "cerrado"
  // Estado de gestión en esta reunión (null si todavía no se tocó).
  gestion: {
    contactado_por: string | null
    contactado_nombre: string | null
    contactado_at: string | null
    foto_url: string | null
    foto_nombre: string | null
    plan_id: string | null
  } | null
}

export interface RadarGestionData {
  fecha_entrega: string | null
  generado_at: string | null
  anio: number | null
  modo: RadarModo
  umbral: number | null
  total: number
  clientes: RadarGestionRow[]
}

// ──────────────────────────────────────────────────────────────────────────
// Foto del radar + estado de gestión de la reunión, mismo criterio que el feed
// público (/api/radar-rechazos/feed): conteos del año calendario, modo críticos
// filtra sin_dinero_anio > umbral. Solo se suma el estado de gestión por cliente.
// ──────────────────────────────────────────────────────────────────────────
export async function getRadarGestion(
  reunionId: string,
  modo: RadarModo = "criticos",
  umbral = 7,
): Promise<Result<RadarGestionData>> {
  try {
    await requireAuth()
    const supa = await createClient()

    const { data: header, error: hErr } = await supa
      .from("radar_rechazos_snapshot")
      .select("id, fecha_entrega, generado_at")
      .order("fecha_entrega", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hErr) return { error: hErr.message }
    if (!header) {
      return {
        data: { fecha_entrega: null, generado_at: null, anio: null, modo, umbral: modo === "criticos" ? umbral : null, total: 0, clientes: [] },
      }
    }

    const { data: enRiesgo, error: cErr } = await supa
      .from("radar_rechazos_cliente")
      .select(
        "id_cliente, nombre_cliente, localidad, telefono, nombre_promotor, reparto, bultos_pedido, monto_pedido",
      )
      .eq("snapshot_id", header.id)
    if (cErr) return { error: cErr.message }

    const anio = Number(String(header.fecha_entrega).slice(0, 4))
    const desde = `${anio}-01-01`
    const ids = (enRiesgo ?? [])
      .map((c) => c.id_cliente)
      .filter((id): id is number => id != null)

    // Conteo calendario (sin dinero / cerrado) para los clientes en riesgo.
    const calen = new Map<number, { sd: number; ce: number }>()
    if (ids.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supa
          .from("rechazos")
          .select("id_cliente, id_rechazo")
          .in("id_cliente", ids)
          .in("id_rechazo", [ID_CERRADO, ID_SIN_DINERO])
          .gte("fecha_venta", desde)
          .range(from, from + PAGE - 1)
        if (error) return { error: error.message }
        if (!data || data.length === 0) break
        for (const r of data as { id_cliente: number | null; id_rechazo: number }[]) {
          if (r.id_cliente == null) continue
          const c = calen.get(r.id_cliente) ?? { sd: 0, ce: 0 }
          if (r.id_rechazo === ID_SIN_DINERO) c.sd += 1
          else if (r.id_rechazo === ID_CERRADO) c.ce += 1
          calen.set(r.id_cliente, c)
        }
        if (data.length < PAGE) break
        from += PAGE
      }
    }

    // Estado de gestión cargado en esta reunión.
    const { data: gestiones } = await supa
      .from(TABLE)
      .select("id_cliente, contactado_por, contactado_at, foto_path, foto_nombre, plan_id")
      .eq("reunion_id", reunionId)
    const gestMap = new Map<number, Record<string, unknown>>()
    for (const g of gestiones ?? []) gestMap.set(Number(g.id_cliente), g)

    // Nombres de quienes contactaron (para mostrar "contactó X").
    const contactorIds = Array.from(
      new Set((gestiones ?? []).map((g) => g.contactado_por).filter(Boolean) as string[]),
    )
    const nombrePorId = new Map<string, string>()
    if (contactorIds.length > 0) {
      const { data: profs } = await supa
        .from("profiles")
        .select("id, nombre, email")
        .in("id", contactorIds)
      for (const p of profs ?? []) {
        nombrePorId.set(p.id, (p.nombre as string) || (p.email as string) || "—")
      }
    }

    let clientes: RadarGestionRow[] = []
    for (const c of enRiesgo ?? []) {
      if (c.id_cliente == null) continue
      const cc = calen.get(c.id_cliente) ?? { sd: 0, ce: 0 }
      const g = gestMap.get(c.id_cliente)
      let foto_url: string | null = null
      if (g?.foto_path) {
        const signed = await supa.storage
          .from(BUCKET)
          .createSignedUrl(g.foto_path as string, 3600)
        foto_url = signed.data?.signedUrl ?? null
      }
      clientes.push({
        id_cliente: c.id_cliente,
        nombre: c.nombre_cliente,
        localidad: c.localidad,
        telefono: c.telefono,
        promotor: c.nombre_promotor,
        reparto: c.reparto,
        bultos_pedido: Number(c.bultos_pedido ?? 0),
        monto_pedido: Number(c.monto_pedido ?? 0),
        sin_dinero_anio: cc.sd,
        cerrado_anio: cc.ce,
        motivo: cc.sd >= cc.ce ? "sin_dinero" : "cerrado",
        gestion: g
          ? {
              contactado_por: (g.contactado_por as string) ?? null,
              contactado_nombre: g.contactado_por
                ? nombrePorId.get(g.contactado_por as string) ?? null
                : null,
              contactado_at: (g.contactado_at as string) ?? null,
              foto_url,
              foto_nombre: (g.foto_nombre as string) ?? null,
              plan_id: (g.plan_id as string) ?? null,
            }
          : null,
      })
    }

    if (modo === "criticos") {
      clientes = clientes.filter((c) => c.sin_dinero_anio > umbral)
    }
    // Orden: por promotor, luego sin dinero desc, luego cliente.
    clientes.sort(
      (a, b) =>
        (a.promotor ?? "~").localeCompare(b.promotor ?? "~") ||
        b.sin_dinero_anio - a.sin_dinero_anio ||
        (a.nombre ?? "").localeCompare(b.nombre ?? ""),
    )

    return {
      data: {
        fecha_entrega: header.fecha_entrega,
        generado_at: header.generado_at,
        anio,
        modo,
        umbral: modo === "criticos" ? umbral : null,
        total: clientes.length,
        clientes,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el radar de la reunión" }
  }
}

// Helper: trae/crea la fila de gestión de un cliente para esta reunión.
async function upsertGestion(
  supa: Awaited<ReturnType<typeof createClient>>,
  reunion_id: string,
  id_cliente: number,
  patch: Record<string, unknown>,
  creado_por: string,
): Promise<Result<true>> {
  const { error } = await supa
    .from(TABLE)
    .upsert(
      { reunion_id, id_cliente, creado_por, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "reunion_id,id_cliente" },
    )
  if (error) return { error: error.message }
  return { data: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Validar mensaje enviado: sube la captura del chat (Ctrl+V o archivo) como
// evidencia de la reunión y marca al cliente como contactado.
// ──────────────────────────────────────────────────────────────────────────
export async function registrarContacto(
  formData: FormData,
): Promise<Result<{ foto_url: string }>> {
  try {
    const profile = await requireEditorReuniones()
    const supa = await createClient()

    const reunion_id = String(formData.get("reunion_id") ?? "").trim()
    const id_cliente = Number(formData.get("id_cliente"))
    const nombre_cliente = String(formData.get("nombre_cliente") ?? "").trim() || null
    const motivo = String(formData.get("motivo") ?? "").trim() || null
    const file = formData.get("foto")

    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (!Number.isFinite(id_cliente)) return { error: "Cliente inválido" }
    if (!(file instanceof File) || file.size === 0) return { error: "Subí o pegá la captura del chat" }
    if (!file.type.startsWith("image/")) return { error: "El archivo debe ser una imagen" }

    const path = `radar-gestion/${reunion_id}/${id_cliente}/${Date.now()}-${cleanName(file.name)}`
    const buf = await file.arrayBuffer()
    const { error: upErr } = await supa.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type || "image/png", upsert: false })
    if (upErr) return { error: `Subiendo la captura: ${upErr.message}` }

    const res = await upsertGestion(
      supa,
      reunion_id,
      id_cliente,
      {
        nombre_cliente,
        motivo,
        contactado_por: profile.id,
        contactado_at: new Date().toISOString(),
        foto_path: path,
        foto_nombre: file.name,
      },
      profile.id,
    )
    if ("error" in res) {
      await supa.storage.from(BUCKET).remove([path])
      return { error: res.error }
    }

    const signed = await supa.storage.from(BUCKET).createSignedUrl(path, 3600)
    revalidatePath("/reuniones")
    return { data: { foto_url: signed.data?.signedUrl ?? "" } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error registrando el contacto" }
  }
}

// Quita la captura y el estado de contacto (no toca el plan disparado).
export async function quitarContacto(
  reunionId: string,
  idCliente: number,
): Promise<Result<true>> {
  try {
    await requireEditorReuniones()
    const supa = await createClient()
    const { data: row } = await supa
      .from(TABLE)
      .select("foto_path, plan_id")
      .eq("reunion_id", reunionId)
      .eq("id_cliente", idCliente)
      .maybeSingle()
    if (!row) return { data: true }

    if (row.plan_id) {
      // Hay plan: solo limpio el contacto, conservo la fila por el plan_id.
      const { error } = await supa
        .from(TABLE)
        .update({ contactado_por: null, contactado_at: null, foto_path: null, foto_nombre: null, updated_at: new Date().toISOString() })
        .eq("reunion_id", reunionId)
        .eq("id_cliente", idCliente)
      if (error) return { error: error.message }
    } else {
      const { error } = await supa
        .from(TABLE)
        .delete()
        .eq("reunion_id", reunionId)
        .eq("id_cliente", idCliente)
      if (error) return { error: error.message }
    }
    if (row.foto_path) await supa.storage.from(BUCKET).remove([row.foto_path as string])
    revalidatePath("/reuniones")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error quitando el contacto" }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Disparar plan de acción puntual para el cliente → cae en /planes (tarea
// directa). El cliente se guarda en el título/descripción (planes_accion no
// tiene campo cliente) y se enlaza por plan_id en la gestión de la reunión.
// ──────────────────────────────────────────────────────────────────────────
export async function dispararPlanCliente(input: {
  reunion_id: string
  id_cliente: number
  nombre_cliente: string | null
  motivo: string | null
  titulo: string
  descripcion: string
  responsable_ids: string[]
  fecha_limite: string | null
  prioridad?: "alta" | "media" | "baja"
}): Promise<Result<{ plan_id: string }>> {
  try {
    const profile = await requireEditorReuniones()

    const creado = await crearTareaDirecta({
      titulo: input.titulo,
      descripcion: input.descripcion,
      responsable_ids: input.responsable_ids,
      fecha_limite: input.fecha_limite,
      prioridad: input.prioridad ?? "media",
      evidencia_obligatoria: false,
      tipo: "directa",
    })
    if ("error" in creado) return { error: creado.error }

    const supa = await createClient()
    const res = await upsertGestion(
      supa,
      input.reunion_id,
      input.id_cliente,
      {
        nombre_cliente: input.nombre_cliente,
        motivo: input.motivo,
        plan_id: creado.data.id,
      },
      profile.id,
    )
    if ("error" in res) {
      // El plan ya quedó creado en /planes; solo no se pudo enlazar.
      return { error: `Plan creado pero no se pudo enlazar a la reunión: ${res.error}` }
    }

    revalidatePath("/reuniones")
    revalidatePath("/planes")
    return { data: { plan_id: creado.data.id } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error disparando el plan" }
  }
}
