"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3,
  Activity,
  Clock,
  Shield,
  Users,
  Settings,
  Truck,
  CarFront,
  Warehouse,
  CalendarClock,
  PackageX,
  ClipboardCheck,
} from "lucide-react"
import type { PilarConIndicadoresCount } from "@/actions/indicadores"

const PILAR_ICONS: Record<string, React.ReactNode> = {
  Seguridad: <Shield className="h-6 w-6" />,
  Gente: <Users className="h-6 w-6" />,
  "Gestión": <Settings className="h-6 w-6" />,
  Entrega: <Truck className="h-6 w-6" />,
  Flota: <CarFront className="h-6 w-6" />,
  "Almacén": <Warehouse className="h-6 w-6" />,
  Planeamiento: <CalendarClock className="h-6 w-6" />,
}

interface Props {
  pilares: PilarConIndicadoresCount[]
}

export function IndicadoresLandingClient({ pilares }: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Indicadores</h1>
        <p className="text-sm text-muted-foreground">
          Seleccioná un pilar para ver sus indicadores, o accedé a los KPIs operativos.
        </p>
      </div>

      {/* KPIs operativos */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          KPIs Operativos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/indicadores/pre-ruta-en-vivo">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-indigo-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 transition-colors">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Pre-Ruta en Vivo
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tablero operativo 07:00 — Pilar Entrega 1.1
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/tml">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-amber-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-amber-100 text-amber-600 group-hover:bg-amber-200 transition-colors">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Tiempo Medio de Liberación
                  </p>
                  <p className="text-sm text-muted-foreground">
                    TML — Pilar Entrega 1.1
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/asistencia-matinal">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-blue-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    % Asistencia Matinal
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Reunión Pre Ruta — Pilar Entrega 1.1
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/puntualidad">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-green-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-green-100 text-green-600 group-hover:bg-green-200 transition-colors">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    % Puntualidad Pre-Ruta
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Entrada &le; 07:00 — Pilar Entrega 1.1
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/owd-pre-ruta">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-teal-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-teal-100 text-teal-600 group-hover:bg-teal-200 transition-colors">
                  <ClipboardCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    OWD Pre-Ruta
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Checklist SOP 1.1 — Pilar Entrega 1.1
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/tiempo-ruta">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-purple-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-purple-100 text-purple-600 group-hover:bg-purple-200 transition-colors">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Tiempo en Ruta
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Puerta a puerta — Pilar Entrega 1.2
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/rechazos">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-red-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-red-100 text-red-600 group-hover:bg-red-200 transition-colors">
                  <PackageX className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    % Rechazos
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Bultos rechazados vs entregados — Meta 1.5%
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Pilares */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Indicadores por Pilar
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pilares.map((pilar) => {
            const icon = PILAR_ICONS[pilar.nombre] ?? (
              <BarChart3 className="h-6 w-6" />
            )

            return (
              <Link key={pilar.id} href={`/indicadores/${pilar.id}`}>
                <Card className="group cursor-pointer transition-all hover:shadow-md h-full"
                  style={{
                    borderColor: "transparent",
                  }}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div
                        className="rounded-xl p-3 transition-colors"
                        style={{
                          backgroundColor: `${pilar.color}18`,
                          color: pilar.color,
                        }}
                      >
                        {icon}
                      </div>
                      {pilar.indicadores_count > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-xs"
                          style={{
                            backgroundColor: `${pilar.color}18`,
                            color: pilar.color,
                          }}
                        >
                          {pilar.indicadores_count} KPI{pilar.indicadores_count !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-4">
                      <p className="font-semibold text-slate-900 group-hover:underline">
                        {pilar.nombre}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {pilar.preguntas_count} preguntas
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
