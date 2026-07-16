"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CalendarRange, Wallet, Percent, Package, AlertTriangle, Search } from "lucide-react"
import {
  getCostoPorPdvYtd,
  type CostoMensual,
  type CostoPorPdvRow,
  type CostoYtdMes,
  type KmCiudad,
} from "@/actions/costo-pdv"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

const fmtMoney = (n: number) =>
  "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0))
const fmtNum = (n: number, d = 0) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n || 0)

// Mismas bandas de eficiencia que la solapa Detalle, pero sobre el acumulado del año.
const BANDAS = [
  { key: "caro", label: "10% más caro", hint: "top 10% costo/HL", color: "#dc2626", bg: "bg-red-50", text: "text-red-700" },
  { key: "resto", label: "Resto", hint: "costo/HL normal", color: "#16a34a", bg: "bg-green-50", text: "text-green-700" },
  { key: "bajo", label: "Bajo volumen", hint: "HL no representativo", color: "#64748b", bg: "bg-slate-100", text: "text-slate-600" },
] as const

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base]
}

interface Cortes {
  floorHl: number
  p90: number
}

function clasificar(f: CostoPorPdvRow, c: Cortes): (typeof BANDAS)[number] {
  if (f.hl <= 0 || f.hl < c.floorHl) return BANDAS[2]
  if (f.costo_x_hl >= c.p90) return BANDAS[0]
  return BANDAS[1]
}

type SortKey = keyof Pick<
  CostoPorPdvRow,
  "nombre_cliente" | "ciudad" | "bultos" | "comprobantes" | "hl" | "venta_neta" | "costo_total" | "costo_x_hl" | "pct_venta" | "pct_rechazo"
>

interface Props {
  costos: CostoMensual[]
  kmCiudades: KmCiudad[]
  anioInicial: number | null
}

export function AcumuladoTab({ costos, kmCiudades, anioInicial }: Props) {
  // Años disponibles (con al menos un mes cargado), del más reciente al más viejo.
  const anios = useMemo(
    () => [...new Set(costos.map((c) => c.anio))].sort((a, b) => b - a),
    [costos],
  )
  const [anio, setAnio] = useState<number | null>(anioInicial ?? anios[0] ?? null)
  const [filas, setFilas] = useState<CostoPorPdvRow[]>([])
  const [meses, setMeses] = useState<CostoYtdMes[]>([])
  const [cargado, setCargado] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const [q, setQ] = useState("")
  const [bandaFiltro, setBandaFiltro] = useState<string | null>(null)
  const [ciudadFiltro, setCiudadFiltro] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("costo_x_hl")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const kmPorCiudad = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of kmCiudades) m.set(k.ciudad, k.km)
    return m
  }, [kmCiudades])

  // Carga el acumulado del año elegido (la primera vez y al cambiar de año).
  useEffect(() => {
    if (anio == null || cargado === anio) return
    startTransition(async () => {
      const res = await getCostoPorPdvYtd(anio)
      if ("error" in res) {
        setFilas([])
        setMeses([])
      } else {
        setFilas(res.data)
        setMeses(res.meses)
      }
      setCargado(anio)
    })
  }, [anio, cargado])

  const cortes = useMemo<Cortes>(() => {
    const conHl = filas.filter((f) => f.hl > 0)
    const hlSorted = conHl.map((f) => f.hl).sort((a, b) => a - b)
    const floorHl = quantile(hlSorted, 0.1)
    const chl = conHl
      .filter((f) => f.hl >= floorHl)
      .map((f) => f.costo_x_hl)
      .sort((a, b) => a - b)
    return { floorHl, p90: quantile(chl, 0.9) }
  }, [filas])

  const kpis = useMemo(() => {
    const costoTotal = filas.reduce((s, f) => s + f.costo_total, 0)
    const venta = filas.reduce((s, f) => s + f.venta_neta, 0)
    const bultos = filas.reduce((s, f) => s + f.bultos, 0)
    const criticos = filas.filter((f) => clasificar(f, cortes).key === "caro").length
    return {
      costoTotal,
      venta,
      bultos,
      pct: venta ? (100 * costoTotal) / venta : 0,
      xBulto: bultos ? costoTotal / bultos : 0,
      criticos,
      pdv: filas.length,
    }
  }, [filas, cortes])

  // Conteo por banda (10% más caro / resto / bajo volumen) sobre el acumulado.
  const porBanda = useMemo(() => {
    const m = new Map<string, { pdv: number; venta: number; costo: number }>()
    for (const b of BANDAS) m.set(b.key, { pdv: 0, venta: 0, costo: 0 })
    for (const f of filas) {
      const acc = m.get(clasificar(f, cortes).key)!
      acc.pdv++
      acc.venta += f.venta_neta
      acc.costo += f.costo_total
    }
    return m
  }, [filas, cortes])

  // Resumen por ciudad acumulado (ordenado por costo desc).
  const porCiudad = useMemo(() => {
    const m = new Map<string, { pdv: number; venta: number; costo: number; bultos: number; hl: number }>()
    for (const f of filas) {
      const acc = m.get(f.ciudad) ?? { pdv: 0, venta: 0, costo: 0, bultos: 0, hl: 0 }
      acc.pdv++
      acc.venta += f.venta_neta
      acc.costo += f.costo_total
      acc.bultos += f.bultos
      acc.hl += f.hl
      m.set(f.ciudad, acc)
    }
    return [...m.entries()].sort((a, b) => b[1].costo - a[1].costo)
  }, [filas])

  const filasVista = useMemo(() => {
    let arr = filas
    if (q.trim()) {
      const t = q.trim().toLowerCase()
      arr = arr.filter(
        (f) => f.nombre_cliente.toLowerCase().includes(t) || String(f.id_cliente).includes(t),
      )
    }
    if (bandaFiltro) arr = arr.filter((f) => clasificar(f, cortes).key === bandaFiltro)
    if (ciudadFiltro) arr = arr.filter((f) => f.ciudad === ciudadFiltro)
    const dir = sortDir === "asc" ? 1 : -1
    arr = [...arr].sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (typeof va === "string" || typeof vb === "string")
        return String(va).localeCompare(String(vb)) * dir
      return ((va as number) - (vb as number)) * dir
    })
    return arr
  }, [filas, q, bandaFiltro, ciudadFiltro, sortKey, sortDir, cortes])

  const LIMITE = 150
  const visibles = filasVista.slice(0, LIMITE)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(k)
      setSortDir(k === "nombre_cliente" ? "asc" : "desc")
    }
  }

  function ThSort({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) {
    return (
      <TableHead className={right ? "text-right" : ""}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-slate-900 ${right ? "flex-row-reverse" : ""}`}
        >
          {children}
          {sortKey === k && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
        </button>
      </TableHead>
    )
  }

  if (anios.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No hay meses cargados todavía.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Aviso */}
      <Card className="border-l-4 border-l-sky-500 bg-sky-50/50">
        <CardContent className="flex items-start gap-3 pt-6">
          <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-sky-900">Acumulado del año (YTD)</p>
            <p className="mt-1">
              Suma el costo logístico de <strong>todos los meses cargados</strong> del año. Cada PDV
              acumula sus bultos, HL, venta y costos; el <strong>$/HL</strong>, <strong>$/bulto</strong>{" "}
              y <strong>% rechazo</strong> se recalculan sobre el total acumulado (no se promedian),
              así que el ranking de “caros de servir” es el del año, no el de un mes puntual.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Selector de año */}
      {anios.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {anios.map((a) => (
            <button
              key={a}
              type="button"
              disabled={isPending}
              onClick={() => setAnio(a)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                anio === a ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {a}
            </button>
          ))}
          {isPending && <span className="text-xs text-muted-foreground">Calculando…</span>}
        </div>
      )}

      {/* Meses incluidos */}
      {meses.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Acumulado {anio} — {meses.length} mes{meses.length > 1 ? "es" : ""} cargado
          {meses.length > 1 ? "s" : ""}: {meses.map((m) => MESES[m.mes - 1]).join(" · ")}
        </p>
      )}

      {isPending && filas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Calculando el acumulado…</CardContent>
        </Card>
      ) : filas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay datos acumulados para {anio}.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi titulo="Costo logístico YTD" valor={fmtMoney(kpis.costoTotal)} sub={`${fmtNum(kpis.pdv)} PDV`} icon={<Wallet className="h-5 w-5 text-slate-600" />} />
            <Kpi titulo="Costo / Venta" valor={`${fmtNum(kpis.pct, 1)}%`} sub={`Venta neta ${fmtMoney(kpis.venta)}`} icon={<Percent className="h-5 w-5 text-slate-600" />} />
            <Kpi titulo="Costo x bulto" valor={fmtMoney(kpis.xBulto)} sub={`${fmtNum(kpis.bultos)} bultos`} icon={<Package className="h-5 w-5 text-slate-600" />} />
            <Kpi
              titulo="PDV caros de servir"
              valor={fmtNum(kpis.criticos)}
              sub={`Top 10% peor costo/HL (≥ ${fmtMoney(cortes.p90)}/HL)`}
              icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
              alerta={kpis.criticos > 0}
            />
          </div>

          {/* Distribución por banda (clickeable) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">PDV por costo/HL del año — el 10% más caro de servir</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {BANDAS.map((b) => {
                  const d = porBanda.get(b.key)!
                  const activo = bandaFiltro === b.key
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBandaFiltro(activo ? null : b.key)}
                      className={`rounded-lg border p-3 text-left transition-all ${b.bg} ${
                        activo ? "ring-2 ring-offset-1" : "hover:brightness-95"
                      }`}
                      style={activo ? { ["--tw-ring-color" as string]: b.color } : undefined}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${b.text}`}>{b.label}</span>
                        <span className={`text-lg font-bold ${b.text}`}>{fmtNum(d.pdv)}</span>
                      </div>
                      <p className={`text-[10px] uppercase tracking-wide ${b.text} opacity-70`}>{b.hint}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Venta {fmtMoney(d.venta)} · Costo {fmtMoney(d.costo)}
                      </p>
                    </button>
                  )
                })}
              </div>
              {bandaFiltro && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Filtrando por banda {BANDAS.find((b) => b.key === bandaFiltro)?.label}.{" "}
                  <button type="button" className="underline" onClick={() => setBandaFiltro(null)}>
                    Quitar filtro
                  </button>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Evolución mes a mes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolución mes a mes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">PDV</TableHead>
                      <TableHead className="text-right">Bultos</TableHead>
                      <TableHead className="text-right">Venta neta</TableHead>
                      <TableHead className="text-right">Costo logístico</TableHead>
                      <TableHead className="text-right">Costo/Venta</TableHead>
                      <TableHead className="text-right">$/HL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {meses.map((m) => (
                      <TableRow key={m.mes}>
                        <TableCell className="font-medium">{MESES[m.mes - 1]} {m.anio}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(m.pdv)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(m.bultos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(m.venta_neta)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtMoney(m.costo_total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(m.venta_neta ? (100 * m.costo_total) / m.venta_neta : 0, 1)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(m.hl ? m.costo_total / m.hl : 0)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>Acumulado</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(kpis.pdv)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(kpis.bultos)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(kpis.venta)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(kpis.costoTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(kpis.pct, 1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(
                          filas.reduce((s, f) => s + f.hl, 0)
                            ? kpis.costoTotal / filas.reduce((s, f) => s + f.hl, 0)
                            : 0,
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                El “PDV” de cada mes es la cantidad de PDV activos ese mes; en el acumulado un mismo
                cliente cuenta una sola vez, por eso el total de PDV no es la suma de los meses.
              </p>
            </CardContent>
          </Card>

          {/* Costo por ciudad acumulado */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Costo por ciudad (acumulado)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ciudad</TableHead>
                      <TableHead className="text-right">km (CD)</TableHead>
                      <TableHead className="text-right">PDV</TableHead>
                      <TableHead className="text-right">Venta neta</TableHead>
                      <TableHead className="text-right">Costo logístico</TableHead>
                      <TableHead className="text-right">Costo/Venta</TableHead>
                      <TableHead className="text-right">$/HL</TableHead>
                      <TableHead className="text-right">$/bulto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porCiudad.map(([ciudad, d]) => {
                      const pct = d.venta ? (100 * d.costo) / d.venta : 0
                      const activo = ciudadFiltro === ciudad
                      return (
                        <TableRow
                          key={ciudad}
                          onClick={() => setCiudadFiltro(activo ? null : ciudad)}
                          className={`cursor-pointer ${activo ? "bg-slate-100" : "hover:bg-slate-50"}`}
                        >
                          <TableCell className="font-medium">{ciudad}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {kmPorCiudad.has(ciudad) ? `${fmtNum(kmPorCiudad.get(ciudad)!)} km` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(d.pdv)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoney(d.venta)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({fmtNum(kpis.venta ? (100 * d.venta) / kpis.venta : 0, 1)}%)
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {fmtMoney(d.costo)}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              ({fmtNum(kpis.costoTotal ? (100 * d.costo) / kpis.costoTotal : 0, 1)}%)
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(pct, 1)}%</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtMoney(d.hl ? d.costo / d.hl : 0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(d.bultos ? d.costo / d.bultos : 0)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {ciudadFiltro ? (
                  <>
                    Filtrando por <strong>{ciudadFiltro}</strong> — el detalle de abajo muestra los PDV de esa ciudad.{" "}
                    <button type="button" className="underline" onClick={() => setCiudadFiltro(null)}>
                      Quitar filtro
                    </button>
                  </>
                ) : (
                  "Clic en una ciudad para filtrar el detalle por PDV de abajo."
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                El % entre paréntesis es la <strong>participación</strong> de la ciudad sobre la venta y el costo
                totales del acumulado del año.
              </p>
            </CardContent>
          </Card>

          {/* Detalle por PDV acumulado */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Detalle por PDV (acumulado)</CardTitle>
              <div className="relative w-64 max-w-full">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente o ID…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <ThSort k="nombre_cliente">Cliente</ThSort>
                      <ThSort k="ciudad">Ciudad</ThSort>
                      <ThSort k="bultos" right>Bultos</ThSort>
                      <ThSort k="comprobantes" right>Entregas</ThSort>
                      <ThSort k="hl" right>HL</ThSort>
                      <ThSort k="venta_neta" right>Venta neta</ThSort>
                      <ThSort k="costo_total" right>Costo logístico</ThSort>
                      <ThSort k="costo_x_hl" right>$/HL</ThSort>
                      <ThSort k="pct_venta" right>Costo/Venta</ThSort>
                      <ThSort k="pct_rechazo" right>% Rech.</ThSort>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibles.map((f) => {
                      const b = clasificar(f, cortes)
                      return (
                        <TableRow key={f.id_cliente}>
                          <TableCell className="font-medium">
                            {f.nombre_cliente}
                            <span className="ml-1 text-xs text-muted-foreground">#{f.id_cliente}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{f.ciudad}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(f.bultos)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(f.comprobantes)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(f.hl, 1)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(f.venta_neta)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtMoney(f.costo_total)}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={`${b.bg} ${b.text} hover:${b.bg}`} title={b.label}>{fmtMoney(f.costo_x_hl)}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmtNum(f.pct_venta, 1)}%</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {f.pct_rechazo > 0 ? (
                              <span className={f.pct_rechazo >= 10 ? "font-medium text-red-600" : "text-muted-foreground"}>
                                {fmtNum(f.pct_rechazo, 1)}%
                                <span className="ml-1 text-xs text-muted-foreground">({fmtNum(f.bultos_rechazados, 1)})</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Mostrando {fmtNum(visibles.length)} de {fmtNum(filasVista.length)} PDV
                {filasVista.length > LIMITE ? " (refiná con la búsqueda o el orden para ver otros)" : ""}.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Kpi({
  titulo, valor, sub, icon, alerta,
}: { titulo: string; valor: string; sub: string; icon: React.ReactNode; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{titulo}</p>
            <p className={`text-3xl font-bold ${alerta ? "text-red-600" : "text-slate-900"}`}>{valor}</p>
          </div>
          <div className={`rounded-full p-3 ${alerta ? "bg-red-100" : "bg-slate-100"}`}>{icon}</div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}
