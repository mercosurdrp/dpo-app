import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface ReunionTipoConfigRow {
  tipo: string
  nombre: string
  dias_semana: number[]
}

/**
 * Devuelve el día actual en zona ARG en formato { iso: "YYYY-MM-DD", weekday: 1..7 }
 * (1 = lunes, ..., 7 = domingo).
 */
function todayArg(): { iso: string; weekday: number } {
  const ar = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  )
  const y = ar.getFullYear()
  const m = String(ar.getMonth() + 1).padStart(2, "0")
  const d = String(ar.getDate()).padStart(2, "0")
  const js = ar.getDay() // 0 = dom, 1 = lun, ..., 6 = sab
  const weekday = js === 0 ? 7 : js
  return { iso: `${y}-${m}-${d}`, weekday }
}

export async function GET(req: Request) {
  // Auth: Vercel cron envía Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization") ?? ""
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { iso: hoyIso, weekday } = todayArg()

  // Cargar todos los tipos
  const { data: tiposRaw, error: errTipos } = await supabase
    .from("reuniones_tipos_config")
    .select("tipo, nombre, dias_semana")

  if (errTipos) {
    return NextResponse.json({ error: errTipos.message }, { status: 500 })
  }

  const tipos = (tiposRaw ?? []) as ReunionTipoConfigRow[]

  const created: { tipo: string; reunion_id: string }[] = []
  const skipped: { tipo: string; motivo: string }[] = []

  for (const t of tipos) {
    if (!Array.isArray(t.dias_semana) || !t.dias_semana.includes(weekday)) {
      skipped.push({ tipo: t.tipo, motivo: "dia_no_habilitado" })
      continue
    }

    // ¿ya existe reunión de ese tipo para hoy?
    const { data: existente } = await supabase
      .from("reuniones")
      .select("id")
      .eq("tipo", t.tipo)
      .eq("fecha", hoyIso)
      .maybeSingle()

    if (existente) {
      skipped.push({ tipo: t.tipo, motivo: "ya_existe" })
      continue
    }

    // Insertar reunión
    const { data: nueva, error: errIns } = await supabase
      .from("reuniones")
      .insert({
        tipo: t.tipo,
        fecha: hoyIso,
      })
      .select("id")
      .single()

    if (errIns || !nueva) {
      skipped.push({
        tipo: t.tipo,
        motivo: `insert_error: ${errIns?.message ?? "desconocido"}`,
      })
      continue
    }

    const reunionId = (nueva as { id: string }).id

    // Cargar participantes fijos del tipo
    const { data: fijosRaw } = await supabase
      .from("reuniones_participantes_fijos")
      .select("profile_id")
      .eq("tipo", t.tipo)

    const fijos = (fijosRaw ?? []) as { profile_id: string }[]
    if (fijos.length > 0) {
      const rows = fijos.map((f) => ({
        reunion_id: reunionId,
        profile_id: f.profile_id,
        presente: false,
      }))
      const { error: errAsis } = await supabase
        .from("reuniones_asistentes")
        .insert(rows)
      if (errAsis) {
        // No revertimos la reunión: queda creada con 0 asistentes y se loguea
        console.error(
          `[cron-crear-diarias] Falla insert asistentes ${t.tipo}: ${errAsis.message}`,
        )
      }
    }

    created.push({ tipo: t.tipo, reunion_id: reunionId })
  }

  return NextResponse.json({
    ok: true,
    fecha: hoyIso,
    weekday,
    created,
    skipped,
  })
}
