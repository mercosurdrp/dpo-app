// Cron diario de FUERA DE RUTA desde Chess (Pampeana).
//
// Desde el 16/10/2026 el registro de fuera de ruta ya no sale del sheet que
// cargaba logística a mano: un pedido está fuera de ruta si se entrega un día
// que no es uno de los días pactados de su cliente (ver lib/fuera-ruta/chess.ts).
//
// Qué hace cada corrida:
//   1) Renueva la foto de días pactados por cliente si tiene más de un día
//      (bajar el maestro de clientes de Chess tarda ~10 s; la pantalla no debe pagarlo).
//   2) Deja cerrados AYER y ANTEAYER con lo facturado (/ventas/) y precalcula HOY
//      y MAÑANA con los pedidos pendientes (/pedidos/), así la pantalla abre al
//      instante y el acumulado mensual está completo aunque nadie la abra.
//
// Auth: Bearer CRON_SECRET. Schedule en `vercel.json` (10:30 UTC = 07:30 ARG,
// cuando las facturas del día ya están emitidas y las de ayer liquidadas).
//
// Corridas manuales:
//   curl -H "Authorization: Bearer $CRON_SECRET" .../cron-sync
//   ...?fecha=2026-10-20                      una fecha puntual
//   ...?desde=2026-10-16&hasta=2026-10-31     reconstruir un rango
//   ...?dias=1                                forzar la renovación de días pactados
//   ...?fecha=2026-10-16&hoy=2026-10-18       tratar esa fecha como pasada (camino /ventas/)

import { NextRequest, NextResponse } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { FUERA_RUTA_CHESS_DESDE } from "@/lib/fuera-ruta/chess"
import { diasPactadosVencidos, renovarDiasPactados } from "@/lib/fuera-ruta/dias-pactados"
import {
  hoyArg,
  restarDiasIso,
  sincronizarFueraRutaChess,
  type SyncChessResultado,
} from "@/lib/fuera-ruta/sync-chess"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 300

/** Tope de días por corrida: un mes entero entra holgado. */
const MAX_DIAS = 40

function sumarDiasIso(fecha: string, dias: number): string {
  return restarDiasIso(fecha, -dias)
}

function rangoDeFechas(desde: string, hasta: string): string[] {
  const out: string[] = []
  let f = desde
  while (f <= hasta && out.length < MAX_DIAS) {
    out.push(f)
    f = sumarDiasIso(f, 1)
  }
  return out
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const t0 = Date.now()
  const authHeader = request.headers.get("authorization") ?? ""
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  if (IS_MISIONES) {
    return NextResponse.json({ ok: true, omitido: "El registro de fuera de ruta es sólo de Pampeana." })
  }

  const sp = request.nextUrl.searchParams
  // ?hoy= fuerza qué se considera "hoy" (para probar el camino facturado de
  // una fecha que todavía está pendiente). En producción no hace falta.
  const hoy = ES_FECHA.test(sp.get("hoy") ?? "") ? sp.get("hoy")! : hoyArg()
  let fechas: string[]
  if (sp.get("fecha")) {
    const f = sp.get("fecha")!
    if (!ES_FECHA.test(f)) return NextResponse.json({ error: "fecha inválida" }, { status: 400 })
    fechas = [f]
  } else if (sp.get("desde") && sp.get("hasta")) {
    const desde = sp.get("desde")!
    const hasta = sp.get("hasta")!
    if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta) || desde > hasta) {
      return NextResponse.json({ error: "rango inválido" }, { status: 400 })
    }
    fechas = rangoDeFechas(desde, hasta)
  } else {
    fechas = [restarDiasIso(hoy, 2), restarDiasIso(hoy, 1), hoy, sumarDiasIso(hoy, 1)]
  }
  fechas = fechas.filter((f) => f >= FUERA_RUTA_CHESS_DESDE)

  let diasPactados: "renovados" | "vigentes" | `error: ${string}` = "vigentes"
  try {
    if (sp.get("dias") === "1" || (await diasPactadosVencidos())) {
      await renovarDiasPactados(hoy)
      diasPactados = "renovados"
    }
  } catch (e) {
    diasPactados = `error: ${e instanceof Error ? e.message : String(e)}`
  }

  const resultados: (SyncChessResultado | { fecha: string; error: string })[] = []
  for (const fecha of fechas) {
    try {
      resultados.push(await sincronizarFueraRutaChess(fecha, hoy))
    } catch (e) {
      resultados.push({ fecha, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const errores = resultados.filter((r) => "error" in r).length
  return NextResponse.json(
    { ok: errores === 0, hoy, dias_pactados: diasPactados, resultados, duracion_ms: Date.now() - t0 },
    { status: errores === 0 ? 200 : 207 },
  )
}
