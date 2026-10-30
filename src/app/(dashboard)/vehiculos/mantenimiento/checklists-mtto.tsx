"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
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
  MessageSquareText,
  ShieldAlert,
  ClipboardCheck,
  Plus,
  Pencil,
  ImageIcon,
  Loader2,
  Trash2,
  Wrench,
  PlayCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts"
import type { VehiculoTipo } from "@/types/database"
import { usePaletaViz, type PaletaViz } from "./_components/paleta-viz"
import { DpoResponde, DpoSeccionCinta } from "./_components/dpo-badge"
import {
  FiltroPeriodo,
  dentroDe,
  etiquetaDe,
  hoyISO,
  periodoInicial,
  rangoDe,
  type PeriodoState,
} from "./_components/filtro-periodo"
import { ScrollX } from "./_components/scroll-x"
import { AdherenciaChecklistCard } from "./adherencia-checklist"
import { KpiCard } from "./_components/kpi-card"
import {
  crearOtProgramadaDesdePlan,
  eliminarItemChecklist,
  eliminarPlanChecklist,
  getOtsDeUnidad,
  getRepuestosPanol,
  marcarGestionEnCursoChecklist,
  upsertPlanChecklist,
  type ChecklistComentario,
  type ChecklistItemNoOk,
  type ChecklistPlanEstado,
  type ChecklistPlanTipo,
  type OtParaPlan,
  type RepuestoPanol,
} from "@/actions/mantenimiento-vehiculos"
import {
  CLASE_TIEMPO,
  colorTiempoRespuesta,
  textoMetaRespuesta,
  formatDuracion,
} from "@/lib/vehiculos/tiempo-resolucion"

function fmtFecha(f: string): string {
  return f.slice(0, 10).split("-").reverse().join("/")
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

/** "OT 1785 · 07/10 · programada" — misma etiqueta en la fila y en el selector. */
function otLabel(ot: {
  numeroOt: string | null
  fecha: string
  estado: string
  taller?: string | null
}): string {
  const estado = ot.estado === "en_taller" ? "en taller" : ot.estado
  return `OT ${ot.numeroOt ?? "s/n"} · ${fmtFecha(ot.fecha)} · ${estado}`
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
 * filas en julio y los frenos del HELI1, tres en tres días de octubre. Las
 * marcas se agrupan por EPISODIO —el problema, de la primera detección hasta
 * que hay prueba de que se fue (`lib/vehiculos/episodios-foco`)— para que el
 * listado muestre focos y no repeticiones, un solo plan cierre la serie y no
 * haya una segunda OT por el mismo defecto.
 */
interface GrupoFoco {
  clave: string
  /** El más viejo: desde cuándo viene la deuda. */
  origen: ChecklistItemNoOk
  /** El que lleva el plan (o el origen): es el que recibe la foto al editar. */
  principal: ChecklistItemNoOk
  /** Toda la serie, para cerrarla junta. */
  ids: string[]
  repeticiones: number
  ultimaFecha: string
  /** Estado de la gestión del episodio: el más avanzado de sus planes. */
  estadoGestion: ChecklistPlanEstado | null
  /** Desde cuándo quedó declarada en curso, para mostrarlo en la fila. */
  enCursoDesde: string | null
  /** La OT en la que se repara, si alguno de los reportes ya la tiene. */
  otId: string | null
}

function agruparFocos(items: ChecklistItemNoOk[]): GrupoFoco[] {
  const porClave = new Map<string, ChecklistItemNoOk[]>()
  for (const i of items) {
    // El episodio lo calcula el servidor sobre TODO el histórico, así que un
    // filtro de período no puede partir una serie en dos focos.
    const clave = i.episodioId || `${i.dominio}|${i.categoria}|${i.item}`
    const previos = porClave.get(clave)
    if (previos) previos.push(i)
    else porClave.set(clave, [i])
  }
  return Array.from(porClave, ([clave, filas]) => {
    const orden = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const origen = orden[0]
    const planes = orden.map((f) => f.plan).filter((p): p is NonNullable<typeof p> => !!p)
    const estadoGestion: ChecklistPlanEstado | null = planes.some((p) => p.estado === "resuelto")
      ? "resuelto"
      : planes.some((p) => p.estado === "en_proceso")
        ? "en_proceso"
        : planes.length > 0
          ? "pendiente"
          : null
    const enCurso = planes
      .filter((p) => p.estado === "en_proceso")
      .map((p) => p.createdAt)
      .sort()
    return {
      clave,
      origen,
      // La fila que se edita es la que ya lleva la gestión: la resuelta primero,
      // después la que está en curso, y si no hay ninguna, el primer reporte.
      principal:
        orden.find((f) => f.plan?.estado === "resuelto") ??
        orden.find((f) => f.plan?.estado === "en_proceso") ??
        orden.find((f) => f.plan) ??
        origen,
      ids: orden.map((f) => f.id),
      repeticiones: orden.length,
      ultimaFecha: orden[orden.length - 1].fecha,
      estadoGestion,
      enCursoDesde: enCurso[0] ?? null,
      otId: planes.map((p) => p.otId).find((id) => !!id) ?? null,
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
  // Un tiempo por episodio, el que calculó el servidor sobre el histórico
  // completo: el cierre vale venga del plan de mantenimiento o de la vuelta a OK
  // del chofer (dejar afuera los que nadie cerró en la app sesgaba el promedio
  // hacia los focos que alguien se acordó de cerrar).
  const porEpisodio = new Map<string, number>()
  for (const i of items) {
    if (i.horasEpisodio == null) continue
    porEpisodio.set(i.episodioId || i.id, i.horasEpisodio)
  }
  return Array.from(porEpisodio.values())
}

/**
 * Una fila por foco para las listas de KPI: el primer reporte del episodio, con
 * el plan que lleva la gestión y el tiempo medido de punta a punta (primera
 * detección → cierre), no el de la marca que casualmente tenga el plan cargado.
 */
function filaDeFoco(g: GrupoFoco): ChecklistItemNoOk {
  return {
    ...g.origen,
    plan: g.principal.plan,
    // El tiempo del episodio, no el de la marca que casualmente lleva el plan.
    horasResolucion: g.origen.horasEpisodio,
  }
}

/** Lista detrás de cada KPI de arriba: qué observaciones forman el número. */
const DETALLE_KPI: Record<
  "abiertos" | "criticos" | "con_plan" | "resueltos",
  { titulo: string; ayuda: string }
> = {
  abiertos: {
    titulo: "Observaciones sin resolver",
    ayuda:
      "Ítems no OK cuyo plan de acción todavía no está cerrado, de la más vieja a la más nueva. Incluye el arrastre de meses anteriores.",
  },
  criticos: {
    titulo: "Defectos críticos",
    ayuda: "Ítems marcados como críticos en el checklist: son los que sacan la unidad de ruta.",
  },
  con_plan: {
    titulo: "Observaciones con plan de acción",
    ayuda: "Las que tienen la reparación registrada, esté cerrada o en curso.",
  },
  resueltos: {
    titulo: "Observaciones ya resueltas",
    ayuda:
      "Las que cerraron el plan, de la que más tardó a la que menos. El promedio de la tarjeta se mide por defecto, así que una serie repetida cuenta una sola vez acá.",
  },
}

function DetalleKpiDialog({
  tipo,
  items,
  etiquetaPeriodo,
  onClose,
}: {
  tipo: keyof typeof DETALLE_KPI
  items: ChecklistItemNoOk[]
  etiquetaPeriodo: string
  onClose: () => void
}) {
  const cfg = DETALLE_KPI[tipo]
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {cfg.titulo} ({items.length})
          </DialogTitle>
          <DialogDescription>
            <span className="capitalize">{etiquetaPeriodo}</span> · {cfg.ayuda}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay observaciones en este corte.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Tiempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(i.fecha)}</TableCell>
                    <TableCell className="font-medium">{i.dominio}</TableCell>
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
                    <TableCell className="text-muted-foreground">
                      {i.plan
                        ? i.plan.estado === "resuelto"
                          ? "Resuelto"
                          : "En curso"
                        : "Sin plan"}
                      {/* Si derivó en OT, el N° va acá: es la constancia del arreglo. */}
                      {i.plan?.otNumero && (
                        <span className="block text-[11px] text-sky-700 dark:text-sky-400">
                          OT {i.plan.otNumero}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {i.horasResolucion != null ? formatDuracion(i.horasResolucion) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Botón de un click: «el plan de acción ya está en curso».
 *
 * Es la respuesta al defecto que tarda en resolverse. El chofer lo sigue
 * marcando todos los días y antes había que cargar un plan por reporte —y cada
 * fila ofrecía crear SU propia OT—. Acá se declara la gestión una vez, para todo
 * el episodio: el foco deja de pedir plan en cada checklist nuevo, el tiempo de
 * respuesta sigue siendo uno solo (corre desde la primera detección) y la OT,
 * si hay, es la misma para toda la serie.
 */
function BotonEnCurso({
  grupo,
  onListo,
}: {
  grupo: GrupoFoco
  onListo: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (grupo.estadoGestion === "resuelto") return null
  if (grupo.estadoGestion === "en_proceso") {
    return (
      <span className="flex flex-col text-[11px] text-amber-600 dark:text-amber-400">
        <span className="flex items-center gap-1 font-medium">
          <PlayCircle className="size-3" /> gestión en curso
        </span>
        {grupo.enCursoDesde && <span>declarada {fmtFecha(grupo.enCursoDesde)}</span>}
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 whitespace-nowrap text-xs"
        disabled={pending}
        title={
          grupo.repeticiones > 1
            ? `Marca la gestión en curso en los ${grupo.repeticiones} reportes de este defecto: no se abre un plan ni una OT por checklist`
            : "Marca que el plan de acción de este defecto ya está en curso"
        }
        onClick={() => {
          setError(null)
          setPending(true)
          marcarGestionEnCursoChecklist({ respuestaIds: grupo.ids }).then((res) => {
            setPending(false)
            if ("error" in res) {
              setError(res.error)
              return
            }
            onListo()
          })
        }}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <PlayCircle className="size-3.5" />
        )}
        Plan en curso
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  )
}

/**
 * Focos agrupados: una fila por problema, con desde cuándo viene y en cuántos
 * checklists se repitió. Se usa para el arrastre y para el período elegido.
 */
function TablaFocos({
  grupos,
  puedeEditar,
  ahoraMs,
  onEditarPlan,
  onEliminar,
  onRefrescar,
}: {
  grupos: GrupoFoco[]
  puedeEditar: boolean
  ahoraMs: number | null
  onEditarPlan: (g: GrupoFoco) => void
  onEliminar: (g: GrupoFoco) => void
  onRefrescar: () => void
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
            {puedeEditar && <TableHead>Gestión</TableHead>}
            <TableHead>Tiempo de respuesta</TableHead>
            {puedeEditar && <TableHead className="text-right">Eliminar</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map((g) => {
            const i = g.origen
            return (
              <TableRow key={g.clave}>
                <TableCell className="whitespace-nowrap">
                  <span className="flex flex-col">
                    {fmtFecha(i.fecha)}
                    {/* El episodio arrancó antes del período que se está
                        mirando: el foco no nació acá. */}
                    {i.repeticionDe && (
                      <span className="text-[11px] text-muted-foreground">
                        viene del {fmtFecha(i.repeticionDe)}
                      </span>
                    )}
                  </span>
                </TableCell>
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
                {puedeEditar && (
                  <TableCell className="min-w-32">
                    <BotonEnCurso grupo={g} onListo={onRefrescar} />
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap">
                  <TiempoRespuestaCell item={i} ahoraMs={ahoraMs} modo="foco" />
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

interface TajadaFoco {
  dominio: string
  focos: number
  abiertos: number
}

/**
 * Torta de focos de un tipo de unidad.
 *
 * 🚨 Camiones y autoelevadores van en tortas SEPARADAS a propósito: son dos
 * flotas con distinta cantidad de unidades y de checklists, y mezclarlas hacía
 * que dos autoelevadores se comieran la mitad del círculo frente a ocho
 * camiones. Cada torta responde "dentro de SU flota, quién concentra".
 */
function TortaFocos({
  titulo,
  datos,
  paleta,
}: {
  titulo: string
  datos: TajadaFoco[]
  paleta: PaletaViz
}) {
  const total = datos.reduce((a, d) => a + d.focos, 0)
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-1 flex items-baseline gap-2 text-sm font-medium">
        {titulo}
        <span className="text-xs font-normal text-muted-foreground">
          {total} {total === 1 ? "defecto" : "defectos"}
        </span>
      </p>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sin defectos en el período
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-52 min-w-[13rem] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={datos}
                  dataKey="focos"
                  nameKey="dominio"
                  innerRadius="45%"
                  outerRadius="80%"
                  paddingAngle={2}
                  isAnimationActive={false}
                  stroke="var(--color-card)"
                  strokeWidth={2}
                >
                  {datos.map((d, i) => (
                    <Cell key={d.dominio} fill={paleta.serie(i)} />
                  ))}
                </Pie>
                <RTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as TajadaFoco
                    return (
                      <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                        <p className="font-medium">{d.dominio}</p>
                        <p className="text-muted-foreground">
                          {d.focos} {d.focos === 1 ? "defecto" : "defectos"} ·{" "}
                          {Math.round((d.focos / total) * 100)}% ·{" "}
                          {d.abiertos} sin resolver
                        </p>
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* La referencia con el número al lado: la identidad nunca queda sólo
              en el color, y así se lee sin tener que apuntar con el mouse. */}
          <ul className="min-w-40 space-y-1 text-xs">
            {datos.map((d, i) => (
              <li key={d.dominio} className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: paleta.serie(i) }}
                />
                <span className="font-medium">{d.dominio}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {d.focos} · {Math.round((d.focos / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface Props {
  itemsNoOk: ChecklistItemNoOk[]
  comentarios: ChecklistComentario[]
  /** Flota con su tipo: separa la torta de camiones de la de autoelevadores. */
  unidades: Array<{ dominio: string; tipo: VehiculoTipo | null }>
  puedeEditar: boolean
}

export function ChecklistsMtto({
  itemsNoOk,
  comentarios,
  unidades,
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

  /**
   * Todos los reportes del episodio de una marca.
   *
   * El plan de acción y la OT son UNO para el problema entero, así que se buscan
   * sobre el histórico completo y no sobre el período filtrado: si no, cargar el
   * plan en noviembre dejaría abiertas las marcas de octubre del mismo defecto.
   */
  function idsDelEpisodio(i: ChecklistItemNoOk): string[] {
    const ep = i.episodioId || i.id
    const ids = itemsNoOk.filter((o) => (o.episodioId || o.id) === ep).map((o) => o.id)
    return ids.length > 0 ? ids : [i.id]
  }

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
  const grupos = useMemo(() => agruparFocos(arrastre), [arrastre])

  /**
   * Lo mismo para el período elegido: una fila por problema.
   *
   * 🚨 Antes esta tabla era una fila por checklist, y ahí estaba el nudo: el
   * defecto que tarda en resolverse aparecía todos los días pidiendo su propio
   * plan, su propia OT y mostrando su propio tiempo de respuesta. Agrupado por
   * episodio hay un foco, un plan, una OT y un tiempo. El detalle marca por
   * marca sigue a un click, para ver qué chofer lo reportó cada día.
   */
  const gruposPeriodo = useMemo(() => agruparFocos(items), [items])
  const [verDetalle, setVerDetalle] = useState(false)

  /**
   * Todo lo que se está viendo, agrupado por FOCO. Es la unidad de medida de la
   * pantalla entera: los KPI, las tortas por unidad y el tiempo de respuesta.
   *
   * Contando filas, los frenos del HELI1 reportados tres días daban 3 ítems no
   * OK, 3 críticos y 3 planes: el tablero exageraba la deuda y el chofer que
   * cumple reportándolo todos los días la inflaba más. Un episodio cuenta una
   * vez; su estado es el más avanzado de sus planes (si uno cerró, el foco
   * cerró).
   */
  const focosVisibles = useMemo(() => agruparFocos(visibles), [visibles])
  const criticos = focosVisibles.filter((g) => g.origen.critico).length
  const conPlan = focosVisibles.filter((g) => g.estadoGestion != null).length
  const abiertos = focosVisibles.filter((g) => g.estadoGestion !== "resuelto").length
  const enGestion = focosVisibles.filter((g) => g.estadoGestion === "en_proceso").length
  const totalFocos = focosVisibles.length

  const coments = useMemo(
    () => comentarios.filter((c) => coincide(c) && dentroDe(c.fecha, rango)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comentarios, fDominio, fTipo, rango]
  )

  // Por unidad: lo que sigue abierto contra lo que ya se cerró. Es la lectura
  // de gestión de esta pantalla —quién arrastra deuda— y no repite el corte
  // leve/crítico que ya muestra la pirámide.
  /**
   * Focos por unidad, contando PROBLEMAS y no marcas.
   *
   * 🚨 Un defecto que dura tres semanas lo vuelve a marcar el chofer en cada
   * checklist: la pérdida de fluidos del HELI1 dejó 23 filas. Contando fila por
   * fila, el HELI1 daba 26 focos contra 3 del HELI2 y se comía la torta entera
   * con UN problema. Se cuenta por EPISODIO, la misma unidad que usan el resto
   * de los números de la pantalla (`agruparFocos`) y el tiempo de respuesta.
   *
   * El mismo defecto que apareció en mayo, se arregló y volvió en octubre son
   * DOS episodios: uno cerrado y uno abierto. Eso es información —el defecto
   * reincidente— y no se tapa contándolo como uno.
   */
  const porUnidad = useMemo(() => {
    const m = new Map<string, { abiertos: number; resueltos: number }>()
    for (const g of focosVisibles) {
      const u = m.get(g.origen.dominio) ?? { abiertos: 0, resueltos: 0 }
      if (g.estadoGestion === "resuelto") u.resueltos++
      else u.abiertos++
      m.set(g.origen.dominio, u)
    }
    return Array.from(m.entries())
      .map(([dominio, v]) => ({ dominio, ...v, total: v.abiertos + v.resueltos }))
      .sort((a, b) => b.abiertos - a.abiertos || b.total - a.total)
  }, [focosVisibles])
  const paleta = usePaletaViz()
  const tipoPorDominio = useMemo(
    () => new Map(unidades.map((u) => [u.dominio, u.tipo])),
    [unidades]
  )
  const tortas = useMemo(() => {
    const armar = (ok: (t: VehiculoTipo | null) => boolean) =>
      porUnidad
        .filter((u) => ok(tipoPorDominio.get(u.dominio) ?? null))
        .map((u) => ({ dominio: u.dominio, focos: u.total, abiertos: u.abiertos }))
        .sort((a, b) => b.focos - a.focos)
    return {
      camiones: armar((t) => t === "camion"),
      autoelevadores: armar((t) => t === "autoelevador"),
      otras: armar((t) => t !== "camion" && t !== "autoelevador"),
    }
  }, [porUnidad, tipoPorDominio])

  /**
   * Los cinco KPI informaban un número y no había forma de ver QUÉ observación
   * lo formaba: las tablas de abajo listan sólo el período, sin el arrastre y
   * sin el corte de cada tarjeta. Cada una abre ahora su propia lista.
   */
  const [detalleKpi, setDetalleKpi] = useState<
    "abiertos" | "criticos" | "con_plan" | "resueltos" | null
  >(null)

  // Las listas de detalle van por foco, como los números de las tarjetas: si el
  // KPI dice 3 y la lista mostraba 5 filas, el número parece mentira.
  const detalleItems = useMemo(() => {
    const filas = focosVisibles.map(filaDeFoco)
    switch (detalleKpi) {
      case "abiertos":
        return filas
          .filter((i) => i.plan?.estado !== "resuelto")
          .sort((a, b) => a.fecha.localeCompare(b.fecha))
      case "criticos":
        return filas.filter((i) => i.critico).sort((a, b) => b.fecha.localeCompare(a.fecha))
      case "con_plan":
        return filas.filter((i) => i.plan).sort((a, b) => b.fecha.localeCompare(a.fecha))
      case "resueltos":
        // Los más lentos primero: son los que explican el promedio.
        return filas
          .filter((i) => i.plan?.estado === "resuelto")
          .sort((a, b) => (b.horasResolucion ?? 0) - (a.horasResolucion ?? 0))
      default:
        return []
    }
  }, [detalleKpi, focosVisibles])
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

      {/* KPIs — cada tarjeta abre la lista que hay detrás del número */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          onClick={() => setDetalleKpi("abiertos")}
          label="Defectos no OK"
          valor={
            <>
              {abiertos}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {totalFocos}
              </span>
            </>
          }
          estado={abiertos > 0 ? "alerta" : "ok"}
          dpo="1.3"
          sub={`Sin resolver, sobre ${totalFocos} defecto${
            totalFocos === 1 ? "" : "s"
          } ${historico ? "del histórico" : "en vista"}${
            enGestion > 0 ? ` · ${enGestion} con plan en curso` : ""
          }${
            visibles.length !== totalFocos
              ? ` · ${visibles.length} marcas de checklist`
              : ""
          } · click para verlos`}
        />
        <KpiCard
          onClick={() => setDetalleKpi("criticos")}
          label="Críticos no OK"
          valor={criticos}
          estado={criticos > 0 ? "critico" : "ok"}
          dpo="1.3"
          sub="Defectos críticos detectados · click para verlos"
        />
        <KpiCard
          onClick={() => setDetalleKpi("con_plan")}
          label="Con plan de acción"
          valor={
            <>
              {conPlan}
              {/* Sobre lo que se está viendo, igual que el resto de los KPI: el
                  numerador contaba el arrastre y el denominador no, así que
                  podía dar más planes que observaciones. */}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {totalFocos}
              </span>
            </>
          }
          estado="neutro"
          sub="Defectos con reparación registrada (cerrada o en curso) · click para verlos"
        />
        <KpiCard
          onClick={() => setDetalleKpi("resueltos")}
          label="Tiempo de respuesta"
          valor={
            <span className="text-2xl">{formatDuracion(horasProm)}</span>
          }
          estado={
            horasProm == null ? "neutro" : horasProm <= 72 ? "ok" : "alerta"
          }
          dpo="1.3"
          sub={`Promedio de ${duraciones.length} defecto${duraciones.length === 1 ? "" : "s"} resuelto${duraciones.length === 1 ? "" : "s"} (primera detección → cierre del plan) · click para verlos`}
        />
        <KpiCard
          onClick={() =>
            document
              .getElementById("comentarios-checklist")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          label="Con comentarios"
          valor={coments.length}
          estado="neutro"
          sub="Checklists con observaciones del chofer · click para leerlos"
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
              Defectos detectados por unidad
              <span className="text-sm font-normal text-muted-foreground">
                · {etiquetaPeriodo}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Cada defecto que el checklist marcó NO OK o regular, contado una sola vez
              por unidad: si el mismo ítem se vuelve a marcar todos los días hasta que
              se arregla, sigue siendo uno.
            </p>
          </CardHeader>
          <CardContent>
            {/* Dos tortas, una por flota: cuánto de los focos del período se lo
                lleva cada unidad. Antes era una barra apilada roja/azul donde el
                grueso de lo pintado eran focos YA resueltos. */}
            <div className="grid gap-3 lg:grid-cols-2">
              <TortaFocos titulo="Camiones" datos={tortas.camiones} paleta={paleta} />
              <TortaFocos
                titulo="Autoelevadores"
                datos={tortas.autoelevadores}
                paleta={paleta}
              />
            </div>
            {tortas.otras.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Fuera de las dos tortas:{" "}
                {tortas.otras.map((u) => `${u.dominio} (${u.focos})`).join(", ")} — no
                son camiones ni autoelevadores.
              </p>
            )}
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
            {items.length > 0 && (
              <Badge variant="outline" className="font-normal">
                {gruposPeriodo.length} defecto{gruposPeriodo.length === 1 ? "" : "s"}
                {items.length !== gruposPeriodo.length && <> · {items.length} marcas</>}
              </Badge>
            )}
            {/* Dos lecturas de lo mismo: la de gestión (un problema, una fila) y
                la cruda (qué chofer lo marcó cada día). Antes sólo existía la
                cruda, y un defecto que duraba una semana parecía siete. */}
            {items.length > 0 && (
              <span className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant={verDetalle ? "ghost" : "secondary"}
                  className="h-7 text-xs"
                  onClick={() => setVerDetalle(false)}
                >
                  Por defecto
                </Button>
                <Button
                  size="sm"
                  variant={verDetalle ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setVerDetalle(true)}
                >
                  Checklist por checklist
                </Button>
              </span>
            )}
          </CardTitle>
          {!verDetalle && items.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Una fila por defecto: si el chofer lo vuelve a marcar todos los días hasta
              que se resuelve, sigue siendo uno. «Plan en curso» declara la gestión de
              toda la serie de una vez —no se abre un plan ni una OT por checklist— y el
              tiempo de respuesta corre desde la primera detección.
            </p>
          )}
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
          ) : verDetalle ? (
            <TablaItemsNoOk
              items={items}
              puedeEditar={puedeEditar}
              ahoraMs={ahoraMs}
              // 🚨 Desde una marca suelta el plan se carga para TODO el episodio:
              // si fuera sólo para esa fila, el mismo defecto quedaría pidiendo
              // plan en cada checklist siguiente (y habilitando otra OT).
              onEditarPlan={(i) =>
                setPlanTarget({
                  item: i,
                  ids: idsDelEpisodio(i),
                })
              }
              onEliminar={(i) => pedirBorrado([i])}
            />
          ) : (
            <TablaFocos
              grupos={gruposPeriodo}
              puedeEditar={puedeEditar}
              ahoraMs={ahoraMs}
              onEditarPlan={(g) => setPlanTarget({ item: g.principal, ids: g.ids })}
              onEliminar={(g) =>
                pedirBorrado(
                  items
                    .filter((i) => g.ids.includes(i.id))
                    .sort((a, b) => a.fecha.localeCompare(b.fecha))
                )
              }
              onRefrescar={() => router.refresh()}
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
              Defectos anteriores al período elegido que todavía no tienen el plan de acción cerrado.
              Siguen acá hasta que se resuelvan. Un mismo defecto se cuenta{" "}
              <strong>una vez</strong>: la columna «Se repitió» dice en cuántos checklists volvió
              a aparecer{arrastre.length !== grupos.length && <> ({arrastre.length} en total)</>}, y
              el plan de acción cierra toda la serie de una.
            </p>
          </CardHeader>
          <CardContent>
            <TablaFocos
              grupos={grupos}
              puedeEditar={puedeEditar}
              ahoraMs={ahoraMs}
              onRefrescar={() => router.refresh()}
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
      <Card id="comentarios-checklist">
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

      {detalleKpi && (
        <DetalleKpiDialog
          tipo={detalleKpi}
          items={detalleItems}
          etiquetaPeriodo={etiquetaPeriodo}
          onClose={() => setDetalleKpi(null)}
        />
      )}

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

      {/* La cobertura del CIL, las tareas CIL/ATO y los artículos de limpieza
          se fueron a la solapa CIL: son mantenimiento autónomo (DPO 4.1), no
          verificación previa a la salida. Ver `cil.tsx`. */}
    </div>
  )
}

/**
 * Tiempo de respuesta del foco. **UNO por problema**, no uno por marca.
 *
 *  1. **El problema cerró** → de la primera detección al cierre, lo haya cerrado
 *     el plan de mantenimiento o la vuelta a OK que carga el chofer. Sin el
 *     segundo caso, un foco que nadie cerró en la app figuraba "abierto hace 64
 *     días" aunque el checklist siguiente ya lo mostrara en OK: el número no
 *     medía el defecto, medía el olvido de cargar el plan. Se avisa "sin plan
 *     cargado" porque eso sigue faltando.
 *  2. **Sigue abierto** → cuánto lleva desde la primera detección, que es lo que
 *     corre; y si la gestión ya está declarada en curso, lo dice.
 *
 * En la vista marca por marca, las repeticiones no repiten el número: el tiempo
 * es el del problema y está en su primer reporte. Mostrarlo en cada fila pintaba
 * catorce focos rojos de días cada uno donde hubo uno solo.
 */
function TiempoRespuestaCell({
  item,
  ahoraMs,
  modo = "marca",
}: {
  item: ChecklistItemNoOk
  ahoraMs: number | null
  /** "foco" = la fila YA es el problema entero (tabla agrupada). */
  modo?: "foco" | "marca"
}) {
  if (modo === "marca" && item.repeticionDe) {
    return (
      <span className="flex flex-col">
        <span className="text-sm text-muted-foreground">repetición</span>
        <span className="text-[11px] text-muted-foreground">
          mismo foco del {fmtFecha(item.repeticionDe)} · ya contado ahí
        </span>
      </span>
    )
  }
  // 1-2. El problema cerró: el número es el del EPISODIO, de la primera
  //      detección al cierre, lo haya cerrado el plan o la vuelta a OK.
  //      🚨 Una sola lectura OK que al rato se desdice no cierra nada: eso lo
  //      resuelve `lib/vehiculos/episodios-foco`, no esta celda.
  if (item.episodioCierre && item.horasEpisodio != null) {
    const color = colorTiempoRespuesta(item.horasEpisodio, item.critico)
    return (
      <span className="flex flex-col" title={textoMetaRespuesta(item.critico)}>
        <span className={cn("text-sm font-semibold", CLASE_TIEMPO[color])}>
          {formatDuracion(item.horasEpisodio)}
        </span>
        {/* El número solo no dice nada: al lado va contra qué plazo se lee. */}
        {item.episodioCierreFirme ? (
          <span className="text-[11px] text-muted-foreground">
            {textoMetaRespuesta(item.critico)} · resuelto{" "}
            {fmtFechaHora(item.episodioCierre)}
          </span>
        ) : (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            volvió a OK {fmtFechaHora(item.episodioCierre)} · sin plan cargado
          </span>
        )}
      </span>
    )
  }
  // Lo que corre se mide desde la PRIMERA detección del problema: si se contara
  // desde esta marca, el defecto arrastrado desde hace tres semanas aparecería
  // "abierto hace 4 h" cada vez que el chofer lo vuelve a reportar.
  const desde = item.episodioHora ?? item.hora
  const abiertoHace =
    desde && ahoraMs != null ? (ahoraMs - new Date(desde).getTime()) / 3_600_000 : null
  if (abiertoHace == null || abiertoHace < 0)
    return <span className="text-muted-foreground/50">—</span>
  // El reloj sigue corriendo aunque la gestión esté en curso —el tiempo de
  // respuesta se cierra cuando el defecto se va, no cuando se avisa que se está
  // atendiendo—, pero la fila dice que ya hay alguien atrás: un defecto en
  // gestión y un defecto sin mirar no son lo mismo.
  const enCurso = item.plan?.estado === "en_proceso"
  return (
    <span className="flex flex-col" title={textoMetaRespuesta(item.critico)}>
      <span
        className={cn(
          "text-sm",
          enCurso
            ? "font-semibold text-amber-600 dark:text-amber-400"
            : "text-muted-foreground"
        )}
      >
        {formatDuracion(abiertoHace)}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {enCurso ? "en gestión, desde la 1ª detección" : "sin resolver"}
      </span>
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
    // Repetición de un defecto que ya tiene su episodio abierto: no pide un plan
    // propio. Antes cada día ofrecía "Agregar" y por ahí se cargaba un plan —y a
    // veces una OT— por checklist para el mismo desperfecto.
    if (item.repeticionDe) {
      return (
        <button
          type="button"
          onClick={onEditar}
          className="flex w-full flex-col items-start rounded-md p-1 text-left hover:bg-muted"
          title="Abre el plan del defecto: es uno para toda la serie"
        >
          <span className="text-xs text-muted-foreground">
            ya reportado el {fmtFecha(item.repeticionDe)}
          </span>
          <span className="text-[11px] text-primary">ver el plan del defecto</span>
        </button>
      )
    }
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
      {/* La OT en la que se repara: último tramo de la cadena del rechazo. */}
      {plan.otId && (
        <span className="flex items-center gap-1 text-[11px] font-medium text-sky-700 dark:text-sky-400">
          <Wrench className="size-3" />
          {otLabel({
            numeroOt: plan.otNumero,
            fecha: plan.otFecha ?? "",
            estado: plan.otEstado ?? "",
          })}
        </span>
      )}
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
  const [repuestos, setRepuestos] = useState<RepuestoPanol[]>([])
  const [repuestoId, setRepuestoId] = useState<string>(plan?.repuestoId ?? "")
  const [repuestoCantidad, setRepuestoCantidad] = useState<string>(
    plan?.repuestoCantidad != null ? String(plan.repuestoCantidad) : "1"
  )
  // El descuento ya se hizo: el selector queda a la vista pero bloqueado, para
  // que se entienda que el stock ya bajó y que volver a guardar no lo baja otra vez.
  const yaDescontado = Boolean(plan?.movimientoId)
  // OT en la que se repara el defecto, cuando es más grave que un foco o un relay.
  const [ots, setOts] = useState<OtParaPlan[]>([])
  const [otId, setOtId] = useState<string>(plan?.otId ?? "")
  const [nuevaOt, setNuevaOt] = useState(false)
  const [otFecha, setOtFecha] = useState<string>(hoyISO())
  const [otTaller, setOtTaller] = useState("")
  const [creandoOt, setCreandoOt] = useState(false)
  const [otAviso, setOtAviso] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getRepuestosPanol().then((res) => {
      if (vivo && "data" in res) setRepuestos(res.data)
    })
    getOtsDeUnidad(item.dominio).then((res) => {
      if (vivo && "data" in res) setOts(res.data)
    })
    return () => {
      vivo = false
    }
  }, [item.dominio])

  /**
   * Crea la OT programada y la deja vinculada al foco en el momento.
   *
   * El vínculo lo escribe el servidor: si quedara sólo en el formulario, cerrar
   * el diálogo sin guardar dejaría una OT programada suelta sin ningún foco que
   * explique por qué existe.
   */
  function crearOt() {
    setError(null)
    setCreandoOt(true)
    crearOtProgramadaDesdePlan({
      respuestaIds: ids,
      fecha: otFecha,
      taller: otTaller.trim() || undefined,
      descripcion: item.item,
    }).then((res) => {
      setCreandoOt(false)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setOts((prev) => [res.data, ...prev])
      setOtId(res.data.id)
      setNuevaOt(false)
      setOtAviso(`${otLabel(res.data)} creada`)
      router.refresh()
    })
  }

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
    // Siempre, incluso vacío: así quitar la OT del plan también se guarda.
    fd.set("ot_id", otId)
    if (repuestoId) {
      fd.set("repuesto_id", repuestoId)
      fd.set("repuesto_cantidad", repuestoCantidad || "1")
    }
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
                Este plan se aplica a los {ids.length} checklists en los que se repitió el defecto.
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

          {/*
            OT asociada. Un foco o un relay se cambia en el momento y se cierra
            acá; cuando el defecto es más grave que eso, la reparación hay que
            programarla, y esa OT es la que cuenta el arreglo. Sin este campo la
            relación existía sólo si alguien la escribía en el texto del plan.
          */}
          <div className="rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                ¿Deriva en una OT? (opcional)
              </Label>
              <DpoResponde puntos={["1.3", "2.4"]} requisitos={["R1.3.7"]} />
            </div>
            <Select
              value={otId || "ninguna"}
              onValueChange={(v: string | null) => {
                setOtAviso(null)
                setOtId(!v || v === "ninguna" ? "" : v)
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Se resolvió sin OT" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Se resolvió sin OT</SelectItem>
                {ots.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {otLabel(o)}
                    {o.taller ? ` · ${o.taller}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {nuevaOt ? (
              <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">
                  Se crea una OT <strong>correctiva programada</strong> del {item.dominio} por
                  “{item.item}”, y queda vinculada a este foco.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      ¿Para cuándo?
                    </Label>
                    <Input
                      type="date"
                      value={otFecha}
                      onChange={(e) => setOtFecha(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Taller (opcional)
                    </Label>
                    <Input
                      value={otTaller}
                      onChange={(e) => setOtTaller(e.target.value)}
                      placeholder="Quién la hace"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={crearOt}
                    disabled={creandoOt || !otFecha}
                  >
                    {creandoOt && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                    Crear OT programada
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setNuevaOt(false)}
                    disabled={creandoOt}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : otId ? (
              /* Candado contra la OT duplicada: mientras este defecto tenga una
                 orden vinculada, no se ofrece crear otra. El chofer lo sigue
                 marcando todos los días y cada marca abría este mismo diálogo:
                 de ahí salían dos órdenes para una sola reparación. Para
                 programar otra hay que desvincular la actual a mano. */
              <p className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                <Wrench className="mt-0.5 size-3.5 shrink-0 text-sky-700 dark:text-sky-400" />
                <span>
                  Este defecto ya se repara en la OT vinculada arriba
                  {ids.length > 1 && <> (la misma para los {ids.length} reportes)</>}. No
                  hace falta otra: si la reparación cambió de orden, elegí
                  «Se resolvió sin OT» y volvé a vincular.
                </span>
              </p>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 h-7 gap-1 text-xs"
                onClick={() => setNuevaOt(true)}
              >
                <Plus className="size-3.5" /> Crear OT programada
              </Button>
            )}

            <p className="mt-1.5 text-xs text-muted-foreground">
              {otAviso ??
                "Un foco o un relay se cambia acá mismo y no lleva OT. Si el defecto es más grave, programá la reparación."}
            </p>
          </div>

          {/*
            Repuesto del pañol. Acá no se hace mantenimiento propio salvo cambiar
            un foco, una mica o un destellador, y eso nunca pasa por una OT: pasa
            por este plan. Al cerrarlo con un repuesto elegido, el egreso se
            registra solo y el stock baja, en vez de descontarse a mano aparte.
          */}
          <div className="rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                ¿Se usó algo del pañol? (opcional)
              </Label>
              <DpoResponde puntos={["2.3"]} requisitos={["R2.3.2"]} />
            </div>
            <div className="mt-1 grid grid-cols-[1fr_5rem] gap-2">
              <Select
                value={repuestoId || "ninguno"}
                onValueChange={(v: string | null) =>
                  setRepuestoId(!v || v === "ninguno" ? "" : v)
                }
                disabled={yaDescontado}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No salió nada del pañol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">No salió nada del pañol</SelectItem>
                  {repuestos.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre} · quedan {r.stock}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                step={1}
                value={repuestoCantidad}
                onChange={(e) => setRepuestoCantidad(e.target.value)}
                disabled={yaDescontado || !repuestoId}
                aria-label="Cantidad"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {yaDescontado
                ? "Ya descontado del pañol. Para corregirlo, ajustá el stock desde Repuestos."
                : estado === "resuelto"
                  ? "Al guardar como resuelto, el stock del pañol baja solo."
                  : "El stock baja recién cuando el plan pase a resuelto."}
            </p>
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
