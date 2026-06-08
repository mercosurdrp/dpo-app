"use client"

import Link from "next/link"
import { Megaphone, Wrench } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ComunicacionesDashboard } from "@/actions/portal-comunicaciones"
import type { ServiciosDashboard } from "@/actions/portal-servicios"
import {
  COMUNICACION_CATEGORIA_LABELS,
  COMUNICACION_ESTADO_LABELS,
  COMUNICACION_ESTADO_COLORS,
  SG_CATEGORIA_LABELS,
  SG_ESTADO_LABELS,
  SG_ESTADO_COLORS,
} from "@/types/database"

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="border-l-4 pl-3" style={{ borderColor: color }}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function PortalDashboardClient({
  comunicaciones,
  servicios,
}: {
  comunicaciones: ComunicacionesDashboard
  servicios: ServiciosDashboard
}) {
  const tProm = servicios.tiempo_promedio_horas
  const tiempoLabel =
    tProm == null ? "—" : tProm >= 24 ? `${(tProm / 24).toFixed(1)} d` : `${tProm} h`
  const cProm = comunicaciones.tiempo_promedio_horas
  const comTiempoLabel =
    cProm == null ? "—" : cProm >= 24 ? `${(cProm / 24).toFixed(1)} d` : `${cProm} h`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portal del Empleado</h1>
        <p className="text-sm text-slate-500">Panel de control de comunicaciones y servicios generales</p>
      </div>

      {/* Comunicaciones */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Megaphone className="size-5 text-slate-500" /> Comunicaciones
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Abiertas" value={comunicaciones.abiertas} color={COMUNICACION_ESTADO_COLORS.abierta} />
          <StatCard label="En revisión" value={comunicaciones.en_revision} color={COMUNICACION_ESTADO_COLORS.en_revision} />
          <StatCard label="Gestionadas" value={comunicaciones.gestionadas} color={COMUNICACION_ESTADO_COLORS.gestionada} />
          <StatCard label="Cerradas" value={comunicaciones.cerradas} color={COMUNICACION_ESTADO_COLORS.cerrada} />
          <StatCard label="T. prom. gestión" value={comTiempoLabel} color="#0EA5E9" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              {comunicaciones.por_categoria.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {comunicaciones.por_categoria.map((c) => (
                    <li key={c.categoria} className="flex items-center justify-between">
                      <span className="text-slate-600">{COMUNICACION_CATEGORIA_LABELS[c.categoria]}</span>
                      <span className="font-medium text-slate-900">{c.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Últimas comunicaciones</CardTitle>
            </CardHeader>
            <CardContent>
              {comunicaciones.ultimas.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos.</p>
              ) : (
                <ul className="divide-y">
                  {comunicaciones.ultimas.map((c) => (
                    <li key={c.id} className="py-2">
                      <Link href={`/portal/comunicaciones/${c.id}`} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                          <span className="font-mono text-xs text-slate-400">#{c.numero}</span> {c.titulo}
                        </span>
                        <Badge
                          variant="secondary"
                          style={{
                            backgroundColor: COMUNICACION_ESTADO_COLORS[c.estado] + "20",
                            color: COMUNICACION_ESTADO_COLORS[c.estado],
                          }}
                        >
                          {COMUNICACION_ESTADO_LABELS[c.estado]}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Servicios Generales */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Wrench className="size-5 text-slate-500" /> Servicios Generales
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatCard label="Abiertos" value={servicios.abiertos} color={SG_ESTADO_COLORS.abierto} />
          <StatCard label="En proceso" value={servicios.en_proceso} color={SG_ESTADO_COLORS.en_proceso} />
          <StatCard label="Resueltos" value={servicios.resueltos} color={SG_ESTADO_COLORS.resuelto} />
          <StatCard label="Cerrados" value={servicios.cerrados} color={SG_ESTADO_COLORS.cerrado} />
          <StatCard label="Vencidos" value={servicios.vencidos} color="#EF4444" />
          <StatCard label="T. prom. resolución" value={tiempoLabel} color="#0EA5E9" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              {servicios.por_categoria.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {servicios.por_categoria.map((c) => (
                    <li key={c.categoria} className="flex items-center justify-between">
                      <span className="text-slate-600">{SG_CATEGORIA_LABELS[c.categoria]}</span>
                      <span className="font-medium text-slate-900">{c.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por sector</CardTitle>
            </CardHeader>
            <CardContent>
              {servicios.por_sector.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {servicios.por_sector.map((s) => (
                    <li key={s.sector} className="flex items-center justify-between">
                      <span className="truncate text-slate-600">{s.sector}</span>
                      <span className="shrink-0 font-medium text-slate-900">{s.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendencia mensual</CardTitle>
            </CardHeader>
            <CardContent>
              {servicios.tendencia_mensual.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {servicios.tendencia_mensual.map((m) => (
                    <li key={m.mes} className="flex items-center justify-between">
                      <span className="text-slate-600">{m.mes}</span>
                      <span className="font-medium text-slate-900">{m.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas solicitudes</CardTitle>
          </CardHeader>
          <CardContent>
            {servicios.ultimas.length === 0 ? (
              <p className="text-sm text-slate-400">Sin solicitudes.</p>
            ) : (
              <ul className="divide-y">
                {servicios.ultimas.map((t) => (
                  <li key={t.id} className="py-2">
                    <Link href={`/portal/servicios/${t.id}`} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        <span className="font-mono text-xs text-slate-400">#{t.numero}</span> {t.titulo}
                      </span>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: SG_ESTADO_COLORS[t.estado] + "20",
                          color: SG_ESTADO_COLORS[t.estado],
                        }}
                      >
                        {SG_ESTADO_LABELS[t.estado]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
