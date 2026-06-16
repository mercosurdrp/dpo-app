"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowLeft, Fuel, Loader2, RefreshCw } from "lucide-react"
import { PlanesAccionFlota } from "../_components/planes-accion-flota"

const CAMION_COLOR = "#1D4ED8" // azul (gas oil)
const AUTO_COLOR = "#0D9488" // teal (nafta)
const COSTO_COLOR = "#9D174D"

// Flota vigente (16 camiones) — misma lista que la pestaña Mantenimiento.
// Fuente: FLOTA QUILMES ACTUALIZADA AL 31-05-2026.xlsx.
const PATENTES_FLOTA = new Set([
  "OJA408", "FUB570", "AF399KW", "HJR136", "OTY696", "FTI792", "OTB032",
  "AB386KV", "AB386KU", "AE445WS", "AE445WT", "AE591EV", "AE523XP",
  "AF399KX", "AF552QZ", "AF399KZ",
])
// Autoelevadores vigentes (el TOYOTA3 se vendió, no se muestra).
const AUTOELEVADORES = new Set(["TOYOTA4", "TOYOTA5", "TOYOTA6"])
const esAutoelevador = (patente: string) => AUTOELEVADORES.has((patente || "").toUpperCase())
// Urea (AdBlue) y aceite no son combustible: quedan fuera del consumo.
const COMBUSTIBLES_REALES = new Set(["GasOil", "NAFTA", "GAS"])

const fmtPlata = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})
const fmtNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })
const fmtDec = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
function fmtCorto(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`
  return `${Math.round(n)}`
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
function etiquetaMes(ym: string) {
  const [a, m] = ym.split("-")
  return `${MESES[Number(m) - 1]} ${a}`
}
function etiquetaMesCorto(ym: string) {
  const [a, m] = ym.split("-")
  return `${(MESES[Number(m) - 1] || "").slice(0, 3)} ${a.slice(2)}`
}
function fmtFecha(iso: string) {
  if (!iso) return "—"
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
function normSucursal(s: string | null) {
  if (!s) return null
  if (/^iguaz/i.test(s)) return "Iguazú"
  if (/^eldorado/i.test(s)) return "Eldorado"
  return s
}

const METRICAS = [
  { key: "litros" as const, label: "Litros", fmt: (v: number) => fmtNum.format(v) },
  { key: "costo" as const, label: "Costo", fmt: (v: number) => `$${fmtCorto(v)}` },
]
type MetricaKey = (typeof METRICAS)[number]["key"]

const GRUPOS = [
  { key: "camiones" as const, titulo: "Camiones", combustible: "Gas Oil", color: CAMION_COLOR, foto: "/camion.jpg" },
  { key: "autoelevadores" as const, titulo: "Autoelevadores Toyota", combustible: "Nafta", color: AUTO_COLOR, foto: "/autoelevador.jpg" },
]
type GrupoKey = (typeof GRUPOS)[number]["key"]

interface Entrada {
  numero: number
  patente: string
  fecha: string
  litros: number
  costo: number
  km: number
  horas: number
  horimetro: number | null
  combustible: string | null
  chofer: string | null
  sucursal: string | null
}
interface CombustibleData {
  ok: boolean
  entradas: Entrada[]
  actualizado?: string | null
  parcial?: boolean
  cacheado?: boolean
  error?: string
}

interface SerieCol {
  clave: string
  label: string
  litros: number
  costo: number
  km: number
  horas: number
  cargas: number
}

type OrdenCol = "patente" | "cargas" | "litros" | "km" | "kmxl" | "costo" | "costoKm"

export function CombustibleFlotaClient() {
  const [data, setData] = useState<CombustibleData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [progreso, setProgreso] = useState<string | null>(null)
  const [sucursal, setSucursal] = useState("__all__")
  const [mes, setMes] = useState("__all__")
  const [dia, setDia] = useState("__all__")
  const [grupo, setGrupo] = useState<GrupoKey>("camiones")
  const [metrica, setMetrica] = useState<MetricaKey>("litros")
  const [ordenCamion, setOrdenCamion] = useState<{ col: OrdenCol; desc: boolean }>({ col: "litros", desc: true })
  const pedidos = useRef(0)

  // `forzar` = botón Sincronizar: saltea el TTL y trae lo nuevo de Cloudfleet.
  // Replica la carga incremental: si la respuesta vino `parcial`, vuelve a
  // pedir con seguir=1 hasta completar (máx. 6 vueltas).
  const cargar = useCallback(async (forzar = false) => {
    pedidos.current = 0
    setCargando(true)
    setError(null)
    setProgreso(forzar ? "Sincronizando con Cloud Fleet…" : null)
    const pedir = async (seguir: boolean) => {
      try {
        const qs = seguir || forzar ? "?seguir=1" : ""
        const r = await fetch(`/api/flota-combustible${qs}`, { cache: "no-store" })
        const j: CombustibleData = await r.json()
        if (!j.ok) throw new Error(j.error || "Error al leer las cargas")
        setData(j)
        if (j.parcial && pedidos.current < 6) {
          pedidos.current += 1
          setProgreso(
            `Armando histórico de combustible… ${(j.entradas?.length || 0).toLocaleString("es-AR")} cargas leídas`
          )
          await pedir(true)
        } else {
          setProgreso(null)
          setCargando(false)
        }
      } catch (e) {
        setError(String((e as Error).message || e))
        setCargando(false)
      }
    }
    await pedir(false)
  }, [])

  useEffect(() => {
    cargar(false)
  }, [cargar])

  // Solo combustible real (sin urea/aceite) de camiones de la flota o autoelevadores.
  const entradas = useMemo(
    () =>
      (data?.entradas || []).filter(
        (e) =>
          COMBUSTIBLES_REALES.has(e.combustible || "") &&
          (PATENTES_FLOTA.has(e.patente) || esAutoelevador(e.patente))
      ),
    [data]
  )

  const meses = useMemo(
    () => [...new Set(entradas.map((e) => (e.fecha || "").slice(0, 7)).filter(Boolean))].sort().reverse(),
    [entradas]
  )
  const dias = useMemo(
    () =>
      mes !== "__all__"
        ? [...new Set(entradas.map((e) => e.fecha).filter((f) => f && f.startsWith(mes)))].sort().reverse()
        : [],
    [entradas, mes]
  )

  // Base = filtros de sucursal + período aplicados (los dos grupos juntos).
  const base = useMemo(
    () =>
      entradas.filter((e) => {
        if (sucursal !== "__all__" && normSucursal(e.sucursal) !== sucursal) return false
        if (dia !== "__all__") return e.fecha === dia
        if (mes !== "__all__") return (e.fecha || "").startsWith(mes)
        return true
      }),
    [entradas, sucursal, mes, dia]
  )

  const camiones = useMemo(() => base.filter((e) => PATENTES_FLOTA.has(e.patente)), [base])
  const autoelevadores = useMemo(() => base.filter((e) => esAutoelevador(e.patente)), [base])
  const entradasGrupo = grupo === "camiones" ? camiones : autoelevadores

  // Totales por grupo para las tarjetas selectoras.
  const totalesGrupo = useMemo(() => {
    const t: Record<string, { litros: number; costo: number; cargas: number }> = {}
    for (const g of GRUPOS) {
      const arr = g.key === "camiones" ? camiones : autoelevadores
      let litros = 0, costo = 0
      for (const e of arr) {
        litros += e.litros || 0
        costo += e.costo || 0
      }
      t[g.key] = { litros, costo, cargas: arr.length }
    }
    return t
  }, [camiones, autoelevadores])

  const resumen = useMemo(() => {
    let litros = 0, costo = 0, km = 0, horas = 0
    for (const e of entradasGrupo) {
      litros += e.litros || 0
      costo += e.costo || 0
      km += e.km || 0
      horas += e.horas || 0
    }
    return {
      litros,
      costo,
      km,
      horas,
      kmxl: litros > 0 && km > 0 ? km / litros : null,
      lph: horas > 0 ? litros / horas : null,
      costoLitro: litros > 0 ? costo / litros : null,
      cargas: entradasGrupo.length,
    }
  }, [entradasGrupo])

  // Consumo por camión.
  const porCamion = useMemo(() => {
    const m = new Map<string, { patente: string; sucursal: string | null; cargas: number; litros: number; km: number; costo: number }>()
    for (const e of camiones) {
      if (!m.has(e.patente))
        m.set(e.patente, { patente: e.patente, sucursal: null, cargas: 0, litros: 0, km: 0, costo: 0 })
      const g = m.get(e.patente)!
      g.cargas += 1
      g.litros += e.litros || 0
      g.km += e.km || 0
      g.costo += e.costo || 0
      if (e.sucursal) g.sucursal = normSucursal(e.sucursal)
    }
    const arr = [...m.values()].map((g) => ({
      ...g,
      kmxl: g.litros > 0 && g.km > 0 ? g.km / g.litros : null,
      costoKm: g.km > 0 ? g.costo / g.km : null,
    }))
    const { col, desc } = ordenCamion
    arr.sort((a, b) => {
      const va = (a as Record<OrdenCol, unknown>)[col] ?? -Infinity
      const vb = (b as Record<OrdenCol, unknown>)[col] ?? -Infinity
      if (typeof va === "string") return desc ? (vb as string).localeCompare(va) : va.localeCompare(vb as string)
      return desc ? (vb as number) - (va as number) : (va as number) - (vb as number)
    })
    return arr
  }, [camiones, ordenCamion])

  // Consumo por chofer (del grupo elegido).
  const porChofer = useMemo(() => {
    const m = new Map<string, { chofer: string; cargas: number; litros: number; costo: number; km: number }>()
    for (const e of entradasGrupo) {
      const c = e.chofer || "(sin chofer)"
      if (!m.has(c)) m.set(c, { chofer: c, cargas: 0, litros: 0, costo: 0, km: 0 })
      const g = m.get(c)!
      g.cargas += 1
      g.litros += e.litros || 0
      g.costo += e.costo || 0
      g.km += e.km || 0
    }
    return [...m.values()]
      .map((g) => ({ ...g, kmxl: g.litros > 0 && g.km > 0 ? g.km / g.litros : null }))
      .sort((a, b) => b.litros - a.litros)
  }, [entradasGrupo])

  // Autoelevadores: consumo en litros y horas → litros por hora.
  const porAutoelevador = useMemo(() => {
    const m = new Map<string, { patente: string; cargas: number; litros: number; horas: number; costo: number; horimetro: number | null }>()
    for (const e of autoelevadores) {
      if (!m.has(e.patente))
        m.set(e.patente, { patente: e.patente, cargas: 0, litros: 0, horas: 0, costo: 0, horimetro: null })
      const g = m.get(e.patente)!
      g.cargas += 1
      g.litros += e.litros || 0
      g.horas += e.horas || 0
      g.costo += e.costo || 0
      if (e.horimetro != null) g.horimetro = Math.max(g.horimetro || 0, e.horimetro)
    }
    return [...m.values()]
      .map((g) => ({ ...g, lph: g.horas > 0 ? g.litros / g.horas : null }))
      .sort((a, b) => b.litros - a.litros)
  }, [autoelevadores])

  // Serie del gráfico: por mes (o por día si hay mes elegido), del grupo elegido.
  const serieCol = useMemo(() => {
    const porDia = mes !== "__all__"
    const m = new Map<string, SerieCol>()
    for (const e of entradasGrupo) {
      if (!e.fecha) continue
      const clave = porDia ? e.fecha : e.fecha.slice(0, 7)
      if (!m.has(clave))
        m.set(clave, {
          clave,
          label: porDia ? `${clave.slice(8, 10)}/${clave.slice(5, 7)}` : etiquetaMesCorto(clave),
          litros: 0, costo: 0, km: 0, horas: 0, cargas: 0,
        })
      const g = m.get(clave)!
      g.litros += e.litros || 0
      g.costo += e.costo || 0
      g.km += e.km || 0
      g.horas += e.horas || 0
      g.cargas += 1
    }
    return { arr: [...m.values()].sort((a, b) => a.clave.localeCompare(b.clave)), porDia }
  }, [entradasGrupo, mes])

  // Consumo por UNIDAD (una barra por camión / autoelevador) del grupo elegido,
  // ordenado de mayor a menor según la métrica (litros o costo).
  const consumoPorUnidad = useMemo(() => {
    const arr =
      grupo === "camiones"
        ? porCamion.map((c) => ({ label: c.patente, litros: c.litros, costo: c.costo, cargas: c.cargas, km: c.km, horas: 0 }))
        : porAutoelevador.map((a) => ({ label: a.patente, litros: a.litros, costo: a.costo, cargas: a.cargas, km: 0, horas: a.horas }))
    return [...arr].sort((a, b) => (b[metrica] as number) - (a[metrica] as number))
  }, [grupo, porCamion, porAutoelevador, metrica])

  const grupoDef = GRUPOS.find((g) => g.key === grupo)!
  const met = METRICAS.find((x) => x.key === metrica)!
  const periodoTexto =
    dia !== "__all__" ? fmtFecha(dia) : mes !== "__all__" ? etiquetaMes(mes) : "año 2026"

  const ordenar = (col: OrdenCol) =>
    setOrdenCamion((o) => ({ col, desc: o.col === col ? !o.desc : true }))
  const flecha = (col: OrdenCol) =>
    ordenCamion.col === col ? (ordenCamion.desc ? " ▾" : " ▴") : ""

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href={`/indicadores/df74e60b-bff9-4d87-ae16-edf0bb8bfe87`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Flota
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
            <Fuel className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Combustible — Consumo y costos</h1>
            <p className="text-sm text-muted-foreground">
              Cargas de Cloudfleet (año 2026) — camiones y autoelevadores por separado
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => cargar(true)} disabled={cargando}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {cargando ? "Sincronizando…" : "Sincronizar"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Cargas de combustible de Cloudfleet, año 2026 (urea y aceite quedan afuera).
        {data?.actualizado && (
          <>
            {" "}Actualizado{" "}
            {new Date(data.actualizado).toLocaleString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
            })}
            .
          </>
        )}
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={sucursal} onValueChange={(v) => setSucursal(v ?? "__all__")}>
          <SelectTrigger className="h-9 w-[170px] font-semibold">
            <SelectValue placeholder="Sucursal">
              {(v) => (v === "__all__" || v == null ? "Todas las sucursales" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las sucursales</SelectItem>
            <SelectItem value="Eldorado">Eldorado</SelectItem>
            <SelectItem value="Iguazú">Iguazú</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={mes}
          onValueChange={(v) => {
            setMes(v ?? "__all__")
            setDia("__all__")
          }}
        >
          <SelectTrigger className="h-9 w-[170px] font-semibold">
            <SelectValue placeholder="Mes">
              {(v) => (v === "__all__" || v == null ? "Todos los meses" : etiquetaMes(String(v)))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los meses</SelectItem>
            {meses.map((m) => (
              <SelectItem key={m} value={m}>{etiquetaMes(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dia} onValueChange={(v) => setDia(v ?? "__all__")} disabled={mes === "__all__"}>
          <SelectTrigger className="h-9 w-[150px] font-semibold">
            <SelectValue placeholder="Día">
              {(v) =>
                v === "__all__" || v == null
                  ? mes !== "__all__"
                    ? "Todos los días"
                    : "Elegí un mes"
                  : fmtFecha(String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{mes !== "__all__" ? "Todos los días" : "Elegí un mes"}</SelectItem>
            {dias.map((d) => (
              <SelectItem key={d} value={d}>{fmtFecha(d)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(cargando || progreso) && (
        <div className="rounded-md border bg-slate-50 px-3 py-8 text-center text-sm text-muted-foreground">
          {progreso ||
            "Cargando cargas de combustible desde Cloudfleet… La primera vez arma el año 2026 completo y puede tardar un par de minutos; después queda guardado."}
        </div>
      )}

      {!cargando && !error && (
        <>
          {/* Tarjetas selectoras: Camiones (Gas Oil) · Autoelevadores (Nafta) */}
          <div className="grid gap-4 sm:grid-cols-2">
            {GRUPOS.map((g) => {
              const t = totalesGrupo[g.key]
              const activa = grupo === g.key
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`rounded-xl border bg-white p-4 text-left transition-colors hover:bg-slate-50 ${
                    activa ? "ring-2 ring-offset-1" : ""
                  }`}
                  style={activa ? { borderColor: g.color, boxShadow: `0 0 0 1px ${g.color}` } : undefined}
                  onClick={() => setGrupo(g.key)}
                >
                  <div className="flex items-center gap-3">
                    <Image
                      src={g.foto}
                      alt={g.titulo}
                      width={96}
                      height={64}
                      className="h-16 w-24 shrink-0 rounded-lg object-cover"
                    />
                    <div>
                      <div className="font-semibold" style={{ color: g.color }}>
                        {g.titulo} · {g.combustible}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {fmtNum.format(t.litros)} L en {t.cargas} cargas · {fmtPlata.format(t.costo)}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Tarjetas resumen del grupo elegido */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Litros</p>
                <p className="text-3xl font-bold text-slate-900">
                  {fmtNum.format(resumen.litros)} <span className="text-base font-normal text-muted-foreground">L</span>
                </p>
                <p className="text-xs text-muted-foreground">{resumen.cargas} cargas · {periodoTexto}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Costo</p>
                <p className="text-3xl font-bold" style={{ color: COSTO_COLOR }}>{fmtPlata.format(resumen.costo)}</p>
                <p className="text-xs text-muted-foreground">{grupoDef.combustible.toLowerCase()}</p>
              </CardContent>
            </Card>
            {grupo === "camiones" ? (
              <>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Km recorridos</p>
                    <p className="text-3xl font-bold text-slate-900">
                      {fmtNum.format(resumen.km)} <span className="text-base font-normal text-muted-foreground">km</span>
                    </p>
                    <p className="text-xs text-muted-foreground">entre cargas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Km por litro</p>
                    <p className="text-3xl font-bold" style={{ color: CAMION_COLOR }}>
                      {resumen.kmxl != null ? fmtDec.format(resumen.kmxl) : "—"}{" "}
                      <span className="text-base font-normal text-muted-foreground">km/L</span>
                    </p>
                    <p className="text-xs text-muted-foreground">flota completa</p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Horas de uso</p>
                    <p className="text-3xl font-bold text-slate-900">
                      {fmtNum.format(resumen.horas)} <span className="text-base font-normal text-muted-foreground">hs</span>
                    </p>
                    <p className="text-xs text-muted-foreground">por horímetro</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Litros por hora</p>
                    <p className="text-3xl font-bold" style={{ color: AUTO_COLOR }}>
                      {resumen.lph != null ? fmtDec.format(resumen.lph) : "—"}{" "}
                      <span className="text-base font-normal text-muted-foreground">L/h</span>
                    </p>
                    <p className="text-xs text-muted-foreground">los 3 equipos</p>
                  </CardContent>
                </Card>
              </>
            )}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Costo por litro</p>
                <p className="text-3xl font-bold text-slate-900">
                  {resumen.costoLitro != null ? fmtPlata.format(resumen.costoLitro) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">promedio del período</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico de columnas del grupo elegido */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-900">
                  {met.label} · {grupoDef.titulo}{" "}
                  {mes !== "__all__" ? `· ${etiquetaMes(mes)} (por día)` : "(por mes)"}
                  {sucursal !== "__all__" ? ` · ${sucursal}` : ""}
                </h2>
                <div className="flex gap-2">
                  {METRICAS.map((mt) => (
                    <Button
                      key={mt.key}
                      size="sm"
                      variant={metrica === mt.key ? "default" : "outline"}
                      onClick={() => setMetrica(mt.key)}
                    >
                      {mt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Elegí un mes en los filtros para abrirlo por día.
              </p>
              {serieCol.arr.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin datos para graficar.</p>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serieCol.arr} margin={{ top: 22, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => met.fmt(v as number)} tick={{ fontSize: 12 }} width={56} />
                      <Tooltip content={<ColTooltip grupo={grupo} grupoDef={grupoDef} />} />
                      <Bar dataKey={metrica} name={met.label} fill={grupoDef.color} radius={[3, 3, 0, 0]}>
                        <LabelList
                          dataKey={metrica}
                          position="top"
                          formatter={(v: unknown) => met.fmt(Number(v))}
                          style={{ fontSize: 11, fill: "#475569" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfico de consumo POR UNIDAD (una barra por camión / autoelevador) */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Image
                    src={grupoDef.foto}
                    alt={grupoDef.titulo}
                    width={40}
                    height={28}
                    className="h-7 w-10 rounded object-cover"
                  />
                  {met.label} por {grupo === "camiones" ? "camión" : "autoelevador"} · {periodoTexto}
                  {sucursal !== "__all__" ? ` · ${sucursal}` : ""}
                </h2>
                <div className="flex gap-2">
                  {METRICAS.map((mt) => (
                    <Button
                      key={mt.key}
                      size="sm"
                      variant={metrica === mt.key ? "default" : "outline"}
                      onClick={() => setMetrica(mt.key)}
                    >
                      {mt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Ranking de {grupo === "camiones" ? "camiones" : "equipos"} por {met.label.toLowerCase()} en el período (de mayor a menor).
              </p>
              {consumoPorUnidad.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin datos para graficar.</p>
              ) : (
                <div className="w-full" style={{ height: Math.max(220, consumoPorUnidad.length * 38) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={consumoPorUnidad}
                      margin={{ top: 4, right: 60, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => met.fmt(v as number)}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis type="category" dataKey="label" width={86} tick={{ fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "#F1F5F9" }} content={<UnidadTooltip grupo={grupo} />} />
                      <Bar dataKey={metrica} name={met.label} fill={grupoDef.color} radius={[0, 3, 3, 0]}>
                        <LabelList
                          dataKey={metrica}
                          position="right"
                          formatter={(v: unknown) => met.fmt(Number(v))}
                          style={{ fontSize: 11, fill: "#475569" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {grupo === "camiones" ? (
            <>
              {/* Consumo por camión */}
              <Card>
                <CardContent className="pt-6">
                  <h2 className="font-semibold text-slate-900">Consumo por camión ({porCamion.length})</h2>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Flota vigente (16 unidades) · tocá un encabezado para ordenar · período: {periodoTexto}.
                  </p>
                  {porCamion.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Sin cargas para esos filtros.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <ThSort onClick={() => ordenar("patente")}>Patente{flecha("patente")}</ThSort>
                            <TableHead>Sucursal</TableHead>
                            <ThSort num onClick={() => ordenar("cargas")}>Cargas{flecha("cargas")}</ThSort>
                            <ThSort num onClick={() => ordenar("litros")}>Litros{flecha("litros")}</ThSort>
                            <ThSort num onClick={() => ordenar("km")}>Km{flecha("km")}</ThSort>
                            <ThSort num onClick={() => ordenar("kmxl")}>Km/L{flecha("kmxl")}</ThSort>
                            <ThSort num onClick={() => ordenar("costo")}>Costo{flecha("costo")}</ThSort>
                            <ThSort num onClick={() => ordenar("costoKm")}>$/Km{flecha("costoKm")}</ThSort>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {porCamion.map((c) => (
                            <TableRow key={c.patente}>
                              <TableCell className="font-semibold">
                                <span className="flex items-center gap-2">
                                  <Image
                                    src="/camion.jpg"
                                    alt="Camión"
                                    width={40}
                                    height={28}
                                    className="h-7 w-10 rounded object-cover"
                                  />
                                  {c.patente}
                                </span>
                              </TableCell>
                              <TableCell>{c.sucursal ? <Badge variant="secondary">{c.sucursal}</Badge> : "—"}</TableCell>
                              <TableCell className="text-right">{c.cargas}</TableCell>
                              <TableCell className="text-right">{fmtNum.format(c.litros)} L</TableCell>
                              <TableCell className="text-right">{fmtNum.format(c.km)}</TableCell>
                              <TableCell className="text-right font-semibold">{c.kmxl != null ? fmtDec.format(c.kmxl) : "—"}</TableCell>
                              <TableCell className="text-right">{fmtPlata.format(c.costo)}</TableCell>
                              <TableCell className="text-right">{c.costoKm != null ? fmtPlata.format(c.costoKm) : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Consumo por chofer */}
              <Card>
                <CardContent className="pt-6">
                  <h2 className="font-semibold text-slate-900">Consumo por chofer ({porChofer.length})</h2>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Quién cargó combustible en los camiones · período: {periodoTexto}.
                  </p>
                  {porChofer.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Sin cargas para esos filtros.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Chofer</TableHead>
                            <TableHead className="text-right">Cargas</TableHead>
                            <TableHead className="text-right">Litros</TableHead>
                            <TableHead className="text-right">Km</TableHead>
                            <TableHead className="text-right">Km/L</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {porChofer.map((c) => (
                            <TableRow key={c.chofer}>
                              <TableCell>👤 {c.chofer}</TableCell>
                              <TableCell className="text-right">{c.cargas}</TableCell>
                              <TableCell className="text-right">{fmtNum.format(c.litros)} L</TableCell>
                              <TableCell className="text-right">{fmtNum.format(c.km)}</TableCell>
                              <TableCell className="text-right font-semibold">{c.kmxl != null ? fmtDec.format(c.kmxl) : "—"}</TableCell>
                              <TableCell className="text-right">{fmtPlata.format(c.costo)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Consumo por autoelevador */}
              <Card>
                <CardContent className="pt-6">
                  <h2 className="font-semibold text-slate-900">Consumo por equipo ({porAutoelevador.length})</h2>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Rendimiento por horímetro: litros por hora de uso · período: {periodoTexto}.
                  </p>
                  {porAutoelevador.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Sin cargas de autoelevadores para esos filtros.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Equipo</TableHead>
                            <TableHead className="text-right">Cargas</TableHead>
                            <TableHead className="text-right">Litros</TableHead>
                            <TableHead className="text-right">Horas de uso</TableHead>
                            <TableHead className="text-right">L/hora</TableHead>
                            <TableHead className="text-right">Horímetro</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {porAutoelevador.map((a) => (
                            <TableRow key={a.patente}>
                              <TableCell className="font-semibold">
                                <span className="flex items-center gap-2">
                                  <Image
                                    src="/autoelevador.jpg"
                                    alt="Autoelevador"
                                    width={40}
                                    height={28}
                                    className="h-7 w-10 rounded object-cover"
                                  />
                                  {a.patente}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{a.cargas}</TableCell>
                              <TableCell className="text-right">{fmtNum.format(a.litros)} L</TableCell>
                              <TableCell className="text-right">{fmtNum.format(a.horas)} hs</TableCell>
                              <TableCell className="text-right font-semibold">{a.lph != null ? fmtDec.format(a.lph) : "—"}</TableCell>
                              <TableCell className="text-right">{a.horimetro != null ? fmtNum.format(a.horimetro) : "—"}</TableCell>
                              <TableCell className="text-right">{fmtPlata.format(a.costo)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quién cargó los autoelevadores */}
              <Card>
                <CardContent className="pt-6">
                  <h2 className="font-semibold text-slate-900">Consumo por operario ({porChofer.length})</h2>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Quién cargó nafta en los autoelevadores · período: {periodoTexto}.
                  </p>
                  {porChofer.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Sin cargas para esos filtros.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Operario</TableHead>
                            <TableHead className="text-right">Cargas</TableHead>
                            <TableHead className="text-right">Litros</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {porChofer.map((c) => (
                            <TableRow key={c.chofer}>
                              <TableCell>👤 {c.chofer}</TableCell>
                              <TableCell className="text-right">{c.cargas}</TableCell>
                              <TableCell className="text-right">{fmtNum.format(c.litros)} L</TableCell>
                              <TableCell className="text-right">{fmtPlata.format(c.costo)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Planes de acción (independientes, propios de esta sección) */}
          <PlanesAccionFlota
            ambito="combustible"
            descripcion="Acciones sobre consumos atípicos o desvíos de combustible por unidad/chofer. No depende de los filtros: muestra siempre todos los planes."
          />

          <p className="text-xs text-muted-foreground">
            Las cargas salen de Cloudfleet (fuel-entries). Se excluyen urea y aceite. El km/litro de
            camiones y el litros/hora de autoelevadores se calculan con los recorridos entre cargas.
          </p>
        </>
      )}
    </div>
  )
}

function ThSort({
  children,
  num = false,
  onClick,
}: {
  children: React.ReactNode
  num?: boolean
  onClick: () => void
}) {
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-slate-900 ${num ? "text-right" : ""}`}
      onClick={onClick}
    >
      {children}
    </TableHead>
  )
}

function UnidadTooltip({
  active,
  payload,
  grupo,
}: {
  active?: boolean
  payload?: Array<{ payload: { label: string; litros: number; costo: number; cargas: number; km: number; horas: number } }>
  grupo: GrupoKey
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="max-w-[240px] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
        <Image
          src={grupo === "camiones" ? "/camion.jpg" : "/autoelevador.jpg"}
          alt=""
          width={28}
          height={18}
          className="h-[18px] w-7 rounded object-cover"
        />
        {d.label}
      </p>
      <p className="text-muted-foreground">Litros: {fmtNum.format(d.litros)} L</p>
      <p className="text-muted-foreground">Costo: {fmtPlata.format(d.costo)}</p>
      {grupo === "camiones" ? (
        <p className="text-muted-foreground">Km: {fmtNum.format(d.km)} km</p>
      ) : (
        <p className="text-muted-foreground">Horas: {fmtNum.format(d.horas)} hs</p>
      )}
      <p className="text-muted-foreground">Cargas: {d.cargas}</p>
    </div>
  )
}

function ColTooltip({
  active,
  payload,
  grupo,
  grupoDef,
}: {
  active?: boolean
  payload?: Array<{ payload: SerieCol }>
  grupo: GrupoKey
  grupoDef: (typeof GRUPOS)[number]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="max-w-[240px] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{d.label} · {grupoDef.titulo}</p>
      <p className="text-muted-foreground">Litros: {fmtNum.format(d.litros)} L</p>
      <p className="text-muted-foreground">Costo: {fmtPlata.format(d.costo)}</p>
      {grupo === "camiones" ? (
        <p className="text-muted-foreground">Km: {fmtNum.format(d.km)} km</p>
      ) : (
        <p className="text-muted-foreground">Horas: {fmtNum.format(d.horas)} hs</p>
      )}
      <p className="text-muted-foreground">Cargas: {d.cargas}</p>
    </div>
  )
}
