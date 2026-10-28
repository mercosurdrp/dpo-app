"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import "leaflet/dist/leaflet.css"
import type * as Leaflet from "leaflet"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, MapPin, Info, RefreshCw, Lightbulb, MessageSquareText, Pencil } from "lucide-react"
import type { CostoMensual, KmCiudad } from "@/actions/costo-pdv"
import {
  getMapaCosto,
  renovarMapaCosto,
  getConclusionMapa,
  guardarConclusionMapa,
  type ConclusionMapa,
  type MapaCostoResultado,
  type PdvMapa,
} from "@/actions/costo-pdv-mapa"
import type { PeriodoMapaCosto } from "@/lib/fotos"
import { armarLectura, bandaDe, calcularCortes, type BandaKey, type Cortes } from "@/lib/costo-pdv-lectura"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

const fmtMoney = (n: number) =>
  "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0))
const fmtNum = (n: number, d = 0) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n || 0)

// Semáforo de costo/HL del mapa. Usa los mismos cortes que Detalle y Acumulado (piso de
// volumen = percentil 10 de HL; rojo = percentil 90 de costo/HL) y agrega el amarillo
// como la franja de atención entre el percentil 70 y el 90. Así el rojo del mapa es
// exactamente el "10% más caro" de las tablas, y el amarillo los que vienen detrás.
const BANDAS = [
  { key: "caro", label: "Caro", hint: "10% más caro (≥ p90 de costo/HL)", color: "#dc2626", text: "text-red-700", bg: "bg-red-50" },
  { key: "atencion", label: "Atención", hint: "entre el p70 y el p90 de costo/HL", color: "#f59e0b", text: "text-amber-700", bg: "bg-amber-50" },
  { key: "ok", label: "Normal", hint: "por debajo del p70 de costo/HL", color: "#16a34a", text: "text-green-700", bg: "bg-green-50" },
  { key: "bajo", label: "Bajo volumen", hint: "HL por debajo del p10: costo/HL no representativo", color: "#94a3b8", text: "text-slate-600", bg: "bg-slate-100" },
] as const
type Banda = (typeof BANDAS)[number]
const bandaPorKey = (k: BandaKey): Banda => BANDAS.find((b) => b.key === k) ?? BANDAS[2]

function clasificar(f: PdvMapa, c: Cortes): Banda {
  return bandaPorKey(bandaDe(f, c))
}

/** Período que muestra el mapa: un mes cargado o el acumulado del año. */
type Periodo = PeriodoMapaCosto
const clavePeriodo = (p: Periodo) => (p.tipo === "mes" ? `${p.anio}-${p.mes}` : `${p.anio}-ytd`)

interface Punto {
  f: PdvMapa
  lat: number
  lng: number
  banda: Banda
  puesto: number | null
}

interface ResumenCiudad {
  ciudad: string
  pdv: number
  geo: number
  caro: number
  atencion: number
  ok: number
  bajo: number
  hl: number
  costo: number
  pctCaro: number
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ESC[ch] ?? ch)

interface Props {
  costos: CostoMensual[]
  sel: { anio: number; mes: number } | null
  kmCiudades: KmCiudad[]
  canEdit: boolean
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

export function MapaTab({ costos, sel, kmCiudades, canEdit }: Props) {
  const anios = useMemo(() => [...new Set(costos.map((c) => c.anio))].sort((a, b) => b - a), [costos])
  const [periodo, setPeriodo] = useState<Periodo | null>(
    sel ? { tipo: "mes", anio: sel.anio, mes: sel.mes } : anios[0] ? { tipo: "ytd", anio: anios[0] } : null,
  )
  // Una foto por período, cacheada en memoria mientras la solapa está abierta.
  const [fotos, setFotos] = useState<Record<string, MapaCostoResultado>>({})
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [renovando, setRenovando] = useState(false)
  const [bandasActivas, setBandasActivas] = useState<Set<BandaKey>>(new Set(BANDAS.map((b) => b.key)))
  const [ciudadSel, setCiudadSel] = useState<string | null>(null)

  const kmPorCiudad = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of kmCiudades) m.set(k.ciudad, k.km)
    return m
  }, [kmCiudades])

  const foto = periodo ? (fotos[clavePeriodo(periodo)] ?? null) : null
  const filas = useMemo<PdvMapa[] | null>(() => (periodo ? (foto?.datos.puntos ?? null) : []), [periodo, foto])

  // Lee la foto del período (si no existe, el servidor la calcula y la guarda).
  useEffect(() => {
    if (!periodo || foto) return
    const clave = clavePeriodo(periodo)
    startTransition(async () => {
      const res = await getMapaCosto(periodo)
      if ("error" in res) {
        setErrorCarga(res.error)
        return
      }
      setErrorCarga(null)
      setFotos((c) => ({ ...c, [clave]: res.data }))
    })
  }, [periodo, foto])

  async function renovar() {
    if (!periodo || renovando) return
    setRenovando(true)
    const res = await renovarMapaCosto(periodo)
    setRenovando(false)
    if ("error" in res) {
      setErrorCarga(res.error)
      return
    }
    setErrorCarga(null)
    setFotos((c) => ({ ...c, [clavePeriodo(periodo)]: res.data }))
  }

  const cortes = useMemo<Cortes>(() => calcularCortes(filas ?? []), [filas])

  // Período anterior (sólo para un mes): el mes cargado inmediatamente previo, para
  // el movimiento de rojos de la lectura. Se lee de su foto (ya existe).
  const periodoPrevio = useMemo<Periodo | null>(() => {
    if (!periodo || periodo.tipo !== "mes") return null
    const i = costos.findIndex((c) => c.anio === periodo.anio && c.mes === periodo.mes)
    const prev = i >= 0 ? costos[i + 1] : undefined // costos viene del más reciente al más viejo
    return prev ? { tipo: "mes", anio: prev.anio, mes: prev.mes } : null
  }, [periodo, costos])
  const fotoPrevia = periodoPrevio ? (fotos[clavePeriodo(periodoPrevio)] ?? null) : null

  useEffect(() => {
    if (!periodoPrevio || fotoPrevia) return
    const clave = clavePeriodo(periodoPrevio)
    let cancel = false
    ;(async () => {
      const res = await getMapaCosto(periodoPrevio)
      if (cancel || "error" in res) return
      setFotos((c) => ({ ...c, [clave]: res.data }))
    })()
    return () => {
      cancel = true
    }
  }, [periodoPrevio, fotoPrevia])

  const lectura = useMemo(
    () =>
      filas && filas.length > 0
        ? armarLectura(
            filas,
            kmPorCiudad,
            fotoPrevia?.datos.puntos ?? null,
            periodoPrevio?.tipo === "mes" ? `${MESES[periodoPrevio.mes - 1]} ${periodoPrevio.anio}` : null,
          )
        : null,
    [filas, kmPorCiudad, fotoPrevia, periodoPrevio],
  )
  const nuevosRojos = useMemo(() => new Set(lectura?.nuevosRojos ?? []), [lectura])
  const [soloNuevos, setSoloNuevos] = useState(false)

  // Conclusión escrita del período.
  const [conclusiones, setConclusiones] = useState<Record<string, ConclusionMapa | null>>({})
  const [errorConclusion, setErrorConclusion] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState("")
  const [guardando, setGuardando] = useState(false)
  const claveActual = periodo ? clavePeriodo(periodo) : null
  const conclusion = claveActual ? (conclusiones[claveActual] ?? null) : null
  const conclusionCargada = claveActual ? claveActual in conclusiones : false

  useEffect(() => {
    if (!periodo || conclusionCargada) return
    const clave = clavePeriodo(periodo)
    let cancel = false
    ;(async () => {
      const res = await getConclusionMapa(periodo)
      if (cancel) return
      if ("error" in res) {
        setErrorConclusion(res.error)
        setConclusiones((c) => ({ ...c, [clave]: null }))
        return
      }
      setErrorConclusion(null)
      setConclusiones((c) => ({ ...c, [clave]: res.data }))
    })()
    return () => {
      cancel = true
    }
  }, [periodo, conclusionCargada])

  // Al cambiar de período se cierra la edición.
  useEffect(() => {
    setEditando(false)
    setSoloNuevos(false)
  }, [claveActual])

  async function guardarConclusion() {
    if (!periodo) return
    setGuardando(true)
    const res = await guardarConclusionMapa(periodo, borrador)
    setGuardando(false)
    if ("error" in res) {
      setErrorConclusion(res.error)
      return
    }
    setErrorConclusion(null)
    setConclusiones((c) => ({ ...c, [clavePeriodo(periodo)]: res.data }))
    setEditando(false)
  }

  // Puntos del mapa: filas con coordenada. Guarda también el puesto del ranking de costo/HL.
  const { puntos, sinGeo } = useMemo(() => {
    const out: Punto[] = []
    let sinGeo = 0
    const rank = new Map<number, number>()
    ;(filas ?? [])
      .filter((f) => clasificar(f, cortes).key !== "bajo")
      .sort((a, b) => b.costo_x_hl - a.costo_x_hl)
      .forEach((f, i) => rank.set(f.id, i + 1))
    for (const f of filas ?? []) {
      if (f.lat == null || f.lng == null) {
        sinGeo++
        continue
      }
      out.push({ f, lat: f.lat, lng: f.lng, banda: clasificar(f, cortes), puesto: rank.get(f.id) ?? null })
    }
    return { puntos: out, sinGeo }
  }, [filas, cortes])

  const resumenCiudades = useMemo<ResumenCiudad[]>(() => {
    const m = new Map<string, ResumenCiudad>()
    for (const f of filas ?? []) {
      const r = m.get(f.ciudad) ?? {
        ciudad: f.ciudad, pdv: 0, geo: 0, caro: 0, atencion: 0, ok: 0, bajo: 0, hl: 0, costo: 0, pctCaro: 0,
      }
      r.pdv++
      r[clasificar(f, cortes).key]++
      r.hl += f.hl
      r.costo += f.costo_total
      if (f.lat != null) r.geo++
      m.set(f.ciudad, r)
    }
    return [...m.values()]
      .map((r) => ({ ...r, pctCaro: r.pdv - r.bajo > 0 ? (r.caro / (r.pdv - r.bajo)) * 100 : 0 }))
      .sort((a, b) => b.hl - a.hl)
  }, [filas, cortes])

  const visibles = useMemo(
    () =>
      puntos.filter(
        (p) =>
          bandasActivas.has(p.banda.key) &&
          (!ciudadSel || p.f.ciudad === ciudadSel) &&
          (!soloNuevos || nuevosRojos.has(p.f.id)),
      ),
    [puntos, bandasActivas, ciudadSel, soloNuevos, nuevosRojos],
  )

  // ── Leaflet ──────────────────────────────────────────────────────────────
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapObj = useRef<Leaflet.Map | null>(null)
  const capa = useRef<Leaflet.LayerGroup | null>(null)
  const Lref = useRef<typeof Leaflet | null>(null)
  const [mapaListo, setMapaListo] = useState(false)
  const encuadrado = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !mapRef.current || mapObj.current) return
      Lref.current = L
      const m = L.map(mapRef.current, { preferCanvas: true, attributionControl: false }).setView([-33.6, -60.3], 9)
      // OpenStreetMap directo: los basemaps de CARTO devuelven "API key required"
      // cuando el pedido viene de producción (dominio vercel.app), aunque desde
      // local respondan. OSM no pide clave, sólo atribución.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m)
      L.control.attribution({ prefix: false }).addAttribution("© OpenStreetMap contributors").addTo(m)
      capa.current = L.layerGroup().addTo(m)
      mapObj.current = m
      setMapaListo(true)
    })()
    return () => {
      cancelled = true
      mapObj.current?.remove()
      mapObj.current = null
      capa.current = null
      setMapaListo(false)
    }
  }, [])

  // Redibuja los puntos cuando cambia el período o los filtros.
  useEffect(() => {
    const L = Lref.current
    const m = mapObj.current
    const g = capa.current
    if (!mapaListo || !L || !m || !g) return
    g.clearLayers()
    const maxHl = Math.max(1, ...visibles.map((p) => p.f.hl))
    // Los rojos arriba de todo para que no queden tapados por los verdes.
    const orden: Record<BandaKey, number> = { bajo: 0, ok: 1, atencion: 2, caro: 3 }
    const ordenados = [...visibles].sort((a, b) => orden[a.banda.key] - orden[b.banda.key])
    for (const p of ordenados) {
      const r = p.banda.key === "bajo" ? 3 : 4 + 7 * Math.sqrt(p.f.hl / maxHl)
      const cm = L.circleMarker([p.lat, p.lng], {
        radius: r,
        color: "#ffffff",
        weight: 1,
        fillColor: p.banda.color,
        fillOpacity: p.banda.key === "bajo" ? 0.5 : 0.85,
      })
      const drop = p.f.comprobantes ? p.f.bultos / p.f.comprobantes : 0
      cm.bindTooltip(
        `<div style="font-size:12px;line-height:1.35">` +
          `<div style="font-weight:600">${esc(p.f.nombre)} <span style="color:#64748b">· ${p.f.id}</span></div>` +
          `<div style="color:#64748b">${esc(p.f.ciudad)}</div>` +
          `<div><span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${p.banda.color};margin-right:4px"></span>${p.banda.label}${p.puesto ? ` · puesto ${p.puesto}` : ""}</div>` +
          `<div>Costo/HL <b>${fmtMoney(p.f.costo_x_hl)}</b> · HL ${fmtNum(p.f.hl, 1)}</div>` +
          `<div>Bultos ${fmtNum(p.f.bultos)} · Entregas ${fmtNum(p.f.comprobantes)} · Drop ${fmtNum(drop, 1)}</div>` +
          `<div>Costo total ${fmtMoney(p.f.costo_total)} · ${fmtNum(p.f.pct_venta, 1)}% de la venta</div>` +
          `</div>`,
        { sticky: true, direction: "top", opacity: 0.97 },
      )
      cm.addTo(g)
    }
    if (!encuadrado.current && visibles.length > 0) {
      m.fitBounds(L.latLngBounds(visibles.map((p) => [p.lat, p.lng] as [number, number])).pad(0.05))
      encuadrado.current = true
    }
  }, [visibles, mapaListo])

  // Al elegir una ciudad, el mapa hace zoom a sus puntos.
  function elegirCiudad(ciudad: string | null) {
    setCiudadSel(ciudad)
    const L = Lref.current
    const m = mapObj.current
    if (!L || !m) return
    const pts = puntos.filter((p) => !ciudad || p.f.ciudad === ciudad)
    if (pts.length === 0) return
    m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])).pad(0.1))
  }

  function toggleBanda(k: BandaKey) {
    setBandasActivas((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }

  const cargando = filas === null || isPending || renovando
  const totales = useMemo(() => {
    const t = { caro: 0, atencion: 0, ok: 0, bajo: 0 }
    for (const p of puntos) t[p.banda.key]++
    return t
  }, [puntos])

  if (costos.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Todavía no hay meses con costo cargado.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Selector de período: acumulado por año + meses cargados */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Período:</span>
        {anios.map((a) => (
          <button
            key={`ytd-${a}`}
            type="button"
            onClick={() => setPeriodo({ tipo: "ytd", anio: a })}
            className={`rounded-md border px-3 py-1 text-sm font-medium transition-colors ${
              periodo?.tipo === "ytd" && periodo.anio === a
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Acumulado {a}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {costos.map((c) => (
          <button
            key={`${c.anio}-${c.mes}`}
            type="button"
            onClick={() => setPeriodo({ tipo: "mes", anio: c.anio, mes: c.mes })}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              periodo?.tipo === "mes" && periodo.anio === c.anio && periodo.mes === c.mes
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {MESES[c.mes - 1]} {c.anio}
          </button>
        ))}
        {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {errorCarga && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{errorCarga}</p>
      )}

      {/* Leyenda / filtro por color */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {BANDAS.map((b) => {
          const activa = bandasActivas.has(b.key)
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => toggleBanda(b.key)}
              title={b.hint}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 transition-colors ${
                activa ? `${b.bg} ${b.text} border-transparent` : "border-slate-200 bg-white text-slate-400 line-through"
              }`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color, opacity: activa ? 1 : 0.4 }} />
              {b.label}
              <span className="tabular-nums font-semibold">{fmtNum(totales[b.key])}</span>
            </button>
          )
        })}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Cortes: amarillo desde {fmtMoney(cortes.p70)}/HL · rojo desde {fmtMoney(cortes.p90)}/HL · piso {fmtNum(cortes.floorHl, 1)} HL
        </span>
      </div>

      {/* Lectura automática del período */}
      {lectura && lectura.hallazgos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Lectura del período
              <span className="text-xs font-normal text-muted-foreground">
                La arma la app con la foto; la conclusión de gestión va abajo.
              </span>
              {nuevosRojos.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSoloNuevos((v) => !v)}
                  className={`ml-auto rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                    soloNuevos ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  }`}
                >
                  {soloNuevos ? "Ver todos" : `Ver sólo los ${nuevosRojos.size} nuevos en rojo`}
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5 text-sm">
              {lectura.hallazgos.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        h.tono === "mal" ? "#dc2626" : h.tono === "atencion" ? "#f59e0b" : h.tono === "bien" ? "#16a34a" : "#94a3b8",
                    }}
                  />
                  <span>{h.texto}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Mapa */}
        <Card className="overflow-hidden">
          <div className="relative">
            <div ref={mapRef} className="h-[620px] w-full bg-slate-100" />
            {cargando && (
              <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-white/40">
                <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
              </div>
            )}
            {ciudadSel && (
              <button
                type="button"
                onClick={() => elegirCiudad(null)}
                className="absolute left-3 top-3 z-[500] rounded-md border bg-white px-3 py-1 text-xs font-medium shadow-sm hover:bg-slate-50"
              >
                ← Todas las ciudades
              </button>
            )}
          </div>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-muted-foreground">
            <span>
              <MapPin className="mr-1 inline h-3.5 w-3.5" />
              {fmtNum(puntos.length)} PDV en el mapa{visibles.length !== puntos.length ? ` · ${fmtNum(visibles.length)} visibles` : ""}
            </span>
            {sinGeo > 0 && <span>{fmtNum(sinGeo)} PDV con costo pero sin coordenadas en Chess</span>}
            <span>El tamaño del punto es el volumen (HL); el color, el costo por HL.</span>
            {foto && (
              <span className="ml-auto inline-flex items-center gap-2">
                Foto del {fmtFecha(foto.generadoEn)}
                {canEdit && (
                  <button
                    type="button"
                    onClick={renovar}
                    disabled={renovando}
                    title="Vuelve a calcular el mapa de este período con el costo y las coordenadas actuales"
                    className="inline-flex items-center gap-1 rounded border bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${renovando ? "animate-spin" : ""}`} /> Renovar
                  </button>
                )}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Resumen por ciudad */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por ciudad</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cuántos PDV de cada color tiene cada ciudad. Clic para hacer zoom.
            </p>
          </CardHeader>
          <CardContent className="space-y-1 px-2 pb-3">
            {resumenCiudades.map((r) => {
              const rep = r.pdv - r.bajo
              const activa = ciudadSel === r.ciudad
              const km = kmPorCiudad.get(r.ciudad)
              return (
                <button
                  key={r.ciudad}
                  type="button"
                  onClick={() => elegirCiudad(activa ? null : r.ciudad)}
                  className={`block w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                    activa ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {r.ciudad}
                      {km !== undefined && (
                        <span className={`ml-1 text-xs ${activa ? "text-slate-300" : "text-muted-foreground"}`}>{fmtNum(km)} km</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">
                      {fmtNum(r.pdv)} PDV · <b>{fmtMoney(r.hl ? r.costo / r.hl : 0)}</b>/HL
                    </span>
                  </div>
                  <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    {rep > 0 && (
                      <>
                        <span style={{ width: `${(r.caro / r.pdv) * 100}%`, background: BANDAS[0].color }} />
                        <span style={{ width: `${(r.atencion / r.pdv) * 100}%`, background: BANDAS[1].color }} />
                        <span style={{ width: `${(r.ok / r.pdv) * 100}%`, background: BANDAS[2].color }} />
                        <span style={{ width: `${(r.bajo / r.pdv) * 100}%`, background: BANDAS[3].color }} />
                      </>
                    )}
                  </div>
                  <div className={`mt-0.5 flex items-center gap-3 text-[11px] tabular-nums ${activa ? "text-slate-300" : "text-muted-foreground"}`}>
                    <span style={{ color: activa ? undefined : BANDAS[0].color }}>{r.caro} rojos</span>
                    <span style={{ color: activa ? undefined : BANDAS[1].color }}>{r.atencion} amarillos</span>
                    <span style={{ color: activa ? undefined : BANDAS[2].color }}>{r.ok} verdes</span>
                    {r.bajo > 0 && <span>{r.bajo} bajo vol.</span>}
                    {r.pctCaro >= 25 && (
                      <Badge variant="destructive" className="ml-auto h-4 px-1.5 text-[10px]">
                        {fmtNum(r.pctCaro)}% rojo
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
            {resumenCiudades.length === 0 && !cargando && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">Sin datos para este período.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conclusión de gestión del período */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <MessageSquareText className="h-4 w-4 text-slate-500" />
            Conclusión {periodo?.tipo === "ytd" ? `del acumulado ${periodo.anio}` : periodo ? `de ${MESES[periodo.mes - 1]} ${periodo.anio}` : ""}
            {conclusion && !editando && (
              <span className="text-xs font-normal text-muted-foreground">
                {conclusion.autorNombre ? `${conclusion.autorNombre} · ` : ""}
                {fmtFecha(conclusion.actualizadoEn)}
              </span>
            )}
            {canEdit && !editando && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setBorrador(conclusion?.texto ?? "")
                  setEditando(true)
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> {conclusion ? "Editar" : "Escribir conclusión"}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {errorConclusion && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{errorConclusion}</p>
          )}
          {editando ? (
            <>
              <Textarea
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                rows={4}
                placeholder="Qué dice el mapa este período y qué se decide: ciudad o grupo de PDV a trabajar, con qué herramienta (ruta, orden mínima, frecuencia) y quién lo lleva."
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={guardarConclusion} disabled={guardando || !borrador.trim()}>
                  {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : conclusion ? (
            <p className="whitespace-pre-wrap text-sm">{conclusion.texto}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay conclusión para este período.
              {canEdit ? " Escribila con lo que dice la lectura y la decisión que se toma: queda como evidencia y se ve en la Reunión de Presupuesto." : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        El modelo reparte el costo de distancia por ciudad (km desde el CD) y el resto por bultos y paradas, así que
        entre ciudades pesa la distancia y dentro de una ciudad pesan el drop size y el volumen de cada PDV. Los
        percentiles se calculan sobre el período elegido: en el acumulado un PDV puede cambiar de color respecto de
        un mes suelto. El mapa queda fijo como foto y se vuelve a armar solo al cargar el costo de un mes.
      </p>
    </div>
  )
}
