"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Wallet,
  Percent,
  Package,
  AlertTriangle,
  Search,
  Settings2,
  ChevronUp,
  ChevronDown,
  Info,
} from "lucide-react"
import {
  getCostoPorPdv,
  getCostosMensuales,
  guardarCostoMensual,
  getKmCiudades,
  guardarKmCiudad,
  type CostoMensual,
  type CostoPorPdvRow,
  type KmCiudad,
} from "@/actions/costo-pdv"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const fmtMoney = (n: number) =>
  "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0))
const fmtNum = (n: number, d = 0) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n || 0)

// Bandas de EFICIENCIA logística por PDV, según su costo por HL (cost-to-serve unitario).
// La clasificación es por PERCENTIL del costo/HL dentro del mes; un cliente es "caro de
// servir" cuando mover cada litro hacia él cuesta más, no porque compre mucho. Los PDV de
// volumen muy bajo van a una banda aparte: su costo/HL se infla por el componente fijo de
// "parada" sobre pocos litros y no es representativo.
const BANDAS = [
  { key: "caro", label: "10% más caro", hint: "top 10% costo/HL", color: "#dc2626", bg: "bg-red-50", text: "text-red-700" },
  { key: "resto", label: "Resto", hint: "costo/HL normal", color: "#16a34a", bg: "bg-green-50", text: "text-green-700" },
  { key: "bajo", label: "Bajo volumen", hint: "HL no representativo", color: "#64748b", bg: "bg-slate-100", text: "text-slate-600" },
] as const

/** Interpolación lineal de percentil sobre un array YA ordenado ascendente. */
function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base]
}

/** Umbrales del ranking de costo/HL del mes. */
interface Cortes {
  floorHl: number // piso de HL: por debajo, el PDV no entra al ranking (volumen no representativo)
  p90: number // costo/HL a partir del cual un PDV es del 10% más caro
}

/** Banda de un PDV: 10% más caro, resto, o bajo volumen (fuera del ranking). */
function clasificar(f: CostoPorPdvRow, c: Cortes): (typeof BANDAS)[number] {
  if (f.hl <= 0 || f.hl < c.floorHl) return BANDAS[2] // bajo volumen (no representativo)
  if (f.costo_x_hl >= c.p90) return BANDAS[0] // 10% más caro por costo/HL
  return BANDAS[1] // resto
}

type SortKey = keyof Pick<
  CostoPorPdvRow,
  "nombre_cliente" | "ciudad" | "bultos" | "comprobantes" | "hl" | "venta_neta" | "costo_total" | "costo_x_hl" | "pct_venta" | "pct_rechazo"
>

interface Props {
  costos: CostoMensual[]
  mesInicial: { anio: number; mes: number } | null
  filasIniciales: CostoPorPdvRow[]
  kmCiudades: KmCiudad[]
  canEdit: boolean
}

export function CostoPdvClient({ costos: costosInit, mesInicial, filasIniciales, kmCiudades: kmInit, canEdit }: Props) {
  const [costos, setCostos] = useState<CostoMensual[]>(costosInit)
  const [sel, setSel] = useState(mesInicial)
  const [filas, setFilas] = useState<CostoPorPdvRow[]>(filasIniciales)
  const [kmCiudades, setKmCiudades] = useState<KmCiudad[]>(kmInit)
  const [isPending, startTransition] = useTransition()

  // Lookup ciudad -> km, para mostrar la distancia en el resumen por ciudad.
  const kmPorCiudad = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of kmCiudades) m.set(k.ciudad, k.km)
    return m
  }, [kmCiudades])

  const [q, setQ] = useState("")
  const [bandaFiltro, setBandaFiltro] = useState<string | null>(null)
  const [ciudadFiltro, setCiudadFiltro] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("costo_x_hl")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [panelOpen, setPanelOpen] = useState(false)

  const costoMes = useMemo(
    () => costos.find((c) => sel && c.anio === sel.anio && c.mes === sel.mes) ?? null,
    [costos, sel],
  )

  function cambiarMes(anio: number, mes: number) {
    setSel({ anio, mes })
    startTransition(async () => {
      const res = await getCostoPorPdv(anio, mes)
      setFilas("data" in res ? res.data : [])
    })
  }

  // Cortes de percentil de costo/HL del mes. Se dejan aparte los PDV de volumen muy bajo
  // (HL por debajo del percentil 10) antes de calcular los percentiles de costo/HL, para
  // que el ranking de "caros" no quede dominado por clientes de volumen ínfimo.
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

  // Ranking por costo/HL (1 = el más caro de servir), solo sobre PDV representativos.
  const rankByHl = useMemo(() => {
    const m = new Map<number, number>()
    filas
      .filter((f) => clasificar(f, cortes).key !== "bajo")
      .sort((a, b) => b.costo_x_hl - a.costo_x_hl)
      .forEach((f, i) => m.set(f.id_cliente, i + 1))
    return m
  }, [filas, cortes])

  // KPIs del mes
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

  // Conteo por banda
  const porBanda = useMemo(() => {
    const m = new Map<string, { pdv: number; venta: number; costo: number }>()
    for (const b of BANDAS) m.set(b.key, { pdv: 0, venta: 0, costo: 0 })
    for (const f of filas) {
      const b = clasificar(f, cortes)
      const acc = m.get(b.key)!
      acc.pdv++
      acc.venta += f.venta_neta
      acc.costo += f.costo_total
    }
    return m
  }, [filas, cortes])

  // Resumen por ciudad (ordenado por costo desc)
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

  // Filas filtradas + ordenadas
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
          {sortKey === k &&
            (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </button>
      </TableHead>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Costo por Punto de Venta</h1>
          <p className="text-sm text-muted-foreground">
            Cost-to-serve logístico — reparte Distribución + Almacén entre cada PDV por volumen, distancia y entregas.
            Los PDV se clasifican por <strong>costo/HL</strong> (lo caro de servir cada litro), no por su costo total.
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setPanelOpen((v) => !v)}>
            <Settings2 className="h-4 w-4" /> Cargar costos
          </Button>
        )}
      </div>

      {/* Selector de mes */}
      {costos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay costos cargados todavía.{canEdit ? " Usá “Cargar costos” para agregar un mes." : ""}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {costos.map((c) => {
            const activo = sel?.anio === c.anio && sel?.mes === c.mes
            return (
              <button
                key={`${c.anio}-${c.mes}`}
                type="button"
                disabled={isPending}
                onClick={() => cambiarMes(c.anio, c.mes)}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  activo ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {MESES[c.mes - 1]} {c.anio}
              </button>
            )
          })}
          {isPending && <span className="text-xs text-muted-foreground">Actualizando…</span>}
        </div>
      )}

      {/* Panel de carga (solo editores) */}
      {canEdit && panelOpen && (
        <PanelCarga
          sel={sel}
          costoMes={costoMes}
          kmCiudades={kmCiudades}
          onSaved={async (anio, mes) => {
            const nuevos = await getCostosMensuales()
            setCostos(nuevos)
            if (sel && sel.anio === anio && sel.mes === mes) {
              const res = await getCostoPorPdv(anio, mes)
              setFilas("data" in res ? res.data : [])
            } else {
              cambiarMes(anio, mes)
            }
          }}
          onKmSaved={async () => {
            setKmCiudades(await getKmCiudades())
            if (sel) {
              const res = await getCostoPorPdv(sel.anio, sel.mes)
              setFilas("data" in res ? res.data : [])
            }
          }}
        />
      )}

      {costoMes && (
        <p className="text-xs text-muted-foreground">
          Costos del mes — Distribución {fmtMoney(costoMes.distribucion)} · Almacén {fmtMoney(costoMes.almacen)} ·
          split rodaje/parada {Math.round(costoMes.w_rodaje * 100)}/{Math.round((1 - costoMes.w_rodaje) * 100)}
        </p>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Costo logístico" valor={fmtMoney(kpis.costoTotal)} sub={`${fmtNum(kpis.pdv)} PDV`} icon={<Wallet className="h-5 w-5 text-slate-600" />} />
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

      {/* Criterio de cálculo — a tener en cuenta */}
      <Card className="border-l-4 border-l-amber-400 bg-amber-50/40">
        <CardContent className="pt-6">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-amber-900 marker:content-['']">
              <Info className="h-4 w-4 text-amber-600" />
              Cómo se calcula y qué tener en cuenta
              <ChevronDown className="ml-auto h-4 w-4 text-amber-600 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                El costo logístico de cada PDV <strong>no se mide individualmente</strong>: es un{" "}
                <strong>reparto</strong> del costo del mes (Distribución + Almacén) entre todos los clientes, según
                cuánto mueven.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>Almacén</strong> → se reparte por <strong>bultos</strong>.</li>
                <li>
                  <strong>Distribución</strong> → 65% por <strong>bultos × km de la ciudad</strong> (rodaje/viaje:
                  un bulto que viaja más lejos cuesta más) + 35% por <strong>entregas</strong> (parada).
                </li>
                <li>
                  La <strong>distancia</strong> sale de los km de ruta desde el centro de distribución (Ramallo) a
                  cada ciudad. El costo de llegar a una ciudad se reparte entre los bultos de todos sus clientes
                  (más clientes en la zona → menos costo de viaje por cada uno).
                </li>
                <li>
                  El <strong>10% más caro</strong> se ordena por <strong>costo/HL</strong>: marca a los que están
                  <strong> lejos</strong> y/o hacen <strong>muchas entregas por litro</strong> (compran poco y seguido).
                </li>
              </ul>
              <p className="rounded-md bg-amber-100/70 p-2 text-amber-900">
                ⚠️ <strong>A tener en cuenta:</strong> un PDV con <strong>muchos bultos y pocos HL</strong> (mix de
                productos con pocos litros, POP, secos, o HL mal informado) puede saltar al tope del ranking por
                costo/HL sin ser realmente caro de servir. Antes de accionar, mirá también sus bultos y entregas.
              </p>
              <p>
                La columna <strong>% Rech.</strong> es informativa (no entra al costo): bultos rechazados ÷ lo que se
                intentó entregar (vendidos + rechazados), con los bultos rechazados entre paréntesis. Un PDV que
                rechaza seguido es, en la práctica, más caro de servir (viaje y parada que se hicieron igual).
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Distribución por banda */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDV por costo/HL — el 10% más caro de servir</CardTitle>
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

      {/* Resumen por ciudad */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Costo por ciudad</CardTitle>
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
                  const activo = ciudadFiltro === ciudad
                  const pct = d.venta ? (100 * d.costo) / d.venta : 0
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
                      <TableCell className="text-right tabular-nums">{fmtMoney(d.venta)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtMoney(d.costo)}</TableCell>
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
                Filtrando por <strong>{ciudadFiltro}</strong> — el detalle de abajo muestra el top de esa ciudad.{" "}
                <button type="button" className="underline" onClick={() => setCiudadFiltro(null)}>
                  Quitar filtro
                </button>
              </>
            ) : (
              "Clic en una ciudad para filtrar el detalle y ver su top de PDV (ordenado por costo)."
            )}
          </p>
        </CardContent>
      </Card>

      {/* Tabla por PDV */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Detalle por PDV</CardTitle>
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
          {filas.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              No hay datos para este mes. Verificá que el mes tenga ventas y costos cargados.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">#</TableHead>
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
                      const puesto = rankByHl.get(f.id_cliente)
                      return (
                        <TableRow key={f.id_cliente}>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{puesto ?? "—"}</TableCell>
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
            </>
          )}
        </CardContent>
      </Card>
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

function PanelCarga({
  sel, costoMes, kmCiudades, onSaved, onKmSaved,
}: {
  sel: { anio: number; mes: number } | null
  costoMes: CostoMensual | null
  kmCiudades: KmCiudad[]
  onSaved: (anio: number, mes: number) => void | Promise<void>
  onKmSaved: () => void | Promise<void>
}) {
  const [anio, setAnio] = useState(sel?.anio ?? new Date().getFullYear())
  const [mes, setMes] = useState(sel?.mes ?? new Date().getMonth() + 1)
  const [distribucion, setDistribucion] = useState(costoMes?.distribucion ?? 0)
  const [almacen, setAlmacen] = useState(costoMes?.almacen ?? 0)
  const [wRodaje, setWRodaje] = useState(costoMes?.w_rodaje ?? 0.65)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Al cambiar el mes seleccionado afuera, sincronizo el form.
  useEffect(() => {
    if (sel) {
      setAnio(sel.anio)
      setMes(sel.mes)
    }
    setDistribucion(costoMes?.distribucion ?? 0)
    setAlmacen(costoMes?.almacen ?? 0)
    setWRodaje(costoMes?.w_rodaje ?? 0.65)
  }, [sel, costoMes])

  async function guardar() {
    setSaving(true)
    setMsg(null)
    const res = await guardarCostoMensual({ anio, mes, distribucion, almacen, w_rodaje: wRodaje })
    setSaving(false)
    if ("error" in res) {
      setMsg(res.error)
      return
    }
    setMsg("Guardado ✓")
    await onSaved(anio, mes)
  }

  return (
    <Card className="border-l-4 border-l-slate-400">
      <CardHeader>
        <CardTitle className="text-base">Cargar / editar costos mensuales</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Año</Label>
            <Input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Mes</Label>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {MESES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Distribución ($)</Label>
            <Input type="number" value={distribucion} onChange={(e) => setDistribucion(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Almacén ($)</Label>
            <Input type="number" value={almacen} onChange={(e) => setAlmacen(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Rodaje (0–1)</Label>
            <Input type="number" step="0.05" min="0" max="1" value={wRodaje} onChange={(e) => setWRodaje(Number(e.target.value))} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Rodaje = parte de Distribución que se reparte por <strong>volumen × distancia</strong> (bultos × km de la
          ciudad); el resto ({Math.round((1 - wRodaje) * 100)}%) se reparte por entregas. Almacén se reparte 100% por bultos.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>

        <PanelKm kmCiudades={kmCiudades} onKmSaved={onKmSaved} />
      </CardContent>
    </Card>
  )
}

/** Edición de la distancia (km de ruta) desde el CD a cada ciudad. */
function PanelKm({
  kmCiudades, onKmSaved,
}: {
  kmCiudades: KmCiudad[]
  onKmSaved: () => void | Promise<void>
}) {
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [savingCity, setSavingCity] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // Sincronizo el borrador cuando cambian los km de arriba.
  useEffect(() => {
    setDraft(Object.fromEntries(kmCiudades.map((k) => [k.ciudad, k.km])))
  }, [kmCiudades])

  async function guardar(ciudad: string) {
    setSavingCity(ciudad)
    setMsg(null)
    const res = await guardarKmCiudad(ciudad, Number(draft[ciudad] ?? 0))
    setSavingCity(null)
    if ("error" in res) {
      setMsg(res.error)
      return
    }
    setMsg(`${ciudad} guardado ✓`)
    await onKmSaved()
  }

  if (kmCiudades.length === 0) return null

  return (
    <div className="mt-6 border-t pt-4">
      <p className="text-sm font-semibold text-slate-900">Distancias por ciudad (km desde el CD)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Km de ruta desde el centro de distribución (Ramallo) a cada ciudad. Cambian cómo se reparte el rodaje:
        más lejos = más caro de servir por litro. El costo total del mes no se altera.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kmCiudades.map((k) => (
          <div key={k.ciudad} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{k.ciudad}</Label>
              <Input
                type="number"
                min="0"
                value={draft[k.ciudad] ?? k.km}
                onChange={(e) => setDraft((d) => ({ ...d, [k.ciudad]: Number(e.target.value) }))}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => guardar(k.ciudad)}
              disabled={savingCity === k.ciudad || Number(draft[k.ciudad]) === k.km}
            >
              {savingCity === k.ciudad ? "…" : "OK"}
            </Button>
          </div>
        ))}
      </div>
      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </div>
  )
}
