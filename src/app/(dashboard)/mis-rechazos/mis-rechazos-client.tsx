"use client"

import { PackageX, TrendingDown, TrendingUp, Truck, Users, CalendarDays } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MisRechazosData, MisRechazosResumen } from "@/actions/mis-rechazos"

function fmtFecha(f: string): string {
  const [, m, d] = f.split("-")
  return `${d}/${m}`
}

function fmtMes(m: string): string {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ]
  const idx = Number(m.slice(5, 7)) - 1
  return `${MESES[idx] ?? m} ${m.slice(0, 4)}`
}

function pctBadge(pct: number | null) {
  if (pct == null) return <span className="text-slate-400">—</span>
  const color =
    pct <= 0.3
      ? "bg-emerald-100 text-emerald-800"
      : pct <= 1
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800"
  return <Badge className={color}>{pct.toLocaleString("es-AR")}%</Badge>
}

function KpiCard({
  titulo,
  valor,
  sub,
  icon,
}: {
  titulo: string
  valor: React.ReactNode
  sub?: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-xl bg-red-50 p-2.5 text-red-600">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <p className="text-xl font-semibold text-slate-900">{valor}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function ComparativaMes({ actual, anterior }: { actual: MisRechazosResumen; anterior: MisRechazosResumen }) {
  const delta =
    actual.pct_rechazo != null && anterior.pct_rechazo != null
      ? Math.round((actual.pct_rechazo - anterior.pct_rechazo) * 100) / 100
      : null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Comparado con {fmtMes(anterior.mes)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Bultos rechazados</span>
          <span className="font-medium">
            {anterior.bultos_rechazados.toLocaleString("es-AR")} → {actual.bultos_rechazados.toLocaleString("es-AR")}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">% de rechazo</span>
          <span className="flex items-center gap-2 font-medium">
            {anterior.pct_rechazo != null ? `${anterior.pct_rechazo.toLocaleString("es-AR")}%` : "—"} →{" "}
            {actual.pct_rechazo != null ? `${actual.pct_rechazo.toLocaleString("es-AR")}%` : "—"}
            {delta != null &&
              (delta <= 0 ? (
                <TrendingDown className="size-4 text-emerald-600" />
              ) : (
                <TrendingUp className="size-4 text-red-600" />
              ))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Clientes con rechazo</span>
          <span className="font-medium">
            {anterior.clientes_afectados} → {actual.clientes_afectados}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function MisRechazosClient({ data }: { data: MisRechazosData }) {
  if (!data.vinculado) {
    return (
      <div className="space-y-4">
        <Header />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Tu usuario todavía no está vinculado a un camión. Pedile a tu supervisor
            que te asocie como chofer o ayudante en el mapeo de empleados.
          </CardContent>
        </Card>
      </div>
    )
  }

  const m = data.mes_actual

  return (
    <div className="space-y-4">
      <Header nombre={data.nombre_chofer} />

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          titulo={`Bultos rechazados · ${fmtMes(m.mes)}`}
          valor={m.bultos_rechazados.toLocaleString("es-AR")}
          sub={`sobre ${m.bultos_entregados.toLocaleString("es-AR")} entregados`}
          icon={<PackageX className="size-5" />}
        />
        <KpiCard
          titulo="% de rechazo"
          valor={pctBadge(m.pct_rechazo)}
          icon={<TrendingDown className="size-5" />}
        />
        <KpiCard
          titulo="Clientes con rechazo"
          valor={m.clientes_afectados}
          icon={<Users className="size-5" />}
        />
        <KpiCard
          titulo="Días con rechazo"
          valor={m.dias_con_rechazo}
          icon={<CalendarDays className="size-5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ComparativaMes actual={data.mes_actual} anterior={data.mes_anterior} />

        {/* Por camión: la referencia si cambia de unidad */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Truck className="size-4 text-slate-500" />
              Por camión (últimos 2 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.por_patente.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-2 font-medium">Camión</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Rechazados</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Entregados</th>
                      <th className="py-1.5 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.por_patente.map((p) => (
                      <tr key={p.patente} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-900">{p.patente}</td>
                        <td className="py-1.5 pr-2 text-right">{p.bultos_rechazados.toLocaleString("es-AR")}</td>
                        <td className="py-1.5 pr-2 text-right text-muted-foreground">
                          {p.bultos_entregados.toLocaleString("es-AR")}
                        </td>
                        <td className="py-1.5 text-right">{pctBadge(p.pct_rechazo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Por cliente */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Clientes con rechazo · {fmtMes(m.mes)}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.por_cliente.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin rechazos este mes. 💪</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Cliente</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Bultos</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Veces</th>
                    <th className="py-1.5 pr-2 font-medium">Último</th>
                    <th className="py-1.5 font-medium">Motivo principal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_cliente.map((c) => (
                    <tr key={c.nombre_cliente} className="border-b last:border-0">
                      <td className="max-w-[220px] truncate py-1.5 pr-2 font-medium text-slate-900">
                        {c.nombre_cliente}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{c.bultos.toLocaleString("es-AR")}</td>
                      <td className="py-1.5 pr-2 text-right">{c.veces}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{fmtFecha(c.ultima_fecha)}</td>
                      <td className="max-w-[180px] truncate py-1.5 text-muted-foreground">
                        {c.motivo_principal ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Por motivo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por motivo · {fmtMes(m.mes)}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.por_motivo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin rechazos este mes.</p>
            ) : (
              <div className="space-y-1.5">
                {data.por_motivo.map((mo) => (
                  <div key={mo.motivo} className="flex items-center justify-between text-sm">
                    <span className="max-w-[70%] truncate text-slate-700">{mo.motivo}</span>
                    <span className="font-medium">{mo.bultos.toLocaleString("es-AR")} bultos</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimos 30 días */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Días con rechazo (últimos 30)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.por_dia.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin rechazos en los últimos 30 días. 💪</p>
            ) : (
              <div className="space-y-1.5">
                {data.por_dia.map((d) => (
                  <div key={d.fecha} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {fmtFecha(d.fecha)}
                      <span className="ml-2 text-xs text-muted-foreground">{d.patentes.join(", ")}</span>
                    </span>
                    <span className="font-medium">
                      {d.bultos.toLocaleString("es-AR")} bultos · {d.clientes} {d.clientes === 1 ? "cliente" : "clientes"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Header({ nombre }: { nombre?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-red-100 p-2.5">
        <PackageX className="size-6 text-red-600" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mis Rechazos</h1>
        <p className="text-sm text-muted-foreground">
          {nombre ? `${nombre} · ` : ""}Tus rechazos del reparto — te siguen a vos, no importa qué camión te toque.
        </p>
      </div>
    </div>
  )
}
