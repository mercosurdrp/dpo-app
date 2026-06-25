/**
 * Feed JSON público del Radar de Rechazos — para consumir desde OTRA app.
 *
 * Sin autenticación (decisión de negocio): cualquiera con el link obtiene el
 * JSON de la última foto del radar. Pensado para que otra app arme planes de
 * acción sobre los clientes en riesgo / críticos de la entrega de pasado mañana.
 *
 * GET /api/radar-rechazos/feed?modo=criticos|todos&umbral=7
 *   modo=criticos (default) → solo clientes con MÁS de `umbral` rechazos por
 *                             SIN DINERO en el año calendario de la entrega.
 *   modo=todos              → todos los clientes en riesgo de la foto.
 *
 * Los conteos `sin_dinero_anio` / `cerrado_anio` son del AÑO CALENDARIO de la
 * entrega (recontados desde el 1-ene). Solo Pampeana.
 *
 * OJO: este path debe estar en la allowlist de `src/middleware.ts`, si no el
 * middleware lo redirige a /login y nunca responde JSON.
 */
import { NextResponse, type NextRequest } from "next/server"
import { IS_MISIONES } from "@/lib/empresa"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ID_CERRADO = 1
const ID_SIN_DINERO = 6
const UMBRAL_DEFAULT = 7

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
  const umbralRaw = Number(req.nextUrl.searchParams.get("umbral"))
  const umbral = Number.isInteger(umbralRaw) && umbralRaw >= 0 ? umbralRaw : UMBRAL_DEFAULT

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
        "id_cliente, nombre_cliente, localidad, telefono, id_promotor, nombre_promotor, reparto, bultos_pedido, monto_pedido",
      )
      .eq("fecha_entrega", header.fecha_entrega)
    if (cErr) throw new Error(cErr.message)

    const anio = Number(String(header.fecha_entrega).slice(0, 4))
    const desde = `${anio}-01-01`
    const ids = (enRiesgo ?? [])
      .map((c) => c.id_cliente)
      .filter((id): id is number => id != null)

    // Conteo del año calendario (sin dinero / cerrado) para los clientes en riesgo
    const calen = new Map<number, { sd: number; ce: number }>()
    if (ids.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supa
          .from("rechazos")
          .select("id_cliente, id_rechazo")
          .in("id_cliente", ids)
          .in("id_rechazo", [ID_CERRADO, ID_SIN_DINERO])
          .gte("fecha_venta", desde)
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break
        for (const r of data as { id_cliente: number | null; id_rechazo: number }[]) {
          if (r.id_cliente == null) continue
          const c = calen.get(r.id_cliente) ?? { sd: 0, ce: 0 }
          if (r.id_rechazo === ID_SIN_DINERO) c.sd += 1
          else if (r.id_rechazo === ID_CERRADO) c.ce += 1
          calen.set(r.id_cliente, c)
        }
        if (data.length < PAGE) break
        from += PAGE
      }
    }

    let clientes = (enRiesgo ?? []).map((c) => {
      const cc = c.id_cliente != null ? calen.get(c.id_cliente) : undefined
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
        sin_dinero_anio: cc?.sd ?? 0,
        cerrado_anio: cc?.ce ?? 0,
      }
    })

    if (modo === "criticos") {
      clientes = clientes.filter((c) => c.sin_dinero_anio > umbral)
    }

    clientes.sort(
      (a, b) =>
        (a.promotor ?? "~").localeCompare(b.promotor ?? "~") ||
        b.sin_dinero_anio - a.sin_dinero_anio ||
        (a.nombre ?? "").localeCompare(b.nombre ?? ""),
    )

    return NextResponse.json(
      {
        ok: true,
        modo,
        umbral: modo === "criticos" ? umbral : null,
        anio,
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
