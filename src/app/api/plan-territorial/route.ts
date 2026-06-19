import { NextResponse, type NextRequest } from "next/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Plan Territorial (DPO Planeamiento 5.1). Re-zonifica una localidad en
// sub-rutas geográficas y sugiere días de visita balanceando la carga, para
// reducir viajes y mejorar el llenado del camión (baja el VLC/HL).

interface Cli {
  id_cliente: number
  razon_social: string | null
  des_localidad: string | null
  lat: number
  lng: number
  bultos: number
  hl: number
  dias_venta: number
}

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const COLORES = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]

// K-means simple y determinístico sobre (lat,lng).
function kmeans(pts: Cli[], k: number, iters = 30) {
  const n = pts.length
  if (n === 0) return []
  k = Math.max(1, Math.min(k, n))
  // Init determinístico: ordenar por longitud y tomar centroides equiespaciados.
  const sorted = [...pts].sort((a, b) => a.lng - b.lng)
  let cent = Array.from({ length: k }, (_, i) => {
    const p = sorted[Math.floor(((i + 0.5) * n) / k)]
    return { lat: p.lat, lng: p.lng }
  })
  const asign = new Array(n).fill(0)
  for (let it = 0; it < iters; it++) {
    let cambio = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dLat = pts[i].lat - cent[c].lat
        const dLng = pts[i].lng - cent[c].lng
        const d = dLat * dLat + dLng * dLng
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (asign[i] !== best) {
        asign[i] = best
        cambio = true
      }
    }
    const acc = Array.from({ length: k }, () => ({ lat: 0, lng: 0, n: 0 }))
    for (let i = 0; i < n; i++) {
      const a = acc[asign[i]]
      a.lat += pts[i].lat
      a.lng += pts[i].lng
      a.n += 1
    }
    cent = acc.map((a, c) => (a.n > 0 ? { lat: a.lat / a.n, lng: a.lng / a.n } : cent[c]))
    if (!cambio && it > 0) break
  }
  return asign
}

export async function GET(req: NextRequest) {
  if (!IS_MISIONES)
    return NextResponse.json({ ok: false, error: "No disponible en este tenant" }, { status: 404 })
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const localidad = (sp.get("localidad") || "MONTECARLO").trim()
  const nRutas = Math.min(6, Math.max(1, Number(sp.get("rutas") || "4")))
  const viajesHoy = Math.min(31, Math.max(1, Number(sp.get("viajesHoy") || "22"))) // visitas/mes actuales (estimado)
  const mesesPeriodo = 3 // feb–abr

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("plan_territorial_zona_misiones", {
      p_localidad: localidad,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const cli = ((data ?? []) as Cli[]).filter(
      (c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)),
    )
    if (cli.length === 0)
      return NextResponse.json({ ok: false, error: "Sin clientes con ubicación en la zona" }, { status: 404 })

    const asign = kmeans(cli, nRutas)

    // Agregados por ruta.
    const rutasMap = new Map<
      number,
      { clientes: number; bultos: number; hl: number; freqSum: number; lat: number; lng: number }
    >()
    cli.forEach((c, i) => {
      const r = asign[i]
      const o = rutasMap.get(r) ?? { clientes: 0, bultos: 0, hl: 0, freqSum: 0, lat: 0, lng: 0 }
      o.clientes += 1
      o.bultos += Number(c.bultos)
      o.hl += Number(c.hl)
      o.freqSum += Number(c.dias_venta)
      o.lat += Number(c.lat)
      o.lng += Number(c.lng)
      rutasMap.set(r, o)
    })

    // Nombre por posición geográfica (oeste→este) + día de visita balanceado.
    const rutasArr = [...rutasMap.entries()]
      .map(([id, o]) => ({
        id,
        clientes: o.clientes,
        bultos: Math.round(o.bultos),
        hl: Math.round(o.hl),
        freqProm: Number((o.freqSum / o.clientes / mesesPeriodo / 4.33).toFixed(2)), // visitas/semana prom
        cenLat: o.lat / o.clientes,
        cenLng: o.lng / o.clientes,
      }))
      .sort((a, b) => a.cenLng - b.cenLng)

    const sufijo =
      rutasArr.length === 2
        ? ["Oeste", "Este"]
        : rutasArr.length === 3
          ? ["Oeste", "Centro", "Este"]
          : rutasArr.map((_, i) => `Zona ${i + 1}`)

    // Asignar días: repartir las rutas a lo largo de los días de reparto.
    const paso = Math.max(1, Math.floor(DIAS.length / rutasArr.length))
    const rutas = rutasArr.map((r, i) => ({
      ...r,
      nombre: `Ruta ${String.fromCharCode(65 + i)} · Montecarlo ${sufijo[i] ?? i + 1}`.replace(
        "Montecarlo",
        localidad.split(" ").slice(-1)[0],
      ),
      dia: DIAS[Math.min(DIAS.length - 1, i * paso)],
      color: COLORES[i % COLORES.length],
    }))
    const idToRuta = new Map(rutas.map((r, i) => [rutasArr[i].id, i]))

    const puntos = cli.map((c, i) => ({
      id: c.id_cliente,
      nombre: c.razon_social,
      lat: Number(c.lat),
      lng: Number(c.lng),
      bultos: Math.round(Number(c.bultos)),
      freq: c.dias_venta,
      ruta: idToRuta.get(asign[i]) ?? 0,
    }))

    const totBultos = rutas.reduce((a, r) => a + r.bultos, 0)
    const totHl = rutas.reduce((a, r) => a + r.hl, 0)
    const bultosMes = totBultos / mesesPeriodo
    const viajesPlan = Math.round(rutas.length * 4.33) // 1 visita/sem por ruta
    const antesDespues = {
      viajes_hoy_mes: viajesHoy,
      viajes_plan_mes: viajesPlan,
      viajes_evitados_mes: Math.max(0, viajesHoy - viajesPlan),
      carga_hoy: Math.round(bultosMes / viajesHoy),
      carga_plan: Math.round(bultosMes / viajesPlan),
      bultos_mes: Math.round(bultosMes),
    }

    return NextResponse.json({
      ok: true,
      localidad,
      params: { rutas: nRutas, viajesHoy },
      totales: { clientes: cli.length, bultos: totBultos, hl: totHl },
      rutas,
      puntos,
      antesDespues,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error)?.message || e) },
      { status: 502 },
    )
  }
}
