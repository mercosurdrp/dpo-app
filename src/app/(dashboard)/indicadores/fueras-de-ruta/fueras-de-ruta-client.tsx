"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  RefreshCw,
  Download,
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Package,
  Route as RouteIcon,
  Users,
} from "lucide-react"
import {
  sincronizarFuerasDeRuta,
  type FuerasDeRutaIndicador,
} from "@/actions/fueras-de-ruta"

const DIA_ABBR: Record<number, string> = {
  1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom",
}

function fmtInt(n: number): string {
  return n.toLocaleString("es-AR")
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}
function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
}
function fmtDateAR(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number)
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "")
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(";"),
    )
    .join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const PAGE_SIZE = 50

export function FuerasDeRutaClient({
  data,
  canSync,
}: {
  data: FuerasDeRutaIndicador
  canSync: boolean
}) {
  const router = useRouter()
  const [desdeInput, setDesdeInput] = useState(data.desde)
  const [hastaInput, setHastaInput] = useState(data.hasta)
  const [search, setSearch] = useState("")
  const [soloFuera, setSoloFuera] = useState(false)
  const [excluirEliminados, setExcluirEliminados] = useState(true)
  const [excluirSinItems, setExcluirSinItems] = useState(true)
  const [page, setPage] = useState(1)

  const [syncPending, startSync] = useTransition()
  const [periodoPending, startPeriodo] = useTransition()
  const [syncMsg, setSyncMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)

  function aplicarPeriodo() {
    setPage(1)
    startPeriodo(() => {
      const params = new URLSearchParams()
      params.set("desde", desdeInput)
      params.set("hasta", hastaInput)
      router.push(`/indicadores/fueras-de-ruta?${params.toString()}`)
    })
  }

  function ejecutarSync() {
    setSyncMsg(null)
    startSync(async () => {
      const res = await sincronizarFuerasDeRuta({ desde: desdeInput, hasta: hastaInput })
      if ("error" in res) {
        setSyncMsg({ tipo: "err", texto: res.error })
        return
      }
      const { rutas, clientes, pedidos, ms } = res.data
      setSyncMsg({
        tipo: "ok",
        texto: `Sync OK · ${rutas.preVigentes} rutas PRE · ${clientes.conRutaPre}/${clientes.total} clientes con ruta · ${pedidos.pedidosInsertados} filas pedidos en ${pedidos.diasConsultados} días (${(ms / 1000).toFixed(1)}s)`,
      })
      router.refresh()
    })
  }

  const filasFiltradas = useMemo(() => {
    const s = search.trim().toLowerCase()
    return data.filas.filter((f) => {
      if (excluirEliminados && f.eliminado) return false
      if (excluirSinItems && f.items_no_anulados === 0) return false
      if (soloFuera && f.es_fuera_de_ruta !== true) return false
      if (!s) return true
      const blob =
        `${f.id_cliente} ${f.razon_social ?? ""} ${f.des_localidad ?? ""} ${f.des_ruta ?? ""} ${f.des_personal ?? ""}`.toLowerCase()
      return blob.includes(s)
    })
  }, [data.filas, search, soloFuera, excluirEliminados, excluirSinItems])

  const totalPages = Math.max(1, Math.ceil(filasFiltradas.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const filasPagina = filasFiltradas.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  function exportarCsv() {
    const header = [
      "fecha_entrega",
      "dia_pedido",
      "id_cliente",
      "razon_social",
      "localidad",
      "canal",
      "id_ruta",
      "ruta",
      "promotor",
      "dias_planificados",
      "es_fuera_de_ruta",
      "items_no_anulados",
      "unidades_total",
      "monto_aprox",
      "eliminado",
    ]
    const rows = filasFiltradas.map((f) => [
      f.fecha_entrega,
      DIA_ABBR[f.dow_iso_entrega] ?? "",
      String(f.id_cliente),
      f.razon_social ?? "",
      f.des_localidad ?? "",
      f.des_canal_mkt ?? "",
      f.id_ruta == null ? "" : String(f.id_ruta),
      f.des_ruta ?? "",
      f.des_personal ?? "",
      (f.dias_visita_iso ?? []).map((d) => DIA_ABBR[d]).filter(Boolean).join("-"),
      f.es_fuera_de_ruta === null ? "S/D" : f.es_fuera_de_ruta ? "SI" : "NO",
      String(f.items_no_anulados),
      String(f.unidades_total),
      String(f.monto_aprox),
      f.eliminado ? "SI" : "NO",
    ])
    downloadCsv(`fueras-de-ruta_${data.desde}_${data.hasta}.csv`, [header, ...rows])
  }

  const topPersonal = data.porPersonal.slice(0, 5)
  const topRutas = data.porRuta.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fueras de Ruta</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos cuya fecha de entrega no coincide con el día de visita planificado
            para la ruta PRE del cliente. Fuente: Chess Misiones.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Período</div>
          <div className="text-sm font-medium text-slate-900">
            {fmtDateAR(data.desde)} → {fmtDateAR(data.hasta)}
          </div>
          {data.ultimoSync ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Último sync: {new Date(data.ultimoSync.started_at).toLocaleString("es-AR")} ·{" "}
              <span
                className={
                  data.ultimoSync.status === "ok"
                    ? "text-emerald-700"
                    : data.ultimoSync.status === "error"
                    ? "text-red-700"
                    : "text-slate-700"
                }
              >
                {data.ultimoSync.status}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-xs text-amber-700">Sin sync registrado todavía</div>
          )}
        </div>
      </div>

      {/* Selector período + Sync */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="desde" className="text-xs uppercase tracking-wide text-muted-foreground">
                Desde
              </Label>
              <Input
                id="desde"
                type="date"
                value={desdeInput}
                onChange={(e) => setDesdeInput(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="hasta" className="text-xs uppercase tracking-wide text-muted-foreground">
                Hasta
              </Label>
              <Input
                id="hasta"
                type="date"
                value={hastaInput}
                onChange={(e) => setHastaInput(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button onClick={aplicarPeriodo} disabled={periodoPending}>
              <Calendar className="mr-1.5 h-4 w-4" />
              {periodoPending ? "Aplicando..." : "Aplicar período"}
            </Button>
            {canSync && (
              <Button
                variant="secondary"
                onClick={ejecutarSync}
                disabled={syncPending}
                title="Sincroniza rutas, clientes y pedidos del período desde Chess (puede tardar)"
              >
                <RefreshCw className={`mr-1.5 h-4 w-4 ${syncPending ? "animate-spin" : ""}`} />
                {syncPending ? "Sincronizando..." : "Sincronizar período"}
              </Button>
            )}
          </div>
          {syncMsg && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                syncMsg.tipo === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {syncMsg.texto}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          color="slate"
          label="Pedidos totales"
          value={fmtInt(data.totalPedidos)}
          hint="Excluye eliminados e items 100% anulados"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          color="rose"
          label="Fuera de ruta"
          value={fmtInt(data.totalFueraDeRuta)}
          hint="Pedido cuyo día no figura en la ruta del cliente"
        />
        <KpiCard
          icon={<RouteIcon className="h-5 w-5" />}
          color="amber"
          label="% Fuera de ruta"
          value={fmtPct(data.porcFueraDeRuta)}
          hint="Sobre pedidos con ruta PRE asignada"
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          color="indigo"
          label="Sin ruta PRE"
          value={fmtInt(data.totalSinRutaPre)}
          hint="Pedidos de clientes sin fuerza PRE vigente"
        />
      </div>

      {data.truncated && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ Los resultados se truncaron a 10.000 filas — usá un rango más corto para ver el detalle completo.
        </div>
      )}

      {/* Top promotores / rutas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Top promotores por fuera de ruta
            </h2>
            {topPersonal.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Promotor</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Fuera</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPersonal.map((p) => (
                    <TableRow key={String(p.id_personal)}>
                      <TableCell className="font-medium">{p.des_personal ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtInt(p.pedidos)}</TableCell>
                      <TableCell className="text-right">{fmtInt(p.fuera_de_ruta)}</TableCell>
                      <TableCell className="text-right">{fmtPct(p.porc)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Top rutas por fuera de ruta
            </h2>
            {topRutas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Promotor</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Fuera</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRutas.map((r) => (
                    <TableRow key={String(r.id_ruta)}>
                      <TableCell className="font-medium">
                        {r.des_ruta ?? (r.id_ruta == null ? "(sin ruta)" : `Ruta ${r.id_ruta}`)}
                      </TableCell>
                      <TableCell>{r.des_personal ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtInt(r.pedidos)}</TableCell>
                      <TableCell className="text-right">{fmtInt(r.fuera_de_ruta)}</TableCell>
                      <TableCell className="text-right">{fmtPct(r.porc)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla detalle */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Detalle de pedidos
            </h2>
            <div className="flex-1" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Buscar cliente, ruta, promotor..."
                className="w-64 pl-8"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={soloFuera}
                onCheckedChange={(v) => {
                  setSoloFuera(v === true)
                  setPage(1)
                }}
              />
              Solo fuera de ruta
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={excluirEliminados}
                onCheckedChange={(v) => {
                  setExcluirEliminados(v === true)
                  setPage(1)
                }}
              />
              Excluir eliminados
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={excluirSinItems}
                onCheckedChange={(v) => {
                  setExcluirSinItems(v === true)
                  setPage(1)
                }}
              />
              Excluir 100% anulados
            </label>
            <Button variant="outline" size="sm" onClick={exportarCsv}>
              <Download className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Día</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Localidad</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Promotor</TableHead>
                  <TableHead>Días planif.</TableHead>
                  <TableHead className="text-right">Items OK</TableHead>
                  <TableHead className="text-right">$ aprox</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasPagina.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                      Sin filas para el filtro actual.
                    </TableCell>
                  </TableRow>
                ) : (
                  filasPagina.map((f) => (
                    <TableRow key={`${f.id_cliente}-${f.fecha_entrega}`}>
                      <TableCell className="whitespace-nowrap">{fmtDateAR(f.fecha_entrega)}</TableCell>
                      <TableCell className="whitespace-nowrap">{DIA_ABBR[f.dow_iso_entrega]}</TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{f.razon_social ?? `#${f.id_cliente}`}</div>
                        <div className="text-xs text-muted-foreground">#{f.id_cliente}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{f.des_localidad ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {f.des_ruta ?? (f.id_ruta == null ? "(sin ruta)" : `Ruta ${f.id_ruta}`)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{f.des_personal ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {f.dias_visita_iso && f.dias_visita_iso.length > 0
                          ? f.dias_visita_iso.map((d) => DIA_ABBR[d]).filter(Boolean).join(" · ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">{fmtInt(f.items_no_anulados)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(f.monto_aprox)}</TableCell>
                      <TableCell>
                        <FueraBadge value={f.es_fuera_de_ruta} eliminado={f.eliminado} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginación */}
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <div>
              {filasFiltradas.length > 0
                ? `${(pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(pageSafe * PAGE_SIZE, filasFiltradas.length)} de ${fmtInt(filasFiltradas.length)} filas`
                : "0 filas"}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {pageSafe} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FueraBadge({
  value,
  eliminado,
}: {
  value: boolean | null
  eliminado: boolean
}) {
  if (eliminado) return <Badge variant="outline">Eliminado</Badge>
  if (value === null)
    return (
      <Badge variant="outline" className="border-indigo-300 text-indigo-700">
        Sin ruta PRE
      </Badge>
    )
  if (value) return <Badge className="bg-rose-600 hover:bg-rose-600">Fuera de ruta</Badge>
  return <Badge className="bg-emerald-600 hover:bg-emerald-600">En ruta</Badge>
}

const COLOR_MAP: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  rose: "bg-rose-100 text-rose-700",
  amber: "bg-amber-100 text-amber-700",
  indigo: "bg-indigo-100 text-indigo-700",
}

function KpiCard({
  icon,
  color,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  color: "slate" | "rose" | "amber" | "indigo"
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2.5 ${COLOR_MAP[color]}`}>{icon}</div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
