"use client"

// Historial + KPIs de efectividad de las alertas WhatsApp de rechazo.

import { Fragment, useMemo, useState, useTransition } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { getAlertas } from "@/actions/foxtrot-alertas"
import type {
  AlertaRechazo,
  AlertasConfig,
  EstadoEnvio,
  OutcomeAlerta,
} from "@/lib/foxtrot-alertas/types"

const OUTCOME_LABEL: Record<OutcomeAlerta, string> = {
  pendiente: "En seguimiento",
  recuperado_mismo_dia: "Recuperado mismo día",
  proxima_entrega_ok: "Próxima entrega OK",
  reincidio: "Reincidió",
  sin_nueva_entrega: "Sin nueva entrega",
}

const OUTCOME_BADGE: Record<OutcomeAlerta, string> = {
  pendiente: "bg-slate-100 text-slate-700",
  recuperado_mismo_dia: "bg-emerald-100 text-emerald-800",
  proxima_entrega_ok: "bg-sky-100 text-sky-800",
  reincidio: "bg-red-100 text-red-800",
  sin_nueva_entrega: "bg-amber-100 text-amber-800",
}

const ENVIO_LABEL: Record<EstadoEnvio, string> = {
  pendiente: "Pendiente",
  enviada: "Enviada ✓",
  parcial: "Parcial",
  sin_telefono: "Sin teléfono",
  error: "Error",
  dry_run: "Simulada",
  desactivada: "No enviada",
}

const ENVIO_BADGE: Record<EstadoEnvio, string> = {
  pendiente: "bg-slate-100 text-slate-700",
  enviada: "bg-emerald-100 text-emerald-800",
  parcial: "bg-amber-100 text-amber-800",
  sin_telefono: "bg-orange-100 text-orange-800",
  error: "bg-red-100 text-red-800",
  dry_run: "bg-violet-100 text-violet-800",
  desactivada: "bg-slate-100 text-slate-500",
}

function horaArt(ts: string | null): string {
  if (!ts) return "s/d"
  const d = new Date(new Date(ts).getTime() - 3 * 3600_000)
  return d.toISOString().slice(11, 16)
}

function fmtFecha(f: string): string {
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

function semanaIso(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1) // lunes de esa semana
  return d.toISOString().slice(0, 10)
}

export function AlertasRechazoClient({
  alertasIniciales,
  config,
  desdeInicial,
}: {
  alertasIniciales: AlertaRechazo[]
  config: AlertasConfig | null
  desdeInicial: string
}) {
  const [alertas, setAlertas] = useState(alertasIniciales)
  const [desde, setDesde] = useState(desdeInicial)
  const [hasta, setHasta] = useState("")
  const [fPromotor, setFPromotor] = useState("todos")
  const [fOutcome, setFOutcome] = useState("todos")
  const [expandida, setExpandida] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const promotores = useMemo(() => {
    const s = new Map<string, string>()
    for (const a of alertas) {
      if (a.id_promotor) s.set(a.id_promotor, a.promotor_nombre ?? a.id_promotor)
    }
    return Array.from(s.entries()).sort((x, y) => x[1].localeCompare(y[1]))
  }, [alertas])

  const filtradas = useMemo(
    () =>
      alertas.filter(
        (a) =>
          (fPromotor === "todos" || a.id_promotor === fPromotor) &&
          (fOutcome === "todos" || a.outcome === fOutcome),
      ),
    [alertas, fPromotor, fOutcome],
  )

  const kpis = useMemo(() => {
    const total = filtradas.length
    const enviadas = filtradas.filter(
      (a) => a.estado_envio === "enviada" || a.estado_envio === "parcial",
    ).length
    const sinTel = filtradas.filter((a) => a.estado_envio === "sin_telefono").length
    const cerradas = filtradas.filter((a) => a.outcome !== "pendiente")
    const recup = filtradas.filter((a) => a.outcome === "recuperado_mismo_dia").length
    const proxOk = filtradas.filter((a) => a.outcome === "proxima_entrega_ok").length
    const reinc = filtradas.filter((a) => a.outcome === "reincidio").length
    const pct = (n: number, den: number) => (den > 0 ? Math.round((n / den) * 100) : 0)
    return {
      total,
      enviadas,
      pctEnviadas: pct(enviadas, total),
      sinTel,
      recup,
      pctRecup: pct(recup, total),
      proxOk,
      pctProxOk: pct(proxOk, cerradas.length),
      reinc,
      pctReinc: pct(reinc, cerradas.length),
    }
  }, [filtradas])

  const porSemana = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const a of filtradas) {
      const w = semanaIso(a.fecha)
      const row = map.get(w) ?? {}
      row[a.outcome] = (row[a.outcome] ?? 0) + 1
      map.set(w, row)
    }
    return Array.from(map.entries())
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([w, r]) => ({
        semana: fmtFecha(w),
        Recuperado: r.recuperado_mismo_dia ?? 0,
        "Próx. OK": r.proxima_entrega_ok ?? 0,
        Reincidió: r.reincidio ?? 0,
        "Sin entrega": r.sin_nueva_entrega ?? 0,
        Seguimiento: r.pendiente ?? 0,
      }))
  }, [filtradas])

  const recargar = () => {
    startTransition(async () => {
      const r = await getAlertas({ desde, hasta: hasta || undefined })
      if ("error" in r) toast.error(r.error)
      else setAlertas(r.data)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900 mr-auto">
          🔔 Alertas de rechazo en reparto
        </h1>
        {config && (
          <Badge
            className={
              config.envios_activos && !config.dry_run
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }
          >
            {config.dry_run
              ? "Modo simulación"
              : config.envios_activos
                ? "Envíos activos"
                : "Envíos apagados"}
          </Badge>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: "Alertas", value: kpis.total, sub: "del período" },
          { label: "Enviadas", value: `${kpis.pctEnviadas}%`, sub: `${kpis.enviadas} de ${kpis.total}` },
          { label: "Recuperado mismo día", value: `${kpis.pctRecup}%`, sub: `${kpis.recup} alertas`, destacado: true },
          { label: "Próxima entrega OK", value: `${kpis.pctProxOk}%`, sub: `${kpis.proxOk} alertas` },
          { label: "Reincidencia", value: `${kpis.pctReinc}%`, sub: `${kpis.reinc} alertas` },
          { label: "Sin teléfono", value: kpis.sinTel, sub: "cargar en equipo" },
        ].map((k) => (
          <Card key={k.label} className={k.destacado ? "border-emerald-300" : ""}>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <div className="text-2xl font-bold text-slate-900">{k.value}</div>
              <div className="text-[11px] text-muted-foreground">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Evolución semanal */}
      {porSemana.length > 1 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Evolución semanal por resultado</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porSemana}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Recuperado" stackId="a" fill="#10b981" />
                <Bar dataKey="Próx. OK" stackId="a" fill="#0ea5e9" />
                <Bar dataKey="Reincidió" stackId="a" fill="#ef4444" />
                <Bar dataKey="Sin entrega" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Seguimiento" stackId="a" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">Desde</label>
          <Input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-8 w-36 text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">Hasta</label>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-8 w-36 text-xs"
          />
        </div>
        <Select value={fPromotor} onValueChange={(v) => setFPromotor(v ?? "todos")}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Promotor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los promotores</SelectItem>
            {promotores.map(([id, nombre]) => (
              <SelectItem key={id} value={id}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fOutcome} onValueChange={(v) => setFOutcome(v ?? "todos")}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Resultado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los resultados</SelectItem>
            {(Object.keys(OUTCOME_LABEL) as OutcomeAlerta[]).map((o) => (
              <SelectItem key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={recargar} disabled={isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isPending ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Fecha</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Localidad</TableHead>
                <TableHead>Promotor</TableHead>
                <TableHead>Chofer / Ruta</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Bultos</TableHead>
                <TableHead>Envío</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                    Sin alertas en el período. Cuando un chofer cargue un rechazo en
                    Foxtrot, va a aparecer acá en ~5 minutos.
                  </TableCell>
                </TableRow>
              )}
              {filtradas.map((a) => (
                <Fragment key={a.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpandida(expandida === a.id ? null : a.id)}
                  >
                    <TableCell className="pr-0">
                      {expandida === a.id ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtFecha(a.fecha)}</TableCell>
                    <TableCell className="text-xs">{horaArt(a.rechazo_ts)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium text-slate-900">
                        {a.cliente_nombre ?? "(sin nombre)"}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {a.id_cliente ?? a.cliente_id_foxtrot ?? "s/d"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{a.cliente_localidad ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <div>{a.promotor_nombre ?? "—"}</div>
                      {a.supervisor_nombre && (
                        <div className="text-[11px] text-muted-foreground">
                          Sup: {a.supervisor_nombre}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.chofer_nombre ?? "—"}
                      <span className="text-muted-foreground"> · R{a.ruta}</span>
                    </TableCell>
                    <TableCell className="text-xs max-w-44">
                      <span className="line-clamp-2">{a.motivos.join(" / ") || "Sin motivo"}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {Number(a.bultos)}
                      {a.parcial ? " (p)" : ""}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${ENVIO_BADGE[a.estado_envio]} text-[10px]`}>
                        {ENVIO_LABEL[a.estado_envio]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${OUTCOME_BADGE[a.outcome]} text-[10px]`}>
                        {OUTCOME_LABEL[a.outcome]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {expandida === a.id && (
                    <TableRow className="bg-slate-50">
                      <TableCell colSpan={11} className="text-xs space-y-2 py-3">
                        <div className="grid md:grid-cols-2 gap-3">
                          <div>
                            <div className="font-semibold text-slate-700 mb-1">
                              Productos rechazados
                            </div>
                            <ul className="space-y-0.5">
                              {a.items.map((i, idx) => (
                                <li key={idx}>
                                  • {i.producto}
                                  {i.cantidad > 0 ? ` x${i.cantidad}` : " (parcial)"}
                                  {i.notas ? (
                                    <span className="text-muted-foreground"> — {i.notas}</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-1">
                            {a.outcome_detalle && (
                              <div>
                                <span className="font-semibold text-slate-700">Resultado: </span>
                                {a.outcome_detalle}
                              </div>
                            )}
                            {a.envio_detalle.length > 0 && (
                              <div>
                                <div className="font-semibold text-slate-700 mb-0.5">Envíos</div>
                                {a.envio_detalle.map((e, idx) => (
                                  <div key={idx} className="text-muted-foreground">
                                    {e.destinatario}: {e.phone ?? "sin teléfono"} —{" "}
                                    {e.ok ? "OK" : (e.error ?? "falló")} ·{" "}
                                    {horaArt(e.ts)} hs
                                  </div>
                                ))}
                              </div>
                            )}
                            {a.cliente_telefono && (
                              <div>
                                <span className="font-semibold text-slate-700">Tel cliente: </span>
                                {a.cliente_telefono}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
