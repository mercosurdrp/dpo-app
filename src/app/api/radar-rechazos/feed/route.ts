/**
 * Feed JSON público del Radar de Rechazos — para consumir desde OTRA app.
 *
 * Sin autenticación (decisión de negocio): cualquiera con el link obtiene el
 * JSON de la última foto del radar. Pensado para que otra app arme planes de
 * acción sobre los clientes reincidentes de la entrega de pasado mañana.
 *
 * GET /api/radar-rechazos/feed?modo=criticos|todos
 *   modo=criticos (default) → solo los clientes que cumplen el CRITERIO (abajo).
 *   modo=todos              → todos los clientes en riesgo de la foto.
 *
 * 🚨 Los conteos salen TAL CUAL de `radar_rechazos_cliente`, que el cron ya
 * calcula en VECES (cliente × fecha). NO recalcular acá sobre la tabla
 * `rechazos`: (1) esa tabla tiene UNA FILA POR ARTÍCULO rechazado, así que
 * contar filas infla el número por la cantidad de SKU del pedido (un rechazo de
 * 13 productos contaba 13 — el bug que este feed tenía); (2) paginarla entera
 * para todos los clientes del día tardaba +90 s y la ruta moría con 522.
 *
 * Ventanas (las del snapshot): `_anio` = últimos 365 días, `_mes` = últimos 30.
 *
 * CRITERIO: vive en `@/lib/radar-rechazos/criterio` y lo comparten este feed, la
 * pantalla y el PDF. Ver ahí las dos condiciones y por qué se lee del snapshot.
 *
 * OJO: este path debe estar en la allowlist de `src/middleware.ts`, si no el
 * middleware lo redirige a /login y nunca responde JSON.
 */
import { NextResponse, type NextRequest } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  evaluarCriticidad,
  textoCriterio,
  MESES_ANIO,
  UMBRAL_30D,
  UMBRAL_ANIO,
} from "@/lib/radar-rechazos/criterio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ ok: false, error: "not-pampeana" }, { status: 404, headers: CORS })
  }

  const modo = req.nextUrl.searchParams.get("modo") === "todos" ? "todos" : "criticos"

  try {
    const supa = createAdminClient()

    const { data: header, error: hErr } = await supa
      .from("radar_rechazos_snapshot")
      .select("fecha_entrega, generado_at, total_clientes_dia, total_clientes_riesgo")
      .order("fecha_entrega", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hErr) throw new Error(hErr.message)
    if (!header) {
      return NextResponse.json(
        { ok: true, modo, fecha_entrega: null, total: 0, clientes: [] },
        { headers: CORS },
      )
    }

    const { data: enRiesgo, error: cErr } = await supa
      .from("radar_rechazos_cliente")
      .select(
        "id_cliente, nombre_cliente, localidad, telefono, id_promotor, nombre_promotor, reparto, bultos_pedido, monto_pedido, sin_dinero_anio, sin_dinero_mes, cerrado_anio, cerrado_mes, bultos_rechazados_anio",
      )
      .eq("fecha_entrega", header.fecha_entrega)
    if (cErr) throw new Error(cErr.message)

    let clientes = (enRiesgo ?? []).map((c) => {
      const sinDineroAnio = Number(c.sin_dinero_anio ?? 0)
      const cerradoAnio = Number(c.cerrado_anio ?? 0)
      const sinDineroMes = Number(c.sin_dinero_mes ?? 0)
      const cerradoMes = Number(c.cerrado_mes ?? 0)
      const crit = evaluarCriticidad(c)
      const { rechazos_anio: rechazosAnio, rechazos_30d: rechazos30d } = crit
      const porPromedio = crit.por_promedio_anio
      const por30d = crit.por_ultimos_30d
      return {
        id_cliente: c.id_cliente,
        nombre: c.nombre_cliente,
        localidad: c.localidad,
        telefono: c.telefono,
        id_promotor: c.id_promotor,
        promotor: c.nombre_promotor,
        reparto: c.reparto,
        bultos_pedido: Number(c.bultos_pedido ?? 0),
        monto_pedido: Number(c.monto_pedido ?? 0),
        sin_dinero_anio: sinDineroAnio,
        cerrado_anio: cerradoAnio,
        sin_dinero_30d: sinDineroMes,
        cerrado_30d: cerradoMes,
        rechazos_anio: rechazosAnio,
        rechazos_30d: rechazos30d,
        bultos_rechazados_anio: Number(c.bultos_rechazados_anio ?? 0),
        // Qué condición lo hizo entrar (puede ser una, la otra, o las dos).
        por_promedio_anio: porPromedio,
        por_ultimos_30d: por30d,
        cumple_criterio: crit.es_critico,
      }
    })

    if (modo === "criticos") {
      clientes = clientes.filter((c) => c.cumple_criterio)
    }

    clientes.sort(
      (a, b) =>
        (a.promotor ?? "~").localeCompare(b.promotor ?? "~") ||
        b.rechazos_30d - a.rechazos_30d ||
        b.rechazos_anio - a.rechazos_anio ||
        (a.nombre ?? "").localeCompare(b.nombre ?? ""),
    )

    return NextResponse.json(
      {
        ok: true,
        modo,
        criterio_meses: MESES_ANIO,
        criterio_umbral_anio: UMBRAL_ANIO,
        // 🚨 INCLUSIVE desde 2026-07-31: antes era `> 2` (3 o más) y dejaba el
        // feed en cero 7 de cada 10 días. Ahora `>= 2`, como se había pedido.
        criterio_umbral_30d: UMBRAL_30D,
        criterio_umbral_30d_inclusivo: true,
        criterio_descripcion: textoCriterio(),
        fecha_entrega: header.fecha_entrega,
        generado_at: header.generado_at,
        total_clientes_dia: header.total_clientes_dia,
        total_en_riesgo: header.total_clientes_riesgo,
        total: clientes.length,
        clientes,
      },
      { headers: { ...CORS, "Cache-Control": "public, max-age=300" } },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500, headers: CORS },
    )
  }
}
