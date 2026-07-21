"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Clock, AlertTriangle, Info } from "lucide-react"
import { VentanasHorariasPanel } from "@/components/indicadores/ventanas-horarias-panel"
import type { OnTimeResumen } from "@/actions/on-time"
import type { CoberturaVh } from "@/lib/mercosur-dashboard"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const fmtHl = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface Props {
  anio: number
  onTime: OnTimeResumen | null
  vh: CoberturaVh | null
  vhError: string | null
}

export function OnTimeClient({ anio, onTime, vh, vhError }: Props) {
  const ytd = onTime?.onTimeYtd ?? null
  const meta = onTime?.meta ?? 99
  const cumple = ytd !== null && ytd >= meta
  const medidos = onTime?.meses.filter((m) => m.medido) ?? []

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Clock className="h-6 w-6" /> On Time
        </h1>
        <p className="text-sm text-muted-foreground">
          Entregas en el día pactado · DPO Entrega 4.4 · {anio}
        </p>
      </div>

      {/* KPI principal */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">On Time YTD</p>
              <p
                className={`text-3xl font-bold ${
                  ytd === null
                    ? "text-slate-400"
                    : cumple
                      ? "text-green-600"
                      : "text-red-600"
                }`}
              >
                {ytd === null ? "—" : `${ytd.toFixed(2)}%`}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / {meta}%
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                HL reprogramados (VRL + VRC)
              </p>
              <p className="text-3xl font-bold text-slate-900">
                {fmtHl(medidos.reduce((s, m) => s + m.hlReprogramado, 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Cobertura de ventanas horarias
              </p>
              <p
                className={`text-3xl font-bold ${
                  vh === null
                    ? "text-slate-400"
                    : vh.cumple_meta
                      ? "text-green-600"
                      : "text-amber-600"
                }`}
              >
                {vh === null ? "—" : `${vh.cobertura_pct.toFixed(1)}%`}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / &gt;80%
                </span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md border bg-slate-50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="text-sm text-slate-700">
              <p className="font-medium">
                On Time = 100 − (VRL + VRC) ÷ HL solicitados
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                La ventana horaria es el <strong>día de entrega pactado</strong>{" "}
                (excepción Small Operations del checklist: &quot;se considera
                entrega dentro del día solicitado&quot;). El numerador es lo
                reprogramado: VRL logístico + VRC comercial por límite de
                crédito. El denominador es el mismo de OTIF e In-Full: HL
                vendidos <strong>neto</strong> —incluye venta mostrador— más
                rechazos, VRL y VRC.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Se publica complementado (más es mejor). En el Árbol del Sueño,
                OTIF e In-Full van como % de pérdida: es la misma cuenta
                presentada al revés.
              </p>
            </div>
          </div>

          {onTime && !onTime.vrcDisponible && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">
                El VRC no está disponible (no respondió la base del dashboard
                Mercosur). El On Time mostrado sólo contempla el VRL, así que
                está <strong>sobreestimado</strong>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="serie">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="serie">Serie mensual</TabsTrigger>
          <TabsTrigger value="vh">
            Ventanas horarias
            {vh && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({vh.cobertura_pct.toFixed(0)}%)
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="serie">
          <Card>
            <CardContent className="pt-6">
              <p className="mb-4 text-xs text-muted-foreground">
                Los meses anteriores a julio 2026 están <strong>sin medir</strong>:
                el VRL arranca el 18/07/2026 y el VRC en julio, así que darían
                100% por falta de dato y no por buena performance. Quedan fuera
                del YTD.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">HL solicitados</TableHead>
                      <TableHead className="text-right">VRL</TableHead>
                      <TableHead className="text-right">VRC</TableHead>
                      <TableHead className="text-right">Reprogramado</TableHead>
                      <TableHead className="text-right">On Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(onTime?.meses ?? []).map((m) => (
                      <TableRow
                        key={m.mes}
                        className={m.medido ? undefined : "opacity-50"}
                      >
                        <TableCell className="font-medium">
                          {MESES[m.mes - 1]}
                          {!m.medido && (
                            <Badge variant="secondary" className="ml-2">
                              sin medir
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtHl(m.hlSolicitados)}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.hlVrl > 0 ? fmtHl(m.hlVrl) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.hlVrc === null
                            ? "s/d"
                            : m.hlVrc > 0
                              ? fmtHl(m.hlVrc)
                              : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.hlReprogramado > 0 ? fmtHl(m.hlReprogramado) : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            !m.medido || m.onTimePct === null
                              ? "text-slate-400"
                              : m.onTimePct >= meta
                                ? "text-green-600"
                                : "text-red-600"
                          }`}
                        >
                          {!m.medido || m.onTimePct === null
                            ? "—"
                            : `${m.onTimePct.toFixed(2)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vh">
          <VentanasHorariasPanel cobertura={vh} error={vhError} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
