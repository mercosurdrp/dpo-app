"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import {
  Radio,
  Clock,
  Target,
  Truck,
  Route,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { syncFoxtrotNow } from "@/actions/foxtrot"
import type {
  FoxtrotKpis,
  FoxtrotRoute,
  FoxtrotSyncLog,
} from "@/types/database"

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

interface Props {
  kpis: FoxtrotKpis | null
  kpisError: string | null
  rutas: FoxtrotRoute[]
  logs: FoxtrotSyncLog[]
}

function colorPct(pct: number, high = 90, mid = 70) {
  if (pct >= high) return { text: "text-green-600", bg: "bg-green-100" }
  if (pct >= mid) return { text: "text-amber-600", bg: "bg-amber-100" }
  return { text: "text-red-600", bg: "bg-red-100" }
}

function colorTiempo(min: number) {
  if (min <= 480) return { text: "text-green-600", bg: "bg-green-100" }
  if (min <= 540) return { text: "text-amber-600", bg: "bg-amber-100" }
  return { text: "text-red-600", bg: "bg-red-100" }
}

function minutosAHoras(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h ${m.toString().padStart(2, "0")}m`
}

function PctTrackingBadge({ pct }: { pct: number }) {
  const c = colorPct(pct)
  return (
    <Badge className={`${c.bg} ${c.text} hover:${c.bg}`}>
      {pct.toFixed(0)}%
    </Badge>
  )
}

function EstadoRutaBadge({ ruta }: { ruta: FoxtrotRoute }) {
  if (ruta.is_finalized) {
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">finalizada</Badge>
  }
  if (ruta.is_active) {
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">activa</Badge>
  }
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">inactiva</Badge>
}

export function FoxtrotTrackingClient({ kpis, kpisError, rutas, logs }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [logsOpen, setLogsOpen] = useState(false)

  const handleSync = () => {
    startTransition(async () => {
      const res = await syncFoxtrotNow()
      if ("error" in res) {
        toast.error(`Error al sincronizar: ${res.error}`)
      } else {
        const d = res.data
        toast.success(
          `Sincronización ${d.ok ? "OK" : "con errores"} — ${d.rutas_sincronizadas} rutas, ${d.posiciones_sincronizadas} posiciones`
        )
        router.refresh()
      }
    })
  }

  const mensualData = (kpis?.mensual ?? []).map((m) => ({
    name: `${MESES[m.mes]} ${String(m.year).slice(2)}`,
    pct_tracking: Number(m.pct_tracking),
    promedio_tiempo_ruta: Number(m.promedio_tiempo_ruta),
    total_rutas: m.total_rutas,
  }))

  const isApiKeyError =
    kpisError && kpisError.toUpperCase().includes("FOXTROT_API_KEY")

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Foxtrot Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Integración con API Foxtrot — Pilar Entrega 1.2 R1.2.4
          </p>
        </div>
        <Button onClick={handleSync} disabled={pending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Sincronizando..." : "Sincronizar ahora"}
        </Button>
      </div>

      {kpis === null && kpisError && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <div className="rounded-full bg-amber-100 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-amber-900">
                No se pudieron cargar los KPIs de Foxtrot
              </p>
              <p className="mt-1 break-words text-sm text-amber-800">{kpisError}</p>
              {isApiKeyError && (
                <p className="mt-2 text-sm text-amber-900">
                  Configurá la variable <code className="rounded bg-amber-100 px-1">FOXTROT_API_KEY</code>{" "}
                  en Vercel y volvé a sincronizar. Mientras tanto esta sección no tiene datos.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {kpis && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* 1. % Tracking Activo mes */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">% Tracking Activo mes</p>
                    <p className={`text-3xl font-bold ${colorPct(kpis.pctTrackingActivoMes).text}`}>
                      {kpis.pctTrackingActivoMes.toFixed(0)}%
                    </p>
                  </div>
                  <div className={`rounded-full p-3 ${colorPct(kpis.pctTrackingActivoMes).bg}`}>
                    <Radio className={`h-5 w-5 ${colorPct(kpis.pctTrackingActivoMes).text}`} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Meta: ≥ 90% (R1.2.4)</p>
              </CardContent>
            </Card>

            {/* 2. Tiempo en ruta promedio */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Tiempo en Ruta promedio</p>
                    <p className={`text-3xl font-bold ${colorTiempo(kpis.tiempoRutaPromedioMinutos).text}`}>
                      {Math.round(kpis.tiempoRutaPromedioMinutos)} min
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {minutosAHoras(kpis.tiempoRutaPromedioMinutos)}
                    </p>
                  </div>
                  <div className={`rounded-full p-3 ${colorTiempo(kpis.tiempoRutaPromedioMinutos).bg}`}>
                    <Clock className={`h-5 w-5 ${colorTiempo(kpis.tiempoRutaPromedioMinutos).text}`} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Meta: ≤ 8h (480 min)</p>
              </CardContent>
            </Card>

            {/* 3. % Dentro meta 8h */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">% Dentro meta 8h</p>
                    <p className={`text-3xl font-bold ${colorPct(kpis.tiempoRutaPctDentroMeta).text}`}>
                      {kpis.tiempoRutaPctDentroMeta.toFixed(0)}%
                    </p>
                  </div>
                  <div className={`rounded-full p-3 ${colorPct(kpis.tiempoRutaPctDentroMeta).bg}`}>
                    <Target className={`h-5 w-5 ${colorPct(kpis.tiempoRutaPctDentroMeta).text}`} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {kpis.tiempoRutaDentroMeta}/{kpis.totalRutasMes} rutas
                </p>
              </CardContent>
            </Card>

            {/* 4. Rutas hoy */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Rutas hoy</p>
                    <p className="text-3xl font-bold text-slate-900">{kpis.rutasHoy}</p>
                  </div>
                  <div className="rounded-full bg-blue-100 p-3">
                    <Truck className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {kpis.rutasActivasAhora} activas ahora
                </p>
              </CardContent>
            </Card>

            {/* 5. Total rutas mes */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total rutas mes</p>
                    <p className="text-3xl font-bold text-slate-900">{kpis.totalRutasMes}</p>
                  </div>
                  <div className="rounded-full bg-slate-100 p-3">
                    <Route className="h-5 w-5 text-slate-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Rutas sincronizadas mes actual</p>
              </CardContent>
            </Card>

            {/* 6. Última sincronización */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground">Última sincronización</p>
                    {kpis.ultimaSincronizacion ? (
                      <p className="text-sm font-medium text-slate-900">
                        {new Date(kpis.ultimaSincronizacion).toLocaleString("es-AR")}
                      </p>
                    ) : (
                      <p className="text-lg font-bold text-red-600">Nunca sincronizado</p>
                    )}
                  </div>
                  <div className="rounded-full bg-slate-100 p-3">
                    <RefreshCw className="h-5 w-5 text-slate-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">% Tracking Activo por mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {mensualData.length <= 1 ? (
                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Sin datos suficientes
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mensualData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis fontSize={11} unit="%" domain={[0, 100]} />
                        <Tooltip formatter={(v) => [`${Number(v).toFixed(0)}%`, "Tracking"]} />
                        <ReferenceLine
                          y={90}
                          stroke="#10B981"
                          strokeDasharray="5 5"
                          label={{ value: "Meta 90%", position: "right", fontSize: 10 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="pct_tracking"
                          stroke="#EC4899"
                          strokeWidth={2}
                          dot={{ fill: "#EC4899", r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tiempo en ruta promedio por mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {mensualData.length <= 1 ? (
                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Sin datos suficientes
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mensualData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis fontSize={11} unit=" min" />
                        <Tooltip formatter={(v) => [`${Math.round(Number(v))} min`, "Promedio"]} />
                        <ReferenceLine
                          y={480}
                          stroke="#10B981"
                          strokeDasharray="5 5"
                          label={{ value: "Meta 480 min", position: "right", fontSize: 10 }}
                        />
                        <Bar
                          dataKey="promedio_tiempo_ruta"
                          fill="#06B6D4"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Tabla rutas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas rutas sincronizadas</CardTitle>
        </CardHeader>
        <CardContent>
          {rutas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin rutas sincronizadas. Configurá FOXTROT_API_KEY y sincronizá.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead className="text-right">Tiempo (min)</TableHead>
                    <TableHead className="text-right">Deliveries</TableHead>
                    <TableHead className="text-right">Tracking</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rutas.map((r) => (
                    <TableRow key={r.route_id}>
                      <TableCell className="text-sm">{r.fecha}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {r.driver_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{r.dominio || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.start_time
                          ? new Date(r.start_time).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.end_time
                          ? new Date(r.end_time).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.tiempo_ruta_minutos ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-green-600">{r.deliveries_successful}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-red-600">{r.deliveries_failed}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <PctTrackingBadge pct={Number(r.pct_tracking_activo ?? 0)} />
                      </TableCell>
                      <TableCell>
                        <EstadoRutaBadge ruta={r} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log sincronizaciones */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setLogsOpen((v) => !v)}
        >
          <CardTitle className="flex items-center justify-between text-base">
            <span>Log de sincronizaciones ({logs.length})</span>
            {logsOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </CardTitle>
        </CardHeader>
        {logsOpen && (
          <CardContent>
            {logs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Sin registros de sincronización.
              </p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-1 rounded-md border bg-slate-50 p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {new Date(log.started_at).toLocaleString("es-AR")}
                        </span>
                        {log.ok ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            ✓
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                            ✗
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fecha: {log.fecha} · {log.rutas_sincronizadas} rutas ·{" "}
                        {log.posiciones_sincronizadas} posiciones · {log.errores} errores
                      </p>
                      {log.error_detalle && (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {log.error_detalle}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
