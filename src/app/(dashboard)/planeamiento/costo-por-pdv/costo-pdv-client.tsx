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
} from "lucide-react"
import {
  getCostoPorPdv,
  getCostosMensuales,
  guardarCostoMensual,
  type CostoMensual,
  type CostoPorPdvRow,
} from "@/actions/costo-pdv"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const fmtMoney = (n: number) =>
  "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n || 0))
const fmtNum = (n: number, d = 0) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n || 0)

// Bandas de costo logístico sobre la venta del PDV (cost-to-serve).
const BANDAS = [
  { key: "ok", label: "≤ 8%", min: -Infinity, max: 8, color: "#16a34a", bg: "bg-green-50", text: "text-green-700" },
  { key: "media", label: "8–12%", min: 8, max: 12, color: "#ca8a04", bg: "bg-amber-50", text: "text-amber-700" },
  { key: "alta", label: "12–20%", min: 12, max: 20, color: "#ea580c", bg: "bg-orange-50", text: "text-orange-700" },
  { key: "critica", label: "> 20%", min: 20, max: Infinity, color: "#dc2626", bg: "bg-red-50", text: "text-red-700" },
] as const

function bandaDe(pct: number) {
  return BANDAS.find((b) => pct >= b.min && pct < b.max) ?? BANDAS[0]
}

type SortKey = keyof Pick<
  CostoPorPdvRow,
  "nombre_cliente" | "bultos" | "comprobantes" | "venta_neta" | "costo_total" | "costo_x_bulto" | "pct_venta"
>

interface Props {
  costos: CostoMensual[]
  mesInicial: { anio: number; mes: number } | null
  filasIniciales: CostoPorPdvRow[]
  canEdit: boolean
}

export function CostoPdvClient({ costos: costosInit, mesInicial, filasIniciales, canEdit }: Props) {
  const [costos, setCostos] = useState<CostoMensual[]>(costosInit)
  const [sel, setSel] = useState(mesInicial)
  const [filas, setFilas] = useState<CostoPorPdvRow[]>(filasIniciales)
  const [isPending, startTransition] = useTransition()

  const [q, setQ] = useState("")
  const [bandaFiltro, setBandaFiltro] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("costo_total")
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

  // KPIs del mes
  const kpis = useMemo(() => {
    const costoTotal = filas.reduce((s, f) => s + f.costo_total, 0)
    const venta = filas.reduce((s, f) => s + f.venta_neta, 0)
    const bultos = filas.reduce((s, f) => s + f.bultos, 0)
    const criticos = filas.filter((f) => f.pct_venta > 20).length
    return {
      costoTotal,
      venta,
      bultos,
      pct: venta ? (100 * costoTotal) / venta : 0,
      xBulto: bultos ? costoTotal / bultos : 0,
      criticos,
      pdv: filas.length,
    }
  }, [filas])

  // Conteo por banda
  const porBanda = useMemo(() => {
    const m = new Map<string, { pdv: number; venta: number; costo: number }>()
    for (const b of BANDAS) m.set(b.key, { pdv: 0, venta: 0, costo: 0 })
    for (const f of filas) {
      const b = bandaDe(f.pct_venta)
      const acc = m.get(b.key)!
      acc.pdv++
      acc.venta += f.venta_neta
      acc.costo += f.costo_total
    }
    return m
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
    if (bandaFiltro) arr = arr.filter((f) => bandaDe(f.pct_venta).key === bandaFiltro)
    const dir = sortDir === "asc" ? 1 : -1
    arr = [...arr].sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (typeof va === "string" || typeof vb === "string")
        return String(va).localeCompare(String(vb)) * dir
      return ((va as number) - (vb as number)) * dir
    })
    return arr
  }, [filas, q, bandaFiltro, sortKey, sortDir])

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
            Cost-to-serve logístico — reparte Distribución + Almacén entre cada PDV por volumen y entregas
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
          titulo="PDV caros (> 20%)"
          valor={fmtNum(kpis.criticos)}
          sub="Costo logístico > 20% de su venta"
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          alerta={kpis.criticos > 0}
        />
      </div>

      {/* Distribución por banda */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribución de PDV por costo/venta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      <ThSort k="nombre_cliente">Cliente</ThSort>
                      <ThSort k="bultos" right>Bultos</ThSort>
                      <ThSort k="comprobantes" right>Entregas</ThSort>
                      <ThSort k="venta_neta" right>Venta neta</ThSort>
                      <ThSort k="costo_total" right>Costo logístico</ThSort>
                      <ThSort k="costo_x_bulto" right>$/bulto</ThSort>
                      <ThSort k="pct_venta" right>Costo/Venta</ThSort>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibles.map((f) => {
                      const b = bandaDe(f.pct_venta)
                      return (
                        <TableRow key={f.id_cliente}>
                          <TableCell className="font-medium">
                            {f.nombre_cliente}
                            <span className="ml-1 text-xs text-muted-foreground">#{f.id_cliente}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(f.bultos)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(f.comprobantes)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(f.venta_neta)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtMoney(f.costo_total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(f.costo_x_bulto)}</TableCell>
                          <TableCell className="text-right">
                            <Badge className={`${b.bg} ${b.text} hover:${b.bg}`}>{fmtNum(f.pct_venta, 1)}%</Badge>
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
  sel, costoMes, onSaved,
}: {
  sel: { anio: number; mes: number } | null
  costoMes: CostoMensual | null
  onSaved: (anio: number, mes: number) => void | Promise<void>
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
          Rodaje = parte de Distribución que se reparte por volumen (bultos); el resto ({Math.round((1 - wRodaje) * 100)}%)
          se reparte por entregas. Almacén se reparte 100% por bultos.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
