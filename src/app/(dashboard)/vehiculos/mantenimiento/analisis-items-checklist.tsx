"use client"

// Análisis por ítem del checklist (DPO 1.3).
//
// La lista de defectos ordenada por fecha responde "qué pasó ayer". Esta vista
// responde las dos que pide el punto: QUÉ ítem falla y DÓNDE se repite.
//
// Decisiones de lectura:
//  · La tabla es la forma principal. Con 45 ítems y 6 categorías, un gráfico de
//    torta o un ranking de colores esconde más de lo que muestra; la barra va
//    dentro de la fila, como magnitud relativa al ítem que más falla.
//  · Las barras son de un solo color: la severidad la lleva el badge "Crítico",
//    con texto, no el color de la barra.
//  · Los ítems que nunca detectaron nada se muestran igual, en su propio bloque.
//    Es el hallazgo incómodo del punto: un ítem con miles de evaluaciones y cero
//    defectos no suele estar sano, suele no estar mirándose.

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Repeat, SearchX } from "lucide-react"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import type { AnalisisChecklist, AnalisisItem } from "@/actions/checklist-analisis"
import { DIAS_CRONICO_ACTIVO } from "@/lib/flota/checklist-cronicos"

interface Props {
  analisis: AnalisisChecklist
}

const fmtPct = (v: number | null, dec = 2) =>
  v == null ? "—" : `${v.toFixed(dec)}%`

const fmtFecha = (f: string | null) => {
  if (!f) return "—"
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

const mesCorto = (ym: string) => {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
  const [y, m] = ym.split("-")
  return `${MESES[Number(m) - 1]} ${y.slice(2)}`
}

export function AnalisisItemsChecklist({ analisis }: Props) {
  const { items, cronicos, porMes, totales } = analisis
  const [verSinDeteccion, setVerSinDeteccion] = useState(false)

  const conDefectos = useMemo(() => items.filter((i) => i.noOk > 0), [items])
  const sinDefectos = useMemo(
    () => items.filter((i) => i.noOk === 0).sort((a, b) => b.evaluado - a.evaluado),
    [items]
  )
  const maxNoOk = conDefectos[0]?.noOk ?? 0
  const maxMes = Math.max(1, ...porMes.map((p) => p.veces))

  // % acumulado en columna, no en un segundo eje: la lectura de Pareto sin
  // inventar la correlación que provoca un gráfico de dos escalas.
  const acumulado = useMemo(() => {
    const total = conDefectos.reduce((a, i) => a + i.noOk, 0)
    let suma = 0
    return new Map(
      conDefectos.map((i) => {
        suma += i.noOk
        return [i.id, total > 0 ? (suma / total) * 100 : 0]
      })
    )
  }, [conDefectos])

  /**
   * Las tarjetas de arriba son el resumen y cada bloque de abajo es su detalle:
   * al tocarlas se baja al bloque que explica ese número, en vez de obligar a
   * buscarlo. `abrir` despliega el bloque plegado antes de bajar.
   */
  const irA = (id: string, abrir?: () => void) => {
    abrir?.()
    const destino = document.getElementById(id)
    if (!destino) return
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // El bloque plegado tarda un frame en montarse.
    requestAnimationFrame(() => {
      destino.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" })
    })
  }

  const cronicosActivos = useMemo(
    () => cronicos.filter((c) => c.diasSinRepetirse <= DIAS_CRONICO_ACTIVO),
    [cronicos]
  )

  const criticosNoOk = conDefectos
    .filter((i) => i.critico)
    .reduce((a, i) => a + i.noOk, 0)

  const filaItem = (i: AnalisisItem, conBarra: boolean) => (
    <TableRow key={i.id}>
      <TableCell className="py-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{i.nombre}</span>
          {i.critico && (
            <Badge className="border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
              Crítico
            </Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {i.categoria} · {i.tipoVehiculo}
        </span>
      </TableCell>
      <TableCell className="py-2">
        {conBarra && (
          <span className="flex items-center gap-2">
            <span
              className="h-2 rounded-sm bg-foreground/60"
              style={{ width: `${maxNoOk > 0 ? (i.noOk / maxNoOk) * 100 : 0}%`, minWidth: 4 }}
              aria-hidden
            />
            <span className="text-xs tabular-nums text-muted-foreground">{i.noOk}</span>
          </span>
        )}
      </TableCell>
      <TableCell className="py-2 text-right tabular-nums">{i.evaluado}</TableCell>
      <TableCell className="py-2 text-right font-semibold tabular-nums">
        {fmtPct(i.tasa)}
      </TableCell>
      {conBarra && (
        <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
          {fmtPct(acumulado.get(i.id) ?? null, 0)}
        </TableCell>
      )}
      <TableCell className="py-2 text-xs text-muted-foreground">
        {i.unidades.length === 0
          ? "—"
          : i.unidades
              .slice(0, 3)
              .map((u) => `${u.dominio}${u.veces > 1 ? ` (${u.veces})` : ""}`)
              .join(", ") + (i.unidades.length > 3 ? ` +${i.unidades.length - 3}` : "")}
      </TableCell>
      <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground">
        {fmtFecha(i.ultimaFecha)}
      </TableCell>
    </TableRow>
  )

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="analisis-items" />

      <p className="text-sm text-muted-foreground">
        Cada tarjeta baja al bloque que explica ese número.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Defectos detectados"
          valor={totales.noOk}
          sub={`en ${totales.checklists.toLocaleString("es-AR")} checklists · ${fmtFecha(totales.desde)} a ${fmtFecha(totales.hasta)}`}
          dpo="1.3"
          onClick={() => irA("items-con-defectos")}
        />
        <KpiCard
          label="Tasa de detección"
          valor={fmtPct(totales.tasa)}
          sub={`${totales.noOk} de ${totales.evaluado.toLocaleString("es-AR")} respuestas registradas`}
          estado={totales.tasa != null && totales.tasa < 1 ? "alerta" : "neutro"}
          dpo="1.3"
          onClick={() => irA("defectos-por-mes")}
        />
        <KpiCard
          label="Ítems que detectaron"
          valor={`${totales.itemsConDeteccion} de ${totales.itemsActivos}`}
          sub={`${totales.itemsActivos - totales.itemsConDeteccion} nunca marcaron un defecto`}
          estado={
            totales.itemsConDeteccion < totales.itemsActivos / 2 ? "alerta" : "neutro"
          }
          dpo="1.3"
          onClick={() => irA("items-sin-deteccion", () => setVerSinDeteccion(true))}
        />
        <KpiCard
          label="Defectos crónicos activos"
          valor={cronicosActivos.length}
          sub={
            cronicos.length > cronicosActivos.length
              ? `${cronicos.length - cronicosActivos.length} ya cortado(s), con su historial`
              : "mismo ítem repetido en la misma unidad"
          }
          estado={cronicosActivos.length > 0 ? "critico" : "ok"}
          dpo="1.3"
          onClick={cronicos.length > 0 ? () => irA("cronicos") : undefined}
        />
      </div>

      {cronicos.length > 0 && (
        <Card id="cronicos" className="scroll-mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="size-4 text-muted-foreground" aria-hidden /> Defectos
              crónicos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              El mismo ítem marcado NO OK tres veces o más en la misma unidad. Es lo que
              anticipa la rotura: justifica adelantar el correctivo en vez de esperar el
              service. Un defecto que se reparó conserva su historial pero deja de figurar
              como activo a los {DIAS_CRONICO_ACTIVO} días sin repetirse.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidad e ítem</TableHead>
                    <TableHead className="text-right">Veces</TableHead>
                    <TableHead>Evolución</TableHead>
                    <TableHead className="text-right">Desde</TableHead>
                    <TableHead className="text-right">Última</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cronicos.map((c) => (
                    <TableRow key={`${c.itemId}-${c.dominio}`}>
                      <TableCell className="py-2">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-foreground">{c.dominio}</span>
                          <span className="text-foreground">{c.item}</span>
                          {c.critico && (
                            <Badge className="border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
                              Crítico
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.categoria} · {c.tipoVehiculo}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right text-lg font-bold tabular-nums text-destructive">
                        {c.veces}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="flex items-end gap-1">
                          {c.porMes.map((m) => (
                            <span key={m.ym} className="flex flex-col items-center gap-0.5">
                              <span
                                className="w-5 rounded-sm bg-foreground/60"
                                style={{
                                  height: Math.max(
                                    3,
                                    (m.veces / Math.max(...c.porMes.map((x) => x.veces))) * 28
                                  ),
                                }}
                                aria-hidden
                              />
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                {m.veces}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {mesCorto(m.ym)}
                              </span>
                            </span>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground">
                        {fmtFecha(c.primera)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground">
                        {fmtFecha(c.ultima)}
                      </TableCell>
                      <TableCell className="py-2">
                        {c.diasSinRepetirse <= DIAS_CRONICO_ACTIVO ? (
                          <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                            Activo
                          </Badge>
                        ) : (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Sin repetirse hace {c.diasSinRepetirse} días
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card id="items-con-defectos" className="scroll-mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ítems que detectaron defectos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ordenados por cantidad de defectos. La tasa es sobre las veces que ese ítem se
            evaluó, así un ítem que se mira en todos los checks no queda comparado contra
            uno que se mira en pocos. {criticosNoOk > 0 && (
              <>
                <strong className="text-foreground">{criticosNoOk}</strong> de los{" "}
                {totales.noOk} defectos son de ítems críticos.
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Defectos</TableHead>
                  <TableHead className="text-right">Evaluado</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                  <TableHead className="text-right">% acum.</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead className="text-right">Último</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{conDefectos.map((i) => filaItem(i, true))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {porMes.length > 0 && (
        <Card id="defectos-por-mes" className="scroll-mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Defectos por mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              {porMes.map((m) => (
                <div key={m.ym} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {m.veces}
                  </span>
                  <div
                    className="w-full rounded-sm bg-foreground/60"
                    style={{ height: Math.max(4, (m.veces / maxMes) * 90) }}
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground">{mesCorto(m.ym)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card id="items-sin-deteccion" className="scroll-mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <SearchX className="size-4 text-muted-foreground" aria-hidden /> Ítems sin
            ninguna detección
            <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {sinDefectos.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nunca marcaron un defecto. Puede ser que la flota esté bien en ese punto, o que
            el ítem se tilde sin mirarlo — el auditor va a preguntar por los que tienen
            muchas evaluaciones y cero hallazgos.{" "}
            <button
              className="font-medium text-foreground underline underline-offset-2"
              onClick={() => setVerSinDeteccion((v) => !v)}
            >
              {verSinDeteccion ? "Ocultar" : "Ver los ítems"}
            </button>
          </p>
          {verSinDeteccion && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ítem</TableHead>
                    <TableHead />
                    <TableHead className="text-right">Evaluado</TableHead>
                    <TableHead className="text-right">Tasa</TableHead>
                    <TableHead>Unidades</TableHead>
                    <TableHead className="text-right">Último</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{sinDefectos.map((i) => filaItem(i, false))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className={cn("text-xs text-muted-foreground")}>
        Fuente: respuestas del checklist digital de flota. Un defecto es cualquier
        respuesta distinta de OK.
      </p>
    </div>
  )
}
