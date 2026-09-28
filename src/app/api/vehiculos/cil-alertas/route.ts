import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  TIPOS_CIL_PROGRAMADOS,
  TOLERANCIA_DIAS,
  fechasCilDelMes,
  fmtDiaConNombre,
} from "@/lib/flota/cil-programacion"
import {
  DIAS_VENTANA_CHOFER,
  choferesPorUnidad,
  fechaMenosDias,
} from "@/lib/flota/cil-choferes"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Aviso del CIL programado: le dice al chofer, por la campanita, el día antes y
 * el mismo día que le toca hacerle el CIL a su unidad (DPO Flota 4.1).
 *
 * 🚨 El aviso va SÓLO al chofer de la unidad (decisión de Francisco,
 * 28/09/2026). El supervisor lo mira en Mantenimiento → CIL → Programación, que
 * muestra lo mismo para toda la flota.
 *
 * 🚨 Los días no se consultan a ninguna tabla: salen del sorteo determinista de
 * `lib/flota/cil-programacion`, el mismo que usa la pantalla. Si un día el cron
 * no corre, no se pierde la programación —sólo el aviso de ese día—, y el chofer
 * igual ve sus días en Mi CIL.
 *
 * 🚨 No avisa si la unidad YA tiene el CIL cargado para ese día: el aviso existe
 * para que no se lo olvide, no para insistirle a quien ya lo hizo.
 */

/** Ventana de deduplicación: dos avisos del mismo día no se repiten. */
const DIAS_DEDUP = 3

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function masUnDia(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

interface Aviso {
  userId: string
  dominio: string
  numero: string | null
  fecha: string
  cuando: "hoy" | "manana"
}

export async function GET(req: Request) {
  // Auth: Vercel cron manda Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization") ?? ""
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const hoy = hoyArgentina()
  const manana = masUnDia(hoy)

  const programados = TIPOS_CIL_PROGRAMADOS as readonly string[]
  const { data: veh, error: errVeh } = await supabase
    .from("catalogo_vehiculos")
    .select("dominio, tipo")
    .eq("active", true)
  if (errVeh) {
    return NextResponse.json({ error: `catalogo: ${errVeh.message}` }, { status: 500 })
  }
  const dominios = (veh ?? [])
    .filter((v: { tipo: string | null }) => programados.includes(v.tipo ?? ""))
    .map((v: { dominio: string }) => v.dominio)

  if (dominios.length === 0) {
    return NextResponse.json({ ok: true, hoy, avisos: 0, detalle: "sin camiones activos" })
  }

  const [choferes, fichasRes, cilRes] = await Promise.all([
    choferesPorUnidad(supabase, dominios, fechaMenosDias(hoy, DIAS_VENTANA_CHOFER)),
    supabase
      .from("vehiculos_ficha")
      .select("dominio, numero_asignado")
      .in("dominio", dominios),
    // Lo cargado alrededor de los días que se van a avisar: con esto se saltea a
    // quien ya lo hizo (incluso si lo adelantó).
    supabase
      .from("mantenimiento_cil")
      .select("dominio, fecha")
      .in("dominio", dominios)
      .gte("fecha", fechaMenosDias(hoy, TOLERANCIA_DIAS))
      .lte("fecha", manana),
  ])

  const numeros = new Map(
    ((fichasRes.data ?? []) as Array<{ dominio: string; numero_asignado: string | null }>).map(
      (f) => [f.dominio, f.numero_asignado],
    ),
  )
  const cargado = new Set(
    ((cilRes.data ?? []) as Array<{ dominio: string; fecha: string }>).map(
      (t) => `${t.dominio}|${t.fecha.slice(0, 10)}`,
    ),
  )

  /** ¿Ya hizo el CIL para ese día (el día mismo o adelantado)? */
  const yaHecho = (dominio: string, fecha: string) => {
    for (let i = 0; i <= TOLERANCIA_DIAS; i++) {
      if (cargado.has(`${dominio}|${fechaMenosDias(fecha, i)}`)) return true
    }
    return false
  }

  const avisos: Aviso[] = []
  let sinChofer = 0
  for (const dominio of dominios) {
    const chofer = choferes.get(dominio)
    // 🚨 Sin usuario no hay a quién avisarle. Pasa con una unidad que no viene
    // cargando checklists: la pantalla del supervisor lo marca como "sin aviso"
    // para que no se lea como que el chofer fue avisado.
    if (!chofer?.userId) {
      sinChofer += 1
      continue
    }
    // El mes de hoy y —si mañana ya es otro mes— también el que viene.
    const fechas = new Set([
      ...fechasCilDelMes(dominio, hoy.slice(0, 7)),
      ...fechasCilDelMes(dominio, manana.slice(0, 7)),
    ])
    for (const [fecha, cuando] of [
      [hoy, "hoy"],
      [manana, "manana"],
    ] as Array<[string, "hoy" | "manana"]>) {
      if (!fechas.has(fecha)) continue
      if (yaHecho(dominio, fecha)) continue
      avisos.push({
        userId: chofer.userId,
        dominio,
        numero: numeros.get(dominio) ?? null,
        fecha,
        cuando,
      })
    }
  }

  // Los avisos ya mandados en los últimos días, para no repetir el mismo.
  const { data: previas } = await supabase
    .from("notificaciones")
    .select("user_id, titulo")
    .eq("tipo", "cil_programado")
    .gte("created_at", `${fechaMenosDias(hoy, DIAS_DEDUP)}T00:00:00Z`)
  const yaAvisado = new Set(
    ((previas ?? []) as Array<{ user_id: string; titulo: string }>).map(
      (n) => `${n.user_id}|${n.titulo}`,
    ),
  )

  let creadas = 0
  const saltadas: string[] = []
  for (const a of avisos) {
    const unidad = `${a.numero ? `${a.numero} · ` : ""}${a.dominio}`
    const titulo =
      a.cuando === "hoy"
        ? `Hoy te toca el CIL del ${a.dominio}`
        : `Mañana te toca el CIL del ${a.dominio}`
    if (yaAvisado.has(`${a.userId}|${titulo}`)) {
      saltadas.push(`${a.dominio} (ya avisado)`)
      continue
    }
    const mensaje =
      a.cuando === "hoy"
        ? `${unidad} — limpieza profunda, control de fluidos y lubricación. Cargalo en Mi CIL con la foto.`
        : `${unidad} — te toca el ${fmtDiaConNombre(a.fecha)}. Dejalo listo para cargarlo con la foto.`

    const { error } = await supabase.from("notificaciones").insert({
      user_id: a.userId,
      tipo: "cil_programado",
      titulo,
      mensaje,
      link: "/mi-cil",
      leida: false,
    })
    if (error) {
      console.error(`[cil-alertas] ${a.dominio}: ${error.message}`)
      continue
    }
    yaAvisado.add(`${a.userId}|${titulo}`)
    creadas += 1
  }

  return NextResponse.json({
    ok: true,
    hoy,
    camiones: dominios.length,
    candidatos: avisos.length,
    creadas,
    saltadas,
    sinChofer,
  })
}
