"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowLeft, ChevronDown, Loader2, RefreshCw, Wrench } from "lucide-react"
import { PlanesAccionFlota } from "../_components/planes-accion-flota"

// Mantenimiento de flota — dashboard de órdenes de trabajo de Cloudfleet:
// costos por tipo (Preventivo / Correctivo / Proactivo / Mejora), filtros por
// sucursal / mes / tipo / unidad / año, y lista desplegable de órdenes con
// trabajos y repuestos. Portado del panel de herminio-web al molde DPO.

// Flota vigente para la auditoría de gestión de mantenimiento — fuente:
// FLOTA QUILMES ACTUALIZADA AL 31-05-2026.xlsx. Solo estas patentes se muestran
// acá; el resto de las órdenes de Cloudfleet sigue disponible para la gestión
// general (no se filtra en la API).
const CAMIONES = new Set([
  "OJA408", "FUB570", "AF399KW", "HJR136", "OTY696", "FTI792", "OTB032",
  "AB386KV", "AB386KU", "AE445WS", "AE445WT", "AE591EV", "AE523XP",
  "AF399KX", "AF552QZ", "AF399KZ",
])
// Acoplados (ID 4517 y 4422): van DENTRO del grupo de camiones (son parte de ellos).
const ACOPLADOS = new Set(["AB729UX", "AF516JC"])
const AUTOELEVADORES = new Set(["TOYOTA4", "TOYOTA5", "TOYOTA6"])
const PATENTES_AUDITORIA = new Set([...CAMIONES, ...ACOPLADOS, ...AUTOELEVADORES])

interface Grupo {
  key: string
  titulo: string
  color: string
  patentes: Set<string>
}

// Recuadros clickables de cabecera: Camiones (con acoplados) y Autoelevadores.
const GRUPOS: Grupo[] = [
  { key: "camiones", titulo: "Camiones", color: "#1d4ed8", patentes: new Set([...CAMIONES, ...ACOPLADOS]) },
  { key: "autoelevadores", titulo: "Autoelevadores", color: "#0d9488", patentes: AUTOELEVADORES },
]

interface TipoDef {
  key: string
  color: string
}
const TIPOS: TipoDef[] = [
  { key: "Preventivo", color: "#16a34a" },
  { key: "Correctivo", color: "#dc2626" },
  { key: "Proactivo", color: "#3b82f6" },
  { key: "Mejora", color: "#a855f7" },
]
const COLOR_OTRO = "#64748b"
const TOTAL_COLOR = "#0d9488"

function colorTipo(tipo: string) {
  return TIPOS.find((t) => t.key === tipo)?.color || COLOR_OTRO
}

const fmtPlata = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})

function fmtFecha(iso: string) {
  if (!iso) return "—"
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
function etiquetaMes(ym: string) {
  const [a, m] = ym.split("-")
  return `${MESES[Number(m) - 1]} ${a}`
}

function normSucursal(s: string | null) {
  if (!s) return null
  if (/^iguaz/i.test(s)) return "Iguazú"
  if (/^eldorado/i.test(s)) return "Eldorado"
  return s
}

function BadgeTipo({ tipo }: { tipo: string }) {
  const c = colorTipo(tipo)
  return (
    <Badge
      variant="secondary"
      className="hover:bg-transparent"
      style={{ background: `${c}22`, color: c }}
    >
      {tipo}
    </Badge>
  )
}

interface Trabajo {
  id: string | number
  nombre: string
  tipo: string
  sistema: string
  subsistema: string
  costo: number
  comentario: string
}
interface Repuesto {
  id: string | number
  nombre: string
  codigo: string
  cantidad: number
  costo: number
  tipo: string
}
interface Orden {
  numero: number
  patente: string
  fecha: string
  taller: string
  sucursal: string
  estado: string
  odometro: number | null
  motivo: string
  comentarios: string
  tipos: string[]
  costoTotal: number
  costoTrabajos: number
  costoRepuestos: number
  costoPorTipo: Record<string, number>
  trabajos: Trabajo[]
  repuestos: Repuesto[]
}
interface MantData {
  ok: boolean
  ordenes: Orden[]
  actualizado?: string | null
  cacheado?: boolean
  stale?: boolean
  error?: string
}

interface PuntoSerie {
  clave: string
  label: string
  Preventivo: number
  Correctivo: number
  Proactivo: number
  Mejora: number
  ordenes: Record<string, number>
  costos: Record<string, number>
}

export function MantenimientoFlotaClient() {
  const [data, setData] = useState<MantData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [sucursal, setSucursal] = useState("__all__")
  const [mes, setMes] = useState("__all__")
  const [tipo, setTipo] = useState("__all__")
  const [unidad, setUnidad] = useState("__all__") // patente para ver una sola unidad
  const [anio, setAnio] = useState("__all__") // año para ver gastos de un año entero
  const [grupo, setGrupo] = useState("camiones") // recuadro: camiones / autoelevadores
  const [abierta, setAbierta] = useState<number | null>(null) // nº de orden desplegada

  const cargar = useCallback(async (forzar = false) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/flota-mantenimiento-ordenes${forzar ? "?refresh=1" : ""}`, {
        cache: "no-store",
      })
      const j: MantData = await r.json()
      if (!j.ok) throw new Error(j.error || "Error al leer las órdenes")
      setData(j)
      // Para auditoría: si la respuesta vino de la copia guardada, SIEMPRE
      // refrescamos en vivo contra Cloudfleet por detrás para mostrar el
      // informe actualizado al instante (sin esperar en blanco).
      if (j.cacheado && !forzar) {
        setRefrescando(true)
        fetch(`/api/flota-mantenimiento-ordenes?refresh=1`, { cache: "no-store" })
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
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const ordenes = useMemo(
    () => (data?.ordenes || []).filter((o) => PATENTES_AUDITORIA.has(o.patente)),
    [data]
  )

  // Meses disponibles (del más nuevo al más viejo) para el desplegable.
  const meses = useMemo(
    () => [...new Set(ordenes.map((o) => (o.fecha || "").slice(0, 7)).filter(Boolean))].sort().reverse(),
    [ordenes]
  )

  // Patentes del grupo (recuadro) elegido.
  const grupoPatentes = useMemo(
    () => (GRUPOS.find((g) => g.key === grupo) || GRUPOS[0]).patentes,
    [grupo]
  )

  // Unidades (patentes) del grupo elegido que tienen órdenes, para el desplegable.
  const unidades = useMemo(
    () => [...new Set(ordenes.filter((o) => grupoPatentes.has(o.patente)).map((o) => o.patente).filter(Boolean))].sort(),
    [ordenes, grupoPatentes]
  )

  // Años disponibles (del más nuevo al más viejo) para el desplegable "Año".
  const anios = useMemo(
    () => [...new Set(ordenes.map((o) => (o.fecha || "").slice(0, 4)).filter(Boolean))].sort().reverse(),
    [ordenes]
  )

  const sucursalF = sucursal === "__all__" ? "" : sucursal
  const mesF = mes === "__all__" ? "" : mes
  const anioF = anio === "__all__" ? "" : anio
  const tipoF = tipo === "__all__" ? "" : tipo
  const unidadF = unidad === "__all__" ? "" : unidad

  // Órdenes del período (sucursal + año + mes), SIN filtrar por grupo: sirve para
  // los totales de cada recuadro (Camiones / Autoelevadores).
  const periodoBase = useMemo(
    () =>
      ordenes.filter(
        (o) =>
          (!sucursalF || normSucursal(o.sucursal) === sucursalF) &&
          (!mesF || (o.fecha || "").startsWith(mesF)) &&
          (!anioF || (o.fecha || "").startsWith(anioF))
      ),
    [ordenes, sucursalF, mesF, anioF]
  )

  // Totales por recuadro (cantidad de OT y costo) dentro del período.
  const totalesGrupo = useMemo(() => {
    const out: Record<string, { ordenes: number; costo: number }> = {}
    for (const g of GRUPOS) {
      const os = periodoBase.filter((o) => g.patentes.has(o.patente))
      out[g.key] = { ordenes: os.length, costo: os.reduce((s, o) => s + (o.costoTotal || 0), 0) }
    }
    return out
  }, [periodoBase])

  // Vista: período + grupo elegido + (opcional) una sola unidad. El tipo se
  // aplica después, así las tarjetas de costo comparan los 4 tipos del período.
  const base = useMemo(
    () => periodoBase.filter((o) => grupoPatentes.has(o.patente) && (!unidadF || o.patente === unidadF)),
    [periodoBase, grupoPatentes, unidadF]
  )

  const resumen = useMemo(() => {
    const costos: Record<string, number> = {}
    let total = 0
    for (const o of base) {
      for (const [t, c] of Object.entries(o.costoPorTipo || {})) {
        costos[t] = (costos[t] || 0) + c
      }
      total += o.costoTotal || 0
    }
    return { costos, total }
  }, [base])

  const filtradas = useMemo(
    () => (tipoF ? base.filter((o) => o.tipos.includes(tipoF)) : base),
    [base, tipoF]
  )

  // Serie del gráfico de columnas: costo por tipo agrupado por mes (o por día
  // cuando hay un mes elegido). Respeta los filtros de sucursal/mes/tipo.
  const serieCol = useMemo(() => {
    const porDia = Boolean(mesF)
    const m = new Map<string, { clave: string; costos: Record<string, number>; ordenes: Record<string, number> }>()
    for (const o of base) {
      if (!o.fecha) continue
      const clave = porDia ? o.fecha : o.fecha.slice(0, 7)
      if (!m.has(clave)) m.set(clave, { clave, costos: {}, ordenes: {} })
      const g = m.get(clave)!
      for (const [t, c] of Object.entries(o.costoPorTipo || {})) {
        if (tipoF && t !== tipoF) continue
        g.costos[t] = (g.costos[t] || 0) + c
      }
      for (const t of o.tipos) {
        if (tipoF && t !== tipoF) continue
        g.ordenes[t] = (g.ordenes[t] || 0) + 1
      }
    }
    const arr: PuntoSerie[] = [...m.values()]
      .sort((a, b) => a.clave.localeCompare(b.clave))
      .map((g) => ({
        clave: g.clave,
        label: porDia ? `${g.clave.slice(8, 10)}/${g.clave.slice(5, 7)}` : etiquetaMes(g.clave),
        Preventivo: g.costos["Preventivo"] || 0,
        Correctivo: g.costos["Correctivo"] || 0,
        Proactivo: g.costos["Proactivo"] || 0,
        Mejora: g.costos["Mejora"] || 0,
        ordenes: g.ordenes,
        costos: g.costos,
      }))
    return { arr, porDia }
  }, [base, mesF, tipoF])

  const tiposVisibles = tipoF ? TIPOS.filter((t) => t.key === tipoF) : TIPOS

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
          <div className="rounded-xl bg-amber-100 p-3 text-amber-600">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mantenimiento — Órdenes y costos</h1>
            <p className="text-sm text-muted-foreground">
              Órdenes de trabajo de Cloudfleet con sus trabajos, repuestos y costos
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => cargar(true)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Sincronizando…" : "Sincronizar"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {loading && !data && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Cargando órdenes de mantenimiento desde Cloudfleet… La primera carga del día
            puede tardar unos minutos (la API tiene límite de velocidad); después queda en caché.
          </CardContent>
        </Card>
      )}

      {/* Recuadros de grupo: Camiones / Autoelevadores */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          {GRUPOS.map((g) => {
            const t = totalesGrupo[g.key] || { ordenes: 0, costo: 0 }
            const activa = grupo === g.key
            return (
              <Card
                key={g.key}
                className={`cursor-pointer transition-colors hover:bg-slate-50 ${activa ? "ring-2" : ""}`}
                style={activa ? { ["--tw-ring-color" as string]: g.color } : undefined}
                onClick={() => { setGrupo(g.key); setUnidad("__all__"); setAbierta(null) }}
              >
                <CardContent className="flex items-center gap-3 pt-6">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: `${g.color}22`, color: g.color }}
                  >
                    <Wrench className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-semibold" style={{ color: g.color }}>{g.titulo}</div>
                    <div className="text-sm text-muted-foreground">
                      {t.ordenes} órdenes · {fmtPlata.format(t.costo)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Unidad
          <Select
            value={unidad}
            onValueChange={(v) => { setUnidad(v ?? "__all__"); setAbierta(null) }}
          >
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Unidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {unidades.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sucursal
          <Select
            value={sucursal}
            onValueChange={(v) => { setSucursal(v ?? "__all__"); setAbierta(null) }}
          >
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Sucursal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="Eldorado">Eldorado</SelectItem>
              <SelectItem value="Iguazú">Iguazú</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Año
          <Select
            value={anio}
            onValueChange={(v) => { setAnio(v ?? "__all__"); setMes("__all__"); setAbierta(null) }}
          >
            <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="Año" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {anios.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Mes
          <Select
            value={mes}
            onValueChange={(v) => { setMes(v ?? "__all__"); setAbierta(null) }}
          >
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Mes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(anioF ? meses.filter((m) => m.startsWith(anioF)) : meses).map((m) => (
                <SelectItem key={m} value={m}>{etiquetaMes(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Tipo de mantenimiento
          <Select
            value={tipo}
            onValueChange={(v) => { setTipo(v ?? "__all__"); setAbierta(null) }}
          >
            <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {TIPOS.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.key}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {data?.actualizado && (
        <p className="text-xs text-muted-foreground">
          Actualizado{" "}
          {new Date(data.actualizado).toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
          })}
          {refrescando ? " · actualizando con Cloud Fleet…" : ""}
          {data.stale ? " · mostrando la última copia disponible" : ""}
        </p>
      )}

      {data && (
        <>
          {/* Costos por tipo de mantenimiento (clic = filtrar por ese tipo) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {TIPOS.map((t) => {
              const activa = tipoF === t.key
              return (
                <Card
                  key={t.key}
                  className="cursor-pointer border-t-4 transition-colors hover:bg-slate-50"
                  style={{ borderTopColor: t.color, ...(activa ? { background: `${t.color}11` } : {}) }}
                  onClick={() => { setTipo(activa ? "__all__" : t.key); setAbierta(null) }}
                >
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium" style={{ color: t.color }}>{t.key}</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {fmtPlata.format(resumen.costos[t.key] || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {base.filter((o) => o.tipos.includes(t.key)).length} órdenes
                    </p>
                  </CardContent>
                </Card>
              )
            })}
            <Card className="border-t-4" style={{ borderTopColor: TOTAL_COLOR }}>
              <CardContent className="pt-6">
                <p className="text-sm font-medium" style={{ color: TOTAL_COLOR }}>Total</p>
                <p className="text-2xl font-bold text-slate-900">{fmtPlata.format(resumen.total)}</p>
                <p className="text-xs text-muted-foreground">
                  {base.length} órdenes{mesF ? ` · ${etiquetaMes(mesF)}` : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico de columnas: costo por tipo, por mes (o por día si hay mes
              elegido). */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-semibold text-slate-900">
                Costos por tipo de mantenimiento
                {mesF ? ` · ${etiquetaMes(mesF)} (por día)` : " (por mes)"}
                {sucursalF ? ` · ${sucursalF}` : ""}
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Tocá un tipo en las tarjetas para filtrar; elegí un mes arriba para abrirlo por día.
              </p>
              {serieCol.arr.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin datos para graficar.</p>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serieCol.arr} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => fmtCorto(v as number)} tick={{ fontSize: 12 }} width={56} />
                      <Tooltip content={<ColTooltip />} />
                      {tiposVisibles.map((t) => (
                        <Bar
                          key={t.key}
                          dataKey={t.key}
                          stackId="costo"
                          name={t.key}
                          fill={t.color}
                          radius={[3, 3, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lista de órdenes desplegable */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-semibold text-slate-900">
                Órdenes de trabajo ({filtradas.length})
                {tipoF ? ` · ${tipoF}` : ""}{sucursalF ? ` · ${sucursalF}` : ""}
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Tocá una orden para ver el detalle de trabajos y repuestos.
              </p>
              {filtradas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin órdenes para esos filtros.</p>
              ) : (
                <div className="space-y-2">
                  {filtradas.map((o) => {
                    const abierto = abierta === o.numero
                    const suc = normSucursal(o.sucursal)
                    return (
                      <div key={o.numero} className="overflow-hidden rounded-lg border">
                        <button
                          type="button"
                          className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onClick={() => setAbierta(abierto ? null : o.numero)}
                        >
                          <span className="text-muted-foreground">#{o.numero}</span>
                          <span className="text-muted-foreground">{fmtFecha(o.fecha)}</span>
                          <span className="font-semibold">🚛 {o.patente}</span>
                          {suc && <Badge variant="secondary">{suc}</Badge>}
                          <span className="flex flex-wrap gap-1">
                            {o.tipos.map((t) => <BadgeTipo tipo={t} key={t} />)}
                          </span>
                          <span className="ml-auto font-semibold">{fmtPlata.format(o.costoTotal || 0)}</span>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`}
                          />
                        </button>
                        {abierto && (
                          <div className="space-y-3 border-t bg-slate-50/60 px-3 py-3">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {o.taller && <span>🔧 {o.taller}</span>}
                              {o.odometro != null && <span>📟 {o.odometro.toLocaleString("es-AR")} km</span>}
                              {o.estado && (
                                <span>
                                  Estado: {o.estado === "closed" ? "Cerrada" : o.estado === "open" ? "Abierta" : o.estado}
                                </span>
                              )}
                              {o.motivo && <span>Motivo: {o.motivo}</span>}
                            </div>
                            {o.comentarios && (
                              <div className="text-xs text-muted-foreground">💬 {o.comentarios}</div>
                            )}

                            <div className="text-sm font-medium text-slate-900">
                              Trabajos ({o.trabajos.length}) — {fmtPlata.format(o.costoTrabajos || 0)}
                            </div>
                            {o.trabajos.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sin trabajos cargados.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Trabajo</TableHead>
                                      <TableHead>Tipo</TableHead>
                                      <TableHead>Sistema</TableHead>
                                      <TableHead>Costo</TableHead>
                                      <TableHead>Comentario</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {o.trabajos.map((t) => (
                                      <TableRow key={t.id}>
                                        <TableCell className="min-w-[180px] whitespace-normal">{t.nombre}</TableCell>
                                        <TableCell><BadgeTipo tipo={t.tipo} /></TableCell>
                                        <TableCell className="whitespace-normal text-muted-foreground">
                                          {[t.sistema, t.subsistema].filter(Boolean).join(" · ") || "—"}
                                        </TableCell>
                                        <TableCell>{fmtPlata.format(t.costo || 0)}</TableCell>
                                        <TableCell className="min-w-[160px] whitespace-normal text-muted-foreground">
                                          {t.comentario || "—"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}

                            <div className="text-sm font-medium text-slate-900">
                              Repuestos ({o.repuestos.length}) — {fmtPlata.format(o.costoRepuestos || 0)}
                            </div>
                            {o.repuestos.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sin repuestos cargados.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Repuesto</TableHead>
                                      <TableHead>Código</TableHead>
                                      <TableHead>Cant.</TableHead>
                                      <TableHead>Costo</TableHead>
                                      <TableHead>Tipo</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {o.repuestos.map((r) => (
                                      <TableRow key={r.id}>
                                        <TableCell className="min-w-[180px] whitespace-normal">{r.nombre}</TableCell>
                                        <TableCell className="text-muted-foreground">{r.codigo || "—"}</TableCell>
                                        <TableCell>{r.cantidad}</TableCell>
                                        <TableCell>{fmtPlata.format(r.costo || 0)}</TableCell>
                                        <TableCell><BadgeTipo tipo={r.tipo} /></TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Planes de acción (independientes, propios de esta sección) */}
      <PlanesAccionFlota
        ambito="mantenimiento"
        descripcion="Acciones sobre las órdenes de mantenimiento y los costos por unidad. No depende de los filtros: muestra siempre todos los planes."
      />

      <p className="text-xs text-muted-foreground">
        Las órdenes salen de Cloudfleet (work orders con trabajos y repuestos). Se muestran sólo las
        unidades de la flota vigente de Misiones; los costos se agrupan por tipo de mantenimiento.
      </p>
    </div>
  )
}

// Montos cortos para el eje del gráfico ($1,2M / $850K).
function fmtCorto(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}

function ColTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PuntoSerie }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const total = Object.values(d.costos).reduce((s, c) => s + c, 0)
  return (
    <div className="max-w-[260px] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">
        {d.label} · {fmtPlata.format(total)}
      </p>
      {TIPOS.map((t) => {
        const c = d.costos[t.key]
        if (!c) return null
        return (
          <p key={t.key} className="flex items-center gap-2" style={{ color: t.color }}>
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: t.color }}
            />
            {t.key}: {fmtPlata.format(c)} · {d.ordenes[t.key] || 0} órd.
          </p>
        )
      })}
    </div>
  )
}
