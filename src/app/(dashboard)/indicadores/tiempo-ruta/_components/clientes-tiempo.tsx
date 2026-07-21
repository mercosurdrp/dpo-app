"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Info, MapPin, Store, Timer } from "lucide-react"
import type {
  ClienteTiempoRuta,
  CiudadTiempoRuta,
} from "@/actions/tiempo-ruta-cliente"

export interface FocoPlanPdv {
  foco_cliente_id: string
  foco_cliente: string
  foco_ciudad: string
}

interface Props {
  clientes: ClienteTiempoRuta[]
  ciudades: CiudadTiempoRuta[]
  paradas: number
  desde: string
  hasta: string
  /** Si viene, cada fila ofrece armar un plan sobre ese PDV. */
  onArmarPlan?: (foco: FocoPlanPdv) => void
}

const TOP_INICIAL = 20

function min1(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Cuán lejos está el cliente de la mediana de su ciudad. */
function ExcesoBadge({ exceso }: { exceso: number }) {
  const t = `+${min1(exceso)} min`
  if (exceso >= 15)
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{t}</Badge>
  if (exceso >= 7)
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{t}</Badge>
  return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">{t}</Badge>
}

// Umbral de min/bulto para separar descarga de espera. Referencia real 2026:
// los PDV de alto volumen trabajan a 0,7-0,9 min/bulto; arriba de 2 el tiempo ya
// no se explica por la mercadería que se baja.
const MIN_POR_BULTO_ALERTA = 2

/**
 * Lo que hace accionable al ranking: si el PDV tarda porque descarga mucho, no hay
 * nada que corregir. Si tarda con pocos bultos, el tiempo se va en espera, acceso
 * o cobranza — y eso sí se trabaja.
 */
function DiagnosticoBadge({ minPorBulto }: { minPorBulto: number }) {
  if (!minPorBulto)
    return <span className="text-xs text-muted-foreground">sin dato</span>
  if (minPorBulto >= MIN_POR_BULTO_ALERTA)
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
        Espera / acceso
      </Badge>
    )
  if (minPorBulto >= 1)
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Revisar</Badge>
    )
  return (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      Descarga volumen
    </Badge>
  )
}

export function ClientesTiempo({
  clientes,
  ciudades,
  paradas,
  desde,
  hasta,
  onArmarPlan,
}: Props) {
  const [top, setTop] = useState(TOP_INICIAL)

  const conExceso = clientes.filter((c) => c.exceso_min > 0)
  const visibles = conExceso.slice(0, top)

  // El foco: lo que realmente se puede trabajar es la cola, no el universo.
  const hsTop = visibles.reduce((a, c) => a + c.min_recuperables, 0) / 60
  const meses = Math.max(
    1,
    Math.round(
      (new Date(hasta).getTime() - new Date(desde).getTime()) / (1000 * 60 * 60 * 24 * 30),
    ),
  )

  if (paradas === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Todavía no hay paradas cargadas para este período.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Foco: el premio realista, no el techo teórico */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Potencial de los {visibles.length} PDV más lentos
              </p>
              <p className="text-3xl font-bold text-slate-900">
                {min1(hsTop / meses)} hs/mes
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Si cada uno bajara a la mediana de su ciudad · {min1(hsTop)} hs en el período
              </p>
            </div>
            <div className="rounded-full bg-slate-100 p-3">
              <Timer className="h-5 w-5 text-slate-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Por ciudad */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" /> Por ciudad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-right">Paradas</TableHead>
                <TableHead className="text-right">Mediana</TableHead>
                <TableHead className="text-right">PDV sobre la mediana</TableHead>
                <TableHead className="text-right">Horas recuperables</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ciudades.map((c) => (
                <TableRow key={c.ciudad}>
                  <TableCell className="font-medium">{c.ciudad}</TableCell>
                  <TableCell className="text-right">
                    {c.paradas.toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-right">{min1(c.mediana_ciudad)} min</TableCell>
                  <TableCell className="text-right">{c.clientes_sobre_mediana}</TableCell>
                  <TableCell className="text-right">{min1(c.horas_recuperables)} hs</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Cada ciudad tiene su propia mediana: la distancia al CD las hace
            estructuralmente distintas. Un PDV se compara contra su ciudad, nunca contra
            el total.
          </p>
        </CardContent>
      </Card>

      {/* Ranking de clientes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-4 w-4" /> Puntos de venta que más tiempo consumen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-right">Visitas</TableHead>
                <TableHead className="text-right">Mediana</TableHead>
                <TableHead className="text-right">Su ciudad</TableHead>
                <TableHead className="text-right">Exceso</TableHead>
                <TableHead className="text-right">Bultos</TableHead>
                <TableHead className="text-right">Min/bulto</TableHead>
                <TableHead>Diagnóstico</TableHead>
                <TableHead className="text-right">Min. recuperables</TableHead>
                {onArmarPlan && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((c, i) => (
                <TableRow key={`${c.id_cliente}-${c.ciudad}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.cliente}</TableCell>
                  <TableCell>{c.ciudad}</TableCell>
                  <TableCell className="text-right">{c.visitas}</TableCell>
                  <TableCell className="text-right font-medium">
                    {min1(c.mediana_cliente)} min
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {min1(c.mediana_ciudad)} min
                  </TableCell>
                  <TableCell className="text-right">
                    <ExcesoBadge exceso={c.exceso_min} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {c.bultos_med ? Math.round(c.bultos_med) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {c.min_por_bulto ? c.min_por_bulto.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell>
                    <DiagnosticoBadge minPorBulto={c.min_por_bulto} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {Math.round(c.min_recuperables).toLocaleString("es-AR")}
                  </TableCell>
                  {onArmarPlan && (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onArmarPlan({
                            foco_cliente_id: c.id_cliente,
                            foco_cliente: c.cliente,
                            foco_ciudad: c.ciudad,
                          })
                        }
                      >
                        Plan
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {top < conExceso.length && (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setTop(top + 20)}>
                Ver 20 más ({conExceso.length - top} restantes)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cómo leerlo: sin esto el número se malinterpreta */}
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-slate-700">Qué mide:</span> el tiempo
                entre una entrega y la anterior de la misma ruta. Incluye el manejo hasta
                el PDV, así que <span className="font-medium">no es tiempo de atención puro</span>:
                un cliente alejado puntúa alto por distancia. Por eso cada uno se compara
                contra la mediana de su ciudad.
              </p>
              <p>
                <span className="font-medium text-slate-700">Por qué mediana:</span> el
                promedio se rompe con un solo outlier (un almuerzo, un tramo largo) y mete
                clientes que en realidad son rápidos.
              </p>
              <p>
                <span className="font-medium text-slate-700">Diagnóstico:</span> los
                minutos por bulto separan al PDV que tarda porque{" "}
                <span className="font-medium">descarga mucho</span> (normal, no hay nada
                que corregir) del que tarda con poca mercadería, donde el tiempo se va en{" "}
                <span className="font-medium">espera, acceso o cobranza</span> — eso sí se
                trabaja. Referencia: los PDV de alto volumen operan a 0,7–0,9 min/bulto.
              </p>
              <p>
                <span className="font-medium text-slate-700">Ojo con el total:</span> la
                suma de todos los PDV sobre la mediana no es una meta alcanzable — por
                definición, la mitad siempre está por encima. El objetivo es la cola: los
                PDV del ranking.
              </p>
              <p>
                Base: {paradas.toLocaleString("es-AR")} paradas entre {desde} y {hasta}.
                Solo PDV con 8 visitas o más. Foxtrot no mide permanencia (su telemetría
                GPS llega vacía): esto se deriva de la hora de cada entrega.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
