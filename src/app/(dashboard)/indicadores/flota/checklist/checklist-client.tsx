"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowLeft, ClipboardCheck, Loader2, RefreshCw } from "lucide-react"
import { PlanesAccionFlota } from "../_components/planes-accion-flota"

const LIB = "#0284C7" // Liberación (azul)
const RET = "#10B981" // Retorno (verde)
const GREEN = "#10B981"
const AMBER = "#F59E0B"
const RED = "#EF4444"
const MUTED = "#94A3B8"

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return arg.toISOString().slice(0, 10)
}
function restarDias(fechaISO: string, dias: number) {
  const d = new Date(fechaISO + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}
function lunesDeLaSemana(fechaISO: string) {
  const d = new Date(fechaISO + "T00:00:00Z")
  const dia = d.getUTCDay()
  return restarDias(fechaISO, (dia + 6) % 7)
}
function primerDiaDelMes(fechaISO: string) {
  return fechaISO.slice(0, 8) + "01"
}
function finDeMes(mesISO: string) {
  const [y, m] = mesISO.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
function etiquetaMes(mesISO: string) {
  const m = Number(mesISO.slice(5, 7))
  return `${MESES_CORTOS[m - 1] || mesISO} ${mesISO.slice(2, 4)}`
}
// Hora Argentina FIJA (UTC−3), sin depender de la zona del navegador.
function fmtFechaHoraArg(isoUtc: string | null, fechaFallback: string) {
  if (!isoUtc) return fechaFallback || "—"
  const d = new Date(new Date(isoUtc).getTime() - 3 * 60 * 60 * 1000)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
}
function fmtFecha(fecha: string) {
  return fecha ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}` : "—"
}
// Semáforo de adherencia: verde ≥95, ámbar ≥80, rojo abajo.
function colorAdherencia(pct: number | null) {
  if (pct == null) return MUTED
  if (pct >= 95) return GREEN
  if (pct >= 80) return AMBER
  return RED
}

function BadgeEstado({ estado }: { estado: string }) {
  const e = (estado || "").toUpperCase()
  if (e === "APROBADO")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Aprobado</Badge>
  if (e.includes("CRIT"))
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Crítico</Badge>
  if (e.includes("RECH"))
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rechazado</Badge>
  return <Badge variant="secondary">{estado || "—"}</Badge>
}
function BadgeTipo({ tipo }: { tipo: string }) {
  if (tipo === "LIBERACION")
    return <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">Liberación</Badge>
  if (tipo === "RETORNO")
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Retorno</Badge>
  return <Badge variant="secondary">{tipo || "—"}</Badge>
}

interface Check {
  numero: number
  patente: string
  tipo: string
  estado: string
  sucursal: string
  chofer: string
  fecha: string
  fechaHora: string
  cumplimiento: number | null
  variablesRech: number
  variablesCrit: number
  comentario: string
}
interface ChecklistData {
  ok: boolean
  desde: string
  hasta: string
  total: number
  actualizado: string | null
  datos: Check[]
  cacheado?: boolean
  aproximado?: boolean
  error?: string
}

interface Faltante {
  patente: string
  fecha: string
  falta: string
}
interface Rechazado {
  patente: string
  fecha: string
  tipo: string
  estado: string
}
interface GrupoAdh {
  clave: string
  total: number
  completos: number
  libs: number
  rets: number
  pct: number
  pctLib: number
  pctRet: number
  faltantes: Faltante[]
  rechazados: Rechazado[]
  label: string
}

export function ChecklistFlotaClient() {
  const hoy = hoyArg()
  const [desde, setDesde] = useState(restarDias(hoy, 7))
  const [hasta, setHasta] = useState(hoy)
  const [sucursal, setSucursal] = useState("__all__")
  const [tipo, setTipo] = useState("__all__")
  const [estado, setEstado] = useState("__all__")
  const [colapsado, setColapsado] = useState(true)
  const [vistaAdh, setVistaAdh] = useState<"dia" | "mes">("dia")
  const [verObs, setVerObs] = useState(false)
  const [data, setData] = useState<ChecklistData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rangos = [
    { key: "hoy", label: "Hoy", desde: hoy, hasta: hoy },
    { key: "semana", label: "Semana", desde: lunesDeLaSemana(hoy), hasta: hoy },
    { key: "mes", label: "Mes", desde: primerDiaDelMes(hoy), hasta: hoy },
  ]
  const rangoActivo = rangos.find((r) => r.desde === desde && r.hasta === hasta)?.key

  const mesFiltro =
    desde.slice(0, 7) === hasta.slice(0, 7) &&
    desde.endsWith("-01") &&
    (hasta === finDeMes(hasta.slice(0, 7)) || hasta === hoy)
      ? desde.slice(0, 7)
      : ""
  const aplicarMes = (mes: string) => {
    if (!mes) return
    setDesde(mes + "-01")
    setHasta(mes === hoy.slice(0, 7) ? hoy : finDeMes(mes))
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/flota-checklist?desde=${desde}&hasta=${hasta}`)
      const j: ChecklistData = await r.json()
      if (!j.ok) throw new Error(j.error || "Error al traer datos")
      setData(j)
      // Para auditoría: si la respuesta vino de la copia guardada, SIEMPRE
      // refrescamos en vivo contra Cloudfleet por detrás (sin importar la
      // antigüedad) para mostrar el informe actualizado al instante.
      if (j.cacheado) {
        setRefrescando(true)
        fetch(`/api/flota-checklist?desde=${desde}&hasta=${hasta}&fresco=1`)
          .then((r2) => r2.json())
          .then((j2: ChecklistData) => {
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
    const id = setInterval(() => cargar(), 5 * 60 * 1000)
    const onFocus = () => cargar()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [cargar])

  // Filtros de pantalla (sucursal/tipo/estado).
  const filas = useMemo(() => {
    let f = data?.datos || []
    if (sucursal !== "__all__") f = f.filter((x) => (x.sucursal || "") === sucursal)
    if (tipo !== "__all__") f = f.filter((x) => x.tipo === tipo)
    if (estado !== "__all__") {
      f = f.filter((x) => {
        const e = (x.estado || "").toUpperCase()
        if (estado === "APROBADO") return e === "APROBADO"
        return e !== "APROBADO"
      })
    }
    return f
  }, [data, sucursal, tipo, estado])

  const fechaMasCercana = useMemo(
    () => filas.reduce((max, x) => (x.fecha && x.fecha > max ? x.fecha : max), ""),
    [filas]
  )
  const filasTabla = useMemo(() => {
    if (!colapsado) return filas
    return filas.filter((x) => x.fecha === fechaMasCercana)
  }, [filas, colapsado, fechaMasCercana])

  const sucursales = useMemo(() => {
    const s = new Set((data?.datos || []).map((x) => x.sucursal).filter(Boolean))
    return [...s].sort()
  }, [data])

  // Adherencia liberación↔retorno por camión-día. Aplica sólo el filtro de
  // sucursal (necesita ambos tipos a la vez).
  const adherencia = useMemo(() => {
    let base = data?.datos || []
    if (sucursal !== "__all__") base = base.filter((x) => (x.sucursal || "") === sucursal)
    const pares = new Map<string, { fecha: string; patente: string; lib: boolean; ret: boolean }>()
    for (const x of base) {
      if (!x.fecha || !x.patente) continue
      const k = `${x.fecha}|${x.patente}`
      if (!pares.has(k)) pares.set(k, { fecha: x.fecha, patente: x.patente, lib: false, ret: false })
      const p = pares.get(k)!
      if (x.tipo === "LIBERACION") p.lib = true
      else if (x.tipo === "RETORNO") p.ret = true
    }
    const lista = [...pares.values()]
    const completos = lista.filter((p) => p.lib && p.ret).length
    const incompletos = lista
      .filter((p) => !(p.lib && p.ret))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.patente.localeCompare(b.patente))
    const pct = lista.length ? Math.round((completos / lista.length) * 1000) / 10 : null

    const agrupar = (claveDe: (f: string) => string, esMes: boolean): GrupoAdh[] => {
      const m = new Map<string, GrupoAdh>()
      for (const p of lista) {
        const clave = claveDe(p.fecha)
        if (!m.has(clave))
          m.set(clave, {
            clave, total: 0, completos: 0, libs: 0, rets: 0, pct: 0, pctLib: 0, pctRet: 0,
            faltantes: [], rechazados: [], label: "",
          })
        const g = m.get(clave)!
        g.total += 1
        if (p.lib) g.libs += 1
        if (p.ret) g.rets += 1
        if (p.lib && p.ret) g.completos += 1
        else g.faltantes.push({ patente: p.patente, fecha: p.fecha, falta: p.lib ? "RETORNO" : "LIBERACION" })
      }
      for (const x of base) {
        if (!x.fecha || (x.estado || "").toUpperCase() === "APROBADO") continue
        const g = m.get(claveDe(x.fecha))
        if (!g) continue
        g.rechazados.push({ patente: x.patente || "—", fecha: x.fecha, tipo: x.tipo, estado: x.estado })
      }
      return [...m.values()]
        .sort((a, b) => a.clave.localeCompare(b.clave))
        .map((g) => ({
          ...g,
          pct: Math.round((g.completos / g.total) * 1000) / 10,
          pctLib: Math.round((g.libs / g.total) * 1000) / 10,
          pctRet: Math.round((g.rets / g.total) * 1000) / 10,
          label: esMes ? etiquetaMes(g.clave) : `${g.clave.slice(8, 10)}/${g.clave.slice(5, 7)}`,
        }))
    }
    return {
      total: lista.length,
      completos,
      incompletos,
      pct,
      serieDia: agrupar((f) => f, false),
      serieMes: agrupar((f) => f.slice(0, 7), true),
    }
  }, [data, sucursal])

  const serieAdh = vistaAdh === "mes" ? adherencia.serieMes : adherencia.serieDia

  const resumen = useMemo(() => {
    const lib = filas.filter((x) => x.tipo === "LIBERACION").length
    const ret = filas.filter((x) => x.tipo === "RETORNO").length
    const aprob = filas.filter((x) => (x.estado || "").toUpperCase() === "APROBADO").length
    const conObs = filas.length - aprob
    const pct = filas.length ? Math.round((aprob / filas.length) * 100) : 0
    return { total: filas.length, lib, ret, aprob, conObs, pct }
  }, [filas])

  const conObsList = useMemo(
    () =>
      filas
        .filter((x) => (x.estado || "").toUpperCase() !== "APROBADO")
        .sort((a, b) => (b.fechaHora || "").localeCompare(a.fechaHora || "")),
    [filas]
  )

  // Serie "Checks por día": liberaciones, retornos y rechazados.
  const serieDiaria = useMemo(() => {
    const m = new Map<string, { fecha: string; label: string; lib: number; ret: number; rech: number; rechazados: Rechazado[] }>()
    for (const x of filas) {
      if (!x.fecha) continue
      if (!m.has(x.fecha))
        m.set(x.fecha, {
          fecha: x.fecha,
          label: `${x.fecha.slice(8, 10)}/${x.fecha.slice(5, 7)}`,
          lib: 0, ret: 0, rech: 0, rechazados: [],
        })
      const o = m.get(x.fecha)!
      if (x.tipo === "LIBERACION") o.lib += 1
      else if (x.tipo === "RETORNO") o.ret += 1
      if ((x.estado || "").toUpperCase() !== "APROBADO") {
        o.rech += 1
        o.rechazados.push({ patente: x.patente || "—", fecha: x.fecha, tipo: x.tipo, estado: x.estado })
      }
    }
    return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [filas])

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
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Checklist — Adherencia</h1>
            <p className="text-sm text-muted-foreground">
              Liberación y retorno por unidad — datos en vivo de Cloudfleet
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

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total checks</p>
            <p className="text-3xl font-bold text-slate-900">{resumen.total}</p>
            <p className="text-xs text-muted-foreground">en el período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Liberaciones</p>
            <p className="text-3xl font-bold" style={{ color: LIB }}>{resumen.lib}</p>
            <p className="text-xs text-muted-foreground">salidas a reparto</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Retornos</p>
            <p className="text-3xl font-bold" style={{ color: RET }}>{resumen.ret}</p>
            <p className="text-xs text-muted-foreground">vuelta de reparto</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Aprobados</p>
            <p className="text-3xl font-bold" style={{ color: GREEN }}>{resumen.aprob}</p>
            <p className="text-xs text-muted-foreground">{resumen.pct}% de cumplimiento</p>
          </CardContent>
        </Card>
        <Card
          className={resumen.conObs ? "cursor-pointer transition-colors hover:bg-slate-50" : ""}
          onClick={() => resumen.conObs && setVerObs((v) => !v)}
        >
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Con observaciones</p>
            <p className="text-3xl font-bold" style={{ color: resumen.conObs ? RED : MUTED }}>
              {resumen.conObs}
            </p>
            <p className="text-xs text-muted-foreground">
              rechazado / crítico
              {resumen.conObs ? (verObs ? " · ocultar ▲" : " · ver detalle ▼") : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Adherencia</p>
            <p className="text-3xl font-bold" style={{ color: colorAdherencia(adherencia.pct) }}>
              {adherencia.pct != null ? `${adherencia.pct}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {adherencia.completos}/{adherencia.total} camiones-día completos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detalle de observaciones (para el plan de acción) */}
      {verObs && resumen.conObs > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 font-semibold text-slate-900">Checks con observaciones</h2>
            <div className="max-h-[360px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Patente</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Falla</TableHead>
                    <TableHead>Obs.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conObsList.map((x) => (
                    <TableRow key={`obs-${x.numero}`}>
                      <TableCell>{fmtFecha(x.fecha)}</TableCell>
                      <TableCell><BadgeTipo tipo={x.tipo} /></TableCell>
                      <TableCell className="font-semibold">{x.patente || "—"}</TableCell>
                      <TableCell>{x.chofer || "—"}</TableCell>
                      <TableCell>{x.sucursal || "—"}</TableCell>
                      <TableCell><BadgeEstado estado={x.estado} /></TableCell>
                      <TableCell className="text-muted-foreground">
                        {x.variablesRech + x.variablesCrit > 0
                          ? `${x.variablesRech} rech · ${x.variablesCrit} crít`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{x.comentario || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        {rangos.map((r) => (
          <Button
            key={r.key}
            size="sm"
            variant={rangoActivo === r.key ? "default" : "outline"}
            onClick={() => { setDesde(r.desde); setHasta(r.hasta) }}
          >
            {r.label}
          </Button>
        ))}
        <span className="mx-1 h-9 w-px bg-slate-200" />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Desde
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-[150px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hasta
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-[150px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Mes
          <Input
            type="month"
            value={mesFiltro}
            max={hoy.slice(0, 7)}
            onChange={(e) => aplicarMes(e.target.value)}
            className="h-9 w-[140px]"
          />
        </label>
        <Select value={sucursal} onValueChange={(v) => setSucursal(v ?? "__all__")}>
          <SelectTrigger className="h-9 w-[170px]">
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
        <Select value={tipo} onValueChange={(v) => setTipo(v ?? "__all__")}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Tipo">
              {(v) =>
                v === "LIBERACION"
                  ? "Liberación"
                  : v === "RETORNO"
                  ? "Retorno"
                  : "Todos los tipos"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los tipos</SelectItem>
            <SelectItem value="LIBERACION">Liberación</SelectItem>
            <SelectItem value="RETORNO">Retorno</SelectItem>
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={(v) => setEstado(v ?? "__all__")}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Cumplimiento">
              {(v) =>
                v === "APROBADO"
                  ? "Aprobados"
                  : v === "OBS"
                  ? "Con observaciones"
                  : "Todos"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="APROBADO">Aprobados</SelectItem>
            <SelectItem value="OBS">Con observaciones</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data?.actualizado && (
        <p className="text-xs text-muted-foreground">
          Período {data.desde} a {data.hasta} · actualizado{" "}
          {new Date(data.actualizado).toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
          })}
          {refrescando ? " · actualizando con Cloud Fleet…" : ""} · se actualiza solo cada 5 min
        </p>
      )}

      {/* Gráfico de adherencia */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Adherencia liberación + retorno</h2>
            <div className="flex gap-2">
              <Button size="sm" variant={vistaAdh === "dia" ? "default" : "outline"} onClick={() => setVistaAdh("dia")}>
                Por día
              </Button>
              <Button size="sm" variant={vistaAdh === "mes" ? "default" : "outline"} onClick={() => setVistaAdh("mes")}>
                Por mes
              </Button>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            % de camiones que, habiendo operado, hicieron cada check.
          </p>
          {serieAdh.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin datos para graficar.</p>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieAdh} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(p) => `${p}%`} tick={{ fontSize: 12 }} />
                  <Tooltip content={<AdhTooltip />} />
                  <Bar dataKey="pctLib" name="Liberación" fill={LIB} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="pctRet" name="Retorno" fill={RET} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla de checklists */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              Checklists
              {colapsado && fechaMasCercana && (
                <span className="ml-1 font-normal text-muted-foreground">
                  · solo {fechaMasCercana.slice(8, 10)}/{fechaMasCercana.slice(5, 7)}
                </span>
              )}
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setColapsado((v) => !v)}
              disabled={filas.length === 0}
            >
              {colapsado ? `Ver todo (${filas.length})` : "Colapsar (última fecha)"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Patente</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Cumpl.</TableHead>
                  <TableHead>Obs.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Cargando datos de Cloudfleet…
                    </TableCell>
                  </TableRow>
                ) : filasTabla.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Sin checklists para los filtros elegidos.
                    </TableCell>
                  </TableRow>
                ) : (
                  filasTabla.map((x) => (
                    <TableRow key={x.numero}>
                      <TableCell>{fmtFechaHoraArg(x.fechaHora, x.fecha)}</TableCell>
                      <TableCell><BadgeTipo tipo={x.tipo} /></TableCell>
                      <TableCell className="font-semibold">{x.patente || "—"}</TableCell>
                      <TableCell>{x.chofer || "—"}</TableCell>
                      <TableCell>{x.sucursal || "—"}</TableCell>
                      <TableCell><BadgeEstado estado={x.estado} /></TableCell>
                      <TableCell>{x.cumplimiento != null ? `${x.cumplimiento}%` : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {x.variablesRech + x.variablesCrit > 0
                          ? `${x.variablesRech} rech · ${x.variablesCrit} crít`
                          : "✓"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico checks por día */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 font-semibold text-slate-900">Checks por día</h2>
          {serieDiaria.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin datos para graficar.</p>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieDiaria} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip content={<DiaTooltip />} />
                  <Bar dataKey="lib" name="Liberación" fill={LIB} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="ret" name="Retorno" fill={RET} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Planes de acción (independientes, propios de esta sección) */}
      <PlanesAccionFlota
        ambito="checklist"
        descripcion="Acciones para los casos sin adherencia (liberación o retorno faltante, checks rechazados/críticos). No depende de los filtros de fecha: muestra siempre todos los planes."
      />

      <p className="text-xs text-muted-foreground">
        La adherencia mide, por camión y día con actividad, si hizo liberación <em>y</em> retorno.
        Los datos salen de los checklists de Cloudfleet (Eldorado e Iguazú).
      </p>
    </div>
  )
}

// Tooltip del gráfico de adherencia: detalle de rechazos y faltantes (patentes
// para el plan de acción), preservando el detalle de auditoría del original.
function AdhTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GrupoAdh }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="max-w-[260px] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{d.label}</p>
      <p className="text-muted-foreground">
        🟦 {d.libs} lib · 🟩 {d.rets} ret · ⛔ {d.rechazados.length} rech
      </p>
      {d.rechazados.slice(0, 8).map((r, i) => (
        <p key={`r-${r.patente}-${i}`} className="text-red-600">
          🚛 {r.patente} · {(r.estado || "").toUpperCase() === "CRITICO" ? "crítico" : "rechazado"}
        </p>
      ))}
      {d.faltantes.length > 0 && (
        <>
          <p className="mt-1 font-medium text-slate-700">Adherencia incompleta:</p>
          {d.faltantes.slice(0, 8).map((f, i) => (
            <p key={`f-${f.patente}-${i}`} className="text-amber-600">
              🚛 {f.patente} · faltó {f.falta === "RETORNO" ? "Retorno" : "Liberación"}
            </p>
          ))}
        </>
      )}
      {d.faltantes.length === 0 && d.rechazados.length === 0 && (
        <p className="text-green-600">✅ Completo y sin rechazos</p>
      )}
    </div>
  )
}

function DiaTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; lib: number; ret: number; rech: number; rechazados: Rechazado[] } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="max-w-[260px] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{d.label}</p>
      <p className="text-muted-foreground">
        🟦 {d.lib} liberación · 🟩 {d.ret} retorno · ⛔ {d.rech} rech
      </p>
      {d.rech > 0
        ? d.rechazados.slice(0, 10).map((r, i) => (
            <p key={`rd-${r.patente}-${i}`} className="text-red-600">
              🚛 {r.patente} · {(r.estado || "").toUpperCase() === "CRITICO" ? "crítico" : "rechazado"}
            </p>
          ))
        : <p className="text-green-600">✅ Sin rechazos este día</p>}
    </div>
  )
}
