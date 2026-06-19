"use client"

import "leaflet/dist/leaflet.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Users,
  Download,
  Save,
  ClipboardList,
  FileText,
  MapPin,
} from "lucide-react"

const PILAR_ID = "5eb1b041-6a1b-4c71-9067-0daf4f5e381a"
const PILAR_COLOR = "#EC4899"

// Definición de los 4 clústeres (modelo DPO 4.2) + buckets de un solo período.
const CLUSTER_META: Record<
  string,
  { color: string; desc: string }
> = {
  Ganador: { color: "#10B981", desc: "Saltó de C a A (gran crecimiento)" },
  Crecimiento: { color: "#3B82F6", desc: "Subió de nivel (C→B o B→A)" },
  Básico: { color: "#64748B", desc: "Se mantuvo en su nivel" },
  "Ventas Bajas": { color: "#EF4444", desc: "Bajó de nivel" },
  Nuevo: { color: "#8B5CF6", desc: "Sólo con ventas en el período 2" },
  Perdido: { color: "#94A3B8", desc: "Sólo con ventas en el período 1" },
}
const CLUSTERS_PRINCIPALES = ["Ganador", "Crecimiento", "Básico", "Ventas Bajas"]
const CLASE_COLOR: Record<string, string> = { A: "#10B981", B: "#3B82F6", C: "#94A3B8" }

interface FilaCluster {
  id_cliente: number
  razon_social: string | null
  des_localidad: string | null
  des_canal_mkt: string | null
  u1: number
  u2: number
  m1: number
  m2: number
  cl1: string | null
  cl2: string | null
  cluster: string
  rmd_prom: number | null
  rmd_n: number
  rmd_bajos: number
  bultos_rech: number
  bultos_entr: number
  lat: number | null
  lng: number | null
}
interface AggCluster {
  cluster: string
  clientes: number
  unidades: number
  monto: number
  rmd_prom: number | null
  rmd_bajos: number
  bultos_rech: number
  bultos_entr: number
  infull_pct: number | null
}
interface Respuesta {
  ok: boolean
  error?: string
  total: number
  clasificados: number
  agg: AggCluster[]
  matriz: { c1: string; celdas: { c2: string; n: number }[] }[]
  filas: FilaCluster[]
}

interface Periodos {
  p1d: string
  p1h: string
  p2d: string
  p2h: string
}

interface PlanFila {
  cluster: string
  prioridad_inventario: string
  prioridad_ruteo: string
  frecuencia: string | null
  drop_size_min: string | null
  ventana_entrega: string | null
  foco_servicio: string | null
  orden: number
}
const PRIO_INV = ["Alta", "Media", "Baja"]
const PRIO_RUT = ["Alta", "Media", "Baja", "Posdatable"]

// Matriz RACI del SOP (Anexo 1 del procedimiento original).
const RACI_ROLES = [
  "Gerente T2",
  "Sup. Distribución",
  "Sup. Planeador TCT",
  "Sup. Almacenamiento",
  "Sup. Ventas",
  "UC / OL",
]
const RACI_FILAS: { act: string; v: string[] }[] = [
  { act: "1. Análisis del comportamiento de indicadores", v: ["A", "R", "A", "I", "C", "I"] },
  { act: "2. Establecer zona de transporte", v: ["A", "R", "A", "I", "C", "I"] },
  { act: "3. Clasificación de clientes", v: ["A", "R", "C", "I", "I", "I"] },
  { act: "4. Validación del comportamiento", v: ["R", "A", "C", "I", "I", "C"] },
  { act: "5. Ubicación del clúster según puntuación", v: ["A", "R", "C", "I", "I", "C"] },
  { act: "6. Priorización en la planeación", v: ["C", "A", "R", "I", "I", "I"] },
  { act: "7. Seguimiento al indicador de servicio", v: ["I", "A", "C", "I", "I", "R"] },
]
const RACI_COLOR: Record<string, string> = {
  R: "#DCFCE7",
  A: "#DBEAFE",
  I: "#FEF9C3",
  C: "#FFEDD5",
}

// Flujograma del proceso (color por responsable, como en el SOP original).
const ROL_COLOR: Record<string, { bg: string; border: string }> = {
  "Sup. Distribución": { bg: "#FFEDD5", border: "#F97316" },
  "Gerente T2": { bg: "#DBEAFE", border: "#3B82F6" },
  "Sup. Planeador TCT": { bg: "#DCFCE7", border: "#22C55E" },
  "UC / OL": { bg: "#FEF9C3", border: "#EAB308" },
}
const FLUJOGRAMA: { paso: string; rol: keyof typeof ROL_COLOR }[] = [
  { paso: "1. Análisis del comportamiento de indicadores", rol: "Sup. Distribución" },
  { paso: "2. Establecer zona de transporte", rol: "Sup. Distribución" },
  { paso: "3. Clasificación de clientes", rol: "Sup. Distribución" },
  { paso: "4. Validación del comportamiento", rol: "Gerente T2" },
  { paso: "5. Ubicación del clúster según puntuación", rol: "Sup. Distribución" },
  { paso: "6. Priorización en la planeación", rol: "Sup. Planeador TCT" },
  { paso: "7. Seguimiento al indicador de servicio", rol: "UC / OL" },
]

const fmtN = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR").format(Math.round(n))
const fmt$ = (n: number | null | undefined) =>
  n == null ? "—" : "$" + new Intl.NumberFormat("es-AR").format(Math.round(n))

function ClusterMapa({ filas }: { filas: FilaCluster[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapObj = useRef<unknown>(null)
  const layer = useRef<unknown>(null)

  // Init mapa (sólo cliente).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !mapRef.current || mapObj.current) return
      const m = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView(
        [-26.3, -54.2],
        8,
      )
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(m)
      layer.current = L.layerGroup().addTo(m)
      mapObj.current = m
    })()
    return () => {
      cancelled = true
      const m = mapObj.current as { remove?: () => void } | null
      m?.remove?.()
      mapObj.current = null
    }
  }, [])

  // Pintar marcadores cuando cambian las filas.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      const lg = layer.current as {
        clearLayers: () => void
        addLayer: (x: unknown) => void
      } | null
      const m = mapObj.current as {
        fitBounds: (b: unknown, o?: unknown) => void
      } | null
      if (cancelled || !lg || !m) return
      lg.clearLayers()
      const pts: [number, number][] = []
      for (const f of filas) {
        const la = Number(f.lat)
        const ln = Number(f.lng)
        if (!Number.isFinite(la) || !Number.isFinite(ln)) continue
        const color = CLUSTER_META[f.cluster]?.color ?? "#64748B"
        const mk = L.circleMarker([la, ln], {
          radius: 6,
          color: "#fff",
          weight: 1,
          fillColor: color,
          fillOpacity: 0.9,
        })
        mk.bindPopup(
          `<div style="font-size:12px;line-height:1.5">
             <b>${(f.razon_social ?? "—").replace(/</g, "")}</b><br/>
             <span style="color:#64748b">#${f.id_cliente} · ${(f.des_localidad ?? "—").replace(/</g, "")}</span><br/>
             Clúster: <b style="color:${color}">${f.cluster}</b><br/>
             Clase: ${f.cl1 ?? "·"} → ${f.cl2 ?? "·"}<br/>
             Volumen: ${fmtN(Number(f.u1) + Number(f.u2))} u.<br/>
             RMD: ${f.rmd_prom ?? "—"}${f.rmd_bajos > 0 ? ` (${f.rmd_bajos} bajas)` : ""}
           </div>`,
        )
        lg.addLayer(mk)
        pts.push([la, ln])
      }
      if (pts.length > 0) {
        try {
          m.fitBounds(pts, { padding: [30, 30], maxZoom: 13 })
        } catch {
          /* noop */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filas])

  return <div ref={mapRef} className="relative z-0 h-[480px] w-full overflow-hidden rounded-lg" />
}

export function ClusterClientesClient({ periodos }: { periodos: Periodos }) {
  const [p1d, setP1d] = useState(periodos.p1d)
  const [p1h, setP1h] = useState(periodos.p1h)
  const [p2d, setP2d] = useState(periodos.p2d)
  const [p2h, setP2h] = useState(periodos.p2h)
  const [metrica, setMetrica] = useState("unidades")
  const [abcA, setAbcA] = useState("0.80")
  const [abcB, setAbcB] = useState("0.95")

  const [data, setData] = useState<Respuesta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [filtroCluster, setFiltroCluster] = useState("todos")
  const [busqueda, setBusqueda] = useState("")

  const [plan, setPlan] = useState<PlanFila[]>([])
  const [planSaving, setPlanSaving] = useState(false)
  const [planMsg, setPlanMsg] = useState<string | null>(null)

  const cargarPlan = useCallback(async () => {
    try {
      const r = await fetch("/api/cluster-clientes/plan", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) setPlan(j.plan as PlanFila[])
    } catch {
      /* noop */
    }
  }, [])

  const actualizarPlan = useCallback((cluster: string, campo: keyof PlanFila, valor: string) => {
    setPlan((xs) => xs.map((p) => (p.cluster === cluster ? { ...p, [campo]: valor } : p)))
    setPlanMsg(null)
  }, [])

  const guardarPlan = useCallback(async () => {
    setPlanSaving(true)
    setPlanMsg(null)
    try {
      const r = await fetch("/api/cluster-clientes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const j = await r.json()
      setPlanMsg(j.ok ? "Plan guardado ✓" : `Error: ${j.error}`)
    } catch (e) {
      setPlanMsg(`Error: ${String((e as Error)?.message || e)}`)
    } finally {
      setPlanSaving(false)
    }
  }, [plan])

  const exportarPlan = useCallback(() => {
    if (!plan.length) return
    const head = [
      "cluster",
      "prioridad_inventario",
      "prioridad_ruteo",
      "frecuencia",
      "drop_size_minimo",
      "ventana_entrega",
      "foco_servicio",
    ]
    const filas = plan.map((p) =>
      [
        p.cluster,
        p.prioridad_inventario,
        p.prioridad_ruteo,
        `"${(p.frecuencia ?? "").replace(/"/g, "'")}"`,
        `"${(p.drop_size_min ?? "").replace(/"/g, "'")}"`,
        `"${(p.ventana_entrega ?? "").replace(/"/g, "'")}"`,
        `"${(p.foco_servicio ?? "").replace(/"/g, "'")}"`,
      ].join(","),
    )
    const blob = new Blob([[head.join(","), ...filas].join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "plan-servicios-logisticos-cluster.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [plan])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ p1d, p1h, p2d, p2h, metrica, abcA, abcB })
      const r = await fetch(`/api/cluster-clientes?${qs}&_=${Date.now()}`, { cache: "no-store" })
      const j = (await r.json()) as Respuesta
      if (!j.ok) throw new Error(j.error || "Error al calcular")
      setData(j)
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setData(null)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p1d, p1h, p2d, p2h, metrica, abcA, abcB])

  useEffect(() => {
    cargar()
    cargarPlan()
    // sólo en mount; recálculos posteriores por botón
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aggPorCluster = useMemo(() => {
    const m = new Map<string, AggCluster>()
    for (const a of data?.agg ?? []) m.set(a.cluster, a)
    return m
  }, [data])

  const filasFiltradas = useMemo(() => {
    let xs = data?.filas ?? []
    if (filtroCluster !== "todos") xs = xs.filter((f) => f.cluster === filtroCluster)
    const q = busqueda.trim().toLowerCase()
    if (q)
      xs = xs.filter(
        (f) =>
          String(f.id_cliente).includes(q) ||
          (f.razon_social ?? "").toLowerCase().includes(q) ||
          (f.des_localidad ?? "").toLowerCase().includes(q),
      )
    return xs.slice(0, 500)
  }, [data, filtroCluster, busqueda])

  const filasMapa = useMemo(() => {
    let xs = (data?.filas ?? []).filter(
      (f) => Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng)),
    )
    if (filtroCluster !== "todos") xs = xs.filter((f) => f.cluster === filtroCluster)
    const q = busqueda.trim().toLowerCase()
    if (q)
      xs = xs.filter(
        (f) =>
          String(f.id_cliente).includes(q) ||
          (f.razon_social ?? "").toLowerCase().includes(q) ||
          (f.des_localidad ?? "").toLowerCase().includes(q),
      )
    return xs.slice(0, 6000)
  }, [data, filtroCluster, busqueda])

  const conGeo = useMemo(
    () => (data?.filas ?? []).filter((f) => f.lat != null && f.lng != null).length,
    [data],
  )

  const exportarCsv = useCallback(() => {
    const xs = data?.filas ?? []
    if (!xs.length) return
    const head = [
      "id_cliente",
      "razon_social",
      "localidad",
      "canal",
      "clase_p1",
      "clase_p2",
      "cluster",
      "unidades_p1",
      "unidades_p2",
      "monto_p1",
      "monto_p2",
      "rmd_prom",
      "rmd_encuestas",
      "rmd_bajos",
    ]
    const filas = xs.map((f) =>
      [
        f.id_cliente,
        `"${(f.razon_social ?? "").replace(/"/g, "'")}"`,
        `"${(f.des_localidad ?? "").replace(/"/g, "'")}"`,
        `"${(f.des_canal_mkt ?? "").replace(/"/g, "'")}"`,
        f.cl1 ?? "",
        f.cl2 ?? "",
        f.cluster,
        Math.round(f.u1),
        Math.round(f.u2),
        Math.round(f.m1),
        Math.round(f.m2),
        f.rmd_prom ?? "",
        f.rmd_n,
        f.rmd_bajos,
      ].join(","),
    )
    const blob = new Blob([[head.join(","), ...filas].join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cluster-clientes_${p2d}_a_${p2h}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [data, p2d, p2h])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href={`/indicadores/${PILAR_ID}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Planeamiento
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: `${PILAR_COLOR}18`, color: PILAR_COLOR }}
          >
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Plan de Agrupación de Clientes</h1>
            <p className="text-sm text-muted-foreground">
              DPO Planeamiento 4.2 · clústeres por ABC de Pareto (ingreso × crecimiento) + cruce
              RMD / In Full
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!data?.filas?.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={cargar} disabled={loading} style={{ backgroundColor: PILAR_COLOR }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recalcular
          </Button>
        </div>
      </div>

      {/* Controles */}
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-500">Período 1 (base)</Label>
            <div className="flex gap-2">
              <Input type="date" value={p1d} onChange={(e) => setP1d(e.target.value)} />
              <Input type="date" value={p1h} onChange={(e) => setP1h(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-500">Período 2 (actual)</Label>
            <div className="flex gap-2">
              <Input type="date" value={p2d} onChange={(e) => setP2d(e.target.value)} />
              <Input type="date" value={p2h} onChange={(e) => setP2h(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-500">Variable de ingreso</Label>
            <Select value={metrica} onValueChange={(v) => setMetrica(v ?? "unidades")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unidades">Volumen (unidades)</SelectItem>
                <SelectItem value="monto">Facturación ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-500">
              Cortes ABC (acum. A / B)
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0.5"
                max="0.98"
                value={abcA}
                onChange={(e) => setAbcA(e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                min="0.6"
                max="0.99"
                value={abcB}
                onChange={(e) => setAbcB(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SOP / Procedimiento (R4.2.4) */}
      <Card>
        <CardContent className="pt-6">
          <Accordion>
            <AccordionItem value="sop" className="border-none">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex items-center gap-2 text-base font-semibold">
                  <FileText className="h-5 w-5" style={{ color: PILAR_COLOR }} />
                  Procedimiento operativo (SOP) — DPO Planeamiento 4.2
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 text-sm leading-relaxed text-slate-700">
                  <p className="text-xs text-muted-foreground">
                    SOP — Plan de Agrupación de Clientes · Mercosur Distribuciones (Misiones) ·
                    basado en el procedimiento DPO de clúster de clientes (rev. anterior 07/05/2025),
                    actualizado al uso de esta herramienta.
                  </p>

                  <div>
                    <p className="font-semibold text-slate-900">1. Objetivo</p>
                    <p>
                      Establecer el monitoreo y seguimiento de los clientes según su comportamiento
                      de ingreso y crecimiento, agrupándolos en clústeres y cruzándolos con los
                      indicadores de servicio (RMD, In Full / OTIF) para priorizar la atención en la
                      planificación logística (asignación de inventario y enrutamiento).
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">2. Alcance</p>
                    <p>
                      Aplica a toda la cartera de clientes del Centro de Distribución de Misiones
                      (Eldorado e Iguazú) e involucra a los equipos de Distribución, Planeamiento
                      (TCT), Ventas y Almacén.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">3. Definiciones</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      <li>
                        <b>Clúster:</b> agrupación de clientes por nivel de ingreso (clase ABC) y su
                        movimiento entre dos períodos: Ganador, Crecimiento, Básico y Ventas Bajas.
                      </li>
                      <li>
                        <b>ABC de Pareto:</b> clasificación de clientes en A/B/C según su aporte
                        acumulado al volumen o a la facturación.
                      </li>
                      <li>
                        <b>RMD:</b> calidad de la entrega percibida por el cliente (escala 1–5).
                      </li>
                      <li>
                        <b>In Full / OTIF:</b> entrega completa y a tiempo; aquí se mide la porción
                        entregada vs. rechazada por clúster.
                      </li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">4. Responsabilidades</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      <li>
                        <b>Supervisor de Distribución:</b> ejecuta el análisis en la herramienta,
                        define el plan de servicios por clúster y lidera la revisión.
                      </li>
                      <li>
                        <b>Planeamiento / TCT:</b> aplica las prioridades de inventario y ruteo del
                        plan en la planificación diaria y en el ruterizador.
                      </li>
                      <li>
                        <b>Ventas:</b> valida la cartera, acuerda ventanas/frecuencias con el cliente
                        y comunica cambios de comportamiento.
                      </li>
                      <li>
                        <b>Almacén:</b> respeta la prioridad de asignación de inventario por clúster.
                      </li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">4.1 Matriz RACI</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full border-collapse text-center text-xs">
                        <thead>
                          <tr>
                            <th className="border border-slate-200 bg-slate-50 p-2 text-left">
                              Actividad
                            </th>
                            {RACI_ROLES.map((r) => (
                              <th key={r} className="border border-slate-200 bg-slate-50 p-2">
                                {r}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {RACI_FILAS.map((fila) => (
                            <tr key={fila.act}>
                              <td className="border border-slate-200 p-2 text-left">{fila.act}</td>
                              {fila.v.map((letra, i) => (
                                <td
                                  key={i}
                                  className="border border-slate-200 p-2 font-semibold"
                                  style={{ backgroundColor: RACI_COLOR[letra] }}
                                >
                                  {letra}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      <b>R</b>: Responsable de ejecutar · <b>A</b>: Dueño · <b>C</b>: Consultado ·{" "}
                      <b>I</b>: Informado.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">5. Frecuencia</p>
                    <p>
                      El análisis de clústeres se ejecuta como mínimo <b>2 veces al año</b>. La
                      evolución y el plan de acción se revisan <b>mensualmente</b> en la reunión de
                      ventas y logística (según TOR).
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">6. Desarrollo del procedimiento</p>
                    <ol className="list-decimal space-y-1.5 pl-5">
                      <li>
                        <b>Definición de clústeres (R4.2.1).</b> En esta herramienta se seleccionan
                        los dos períodos a comparar y la variable de ingreso (volumen o facturación);
                        el sistema calcula el ABC de Pareto y clasifica a cada cliente en los 4
                        clústeres por su movimiento de clase.
                      </li>
                      <li>
                        <b>Análisis y cruce con servicio (R4.2.2).</b> Se revisan por clúster los
                        indicadores RMD e In Full para entender el desempeño de servicio y priorizar.
                        Se ejecuta al menos 2 veces al año.
                      </li>
                      <li>
                        <b>Plan de servicios logísticos (R4.2.3).</b> Se define, en la sección “Plan
                        de servicios logísticos por clúster”, la prioridad de inventario, la
                        prioridad de ruteo, la frecuencia de visita, el drop size mínimo y la ventana
                        de entrega para cada clúster. El plan se guarda y se exporta.
                      </li>
                      <li>
                        <b>Conexión con los equipos y carga al ruterizador (R4.2.4).</b> El plan
                        exportado se comunica a Ventas y Operaciones (reunión de ventas y logística),
                        y Planeamiento/TCT vuelca las prioridades por clúster en el ruterizador y en
                        la planificación diaria.
                      </li>
                      <li>
                        <b>Seguimiento y validación.</b> Se monitorea la evolución de NPS, RMD y OTIF;
                        si los indicadores no mejoran, se reprocesa el análisis (reincorporar
                        clientes o recalibrar) en el siguiente ciclo.
                      </li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">7. Registros / evidencias</p>
                    <p>
                      Esta herramienta (clústeres por período), el export CSV de clientes por clúster,
                      la tabla del plan de servicios logísticos guardada, y las minutas de la reunión
                      de ventas y logística.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">8. Indicadores de seguimiento</p>
                    <p>Nivel de servicio: NPS, RMD y OTIF (On Time – In Full) y sus componentes.</p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">Anexo — Flujograma del proceso</p>
                    <div className="mt-3 flex flex-col items-center gap-1">
                      <div className="rounded-full border border-slate-300 bg-slate-100 px-6 py-1.5 text-xs font-semibold text-slate-600">
                        INICIO
                      </div>
                      {FLUJOGRAMA.map((f) => {
                        const c = ROL_COLOR[f.rol]
                        return (
                          <div key={f.paso} className="flex w-full flex-col items-center gap-1">
                            <div className="text-slate-300">↓</div>
                            <div
                              className="flex w-full max-w-md items-center justify-between gap-3 rounded-lg border-l-4 px-4 py-2"
                              style={{ backgroundColor: c.bg, borderLeftColor: c.border }}
                            >
                              <span className="text-sm font-medium text-slate-800">{f.paso}</span>
                              <span
                                className="shrink-0 text-xs font-semibold"
                                style={{ color: c.border }}
                              >
                                {f.rol}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      <div className="text-slate-300">↓</div>
                      <div className="rounded-full border border-slate-300 bg-slate-100 px-6 py-1.5 text-xs font-semibold text-slate-600">
                        FIN
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {Object.entries(ROL_COLOR).map(([rol, c]) => (
                        <span key={rol} className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-3 w-3 rounded-sm border"
                            style={{ backgroundColor: c.bg, borderColor: c.border }}
                          />
                          {rol}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Calculando clústeres…
        </div>
      )}

      {data && (
        <>
          {/* Tarjetas de clúster */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CLUSTERS_PRINCIPALES.map((c) => {
              const a = aggPorCluster.get(c)
              const meta = CLUSTER_META[c]
              const pct = data.clasificados > 0 ? (100 * (a?.clientes ?? 0)) / data.clasificados : 0
              return (
                <Card key={c} className="border-l-4" style={{ borderLeftColor: meta.color }}>
                  <CardContent className="space-y-1 pt-6">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold" style={{ color: meta.color }}>
                        {c}
                      </p>
                      <Badge variant="outline">{pct.toFixed(1)}%</Badge>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{fmtN(a?.clientes ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{meta.desc}</p>
                    <div className="grid grid-cols-2 gap-1 pt-2 text-xs">
                      <span className="text-slate-500">RMD prom</span>
                      <span className="text-right font-medium">{a?.rmd_prom ?? "—"}</span>
                      <span className="text-slate-500">RMD ≤3</span>
                      <span className="text-right font-medium">{fmtN(a?.rmd_bajos ?? 0)}</span>
                      <span className="text-slate-500">In Full</span>
                      <span className="text-right font-medium">
                        {a?.infull_pct != null ? `${a.infull_pct}%` : "—"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Matriz de transición ABC */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Matriz de transición ABC (P1 → P2)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="p-2 text-left">P1 \ P2</th>
                        {["A", "B", "C"].map((c) => (
                          <th key={c} className="p-2" style={{ color: CLASE_COLOR[c] }}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.matriz.map((fila) => (
                        <tr key={fila.c1}>
                          <td className="p-2 text-left font-semibold" style={{ color: CLASE_COLOR[fila.c1] }}>
                            {fila.c1}
                          </td>
                          {fila.celdas.map((cel) => {
                            const diag = fila.c1 === cel.c2
                            const sube =
                              (fila.c1 === "C" && cel.c2 !== "C") ||
                              (fila.c1 === "B" && cel.c2 === "A")
                            return (
                              <td
                                key={cel.c2}
                                className="p-2 font-medium"
                                style={{
                                  backgroundColor: diag
                                    ? "#F1F5F9"
                                    : sube
                                      ? "#ECFDF5"
                                      : "#FEF2F2",
                                }}
                              >
                                {fmtN(cel.n)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Verde = sube de clase (Crecimiento/Ganador) · gris = se mantiene (Básico) · rojo =
                  baja (Ventas Bajas).
                </p>
              </CardContent>
            </Card>

            {/* Resumen por clúster */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumen por clúster</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clúster</TableHead>
                      <TableHead className="text-right">Clientes</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">RMD</TableHead>
                      <TableHead className="text-right">In Full</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.agg ?? [])
                      .filter((a) => a.clientes > 0)
                      .map((a) => (
                        <TableRow key={a.cluster}>
                          <TableCell>
                            <span
                              className="font-medium"
                              style={{ color: CLUSTER_META[a.cluster]?.color }}
                            >
                              {a.cluster}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{fmtN(a.clientes)}</TableCell>
                          <TableCell className="text-right">{fmtN(a.unidades)}</TableCell>
                          <TableCell className="text-right">{a.rmd_prom ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {a.infull_pct != null ? `${a.infull_pct}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                <p className="mt-3 text-xs text-muted-foreground">
                  {fmtN(data.clasificados)} clientes en los 4 clústeres · {fmtN(data.total)} con
                  actividad en el rango.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Plan de servicios logísticos (R4.2.3) */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" style={{ color: PILAR_COLOR }} />
                  <CardTitle className="text-base">Plan de servicios logísticos por clúster</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {planMsg && (
                    <span
                      className={`text-xs ${planMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {planMsg}
                    </span>
                  )}
                  <Button variant="outline" size="sm" onClick={exportarPlan} disabled={!plan.length}>
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                  <Button
                    size="sm"
                    onClick={guardarPlan}
                    disabled={planSaving || !plan.length}
                    style={{ backgroundColor: PILAR_COLOR }}
                  >
                    {planSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Guardar plan
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Reglas de inventario y ruteo por clúster — instrucciones para los equipos de
                planeamiento, almacén y entrega (R4.2.3).
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {plan.map((p) => {
                  const color = CLUSTER_META[p.cluster]?.color ?? "#64748B"
                  return (
                    <Card key={p.cluster} className="border-l-4" style={{ borderLeftColor: color }}>
                      <CardContent className="space-y-3 pt-5">
                        <p className="font-semibold" style={{ color }}>
                          {p.cluster}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Prioridad inventario</Label>
                            <Select
                              value={p.prioridad_inventario}
                              onValueChange={(v) =>
                                actualizarPlan(p.cluster, "prioridad_inventario", v ?? "Media")
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRIO_INV.map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Prioridad ruteo</Label>
                            <Select
                              value={p.prioridad_ruteo}
                              onValueChange={(v) =>
                                actualizarPlan(p.cluster, "prioridad_ruteo", v ?? "Media")
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRIO_RUT.map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Frecuencia de visita</Label>
                            <Input
                              className="h-9"
                              value={p.frecuencia ?? ""}
                              onChange={(e) => actualizarPlan(p.cluster, "frecuencia", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Drop size mínimo</Label>
                            <Input
                              className="h-9"
                              value={p.drop_size_min ?? ""}
                              onChange={(e) =>
                                actualizarPlan(p.cluster, "drop_size_min", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Ventana de entrega</Label>
                            <Input
                              className="h-9"
                              value={p.ventana_entrega ?? ""}
                              onChange={(e) =>
                                actualizarPlan(p.cluster, "ventana_entrega", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Foco de servicio</Label>
                            <Input
                              className="h-9"
                              value={p.foco_servicio ?? ""}
                              onChange={(e) =>
                                actualizarPlan(p.cluster, "foco_servicio", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Mapa de clientes */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" style={{ color: PILAR_COLOR }} />
                  <CardTitle className="text-base">Mapa de clientes por clúster</CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={filtroCluster} onValueChange={(v) => setFiltroCluster(v ?? "todos")}>
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los clústeres</SelectItem>
                      {Object.keys(CLUSTER_META).map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                {CLUSTERS_PRINCIPALES.concat(["Nuevo", "Perdido"]).map((c) => (
                  <span key={c} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: CLUSTER_META[c]?.color }}
                    />
                    {c}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ClusterMapa filas={filasMapa} />
              <p className="pt-2 text-xs text-muted-foreground">
                Mostrando {fmtN(filasMapa.length)} clientes con ubicación
                {filtroCluster !== "todos" ? ` (clúster ${filtroCluster})` : ""}. {fmtN(conGeo)} de{" "}
                {fmtN(data.total)} clientes tienen coordenadas cargadas en Chess. Hacé clic en un
                punto para ver el detalle.
              </p>
            </CardContent>
          </Card>

          {/* Tabla de clientes */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">Clientes</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Buscar cliente / localidad…"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="h-9 w-56"
                  />
                  <Select value={filtroCluster} onValueChange={(v) => setFiltroCluster(v ?? "todos")}>
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los clústeres</SelectItem>
                      {Object.keys(CLUSTER_META).map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localidad</TableHead>
                      <TableHead className="text-center">P1→P2</TableHead>
                      <TableHead>Clúster</TableHead>
                      <TableHead className="text-right">Unid. P1</TableHead>
                      <TableHead className="text-right">Unid. P2</TableHead>
                      <TableHead className="text-right">RMD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filasFiltradas.map((f) => (
                      <TableRow key={f.id_cliente}>
                        <TableCell className="max-w-[220px] truncate">
                          <span className="text-xs text-slate-400">{f.id_cliente}</span>{" "}
                          {f.razon_social ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {f.des_localidad ?? "—"}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <span style={{ color: f.cl1 ? CLASE_COLOR[f.cl1] : undefined }}>
                            {f.cl1 ?? "·"}
                          </span>
                          {" → "}
                          <span style={{ color: f.cl2 ? CLASE_COLOR[f.cl2] : undefined }}>
                            {f.cl2 ?? "·"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            style={{
                              borderColor: CLUSTER_META[f.cluster]?.color,
                              color: CLUSTER_META[f.cluster]?.color,
                            }}
                          >
                            {f.cluster}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtN(f.u1)}</TableCell>
                        <TableCell className="text-right">{fmtN(f.u2)}</TableCell>
                        <TableCell className="text-right">
                          {f.rmd_prom ?? "—"}
                          {f.rmd_bajos > 0 && (
                            <span className="ml-1 text-xs text-red-500">({f.rmd_bajos})</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filasFiltradas.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados.</p>
              )}
              {(data.filas?.length ?? 0) > filasFiltradas.length && filtroCluster === "todos" && !busqueda && (
                <p className="pt-3 text-center text-xs text-muted-foreground">
                  Mostrando 500 de {fmtN(data.filas.length)} · exportá el CSV para ver todos.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
