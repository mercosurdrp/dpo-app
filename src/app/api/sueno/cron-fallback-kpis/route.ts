// Cron diario de RESPALDO para los KPIs del Árbol del Sueño que se calculan
// EN VIVO al abrir la pantalla: TLP, Tiempo en Ruta, Tiempo en PDV y WNP.
// Esos cálculos son pesados y tolerantes a fallos: si una consulta se demora,
// o el depósito no responde, el resolver devuelve null y la tarjeta cae al
// valor persistido en `sueno_kpi_valores`. Ese respaldo venía vacío ⇒ la
// tarjeta parpadeaba en blanco ante cualquier timeout.
//
// Este cron corre los MISMOS cálculos 1×día y persiste el último valor bueno
// como respaldo. Reglas:
//   - NO pisa con null: si el cálculo falla ese día, se conserva el respaldo
//     anterior (no se toca la fila).
//   - Solo escribe `valor_ytd` + `updated_at` (el upsert onConflict no toca
//     meta / gatillo / nota).
//   - El cálculo EN VIVO sigue mandando en la lectura del árbol; esto solo
//     mejora el fallback cuando el vivo hipa.
//
// Auth: Bearer CRON_SECRET (Vercel lo inyecta en sus crons).
// Tenant: solo Pampeana; en Misiones sale 200 noop. Schedule en `vercel.json`.
//
// Corrida manual:
//   curl -H "Authorization: Bearer $CRON_SECRET" .../api/sueno/cron-fallback-kpis

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { tlpAnual, tiempoPdvAnual } from "@/lib/tlp/calc"
import { tiempoRutaAnual } from "@/lib/tlp/tiempo-ruta"
import { KPI_EXTERNOS } from "@/lib/sueno/externos"
import { IS_MISIONES } from "@/lib/empresa"

const CRON_SECRET = process.env.CRON_SECRET
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ success: true, skipped: "not-pampeana" })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const isAuthorized = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "CRON_SECRET inválido o faltante" },
      { status: 401 },
    )
  }

  const year = new Date().getFullYear()
  const admin = createAdminClient()
  // Las funciones TLP tipan su cliente como el SSR client; el admin es
  // estructuralmente compatible (mismos `.from()`), se castea para el tipo.
  const sb = admin as unknown as Parameters<typeof tlpAnual>[0]

  // Cada cálculo por separado y tolerante a fallos: un error no tumba a los otros.
  // FGLI y TQI entran al respaldo el 2026-09-14: leen el tablero del depósito
  // (desde el 2026-09-17 una sola llamada a /api/indicadores) y son los que
  // más chances tienen de quedar en null en un render frío.
  const [tlp, pdv, ruta, wnp, fgli, tqi] = await Promise.all([
    tlpAnual(sb, year).catch(() => null),
    tiempoPdvAnual(sb, year).catch(() => null),
    tiempoRutaAnual(sb, year).catch(() => null),
    KPI_EXTERNOS.wnp.resumen(year).catch(() => null),
    KPI_EXTERNOS.fgli.resumen(year).catch(() => null),
    KPI_EXTERNOS.tqi.resumen(year).catch(() => null),
  ])

  const valores: { kpi_key: string; valor_ytd: number }[] = []
  if (tlp?.ytd != null) valores.push({ kpi_key: "tlp", valor_ytd: tlp.ytd })
  if (pdv?.ytd != null) valores.push({ kpi_key: "tiempo_pdv", valor_ytd: pdv.ytd })
  if (ruta?.ytd != null) valores.push({ kpi_key: "tiempo_ruta", valor_ytd: ruta.ytd })
  if (wnp?.promedio_anual != null)
    valores.push({ kpi_key: "wnp", valor_ytd: wnp.promedio_anual })
  if (fgli?.promedio_anual != null)
    valores.push({ kpi_key: "fgli", valor_ytd: fgli.promedio_anual })
  if (tqi?.promedio_anual != null)
    valores.push({ kpi_key: "tqi", valor_ytd: tqi.promedio_anual })

  const now = new Date().toISOString()
  const escritos: string[] = []
  const errores: Record<string, string> = {}
  for (const v of valores) {
    const { error } = await admin.from("sueno_kpi_valores").upsert(
      {
        kpi_key: v.kpi_key,
        anio: year,
        valor_ytd: v.valor_ytd,
        updated_at: now,
      },
      { onConflict: "kpi_key,anio" },
    )
    if (error) errores[v.kpi_key] = error.message
    else escritos.push(v.kpi_key)
  }

  const saltados = ["tlp", "tiempo_pdv", "tiempo_ruta", "wnp", "fgli", "tqi"].filter(
    (k) => !escritos.includes(k),
  )

  return NextResponse.json({
    success: true,
    anio: year,
    escritos,
    // cálculo dio null (o error de escritura) ⇒ se conserva el respaldo anterior
    saltados_sin_dato: saltados,
    errores: Object.keys(errores).length ? errores : undefined,
  })
}
