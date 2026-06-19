import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Días de anticipación para el aviso "por vencer".
const DIAS_ALERTA = 3

type Origen = "plan" | "s5" | "presupuesto"

interface TareaVenc {
  origen: Origen
  tarea_id: string
  user_id: string | null
  titulo_tarea: string
  fecha: string // ISO date del vencimiento/compromiso
  link: string
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

function fmtAR(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
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
  const limiteIso = isoDate(limite)
  const hoyIso = isoDate(hoy)

  const tareas: TareaVenc[] = []

  // ---------------------------------------------------------------
  // 1) Planes de acción / tareas directas (responsable en plan_responsables)
  //    No completados, con fecha_limite <= hoy + DIAS_ALERTA.
  // ---------------------------------------------------------------
  const { data: planes, error: errPlan } = await supabase
    .from("planes_accion")
    .select(
      "id, titulo, descripcion, fecha_limite, estado, plan_responsables(profile_id)",
    )
    .neq("estado", "completado")
    .not("fecha_limite", "is", null)
    .lte("fecha_limite", limiteIso)

  if (errPlan) {
    return NextResponse.json(
      { error: `planes_accion: ${errPlan.message}` },
      { status: 500 },
    )
  }

  for (const p of planes ?? []) {
    const titulo: string =
      (p.titulo && p.titulo.trim()) ||
      (p.descripcion ? p.descripcion.slice(0, 80) : "Plan de acción")
    const resp = (p.plan_responsables ?? []) as Array<{ profile_id: string }>
    for (const r of resp) {
      tareas.push({
        origen: "plan",
        tarea_id: p.id,
        user_id: r.profile_id,
        titulo_tarea: titulo,
        fecha: p.fecha_limite,
        link: `/planes/${p.id}`,
      })
    }
  }

  // ---------------------------------------------------------------
  // 2) Acciones 5S (responsable_id) no cerradas
  // ---------------------------------------------------------------
  const { data: acciones5s, error: err5s } = await supabase
    .from("s5_acciones")
    .select("id, descripcion, responsable_id, fecha_compromiso, estado")
    .neq("estado", "cerrada")
    .not("responsable_id", "is", null)
    .not("fecha_compromiso", "is", null)
    .lte("fecha_compromiso", limiteIso)

  if (err5s) {
    return NextResponse.json(
      { error: `s5_acciones: ${err5s.message}` },
      { status: 500 },
    )
  }

  for (const a of acciones5s ?? []) {
    tareas.push({
      origen: "s5",
      tarea_id: a.id,
      user_id: a.responsable_id,
      titulo_tarea: a.descripcion ? a.descripcion.slice(0, 80) : "Acción 5S",
      fecha: a.fecha_compromiso,
      link: "/5s/acciones",
    })
  }

  // ---------------------------------------------------------------
  // 3) Tareas de presupuesto (responsable_id) no completadas
  // ---------------------------------------------------------------
  const { data: presup, error: errPre } = await supabase
    .from("presupuestos_tareas")
    .select("id, descripcion, rubro, responsable_id, fecha_limite, estado")
    .neq("estado", "completada")
    .not("responsable_id", "is", null)
    .not("fecha_limite", "is", null)
    .lte("fecha_limite", limiteIso)

  if (errPre) {
    return NextResponse.json(
      { error: `presupuestos_tareas: ${errPre.message}` },
      { status: 500 },
    )
  }

  for (const t of presup ?? []) {
    tareas.push({
      origen: "presupuesto",
      tarea_id: t.id,
      user_id: t.responsable_id,
      titulo_tarea:
        (t.descripcion && t.descripcion.slice(0, 80)) || t.rubro || "Tarea de presupuesto",
      fecha: t.fecha_limite,
      link: "/presupuesto",
    })
  }

  // ---------------------------------------------------------------
  // Emitir notificaciones con idempotencia diaria
  // ---------------------------------------------------------------
  let creadas = 0
  for (const t of tareas) {
    if (!t.user_id) continue

    // Verificar destinatario activo
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, active")
      .eq("id", t.user_id)
      .maybeSingle()
    if (!prof || prof.active === false) continue

    // Idempotencia: un aviso por (origen, tarea, usuario, día)
    const { data: yaEnviado } = await supabase
      .from("tareas_alertas_log")
      .select("id")
      .eq("origen", t.origen)
      .eq("tarea_id", t.tarea_id)
      .eq("user_id", t.user_id)
      .eq("fecha_enviada", hoyIso)
      .maybeSingle()
    if (yaEnviado) continue

    const venc = new Date(t.fecha + "T00:00:00")
    const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000)

    const prefijo =
      dias < 0
        ? `Tarea vencida`
        : dias === 0
          ? `Vence HOY`
          : `Vence en ${dias}d`

    const titulo = `${prefijo}: ${t.titulo_tarea}`
    const mensaje =
      dias < 0
        ? `Venció hace ${Math.abs(dias)} día(s) (${fmtAR(t.fecha)}) y sigue pendiente.`
        : dias === 0
          ? `Vence hoy (${fmtAR(t.fecha)}).`
          : `Vence el ${fmtAR(t.fecha)}.`

    const { error: errNotif } = await supabase.from("notificaciones").insert({
      user_id: t.user_id,
      tipo: "tarea_vencimiento",
      titulo,
      mensaje,
      link: t.link,
      leida: false,
    })
    if (errNotif) {
      console.error(`[cron-vencimientos] insert notif: ${errNotif.message}`)
      continue
    }

    await supabase.from("tareas_alertas_log").insert({
      origen: t.origen,
      tarea_id: t.tarea_id,
      user_id: t.user_id,
      fecha_enviada: hoyIso,
      dias_restantes: dias,
    })

    creadas += 1
  }

  return NextResponse.json({
    ok: true,
    tareas_evaluadas: tareas.length,
    alertas_creadas: creadas,
  })
}
