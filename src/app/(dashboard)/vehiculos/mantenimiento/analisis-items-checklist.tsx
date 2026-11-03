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
//  · Los ítems que más se repiten llevan además su PLAN DE ACCIÓN, en su propio
//    bloque. Es la respuesta al "¿y qué hicieron?" que sigue al número, y es
//    distinta del plan de cada marca (que arregla una unidad un día): acá va la
//    contramedida de fondo — se cambió de marca de focos, se pidieron dos
//    presupuestos por las manijas, se le retiró al autoelevador el aceite
//    hidráulico de más que había dejado el service. Ninguna de las tres deja
//    rastro en una OT, así que sin esto el ítem se lee como desatendido.
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
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import {
  ClipboardList,
  Download,
  MessageSquarePlus,
  Repeat,
  SearchX,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import {
  getAnalisisChecklist,
  setObservacionItem,
  setPlanAccionItem,
} from "@/actions/checklist-analisis"
import type {
  AnalisisChecklist,
  AnalisisItem,
  PlanItemEstado,
} from "@/actions/checklist-analisis"
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
import { DIAS_CRONICO_ACTIVO, UMBRAL_CRONICO } from "@/lib/flota/checklist-cronicos"

interface Props {
  analisis: AnalisisChecklist
  puedeEditar: boolean
}

/**
 * El mismo diálogo escribe las dos cosas, porque son las dos mitades de la
 * misma pregunta: la CONCLUSIÓN explica por qué el número es el que es y el
 * PLAN dice qué se está haciendo para que baje.
 */
interface DialogoItem {
  modo: "conclusion" | "plan"
  itemId: string
  itemNombre: string
  criterio: string | null
  texto: string
  estado: PlanItemEstado
}

/**
 * Hallazgos desde los que el ítem pide plan de acción propio. Es el mismo
 * umbral con el que la pantalla ya llama crónico a un defecto: tres marcas
 * dejan de ser casualidad y pasan a tener causa.
 */
const UMBRAL_PLAN = UMBRAL_CRONICO

const fmtPct = (v: number | null, dec = 2) =>
  v == null ? "—" : `${v.toFixed(dec)}%`

const fmtFecha = (f: string | null) => {
  if (!f) return "—"
  const [y, m, d] = f.split("-")
  return `${d}/${m}/${y.slice(2)}`
}

/** Excel del período: mismas cuatro hojas que descarga la pirámide. */
function urlExportChecklist(r: {
  desde: string | null
  hasta: string | null
}): string {
  const p = new URLSearchParams()
  if (r.desde) p.set("desde", r.desde)
  if (r.hasta) p.set("hasta", r.hasta)
  const qs = p.toString()
  return `/api/vehiculos/checklist/export${qs ? `?${qs}` : ""}`
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
  const { items, cronicos, porMes, porCategoria, totales, planHabilitado } = datos
  const router = useRouter()

  /**
   * Pareto de partes del vehículo.
   *
   * 🚨 Antes eran dos barras por categoría (NO OK y observación). Con 3 a 6
   * hallazgos por mes eso no separaba nada y encima obligaba a sumar de cabeza
   * para saber qué parte pesa más. Ordenado de mayor a menor con el acumulado,
   * la lectura es directa: dónde está el 80%.
   *
   * 🚨 El acumulado va en HALLAZGOS, no en %: comparte el eje con las barras.
   * Un segundo eje para el porcentaje dibuja una correlación que no existe.
   */
  const pareto = useMemo(() => {
    const orden = [...porCategoria].sort((a, b) => b.veces - a.veces)
    const total = orden.reduce((a, c) => a + c.veces, 0)
    let acum = 0
    return orden.map((c) => {
      acum += c.veces
      return {
        categoria: c.categoria,
        veces: c.veces,
        acumulado: acum,
        pct: total > 0 ? Math.round((acum / total) * 100) : 0,
      }
    })
  }, [porCategoria])

  const [, startTransition] = useTransition()
  const [verSinDeteccion, setVerSinDeteccion] = useState(false)
  const [dialogo, setDialogo] = useState<DialogoItem | null>(null)
  const [guardando, setGuardando] = useState(false)
  // Override optimista: la nota se ve al toque y no espera el refresh del server.
  const [obsOverrides, setObsOverrides] = useState<Map<string, string | null>>(new Map())
  const [planOverrides, setPlanOverrides] = useState<
    Map<string, { plan: string | null; estado: PlanItemEstado | null; fecha: string | null }>
  >(new Map())

  const obsDe = (i: AnalisisItem): string | null =>
    obsOverrides.has(i.id) ? (obsOverrides.get(i.id) ?? null) : i.observacion

  const planDe = (
    i: AnalisisItem
  ): { plan: string | null; estado: PlanItemEstado | null; fecha: string | null } =>
    planOverrides.get(i.id) ?? {
      plan: i.planAccion,
      estado: i.planEstado,
      fecha: i.planFecha,
    }

  const abrirObservacion = (i: AnalisisItem) => {
    if (!puedeEditar) return
    setDialogo({
      modo: "conclusion",
      itemId: i.id,
      itemNombre: i.nombre,
      criterio: i.criterio,
      texto: obsDe(i) ?? "",
      estado: "en_curso",
    })
  }

  const abrirPlan = (i: AnalisisItem) => {
    if (!puedeEditar) return
    const p = planDe(i)
    setDialogo({
      modo: "plan",
      itemId: i.id,
      itemNombre: i.nombre,
      criterio: i.criterio,
      texto: p.plan ?? "",
      estado: p.estado ?? "en_curso",
    })
  }

  const guardar = async () => {
    if (!dialogo) return
    setGuardando(true)
    const texto = dialogo.texto.trim() || null
    const res =
      dialogo.modo === "conclusion"
        ? await setObservacionItem({ itemId: dialogo.itemId, observacion: texto })
        : await setPlanAccionItem({
            itemId: dialogo.itemId,
            plan: texto,
            estado: dialogo.estado,
          })
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    if (dialogo.modo === "conclusion") {
      setObsOverrides((prev) => new Map(prev).set(dialogo.itemId, texto))
      toast.success(texto ? "Conclusión guardada" : "Conclusión borrada")
    } else {
      setPlanOverrides((prev) =>
        new Map(prev).set(dialogo.itemId, {
          plan: texto,
          estado: texto ? dialogo.estado : null,
          fecha: texto ? new Date().toISOString() : null,
        })
      )
      toast.success(texto ? "Plan de acción guardado" : "Plan de acción borrado")
    }
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

  // El crónico que se repite y nadie llevó al taller: ni plan de acción sobre
  // sus marcas, ni un mantenimiento de esa unidad desde la primera detección.
  const cronicosSinRespuesta = useMemo(
    () =>
      cronicosActivos.filter((c) => !c.conPlan && c.mantenimientosDesde === 0)
        .length,
    [cronicosActivos]
  )

  const criticosNoOk = conDefectos.filter((i) => i.critico).reduce((a, i) => a + i.noOk, 0)

  /**
   * Los ítems que piden plan de acción propio: los que llegaron al umbral de
   * hallazgos, más cualquiera que ya tenga un plan escrito —aunque haya dejado
   * de marcarse, porque eso es justamente lo que prueba que el plan funcionó, y
   * esconderlo borraría la evidencia.
   *
   * Ordenados por hallazgos y NO por la tabla de arriba (que ordena por NO OK a
   * propósito): acá la pregunta es cuál se repite más, y las 23 observaciones de
   * fluidos del autoelevador son el caso que más plan necesitaba.
   */
  const frecuentes = useMemo(() => {
    const planDeItem = (i: AnalisisItem) =>
      planOverrides.has(i.id) ? planOverrides.get(i.id)!.plan : i.planAccion
    return conDefectos
      .filter((i) => i.hallazgos >= UMBRAL_PLAN || planDeItem(i) != null)
      .sort((a, b) => b.hallazgos - a.hallazgos || b.noOk - a.noOk)
  }, [conDefectos, planOverrides])

  // Cuánto del total de hallazgos explican esos ítems: es lo que justifica
  // mirar cinco filas y no las cuarenta y ocho.
  const pesoFrecuentes = useMemo(() => {
    const total = conDefectos.reduce((a, i) => a + i.hallazgos, 0)
    if (total === 0) return null
    return (frecuentes.reduce((a, i) => a + i.hallazgos, 0) / total) * 100
  }, [conDefectos, frecuentes])

  const frecuentesSinPlan = useMemo(
    () =>
      frecuentes.filter(
        (i) => (planOverrides.has(i.id) ? planOverrides.get(i.id)!.plan : i.planAccion) == null
      ).length,
    [frecuentes, planOverrides]
  )

  const conPlan = useMemo(
    () =>
      items.filter((i) =>
        planOverrides.has(i.id) ? planOverrides.get(i.id)!.plan != null : i.planAccion != null
      ).length,
    [items, planOverrides]
  )

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
          <a
            href={urlExportChecklist(rangoDe(periodo))}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" aria-hidden /> Excel
          </a>
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
          footer={
            frecuentes.length > 0 ? (
              <button
                className={cn(
                  "text-left text-xs underline underline-offset-2",
                  planHabilitado && frecuentesSinPlan > 0
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  irA("planes-items")
                }}
              >
                {!planHabilitado
                  ? `Plan de acción de los ${frecuentes.length} ítems más frecuentes`
                  : frecuentesSinPlan > 0
                    ? `${frecuentesSinPlan} de los ${frecuentes.length} ítems más frecuentes sin plan de acción`
                    : `Los ${frecuentes.length} ítems más frecuentes tienen plan de acción`}
              </button>
            ) : undefined
          }
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
            cronicosSinRespuesta > 0 ? (
              <span className="text-xs font-medium text-destructive">
                {cronicosSinRespuesta} sin OT ni plan de acción: se repiten y
                nadie los llevó al taller.
              </span>
            ) : cronicosActivos.some((c) => c.noOk === 0) ? (
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
                    <TableHead>¿Se llevó al taller?</TableHead>
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
                        {!c.conPlan && c.mantenimientosDesde === 0 ? (
                          <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                            Sin OT ni plan
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {c.conPlan && "con plan"}
                            {c.conPlan && c.mantenimientosDesde > 0 && " · "}
                            {c.mantenimientosDesde > 0 &&
                              `${c.mantenimientosDesde} mantenimiento${
                                c.mantenimientosDesde === 1 ? "" : "s"
                              }`}
                          </span>
                        )}
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

      {frecuentes.length > 0 && (
        <Card id="planes-items" className="scroll-mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ClipboardList className="size-4 text-muted-foreground" aria-hidden /> Plan
              de acción de los ítems que más fallan
              {planHabilitado && frecuentesSinPlan > 0 && (
                <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                  {frecuentesSinPlan} sin plan
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Los ítems con {UMBRAL_PLAN} hallazgos o más
              {pesoFrecuentes != null && (
                <>
                  {" "}
                  — {frecuentes.length} de {conDefectos.length} ítems, que explican{" "}
                  <strong className="text-foreground">{fmtPct(pesoFrecuentes, 0)}</strong>{" "}
                  de los hallazgos
                </>
              )}
              . Acá va la contramedida <strong className="text-foreground">de fondo</strong>{" "}
              sobre el ítem, no el arreglo de la marca del día: ese es el plan de cada
              defecto y vive en Check lists. La diferencia es la que pide el punto —
              cambiar de marca de focos ataca la causa; reponer el foco de esa unidad, no.
              Un ítem que se deja de marcar después de ejecutar el plan es la prueba de
              que la contramedida funcionó, así que el plan queda a la vista aunque el
              ítem ya no esté entre los frecuentes.
            </p>
            {!planHabilitado && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                Falta correr en la base el archivo{" "}
                <strong>APLICAR_EN_PAMPEANA_CHECKLIST_ITEM_PLAN_ACCION.sql</strong>: hasta
                entonces los planes no se pueden guardar y las filas de abajo salen vacías
                —no es que no tengan plan.
              </p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ítem</TableHead>
                    <TableHead className="text-right">Hallazgos</TableHead>
                    <TableHead>Unidades</TableHead>
                    <TableHead>Plan de acción</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Cargado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {frecuentes.map((i) => {
                    const p = planDe(i)
                    return (
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
                        <TableCell className="py-2 text-right">
                          <span className="block font-semibold tabular-nums">
                            {i.hallazgos}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {i.noOk > 0 && `${i.noOk} NO OK`}
                            {i.noOk > 0 && i.regular > 0 && " · "}
                            {i.regular > 0 && `${i.regular} obs.`}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {i.unidades.length === 0
                            ? "—"
                            : i.unidades
                                .slice(0, 3)
                                .map(
                                  (u) => `${u.dominio}${u.veces > 1 ? ` (${u.veces})` : ""}`
                                )
                                .join(", ") +
                              (i.unidades.length > 3 ? ` +${i.unidades.length - 3}` : "")}
                        </TableCell>
                        <TableCell className="py-2">
                          {!planHabilitado ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : p.plan ? (
                            <button
                              className={cn(
                                "max-w-[30rem] text-left text-xs text-foreground",
                                puedeEditar && "hover:underline hover:underline-offset-2"
                              )}
                              onClick={() => abrirPlan(i)}
                              disabled={!puedeEditar}
                              title={p.plan}
                            >
                              {p.plan}
                            </button>
                          ) : puedeEditar ? (
                            <button
                              className="flex items-center gap-1 text-xs text-destructive underline underline-offset-2"
                              onClick={() => abrirPlan(i)}
                            >
                              <MessageSquarePlus className="size-3.5" aria-hidden /> Cargar
                              plan
                            </button>
                          ) : (
                            <span className="text-xs text-destructive">Sin plan</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          {!planHabilitado ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : p.plan == null ? (
                            <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                              Sin plan
                            </Badge>
                          ) : p.estado === "cerrado" ? (
                            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              Cerrado
                            </Badge>
                          ) : (
                            <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              En curso
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground">
                          {fmtFecha(p.fecha ? p.fecha.slice(0, 10) : null)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {pareto.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Dónde se concentran los hallazgos (Pareto)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Partes ordenadas de mayor a menor y la línea de acumulado: se lee de una
              en qué dos o tres está el grueso · {etiquetaPeriodo}
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={pareto}
                  margin={{ top: 18, right: 12, bottom: 4, left: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    className="stroke-border"
                    strokeOpacity={0.5}
                  />
                  <XAxis
                    dataKey="categoria"
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
                  <Bar
                    dataKey="veces"
                    name="Hallazgos"
                    fill={paleta.serie(0)}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="acumulado"
                    name="Acumulado"
                    stroke={paleta.otras}
                    strokeWidth={2}
                    dot={{ r: 3.5, fill: paleta.otras, strokeWidth: 0 }}
                    isAnimationActive={false}
                  >
                    {/* El % va como etiqueta sobre el punto: es la lectura del
                        Pareto, pero sin meter un segundo eje. */}
                    <LabelList
                      dataKey="pct"
                      position="top"
                      offset={8}
                      className="fill-muted-foreground"
                      fontSize={11}
                      formatter={(v) => `${v ?? ""}%`}
                    />
                  </Line>
                </ComposedChart>
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
        ítems
        {planHabilitado && (
          <>
            {" "}
            · planes de acción de ítem:{" "}
            <strong className="text-foreground">
              {conPlan} de {frecuentes.length}
            </strong>{" "}
            ítems frecuentes
          </>
        )}{" "}
        · criterio operativo cargado en {totales.itemsConCriterio} de{" "}
        {totales.itemsActivos} (los que faltan se completan con el SOP de Checklist).
      </p>

      <Dialog open={dialogo != null} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogo?.modo === "plan" ? "Plan de acción del ítem" : "Conclusión del ítem"}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.modo === "plan" ? (
                <>
                  {dialogo?.itemNombre} — qué se está haciendo para que deje de
                  aparecer. La contramedida del ítem, no el arreglo de una unidad.
                </>
              ) : (
                <>
                  {dialogo?.itemNombre} — por qué la tasa es la que es y qué se decidió
                  hacer. Es lo que lee el auditor al lado del número.
                </>
              )}
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
            placeholder={
              dialogo?.modo === "plan"
                ? "Ej.: se cambia de marca de focos; los que venían fallando eran de la marca anterior"
                : "Ej.: los REGULAR son la gotita por la tapa del depósito, ya reemplazada el 28/07; no son pérdida de fluido"
            }
            rows={4}
            autoFocus
          />
          {dialogo?.modo === "plan" && (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">
                Estado del plan{" "}
                <span className="text-muted-foreground/70">
                  (cerrado = ya se ejecutó; si el ítem deja de marcarse, funcionó)
                </span>
              </span>
              {/* Dos botones y no un desplegable: los select de la app se abren
                  encima del control y hacen creer que no pasó nada. */}
              <div className="flex gap-2">
                {(
                  [
                    ["en_curso", "En curso"],
                    ["cerrado", "Cerrado"],
                  ] as Array<[PlanItemEstado, string]>
                ).map(([valor, etiqueta]) => (
                  <Button
                    key={valor}
                    type="button"
                    size="sm"
                    variant={dialogo.estado === valor ? "default" : "outline"}
                    onClick={() => setDialogo((d) => (d ? { ...d, estado: valor } : d))}
                  >
                    {etiqueta}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
