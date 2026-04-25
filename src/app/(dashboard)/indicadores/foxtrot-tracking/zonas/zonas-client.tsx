"use client"

import { useEffect, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"
import "../dashboard.css"
import type { ZonasConfig } from "@/lib/foxtrot-snapshot/types"

interface PolyEntry {
  poly: unknown
  color: string
}

const CITIES: { n: string; c: [number, number] }[] = [
  { n: "Puerto Iguazú", c: [-25.597, -54.573] },
  { n: "Puerto Libertad", c: [-25.915, -54.6] },
  { n: "Sgo. de Liniers", c: [-26.094, -54.496] },
  { n: "Eldorado", c: [-26.4, -54.637] },
  { n: "Montecarlo", c: [-26.565, -54.755] },
  { n: "Caraguatay", c: [-26.636, -54.783] },
]

export function ZonasEditorClient() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapObj = useRef<unknown>(null)
  const polys = useRef<Record<string, PolyEntry>>({})
  const Lref = useRef<typeof import("leaflet") | null>(null)
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" | "" }>({ msg: "—", kind: "" })
  const [coordsView, setCoordsView] = useState<{ name: string; color: string; coords: [number, number][] }[]>([])

  const renderPanel = () => {
    const arr: { name: string; color: string; coords: [number, number][] }[] = []
    for (const [name, e] of Object.entries(polys.current)) {
      const poly = e.poly as { getLatLngs: () => unknown[] }
      const ll = poly.getLatLngs()
      const ring = (Array.isArray(ll[0]) ? ll[0] : ll) as { lat: number; lng: number }[]
      arr.push({ name, color: e.color, coords: ring.map((p) => [p.lat, p.lng]) })
    }
    setCoordsView(arr)
  }

  const attachEdit = (poly: unknown) => {
    const p = poly as {
      pm: { enable: (opts: unknown) => void }
      on: (ev: string, cb: () => void) => void
    }
    p.pm.enable({
      allowSelfIntersection: false,
      snappable: true,
      snapDistance: 15,
      preventMarkerRemoval: false,
    })
    p.on("pm:edit", renderPanel)
    p.on("pm:vertexadded", renderPanel)
    p.on("pm:vertexremoved", renderPanel)
    p.on("pm:markerdragend", renderPanel)
  }

  const loadFromApi = async () => {
    setStatus({ msg: "cargando…", kind: "" })
    const r = await fetch("/api/foxtrot/zonas")
    const data = (await r.json()) as ZonasConfig
    const L = Lref.current!
    const m = mapObj.current as ReturnType<typeof L.map>
    for (const e of Object.values(polys.current)) m.removeLayer(e.poly as never)
    polys.current = {}
    const allCoords: [number, number][] = []
    for (const [name, z] of Object.entries(data)) {
      const poly = L.polygon(z.coords, {
        color: z.color,
        weight: 3,
        fillColor: z.color,
        fillOpacity: 0.18,
      }).addTo(m)
      polys.current[name] = { poly, color: z.color }
      attachEdit(poly)
      allCoords.push(...(z.coords as [number, number][]))
    }
    if (allCoords.length) m.fitBounds(allCoords, { padding: [30, 30] })
    renderPanel()
    setStatus({ msg: "cargado", kind: "ok" })
    setTimeout(() => setStatus({ msg: "—", kind: "" }), 1500)
  }

  const saveZonas = async () => {
    setStatus({ msg: "guardando…", kind: "" })
    const payload: ZonasConfig = {}
    for (const [name, e] of Object.entries(polys.current)) {
      const poly = e.poly as { getLatLngs: () => unknown[] }
      const ll = poly.getLatLngs()
      const ring = (Array.isArray(ll[0]) ? ll[0] : ll) as { lat: number; lng: number }[]
      payload[name] = { color: e.color, coords: ring.map((p) => [p.lat, p.lng]) }
    }
    try {
      const r = await fetch("/api/foxtrot/zonas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = (await r.json()) as { saved_at?: string }
      setStatus({ msg: `guardado ${d.saved_at?.slice(11, 19) ?? ""}`, kind: "ok" })
    } catch (e) {
      setStatus({ msg: `error: ${e instanceof Error ? e.message : String(e)}`, kind: "err" })
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      await import("@geoman-io/leaflet-geoman-free")
      Lref.current = L
      if (cancelled || !mapRef.current || mapObj.current) return
      const m = L.map(mapRef.current, { attributionControl: false }).setView([-26.3, -54.4], 8)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(m)
      for (const c of CITIES) {
        L.circleMarker(c.c, {
          radius: 4,
          color: "#fff",
          fillColor: "#fff",
          fillOpacity: 1,
          weight: 1,
          pmIgnore: true,
        } as L.CircleMarkerOptions & { pmIgnore?: boolean })
          .bindTooltip(c.n, {
            permanent: true,
            direction: "right",
            offset: [8, 0],
            className: "city-lbl",
          })
          .addTo(m)
      }
      mapObj.current = m
      await loadFromApi()
    })()
    return () => {
      cancelled = true
      const m = mapObj.current as { remove?: () => void } | null
      if (m?.remove) m.remove()
      mapObj.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fx-board">
      <header>
        <h1>
          Configurar zonas <span className="sub">— editor de vértices</span>
        </h1>
        <div className="spacer" />
        <button className="refresh" onClick={loadFromApi}>
          Recargar guardado
        </button>
        <button
          className="refresh"
          style={{ background: "var(--accent)", color: "#0b1020", borderColor: "var(--accent)", fontWeight: 600 }}
          onClick={saveZonas}
        >
          Guardar
        </button>
        <span
          style={{
            fontSize: 11,
            marginLeft: 8,
            color: status.kind === "ok" ? "var(--ok)" : status.kind === "err" ? "var(--danger)" : "var(--muted)",
          }}
        >
          {status.msg}
        </span>
      </header>
      <main>
        <div className="fx-zonas-editor">
          <div ref={mapRef} id="zonas-map" />
          <div className="side">
            <div
              style={{
                background: "#0a0f28",
                padding: "10px 12px",
                borderRadius: 6,
                fontSize: 11,
                color: "var(--muted)",
                lineHeight: 1.6,
              }}
            >
              <b style={{ color: "var(--text)" }}>Cómo editar</b>
              <br />
              • Arrastrá los puntos blancos para mover vértices
              <br />
              • Tocá los puntos amarillos (mitad de arista) para crear nuevos
              <br />
              • <kbd>Click derecho</kbd> sobre un vértice → Borrar punto
              <br />• <b style={{ color: "var(--text)" }}>Guardar</b> persiste en Supabase
            </div>
            <h3>Coordenadas actuales</h3>
            {coordsView.map((z) => (
              <div
                key={z.name}
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      background: z.color,
                      border: `2px solid ${z.color}`,
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{z.name}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      color: "var(--muted)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {z.coords.length} vértices
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "SF Mono, Menlo, monospace",
                    fontSize: 10,
                    color: "#cbd5e1",
                    background: "#0a0f28",
                    padding: "6px 8px",
                    borderRadius: 4,
                    maxHeight: 140,
                    overflowY: "auto",
                    whiteSpace: "pre",
                    lineHeight: 1.5,
                  }}
                >
                  {`[\n${z.coords.map((c) => `  [${c[0].toFixed(5)}, ${c[1].toFixed(5)}],`).join("\n")}\n]`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
