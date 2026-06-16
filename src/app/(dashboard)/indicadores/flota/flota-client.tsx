"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowLeft, CarFront, Loader2, RefreshCw } from "lucide-react"
import { PlanesAccionFlota } from "./_components/planes-accion-flota"

const GREEN = "#10B981"
const AMBER = "#F59E0B"
const RED = "#EF4444"
const MUTED = "#94A3B8"

const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })
const nf3 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 })

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return arg.toISOString().slice(0, 10)
}
function restarDias(fechaISO: string, dias: number) {
  const d = new Date(fechaISO + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}
function primerDiaDelMes(fechaISO: string) {
  return fechaISO.slice(0, 8) + "01"
}

// Color de la disponibilidad: verde ≥95, ámbar 90–95, rojo <90.
function colorDisp(v: number | null) {
  if (v == null) return MUTED
  if (v >= 95) return GREEN
  if (v >= 90) return AMBER
  return RED
}
// Color de la probabilidad de falla (alto = malo): rojo ≥50, ámbar ≥20, verde <20.
function colorProb(p: number | null) {
  if (p == null) return MUTED
  if (p >= 50) return RED
  if (p >= 20) return AMBER
  return GREEN
}
// Probabilidad de falla en T días: 1 − e^(−λT), con λ = 1/MTBF(días).
function probFalla(mtbfDias: number | null, T: number) {
  if (!mtbfDias || mtbfDias <= 0 || !T) return 0
  return (1 - Math.exp(-T / mtbfDias)) * 100
}

interface Veh {
  patente: string
  tipo: string
  categoria: string
  marca: string
  linea: string
  sucursal: string
  fallas: number
  odometro: number
  downtime: number
  mtbf: number
  mtbfHoras: number | null
  mtbfDias: number | null
  mttr: number
  disponibilidad: number | null
}
interface MantData {
  ok: boolean
  actualizado: string | null
  desde: string
  hasta: string
  dias: number
  vehiculos: Veh[]
  cacheado?: boolean
  aproximado?: boolean
  error?: string
}

const CATEGORIAS = ["Camiones", "Camionetas", "Autoelevadores"]

export function FlotaIndicadoresClient() {
  const hoy = hoyArg()
  const [desde, setDesde] = useState(restarDias(hoy, 364))
  const [hasta, setHasta] = useState(hoy)
  const [sucursal, setSucursal] = useState("__all__")
  const [horizonte, setHorizonte] = useState(30)
  // Categorías visibles. Default: sólo Camiones.
  const [cats, setCats] = useState<Set<string>>(() => new Set(["Camiones"]))
  const [ordenCol, setOrdenCol] = useState("fallas")
  const [ordenDir, setOrdenDir] = useState<"asc" | "desc">("desc")
  const [graficoSel, setGraficoSel] = useState("flota")
  const [data, setData] = useState<MantData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rangos = [
    { key: "mes", label: "Mes", desde: primerDiaDelMes(hoy), hasta: hoy },
    { key: "trim", label: "Últimos 3 meses", desde: restarDias(hoy, 90), hasta: hoy },
    { key: "anio", label: "Últimos 12 meses", desde: restarDias(hoy, 364), hasta: hoy },
  ]
  const rangoActivo = rangos.find((r) => r.desde === desde && r.hasta === hasta)?.key

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/flota-mantenimiento?desde=${desde}&hasta=${hasta}`)
      const j: MantData = await r.json()
      if (!j.ok) throw new Error(j.error || "Error al traer datos")
      setData(j)
      // Para auditoría: si la respuesta vino de la copia guardada, SIEMPRE
      // refrescamos en vivo contra Cloudfleet por detrás (sin importar la
      // antigüedad) para mostrar el informe actualizado al instante.
      if (j.cacheado) {
        setRefrescando(true)
        fetch(`/api/flota-mantenimiento?desde=${desde}&hasta=${hasta}&fresco=1`)
          .then((r2) => r2.json())
          .then((j2: MantData) => {
            if (j2.ok) setData(j2)
          })
          .catch(() => {})
          .finally(() => setRefrescando(false))
      }
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const sucursales = useMemo(() => {
    const s = new Set((data?.vehiculos || []).map((v) => v.sucursal).filter(Boolean))
    return [...s].sort()
  }, [data])

  // Vehículos filtrados por sucursal y categorías visibles.
  const vehiculos = useMemo(() => {
    let v = data?.vehiculos || []
    if (sucursal !== "__all__") v = v.filter((x) => x.sucursal === sucursal)
    v = v.filter((x) => cats.has(x.categoria))
    return v
  }, [data, sucursal, cats])

  const valorOrden = (v: Veh): string | number => {
    switch (ordenCol) {
      case "patente": return v.patente || ""
      case "tipo": return v.tipo || ""
      case "sucursal": return v.sucursal || ""
      case "fallas": return v.fallas
      case "mtbfkm": return v.mtbf
      case "mtbfh": return v.mtbfHoras ?? -Infinity
      case "mttr": return v.mttr
      case "downtime": return v.downtime
      case "disp": return v.disponibilidad ?? -Infinity
      case "prob": return v.mtbfDias ? probFalla(v.mtbfDias, horizonte) : 0
      default: return 0
    }
  }
  const vehiculosOrdenados = useMemo(() => {
    const arr = [...vehiculos]
    const dir = ordenDir === "asc" ? 1 : -1
    arr.sort((a, b) => {
      const va = valorOrden(a), vb = valorOrden(b)
      if (typeof va === "string") return va.localeCompare(vb as string) * dir
      return ((va as number) - (vb as number)) * dir
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculos, ordenCol, ordenDir, horizonte])

  const ordenarPor = (col: string) => {
    if (ordenCol === col) setOrdenDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setOrdenCol(col); setOrdenDir("desc") }
  }
  const flecha = (col: string) => (ordenCol === col ? (ordenDir === "asc" ? " ▲" : " ▼") : "")

  const toggleCat = (c: string) =>
    setCats((prev) => {
      const n = new Set(prev)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })

  // KPIs de flota recalculados sobre lo filtrado.
  const kpi = useMemo(() => {
    const dias = data?.dias || 0
    const n = vehiculos.length
    const base = n * dias * 24
    const fallas = vehiculos.reduce((s, v) => s + v.fallas, 0)
    const odo = vehiculos.reduce((s, v) => s + v.odometro, 0)
    const downtime = vehiculos.reduce((s, v) => s + v.downtime, 0)
    const uptime = Math.max(0, base - downtime)
    const mtbfHoras = fallas ? uptime / fallas : null
    const mttr = fallas ? downtime / fallas : 0
    const mtbfDias = mtbfHoras != null ? mtbfHoras / 24 : null
    const lambdaFlota = vehiculos.reduce((s, v) => s + (v.mtbfDias ? 1 / v.mtbfDias : 0), 0)
    const esperadas = lambdaFlota * horizonte
    return {
      vehiculos: n,
      conFallas: vehiculos.filter((v) => v.fallas > 0).length,
      fallas,
      downtime,
      mtbf: fallas ? odo / fallas : 0,
      mtbfHoras,
      mtbfDias,
      mttr,
      disponibilidad: mtbfHoras != null ? (mtbfHoras / (mtbfHoras + mttr)) * 100 : 100,
      lambdaFlota,
      esperadas,
      probFlota: lambdaFlota > 0 ? (1 - Math.exp(-esperadas)) * 100 : 0,
    }
  }, [vehiculos, data, horizonte])

  // λ a graficar según el selector (flota completa o un vehículo).
  const graficoVeh = vehiculos.find((v) => v.patente === graficoSel)
  const lambdaGrafico =
    graficoSel === "flota"
      ? kpi.lambdaFlota
      : graficoVeh && graficoVeh.mtbfDias
      ? 1 / graficoVeh.mtbfDias
      : 0

  // Puntos de la curva F(t) = 1 − e^(−λt) para recharts.
  const curva = useMemo(() => {
    const lambda = lambdaGrafico
    const maxDias =
      lambda > 0
        ? Math.min(365, Math.max(Math.ceil(4.605 / lambda), Math.ceil(horizonte * 1.3), 30))
        : Math.max(horizonte * 2, 60)
    const N = 60
    const pts: { dia: number; prob: number }[] = []
    for (let i = 0; i <= N; i++) {
      const d = (i / N) * maxDias
      pts.push({ dia: Math.round(d), prob: lambda > 0 ? (1 - Math.exp(-lambda * d)) * 100 : 0 })
    }
    return pts
  }, [lambdaGrafico, horizonte])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-3 text-sky-600">
            <CarFront className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Indicadores de Flota</h1>
            <p className="text-sm text-muted-foreground">
              Mantenimiento y disponibilidad — datos en vivo de Cloudfleet
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Sincronizando…" : "Sincronizar"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {rangos.map((r) => (
          <Button
            key={r.key}
            size="sm"
            variant={rangoActivo === r.key ? "default" : "outline"}
            className="font-semibold"
            onClick={() => { setDesde(r.desde); setHasta(r.hasta) }}
          >
            {r.label}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {CATEGORIAS.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={cats.has(c) ? "default" : "outline"}
            className="font-semibold"
            onClick={() => toggleCat(c)}
          >
            {c}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Select value={sucursal} onValueChange={(v) => setSucursal(v ?? "__all__")}>
          <SelectTrigger className="h-9 w-[180px] font-semibold">
            <SelectValue placeholder="Sucursal">
              {(v) => (v === "__all__" || v == null ? "Todas las sucursales" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las sucursales</SelectItem>
            {sucursales.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          Prob. falla a
          <Input
            type="number"
            min={1}
            max={365}
            value={horizonte}
            onChange={(e) => setHorizonte(Math.max(1, Number(e.target.value) || 0))}
            className="h-9 w-16 font-semibold"
          />
          días
        </label>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Disponibilidad</p>
            <p className="text-3xl font-bold" style={{ color: colorDisp(kpi.disponibilidad) }}>
              {kpi.disponibilidad != null ? `${nf0.format(kpi.disponibilidad)}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">por tiempo calendario</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">MTBF (horas)</p>
            <p className="text-3xl font-bold text-slate-900">
              {kpi.mtbfHoras != null ? nf0.format(kpi.mtbfHoras) : "—"}
              <span className="ml-1 text-base font-normal text-muted-foreground">h</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {kpi.mtbfHoras != null
                ? `${nf0.format(kpi.mtbf)} km · ${nf0.format(kpi.mtbfDias ?? 0)} días entre fallas`
                : "sin fallas en el período"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">MTTR</p>
            <p className="text-3xl font-bold text-slate-900">{nf0.format(kpi.mttr)}</p>
            <p className="text-xs text-muted-foreground">horas por reparación</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Fallas</p>
            <p className="text-3xl font-bold text-slate-900">{nf0.format(kpi.fallas)}</p>
            <p className="text-xs text-muted-foreground">en el período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Horas en taller</p>
            <p className="text-3xl font-bold text-slate-900">{nf0.format(kpi.downtime)}</p>
            <p className="text-xs text-muted-foreground">downtime total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vehículos</p>
            <p className="text-3xl font-bold text-slate-900">{kpi.vehiculos}</p>
            <p className="text-xs text-muted-foreground">{kpi.conFallas} con fallas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Prob. falla {horizonte}d</p>
            <p className="text-3xl font-bold" style={{ color: colorProb(kpi.probFlota) }}>
              {nf0.format(kpi.probFlota)}%
            </p>
            <p className="text-xs text-muted-foreground">
              ≈ {nf0.format(kpi.esperadas)} fallas esperadas en {horizonte}d
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">λ flota</p>
            <p className="text-3xl font-bold text-slate-900">{nf3.format(kpi.lambdaFlota)}</p>
            <p className="text-xs text-muted-foreground">fallas esperadas por día</p>
          </CardContent>
        </Card>
      </div>

      {data?.actualizado && (
        <p className="text-xs text-muted-foreground">
          Período {data.desde} a {data.hasta} ({data.dias} días) · actualizado{" "}
          {new Date(data.actualizado).toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
          })}
          {refrescando ? " · actualizando con Cloud Fleet…" : ""}
        </p>
      )}

      {/* Tabla por vehículo */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 font-semibold text-slate-900">Por vehículo</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    ["patente", "Patente"],
                    ["tipo", "Tipo"],
                    ["sucursal", "Sucursal"],
                    ["fallas", "Fallas"],
                    ["mtbfkm", "MTBF (km)"],
                    ["mtbfh", "MTBF (h)"],
                    ["mttr", "MTTR (h)"],
                    ["downtime", "Taller (h)"],
                    ["disp", "Disp."],
                    ["prob", `Prob. falla ${horizonte}d`],
                  ].map(([col, label]) => (
                    <TableHead
                      key={col}
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => ordenarPor(col)}
                    >
                      {label}{flecha(col)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Cargando datos de Cloudfleet…
                    </TableCell>
                  </TableRow>
                ) : vehiculosOrdenados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Sin datos de mantenimiento para el período.
                    </TableCell>
                  </TableRow>
                ) : (
                  vehiculosOrdenados.map((v) => {
                    const prob = v.fallas ? probFalla(v.mtbfDias, horizonte) : null
                    return (
                      <TableRow key={v.patente}>
                        <TableCell className="font-semibold">{v.patente || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{v.tipo || "—"}</TableCell>
                        <TableCell>{v.sucursal || "—"}</TableCell>
                        <TableCell>{v.fallas}</TableCell>
                        <TableCell>{v.mtbf ? nf0.format(v.mtbf) : "—"}</TableCell>
                        <TableCell>{v.mtbfHoras != null ? nf0.format(v.mtbfHoras) : "—"}</TableCell>
                        <TableCell>{v.fallas ? nf0.format(v.mttr) : "—"}</TableCell>
                        <TableCell>{nf0.format(v.downtime)}</TableCell>
                        <TableCell style={{ color: colorDisp(v.disponibilidad), fontWeight: 700 }}>
                          {v.disponibilidad != null ? `${nf0.format(v.disponibilidad)}%` : "—"}
                        </TableCell>
                        <TableCell style={{ color: colorProb(prob), fontWeight: 700 }}>
                          {prob != null ? `${nf0.format(prob)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Curva de probabilidad */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Curva de probabilidad de falla</h2>
            <Select value={graficoSel} onValueChange={(v) => setGraficoSel(v ?? "flota")}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Flota (general)">
                  {(v) => (v === "flota" || v == null ? "Flota (general)" : String(v))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flota">Flota (general)</SelectItem>
                {vehiculos.map((v) => (
                  <SelectItem key={v.patente} value={v.patente}>{v.patente}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curva} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="dia"
                  tickFormatter={(d) => `${d}d`}
                  tick={{ fontSize: 12 }}
                  type="number"
                  domain={["dataMin", "dataMax"]}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(p) => `${p}%`}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(v) => [`${nf0.format(Number(v))}%`, "Prob."]}
                  labelFormatter={(d) => `${d} días`}
                />
                <ReferenceLine x={horizonte} stroke={RED} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="prob" stroke="#0284C7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Probabilidad acumulada de que ocurra{" "}
            {graficoSel === "flota" ? "al menos una falla en la flota" : "una falla"} en función de
            los días. La línea punteada marca el horizonte ({horizonte}d).
          </p>
        </CardContent>
      </Card>

      {/* Planes de acción (independientes, propios de esta sección) */}
      <PlanesAccionFlota
        ambito="fallas"
        descripcion="Acciones sobre las unidades con baja disponibilidad o alta probabilidad de falla. No depende de los filtros de fecha: muestra siempre todos los planes."
      />

      <p className="text-xs text-muted-foreground">
        MTBF (km), MTTR, fallas y horas en taller salen de Cloudfleet. El MTBF en horas/días se
        deriva del tiempo operativo (calendario − taller) entre fallas.{" "}
        <strong>Disponibilidad = MTBF / (MTBF + MTTR)</strong>.{" "}
        <strong>Prob. de falla = 1 − e^(−λT)</strong>, con λ = 1/MTBF(días). Rango máximo: 365 días.
      </p>
    </div>
  )
}
