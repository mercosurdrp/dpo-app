import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
// Calendario de Presupuesto (1er hábil desde el 16 y +7 días): compartido con
// la página de la reunión, que necesita saber cuál de las dos es.
import { presupuestoTargets } from "@/lib/reuniones-presupuesto"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface ReunionTipoConfigRow {
  tipo: string
  nombre: string
  dias_semana: number[]
  regla_especial: string | null
}

/**
 * Fecha objetivo de la reunión de Mantenimiento para el mes de `iso`
 * (regla_especial = 'segundo_lunes'): el 2º lunes del mes.
 * El 2º lunes es el lunes cuyo día del mes cae entre 8 y 14 inclusive.
 * Devuelve "YYYY-MM-DD".
 */
function segundoLunesTarget(iso: string): string {
  const [y, m] = iso.split("-").map(Number)
  // Día de semana del día 1 del mes (0 = dom, 1 = lun, ..., 6 = sáb), en UTC.
  const dow1 = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  // Primer lunes: desplazamiento desde el día 1 hasta el lunes.
  const primerLunes = 1 + ((1 - dow1 + 7) % 7)
  const segundoLunes = primerLunes + 7
  const d = new Date(Date.UTC(y, m - 1, segundoLunes))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/**
 * Fecha objetivo de la reunión de Iniciativas de Ahorro para el mes de `iso`
 * (regla_especial = 'segundo_dia_habil'): el 2º día hábil (lunes a viernes)
 * del mes. Si el 1 cae viernes, el 2º hábil es el lunes 4; si cae sábado, el
 * martes 3. No contempla feriados, igual que el resto de las reglas.
 * Devuelve "YYYY-MM-DD".
 */
function segundoDiaHabilTarget(iso: string): string {
  const [y, m] = iso.split("-").map(Number)
  let habiles = 0
  for (let dia = 1; dia <= 7; dia++) {
    const dow = new Date(Date.UTC(y, m - 1, dia)).getUTCDay() // 0 = dom, 6 = sáb
    if (dow === 0 || dow === 6) continue
    habiles++
    if (habiles === 2) {
      return `${y}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    }
  }
  // Inalcanzable: en 7 días corridos siempre hay al menos 5 hábiles.
  return `${y}-${String(m).padStart(2, "0")}-02`
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
    .select("tipo, nombre, dias_semana, regla_especial")

  if (errTipos) {
    return NextResponse.json({ error: errTipos.message }, { status: 500 })
  }

  const tipos = (tiposRaw ?? []) as ReunionTipoConfigRow[]

  const created: { tipo: string; reunion_id: string }[] = []
  const skipped: { tipo: string; motivo: string }[] = []

  for (const t of tipos) {
    // Tipos con regla especial de fecha (ej: Presupuesto) no usan días de
    // semana: se crean solo en sus fechas objetivo del mes.
    if (t.regla_especial === "quincena_2") {
      if (!presupuestoTargets(hoyIso).includes(hoyIso)) {
        skipped.push({ tipo: t.tipo, motivo: "fuera_de_fecha_objetivo" })
        continue
      }
    } else if (t.regla_especial === "segundo_lunes") {
      if (segundoLunesTarget(hoyIso) !== hoyIso) {
        skipped.push({ tipo: t.tipo, motivo: "fuera_de_fecha_objetivo" })
        continue
      }
    } else if (t.regla_especial === "segundo_dia_habil") {
      if (segundoDiaHabilTarget(hoyIso) !== hoyIso) {
        skipped.push({ tipo: t.tipo, motivo: "fuera_de_fecha_objetivo" })
        continue
      }
    } else if (
      !Array.isArray(t.dias_semana) ||
      !t.dias_semana.includes(weekday)
    ) {
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
