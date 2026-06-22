"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  TrendingDown,
  TrendingUp,
  Minus,
  Plus,
  Loader2,
  Trash2,
  ClipboardList,
  AlertTriangle,
} from "lucide-react"
import type {
  OwdTendenciaOperario,
  OwdEstadoOperario,
  OwdPlanConDetalle,
  OwdPlanOrigen,
  OwdPlanEstado,
  OwdPlanPrioridad,
} from "@/types/database"
import { createOwdPlan, updateOwdPlan, deleteOwdPlan, addOwdPlanAvance } from "@/actions/owd"

interface ObsMini {
  id: string
  fecha: string
  empleado_observado: string
  pct_cumplimiento: number
}

interface Props {
  templateId: string
  meta: number
  tendencias: OwdTendenciaOperario[]
  planes: OwdPlanConDetalle[]
  observaciones: ObsMini[]
  empleados: string[]
  responsables: { id: string; nombre: string }[]
  canManage: boolean
}

const ESTADO_DOT: Record<OwdEstadoOperario, string> = {
  rojo: "bg-red-500",
  amarillo: "bg-amber-400",
  verde: "bg-green-500",
}
const ESTADO_LABEL: Record<OwdEstadoOperario, string> = {
  rojo: "Acción requerida",
  amarillo: "Vigilar",
  verde: "OK",
}
const PRIORIDAD_BADGE: Record<OwdPlanPrioridad, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-slate-100 text-slate-600",
}
const ESTADO_PLAN_BADGE: Record<OwdPlanEstado, string> = {
  pendiente: "bg-slate-100 text-slate-600",
  en_progreso: "bg-blue-100 text-blue-700",
  completado: "bg-green-100 text-green-700",
}
const ESTADO_PLAN_LABEL: Record<OwdPlanEstado, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

export function OwdAnalisisClient({
  templateId,
  meta,
  tendencias,
  planes,
  observaciones,
  empleados,
  responsables,
  canManage,
}: Props) {
  const router = useRouter()

  // ---- Crear plan ----
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [origen, setOrigen] = useState<OwdPlanOrigen>("operario")
  const [operario, setOperario] = useState("")
  const [observacionId, setObservacionId] = useState("")
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [causaRaiz, setCausaRaiz] = useState("")
  const [prioridad, setPrioridad] = useState<OwdPlanPrioridad>("media")
  const [responsableId, setResponsableId] = useState("")
  const [fechaObjetivo, setFechaObjetivo] = useState("")
  const [baselinePct, setBaselinePct] = useState<number | null>(null)

  function abrirPlanOperario(t: OwdTendenciaOperario) {
    setOrigen("operario")
    setOperario(t.operario)
    setObservacionId("")
    setTitulo(`Plan de mejora — ${t.operario}`)
    setDescripcion("")
    setCausaRaiz(t.motivos.join(". "))
    setPrioridad(t.estado === "rojo" ? "alta" : "media")
    setResponsableId("")
    setFechaObjetivo("")
    setBaselinePct(t.promPropio)
    setDialogOpen(true)
  }
  function abrirPlanLibre() {
    setOrigen("operario")
    setOperario("")
    setObservacionId("")
    setTitulo("")
    setDescripcion("")
    setCausaRaiz("")
    setPrioridad("media")
    setResponsableId("")
    setFechaObjetivo("")
    setBaselinePct(null)
    setDialogOpen(true)
  }

  async function guardarPlan() {
    if (!titulo.trim()) return toast.error("Indicá un título")
    if (origen === "operario" && !operario.trim()) return toast.error("Elegí el operario")
    if (origen === "observacion" && !observacionId) return toast.error("Elegí la observación")
    setSaving(true)
    const res = await createOwdPlan({
      templateId,
      origen,
      titulo,
      descripcion: descripcion || null,
      causaRaiz: causaRaiz || null,
      prioridad,
      responsableId: responsableId || null,
      fechaObjetivo: fechaObjetivo || null,
      operario: origen === "operario" ? operario : null,
      observacionId: origen === "observacion" ? observacionId : null,
      baselinePct,
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Plan de acción creado")
    setDialogOpen(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* ===== Tendencia por operario ===== */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Tendencia por operario</CardTitle>
              <p className="text-xs text-muted-foreground">
                Cumplimiento calculado sólo sobre los ítems que dependen del operario (no se lo
                penaliza por desvíos del SDR ni del proceso). Meta ≥ {meta.toFixed(0)}%.
              </p>
            </div>
            {canManage && (
              <Button size="sm" variant="outline" onClick={abrirPlanLibre}>
                <Plus className="mr-1 h-4 w-4" /> Nuevo plan
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {tendencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no hay observaciones para analizar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operario</TableHead>
                    <TableHead className="text-center">Audit.</TableHead>
                    <TableHead className="text-right">Prom. propio</TableHead>
                    <TableHead className="text-center">Evolución</TableHead>
                    <TableHead>Motivos / desvíos recurrentes</TableHead>
                    {canManage && <TableHead className="text-right">Plan</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tendencias.map((t) => (
                    <TableRow key={t.operario}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`size-2.5 rounded-full ${ESTADO_DOT[t.estado]}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{t.operario}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.rol || "—"} · {ESTADO_LABEL[t.estado]}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">{t.auditorias}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`text-sm font-semibold ${
                            t.promPropio >= meta
                              ? "text-green-600"
                              : t.promPropio >= meta - 15
                              ? "text-amber-600"
                              : "text-red-600"
                          }`}
                        >
                          {t.promPropio.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                          {t.auditorias >= 2 ? (
                            <>
                              <span>{t.primera.toFixed(0)}%</span>
                              {t.tendencia === "baja" ? (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                              ) : t.tendencia === "sube" ? (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                              ) : (
                                <Minus className="h-4 w-4 text-slate-400" />
                              )}
                              <span>{t.ultima.toFixed(0)}%</span>
                            </>
                          ) : (
                            <span>1 sola audit.</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {t.motivos.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sin desvíos propios</span>
                          ) : (
                            t.motivos.map((m, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-[11px] font-normal text-slate-600"
                              >
                                {m}
                              </Badge>
                            ))
                          )}
                        </div>
                        {t.planesAbiertos > 0 && (
                          <p className="mt-1 text-[11px] text-blue-600">
                            {t.planesAbiertos} plan(es) abierto(s)
                          </p>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {t.estado !== "verde" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-blue-600"
                              onClick={() => abrirPlanOperario(t)}
                            >
                              Crear
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Planes de acción ===== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            <span className="inline-flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Planes de acción ({planes.length})
            </span>
          </CardTitle>
          {canManage && (
            <Button size="sm" onClick={abrirPlanLibre}>
              <Plus className="mr-1 h-4 w-4" /> Nuevo plan
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {planes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin planes de acción todavía. Cuando una OWD no cumple, abrí uno acá.
            </p>
          ) : (
            planes.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                observaciones={observaciones}
                canManage={canManage}
                onChanged={() => router.refresh()}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ===== Dialog crear plan ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo plan de acción</DialogTitle>
            <DialogDescription>
              Para corregir un desvío del OWD. Puede enfocarse en una observación puntual o en un
              operario reincidente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nivel del plan</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={origen}
                onChange={(e) => setOrigen(e.target.value as OwdPlanOrigen)}
              >
                <option value="operario">Mejora de un operario</option>
                <option value="observacion">Observación puntual</option>
              </select>
            </div>

            {origen === "operario" ? (
              <div className="space-y-1.5">
                <Label>Operario</Label>
                <Input
                  list="owd-empleados-plan"
                  placeholder="Nombre del operario"
                  value={operario}
                  onChange={(e) => setOperario(e.target.value)}
                />
                <datalist id="owd-empleados-plan">
                  {empleados.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Observación</Label>
                <select
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={observacionId}
                  onChange={(e) => setObservacionId(e.target.value)}
                >
                  <option value="">Elegí una observación…</option>
                  {observaciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.fecha} · {o.empleado_observado} · {Number(o.pct_cumplimiento).toFixed(0)}%
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Causa raíz (por qué pasó)</Label>
              <Textarea rows={2} value={causaRaiz} onChange={(e) => setCausaRaiz(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Acción a tomar (qué se va a hacer)</Label>
              <Textarea
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <select
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={prioridad}
                  onChange={(e) => setPrioridad(e.target.value as OwdPlanPrioridad)}
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha objetivo</Label>
                <Input
                  type="date"
                  value={fechaObjetivo}
                  onChange={(e) => setFechaObjetivo(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={responsableId}
                onChange={(e) => setResponsableId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {responsables.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
            {baselinePct != null && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" /> Baseline al abrir:{" "}
                {baselinePct.toFixed(1)}% de cumplimiento propio.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardarPlan} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================
// Tarjeta de un plan con avances
// =============================================
function PlanCard({
  plan,
  observaciones,
  canManage,
  onChanged,
}: {
  plan: OwdPlanConDetalle
  observaciones: ObsMini[]
  canManage: boolean
  onChanged: () => void
}) {
  const [comentario, setComentario] = useState("")
  const [nuevoEstado, setNuevoEstado] = useState<OwdPlanEstado | "">("")
  const [busy, setBusy] = useState(false)

  const obs = plan.observacion_id
    ? observaciones.find((o) => o.id === plan.observacion_id)
    : null

  async function agregarAvance() {
    if (!comentario.trim() && !nuevoEstado) {
      return toast.error("Escribí un comentario o cambiá el estado")
    }
    setBusy(true)
    const res = await addOwdPlanAvance({
      planId: plan.id,
      comentario: comentario.trim() || undefined,
      estadoResultante: nuevoEstado || undefined,
    })
    setBusy(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Avance registrado")
    setComentario("")
    setNuevoEstado("")
    onChanged()
  }

  async function cambiarEstado(estado: OwdPlanEstado) {
    setBusy(true)
    const res = await updateOwdPlan(plan.id, { estado })
    setBusy(false)
    if ("error" in res) return toast.error(res.error)
    onChanged()
  }

  async function borrar() {
    if (!confirm("¿Eliminar este plan de acción y sus avances?")) return
    setBusy(true)
    const res = await deleteOwdPlan(plan.id)
    setBusy(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Plan eliminado")
    onChanged()
  }

  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={`${ESTADO_PLAN_BADGE[plan.estado]} hover:${ESTADO_PLAN_BADGE[plan.estado]}`}>
              {ESTADO_PLAN_LABEL[plan.estado]}
            </Badge>
            <Badge className={`${PRIORIDAD_BADGE[plan.prioridad]} hover:${PRIORIDAD_BADGE[plan.prioridad]}`}>
              Prioridad {plan.prioridad}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {plan.origen === "operario" ? "Mejora de operario" : "Observación puntual"}
            </Badge>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{plan.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {plan.origen === "operario"
              ? `Operario: ${plan.operario || "—"}`
              : obs
              ? `Observación: ${obs.fecha} · ${obs.empleado_observado}`
              : "Observación vinculada"}
            {plan.responsable_nombre && ` · Resp: ${plan.responsable_nombre}`}
            {plan.fecha_objetivo && ` · Objetivo: ${plan.fecha_objetivo}`}
            {plan.baseline_pct != null && ` · Baseline: ${Number(plan.baseline_pct).toFixed(0)}%`}
          </p>
        </div>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600"
            onClick={borrar}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {plan.causa_raiz && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-medium">Causa raíz:</span> {plan.causa_raiz}
        </p>
      )}
      {plan.descripcion && (
        <p className="mt-1 text-xs text-slate-600">
          <span className="font-medium">Acción:</span> {plan.descripcion}
        </p>
      )}

      {/* Avances */}
      {plan.avances.length > 0 && (
        <div className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
          {plan.avances.map((a) => (
            <div key={a.id} className="text-xs text-slate-600">
              <span className="text-slate-400">
                {new Date(a.created_at).toLocaleDateString("es-AR")}:
              </span>{" "}
              {a.comentario}
              {a.estado_resultante && (
                <span className="ml-1 text-slate-400">→ {ESTADO_PLAN_LABEL[a.estado_resultante]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && plan.estado !== "completado" && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Input
            placeholder="Registrar avance…"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="h-8 flex-1 text-sm"
          />
          <select
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
            value={nuevoEstado}
            onChange={(e) => setNuevoEstado(e.target.value as OwdPlanEstado | "")}
          >
            <option value="">Mantener estado</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="completado">Completar</option>
          </select>
          <Button size="sm" onClick={agregarAvance} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </div>
      )}
      {canManage && plan.estado === "completado" && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 text-xs text-blue-600"
          onClick={() => cambiarEstado("en_progreso")}
          disabled={busy}
        >
          Reabrir plan
        </Button>
      )}
    </div>
  )
}
