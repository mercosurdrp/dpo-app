import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DIAS_ALERTA = 30

interface DestinatarioResolved {
  user_id: string
  email: string
  nombre: string
  motivo: "config" | "responsable"
}

function todayInArgentina(): Date {
  const ar = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  )
  ar.setHours(0, 0, 0, 0)
  return ar
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

export async function GET(req: Request) {
  // Auth: Vercel cron envía Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization") ?? ""
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const hoy = todayInArgentina()
  const limite = new Date(hoy)
  limite.setDate(limite.getDate() + DIAS_ALERTA)

  // 1. Requisitos en zona de alerta (hasta 30 días por delante; los vencidos
  //    también entran para que el responsable vea la urgencia)
  const { data: requisitos, error: errReq } = await supabase
    .from("requisitos_legales")
    .select("id, nombre, fecha_vencimiento, responsable_id, categoria_id")
    .lte("fecha_vencimiento", isoDate(limite))

  if (errReq) {
    return NextResponse.json({ error: errReq.message }, { status: 500 })
  }

  if (!requisitos || requisitos.length === 0) {
    return NextResponse.json({ ok: true, requisitos: 0, alertas: 0 })
  }

  const indisponibilidad = await syncIndisponibilidadDocumental(supabase, hoy, requisitos)

  // 2. Emails de la config (destinatarios fijos)
  const { data: configRows, error: errConfig } = await supabase
    .from("requisitos_legales_alertas_config")
    .select("email")
    .eq("activo", true)

  if (errConfig) {
    return NextResponse.json({ error: errConfig.message }, { status: 500 })
  }

  const emailsConfig = (configRows ?? []).map((r) => r.email.toLowerCase())

  // 3. Resolver emails -> profiles activos
  const { data: profilesByEmail } = await supabase
    .from("profiles")
    .select("id, email, nombre")
    .in("email", emailsConfig)
    .eq("active", true)

  const profilesConfig = (profilesByEmail ?? []) as Array<{
    id: string
    email: string
    nombre: string
  }>

  let totalAlertas = 0
  const detalle: Array<{ requisito: string; alertas: number }> = []
  const hoyIso = isoDate(hoy)

  for (const r of requisitos) {
    const venc = new Date(r.fecha_vencimiento + "T00:00:00")
    const ms = venc.getTime() - hoy.getTime()
    const dias = Math.round(ms / 86400000)

    const destinatarios: DestinatarioResolved[] = profilesConfig.map((p) => ({
      user_id: p.id,
      email: p.email,
      nombre: p.nombre,
      motivo: "config",
    }))

    // Responsable, si no es ya parte de la config
    if (r.responsable_id) {
      const { data: respRow } = await supabase
        .from("profiles")
        .select("id, email, nombre, active")
        .eq("id", r.responsable_id)
        .single()
      if (
        respRow?.active &&
        !destinatarios.some((d) => d.user_id === respRow.id)
      ) {
        destinatarios.push({
          user_id: respRow.id,
          email: respRow.email,
          nombre: respRow.nombre,
          motivo: "responsable",
        })
      }
    }

    let alertasReq = 0
    for (const dest of destinatarios) {
      // Idempotencia: si ya hay log de hoy para este (requisito, user), skip.
      const { data: yaEnviado } = await supabase
        .from("requisitos_legales_alertas_log")
        .select("id")
        .eq("requisito_id", r.id)
        .eq("user_id", dest.user_id)
        .eq("fecha_enviada", hoyIso)
        .maybeSingle()

      if (yaEnviado) continue

      const titulo =
        dias < 0
          ? `Requisito vencido: ${r.nombre}`
          : dias === 0
            ? `Requisito vence HOY: ${r.nombre}`
            : `Requisito por vencer en ${dias}d: ${r.nombre}`

      const mensaje =
        dias < 0
          ? `Venció hace ${Math.abs(dias)} día(s) (${r.fecha_vencimiento}).`
          : `Vence el ${r.fecha_vencimiento}. Renovar antes para mantener el derecho a operar.`

      const { error: errNotif } = await supabase
        .from("notificaciones")
        .insert({
          user_id: dest.user_id,
          tipo: "requisito_legal_vencimiento",
          titulo,
          mensaje,
          link: "/requisitos-legales",
          leida: false,
        })

      if (errNotif) {
        console.error(
          `[cron-alertas] Falla insert notificacion ${dest.email}: ${errNotif.message}`,
        )
        continue
      }

      await supabase.from("requisitos_legales_alertas_log").insert({
        requisito_id: r.id,
        user_id: dest.user_id,
        fecha_enviada: hoyIso,
        dias_restantes: dias,
      })

      alertasReq += 1
      totalAlertas += 1
    }

    detalle.push({ requisito: r.nombre, alertas: alertasReq })
  }

  return NextResponse.json({
    ok: true,
    requisitos_evaluados: requisitos.length,
    alertas_creadas: totalAlertas,
    indisponibilidad,
    detalle,
  })
}

const MOTIVO_DOC = "Documentación vencida"

// DPO Flota R1.1.4: una unidad con documento vencido queda FUERA DE SERVICIO
// hasta regularizar. Este sync registra esa indisponibilidad en
// flota_indisponibilidad (que el Seguimiento de flota ya cuenta como IND):
// abre el rango el día posterior al vencimiento y lo extiende cada día
// mientras el documento siga vencido; al renovarse el rango deja de crecer y
// queda como evidencia histórica del período fuera de servicio.
async function syncIndisponibilidadDocumental(
  supabase: ReturnType<typeof createAdminClient>,
  hoy: Date,
  requisitos: Array<{ nombre: string; fecha_vencimiento: string; categoria_id: string | null }>,
): Promise<{ unidades: number; abiertas: number; extendidas: number } | { error: string }> {
  try {
    const hoyIso = isoDate(hoy)

    const [catsRes, vehRes] = await Promise.all([
      supabase
        .from("requisitos_legales_categorias")
        .select("id, nombre")
        .eq("tipo_identificador", "vehiculo"),
      supabase.from("catalogo_vehiculos").select("dominio").eq("active", true),
    ])
    if (catsRes.error) throw new Error(catsRes.error.message)
    if (vehRes.error) throw new Error(vehRes.error.message)

    const catNombre = new Map((catsRes.data ?? []).map((c) => [c.id, c.nombre]))
    const activos = new Set((vehRes.data ?? []).map((v) => v.dominio.trim().toUpperCase()))

    // Documentos de vehículo vencidos, agrupados por dominio activo
    const porDominio = new Map<string, Array<{ categoria: string; vencimiento: string }>>()
    for (const r of requisitos) {
      if (!r.categoria_id || !catNombre.has(r.categoria_id)) continue
      if (r.fecha_vencimiento >= hoyIso) continue
      const dominio = r.nombre.trim().toUpperCase()
      if (!activos.has(dominio)) continue
      const lista = porDominio.get(dominio) ?? []
      lista.push({ categoria: catNombre.get(r.categoria_id)!, vencimiento: r.fecha_vencimiento })
      porDominio.set(dominio, lista)
    }

    let abiertas = 0
    let extendidas = 0
    for (const [dominio, docs] of porDominio) {
      const motivo = `${MOTIVO_DOC}: ${docs
        .map((d) => `${d.categoria} (venció ${d.vencimiento})`)
        .join(", ")}`
      // desde el día posterior al primer vencimiento
      const desde = new Date(docs.reduce((min, d) => (d.vencimiento < min ? d.vencimiento : min), docs[0].vencimiento) + "T00:00:00")
      desde.setDate(desde.getDate() + 1)

      const { data: existente, error: errSel } = await supabase
        .from("flota_indisponibilidad")
        .select("id, fecha_hasta")
        .eq("dominio", dominio)
        .like("motivo", `${MOTIVO_DOC}%`)
        .gte("fecha_hasta", isoDate(new Date(hoy.getTime() - 86400000)))
        .order("fecha_hasta", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (errSel) throw new Error(errSel.message)

      if (existente) {
        if (existente.fecha_hasta < hoyIso) {
          const { error } = await supabase
            .from("flota_indisponibilidad")
            .update({ fecha_hasta: hoyIso, motivo })
            .eq("id", existente.id)
          if (error) throw new Error(error.message)
          extendidas += 1
        }
      } else {
        const { error } = await supabase.from("flota_indisponibilidad").insert({
          dominio,
          fecha_desde: isoDate(desde),
          fecha_hasta: hoyIso,
          motivo,
        })
        if (error) throw new Error(error.message)
        abiertas += 1
      }
    }

    return { unidades: porDominio.size, abiertas, extendidas }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[cron-alertas] Falla sync indisponibilidad documental: ${msg}`)
    return { error: msg }
  }
}
