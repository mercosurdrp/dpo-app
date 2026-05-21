"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { sincronizarOrdenSalidaDesdeSheets } from "@/actions/orden-salida"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Package, PackageCheck, Truck, Calendar, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import type { SobrecargasIndicador } from "@/actions/sobrecargas"

type SortKey = "sobrecargas" | "medias" | "dias" | "total_eq"

function nombreMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
}

// 1.5 → "1.5", 2 → "2", 2.0 → "2". Evita trailing zeros sin perder decimales.
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function mesCorto(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")
    + " '" + String(y).slice(2)
}

export function SobrecargasClient({
  data,
  canSync,
}: {
  data: SobrecargasIndicador
  canSync: boolean
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("total_eq")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [syncDias, setSyncDias] = useState(180)
  const [syncPending, startSync] = useTransition()
  const [syncMsg, setSyncMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)

  function ejecutarSync() {
    setSyncMsg(null)
    startSync(async () => {
      const res = await sincronizarOrdenSalidaDesdeSheets(syncDias)
      if ("error" in res) {
        setSyncMsg({ tipo: "err", texto: res.error })
        return
      }
      setSyncMsg({
        tipo: "ok",
        texto: `${res.data.fechasProcesadas} días procesados · ${res.data.asignacionesInsertadas} asignaciones${res.data.advertencias.length > 0 ? ` · ${res.data.advertencias.length} advertencias` : ""}`,
      })
      router.refresh()
    })
  }

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    const arr = q
      ? data.empleados.filter((e) => e.nombre.toLowerCase().includes(q))
      : data.empleados
    const sign = sortDir === "desc" ? -1 : 1
    return [...arr].sort((a, b) => {
      const av = sortKey === "total_eq" ? a.sobrecargas + a.medias / 2 : a[sortKey]
      const bv = sortKey === "total_eq" ? b.sobrecargas + b.medias / 2 : b[sortKey]
      return sign * (av - bv)
    })
  }, [data.empleados, search, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc")
    else { setSortKey(k); setSortDir("desc") }
  }

  function cambiarMes(nuevoMes: string) {
    if (nuevoMes === data.mes) return
    const params = new URLSearchParams(sp.toString())
    if (nuevoMes) params.set("mes", nuevoMes)
    else params.delete("mes")
    router.push(`/indicadores/sobrecargas?${params.toString()}`)
  }

  const opcionesMes = data.mesesDisponibles
  const idxMes = opcionesMes.indexOf(data.mes)
  const mesPrev = idxMes > 0 ? opcionesMes[idxMes - 1] : null
  const mesNext = idxMes >= 0 && idxMes < opcionesMes.length - 1 ? opcionesMes[idxMes + 1] : null
  const totalEmpleadosConSobrecarga = data.empleados.length
  const debugClient = sp.get("debug") === "1"

  return (
    <div className="space-y-4">
      {debugClient && (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 font-mono whitespace-pre-wrap">
          {"DEBUG client (SobrecargasClient):\n"}
          {"  data.mes (prop): " + data.mes + "\n"}
          {"  data.mesesDisponibles: " + JSON.stringify(data.mesesDisponibles) + "\n"}
          {"  url.mes (useSearchParams): " + (sp.get("mes") ?? "(none)") + "\n"}
          {"  opcionesMes (select options): " + JSON.stringify(opcionesMes) + "\n"}
          {"  idxMes: " + idxMes + " | mesPrev: " + (mesPrev ?? "null") + " | mesNext: " + (mesNext ?? "null")}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sobrecargas</h1>
          <p className="text-sm text-muted-foreground">
            Sobrecargas y medias sobrecargas asignadas a choferes y ayudantes — fuente: hoja FORMACIÓN del Sheet de Orden de Salida.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Mes</label>
          <div className="flex items-center rounded-md border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => mesPrev && cambiarMes(mesPrev)}
              disabled={!mesPrev}
              aria-label="Mes anterior"
              title={mesPrev ? nombreMes(mesPrev) : "Sin meses anteriores"}
              className="flex h-9 w-8 items-center justify-center rounded-l-md text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              key={data.mes}
              autoComplete="off"
              value={data.mes}
              onChange={(e) => cambiarMes(e.target.value)}
              className="h-9 min-w-[140px] border-x border-slate-200 bg-white px-2 text-sm focus:outline-none"
            >
              {opcionesMes.map((m) => (
                <option key={m} value={m}>{nombreMes(m)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => mesNext && cambiarMes(mesNext)}
              disabled={!mesNext}
              aria-label="Mes siguiente"
              title={mesNext ? nombreMes(mesNext) : "Sin meses siguientes"}
              className="flex h-9 w-8 items-center justify-center rounded-r-md text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sincronización desde Sheets */}
      {canSync && (
        <Card className="border-slate-200 bg-slate-50/60">
          <CardContent className="flex flex-wrap items-center gap-3 p-3 md:p-4">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-medium text-slate-900">Sincronizar desde la planilla</p>
              <p className="text-xs text-muted-foreground">
                Lee la hoja FORMACIÓN y reescribe las asignaciones del rango (incluye sobrecargas, medias y 1/4).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600">Días</label>
              <input
                type="number"
                min={1}
                max={365}
                value={syncDias}
                onChange={(e) => setSyncDias(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="h-9 w-20 rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums"
                disabled={syncPending}
              />
              <Button
                onClick={ejecutarSync}
                disabled={syncPending}
                size="sm"
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${syncPending ? "animate-spin" : ""}`} />
                {syncPending ? "Sincronizando..." : "Sincronizar"}
              </Button>
            </div>
            {syncMsg && (
              <div
                className={`w-full rounded-md border px-3 py-2 text-xs ${
                  syncMsg.tipo === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {syncMsg.texto}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Sobrecargas (1)"
          value={data.totalSobrecargas}
          icon={<Package className="h-5 w-5" />}
          tone="rose"
        />
        <KpiCard
          label="Medias (1/4 cuenta 0.5)"
          value={data.totalMedias}
          icon={<PackageCheck className="h-5 w-5" />}
          tone="amber"
        />
        <KpiCard
          label="Personas con sobrecarga"
          value={totalEmpleadosConSobrecarga}
          icon={<Truck className="h-5 w-5" />}
          tone="slate"
        />
        <KpiCard
          label="Equivalente total"
          value={data.totalSobrecargas + data.totalMedias / 2}
          icon={<Calendar className="h-5 w-5" />}
          tone="indigo"
          help="Sobrecargas + (medias / 2)"
        />
      </div>

      {/* Evolución mensual */}
      <Card className="border-slate-200">
        <CardContent className="p-3 md:p-4">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-slate-900">Evolución últimos 6 meses</h2>
            <p className="text-xs text-muted-foreground">Total de sobrecargas y medias por mes (suma de la flota).</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.serie.map((s) => ({
                mes: mesCorto(s.mes),
                Sobrecargas: s.sobrecargas,
                Medias: s.medias,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Sobrecargas" stackId="a" fill="#e11d48" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Medias" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Ranking choferes/ayudantes */}
      <Card className="border-slate-200">
        <CardContent className="p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Ranking de personas — {nombreMes(data.mes)}
              </h2>
              <p className="text-xs text-muted-foreground">
                Suma como chofer y como ayudante. Una 1/4 sobrecarga cuenta como 0.5 dentro de "Medias".
              </p>
            </div>
            <input
              type="text"
              placeholder="Buscar nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 text-sm"
            />
          </div>

          {filtrados.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No hay sobrecargas registradas en el mes seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Empleado</TableHead>
                    <TableHead>Puesto</TableHead>
                    <SortableHead label="Sobrecargas" k="sobrecargas" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Medias" k="medias" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Días" k="dias" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Equiv." k="total_eq" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((e) => {
                    const eq = e.sobrecargas + e.medias / 2
                    return (
                      <TableRow key={e.empleado_id}>
                        <TableCell className="font-medium text-slate-900">{e.nombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.puesto ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{fmtNum(e.sobrecargas)}</TableCell>
                        <TableCell className="tabular-nums">{fmtNum(e.medias)}</TableCell>
                        <TableCell className="tabular-nums">{e.dias}</TableCell>
                        <TableCell className="tabular-nums font-semibold">{fmtNum(eq)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon,
  tone,
  help,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: "rose" | "amber" | "slate" | "indigo"
  help?: string
}) {
  const toneClass = {
    rose: "bg-rose-100 text-rose-600",
    amber: "bg-amber-100 text-amber-600",
    slate: "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-100 text-indigo-600",
  }[tone]
  const display = fmtNum(value)
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-xl p-2.5 ${toneClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{display}</p>
          {help && <p className="mt-0.5 text-[10px] text-muted-foreground">{help}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function SortableHead({
  label, k, current, dir, onClick,
}: {
  label: string; k: SortKey; current: SortKey; dir: "desc" | "asc"; onClick: (k: SortKey) => void
}) {
  const active = current === k
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-0.5 font-medium ${active ? "text-slate-900" : "text-muted-foreground hover:text-slate-700"}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${active && dir === "asc" ? "rotate-180" : ""}`} />
      </button>
    </TableHead>
  )
}
