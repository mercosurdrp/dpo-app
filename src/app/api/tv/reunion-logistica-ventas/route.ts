import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// Endpoint máquina-a-máquina (lo consume la reunión Semanal Logística del
// dashboard Mercosur). No usa sesión de cookie: valida un Bearer propio
// (DPO_REUNION_READ_TOKEN, distinto del de la cartelera) y lee con service role.
//
// Devuelve los bloques de la reunión Logística-Ventas:
//  - rechazos: serie diaria del mes (hl_rechazados / total_hl ventas, mismo
//    criterio que el indicador AUTO "Rechazos %" de reuniones) + tops del mes.
//  - frescura / sobrestock: último snapshot congelado en una reunión
//    logistica-ventas (tablas reunion_*_snapshots).
//  - fotos: galerías NPS y RMD de la última reunión que las tenga (signed URLs).

const META_RECHAZOS_PCT = 1.7
const MAX_ITEMS_SNAPSHOT = 30
const MAX_TOPS = 10
const REUNIONES_LOOKBACK = 10

function hoyARG(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }) // "YYYY-MM-DD"
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

type Supa = ReturnType<typeof getServiceClient>

/** Últimas reuniones logistica-ventas (id + fecha, descendente). */
async function ultimasReuniones(supabase: Supa) {
  const { data } = await supabase
    .from("reuniones")
    .select("id, fecha")
    .eq("tipo", "logistica-ventas")
    .order("fecha", { ascending: false })
    .limit(REUNIONES_LOOKBACK)
  return (data ?? []) as Array<{ id: string; fecha: string }>
}

/** Serie diaria de rechazos del mes + tops por motivo y cliente. */
async function bloqueRechazos(
  supabase: Supa,
  desde: string,
  hasta: string,
  corte: string,
) {
  const [{ data: rechRaw, error: errRech }, { data: ventRaw, error: errVent }] =
    await Promise.all([
      supabase
        .from("rechazos")
        .select("fecha_venta, hl_rechazados, ds_rechazo, nombre_cliente, monto_neto")
        .gte("fecha_venta", desde)
        .lte("fecha_venta", hasta),
      supabase
        .from("ventas_diarias")
        .select("fecha, total_hl")
        .gte("fecha", desde)
        .lte("fecha", hasta),
    ])
  if (errRech || errVent) {
    return { error: errRech?.message ?? errVent?.message ?? "error" }
  }

  const hlPorFecha: Record<string, number> = {}
  const motivos = new Map<string, { hl: number; monto: number }>()
  const clientes = new Map<string, { hl: number; monto: number }>()
  for (const r of (rechRaw ?? []) as Array<Record<string, unknown>>) {
    const fecha = String(r.fecha_venta ?? "")
    const hl = num(r.hl_rechazados)
    const monto = num(r.monto_neto)
    if (!fecha) continue
    hlPorFecha[fecha] = (hlPorFecha[fecha] ?? 0) + hl
    const motivo = String(r.ds_rechazo ?? "").trim() || "(Sin motivo)"
    const m = motivos.get(motivo) ?? { hl: 0, monto: 0 }
    m.hl += hl
    m.monto += monto
    motivos.set(motivo, m)
    const cliente = String(r.nombre_cliente ?? "").trim() || "(Sin cliente)"
    const c = clientes.get(cliente) ?? { hl: 0, monto: 0 }
    c.hl += hl
    c.monto += monto
    clientes.set(cliente, c)
  }

  const ventasPorFecha: Record<string, number> = {}
  for (const v of (ventRaw ?? []) as Array<Record<string, unknown>>) {
    const fecha = String(v.fecha ?? "")
    if (!fecha) continue
    ventasPorFecha[fecha] = (ventasPorFecha[fecha] ?? 0) + num(v.total_hl)
  }

  const fechas = [...new Set([...Object.keys(hlPorFecha), ...Object.keys(ventasPorFecha)])].sort()
  let mtdHl = 0
  let mtdVentas = 0
  const serie = fechas.map((f) => {
    const hl = hlPorFecha[f] ?? 0
    const ventas = ventasPorFecha[f] ?? 0
    if (f <= corte) {
      mtdHl += hl
      mtdVentas += ventas
    }
    return {
      fecha: f,
      hl_rechazados: Math.round(hl * 100) / 100,
      hl_vendidos: Math.round(ventas * 100) / 100,
      tasa_pct: ventas > 0 ? Math.round((hl / ventas) * 10000) / 100 : null,
    }
  })

  const top = (m: Map<string, { hl: number; monto: number }>) =>
    [...m.entries()]
      .sort((a, b) => b[1].hl - a[1].hl)
      .slice(0, MAX_TOPS)
      .map(([nombre, v]) => ({
        nombre,
        hl: Math.round(v.hl * 100) / 100,
        monto: Math.round(v.monto),
      }))

  return {
    meta_pct: META_RECHAZOS_PCT,
    mtd_pct: mtdVentas > 0 ? Math.round((mtdHl / mtdVentas) * 10000) / 100 : null,
    mtd_hl_rechazados: Math.round(mtdHl * 100) / 100,
    mtd_hl_vendidos: Math.round(mtdVentas * 100) / 100,
    serie,
    top_motivos: top(motivos),
    top_clientes: top(clientes),
  }
}

/** Último snapshot de frescura entre las reuniones dadas (más reciente primero). */
async function bloqueFrescura(supabase: Supa, reuniones: Array<{ id: string; fecha: string }>) {
  if (reuniones.length === 0) return null
  const { data: snaps } = await supabase
    .from("reunion_frescura_snapshots")
    .select("*")
    .in("reunion_id", reuniones.map((r) => r.id))
  const porReunion = new Map((snaps ?? []).map((s) => [(s as { reunion_id: string }).reunion_id, s]))
  const reu = reuniones.find((r) => porReunion.has(r.id))
  if (!reu) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = porReunion.get(reu.id) as any
  const { data: items } = await supabase
    .from("reunion_frescura_items")
    .select("nro_articulo, descripcion, vence, bultos, valorizado")
    .eq("snapshot_id", s.id)
    .order("vence", { ascending: true })
    .limit(MAX_ITEMS_SNAPSHOT)
  return {
    reunion_fecha: reu.fecha,
    desde: s.desde ?? null,
    hasta: s.hasta ?? null,
    total_lineas: s.total_lineas ?? 0,
    total_bultos: num(s.total_bultos),
    total_valorizado: num(s.total_valorizado),
    accion_tomada: s.accion_tomada ?? null,
    updated_at: s.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: ((items ?? []) as any[]).map((it) => ({
      nro_articulo: it.nro_articulo ?? null,
      descripcion: it.descripcion ?? null,
      vence: it.vence ?? null,
      bultos: num(it.bultos),
      valorizado: num(it.valorizado),
    })),
  }
}

/** Último snapshot de sobrestock entre las reuniones dadas. */
async function bloqueSobrestock(supabase: Supa, reuniones: Array<{ id: string; fecha: string }>) {
  if (reuniones.length === 0) return null
  const { data: snaps } = await supabase
    .from("reunion_sobrestock_snapshots")
    .select("*")
    .in("reunion_id", reuniones.map((r) => r.id))
  const porReunion = new Map((snaps ?? []).map((s) => [(s as { reunion_id: string }).reunion_id, s]))
  const reu = reuniones.find((r) => porReunion.has(r.id))
  if (!reu) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = porReunion.get(reu.id) as any
  const { data: items } = await supabase
    .from("reunion_sobrestock_items")
    .select("nro_articulo, descripcion, bultos, dias_cobertura, vpd, valorizado")
    .eq("snapshot_id", s.id)
    .order("valorizado", { ascending: false })
    .limit(MAX_ITEMS_SNAPSHOT)
  return {
    reunion_fecha: reu.fecha,
    dias_cobertura_umbral: s.dias_cobertura_umbral ?? null,
    total_lineas: s.total_lineas ?? 0,
    total_bultos: num(s.total_bultos),
    total_valorizado: num(s.total_valorizado),
    updated_at: s.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: ((items ?? []) as any[]).map((it) => ({
      nro_articulo: it.nro_articulo ?? null,
      descripcion: it.descripcion ?? null,
      bultos: num(it.bultos),
      dias_cobertura: it.dias_cobertura == null ? null : num(it.dias_cobertura),
      valorizado: num(it.valorizado),
    })),
  }
}

/** Fotos NPS/RMD de la última reunión que tenga cada sección (signed URLs 1h). */
async function bloqueFotos(supabase: Supa, reuniones: Array<{ id: string; fecha: string }>) {
  if (reuniones.length === 0) return { nps: [], rmd: [] }
  const { data } = await supabase
    .from("reunion_seccion_fotos")
    .select("reunion_id, seccion, descripcion, foto_nombre, foto_path, created_at")
    .in("reunion_id", reuniones.map((r) => r.id))
    .in("seccion", ["nps", "rmd"])
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const fechaPorReunion = new Map(reuniones.map((r) => [r.id, r.fecha]))

  const out: Record<string, { reunion_fecha: string | null; fotos: Array<Record<string, unknown>> }> = {
    nps: { reunion_fecha: null, fotos: [] },
    rmd: { reunion_fecha: null, fotos: [] },
  }
  for (const seccion of ["nps", "rmd"] as const) {
    const deSeccion = rows.filter((r) => r.seccion === seccion)
    const reu = reuniones.find((r) => deSeccion.some((f) => f.reunion_id === r.id))
    if (!reu) continue
    const fotos = deSeccion.filter((f) => f.reunion_id === reu.id)
    const conUrl = []
    for (const f of fotos) {
      const { data: signed } = await supabase.storage
        .from("reuniones")
        .createSignedUrl(String(f.foto_path), 3600)
      conUrl.push({
        url: signed?.signedUrl ?? null,
        descripcion: f.descripcion ?? null,
        foto_nombre: f.foto_nombre ?? null,
        created_at: f.created_at,
      })
    }
    out[seccion] = { reunion_fecha: fechaPorReunion.get(reu.id) ?? null, fotos: conUrl }
  }
  return out
}

export async function GET(request: NextRequest) {
  if (IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }

  const expected = process.env.DPO_REUNION_READ_TOKEN
  const auth = request.headers.get("authorization")
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const hoy = hoyARG()
  const sp = request.nextUrl.searchParams
  const anio = Number(sp.get("anio")) || Number(hoy.slice(0, 4))
  const mes = Number(sp.get("mes")) || Number(hoy.slice(5, 7))
  if (mes < 1 || mes > 12 || anio < 2020 || anio > 2100) {
    return NextResponse.json({ error: "mes/anio inválidos" }, { status: 400 })
  }
  const mm = String(mes).padStart(2, "0")
  const desde = `${anio}-${mm}-01`
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const hasta = `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}`
  // Corte MTD: hoy si es el mes en curso; el mes entero si es un mes cerrado.
  const corte = hoy >= desde && hoy <= hasta ? hoy : hasta

  const supabase = getServiceClient()

  try {
    const reuniones = await ultimasReuniones(supabase)
    const [rechazos, frescura, sobrestock, fotos] = await Promise.all([
      bloqueRechazos(supabase, desde, hasta, corte),
      bloqueFrescura(supabase, reuniones),
      bloqueSobrestock(supabase, reuniones),
      bloqueFotos(supabase, reuniones),
    ])

    return NextResponse.json({
      fuente: "dpo-app Pampeana — reunión Logística-Ventas",
      anio,
      mes,
      generado_en: new Date().toISOString(),
      rechazos,
      frescura,
      sobrestock,
      fotos,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando el resumen" },
      { status: 500 },
    )
  }
}
