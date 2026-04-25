"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import "./dashboard.css"
import type { Snapshot, RechazoVisita } from "@/lib/foxtrot-snapshot/types"

const REFRESH_MS = 60_000
const DC_COLORS: Record<string, string> = {
  iguazu: "#2dd4bf",
  eldorado: "#f59e0b",
  ramallo: "#3b82f6",
  pergamino: "#8b5cf6",
}

type RangeKey = "today" | "yesterday" | "week" | "month" | "custom"

interface Props {
  isAdmin: boolean
}

export function FoxtrotTrackingClient({ isAdmin: _isAdmin }: Props) {
  const [zona, setZona] = useState("all")
  const [range, setRange] = useState<RangeKey>("today")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [data, setData] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rutaFilter, setRutaFilter] = useState<string | null>(null)
  const [rechMotivo, setRechMotivo] = useState("")
  const [rechChofer, setRechChofer] = useState("")
  const [genAt, setGenAt] = useState<string>("")
  const [openRech, setOpenRech] = useState<Record<number, boolean>>({})

  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapObj = useRef<unknown>(null)
  const layerGroup = useRef<unknown>(null)
  const truckLayer = useRef<unknown>(null)
  const markerIndex = useRef<MarkerEntry[]>([])
  const Lref = useRef<typeof import("leaflet") | null>(null)

  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const chartObjs = useRef<Record<string, unknown>>({})
  const echartsRef = useRef<typeof import("echarts") | null>(null)

  const customerCache = useRef<Map<string, { lat: number; lng: number; name: string } | null>>(
    new Map(),
  )

  // Init map (client-only)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      Lref.current = L
      if (cancelled || !mapRef.current || mapObj.current) return
      const m = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView(
        [-25.5, -54.5],
        8,
      )
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(m)
      const lg = L.layerGroup().addTo(m)
      m.createPane("trucks")
      const tl = L.layerGroup().addTo(m)
      const updateZ = () => {
        const pane = m.getPane("trucks")
        if (pane) pane.style.zIndex = m.getZoom() >= 14 ? "350" : "650"
      }
      m.on("zoomend", updateZ)
      updateZ()
      mapObj.current = m
      layerGroup.current = lg
      truckLayer.current = tl
    })()
    return () => {
      cancelled = true
      const m = mapObj.current as { remove?: () => void } | null
      if (m?.remove) m.remove()
      mapObj.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Init ECharts
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ec = await import("echarts")
      if (cancelled) return
      echartsRef.current = ec
    })()
    return () => {
      cancelled = true
      const objs = chartObjs.current
      for (const k of Object.keys(objs)) {
        const c = objs[k] as { dispose?: () => void }
        c?.dispose?.()
        delete objs[k]
      }
    }
  }, [])

  const fetchSnapshot = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/foxtrot/snapshot?zona=${zona}&range=${range}`
      if (range === "custom") {
        if (!from || !to) {
          setError("Seleccioná fechas y presioná Aplicar")
          setLoading(false)
          return
        }
        url += `&from_date=${from}&to_date=${to}`
      }
      const r = await fetch(url, { cache: "no-store" })
      if (!r.ok) throw new Error(`API ${r.status}`)
      const d = (await r.json()) as Snapshot
      setData(d)
      setGenAt(new Date(d.generated_at).toLocaleTimeString("es-AR"))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [zona, range, from, to])

  useEffect(() => {
    fetchSnapshot()
    const id = setInterval(fetchSnapshot, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchSnapshot])

  // Render map points
  useEffect(() => {
    if (!data || !mapObj.current || !layerGroup.current || !truckLayer.current || !Lref.current)
      return
    const L = Lref.current
    const lg = layerGroup.current as ReturnType<typeof L.layerGroup>
    const tl = truckLayer.current as ReturnType<typeof L.layerGroup>
    lg.clearLayers()
    tl.clearLayers()
    markerIndex.current = []

    let pointsByRuta = data.map_points
    if (rutaFilter) pointsByRuta = pointsByRuta.filter((p) => p.ruta === rutaFilter)

    const byCust = new Map<string, ConsolidatedWaypoint>()
    for (const p of pointsByRuta) {
      for (const w of p.waypoints) {
        if (!w.customer_id) continue
        const key = `${p.dc}/${w.customer_id}`
        let agg = byCust.get(key)
        if (!agg) {
          agg = {
            customer_id: w.customer_id,
            dc: p.dc,
            bultos_ok: 0,
            bultos_rech: 0,
            visitas: 0,
            rech_visits: 0,
            rutas: new Set(),
            choferes: new Set(),
            completed_ts: null,
            svc_ana_sum: 0,
            svc_ana_count: 0,
            svc_ts_sum: 0,
            svc_ts_count: 0,
            motivos_bultos: {},
          }
          byCust.set(key, agg)
        }
        agg.bultos_ok += w.bultos_ok || 0
        agg.bultos_rech += w.bultos_rech || 0
        agg.visitas += 1
        if ((w.bultos_rech || 0) > 0) agg.rech_visits += 1
        agg.rutas.add(p.ruta)
        agg.choferes.add(p.chofer)
        agg.svc_ana_sum += w.svc_ana_sum || 0
        agg.svc_ana_count += w.svc_ana_count || 0
        agg.svc_ts_sum += w.svc_ts_sum || 0
        agg.svc_ts_count += w.svc_ts_count || 0
        if (w.completed_ts && (!agg.completed_ts || w.completed_ts > agg.completed_ts))
          agg.completed_ts = w.completed_ts
        for (const [m, b] of Object.entries(w.motivos_bultos || {})) {
          agg.motivos_bultos[m] = (agg.motivos_bultos[m] ?? 0) + b
        }
      }
    }

    const consolidated = Array.from(byCust.values())
    const maxBultos = Math.max(1, ...consolidated.map((w) => w.bultos_ok + w.bultos_rech))
    const radiusFor = (total: number) => {
      if (!total) return 5
      return 5 + Math.min(14, Math.sqrt(total / maxBultos) * 14)
    }

    let cancelled = false
    const bounds: [number, number][] = []

    ;(async () => {
      for (const w of consolidated.slice(0, 1000)) {
        if (cancelled) return
        const cacheKey = `${w.dc}/${w.customer_id}`
        let geo = customerCache.current.get(cacheKey)
        if (geo === undefined) {
          try {
            const r = await fetch(`/api/foxtrot/customer/${w.dc}/${w.customer_id}`, {
              cache: "force-cache",
            })
            const j = (await r.json()) as {
              location: { latitude: number; longitude: number } | null
              name: string | null
            }
            geo = j.location ? { lat: j.location.latitude, lng: j.location.longitude, name: j.name ?? "" } : null
            customerCache.current.set(cacheKey, geo)
          } catch {
            geo = null
            customerCache.current.set(cacheKey, null)
          }
        }
        if (!geo) continue
        if (cancelled) return
        const totalBultos = w.bultos_ok + w.bultos_rech
        const hasRech = w.bultos_rech > 0
        const pending = !w.completed_ts
        const fillColor = pending ? "#64748b" : hasRech ? "#ef4444" : "#22c55e"
        const strokeColor = pending ? "#cbd5e1" : hasRech ? "#fca5a5" : "#86efac"

        const useAna = w.svc_ana_count > 0
        const svcAvgMin = useAna
          ? w.svc_ana_sum / w.svc_ana_count / 60
          : w.svc_ts_count > 0
            ? w.svc_ts_sum / w.svc_ts_count / 60
            : null
        const mbEntries = Object.entries(w.motivos_bultos)
        const motivoTop = mbEntries.length
          ? mbEntries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
          : null
        const visitTime = w.completed_ts
          ? new Date(w.completed_ts).toLocaleString("es-AR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"
        const statusLabel = pending
          ? `<b style="color:#64748b">PENDIENTE</b>`
          : hasRech
            ? `<b style="color:#b91c1c">${motivoTop ?? "CON RECHAZO"}</b>`
            : `<b style="color:#15803d">COMPLETADO</b>`
        let svcLine = ""
        if (svcAvgMin != null) {
          const isReal = useAna
          const badgeColor = isReal ? "#15803d" : "#b45309"
          const badgeText = isReal ? "real" : "estimado"
          svcLine = `<div>Tiempo en PDV: <b>${svcAvgMin.toFixed(
            1,
          )} min</b> <span style="display:inline-block;padding:0 5px;border-radius:3px;background:${badgeColor};color:white;font-size:10px;font-weight:600;text-transform:uppercase">${badgeText}</span></div>`
        }
        const multiVisit = w.visitas > 1
        const middle = multiVisit
          ? `<div>Visitas en período: <b>${w.visitas}</b>${
              w.rech_visits ? ` · <span style="color:#b91c1c">${w.rech_visits} con rechazo</span>` : ""
            }</div><div>Última visita: <b>${visitTime}</b></div>${svcLine}`
          : `<div>Horario visita: <b>${visitTime}</b></div><div>Estado: ${statusLabel}</div>${svcLine}`

        const ruta = w.rutas.size === 1 ? Array.from(w.rutas)[0] : `${w.rutas.size} rutas`
        const chofer =
          w.choferes.size === 1 ? Array.from(w.choferes)[0] : `${w.choferes.size} choferes`

        const marker = L.circleMarker([geo.lat, geo.lng], {
          radius: radiusFor(totalBultos),
          fillColor,
          color: strokeColor,
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.8,
        }).bindPopup(`
          <b>${escapeHtml(geo.name) || w.customer_id}</b><br>
          <div style="margin:6px 0;padding:4px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">
            ${middle}
          </div>
          <div>Bultos entregados: <b style="color:#15803d">${fmtN(w.bultos_ok)}</b></div>
          ${hasRech ? `<div>Bultos rechazados: <b style="color:#b91c1c">${fmtN(w.bultos_rech)}</b></div>` : ""}
          <div>Total: <b>${fmtN(totalBultos)}</b></div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid #eee">
            ${multiVisit ? ruta : `Ruta <b>${ruta}</b>`} · ${escapeHtml(chofer)}
          </div>
        `)
        lg.addLayer(marker)
        bounds.push([geo.lat, geo.lng])
        markerIndex.current.push({
          id: w.customer_id,
          name: geo.name,
          lat: geo.lat,
          lng: geo.lng,
          ruta,
          chofer,
          marker,
        })
      }
      if (!cancelled && bounds.length && mapObj.current) {
        ;(mapObj.current as { fitBounds: (b: [number, number][], opts?: unknown) => void }).fitBounds(
          bounds,
          { padding: [30, 30] },
        )
      }
    })()

    let trucks = data.live_trucks
    if (rutaFilter) trucks = trucks.filter((t) => t.ruta === rutaFilter)
    for (const t of trucks) {
      if (t.lat == null || t.lng == null) continue
      const when = t.ts_ms
        ? new Date(t.ts_ms).toLocaleString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—"
      const label = t.stale
        ? `<span style="color:#b45309;font-weight:600">Última posición</span>`
        : `<span style="color:#15803d;font-weight:600">En vivo</span>`
      const html = `<svg viewBox="0 0 32 32" width="25" height="25" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="9.5" width="17" height="13" rx="1.5" fill="#e879f9" stroke="#fff" stroke-width="1.5"/>
        <path d="M18.5 13.5 L23 13.5 L29.5 18 L29.5 22.5 L18.5 22.5 Z" fill="#e879f9" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="20" y="14.5" width="4.5" height="3" fill="#0b1020" rx=".5"/>
        <circle cx="7" cy="25" r="2.8" fill="#0b1020" stroke="#fff" stroke-width="1.2"/>
        <circle cx="24" cy="25" r="2.8" fill="#0b1020" stroke="#fff" stroke-width="1.2"/>
        <circle cx="7" cy="25" r=".8" fill="#fff"/>
        <circle cx="24" cy="25" r=".8" fill="#fff"/>
      </svg>`
      const icon = L.divIcon({
        html,
        className: "truck-icon" + (t.stale ? " stale" : ""),
        iconSize: [25, 25],
        iconAnchor: [12, 12],
        popupAnchor: [0, -13],
      })
      const marker = L.marker([t.lat, t.lng], { icon, pane: "trucks" }).bindPopup(`
        <b>Camión ${t.ruta}</b><br>
        <div style="margin:4px 0 0">${escapeHtml(t.chofer)}</div>
        <div style="margin-top:6px;padding-top:4px;border-top:1px solid #eee">
          ${label} · ${when}
        </div>
      `)
      tl.addLayer(marker)
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rutaFilter])

  // Render charts
  useEffect(() => {
    if (!data || !echartsRef.current) return
    const ec = echartsRef.current

    const initChart = (id: string) => {
      const el = chartRefs.current[id]
      if (!el) return null
      let c = chartObjs.current[id] as ReturnType<typeof ec.init> | undefined
      if (!c) {
        c = ec.init(el, undefined, { renderer: "canvas" })
        chartObjs.current[id] = c
      }
      return c
    }
    const barChart = (
      id: string,
      list: { name: string; value: number }[],
      color: string,
      opts: { limit?: number; zeroColor?: string } = {},
    ) => {
      const c = initChart(id)
      if (!c) return
      const limit = opts.limit ?? 10
      const sliced = list.slice(0, limit)
      const seriesData = sliced.map((d) => {
        if (opts.zeroColor && d.value === 0) {
          return {
            value: d.value,
            itemStyle: { color: opts.zeroColor, borderRadius: [0, 3, 3, 0] },
          }
        }
        return { value: d.value, itemStyle: { color, borderRadius: [0, 3, 3, 0] } }
      })
      const h = Math.max(260, Math.min(600, sliced.length * 28 + 50))
      const el = chartRefs.current[id]
      if (el) el.style.height = `${h}px`
      c.resize()
      c.setOption(
        {
          grid: { top: 10, right: 40, bottom: 30, left: 140 },
          xAxis: {
            type: "value",
            axisLabel: { color: "#8892b8", fontSize: 10 },
            splitLine: { lineStyle: { color: "#2a3358" } },
          },
          yAxis: {
            type: "category",
            data: sliced.map((d) => d.name),
            axisLabel: {
              color: "#e6ebff",
              fontSize: 11,
              width: 130,
              overflow: "truncate",
            },
            inverse: true,
          },
          tooltip: {
            trigger: "axis",
            backgroundColor: "#151b33",
            borderColor: "#2a3358",
            textStyle: { color: "#e6ebff" },
          },
          series: [
            {
              type: "bar",
              data: seriesData,
              label: {
                show: true,
                position: "right",
                color: "#e6ebff",
                fontSize: 11,
                formatter: (p: { value: number }) =>
                  p.value === 0 && opts.zeroColor ? "✓ 0" : p.value,
              },
            },
          ],
        },
        true,
      )
    }

    barChart(
      "chart-motivo",
      data.rechazos_por_motivo.map((d) => ({ name: d.motivo, value: d.cantidad })),
      "#ef4444",
    )
    barChart(
      "chart-chofer",
      data.rechazos_por_chofer.map((d) => ({ name: d.chofer, value: d.cantidad })),
      "#f59e0b",
      { limit: 25, zeroColor: "#22c55e" },
    )
    barChart(
      "chart-sku",
      data.rechazos_por_sku.map((d) => ({ name: d.sku, value: d.bultos })),
      "#8b5cf6",
    )
    barChart(
      "chart-repases",
      (data.repases_por_chofer || []).map((d) => ({ name: d.chofer, value: d.cantidad })),
      "#f472b6",
      { limit: 25, zeroColor: "#22c55e" },
    )

    const histC = initChart("chart-hist")
    if (histC) {
      histC.setOption(
        {
          grid: { top: 10, right: 20, bottom: 30, left: 40 },
          xAxis: {
            type: "category",
            data: data.service_time_hist.labels,
            axisLabel: { color: "#8892b8", fontSize: 10 },
          },
          yAxis: {
            type: "value",
            axisLabel: { color: "#8892b8", fontSize: 10 },
            splitLine: { lineStyle: { color: "#2a3358" } },
          },
          tooltip: {
            trigger: "axis",
            backgroundColor: "#151b33",
            borderColor: "#2a3358",
            textStyle: { color: "#e6ebff" },
          },
          series: [
            {
              type: "bar",
              data: data.service_time_hist.values,
              itemStyle: { color: "#2dd4bf", borderRadius: [3, 3, 0, 0] },
            },
          ],
        },
        true,
      )
    }

    const fr = data.rechazos_franja_horaria
    const franjaC = initChart("chart-franja")
    if (franjaC && fr) {
      const palette = ["#ef4444", "#f59e0b", "#8b5cf6", "#2dd4bf", "#3b82f6", "#64748b"]
      const series = fr.series.map((s, i) => ({
        name: s.motivo,
        type: "bar",
        stack: "total",
        emphasis: { focus: "series" },
        itemStyle: {
          color: palette[i % palette.length],
          borderRadius: i === fr.series.length - 1 ? [3, 3, 0, 0] : 0,
        },
        data: s.values,
      }))
      const el = chartRefs.current["chart-franja"]
      if (el) el.style.height = "320px"
      franjaC.resize()
      franjaC.setOption(
        {
          grid: { top: 40, right: 20, bottom: 60, left: 50 },
          legend: {
            bottom: 0,
            textStyle: { color: "#e6ebff", fontSize: 11 },
            itemWidth: 12,
            itemHeight: 10,
          },
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            backgroundColor: "#151b33",
            borderColor: "#2a3358",
            textStyle: { color: "#e6ebff" },
            formatter: (params: { dataIndex: number; marker: string; seriesName: string; value: number }[]) => {
              if (!params.length) return ""
              const idx = params[0].dataIndex
              const lbl = fr.labels[idx]
              const cli = fr.clientes_distintos[idx] || 0
              const tot = fr.bultos_total[idx] || 0
              const rows = params
                .filter((p) => p.value > 0)
                .map(
                  (p) =>
                    `<div style="display:flex;justify-content:space-between;gap:14px"><span>${p.marker}${p.seriesName}</span><b>${p.value}</b></div>`,
                )
                .join("")
              return `<div style="font-size:12px"><div style="font-weight:600;margin-bottom:4px">${lbl} hs · ${tot} bultos · ${cli} cliente${cli === 1 ? "" : "s"}</div>${rows || '<div style="color:#8892b8">sin rechazos</div>'}</div>`
            },
          },
          xAxis: {
            type: "category",
            data: fr.labels,
            axisLabel: { color: "#8892b8", fontSize: 10 },
          },
          yAxis: {
            type: "value",
            name: "Bultos",
            nameTextStyle: { color: "#8892b8", fontSize: 10 },
            axisLabel: { color: "#8892b8", fontSize: 10 },
            splitLine: { lineStyle: { color: "#2a3358" } },
          },
          series,
        },
        true,
      )
    }

    const onResize = () => {
      for (const c of Object.values(chartObjs.current)) {
        ;(c as { resize: () => void }).resize()
      }
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [data])

  // Filtered rechazos
  const filteredRechazos: RechazoVisita[] = useMemo(() => {
    if (!data) return []
    return data.rechazos_detalle.filter((r) => {
      if (rechMotivo && !r.motivos.includes(rechMotivo)) return false
      if (rechChofer && r.chofer !== rechChofer) return false
      return true
    })
  }, [data, rechMotivo, rechChofer])

  const motivosOptions = useMemo(() => {
    if (!data) return [] as string[]
    const s = new Set<string>()
    for (const r of data.rechazos_detalle) for (const m of r.motivos) if (m) s.add(m)
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"))
  }, [data])

  const choferesOptions = useMemo(() => {
    if (!data) return [] as string[]
    const s = new Set<string>()
    for (const r of data.rechazos_detalle) if (r.chofer) s.add(r.chofer)
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"))
  }, [data])

  const uniqueClientes = useMemo(() => {
    const s = new Set<string>()
    for (const r of filteredRechazos) {
      const k = r.cliente_id ?? r.cliente_nombre
      if (k) s.add(k)
    }
    return s.size
  }, [filteredRechazos])
  const totalBultosRech = useMemo(
    () => filteredRechazos.reduce((a, r) => a + (r.bultos || 0), 0),
    [filteredRechazos],
  )

  const k = data?.kpis

  const sortedRoutes = useMemo(() => {
    if (!data) return []
    return [...data.routes].sort(
      (a, b) =>
        (b.fecha || "").localeCompare(a.fecha || "") || a.ruta.localeCompare(b.ruta),
    )
  }, [data])

  const onRowClick = (rt: string) => {
    setRutaFilter((prev) => (prev === rt ? null : rt))
  }
  const clearRuta = () => setRutaFilter(null)

  const flyTo = (entry: MarkerEntry) => {
    const m = mapObj.current as { flyTo?: (ll: [number, number], z: number, opts?: unknown) => void } | null
    if (!m?.flyTo) return
    m.flyTo([entry.lat, entry.lng], 16, { duration: 0.8 })
    setTimeout(() => entry.marker.openPopup(), 600)
  }

  const [searchQ, setSearchQ] = useState("")
  const searchMatches = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (q.length < 2) return [] as MarkerEntry[]
    return markerIndex.current
      .filter(
        (mk) =>
          (mk.name && mk.name.toLowerCase().includes(q)) ||
          (mk.id && mk.id.toLowerCase().includes(q)),
      )
      .slice(0, 12)
  }, [searchQ, data])

  return (
    <div className="fx-board relative">
      <div className={`loading${loading ? " on" : ""}`} />
      <header>
        <h1>
          Tablero de Entrega <span className="sub">— Distribución</span>
        </h1>
        <div className="spacer" />

        <div className="fx-pill-group">
          {(["all", "Norte", "Central", "Este"] as const).map((z) => (
            <button
              key={z}
              className={`fx-pill${zona === z ? " active" : ""}`}
              onClick={() => setZona(z)}
            >
              {z === "all" ? "Todas" : z}
            </button>
          ))}
        </div>

        <div className="fx-pill-group">
          {(["today", "yesterday", "week", "month", "custom"] as RangeKey[]).map((r) => (
            <button
              key={r}
              className={`fx-pill${range === r ? " active" : ""}`}
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>

        <div className={`date-range${range === "custom" ? " on" : ""}`}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="arrow">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button onClick={fetchSnapshot}>Aplicar</button>
        </div>

        <button className="refresh" onClick={fetchSnapshot} title="Refrescar">
          ⟳ Refrescar
        </button>
        <div id="gen">
          {error ? `⚠ ${error}` : genAt ? `Actualizado ${genAt}` : ""}
        </div>
      </header>

      <main>
        {data?.km_status === "pending" && (
          <div className="banner">
            ⏳ Analytics de km recorridos se está generando (~1-2 min). Se actualiza en el próximo
            refresco.
          </div>
        )}

        <div className="kpis">
          {k && (
            <>
              <Kpi label="Rutas" value={fmtN(k.total_rutas)} sub={`${fmtN(k.finalized)} fin. · ${fmtN(k.active)} activas`} />
              <Kpi
                label="PDVs visitados"
                value={`${fmtN(k.pdvs_completed)}/${fmtN(k.pdvs_total)}`}
                sub={`${k.pdvs_pct}% cumplimiento`}
                tone={k.pdvs_pct > 95 ? "ok" : k.pdvs_pct < 80 ? "danger" : null}
              />
              <Kpi label="Bultos entregados" value={fmtN(k.bultos_entregados)} sub={`${fmtN(k.bultos_rechazados)} rechazados`} tone="ok" />
              <Kpi
                label="% Rechazo"
                value={`${k.pct_rechazo}%`}
                sub={`${fmtN(k.rechazos_count)} casos`}
                tone={k.pct_rechazo > 5 ? "danger" : k.pct_rechazo > 2 ? "warn" : "ok"}
              />
              <KmKpi kpis={k} />
              <Kpi
                label="Tiempo/PDV prom"
                value={
                  <>
                    {k.avg_service_min}
                    <span style={{ fontSize: 14, color: "var(--muted)" }}> min</span>
                  </>
                }
                sub={k.km_status === "ready" ? "tiempo real en parada" : "estimado (timestamps)"}
              />
              <Kpi
                label="Duración ruta prom"
                value={`${Math.floor(k.avg_ruta_min / 60)}h ${k.avg_ruta_min % 60}m`}
                sub="start → finalize"
              />
            </>
          )}
        </div>

        <div className="grid-main">
          <div className="panel">
            <h3>
              Mapa de PDVs
              <span className={`filter-chip${rutaFilter ? " on" : ""}`}>
                Ruta: <b>{rutaFilter ?? ""}</b>
                <span className="chip-x" onClick={clearRuta} title="Quitar filtro">
                  ×
                </span>
              </span>
              <div className={`map-search${searchQ ? " has-value" : ""}`}>
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre o código..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onBlur={() => setTimeout(() => setSearchQ((q) => q), 200)}
                />
                <button onClick={() => setSearchQ("")}>×</button>
                <div className={`${searchMatches.length > 0 || searchQ.length >= 2 ? "on" : ""}`}
                  id="map-search-results"
                  style={{ display: searchQ.length >= 2 ? "block" : "none" }}
                >
                  {searchMatches.length === 0 ? (
                    <div className="search-empty">Sin resultados para &quot;{searchQ}&quot;</div>
                  ) : (
                    searchMatches.map((m, i) => (
                      <div
                        key={m.id + i}
                        className="search-item"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          flyTo(m)
                          setSearchQ("")
                        }}
                      >
                        <div className="s-name" dangerouslySetInnerHTML={{ __html: highlight(m.name || "(sin nombre)", searchQ) }} />
                        <div
                          className="s-meta"
                          dangerouslySetInnerHTML={{
                            __html: `${highlight(m.id, searchQ)} · ${escapeHtml(m.ruta)} · ${escapeHtml(m.chofer)}`,
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </h3>
            <div ref={mapRef} id="fx-map" />
          </div>
          <div className="panel">
            <h3>
              Rutas <span className="count">{sortedRoutes.length}</span>
            </h3>
            <div className="routes-wrap">
              <table id="routes-table">
                <thead>
                  <tr>
                    <th>DC</th>
                    <th>Ruta</th>
                    <th>Chofer</th>
                    <th>PDVs</th>
                    <th>Cumpl.</th>
                    <th>Bultos</th>
                    <th>Rech.</th>
                    <th>Km</th>
                    <th>Dur.</th>
                    <th>T/PDV</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoutes.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty">
                        Sin rutas para este rango
                      </td>
                    </tr>
                  ) : (
                    sortedRoutes.map((r) => {
                      const pctColor =
                        r.cumplimiento_pct > 95
                          ? "var(--ok)"
                          : r.cumplimiento_pct < 80
                            ? "var(--danger)"
                            : "var(--accent)"
                      const kmCell = r.driven_m ? (r.driven_m / 1000).toFixed(1) + " km" : "—"
                      return (
                        <tr
                          key={r.ruta + r.fecha + r.dc}
                          className={rutaFilter === r.ruta ? "selected" : ""}
                          onClick={() => onRowClick(r.ruta)}
                        >
                          <td>
                            <span
                              className="dot"
                              style={{ background: DC_COLORS[r.dc] || "#888" }}
                            />
                            {r.dc.slice(0, 3)}
                          </td>
                          <td>
                            <b>{r.ruta}</b>
                            {r.recarga && (
                              <span className="badge reload" title={`Recarga: ${r.num_vueltas} vueltas (${r.ruta_raw.join(", ")})`}>
                                ↻{r.num_vueltas}
                              </span>
                            )}
                            <br />
                            <span style={{ color: "var(--muted)", fontSize: 10 }}>{r.fecha}</span>
                          </td>
                          <td>{r.chofer}</td>
                          <td>
                            {r.pdvs_done}/{r.pdvs_total}
                          </td>
                          <td>
                            <span className="progress">
                              <span
                                className="progress-bar"
                                style={{ width: `${r.cumplimiento_pct}%`, background: pctColor }}
                              />
                            </span>{" "}
                            <span style={{ fontSize: 11 }}>{r.cumplimiento_pct}%</span>
                          </td>
                          <td>{fmtN(r.bultos_ok)}</td>
                          <td style={{ color: r.bultos_rech ? "var(--danger)" : "inherit" }}>
                            {r.bultos_rech ? fmtN(r.bultos_rech) : ""}
                          </td>
                          <td style={{ color: "var(--muted)", fontSize: 11 }}>{kmCell}</td>
                          <td>{r.duracion_min ? `${Math.floor(r.duracion_min / 60)}h ${r.duracion_min % 60}m` : "—"}</td>
                          <td style={{ color: "var(--muted)", fontSize: 11 }}>
                            {r.avg_service_min != null ? `${r.avg_service_min} min` : "—"}
                            {r.service_source === "timestamps" && (
                              <span style={{ color: "var(--accent-2)" }}>*</span>
                            )}
                          </td>
                          <td>
                            {r.finalizada ? (
                              <span className="badge ok">finalizada</span>
                            ) : r.activa ? (
                              <span className="badge active">en curso</span>
                            ) : (
                              <span className="badge">planif.</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid-detail">
          <div className="panel">
            <h3>Bultos rech. por motivo</h3>
            <div className="chart" ref={(el) => { chartRefs.current["chart-motivo"] = el }} />
          </div>
          <div className="panel">
            <h3>Bultos rech. por chofer</h3>
            <div className="chart" ref={(el) => { chartRefs.current["chart-chofer"] = el }} />
          </div>
          <div className="panel">
            <h3>Bultos rech. por SKU</h3>
            <div className="chart" ref={(el) => { chartRefs.current["chart-sku"] = el }} />
          </div>
          <div className="panel">
            <h3>Tiempo por PDV</h3>
            <div className="chart" ref={(el) => { chartRefs.current["chart-hist"] = el }} />
          </div>
          <div className="panel">
            <h3>Repases por chofer</h3>
            <div className="chart" ref={(el) => { chartRefs.current["chart-repases"] = el }} />
          </div>
          <div className="panel" style={{ gridColumn: "1/-1" }}>
            <h3>
              Rechazos por franja horaria{" "}
              <span className="count">
                {fmtN((data?.rechazos_franja_horaria.bultos_total ?? []).reduce((a, b) => a + b, 0))} bultos con hora
              </span>
            </h3>
            <div className="chart" ref={(el) => { chartRefs.current["chart-franja"] = el }} />
          </div>
        </div>

        {data?.clientes_reiterantes && data.clientes_reiterantes.length > 0 && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h3>
              Clientes reiterantes{" "}
              <span className="sub-h3">≥2 días con rechazo en el período — comportamiento crónico</span>{" "}
              <span className="count">{data.clientes_reiterantes.length}</span>
            </h3>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>DC</th>
                    <th>Cliente</th>
                    <th>Días rech.</th>
                    <th>Vis. rech./tot.</th>
                    <th>% vis. rech.</th>
                    <th>Bultos rech./pedido</th>
                    <th>% vol. rech.</th>
                    <th>Motivos top</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clientes_reiterantes.slice(0, 200).map((c, i) => {
                    const pctVis = c.pct_rechazo_visitas
                    const pctVol = c.pct_rech_bultos ?? 0
                    return (
                      <tr key={i}>
                        <td>
                          <span className="dot" style={{ background: DC_COLORS[c.dc] || "#888" }} />
                          {c.dc.slice(0, 3)}
                        </td>
                        <td>
                          {c.cliente_nombre ? (
                            <>
                              <b>{c.cliente_nombre}</b>
                              <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted)" }}>
                                {c.cliente_id}
                              </div>
                            </>
                          ) : (
                            <span style={{ fontFamily: "monospace", fontSize: 11 }}>{c.cliente_id}</span>
                          )}
                        </td>
                        <td className="reit-dias">{c.dias_con_rechazo}</td>
                        <td>
                          {c.visitas_con_rechazo} / {c.visitas_totales}
                        </td>
                        <td>
                          <span className={`reit-pct ${pctClass(pctVis)}`}>{pctVis}%</span>
                        </td>
                        <td>
                          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                            {fmtN(c.bultos_rech)}
                          </span>{" "}
                          <span style={{ color: "var(--muted)" }}>
                            / {fmtN(c.bultos_pedidos ?? c.bultos_rech)}
                          </span>
                        </td>
                        <td>
                          <span className={`reit-pct ${pctClass(pctVol)}`}>{pctVol}%</span>
                        </td>
                        <td>
                          {(c.motivos_top || []).map((m, j) => (
                            <span key={j} className="motivos-chip">
                              {m}
                            </span>
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="panel" style={{ marginTop: 12 }}>
          <h3>
            Detalle de rechazos
            <span className="count">
              {uniqueClientes} cliente{uniqueClientes === 1 ? "" : "s"}
            </span>
            <span className="count">{fmtN(totalBultosRech)} bultos</span>
            <div className="rech-filters">
              <select
                className="rech-select"
                value={rechMotivo}
                onChange={(e) => setRechMotivo(e.target.value)}
              >
                <option value="">Todos los motivos</option>
                {motivosOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="rech-select"
                value={rechChofer}
                onChange={(e) => setRechChofer(e.target.value)}
              >
                <option value="">Todos los choferes</option>
                {choferesOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </h3>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="rech-table">
              <thead>
                <tr>
                  <th style={{ width: 26 }}></th>
                  <th>Fecha</th>
                  <th>Ruta</th>
                  <th>Chofer</th>
                  <th>Cliente</th>
                  <th>Hora visita</th>
                  <th>Bultos</th>
                  <th>Motivo(s)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRechazos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      Sin rechazos registrados
                    </td>
                  </tr>
                ) : (
                  filteredRechazos.slice(0, 300).flatMap((r, idx) => {
                    const tsMax = Math.max(0, ...(r.items || []).map((it) => it.ts_ms || 0))
                    const horaCell = tsMax
                      ? new Date(tsMax).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""
                    const open = !!openRech[idx]
                    return [
                      <tr
                        key={`p-${idx}`}
                        className={`parent${open ? " open" : ""}`}
                        onClick={() => setOpenRech((s) => ({ ...s, [idx]: !s[idx] }))}
                      >
                        <td>
                          <span className={`caret${open ? " open" : ""}`}>{open ? "▾" : "▸"}</span>
                        </td>
                        <td>{r.fecha}</td>
                        <td>
                          <b>{r.ruta}</b>
                        </td>
                        <td>{r.chofer}</td>
                        <td>
                          {r.cliente_nombre ? (
                            <>
                              <div>
                                <b>{r.cliente_nombre}</b>
                              </div>
                              <div
                                style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted)" }}
                              >
                                {r.cliente_id ?? ""}
                              </div>
                            </>
                          ) : (
                            <span style={{ fontFamily: "monospace", fontSize: 11 }}>{r.cliente_id ?? ""}</span>
                          )}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted)" }}>
                          {horaCell || "—"}
                        </td>
                        <td style={{ color: "var(--danger)", fontWeight: 600 }}>{fmtN(r.bultos)}</td>
                        <td>
                          {r.motivos.map((m, j) => (
                            <span key={j} className="motivos-chip">
                              {m}
                            </span>
                          ))}
                        </td>
                      </tr>,
                      open && (
                        <tr key={`c-${idx}`} className="rech-child">
                          <td colSpan={8}>
                            <div className="nested">
                              <table className="items">
                                <thead>
                                  <tr>
                                    <th>Producto</th>
                                    <th style={{ textAlign: "right" }}>Cant.</th>
                                    <th>Motivo</th>
                                    <th>Notas</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.items.map((it, j) => (
                                    <tr key={j}>
                                      <td style={{ color: "#e6ebff" }}>{it.producto}</td>
                                      <td style={{ textAlign: "right", color: "var(--accent-2)" }}>
                                        {fmtN(it.cantidad)}
                                      </td>
                                      <td style={{ color: "var(--muted)" }}>{it.motivo}</td>
                                      <td style={{ color: "#888", fontSize: 10 }}>{it.notas ?? ""}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ),
                    ]
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {data?.clientes_repases && data.clientes_repases.length > 0 && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h3>
              PDVs con repases reiterantes{" "}
              <span className="sub-h3">el mismo camión vuelve al PDV tras haber entregado</span>{" "}
              <span className="count">{data.clientes_repases.length}</span>
            </h3>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>DC</th>
                    <th>Cliente</th>
                    <th>Visitas</th>
                    <th>Repases</th>
                    <th>Camión(es)</th>
                    <th>Chofer(es)</th>
                    <th>Bultos entreg.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clientes_repases.slice(0, 200).map((c, i) => (
                    <tr key={i}>
                      <td>
                        <span className="dot" style={{ background: DC_COLORS[c.dc] || "#888" }} />
                        {c.dc.slice(0, 3)}
                      </td>
                      <td>
                        {c.cliente_nombre ? (
                          <>
                            <b>{c.cliente_nombre}</b>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted)" }}>
                              {c.cliente_id}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontFamily: "monospace", fontSize: 11 }}>{c.cliente_id}</span>
                        )}
                      </td>
                      <td>{c.visitas}</td>
                      <td className="reit-dias">{c.repases}</td>
                      <td>
                        {c.camiones.map((m, j) => (
                          <span key={j} className="motivos-chip">
                            {m}
                          </span>
                        ))}
                      </td>
                      <td>
                        {c.choferes.map((m, j) => (
                          <span key={j} className="motivos-chip">
                            {m}
                          </span>
                        ))}
                      </td>
                      <td>{fmtN(c.bultos_ok)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Semana ant.",
  month: "Mes",
  custom: "Personalizado",
}

interface ConsolidatedWaypoint {
  customer_id: string
  dc: string
  bultos_ok: number
  bultos_rech: number
  visitas: number
  rech_visits: number
  rutas: Set<string>
  choferes: Set<string>
  completed_ts: number | null
  svc_ana_sum: number
  svc_ana_count: number
  svc_ts_sum: number
  svc_ts_count: number
  motivos_bultos: Record<string, number>
}

interface MarkerEntry {
  id: string
  name: string
  lat: number
  lng: number
  ruta: string
  chofer: string
  marker: { openPopup: () => void }
}

function fmtN(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function highlight(text: string, q: string): string {
  if (!q) return escapeHtml(text)
  const re = new RegExp(`(${q.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "ig")
  return escapeHtml(text).replace(re, "<mark>$1</mark>")
}

function pctClass(v: number): "high" | "mid" | "low" {
  if (v >= 50) return "high"
  if (v >= 25) return "mid"
  return "low"
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: "ok" | "danger" | "warn" | "pending" | null
}) {
  return (
    <div className={`kpi${tone ? ` ${tone}` : ""}`}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

function KmKpi({ kpis }: { kpis: { km_status: string; km_driven: number | null; km_planned: number | null } }) {
  if (kpis.km_status === "ready" && kpis.km_driven != null) {
    const desv =
      kpis.km_planned != null && kpis.km_planned > 0
        ? Math.round(((kpis.km_driven - kpis.km_planned) / kpis.km_planned) * 100)
        : null
    const tone = desv != null && Math.abs(desv) > 15 ? "warn" : null
    return (
      <Kpi
        label="Km recorridos"
        value={`${kpis.km_driven.toLocaleString("es-AR", { maximumFractionDigits: 1 })} km`}
        sub={`plan ${kpis.km_planned ?? "—"}${desv != null ? ` · ${desv > 0 ? "+" : ""}${desv}%` : ""}`}
        tone={tone}
      />
    )
  }
  if (kpis.km_status === "pending") {
    return <Kpi label="Km recorridos" value="Cargando…" sub="analytics async" tone="pending" />
  }
  return <Kpi label="Km recorridos" value="—" sub="no disponible" tone="pending" />
}
