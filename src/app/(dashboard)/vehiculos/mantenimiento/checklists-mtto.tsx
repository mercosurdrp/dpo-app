"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
  ShieldAlert,
  ClipboardCheck,
  Plus,
  Pencil,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"
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
import { DpoPuntoBadge, DpoSeccionCinta } from "./_components/dpo-badge"
import {
  FiltroPeriodo,
  dentroDe,
  etiquetaDe,
  hoyISO,
  periodoInicial,
  rangoDe,
  type PeriodoState,
} from "./_components/filtro-periodo"
import { usePaletaViz } from "./_components/paleta-viz"
import { TooltipBarras } from "./_components/tooltip-barras"
import { CoberturaCil } from "./cobertura-cil"
import { ConsumoUrea } from "./consumo-urea"
import { AdherenciaChecklistCard } from "./adherencia-checklist"
import { KpiCard } from "./_components/kpi-card"
import {
  createTareaCil,
  deleteTareaCil,
  subirFotoTareaCil,
  eliminarItemChecklist,
  eliminarPlanChecklist,
  upsertPlanChecklist,
  type ChecklistComentario,
  type ChecklistItemNoOk,
  type ChecklistPlanEstado,
  type ChecklistPlanTipo,
  type TareaCil,
} from "@/actions/mantenimiento-vehiculos"
import {
  CLASE_TIEMPO,
  colorTiempoRespuesta,
  formatDuracion,
} from "@/lib/vehiculos/tiempo-resolucion"
import { TAREAS_CIL, labelTareaCil } from "@/lib/flota/cil-tareas"
import { FotoInput } from "@/components/foto/foto-input"
import { toast } from "sonner"

function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
}

/** El mes en curso en hora argentina: el servidor puede estar en UTC. */
function mesActualArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7)
}

function tipoLabel(t: string): string {
  return t === "liberacion" ? "Salida" : t === "retorno" ? "Retorno" : t
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        tipo === "liberacion"
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
          : "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"
      )}
    >
      {tipoLabel(tipo)}
    </Badge>
  )
}

const VALOR_BADGE: Record<string, string> = {
  nook: "border-destructive/30 bg-destructive/10 text-destructive",
  malo: "border-destructive/30 bg-destructive/10 text-destructive",
  regular: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

function ValorBadge({ valor }: { valor: string }) {
  const label = valor === "nook" ? "No OK" : valor === "regular" ? "Regular" : valor
  return (
    <Badge variant="outline" className={VALOR_BADGE[valor] ?? "border-border bg-muted"}>
      {label}
    </Badge>
  )
}

const PLAN_TIPO_LABEL: Record<ChecklistPlanTipo, string> = {
  correctivo: "Correctivo",
  preventivo: "Preventivo",
  proactivo: "Proactivo",
}
const PLAN_TIPO_BADGE: Record<ChecklistPlanTipo, string> = {
  correctivo: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  preventivo: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  proactivo: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
}
const PLAN_ESTADO_LABEL: Record<ChecklistPlanEstado, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
}
const PLAN_ESTADO_BADGE: Record<ChecklistPlanEstado, string> = {
  pendiente: "border-border bg-muted text-muted-foreground",
  en_proceso: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  resuelto: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
}

/**
 * Contenedor con scroll horizontal cuya BARRA queda ARRIBA (no abajo), para
 * poder desplazar la tabla al costado sin tener que bajar hasta la última fila.
 * Se renderiza una barra real arriba (siempre visible) sincronizada con la tabla,
 * y se oculta la barra nativa de abajo.
 */
function ScrollX({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [hayOverflow, setHayOverflow] = useState(false)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const medir = () => {
      setAncho(el.scrollWidth)
      setHayOverflow(el.scrollWidth > el.clientWidth + 1)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener("resize", medir)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", medir)
    }
  }, [children])

  const desdeArriba = () => {
    if (topRef.current && bodyRef.current) bodyRef.current.scrollLeft = topRef.current.scrollLeft
  }
  const desdeTabla = () => {
    if (topRef.current && bodyRef.current) topRef.current.scrollLeft = bodyRef.current.scrollLeft
  }

  return (
    <div>
      {/* Barra de scroll ARRIBA (siempre visible mientras la tabla desborde). */}
      <div
        ref={topRef}
        onScroll={desdeArriba}
        className="scrollbar-x-visible overflow-x-scroll overflow-y-hidden"
        style={{ height: hayOverflow ? 12 : 0 }}
        aria-hidden
      >
        <div style={{ width: ancho, height: 1 }} />
      </div>
      {/* La tabla: scrollea acá (no en el wrapper interno del <Table> de shadcn,
          que neutralizamos con [&>div]:overflow-x-visible) y sin barra propia,
          sincronizada con la de arriba. */}
      <div
        ref={bodyRef}
        onScroll={desdeTabla}
        className="overflow-x-auto scrollbar-none [&>div]:overflow-x-visible"
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Tabla de focos. Se usa dos veces: los del mes elegido y el arrastre abierto
 * de meses anteriores, que se listan aparte pero con el mismo formato.
 */
function TablaItemsNoOk({
  items,
  puedeEditar,
  ahoraMs,
  onEditarPlan,
  onEliminar,
}: {
  items: ChecklistItemNoOk[]
  puedeEditar: boolean
  ahoraMs: number | null
  onEditarPlan: (i: ChecklistItemNoOk) => void
  onEliminar: (i: ChecklistItemNoOk) => void
}) {
  return (
    <ScrollX>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Chofer</TableHead>
            <TableHead>Comentario</TableHead>
            <TableHead>Plan de acción</TableHead>
            <TableHead>Tiempo de respuesta</TableHead>
            {puedeEditar && <TableHead className="text-right">Eliminar</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="whitespace-nowrap">{fmtFecha(i.fecha)}</TableCell>
              <TableCell className="font-medium">{i.dominio}</TableCell>
              <TableCell>
                <TipoBadge tipo={i.tipo} />
              </TableCell>
              <TableCell className="text-muted-foreground">{i.categoria}</TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  {i.item}
                  {i.critico && (
                    <span title="Ítem crítico">
                      <ShieldAlert className="size-3.5 text-destructive" />
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <ValorBadge valor={i.valor} />
              </TableCell>
              <TableCell className="text-muted-foreground">{i.chofer || "—"}</TableCell>
              <TableCell className="max-w-72 text-muted-foreground">
                {i.comentario || <span className="text-muted-foreground/50">—</span>}
              </TableCell>
              <TableCell className="min-w-44">
                <PlanCell item={i} puedeEditar={puedeEditar} onEditar={() => onEditarPlan(i)} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <TiempoRespuestaCell item={i} ahoraMs={ahoraMs} />
              </TableCell>
              {puedeEditar && (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    title="Eliminar esta observación"
                    onClick={() => onEliminar(i)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollX>
  )
}

/**
 * Un defecto que dura tres semanas no es deuda nueva cada día: el chofer lo
 * vuelve a marcar en cada checklist. La pérdida de fluidos del HELI1 dejó 16
 * filas en julio. En el arrastre se agrupan por unidad + ítem, de modo que el
 * listado muestre focos y no repeticiones, y que un solo plan cierre la serie.
 */
interface GrupoArrastre {
  clave: string
  /** El más viejo: desde cuándo viene la deuda. */
  origen: ChecklistItemNoOk
  /** El que lleva el plan (o el origen): es el que recibe la foto al editar. */
  principal: ChecklistItemNoOk
  /** Toda la serie, para cerrarla junta. */
  ids: string[]
  repeticiones: number
  ultimaFecha: string
}

function agruparArrastre(items: ChecklistItemNoOk[]): GrupoArrastre[] {
  const porClave = new Map<string, ChecklistItemNoOk[]>()
  for (const i of items) {
    const clave = `${i.dominio}|${i.categoria}|${i.item}`
    const previos = porClave.get(clave)
    if (previos) previos.push(i)
    else porClave.set(clave, [i])
  }
  return Array.from(porClave, ([clave, filas]) => {
    const orden = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const origen = orden[0]
    return {
      clave,
      origen,
      principal: orden.find((f) => f.plan) ?? origen,
      ids: orden.map((f) => f.id),
      repeticiones: orden.length,
      ultimaFecha: orden[orden.length - 1].fecha,
    }
  }).sort((a, b) => a.origen.fecha.localeCompare(b.origen.fecha))
}

/**
 * Tiempo de respuesta POR FOCO: un defecto que se repitió en 16 checklists es
 * UN foco, y tardó lo que va de la PRIMERA vez que se detectó hasta que se
 * cerró el plan. Contado fila por fila, las repeticiones del final —de un par
 * de días cada una— bajaban el promedio sin que se hubiera gestionado nada:
 * la pérdida de fluidos del HELI1 daba 16 tiempos en vez de los 25 días que
 * estuvo abierta. Mismo vicio de denominador que la adherencia auto-reportada.
 */
function duracionesPorFoco(items: ChecklistItemNoOk[]): number[] {
  const focos = new Map<string, { desdeMs: number; hastaMs: number }>()
  for (const i of items) {
    const cierre = i.plan?.estado === "resuelto" ? i.plan.resueltoAt : null
    if (!cierre || !i.hora) continue
    const desdeMs = new Date(i.hora).getTime()
    const hastaMs = new Date(cierre).getTime()
    if (Number.isNaN(desdeMs) || Number.isNaN(hastaMs) || hastaMs < desdeMs) continue
    const clave = `${i.dominio}|${i.categoria}|${i.item}|${cierre.slice(0, 10)}`
    const previo = focos.get(clave)
    if (previo) {
      previo.desdeMs = Math.min(previo.desdeMs, desdeMs)
      previo.hastaMs = Math.max(previo.hastaMs, hastaMs)
    } else {
      focos.set(clave, { desdeMs, hastaMs })
    }
  }
  return Array.from(focos.values(), (f) => (f.hastaMs - f.desdeMs) / 3_600_000)
}

/**
 * Arrastre agrupado: una fila por foco, con desde cuándo viene y en cuántos
 * checklists se repitió.
 */
function TablaArrastre({
  grupos,
  puedeEditar,
  ahoraMs,
  onEditarPlan,
  onEliminar,
}: {
  grupos: GrupoArrastre[]
  puedeEditar: boolean
  ahoraMs: number | null
  onEditarPlan: (g: GrupoArrastre) => void
  onEliminar: (g: GrupoArrastre) => void
}) {
  return (
    <ScrollX>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Desde</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Se repitió</TableHead>
            <TableHead>Comentario</TableHead>
            <TableHead>Plan de acción</TableHead>
            <TableHead>Abierto hace</TableHead>
            {puedeEditar && <TableHead className="text-right">Eliminar</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map((g) => {
            const i = g.origen
            return (
              <TableRow key={g.clave}>
                <TableCell className="whitespace-nowrap">{fmtFecha(i.fecha)}</TableCell>
                <TableCell className="font-medium">{i.dominio}</TableCell>
                <TableCell>
                  <TipoBadge tipo={i.tipo} />
                </TableCell>
                <TableCell className="text-muted-foreground">{i.categoria}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    {i.item}
                    {i.critico && (
                      <span title="Ítem crítico">
                        <ShieldAlert className="size-3.5 text-destructive" />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <ValorBadge valor={i.valor} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {g.repeticiones === 1 ? (
                    <span className="text-sm text-muted-foreground">1 checklist</span>
                  ) : (
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {g.repeticiones} checklists
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        último {fmtFecha(g.ultimaFecha)}
                      </span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-72 text-muted-foreground">
                  {i.comentario || <span className="text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell className="min-w-44">
                  <PlanCell
                    item={g.principal}
                    puedeEditar={puedeEditar}
                    onEditar={() => onEditarPlan(g)}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <TiempoRespuestaCell item={i} ahoraMs={ahoraMs} />
                </TableCell>
                {puedeEditar && (
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      title={
                        g.repeticiones === 1
                          ? "Eliminar esta observación"
                          : `Eliminar las ${g.repeticiones} observaciones de esta serie`
                      }
                      onClick={() => onEliminar(g)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ScrollX>
  )
}

interface Props {
  itemsNoOk: ChecklistItemNoOk[]
  comentarios: ChecklistComentario[]
  tareasCil: TareaCil[]
  /** Flota activa completa (para el alta de tareas CIL). */
  dominiosFlota: string[]
  puedeEditar: boolean
}

export function ChecklistsMtto({
  itemsNoOk,
  comentarios,
  tareasCil,
  dominiosFlota,
  puedeEditar,
}: Props) {
  const router = useRouter()
  // "Hace X que está sin resolver" se calcula recién en el cliente: en el SSR
  // el reloj del server y el del navegador difieren y React marca hydration
  // mismatch.
  const [ahoraMs, setAhoraMs] = useState<number | null>(null)
  useEffect(() => {
    setAhoraMs(Date.now())
  }, [])
  const [fDominio, setFDominio] = useState("todos")
  const [fTipo, setFTipo] = useState("todos")
  // La vista arranca en el mes en curso: sin esto la lista acumulaba TODO el
  // histórico y los focos ya cerrados de meses viejos tapaban lo del mes. El
  // período ahora se elige con la granularidad que haga falta (día, mes, año o
  // un rango libre); "Histórico completo" es el acumulado de siempre.
  const [periodo, setPeriodo] = useState<PeriodoState>(() =>
    periodoInicial("mes")
  )
  const rango = useMemo(() => rangoDe(periodo), [periodo])
  const paleta = usePaletaViz()
  // El plan se edita sobre un ítem, pero puede cerrar toda una serie: `ids`
  // lleva las respuestas del grupo cuando viene del arrastre agrupado.
  const [planTarget, setPlanTarget] = useState<{
    item: ChecklistItemNoOk
    ids: string[]
  } | null>(null)
  // Borrado: una observación suelta o la serie completa de un foco agrupado.
  const [delSerie, setDelSerie] = useState<ChecklistItemNoOk[] | null>(null)
  const [delError, setDelError] = useState<string | null>(null)
  const [pendingDel, startDel] = useTransition()

  function pedirBorrado(items: ChecklistItemNoOk[]) {
    setDelError(null)
    setDelSerie(items)
  }

  function confirmarBorrado() {
    if (!delSerie) return
    setDelError(null)
    const ids = delSerie.map((i) => i.id)
    startDel(async () => {
      for (const id of ids) {
        const res = await eliminarItemChecklist(id)
        if ("error" in res) {
          setDelError(res.error)
          router.refresh()
          return
        }
      }
      setDelSerie(null)
      router.refresh()
    })
  }

  const dominios = useMemo(() => {
    const s = new Set<string>()
    itemsNoOk.forEach((i) => s.add(i.dominio))
    comentarios.forEach((c) => s.add(c.dominio))
    return Array.from(s).sort()
  }, [itemsNoOk, comentarios])

  // Años con actividad, del más nuevo al más viejo. El año en curso entra
  // siempre aunque todavía no tenga focos.
  const anios = useMemo(() => {
    const s = new Set<string>([hoyISO().slice(0, 4)])
    itemsNoOk.forEach((i) => s.add(i.fecha.slice(0, 4)))
    comentarios.forEach((c) => s.add(c.fecha.slice(0, 4)))
    return Array.from(s).sort((a, b) => b.localeCompare(a))
  }, [itemsNoOk, comentarios])

  const coincide = (i: { dominio: string; tipo: string }) =>
    (fDominio === "todos" || i.dominio === fDominio) &&
    (fTipo === "todos" || i.tipo === fTipo)

  const historico = !rango.desde && !rango.hasta
  const etiquetaPeriodo = etiquetaDe(rango)

  /** Focos del período elegido (en histórico, todos). */
  const items = useMemo(
    () => itemsNoOk.filter((i) => coincide(i) && dentroDe(i.fecha, rango)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsNoOk, fDominio, fTipo, rango]
  )

  // Arrastre: focos de meses ANTERIORES que siguen sin resolverse. No se
  // esconden nunca — son deuda abierta, no ruido histórico.
  const arrastre = useMemo(
    () =>
      historico || !rango.desde
        ? []
        : itemsNoOk.filter(
            (i) =>
              coincide(i) &&
              i.fecha.slice(0, 10) < rango.desde! &&
              i.plan?.estado !== "resuelto"
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsNoOk, fDominio, fTipo, rango, historico]
  )

  // Los KPI miden lo que se está viendo: mes elegido + arrastre abierto.
  const visibles = useMemo(() => [...items, ...arrastre], [items, arrastre])

  // El arrastre se lista por FOCO, no por checklist: ver 16 veces la misma
  // pérdida de fluidos no es ver 16 problemas.
  const grupos = useMemo(() => agruparArrastre(arrastre), [arrastre])

  const coments = useMemo(
    () => comentarios.filter((c) => coincide(c) && dentroDe(c.fecha, rango)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comentarios, fDominio, fTipo, rango]
  )

  // Por unidad: lo que sigue abierto contra lo que ya se cerró. Es la lectura
  // de gestión de esta pantalla —quién arrastra deuda— y no repite el corte
  // leve/crítico que ya muestra la pirámide.
  const porUnidad = useMemo(() => {
    const m = new Map<string, { abiertos: number; resueltos: number }>()
    for (const i of visibles) {
      const u = m.get(i.dominio) ?? { abiertos: 0, resueltos: 0 }
      if (i.plan?.estado === "resuelto") u.resueltos++
      else u.abiertos++
      m.set(i.dominio, u)
    }
    return Array.from(m.entries())
      .map(([dominio, v]) => ({ dominio, ...v, total: v.abiertos + v.resueltos }))
      .sort((a, b) => b.abiertos - a.abiertos || b.total - a.total)
  }, [visibles])

  const criticos = visibles.filter((i) => i.critico).length
  const conPlan = visibles.filter((i) => i.plan).length
  const abiertos = visibles.filter((i) => i.plan?.estado !== "resuelto").length
  // Tiempo de respuesta: promedio de los focos ya cerrados, medido de la
  // primera detección al cierre del plan.
  const duraciones = useMemo(() => duracionesPorFoco(visibles), [visibles])
  const horasProm =
    duraciones.length > 0
      ? duraciones.reduce((a, h) => a + h, 0) / duraciones.length
      : null

  return (
    <div className="space-y-6">
      <DpoSeccionCinta seccionId="checklists" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Ítems no OK"
          valor={
            <>
              {abiertos}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {visibles.length}
              </span>
            </>
          }
          estado={abiertos > 0 ? "alerta" : "ok"}
          dpo="1.3"
          sub={`Sin resolver, sobre ${visibles.length} observación${
            visibles.length === 1 ? "" : "es"
          } ${historico ? "del histórico" : "en vista"}`}
        />
        <KpiCard
          label="Críticos no OK"
          valor={criticos}
          estado={criticos > 0 ? "critico" : "ok"}
          dpo="1.3"
          sub="Defectos críticos detectados"
        />
        <KpiCard
          label="Con plan de acción"
          valor={
            <>
              {conPlan}
              {/* Sobre lo que se está viendo, igual que el resto de los KPI: el
                  numerador contaba el arrastre y el denominador no, así que
                  podía dar más planes que observaciones. */}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {visibles.length}
              </span>
            </>
          }
          estado="neutro"
          sub="Observaciones con reparación registrada"
        />
        <KpiCard
          label="Tiempo de respuesta"
          valor={
            <span className="text-2xl">{formatDuracion(horasProm)}</span>
          }
          estado={
            horasProm == null ? "neutro" : horasProm <= 72 ? "ok" : "alerta"
          }
          dpo="1.3"
          sub={`Promedio de ${duraciones.length} foco${duraciones.length === 1 ? "" : "s"} resuelto${duraciones.length === 1 ? "" : "s"} (primera detección → cierre del plan)`}
        />
        <KpiCard
          label="Con comentarios"
          valor={coments.length}
          estado="neutro"
          sub="Checklists con observaciones del chofer"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Período</Label>
          <FiltroPeriodo value={periodo} onChange={setPeriodo} anios={anios} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Unidad</Label>
          <Select value={fDominio} onValueChange={(v: string | null) => setFDominio(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {dominios.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={fTipo} onValueChange={(v: string | null) => setFTipo(v ?? "todos")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="liberacion">Salida</SelectItem>
              <SelectItem value="retorno">Retorno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Foco por unidad: qué camión arrastra y cuál está al día */}
      {porUnidad.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Focos por unidad
              <span className="text-sm font-normal text-muted-foreground">
                · {etiquetaPeriodo}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(180, porUnidad.length * 34 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porUnidad}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                  barCategoryGap="28%"
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
                    dataKey="dominio"
                    width={84}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <RTooltip
                    cursor={{ className: "fill-muted", opacity: 0.4 }}
                    content={<TooltipBarras totalLabel="Focos" />}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="abiertos"
                    stackId="focos"
                    name="Sin resolver"
                    fill={paleta.critico}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="resueltos"
                    stackId="focos"
                    name="Resueltos"
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

      {/* Ítems observados (no OK) del mes elegido */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-muted-foreground" /> Ítems observados (no OK)
            <span className="text-sm font-normal capitalize text-muted-foreground">
              · {etiquetaPeriodo}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <ClipboardCheck className="size-8 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-3 text-sm text-muted-foreground">
                {historico
                  ? "Sin ítems observados en los checklists. Todo OK."
                  : `Sin ítems observados en ${etiquetaPeriodo}.`}
              </p>
            </div>
          ) : (
            <TablaItemsNoOk
              items={items}
              puedeEditar={puedeEditar}
              ahoraMs={ahoraMs}
              onEditarPlan={(i) => setPlanTarget({ item: i, ids: [i.id] })}
              onEliminar={(i) => pedirBorrado([i])}
            />
          )}
        </CardContent>
      </Card>

      {/* Arrastre: focos viejos que siguen abiertos. Se muestran aparte para que
          acortar la lista por mes no esconda deuda sin resolver. */}
      {arrastre.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Arrastre de meses anteriores
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                {grupos.length} sin resolver
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Focos anteriores al período elegido que todavía no tienen el plan de acción cerrado.
              Siguen acá hasta que se resuelvan. Un mismo defecto se cuenta{" "}
              <strong>una vez</strong>: la columna «Se repitió» dice en cuántos checklists volvió
              a aparecer{arrastre.length !== grupos.length && <> ({arrastre.length} en total)</>}, y
              el plan de acción cierra toda la serie de una.
            </p>
          </CardHeader>
          <CardContent>
            <TablaArrastre
              grupos={grupos}
              puedeEditar={puedeEditar}
              ahoraMs={ahoraMs}
              onEditarPlan={(g) => setPlanTarget({ item: g.principal, ids: g.ids })}
              // De la más vieja a la más nueva: el diálogo muestra el rango de
              // fechas y `arrastre` viene ordenado al revés.
              onEliminar={(g) =>
                pedirBorrado(
                  arrastre
                    .filter((i) => g.ids.includes(i.id))
                    .sort((a, b) => a.fecha.localeCompare(b.fecha))
                )
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Comentarios y observaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="size-4 text-muted-foreground" /> Comentarios y observaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coments.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Sin comentarios cargados en los checklists del período.
            </p>
          ) : (
            <ScrollX>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(c.fecha)}</TableCell>
                    <TableCell className="font-medium">{c.dominio}</TableCell>
                    <TableCell>
                      <TipoBadge tipo={c.tipo} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.chofer || "—"}</TableCell>
                    <TableCell className="max-w-md text-foreground">{c.observaciones}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </ScrollX>
          )}
        </CardContent>
      </Card>

      {planTarget && (
        <PlanDialog
          item={planTarget.item}
          ids={planTarget.ids}
          onClose={() => setPlanTarget(null)}
        />
      )}

      <Dialog open={!!delSerie} onOpenChange={(o: boolean) => !o && !pendingDel && setDelSerie(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {delSerie && delSerie.length > 1
                ? `Eliminar ${delSerie.length} observaciones`
                : "Eliminar observación"}
            </DialogTitle>
            <DialogDescription>
              {delSerie && delSerie.length > 0 && (
                <>
                  {delSerie[0].dominio} · {delSerie[0].item} ·{" "}
                  {delSerie.length > 1
                    ? `${fmtFecha(delSerie[0].fecha)} a ${fmtFecha(
                        delSerie[delSerie.length - 1].fecha
                      )}`
                    : fmtFecha(delSerie[0].fecha)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {delSerie && delSerie.length > 1
              ? `Se quitan las ${delSerie.length} observaciones No OK de esta serie`
              : "Se quita esta observación No OK del listado"}
            {delSerie?.some((i) => i.plan) ? " junto con su plan de acción" : ""}. Esta acción no
            se puede deshacer.
          </p>
          {delError && <p className="text-sm text-destructive">{delError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDelSerie(null)} disabled={pendingDel}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-1"
              onClick={confirmarBorrado}
              disabled={pendingDel}
            >
              {pendingDel && <Loader2 className="size-4 animate-spin" />}
              <Trash2 className="size-4" /> Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Adherencia al checklist: la evidencia del R1.3.1a (DPO 1.3) ===== */}
      <AdherenciaChecklistCard />

      {/* ===== Cobertura del CIL: qué unidad está al día y cuál falta (DPO 4.1) ===== */}
      <CoberturaCil mesActual={mesActualArgentina()} />

      {/* ===== Tareas CIL / ATO (DPO 4.1) ===== */}
      <TareasCilSection
        tareasCil={tareasCil}
        dominios={dominiosFlota}
        puedeEditar={puedeEditar}
      />

      {/* ===== Consumo de urea: cada cuántos km la pide cada camión ===== */}
      <ConsumoUrea />
    </div>
  )
}

// ==================== Tareas CIL / ATO ====================

// 🚨 Acá había una copia del catálogo de tareas. Al sacar `limpieza` del catálogo
// real (07/08/2026) esta copia lo habría seguido ofreciendo del lado del
// supervisor, que es justo la duplicación que causó el error `23514` de agosto.
// Ahora sale todo de `lib/flota/cil-tareas`.

function TareasCilSection({
  tareasCil,
  dominios,
  puedeEditar,
}: {
  tareasCil: TareaCil[]
  dominios: string[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())
  const [abrirCarga, setAbrirCarga] = useState(false)
  // 🚨 Arranca CERRADO: es el detalle fila por fila de todo el histórico y
  // empujaba para abajo la lectura que importa —la Cobertura del CIL, que está
  // justo arriba—. El conteo queda a la vista en el título, así que cerrado
  // igual se sabe cuántas hay.
  const [verDetalle, setVerDetalle] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-muted-foreground" /> Tareas CIL / ATO
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            {tareasCil.length}
          </Badge>
          <DpoPuntoBadge numero="4.1" />
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            aria-expanded={verDetalle}
            onClick={() => setVerDetalle((v) => !v)}
          >
            {verDetalle ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {verDetalle ? "Ocultar detalle" : "Ver detalle"}
          </Button>
          {puedeEditar && (
            <Button size="sm" onClick={() => setAbrirCarga(true)}>
              <Plus className="mr-1 size-4" /> Registrar tarea
            </Button>
          )}
        </div>
      </CardHeader>
      {verDetalle && (
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Limpieza, inspección y lubricación autónomas hechas por los operarios
            (incrementales al checklist diario).
          </p>
          {tareasCil.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin tareas CIL registradas.
            </p>
          ) : (
            /*
              🚨 `ScrollX` + `min-w` en la tabla, y NO un `overflow-x-auto` en el
              CardContent: con la tabla libre de comprimirse, el Detalle largo
              desbordaba su celda y se PISABA con «Ver»/«Subir» y con el botón de
              borrar (se leía "…se hizo eVerel"). El ancho mínimo la deja
              scrollear en vez de aplastarse, con la barra arriba como en las
              otras tablas de esta pantalla.
            */
            <ScrollX>
              <Table className="min-w-[60rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Operario</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Evidencia</TableHead>
                    {puedeEditar && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tareasCil.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="align-top whitespace-nowrap">
                        {fmtFecha(t.fecha)}
                      </TableCell>
                      <TableCell className="align-top font-medium">{t.dominio}</TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                        >
                          {labelTareaCil(t.tarea)}
                        </Badge>
                      </TableCell>
                      {/* El operario puede ser más de uno: se deja quebrar. */}
                      <TableCell className="w-44 align-top break-words whitespace-normal text-muted-foreground">
                        {t.operario}
                      </TableCell>
                      {/* 🚨 `whitespace-normal break-words` con ancho fijo: sin
                          esto el texto largo salía de la celda en vez de bajar de
                          renglón, y tapaba las columnas de la derecha. */}
                      <TableCell className="w-80 max-w-80 align-top break-words whitespace-normal text-muted-foreground">
                        {t.descripcion ?? "—"}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        {t.foto_url ? (
                          <MiniaturaEvidencia
                            url={t.foto_url}
                            pie={`${t.dominio} · ${labelTareaCil(t.tarea)} · ${fmtFecha(t.fecha)}`}
                          />
                        ) : puedeEditar ? (
                          <SubirFotoCil id={t.id} onSubida={refresh} />
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="align-top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={async () => {
                              const res = await deleteTareaCil(t.id)
                              if ("error" in res) toast.error(res.error)
                              else {
                                toast.success("Eliminada")
                                refresh()
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollX>
          )}
        </CardContent>
      )}
      {abrirCarga && (
        <TareaCilDialog
          dominios={dominios}
          onClose={() => setAbrirCarga(false)}
          onSaved={() => {
            setAbrirCarga(false)
            refresh()
          }}
        />
      )}
    </Card>
  )
}

/**
 * La evidencia, como miniatura en la fila, que se agranda al tocarla.
 *
 * 🚨 Antes era un link «Ver» que abría otra pestaña: para revisar el mes había
 * que salir y volver por cada foto. Con la miniatura se reconoce la unidad sin
 * abrir nada, y el visor deja mirarlas sin perder la tabla. El link a la imagen
 * original sigue estando adentro, que es lo que se le pasa al auditor.
 */
function MiniaturaEvidencia({ url, pie }: { url: string; pie: string }) {
  const [abierta, setAbierta] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        title={`Ver la foto — ${pie}`}
        className="block overflow-hidden rounded-md border transition-opacity hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Evidencia de ${pie}`}
          loading="lazy"
          className="size-12 object-cover"
        />
      </button>

      {abierta && (
        <Dialog open onOpenChange={(o) => !o && setAbierta(false)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-medium">{pie}</DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Evidencia de ${pie}`}
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ImageIcon className="size-3.5" /> Abrir la original en otra pestaña
            </a>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

/**
 * Adjunta la evidencia a una tarea CIL que quedó sin foto. La tarea y la foto no
 * siempre se pueden cargar juntas (ver `subirFotoTareaCil`), y sin esto la única
 * salida era borrar la fila y rehacerla.
 */
function SubirFotoCil({ id, onSubida }: { id: string; onSubida: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)

  async function enviar(file: File | null) {
    if (!file) return
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.set("foto", file)
      const res = await subirFotoTareaCil(id, fd)
      if ("error" in res) toast.error(res.error)
      else {
        toast.success("Evidencia cargada")
        setAbierto(false)
        onSubida()
      }
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={subiendo}
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline disabled:opacity-50"
      >
        <Upload className="size-3.5" /> {subiendo ? "Subiendo…" : "Subir"}
      </button>

      {/* Se abre un diálogo en vez de disparar el input directo: desde el celular
          la evidencia se saca en el momento, y con un input suelto no había forma
          de llegar a la cámara. */}
      {abierto && (
        <Dialog open onOpenChange={(o) => !o && !subiendo && setAbierto(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Adjuntar la evidencia</DialogTitle>
            </DialogHeader>
            <FotoInput
              foto={null}
              onFoto={(f) => void enviar(f)}
              nombreBase="cil-evidencia"
            />
            {subiendo && (
              <p className="text-sm text-muted-foreground">Subiendo…</p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function TareaCilDialog({
  dominios,
  onClose,
  onSaved,
}: {
  dominios: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [dominio, setDominio] = useState("")
  // Varios trabajos en una sola carga: la misma parada suele cerrar más de una
  // letra del CIL. Ver `createTareaCil`.
  const [tareas, setTareas] = useState<string[]>([])
  const [operario, setOperario] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [foto, setFoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!dominio) return toast.error("Elegí la unidad")
    if (tareas.length === 0) return toast.error("Marcá qué trabajos se hicieron")
    if (!operario.trim()) return toast.error("Indicá el operario")
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set("fecha", fecha)
      fd.set("dominio", dominio)
      for (const t of tareas) fd.append("tarea", t)
      fd.set("operario", operario)
      fd.set("descripcion", descripcion)
      if (foto) fd.set("foto", foto)
      const res = await createTareaCil(fd)
      if ("error" in res) return toast.error(res.error)
      toast.success(
        res.creadas === 1 ? "Tarea CIL registrada" : `${res.creadas} tareas CIL registradas`,
      )
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar tarea CIL</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Unidad</Label>
              <Select value={dominio || undefined} onValueChange={(v) => v && setDominio(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir" />
                </SelectTrigger>
                <SelectContent>
                  {dominios.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Trabajos hechos</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Marcá todos los que se le hicieron a la unidad ese día: se registran de
              una sola vez.
            </p>
            <div className="mt-2 space-y-1.5">
              {TAREAS_CIL.map((t) => {
                const marcada = tareas.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() =>
                      setTareas((prev) =>
                        prev.includes(t.id)
                          ? prev.filter((x) => x !== t.id)
                          : [...prev, t.id],
                      )
                    }
                    className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                      marcada
                        ? "border-primary bg-primary/10"
                        : "hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border-2 ${
                        marcada
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {marcada && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label>Operario</Label>
            <Input
              value={operario}
              onChange={(e) => setOperario(e.target.value)}
              placeholder="Nombre"
            />
          </div>
          <div>
            <Label>Detalle</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Opcional: qué se hizo / qué se encontró"
            />
          </div>
          <div>
            <Label>Foto (opcional)</Label>
            {/* Con cámara propia: desde el celular el `<input type="file">` sólo
                llegaba a la galería. Una foto para todos los trabajos marcados. */}
            <FotoInput
              foto={foto}
              onFoto={setFoto}
              nombreBase={`cil-${dominio || "unidad"}`}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Tiempo de respuesta del foco: desde que el chofer cargó el checklist hasta
 * que se cerró el plan de acción. Mientras el plan sigue abierto muestra cuánto
 * lleva esperando, para que se vea qué está corriendo.
 */
function TiempoRespuestaCell({
  item,
  ahoraMs,
}: {
  item: ChecklistItemNoOk
  ahoraMs: number | null
}) {
  if (item.plan?.estado === "resuelto" && item.horasResolucion != null) {
    const color = colorTiempoRespuesta(item.horasResolucion, item.critico)
    return (
      <span className="flex flex-col">
        <span className={cn("text-sm font-semibold", CLASE_TIEMPO[color])}>
          {formatDuracion(item.horasResolucion)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          resuelto {fmtFechaHora(item.plan.resueltoAt)}
        </span>
      </span>
    )
  }
  const abiertoHace =
    item.hora && ahoraMs != null
      ? (ahoraMs - new Date(item.hora).getTime()) / 3_600_000
      : null
  if (abiertoHace == null || abiertoHace < 0)
    return <span className="text-muted-foreground/50">—</span>
  return (
    <span className="flex flex-col">
      <span className="text-sm text-muted-foreground">
        {formatDuracion(abiertoHace)}
      </span>
      <span className="text-[11px] text-muted-foreground">sin resolver</span>
    </span>
  )
}

function fmtFechaHora(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function PlanCell({
  item,
  puedeEditar,
  onEditar,
}: {
  item: ChecklistItemNoOk
  puedeEditar: boolean
  onEditar: () => void
}) {
  const plan = item.plan
  if (!plan) {
    if (!puedeEditar) return <span className="text-muted-foreground/50">—</span>
    return (
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onEditar}>
        <Plus className="size-3.5" /> Agregar
      </Button>
    )
  }
  return (
    <button
      type="button"
      disabled={!puedeEditar}
      onClick={puedeEditar ? onEditar : undefined}
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-md p-1 text-left",
        puedeEditar && "hover:bg-muted"
      )}
      title={plan.descripcion}
    >
      <span className="flex flex-wrap items-center gap-1">
        <Badge variant="outline" className={cn("text-xs", PLAN_TIPO_BADGE[plan.tipo])}>
          {PLAN_TIPO_LABEL[plan.tipo]}
        </Badge>
        <Badge variant="outline" className={cn("text-xs", PLAN_ESTADO_BADGE[plan.estado])}>
          {PLAN_ESTADO_LABEL[plan.estado]}
        </Badge>
      </span>
      <span className="line-clamp-2 max-w-56 text-xs text-muted-foreground">{plan.descripcion}</span>
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {plan.fotoUrl && (
          <span className="flex items-center gap-0.5">
            <ImageIcon className="size-3" /> foto
          </span>
        )}
        {puedeEditar && (
          <span className="flex items-center gap-0.5 text-primary">
            <Pencil className="size-3" /> editar
          </span>
        )}
      </span>
    </button>
  )
}

function PlanDialog({
  item,
  ids,
  onClose,
}: {
  item: ChecklistItemNoOk
  /** Respuestas que cierra este plan: una sola, o toda la serie del foco. */
  ids: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const plan = item.plan
  const [tipo, setTipo] = useState<ChecklistPlanTipo>(plan?.tipo ?? "correctivo")
  const [estado, setEstado] = useState<ChecklistPlanEstado>(plan?.estado ?? "resuelto")
  const [descripcion, setDescripcion] = useState(plan?.descripcion ?? "")
  const [foto, setFoto] = useState<File | null>(null)
  const [eliminarFoto, setEliminarFoto] = useState(false)

  function guardar() {
    setError(null)
    if (!descripcion.trim()) {
      setError("Escribí qué se trabajó / reparó.")
      return
    }
    const fd = new FormData()
    fd.set("respuesta_id", item.id)
    fd.set("tipo", tipo)
    fd.set("estado", estado)
    fd.set("descripcion", descripcion.trim())
    // El resto de la serie recibe el mismo plan: es un defecto, no uno por día.
    const resto = ids.filter((id) => id !== item.id)
    if (resto.length > 0) fd.set("respuesta_ids_extra", resto.join(","))
    if (foto) fd.set("foto", foto)
    if (eliminarFoto) fd.set("eliminar_foto", "1")
    startTransition(async () => {
      const res = await upsertPlanChecklist(fd)
      if ("error" in res) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  function borrar() {
    if (!plan) return
    setError(null)
    startTransition(async () => {
      const res = await eliminarPlanChecklist(item.id)
      if ("error" in res) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  const fotoActual = plan?.fotoUrl && !eliminarFoto

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan de acción</DialogTitle>
          <DialogDescription>
            {item.dominio} · {item.item} · {fmtFecha(item.fecha)}
            {ids.length > 1 && (
              <span className="mt-1 block text-amber-600 dark:text-amber-400">
                Este plan se aplica a los {ids.length} checklists en los que se repitió el foco.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={(v: string | null) => v && setTipo(v as ChecklistPlanTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="correctivo">Correctivo</SelectItem>
                  <SelectItem value="preventivo">Preventivo</SelectItem>
                  <SelectItem value="proactivo">Proactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <Select value={estado} onValueChange={(v: string | null) => v && setEstado(v as ChecklistPlanEstado)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="en_proceso">En proceso</SelectItem>
                  <SelectItem value="resuelto">Resuelto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">¿Qué se trabajó / cómo se reparó?</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              placeholder="Describí la reparación realizada sobre este ítem…"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Foto de la reparación (opcional)</Label>
            {fotoActual ? (
              <div className="mt-1 flex items-center gap-3">
                <a
                  href={plan!.fotoUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ImageIcon className="size-4" /> Ver foto actual
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-destructive"
                  onClick={() => setEliminarFoto(true)}
                >
                  <Trash2 className="size-3.5" /> Quitar
                </Button>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              />
            )}
            {eliminarFoto && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Se quitará la foto actual al guardar.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setEliminarFoto(false)}
                >
                  Deshacer
                </button>
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {plan ? (
            <Button
              type="button"
              variant="ghost"
              className="gap-1 text-destructive hover:text-destructive"
              onClick={borrar}
              disabled={pending}
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={pending}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
