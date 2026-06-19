"use client"

import "leaflet/dist/leaflet.css"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Map as MapIcon,
  TruckIcon,
  Route,
  Save,
  Gauge,
} from "lucide-react"

const PILAR_ID = "5eb1b041-6a1b-4c71-9067-0daf4f5e381a"
const PILAR_COLOR = "#EC4899"

const ZONAS = [
  "MONTECARLO",
  "PUERTO ESPERANZA",
  "WANDA",
  "PUERTO LIBERTAD",
  "COMANDANTE ANDRESITO",
  "SAN PEDRO",
  "BERNARDO DE IRIGOYEN",
  "PUERTO IGUAZU",
  "ELDORADO",
  "PUERTO PIRAY",
  "SAN ANTONIO",
]

interface Ruta {
  id: number
  nombre: string
  dia: string
  clientes: number
  bultos: number
  hl: number
  freqProm: number
  color: string
}
interface Punto {
  id: number
  nombre: string | null
  lat: number
  lng: number
  bultos: number
  freq: number
  ruta: number
}
interface Resp {
  ok: boolean
  error?: string
  localidad: string
  totales: { clientes: number; bultos: number; hl: number }
  rutas: Ruta[]
  puntos: Punto[]
  antesDespues: {
    viajes_hoy_mes: number
    viajes_plan_mes: number
    viajes_evitados_mes: number
    carga_hoy: number
    carga_plan: number
    bultos_mes: number
  }
}

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR").format(Math.round(n))

function MapaRutas({ puntos, rutas }: { puntos: Punto[]; rutas: Ruta[] }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const map = useRef<unknown>(null)
  const layer = useRef<unknown>(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancel || !ref.current || map.current) return
      const m = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView(
        [-26.4, -54.6],
        11,
      )
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(m)
      layer.current = L.layerGroup().addTo(m)
      map.current = m
    })()
    return () => {
      cancel = true
      const m = map.current as { remove?: () => void } | null
      m?.remove?.()
      map.current = null
    }
  }, [])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const L = (await import("leaflet")).default
      const lg = layer.current as { clearLayers: () => void; addLayer: (x: unknown) => void } | null
      const m = map.current as { fitBounds: (b: unknown, o?: unknown) => void } | null
      if (cancel || !lg || !m) return
      lg.clearLayers()
      const colorDe = new Map(rutas.map((r) => [r.id, r.color]))
      const pts: [number, number][] = []
      for (const p of puntos) {
        const col = colorDe.get(p.ruta) ?? "#64748B"
        const mk = L.circleMarker([p.lat, p.lng], {
          radius: 6,
          color: "#fff",
          weight: 1,
          fillColor: col,
          fillOpacity: 0.9,
        })
        mk.bindPopup(
          `<div style="font-size:12px"><b>${(p.nombre ?? "—").replace(/</g, "")}</b><br/>` +
            `#${p.id}<br/>Bultos (3m): ${fmt(p.bultos)}<br/>Días con venta: ${p.freq}</div>`,
        )
        lg.addLayer(mk)
        pts.push([p.lat, p.lng])
      }
      if (pts.length) {
        try {
          m.fitBounds(pts, { padding: [30, 30], maxZoom: 14 })
        } catch {
          /* noop */
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [puntos, rutas])

  return <div ref={ref} className="relative z-0 h-[460px] w-full overflow-hidden rounded-lg" />
}

interface MesVlc {
  mes: string
  vlc_total: number
  hl: number
  nota: string | null
}

function PanelVlcHl() {
  const [meses, setMeses] = useState<MesVlc[]>([])
  const [objetivo, setObjetivo] = useState("0")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/plan-territorial/vlc-hl", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) {
        setMeses(j.meses as MesVlc[])
        setObjetivo(String(j.objetivo ?? 0))
      }
    } catch {
      /* noop */
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  const ratio = (m: MesVlc) => (m.hl > 0 ? m.vlc_total / m.hl : 0)
  const limpios = meses.filter((m) => !m.nota && m.hl > 0)
  const base =
    limpios.length > 0 ? limpios.reduce((a, m) => a + ratio(m), 0) / limpios.length : 0
  const obj = Number(objetivo) || 0
  const brecha = base > 0 && obj > 0 ? ((base - obj) / base) * 100 : 0

  const actualizar = (mes: string, campo: "vlc_total" | "hl", v: string) => {
    setMeses((xs) => xs.map((m) => (m.mes === mes ? { ...m, [campo]: Number(v) || 0 } : m)))
    setMsg(null)
  }
  const guardar = useCallback(async () => {
    setSaving(true)
    setMsg(null)
    try {
      const r = await fetch("/api/plan-territorial/vlc-hl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meses, objetivo: Number(objetivo) || 0 }),
      })
      const j = await r.json()
      setMsg(j.ok ? "Guardado ✓" : `Error: ${j.error}`)
    } catch (e) {
      setMsg(`Error: ${String((e as Error)?.message || e)}`)
    } finally {
      setSaving(false)
    }
  }, [meses, objetivo])

  const fmt0 = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n))

  return (
    <Card className="border-l-4" style={{ borderLeftColor: PILAR_COLOR }}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-5 w-5" style={{ color: PILAR_COLOR }} /> VLC / HL — costo logístico por hectolitro (5.1)
          </CardTitle>
          <div className="flex items-center gap-2">
            {msg && (
              <span className={`text-xs ${msg.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
                {msg}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={guardar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">VLC/HL actual (base meses limpios)</p>
            <p className="text-3xl font-bold text-slate-900">${fmt0(base)}</p>
            <p className="text-xs text-muted-foreground">por hectolitro distribuido</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Objetivo VLC/HL (sueño)</p>
            <div className="flex items-center gap-1">
              <span className="text-2xl font-bold text-slate-700">$</span>
              <Input
                type="number"
                value={objetivo}
                onChange={(e) => {
                  setObjetivo(e.target.value)
                  setMsg(null)
                }}
                className="h-10 w-32 text-2xl font-bold"
              />
            </div>
            <p className="text-xs text-muted-foreground">editable — meta de reducción</p>
          </div>
          <div className="rounded-lg p-4" style={{ backgroundColor: `${PILAR_COLOR}12` }}>
            <p className="text-xs text-slate-500">Reducción objetivo</p>
            <p className="text-3xl font-bold" style={{ color: PILAR_COLOR }}>
              {brecha > 0 ? `−${brecha.toFixed(1)}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">vs. base actual</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">VLC ($)</TableHead>
                <TableHead className="text-right">HL distribuido</TableHead>
                <TableHead className="text-right">VLC/HL</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meses.map((m) => (
                <TableRow key={m.mes}>
                  <TableCell className="font-medium">{m.mes.slice(0, 7)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={String(m.vlc_total)}
                      onChange={(e) => actualizar(m.mes, "vlc_total", e.target.value)}
                      className="h-8 w-32 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={String(m.hl)}
                      onChange={(e) => actualizar(m.mes, "hl", e.target.value)}
                      className="h-8 w-24 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right font-semibold">${fmt0(ratio(m))}</TableCell>
                  <TableCell className="text-xs text-amber-600">{m.nota ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          VLC = Almacén + Entrega + Flota + Acarreo (del PxQ, solo costos recurrentes;{" "}
          <b>preliminar — validar</b>). HL = hectolitros distribuidos (ventas_diarias). El plan
          territorial baja el VLC/HL al reducir viajes y mejorar el llenado del camión.
        </p>
      </CardContent>
    </Card>
  )
}

export function PlanTerritorialClient() {
  const [zona, setZona] = useState("MONTECARLO")
  const [rutas, setRutas] = useState("4")
  const [viajesHoy, setViajesHoy] = useState("22")
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ localidad: zona, rutas, viajesHoy, _: String(Date.now()) })
      const r = await fetch(`/api/plan-territorial?${qs}`, { cache: "no-store" })
      const j = (await r.json()) as Resp
      if (!j.ok) throw new Error(j.error || "Error")
      setData(j)
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setData(null)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona, rutas, viajesHoy])

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <Link
        href={`/indicadores/${PILAR_ID}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Planeamiento
      </Link>

      <div className="flex items-center gap-3">
        <div className="rounded-xl p-3" style={{ backgroundColor: `${PILAR_COLOR}18`, color: PILAR_COLOR }}>
          <MapIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plan Territorial</h1>
          <p className="text-sm text-muted-foreground">
            DPO Planeamiento 5.1 · re-zonificación por localidad para reducir viajes y mejorar el
            llenado del camión (VLC/HL)
          </p>
        </div>
      </div>

      {/* VLC/HL — el objetivo del 5.1 */}
      <PanelVlcHl />

      {/* Controles */}
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-500">Zona / localidad</Label>
            <Select value={zona} onValueChange={(v) => setZona(v ?? "MONTECARLO")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONAS.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-500">Cantidad de rutas</Label>
            <Select value={rutas} onValueChange={(v) => setRutas(v ?? "4")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5, 6].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} rutas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-500">Visitas/mes hoy (estim.)</Label>
            <Select value={viajesHoy} onValueChange={(v) => setViajesHoy(v ?? "22")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["26", "22", "18", "12"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n} visitas/mes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={cargar} disabled={loading} style={{ backgroundColor: PILAR_COLOR }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recalcular
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}
      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Calculando re-zonificación…
        </div>
      )}

      {data && (
        <>
          {/* Antes vs Después */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4" style={{ borderLeftColor: "#94A3B8" }}>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Visitas/mes a la zona — HOY</p>
                <p className="text-3xl font-bold text-slate-900">{data.antesDespues.viajes_hoy_mes}</p>
                <p className="text-xs text-muted-foreground">carga prom. {fmt(data.antesDespues.carga_hoy)} bultos/viaje</p>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: "#10B981" }}>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Visitas/mes — CON PLAN</p>
                <p className="text-3xl font-bold text-emerald-600">{data.antesDespues.viajes_plan_mes}</p>
                <p className="text-xs text-muted-foreground">carga prom. {fmt(data.antesDespues.carga_plan)} bultos/viaje</p>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: PILAR_COLOR }}>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Viajes evitados/mes</p>
                <p className="text-3xl font-bold" style={{ color: PILAR_COLOR }}>
                  {data.antesDespues.viajes_evitados_mes}
                </p>
                <p className="text-xs text-muted-foreground">menos combustible y horas de ruta</p>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: "#3B82F6" }}>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Mejor llenado del camión</p>
                <p className="text-3xl font-bold text-blue-600">
                  {data.antesDespues.carga_hoy > 0
                    ? `+${Math.round((data.antesDespues.carga_plan / data.antesDespues.carga_hoy - 1) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">bultos por viaje vs. hoy</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Mapa */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Route className="h-5 w-5" style={{ color: PILAR_COLOR }} /> Sub-rutas de {data.localidad}
                </CardTitle>
                <div className="flex flex-wrap gap-3 pt-1">
                  {data.rutas.map((r) => (
                    <span key={r.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.nombre.split("·")[0].trim()} · {r.dia}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <MapaRutas puntos={data.puntos} rutas={data.rutas} />
              </CardContent>
            </Card>

            {/* Resumen zona */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TruckIcon className="h-5 w-5" style={{ color: PILAR_COLOR }} /> Resumen de la zona
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Clientes con ubicación</span>
                  <span className="font-semibold">{fmt(data.totales.clientes)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Bultos (feb–abr)</span>
                  <span className="font-semibold">{fmt(data.totales.bultos)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">HL (feb–abr)</span>
                  <span className="font-semibold">{fmt(data.totales.hl)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rutas sugeridas</span>
                  <span className="font-semibold">{data.rutas.length}</span>
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  En vez de visitar la ciudad todos los días, se agrupan los clientes por cercanía y
                  cada ruta tiene su día fijo de visita/entrega.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla por ruta */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rutas sugeridas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Día de visita</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">Bultos (3m)</TableHead>
                    <TableHead className="text-right">HL (3m)</TableHead>
                    <TableHead className="text-right">Visitas/sem prom.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rutas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                          {r.nombre}
                        </span>
                      </TableCell>
                      <TableCell>{r.dia}</TableCell>
                      <TableCell className="text-right">{fmt(r.clientes)}</TableCell>
                      <TableCell className="text-right">{fmt(r.bultos)}</TableCell>
                      <TableCell className="text-right">{fmt(r.hl)}</TableCell>
                      <TableCell className="text-right">{r.freqProm}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="pt-3 text-xs text-muted-foreground">
                Datos reales de comprobantes (feb–abr 2026). La frecuencia es el promedio de
                visitas/semana de los clientes de la ruta — referencia para definir cuántas veces
                visitarlos.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
