"use client"

// Evolución del plan preventivo a partir de los correctivos recurrentes
// (DPO Flota, R2.2.6). Vive al pie de la solapa Plan / Plantillas.
//
// Tres bloques, en el orden en que los lee el auditor:
//  1. CORRECTIVOS RECURRENTES: qué se repite (por sistema del vehículo), en
//     cuántas unidades, cuánto costó y cuántos días dejó la unidad parada, y
//     si el plan ya tiene una tarea que debería estar previniéndolo. Desde la
//     fila se lleva el sistema al plan: la tarea nueva (o el ajuste de la que
//     ya existe) nace con el motivo redactado y las OT vinculadas.
//  2. EVOLUCIÓN DEL PLAN: cada cambio del plan con su motivo, su origen y las
//     OT que lo justifican. Los cambios sin motivo —la carga masiva de jul–sep
//     2026— quedan agrupados por día y plegados: se los puede explicar después.
//  3. EFECTO: debajo de cada evolución, los correctivos del sistema en los 6
//     meses anteriores y posteriores al cambio. Es la tendencia que pide la
//     guía del punto ("mejora en los últimos 3 meses").
//
// Las OT sin sistema cargado se clasifican por texto y se marcan con «~»:
// el análisis sirve desde el primer día, pero la clasificación confirmada
// vale más, por eso el selector de sistema está en la OT.

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  History,
  MessageSquarePlus,
  Plus,
  Repeat,
  SlidersHorizontal,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { explicarCambioPlan } from "@/actions/mantenimiento-vehiculos"
import type {
  AnalisisRecurrencia,
  EvolucionPlan as Evolucion,
  RecurrenciaSistema,
} from "@/lib/flota/recurrencia-correctivos"
import { redactarMotivo } from "@/lib/flota/recurrencia-correctivos"
import { MESES_RECURRENCIA, SISTEMA_POR_ID, UMBRAL_RECURRENTE_FLOTA, UMBRAL_RECURRENTE_UNIDAD } from "@/lib/flota/sistemas-ot"
import type {
  MantenimientoCategoria,
  MantenimientoPlanTarea,
  MantenimientoSistema,
  PlanEvolucionOrigen,
  VehiculoTipo,
} from "@/types/database"
import { PLAN_EVOLUCION_ORIGEN_LABELS } from "@/types/database"
import { fmtMoneyOt } from "./ot-formato"

/** Lo que el diálogo de tarea del plan recibe prellenado desde acá. */
export interface TareaPlanPrefill {
  nombre?: string
  categoria?: MantenimientoCategoria
  tipoVehiculo?: VehiculoTipo
  motivo: string
  origen: PlanEvolucionOrigen
  otIds: string[]
  sistema: MantenimientoSistema
}

export type AnalisisRecurrenciaProps = AnalisisRecurrencia & { sqlPendiente: boolean }

const ORIGEN_BADGE: Record<PlanEvolucionOrigen, string> = {
  correctivo_recurrente: "border-orange-200 bg-orange-50 text-orange-800",
  fabricante: "border-sky-200 bg-sky-50 text-sky-800",
  auditoria: "border-violet-200 bg-violet-50 text-violet-800",
  checklist: "border-emerald-200 bg-emerald-50 text-emerald-800",
  otro: "border-slate-200 bg-slate-50 text-slate-700",
}

const ACCION_LABEL: Record<Evolucion["accion"], string> = {
  alta: "Alta",
  cambio: "Cambio",
  baja: "Baja",
}

const fmtFecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")

export function EvolucionPlanPanel({
  analisis,
  tareas,
  puedeEditar,
  onLlevarAlPlan,
  onAjustarTarea,
  onRefresh,
}: {
  analisis: AnalisisRecurrenciaProps
  tareas: MantenimientoPlanTarea[]
  puedeEditar: boolean
  /** Abre el diálogo de tarea nueva con el prefill. */
  onLlevarAlPlan: (prefill: TareaPlanPrefill) => void
  /** Abre la edición de una tarea existente con el motivo prellenado. */
  onAjustarTarea: (tarea: MantenimientoPlanTarea, prefill: TareaPlanPrefill) => void
  onRefresh: () => void
}) {
  const tareasById = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas])
  const otsPorId = useMemo(() => {
    const m = new Map<string, RecurrenciaSistema["ots"][number]>()
    for (const s of analisis.sistemas) for (const o of s.ots) m.set(o.id, o)
    return m
  }, [analisis.sistemas])
  const { resumen } = analisis

  return (
    <div className="space-y-6">
      {analisis.sqlPendiente && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Falta aplicar <code className="font-mono text-xs">APLICAR_EN_PAMPEANA_PLAN_MP_EVOLUCION.sql</code>: el
            análisis se muestra igual, pero los motivos de los cambios del plan y el sistema de cada OT
            todavía no se pueden guardar.
          </span>
        </div>
      )}

      <RecurrenciaCard analisis={analisis} puedeEditar={puedeEditar} tareasById={tareasById} onLlevarAlPlan={onLlevarAlPlan} onAjustarTarea={onAjustarTarea} />

      <EvolucionCard
        evoluciones={analisis.evoluciones}
        resumen={resumen}
        puedeEditar={puedeEditar}
        sqlPendiente={analisis.sqlPendiente}
        otsPorId={otsPorId}
        onRefresh={onRefresh}
      />
    </div>
  )
}

// ==================== Bloque 1: correctivos recurrentes ====================

function RecurrenciaCard({
  analisis,
  puedeEditar,
  tareasById,
  onLlevarAlPlan,
  onAjustarTarea,
}: {
  analisis: AnalisisRecurrenciaProps
  puedeEditar: boolean
  tareasById: Map<string, MantenimientoPlanTarea>
  onLlevarAlPlan: (prefill: TareaPlanPrefill) => void
  onAjustarTarea: (tarea: MantenimientoPlanTarea, prefill: TareaPlanPrefill) => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const conOts = analisis.sistemas.filter((s) => s.n > 0)

  const prefillAlta = (s: RecurrenciaSistema): TareaPlanPrefill => {
    const cat = SISTEMA_POR_ID.get(s.sistema)
    // Tipo de unidad más frecuente entre las OT del sistema: casi siempre camión.
    const tipo: VehiculoTipo = s.ots.some((o) => /^HELI/i.test(o.dominio)) && !s.ots.some((o) => !/^HELI/i.test(o.dominio))
      ? "autoelevador"
      : "camion"
    return {
      categoria: cat?.categoria ?? "general",
      tipoVehiculo: tipo,
      motivo: redactarMotivo(s, "alta"),
      origen: "correctivo_recurrente",
      otIds: s.ots.map((o) => o.id),
      sistema: s.sistema,
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="size-4 text-orange-600" /> Correctivos recurrentes
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              OT correctivas de los últimos {MESES_RECURRENCIA} meses ({fmtFecha(analisis.desde)} →{" "}
              {fmtFecha(analisis.hasta)}) agrupadas por sistema del vehículo. Es recurrente con{" "}
              {UMBRAL_RECURRENTE_FLOTA} o más OT en la flota, o {UMBRAL_RECURRENTE_UNIDAD} en la misma unidad. Lo
              que se repite y el plan no cubre es lo que el R2.2.6 pide llevar al preventivo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{analisis.resumen.correctivas} OT correctivas</Badge>
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-800">
              {analisis.resumen.sistemasRecurrentes} sistemas recurrentes
            </Badge>
            {analisis.resumen.sinClasificar > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                ~ {analisis.resumen.sinClasificar} clasificadas por texto
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {conOts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay OT correctivas en la ventana.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Sistema</TableHead>
                <TableHead className="text-right">OT</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-right">Días parado</TableHead>
                <TableHead>Lo cubre el plan</TableHead>
                <TableHead>Última evolución</TableHead>
                {puedeEditar && <TableHead className="w-48" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {conOts.map((s) => {
                const exp = abierto === s.sistema
                const tareasCamion = s.tareasPlan.filter((t) => t.tipoVehiculo === "camion")
                const ultima = s.evoluciones.find((e) => e.motivo) ?? s.evoluciones[0]
                return (
                  <FilaSistema
                    key={s.sistema}
                    s={s}
                    expandido={exp}
                    onToggle={() => setAbierto(exp ? null : s.sistema)}
                    tareasCamion={tareasCamion}
                    ultima={ultima}
                    puedeEditar={puedeEditar}
                    onAlta={() => onLlevarAlPlan(prefillAlta(s))}
                    onAjuste={(tareaId) => {
                      const t = tareasById.get(tareaId)
                      if (!t) return
                      onAjustarTarea(t, {
                        motivo: redactarMotivo(s, "ajuste", t.nombre),
                        origen: "correctivo_recurrente",
                        otIds: s.ots.map((o) => o.id),
                        sistema: s.sistema,
                      })
                    }}
                  />
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function FilaSistema({
  s,
  expandido,
  onToggle,
  tareasCamion,
  ultima,
  puedeEditar,
  onAlta,
  onAjuste,
}: {
  s: RecurrenciaSistema
  expandido: boolean
  onToggle: () => void
  tareasCamion: RecurrenciaSistema["tareasPlan"]
  ultima: Evolucion | undefined
  puedeEditar: boolean
  onAlta: () => void
  onAjuste: (tareaId: string) => void
}) {
  const cubre = tareasCamion.length > 0 ? tareasCamion : s.tareasPlan
  return (
    <>
      <TableRow className={cn("cursor-pointer", s.recurrente && "bg-orange-50/40")} onClick={onToggle}>
        <TableCell className="pr-0 text-muted-foreground">
          {expandido ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex flex-wrap items-center gap-2">
            {s.label}
            {s.recurrente && (
              <Badge variant="outline" className="border-orange-300 bg-orange-100 text-orange-900">
                Recurrente
              </Badge>
            )}
          </div>
          {s.unidadesRepetidas.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Repite en {s.unidadesRepetidas.map((u) => `${u.dominio} ×${u.n}`).join(", ")}
            </p>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium">{s.n}</TableCell>
        <TableCell className="text-right tabular-nums">{s.unidades.length}</TableCell>
        <TableCell className="text-right tabular-nums">{fmtMoneyOt(s.costo)}</TableCell>
        <TableCell className="text-right tabular-nums">{s.diasParado}</TableCell>
        <TableCell className="text-xs">
          {cubre.length === 0 ? (
            <span className="text-red-700">Ninguna tarea del plan</span>
          ) : (
            <span className="text-muted-foreground">
              {cubre.slice(0, 2).map((t) => `${t.nombre} (${t.frecuencia})`).join(" · ")}
              {cubre.length > 2 && ` y ${cubre.length - 2} más`}
            </span>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {ultima ? (
            <>
              {fmtFecha(ultima.fecha)} · {ultima.tareaNombre}
              {ultima.motivo ? "" : " (sin motivo)"}
            </>
          ) : (
            "—"
          )}
        </TableCell>
        {puedeEditar && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" className="h-7 justify-start text-xs" onClick={onAlta}>
                <Plus className="mr-1 size-3.5" /> Llevar al plan
              </Button>
              {cubre.length > 0 && (
                <Select onValueChange={(v) => v && v !== "none" && onAjuste(v)} value="none">
                  <SelectTrigger className="h-7 text-xs">
                    <SlidersHorizontal className="mr-1 size-3.5" />
                    <SelectValue placeholder="Ajustar tarea…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ajustar tarea existente…</SelectItem>
                    {cubre.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre} · {t.frecuencia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </TableCell>
        )}
      </TableRow>
      {expandido && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={puedeEditar ? 9 : 8} className="p-0">
            <div className="px-6 py-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Fecha</TableHead>
                    <TableHead className="w-24">Unidad</TableHead>
                    <TableHead className="w-16">OT</TableHead>
                    <TableHead>Trabajo</TableHead>
                    <TableHead>Taller</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Parado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.ots.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="tabular-nums">{fmtFecha(o.fecha)}</TableCell>
                      <TableCell className="font-medium">{o.dominio}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{o.numeroOt ?? "—"}</TableCell>
                      <TableCell className="max-w-md text-xs">
                        {o.sugerido && (
                          <span className="mr-1 text-muted-foreground" title="Sistema deducido del texto: confirmalo en la OT">
                            ~
                          </span>
                        )}
                        {o.descripcion}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{o.taller ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoneyOt(o.costo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.diasParado > 0 ? `${o.diasParado} d` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {s.evoluciones.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cambios del plan atribuidos a este sistema: {s.evoluciones.length}
                  {s.evoluciones.some((e) => e.motivo) ? "" : " (ninguno con motivo todavía)"}.
                </p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ==================== Bloque 2 y 3: evolución del plan + efecto ====================

function EvolucionCard({
  evoluciones,
  resumen,
  puedeEditar,
  sqlPendiente,
  otsPorId,
  onRefresh,
}: {
  evoluciones: Evolucion[]
  resumen: AnalisisRecurrencia["resumen"]
  puedeEditar: boolean
  sqlPendiente: boolean
  otsPorId: Map<string, RecurrenciaSistema["ots"][number]>
  onRefresh: () => void
}) {
  const [soloConMotivo, setSoloConMotivo] = useState(false)
  const [diasAbiertos, setDiasAbiertos] = useState<Set<string>>(new Set())
  const [explicar, setExplicar] = useState<Evolucion | null>(null)

  // Con motivo: una fila cada una. Sin motivo: agrupadas por día, plegadas.
  const { conMotivo, sinMotivoPorDia } = useMemo(() => {
    const conMotivo = evoluciones.filter((e) => e.motivo)
    const grupos = new Map<string, Evolucion[]>()
    for (const e of evoluciones) {
      if (e.motivo) continue
      const arr = grupos.get(e.fecha) ?? []
      arr.push(e)
      grupos.set(e.fecha, arr)
    }
    return {
      conMotivo,
      sinMotivoPorDia: [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    }
  }, [evoluciones])

  const toggleDia = (d: string) =>
    setDiasAbiertos((prev) => {
      const n = new Set(prev)
      if (n.has(d)) n.delete(d)
      else n.add(d)
      return n
    })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-violet-600" /> Evolución del plan preventivo
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada alta, cambio o baja de una tarea del plan, con su motivo y las OT que lo justifican.
              Debajo de cada cambio con sistema va el efecto: correctivos de ese sistema en los 6 meses
              anteriores y posteriores.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">{resumen.cambios} cambios</Badge>
            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">
              {resumen.conMotivo} con motivo
            </Badge>
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-800">
              {resumen.deCorrectivos} nacidos de correctivos
            </Badge>
            <label className="ml-2 flex items-center gap-1.5">
              <Checkbox checked={soloConMotivo} onCheckedChange={(c) => setSoloConMotivo(c === true)} />
              Solo con motivo
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {evoluciones.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">El plan todavía no registra cambios.</p>
        )}

        {conMotivo.map((e) => (
          <FilaEvolucion key={e.id} e={e} otsPorId={otsPorId} puedeEditar={puedeEditar} onExplicar={() => setExplicar(e)} />
        ))}

        {!soloConMotivo &&
          sinMotivoPorDia.map(([dia, items]) => {
            const abierto = diasAbiertos.has(dia)
            return (
              <div key={dia} className="rounded-md border border-dashed">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  onClick={() => toggleDia(dia)}
                >
                  {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <span className="tabular-nums">{fmtFecha(dia)}</span>
                  <span className="text-muted-foreground">
                    {items.length} cambio{items.length === 1 ? "" : "s"} sin motivo
                    {items[0]?.autor ? ` · ${items[0].autor}` : ""}
                  </span>
                </button>
                {abierto && (
                  <div className="space-y-1 border-t px-3 py-2">
                    {items.map((e) => (
                      <FilaEvolucion key={e.id} e={e} otsPorId={otsPorId} puedeEditar={puedeEditar} compacta onExplicar={() => setExplicar(e)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
      </CardContent>

      {explicar && (
        <ExplicarDialog
          e={explicar}
          sqlPendiente={sqlPendiente}
          onClose={() => setExplicar(null)}
          onSaved={() => {
            setExplicar(null)
            onRefresh()
          }}
        />
      )}
    </Card>
  )
}

function FilaEvolucion({
  e,
  otsPorId,
  puedeEditar,
  compacta,
  onExplicar,
}: {
  e: Evolucion
  otsPorId: Map<string, RecurrenciaSistema["ots"][number]>
  puedeEditar: boolean
  compacta?: boolean
  onExplicar: () => void
}) {
  const sistemaLabel = e.sistema ? SISTEMA_POR_ID.get(e.sistema)?.label : null
  return (
    <div className={cn("rounded-md border p-3", compacta && "border-0 bg-muted/30 py-2", e.motivo && "border-violet-200")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="tabular-nums text-muted-foreground">{fmtFecha(e.fecha)}</span>
            <Badge variant="outline" className="text-xs">
              {ACCION_LABEL[e.accion]}
            </Badge>
            <span className="font-medium">{e.tareaNombre}</span>
            {e.tipoVehiculo && <span className="text-xs text-muted-foreground">({e.tipoVehiculo})</span>}
            {e.origen && (
              <Badge variant="outline" className={cn("text-xs", ORIGEN_BADGE[e.origen])}>
                {PLAN_EVOLUCION_ORIGEN_LABELS[e.origen]}
              </Badge>
            )}
            {sistemaLabel && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {sistemaLabel}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{e.cambio}{e.autor ? ` · ${e.autor}` : ""}</p>
          {e.motivo && <p className="mt-1.5 text-sm">{e.motivo}</p>}
          {e.otIds.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              OT vinculadas ({e.otIds.length}):{" "}
              {e.otIds
                .slice(0, 10)
                .map((id) => {
                  const o = otsPorId.get(id)
                  return o ? `${o.numeroOt ? `OT ${o.numeroOt} ` : ""}${o.dominio} ${fmtFecha(o.fecha)}` : null
                })
                .filter(Boolean)
                .join(" · ")}
              {e.otIds.length > 10 && ` y ${e.otIds.length - 10} más`}
            </p>
          )}
          {e.efecto && e.sistema && (e.motivo || e.efecto.antes > 0 || e.efecto.despues > 0) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Efecto en {sistemaLabel?.toLowerCase()}:</span>
              <Badge variant="outline" className="tabular-nums">
                antes {e.efecto.antes} OT / {e.efecto.meses} m
              </Badge>
              <ArrowRight className="size-3 text-muted-foreground" />
              <Badge
                variant="outline"
                className={cn(
                  "tabular-nums",
                  e.efecto.despues < e.efecto.antes && "border-emerald-200 bg-emerald-50 text-emerald-800",
                  e.efecto.despues > e.efecto.antes && "border-red-200 bg-red-50 text-red-800"
                )}
              >
                después {e.efecto.despues} OT / {e.efecto.mesesDespues} m
              </Badge>
            </p>
          )}
        </div>
        {puedeEditar && (
          <Button size="sm" variant={e.motivo ? "ghost" : "outline"} className="h-7 text-xs" onClick={onExplicar}>
            <MessageSquarePlus className="mr-1 size-3.5" /> {e.motivo ? "Editar motivo" : "Explicar"}
          </Button>
        )}
      </div>
    </div>
  )
}

function ExplicarDialog({
  e,
  sqlPendiente,
  onClose,
  onSaved,
}: {
  e: Evolucion
  sqlPendiente: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [motivo, setMotivo] = useState(e.motivo ?? "")
  const [origen, setOrigen] = useState<PlanEvolucionOrigen>(e.origen ?? "otro")
  const [sistema, setSistema] = useState<MantenimientoSistema | "none">(e.sistema ?? "none")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const res = await explicarCambioPlan(e.id, {
      motivo,
      origen,
      otIds: e.otIds,
      sistema: sistema === "none" ? null : sistema,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Motivo guardado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>¿Por qué se hizo este cambio?</DialogTitle>
          <DialogDescription>
            {fmtFecha(e.fecha)} · {ACCION_LABEL[e.accion]} · {e.tareaNombre} · {e.cambio}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo</Label>
            <Textarea
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value)}
              rows={4}
              placeholder="Qué fallaba y qué resuelve el cambio. Ej.: «Se baja la correa a 100.000 km porque la recomendación Mercedes-Benz para el Atego es 120.000 y el OJA403 la cortó a 95.000»."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Origen</Label>
              <Select value={origen} onValueChange={(v) => setOrigen(v as PlanEvolucionOrigen)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLAN_EVOLUCION_ORIGEN_LABELS) as PlanEvolucionOrigen[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {PLAN_EVOLUCION_ORIGEN_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sistema</Label>
              <Select value={sistema} onValueChange={(v) => setSistema(v as MantenimientoSistema | "none")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin sistema</SelectItem>
                  {[...SISTEMA_POR_ID.values()].map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {sqlPendiente && (
            <p className="text-xs text-amber-700">
              Falta aplicar el SQL de la evolución del plan: el guardado va a fallar hasta entonces.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || motivo.trim().length < 10}>
            {saving ? "Guardando…" : "Guardar motivo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
