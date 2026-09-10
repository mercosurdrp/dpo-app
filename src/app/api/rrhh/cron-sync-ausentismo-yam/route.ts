// Cron diario que replica ausencias/licencias APROBADAS de YAM Capital Humano
// hacia `ausentismo_eventos` (módulo /ausentismo + indicador del tablero de
// reuniones). Ver el detalle del mapeo y las limitaciones conocidas en
// src/lib/yam-ausentismo-sync.ts. Port del sync que ya corre en Misiones.
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta automáticamente en sus crons).
// Ventana default: [hoy-30, hoy+60]. Backfill manual con ?desde=&hasta=:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     ".../api/rrhh/cron-sync-ausentismo-yam?desde=2026-01-01&hasta=2026-12-31"
// ?dryRun=1 hace todo el fetch y el mapeo pero no escribe en la base — para
// probar sin tocar producción.

import { NextRequest, NextResponse } from "next/server"
import { sincronizarAusentismoYam } from "@/lib/yam-ausentismo-sync"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 120

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? ""
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "CRON_SECRET inválido o faltante" }, { status: 401 })
  }

  const url = new URL(request.url)
  const hoy = new Date().toISOString().slice(0, 10)
  const sumarDias = (iso: string, dias: number) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + dias)
    return d.toISOString().slice(0, 10)
  }
  const qDesde = url.searchParams.get("desde")
  const qHasta = url.searchParams.get("hasta")
  const desde = qDesde && FECHA_RE.test(qDesde) ? qDesde : sumarDias(hoy, -30)
  const hasta = qHasta && FECHA_RE.test(qHasta) ? qHasta : sumarDias(hoy, 60)
  const dryRun = url.searchParams.get("dryRun") === "1"

  try {
    const resultado = await sincronizarAusentismoYam(desde, hasta, dryRun)
    console.log(
      "[yam-ausentismo-sync]",
      dryRun ? "(dry-run)" : "",
      "ventana",
      desde,
      hasta,
      "recibidos=",
      resultado.ausentismosRecibidos,
      "insertados=",
      resultado.insertados,
      "actualizados=",
      resultado.actualizados,
      "sinCambios=",
      resultado.sinCambios,
      "eliminados=",
      resultado.eliminados,
      "sinDni=",
      resultado.sinDni,
      "sinEmpleado=",
      resultado.sinEmpleado,
      "sinMapeo=",
      resultado.sinMapeo,
    )
    for (const d of resultado.detalle) {
      console.log("[yam-ausentismo-sync]", JSON.stringify(d))
    }
    return NextResponse.json(resultado)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido"
    console.error("[yam-ausentismo-sync] error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
