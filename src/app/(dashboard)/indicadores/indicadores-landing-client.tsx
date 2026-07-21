"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3,
  Activity,
  Clock,
  Gauge,
  Shield,
  Users,
  Settings,
  Truck,
  CarFront,
  Warehouse,
  CalendarClock,
  PackageX,
  ClipboardCheck,
  Radio,
  FolderOpen,
  Package,
  Route as RouteIcon,
} from "lucide-react"
import type { PilarConIndicadoresCount } from "@/actions/indicadores"
import { IS_MISIONES } from "@/lib/empresa"

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
          {!IS_MISIONES && (
            <Link href="/indicadores/cuadro-mensual">
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-slate-400">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="rounded-xl p-3 bg-slate-900 text-white group-hover:bg-slate-700 transition-colors">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Cuadro Mensual de Indicadores
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Resumen mensual por pilar — Seguridad · Entrega · Flota · Almacén
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          <Link href="/pack-auditoria/entrega-1-1">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-slate-400 border-2 border-dashed">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition-colors">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Pack Auditoría 1.1
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Evidencia compilada para auditor — Entrega 1.1
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/evidencia">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-orange-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-orange-100 text-orange-600 group-hover:bg-orange-200 transition-colors">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Evidencia DPO
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Gestión documental — SOPs, planes, evidencia
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
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
          <Link href={IS_MISIONES ? "/indicadores/tml-foxtrot" : "/indicadores/tml"}>
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
                    {IS_MISIONES
                      ? "TML — Marca biométrica → inicio ruta Foxtrot"
                      : "TML — Pilar Entrega 1.1"}
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
          <Link href="/indicadores/on-time">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-teal-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-teal-100 text-teal-600 group-hover:bg-teal-200 transition-colors">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">On Time</p>
                  <p className="text-sm text-muted-foreground">
                    Entregas en el día pactado + ventanas horarias — Pilar
                    Entrega 4.4
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
          <Link href="/indicadores/ocupacion-bodega">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-indigo-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 transition-colors">
                  <Package className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Ocupación de Bodega
                  </p>
                  <p className="text-sm text-muted-foreground">
                    CEq por viaje · Target 600 — Pilar Entrega 1.2
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/foxtrot-tracking">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-pink-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-pink-100 text-pink-600 group-hover:bg-pink-200 transition-colors">
                  <Radio className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Foxtrot Tracking
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Integración Foxtrot — Pilar Entrega 1.2
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href={IS_MISIONES ? "/indicadores/tiempo-ruta-foxtrot" : "/indicadores/tiempo-ruta"}>
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
          {!IS_MISIONES && (
            <Link href="/indicadores/tiempo-interno">
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-cyan-300">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="rounded-xl p-3 bg-cyan-100 text-cyan-600 group-hover:bg-cyan-200 transition-colors">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Tiempo Interno
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Retorno al CD → fichaje de salida — Pilar Entrega 1.3
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {!IS_MISIONES && (
            <Link href="/indicadores/tlp">
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-emerald-300">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="rounded-xl p-3 bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                    <Gauge className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      TLP · Productividad de Transporte
                    </p>
                    <p className="text-sm text-muted-foreground">
                      CEq por hora-hombre · por ciudad y camión — Pilar Entrega 1.3
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {IS_MISIONES && (
            <Link href="/indicadores/sobrecargas">
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-rose-300">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="rounded-xl p-3 bg-rose-100 text-rose-600 group-hover:bg-rose-200 transition-colors">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Sobrecargas
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Sobrecargas y medias por mes y por persona — Pilar Entrega
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {IS_MISIONES && (
            <Link href="/indicadores/fueras-de-ruta">
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-orange-300">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="rounded-xl p-3 bg-orange-100 text-orange-600 group-hover:bg-orange-200 transition-colors">
                    <RouteIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Fueras de Ruta
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Pedidos cuya fecha de entrega no coincide con el día de visita del cliente
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {!IS_MISIONES && (
            <Link href="/indicadores/dqi">
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-emerald-300">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="rounded-xl p-3 bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                    <Truck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      DQI · Calidad de entrega
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Roturas en ruta (PPM) + top SKUs — Pilar Entrega 1.4
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          <Link href="/indicadores/rechazos">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-red-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-red-100 text-red-600 group-hover:bg-red-200 transition-colors">
                  <PackageX className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Rechazos
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Dashboard ejecutivo de rechazos
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/indicadores/choferes">
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-blue-300">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl p-3 bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors">
                  <Truck className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Bultos por chofer
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ranking diario con TML y rechazos por chofer
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          {IS_MISIONES && (
            <Link href="/indicadores/flota">
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-sky-300">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="rounded-xl p-3 bg-sky-100 text-sky-600 group-hover:bg-sky-200 transition-colors">
                    <Truck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Indicadores de Flota
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Disponibilidad, MTBF, MTTR y prob. de falla — vivo de Cloudfleet
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
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
