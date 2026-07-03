"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { enviarEmail, parseEmailList, type EmailAdjunto } from "@/lib/email/resend"
import {
  GASTO_TIPO_LABELS,
  GASTO_MEDIO_PAGO_LABELS,
  type GastoEstadoImputacion,
  type GastoEstadoPago,
  type GastoMedioPago,
  type GastoTipo,
  type MantenimientoGasto,
  type MantenimientoProveedor,
  type MantenimientoTipo,
} from "@/types/database"

const TIPOS_MANT: MantenimientoTipo[] = ["preventivo", "correctivo", "proactivo"]

const PATH = "/vehiculos/mantenimiento"
const BUCKET = "gastos-mantenimiento"

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(v)

function cleanFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80)
}

// ==================== LECTURA ====================

export async function getGastos(opts?: {
  mes?: string
  limit?: number
}): Promise<{ data: MantenimientoGasto[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    let q = supabase
      .from("mantenimiento_gastos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 500)
    if (opts?.mes) q = q.eq("mes_imputacion", opts.mes)
    const { data, error } = await q
    if (error) return { error: error.message }
    return { data: (data ?? []) as MantenimientoGasto[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ENVÍO DE MAIL ====================

function buildHtml(gasto: MantenimientoGasto): string {
  const row = (k: string, v: string | null | undefined) =>
    v
      ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0;font-weight:600;color:#0f172a">${v}</td></tr>`
      : ""
  return `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:560px">
    <h2 style="margin:0 0 4px">Nuevo gasto para imputar</h2>
    <p style="margin:0 0 16px;color:#64748b">Cargado desde el módulo de Mantenimiento de flota.</p>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("Tipo", GASTO_TIPO_LABELS[gasto.tipo])}
      ${row("Monto", fmtMoney(gasto.monto))}
      ${row("Proveedor", gasto.proveedor)}
      ${row("Rubro", gasto.rubro)}
      ${row(
        "Tipo de mantenimiento",
        gasto.tipo_mantenimiento
          ? gasto.tipo_mantenimiento.charAt(0).toUpperCase() + gasto.tipo_mantenimiento.slice(1)
          : "No corresponde"
      )}
      ${row("Fecha comprobante", gasto.fecha)}
      ${row("Fecha de carga", gasto.fecha_carga)}
      ${row("Mes de imputación", gasto.mes_imputacion)}
      ${row("N° comprobante", gasto.numero_comprobante)}
      ${row("N° orden de trabajo", gasto.orden_trabajo)}
      ${row("Medio de pago", gasto.medio_pago ? GASTO_MEDIO_PAGO_LABELS[gasto.medio_pago] : null)}
      ${row("Cuenta contable", gasto.cuenta_contable)}
      ${row("Centro de costo", gasto.centro_costo)}
      ${row("Unidad", gasto.dominio)}
      ${row("Observaciones", gasto.observaciones)}
    </table>
    ${
      gasto.adjunto_urls.length
        ? `<p style="margin:16px 0 0;font-size:14px">Comprobante: ${gasto.adjunto_urls
            .map((u, i) => `<a href="${u}">Adjunto ${i + 1}</a>`)
            .join(" · ")}</p>`
        : ""
    }
  </div>`
}

/** Envía el aviso de imputación y persiste el resultado en la fila. */
async function enviarAvisoGasto(
  gasto: MantenimientoGasto,
  attachments: EmailAdjunto[]
): Promise<{ mail_enviado: boolean; mail_error: string | null }> {
  const to = parseEmailList(process.env.GASTOS_MAIL_TO)
  const cc = parseEmailList(process.env.GASTOS_MAIL_CC)
  const subject = `Gasto a imputar — ${GASTO_TIPO_LABELS[gasto.tipo]} ${fmtMoney(
    gasto.monto
  )}${gasto.proveedor ? ` — ${gasto.proveedor}` : ""}`

  const res = await enviarEmail({
    to,
    cc,
    subject,
    html: buildHtml(gasto),
    attachments,
  })

  if (res.ok) return { mail_enviado: true, mail_error: null }
  if ("skipped" in res && res.skipped) return { mail_enviado: false, mail_error: res.reason }
  return { mail_enviado: false, mail_error: "error" in res ? res.error : "Error enviando mail" }
}

// ==================== CREAR ====================

export async function createGasto(
  formData: FormData
): Promise<{ data: MantenimientoGasto } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const tipo = String(formData.get("tipo") || "") as GastoTipo
    if (!["factura", "boleta", "caja_chica"].includes(tipo)) return { error: "Tipo inválido" }

    const fecha = String(formData.get("fecha") || "")
    if (!fecha) return { error: "La fecha es obligatoria" }

    const mes_imputacion = String(formData.get("mes_imputacion") || fecha.slice(0, 7))
    const fecha_carga = String(formData.get("fecha_carga") || "") || null
    const montoRaw = String(formData.get("monto") || "").replace(",", ".")
    const monto = Number(montoRaw)
    if (!isFinite(monto) || monto <= 0) return { error: "Ingresá un monto válido" }

    const str = (k: string) => {
      const v = String(formData.get(k) || "").trim()
      return v || null
    }
    const medioRaw = str("medio_pago")
    const medio_pago = (medioRaw as GastoMedioPago | null) ?? null

    const orden_trabajo = str("orden_trabajo")
    if (tipo === "factura" && !orden_trabajo)
      return { error: "Ingresá el N° de orden de trabajo (obligatorio para facturas)" }

    const tipoMantRaw = str("tipo_mantenimiento")
    const tipo_mantenimiento =
      tipoMantRaw && TIPOS_MANT.includes(tipoMantRaw as MantenimientoTipo)
        ? (tipoMantRaw as MantenimientoTipo)
        : null

    // Subida de adjuntos (foto/PDF del comprobante).
    const files = formData.getAll("adjuntos").filter((f): f is File => f instanceof File && f.size > 0)
    const adjunto_urls: string[] = []
    const adjuntoPaths: string[] = []
    const attachments: EmailAdjunto[] = []
    for (const file of files) {
      const path = `${mes_imputacion}/${Date.now()}-${cleanFileName(file.name)}`
      const buffer = await file.arrayBuffer()
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
      if (upErr) {
        if (adjuntoPaths.length) await supabase.storage.from(BUCKET).remove(adjuntoPaths)
        return { error: `Subiendo adjunto: ${upErr.message}` }
      }
      adjuntoPaths.push(path)
      adjunto_urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
      attachments.push({
        filename: cleanFileName(file.name),
        content: Buffer.from(buffer).toString("base64"),
      })
    }

    const { data: inserted, error } = await supabase
      .from("mantenimiento_gastos")
      .insert({
        tipo,
        fecha,
        fecha_carga,
        mes_imputacion,
        proveedor: str("proveedor"),
        rubro: str("rubro"),
        tipo_mantenimiento,
        monto,
        medio_pago,
        numero_comprobante: str("numero_comprobante"),
        orden_trabajo,
        cuenta_contable: str("cuenta_contable"),
        centro_costo: str("centro_costo"),
        dominio: str("dominio"),
        observaciones: str("observaciones"),
        adjunto_urls,
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error || !inserted) {
      if (adjuntoPaths.length) await supabase.storage.from(BUCKET).remove(adjuntoPaths)
      return { error: error?.message ?? "No se pudo guardar el gasto" }
    }

    // Aviso automático a contaduría (no bloquea el guardado si falla).
    const gasto = inserted as MantenimientoGasto
    const mailRes = await enviarAvisoGasto(gasto, attachments)
    await supabase
      .from("mantenimiento_gastos")
      .update({
        mail_enviado: mailRes.mail_enviado,
        mail_enviado_at: mailRes.mail_enviado ? new Date().toISOString() : null,
        mail_error: mailRes.mail_error,
      })
      .eq("id", gasto.id)

    revalidatePath(PATH)
    return {
      data: {
        ...gasto,
        mail_enviado: mailRes.mail_enviado,
        mail_enviado_at: mailRes.mail_enviado ? new Date().toISOString() : null,
        mail_error: mailRes.mail_error,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ACTUALIZAR ESTADOS ====================

export async function updateGastoEstado(
  id: string,
  patch: { estado_pago?: GastoEstadoPago; estado_imputacion?: GastoEstadoImputacion }
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_gastos")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== REENVIAR MAIL ====================

export async function reenviarMailGasto(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_gastos")
      .select("*")
      .eq("id", id)
      .single()
    if (error || !data) return { error: error?.message ?? "Gasto no encontrado" }

    const gasto = data as MantenimientoGasto
    // Re-adjuntar los comprobantes ya subidos (bajándolos del bucket).
    const attachments: EmailAdjunto[] = []
    for (const url of gasto.adjunto_urls) {
      try {
        const res = await fetch(url)
        if (res.ok) {
          const buf = await res.arrayBuffer()
          attachments.push({
            filename: url.split("/").pop() || "adjunto",
            content: Buffer.from(buf).toString("base64"),
          })
        }
      } catch {
        // si no se puede bajar, va el link en el cuerpo igual
      }
    }

    const mailRes = await enviarAvisoGasto(gasto, attachments)
    await supabase
      .from("mantenimiento_gastos")
      .update({
        mail_enviado: mailRes.mail_enviado,
        mail_enviado_at: mailRes.mail_enviado ? new Date().toISOString() : null,
        mail_error: mailRes.mail_error,
      })
      .eq("id", id)

    revalidatePath(PATH)
    if (!mailRes.mail_enviado) return { error: mailRes.mail_error ?? "No se pudo enviar" }
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ELIMINAR ====================

export async function deleteGasto(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { data } = await supabase
      .from("mantenimiento_gastos")
      .select("adjunto_urls")
      .eq("id", id)
      .single()
    const { error } = await supabase.from("mantenimiento_gastos").delete().eq("id", id)
    if (error) return { error: error.message }
    // Borrar adjuntos del bucket.
    const paths = ((data?.adjunto_urls as string[] | undefined) ?? [])
      .map((u) => u.split(`/${BUCKET}/`)[1])
      .filter(Boolean) as string[]
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CATÁLOGO DE PROVEEDORES ====================

export async function getProveedores(): Promise<
  { data: MantenimientoProveedor[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_proveedores")
      .select("id, nombre, activo, created_at")
      .eq("activo", true)
      .order("nombre", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data ?? []) as MantenimientoProveedor[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Alta de proveedor desde el form de gasto (botón "+"). Reutiliza si ya existe. */
export async function createProveedor(
  nombre: string
): Promise<{ data: MantenimientoProveedor } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const limpio = nombre.trim()
    if (!limpio) return { error: "Ingresá el nombre del proveedor" }
    const supabase = await createClient()

    // Si ya existe (case-insensitive), devolverlo en lugar de duplicar.
    const { data: existente } = await supabase
      .from("mantenimiento_proveedores")
      .select("id, nombre, activo, created_at")
      .ilike("nombre", limpio)
      .limit(1)
      .maybeSingle()
    if (existente) return { data: existente as MantenimientoProveedor }

    const { data, error } = await supabase
      .from("mantenimiento_proveedores")
      .insert({ nombre: limpio })
      .select("id, nombre, activo, created_at")
      .single()
    if (error || !data) return { error: error?.message ?? "No se pudo crear el proveedor" }
    revalidatePath(PATH)
    return { data: data as MantenimientoProveedor }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
