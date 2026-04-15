"use client"

import { useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Users,
  Truck,
  MapPin,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Bell,
  RefreshCw,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { syncFoxtrotNow } from "@/actions/foxtrot"
import type { FoxtrotDashboardData, FoxtrotDriverRow } from "@/types/database"

const FoxtrotMap = dynamic(() => import("./foxtrot-map"), { ssr: false })

interface Props {
  data: FoxtrotDashboardData | null
  error: string | null
  fecha: string
}

function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "—"
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function healthColor(fracasos: number): string {
  if (fracasos === 0) return "bg-green-500"
  if (fracasos <= 5) return "bg-amber-500"
  return "bg-red-500"
}

interface KpiDef {
  label: string
  value: number
  Icon: typeof Users
  tone: "slate" | "green" | "amber" | "red"
}

const TONE_CLASSES: Record<KpiDef["tone"], { text: string; ring: string; bg: string }> = {
  slate: { text: "text-slate-900", ring: "ring-slate-200", bg: "bg-slate-100" },
  green: { text: "text-green-600", ring: "ring-green-200", bg: "bg-green-100" },
  amber: { text: "text-amber-600", ring: "ring-amber-200", bg: "bg-amber-100" },
  red: { text: "text-red-600", ring: "ring-red-200", bg: "bg-red-100" },
}

function KpiCard({ kpi }: { kpi: KpiDef }) {
  const tone = TONE_CLASSES[kpi.tone]
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex flex-col items-center justify-center gap-1 p-4">
        <div
          className={`absolute -right-4 -top-4 h-20 w-20 rounded-full ${tone.bg} opacity-60`}
          aria-hidden
        />
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <kpi.Icon className="h-3 w-3" />
            {kpi.label}
          </div>
          <div className={`mt-1 text-4xl font-bold ${tone.text}`}>{kpi.value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-[300px] items-center justify-center p-8 text-center">
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}

export function FoxtrotDashboardClient({ data, error, fecha }: Props) {
  const router = useRouter()
  const [isSyncing, startSync] = useTransition()
  const [activeTab, setActiveTab] = useState<"overview" | "rendimiento" | "analizar">(
    "overview"
  )

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (v) router.push(`?fecha=${v}`)
  }

  function handleSync() {
    startSync(async () => {
      const res = await syncFoxtrotNow(fecha)
      if ("error" in res && res.error) {
        toast.error(`Error al sincronizar: ${res.error}`)
      } else {
        toast.success("Sincronización completada")
        router.refresh()
      }
    })
  }

  function handleRowClick(driver: FoxtrotDriverRow) {
    const first = driver.route_ids[0]
    if (!first) {
      toast.info("Este chofer no tiene rutas")
      return
    }
    console.log("drilldown", first)
    toast.info(`Drilldown pendiente: ${driver.driver_name}`)
  }

  const kpiDefs: KpiDef[] = data
    ? [
        { label: "Choferes", value: data.kpis.choferes, Icon: Users, tone: "slate" },
        { label: "Rutas", value: data.kpis.rutas, Icon: Truck, tone: "slate" },
        { label: "Visitas", value: data.kpis.visitas, Icon: MapPin, tone: "slate" },
        {
          label: "Exitosas",
          value: data.kpis.exitosas,
          Icon: CheckCircle2,
          tone: "green",
        },
        {
          label: "Re-intentos",
          value: data.kpis.reintentos,
          Icon: RotateCcw,
          tone: "amber",
        },
        { label: "Notificar Reintento", value: 0, Icon: Bell, tone: "amber" },
        { label: "Rechazadas", value: data.kpis.rechazadas, Icon: XCircle, tone: "red" },
      ]
    : []

  return (
    <div className="space-y-4">
      {/* Header azul oscuro */}
      <div className="flex flex-col gap-3 rounded-lg bg-slate-900 p-4 text-white md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">
              Foxtrot Tracking
            </p>
            <h1 className="text-lg font-semibold">Visión General</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-md bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              activeTab === "overview"
                ? "bg-white text-slate-900"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Visión General
          </button>
          <button
            type="button"
            disabled
            className="rounded px-3 py-1 text-xs font-medium text-slate-500"
          >
            Rendimiento
          </button>
          <button
            type="button"
            disabled
            className="rounded px-3 py-1 text-xs font-medium text-slate-500"
          >
            Analizar
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fecha}
            onChange={handleDateChange}
            className="h-9 w-auto bg-white text-slate-900"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-white text-slate-900 hover:bg-slate-100"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar ahora"}
          </Button>
        </div>
      </div>

      {!data ? (
        <EmptyState
          message={
            error
              ? `No hay datos sincronizados. Configurá FOXTROT_API_KEY y sincronizá. (${error})`
              : "No hay datos sincronizados. Configurá FOXTROT_API_KEY y sincronizá."
          }
        />
      ) : (
        <>
          {/* KPI band */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-7">
            {kpiDefs.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}
          </div>

          {/* 2 cols */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-7">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Choferes Activos</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.drivers.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Sin rutas sincronizadas para {fecha}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Chofer</TableHead>
                          <TableHead className="text-right">Rutas</TableHead>
                          <TableHead className="text-right">Productivo</TableHead>
                          <TableHead className="text-right">Plan</TableHead>
                          <TableHead>Hechas</TableHead>
                          <TableHead className="text-right">Fracasos</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.drivers.map((d) => {
                          const pct =
                            d.visitas_planeadas > 0
                              ? Math.min(
                                  100,
                                  Math.round((d.visitas_hechas / d.visitas_planeadas) * 100)
                                )
                              : 0
                          return (
                            <TableRow
                              key={d.driver_id}
                              onClick={() => handleRowClick(d)}
                              className="cursor-pointer"
                            >
                              <TableCell>
                                <div
                                  className={`h-7 w-7 rounded-full ${healthColor(
                                    d.visitas_fracasos
                                  )} flex items-center justify-center text-[10px] font-bold text-white`}
                                >
                                  {d.driver_name.slice(0, 2).toUpperCase()}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{d.driver_name}</TableCell>
                              <TableCell className="text-right">{d.rutas}</TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {formatDuration(d.tiempo_productivo_minutos)}
                              </TableCell>
                              <TableCell className="text-right">
                                {d.visitas_planeadas}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs tabular-nums">
                                    {d.visitas_hechas}
                                  </span>
                                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                      className={`h-full ${
                                        pct >= 95
                                          ? "bg-green-500"
                                          : pct >= 70
                                            ? "bg-amber-500"
                                            : "bg-red-500"
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell
                                className={`text-right ${
                                  d.visitas_fracasos > 0
                                    ? "font-semibold text-red-600"
                                    : ""
                                }`}
                              >
                                {d.visitas_fracasos}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {formatDuration(d.tiempo_total_minutos)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mapa</CardTitle>
              </CardHeader>
              <CardContent>
                <FoxtrotMap driverLocations={data.driverLocations} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
