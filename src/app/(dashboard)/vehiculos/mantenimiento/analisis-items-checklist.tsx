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
//  · NO OK y REGULAR se cuentan por separado. El checklist tiene tres niveles y
//    aplanarlos miente: NO OK saca la unidad de servicio, REGULAR es una
//    observación a seguir ("leve presencia de fluidos"). Los 18 registros de
//    HELI1 eran REGULAR, no defectos.
//  · Los ítems que nunca detectaron nada se muestran igual, en su propio bloque.
//    Es el hallazgo incómodo del punto: un ítem con miles de evaluaciones y cero
//    defectos no suele estar sano, suele no estar mirándose.
//  · Cada fila lleva su CONCLUSIÓN escrita. El número solo no defiende el punto:
//    "documentación nunca detectó nada" es un hallazgo hasta que alguien escribe
//    que el vencimiento lo controla el sistema con alertas y no el chofer. La
//    columna se lee al lado de la tasa, no en una pantalla aparte, porque es la
//    respuesta a ese número.

import { useMemo, useState, useTransition } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MessageSquarePlus, Repeat, SearchX } from "lucide-react"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import {
  getAnalisisChecklist,
  setObservacionItem,
} from "@/actions/checklist-analisis"
import type { AnalisisChecklist, AnalisisItem } from "@/actions/checklist-analisis"
import {
  FiltroPeriodo,
  etiquetaDe,
  hoyISO,
  periodoInicial,
  rangoDe,
  type PeriodoState,
} from "./_components/filtro-periodo"
import { usePaletaViz } from "./_components/paleta-viz"
import { TooltipBarras } from "./_components/tooltip-barras"
import { DIAS_CRONICO_ACTIVO } from "@/lib/flota/checklist-cronicos"

interface Props {
  analisis: AnalisisChecklist
  puedeEditar: boolean
}

interface DialogoObs {
  itemId: string
  itemNombre: string
  criterio: string | null
  texto: string
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

export function AnalisisItemsChecklist({ analisis, puedeEditar }: Props) {
  // El período arranca en "Histórico completo": es la lectura con la que nació
  // el análisis (una tasa por ítem necesita volumen para significar algo) y
  // recién ahí se acota.
  const [periodo, setPeriodo] = useState<PeriodoState>(() =>
    periodoInicial("todo")
  )
  const [datos, setDatos] = useState<AnalisisChecklist>(analisis)
  const [recalculando, setRecalculando] = useState(false)
  const paleta = usePaletaViz()

  const cambiarPeriodo = async (p: PeriodoState) => {
    setPeriodo(p)
    setRecalculando(true)
    const res = await getAnalisisChecklist(rangoDe(p))
    setRecalculando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setDatos(res.data)
  }

  const etiquetaPeriodo = etiquetaDe(rangoDe(periodo))
  // Años a ofrecer: los que tienen hallazgos, más el año en curso.
  const anios = useMemo(() => {
    const set = new Set<string>(
      analisis.porMes.map((m) => m.ym.slice(0, 4))
    )
    set.add(hoyISO().slice(0, 4))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [analisis.porMes])
  const { items, cronicos, porMes, porCategoria, totales } = datos
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [verSinDeteccion, setVerSinDeteccion] = useState(false)
  const [dialogo, setDialogo] = useState<DialogoObs | null>(null)
  const [guardando, setGuardando] = useState(false)
  // Override optimista: la nota se ve al toque y no espera el refresh del server.
  const [obsOverrides, setObsOverrides] = useState<Map<string, string | null>>(new Map())

  const obsDe = (i: AnalisisItem): string | null =>
    obsOverrides.has(i.id) ? (obsOverrides.get(i.id) ?? null) : i.observacion

  const abrirObservacion = (i: AnalisisItem) => {
    if (!puedeEditar) return
    setDialogo({
      itemId: i.id,
      itemNombre: i.nombre,
      criterio: i.criterio,
      texto: obsDe(i) ?? "",
    })
  }

  const guardarObservacion = async () => {
    if (!dialogo) return
    setGuardando(true)
    const texto = dialogo.texto.trim() || null
    const res = await setObservacionItem({ itemId: dialogo.itemId, observacion: texto })
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setObsOverrides((prev) => new Map(prev).set(dialogo.itemId, texto))
    toast.success(texto ? "Conclusión guardada" : "Conclusión borrada")
    setDialogo(null)
    startTransition(() => router.refresh())
  }

  const conDefectos = useMemo(() => items.filter((i) => i.hallazgos > 0), [items])
  const sinDefectos = useMemo(
    () => items.filter((i) => i.hallazgos === 0).sort((a, b) => b.evaluado - a.evaluado),
    [items]
  )
  const maxHallazgos = Math.max(1, ...conDefectos.map((i) => i.hallazgos))

  // % acumulado en columna, no en un segundo eje: la lectura de Pareto sin
  // inventar la correlación que provoca un gráfico de dos escalas.
  const acumulado = useMemo(() => {
    const total = conDefectos.reduce((a, i) => a + i.hallazgos, 0)
    let suma = 0
    return new Map(
      conDefectos.map((i) => {
        suma += i.hallazgos
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

  const criticosNoOk = conDefectos.filter((i) => i.critico).reduce((a, i) => a + i.noOk, 0)

  // Se recuenta en el cliente para que la nota recién escrita mueva el número
  // sin esperar el refresh.
  const conObservacion = useMemo(
    () =>
      items.filter((i) =>
        obsOverrides.has(i.id) ? obsOverrides.get(i.id) != null : i.observacion != null
      ).length,
    [items, obsOverrides]
  )

  const celdaObservacion = (i: AnalisisItem) => {
    const obs = obsDe(i)
    if (!obs) {
      return (
        <TableCell className="py-2">
          {puedeEditar ? (
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => abrirObservacion(i)}
            >
              <MessageSquarePlus className="size-3.5" aria-hidden /> Anotar
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      )
    }
    return (
      <TableCell className="py-2">
        <button
          className={cn(
            "max-w-[22rem] text-left text-xs text-foreground",
            puedeEditar && "hover:underline hover:underline-offset-2"
          )}
          onClick={() => abrirObservacion(i)}
          disabled={!puedeEditar}
          title={obs}
        >
          {obs}
        </button>
      </TableCell>
    )
  }

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
            <span className="flex h-2 flex-1 items-center gap-0.5" aria-hidden>
              {i.noOk > 0 && (
                <span
                  className="h-2 rounded-sm bg-destructive"
                  style={{ width: `${(i.noOk / maxHallazgos) * 100}%`, minWidth: 4 }}
                />
              )}
              {i.regular > 0 && (
                <span
                  className="h-2 rounded-sm bg-amber-500/70"
                  style={{ width: `${(i.regular / maxHallazgos) * 100}%`, minWidth: 4 }}
                />
              )}
            </span>
          </span>
        )}
      </TableCell>
      <TableCell className="py-2 text-right font-semibold tabular-nums">
        {i.noOk > 0 ? i.noOk : <span className="text-muted-foreground/50">—</span>}
      </TableCell>
      <TableCell className="py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
        {i.regular > 0 ? i.regular : <span className="text-muted-foreground/50">—</span>}
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
      {celdaObservacion(i)}
    </TableRow>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DpoSeccionCinta seccionId="analisis-items" />
        <div className="flex items-center gap-2">
          {recalculando && (
            <span className="text-xs text-muted-foreground">Recalculando…</span>
          )}
          <FiltroPeriodo value={periodo} onChange={cambiarPeriodo} anios={anios} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        El checklist tiene tres respuestas y acá van separadas:{" "}
        <strong className="text-destructive">NO OK</strong> es un defecto que compromete
        la operación,{" "}
        <strong className="text-amber-600 dark:text-amber-400">Regular</strong> es una
        observación a seguir que no impide operar, y OK es cumplimiento. Cada tarjeta baja
        al bloque que explica ese número.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Hallazgos"
          valor={totales.hallazgos}
          sub={`${totales.noOk} NO OK · ${totales.regular} observación(es) · en ${totales.checklists.toLocaleString("es-AR")} checklists`}
          dpo="1.3"
          onClick={() => irA("items-con-defectos")}
        />
        <KpiCard
          label="Tasa de detección"
          valor={fmtPct(totales.tasa)}
          sub={`${totales.hallazgos} de ${totales.evaluado.toLocaleString("es-AR")} respuestas registradas`}
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
          footer={
            cronicosActivos.some((c) => c.noOk === 0) ? (
              <span className="text-xs text-muted-foreground">
                Ojo: hay crónicos que son sólo observación, no NO OK.
              </span>
            ) : undefined
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
              El mismo ítem con hallazgo tres veces o más en la misma unidad. Es lo que
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
                    <TableHead>Tipo</TableHead>
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
                      <TableCell
                        className={cn(
                          "py-2 text-right text-lg font-bold tabular-nums",
                          c.noOk > 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {c.veces}
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {c.noOk > 0 && (
                          <span className="block text-destructive">{c.noOk} NO OK</span>
                        )}
                        {c.regular > 0 && (
                          <span className="block text-amber-600 dark:text-amber-400">
                            {c.regular} observación{c.regular === 1 ? "" : "es"}
                          </span>
                        )}
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
                {totales.noOk} NO OK son de ítems críticos.
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Hallazgos</TableHead>
                  <TableHead className="text-right">NO OK</TableHead>
                  <TableHead className="text-right">Regular</TableHead>
                  <TableHead className="text-right">Evaluado</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                  <TableHead className="text-right">% acum.</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead className="text-right">Último</TableHead>
                  <TableHead>Conclusión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{conDefectos.map((i) => filaItem(i, true))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {(porCategoria.length > 0 || porMes.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {porCategoria.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Hallazgos por parte del vehículo
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  NO OK y observaciones nunca se suman: van una barra al lado de
                  la otra · {etiquetaPeriodo}
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={porCategoria}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                      barGap={2}
                    >
                      <CartesianGrid
                        horizontal={false}
                        className="stroke-border"
                        strokeOpacity={0.5}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                      />
                      <YAxis
                        type="category"
                        dataKey="categoria"
                        width={104}
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                      />
                      <RTooltip
                        cursor={{ className: "fill-muted", opacity: 0.4 }}
                        content={<TooltipBarras />}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="noOk"
                        name="NO OK"
                        fill={paleta.critico}
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="regular"
                        name="Observación"
                        fill={paleta.leve}
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {porMes.length > 0 && (
            <Card id="defectos-por-mes" className="scroll-mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hallazgos por mes</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Si sube la barra roja hay más unidades comprometidas; si sube
                  sólo la azul, se está observando más · {etiquetaPeriodo}
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={porMes.map((m) => ({ ...m, mes: mesCorto(m.ym) }))}
                      margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                      barGap={2}
                    >
                      <CartesianGrid
                        vertical={false}
                        className="stroke-border"
                        strokeOpacity={0.5}
                      />
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                      />
                      <RTooltip
                        cursor={{ className: "fill-muted", opacity: 0.4 }}
                        content={<TooltipBarras />}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="noOk"
                        name="NO OK"
                        fill={paleta.critico}
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="regular"
                        name="Observación"
                        fill={paleta.leve}
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
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
            muchas evaluaciones y cero hallazgos. Los que tienen explicación válida
            conviene dejarla escrita en la conclusión: el de documentación, por ejemplo,
            no lo puede verificar el chofer, lo controla el sistema con alertas.{" "}
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
                    <TableHead className="text-right">NO OK</TableHead>
                    <TableHead className="text-right">Regular</TableHead>
                    <TableHead className="text-right">Evaluado</TableHead>
                    <TableHead className="text-right">Tasa</TableHead>
                    <TableHead>Unidades</TableHead>
                    <TableHead className="text-right">Último</TableHead>
                    <TableHead>Conclusión</TableHead>
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
        respuesta distinta de OK. Conclusiones escritas:{" "}
        <strong className="text-foreground">
          {conObservacion} de {totales.itemsActivos}
        </strong>{" "}
        ítems · criterio operativo cargado en {totales.itemsConCriterio} de{" "}
        {totales.itemsActivos} (los que faltan se completan con el SOP de Checklist).
      </p>

      <Dialog open={dialogo != null} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conclusión del ítem</DialogTitle>
            <DialogDescription>
              {dialogo?.itemNombre} — por qué la tasa es la que es y qué se decidió
              hacer. Es lo que lee el auditor al lado del número.
            </DialogDescription>
          </DialogHeader>
          {dialogo?.criterio && (
            <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Criterio del checklist:</span>{" "}
              {dialogo.criterio}
            </p>
          )}
          <Textarea
            value={dialogo?.texto ?? ""}
            onChange={(e) => setDialogo((d) => (d ? { ...d, texto: e.target.value } : d))}
            placeholder="Ej.: los REGULAR son la gotita por la tapa del depósito, ya reemplazada el 28/07; no son pérdida de fluido"
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardarObservacion} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
