"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, GraduationCap, ShieldCheck, Users, Wand2, BookOpen } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  guardarEvaluacion,
  generarAccionesDesdeGaps,
  actualizarAccion,
  getPlanFormacion,
  type SkapAccionDetalle,
} from "@/actions/skap-habilidades"
import type {
  SkapMatrizRol,
  SkapRol,
  SkapEstadoGap,
  SkapPersonaRow,
  SkapPlanFormacion,
  SkapEstadoAccion,
} from "@/types/database"

/** Escala del instructivo: qué significa cada nivel. */
const ESCALA: Record<number, string> = {
  0: "No conoce. No recibió instrucción.",
  1: "Opera con limitaciones, necesita ayuda o supervisión frecuente.",
  2: "Opera sin ayuda, pero no domina los fundamentos teóricos.",
  3: "Aplica teoría y práctica. Trabaja sin errores en cualquier momento y lugar.",
  4: "Puede instruir a otros. Es un experto.",
}

const COLOR_GAP: Record<SkapEstadoGap, string> = {
  critico: "bg-red-500 text-white",
  brecha: "bg-amber-400 text-amber-950",
  cumple: "bg-emerald-500 text-white",
  sin_evaluar: "bg-slate-100 text-slate-400",
  no_aplica: "bg-slate-200 text-slate-500",
}

const LABEL_GAP: Record<SkapEstadoGap, string> = {
  critico: "Gap crítico (2 o más niveles por debajo)",
  brecha: "Brecha (1 nivel por debajo)",
  cumple: "Cumple el estándar",
  sin_evaluar: "Sin evaluar",
  no_aplica: "No aplica",
}

const ESTADOS_ACCION: SkapEstadoAccion[] = ["pendiente", "programada", "realizada", "cerrada"]

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(0)}%`
}

interface Props {
  matriz: SkapMatrizRol
  acciones: SkapAccionDetalle[]
  canEdit: boolean
  roles: { rol: SkapRol; label: string; sector: string }[]
}

export function MatrizHabilidadesClient({ matriz, acciones, canEdit, roles }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [vista, setVista] = useState<"matriz" | "acciones">("matriz")
  const [evaluando, setEvaluando] = useState<SkapPersonaRow | null>(null)
  const [planHabilidad, setPlanHabilidad] = useState<{ nombre: string; plan: SkapPlanFormacion | null } | null>(null)

  const { habilidades, personas, kpis } = matriz
  const rolActual = roles.find((r) => r.rol === matriz.rol)!

  const bloques = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of habilidades) m.set(h.bloque, (m.get(h.bloque) ?? 0) + 1)
    return [...m.entries()]
  }, [habilidades])

  function cambiarRol(rol: SkapRol | null) {
    if (rol) router.push(`/gente/matriz-skap?rol=${rol}`)
  }

  function abrirPlan(habilidadId: string, nombre: string) {
    startTransition(async () => {
      const res = await getPlanFormacion(habilidadId)
      setPlanHabilidad({ nombre, plan: "error" in res ? null : res.data })
    })
  }

  function generarAcciones() {
    startTransition(async () => {
      const res = await generarAccionesDesdeGaps(matriz.rol)
      if ("error" in res) { toast.error(res.error); return }
      toast.success(
        res.data.creadas === 0
          ? "No hay gaps nuevos: todas las brechas ya tienen una acción abierta"
          : `${res.data.creadas} acciones de formación abiertas`,
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Matriz SKAP</h1>
          <p className="text-sm text-slate-500">
            Matriz de habilidades · Pilar Gente 4.4 — habilidad, estándar requerido y plan de formación
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={matriz.rol} onValueChange={cambiarRol}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.rol} value={r.rol}>
                  {r.label} · {r.sector}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button variant="outline" onClick={generarAcciones} disabled={pending}>
              <Wand2 className="mr-1 size-4" />
              Abrir acciones de los gaps
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<ShieldCheck className="size-4" />}
          label="Cobertura de críticas"
          value={pct(kpis.pct_cobertura_criticas)}
          hint="Habilidades A que llegan al estándar"
        />
        <Kpi
          icon={<AlertTriangle className="size-4" />}
          label="Gaps críticos"
          value={String(kpis.gaps_criticos)}
          hint="2 niveles o más por debajo"
          alert={kpis.gaps_criticos > 0}
        />
        <Kpi
          icon={<GraduationCap className="size-4" />}
          label="Acciones abiertas"
          value={String(kpis.acciones_abiertas)}
          hint="Formación pendiente de cerrar"
        />
        <Kpi
          icon={<Users className="size-4" />}
          label="Personas"
          value={`${kpis.evaluadas}/${kpis.personas}`}
          hint="Evaluadas al menos una vez"
        />
      </div>

      <div className="flex gap-2 border-b">
        {(["matriz", "acciones"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`px-3 py-2 text-sm font-medium ${
              vista === v ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500"
            }`}
          >
            {v === "matriz" ? "Matriz" : `Plan de formación (${acciones.filter((a) => a.estado !== "cerrada").length})`}
          </button>
        ))}
      </div>

      {vista === "matriz" ? (
        <>
          {personas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-500">
                No hay personas asignadas al rol {rolActual.label}.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border-b bg-white p-2 text-left font-medium">
                        Persona
                      </th>
                      {bloques.map(([bloque, n]) => (
                        <th
                          key={bloque}
                          colSpan={n}
                          className="border-b border-l bg-slate-50 p-2 text-center text-xs font-semibold text-slate-600"
                        >
                          {bloque}
                        </th>
                      ))}
                      <th className="border-b border-l bg-slate-50 p-2 text-center text-xs">Críticas</th>
                    </tr>
                    <tr>
                      <th className="sticky left-0 z-10 border-b bg-white p-2" />
                      {habilidades.map((h) => (
                        <th key={h.id} className="border-b p-0 align-bottom">
                          <button
                            onClick={() => abrirPlan(h.id, h.habilidad)}
                            title={`${h.habilidad} · criticidad ${h.criticidad} · estándar ${h.estandar} — ver plan de formación`}
                            className="mx-auto flex h-36 w-8 items-center justify-center hover:bg-slate-50"
                          >
                            <span
                              className="whitespace-nowrap text-[11px] text-slate-600"
                              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                            >
                              <span
                                className={`mr-1 font-bold ${
                                  h.criticidad === "A" ? "text-red-600" : "text-slate-400"
                                }`}
                              >
                                {h.criticidad}
                              </span>
                              {h.habilidad.length > 34 ? h.habilidad.slice(0, 33) + "…" : h.habilidad}
                            </span>
                          </button>
                        </th>
                      ))}
                      <th className="border-b border-l bg-slate-50" />
                    </tr>
                    <tr className="bg-slate-50/60">
                      <th className="sticky left-0 z-10 border-b bg-slate-50/60 p-2 text-left text-xs font-normal text-slate-500">
                        Estándar requerido
                      </th>
                      {habilidades.map((h) => (
                        <th key={h.id} className="border-b p-1 text-center text-xs font-bold text-slate-700">
                          {h.estandar}
                        </th>
                      ))}
                      <th className="border-b border-l bg-slate-50" />
                    </tr>
                  </thead>
                  <tbody>
                    {personas.map((p) => (
                      <tr key={p.empleado_id} className="hover:bg-slate-50/50">
                        <td className="sticky left-0 z-10 border-b bg-white p-2 whitespace-nowrap">
                          <button
                            className="text-left disabled:cursor-default"
                            disabled={!canEdit}
                            onClick={() => setEvaluando(p)}
                          >
                            <span className="font-medium">{p.nombre}</span>
                            <span className="ml-2 text-xs text-slate-400">#{p.legajo}</span>
                          </button>
                        </td>
                        {p.celdas.map((c) => (
                          <td key={c.habilidad_id} className="border-b p-0.5">
                            <div
                              title={`${LABEL_GAP[c.estado]} · estándar ${c.estandar}${
                                c.fecha_evaluacion ? ` · evaluado ${c.fecha_evaluacion}` : ""
                              }`}
                              className={`mx-auto flex size-7 items-center justify-center rounded text-xs font-bold ${
                                COLOR_GAP[c.estado]
                              }`}
                            >
                              {c.estado === "sin_evaluar" ? "" : c.estado === "no_aplica" ? "NA" : c.nivel}
                            </div>
                          </td>
                        ))}
                        <td className="border-b border-l p-2 text-center text-xs font-semibold">
                          {pct(p.pct_criticas)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {(["cumple", "brecha", "critico", "sin_evaluar"] as SkapEstadoGap[]).map((e) => (
              <span key={e} className="flex items-center gap-1">
                <span className={`size-3 rounded ${COLOR_GAP[e]}`} />
                {LABEL_GAP[e]}
              </span>
            ))}
            <span className="ml-auto">
              Niveles: 0 no conoce · 1 con supervisión · 2 sin teoría · 3 autónomo · 4 puede instruir
            </span>
          </div>
        </>
      ) : (
        <AccionesTab acciones={acciones} rol={matriz.rol} canEdit={canEdit} />
      )}

      {evaluando && (
        <DialogEvaluar
          persona={evaluando}
          matriz={matriz}
          onClose={() => setEvaluando(null)}
          onSaved={() => {
            setEvaluando(null)
            router.refresh()
          }}
        />
      )}

      <Dialog open={!!planHabilidad} onOpenChange={(o) => !o && setPlanHabilidad(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4" /> {planHabilidad?.nombre}
            </DialogTitle>
          </DialogHeader>
          {planHabilidad?.plan ? (
            <div className="space-y-3 text-sm">
              {planHabilidad.plan.alcance && (
                <Campo label="Alcance de la competencia" valor={planHabilidad.plan.alcance} />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Horas teóricas" valor={planHabilidad.plan.hs_teoricas?.toString()} />
                <Campo label="Horas prácticas" valor={planHabilidad.plan.hs_practicas?.toString()} />
                <Campo label="Experto" valor={planHabilidad.plan.experto} />
                <Campo label="Instructor" valor={planHabilidad.plan.instructor} />
                <Campo label="Tutor" valor={planHabilidad.plan.tutor} />
                <Campo label="Método" valor={planHabilidad.plan.metodo} />
                <Campo label="Criterio de evaluación" valor={planHabilidad.plan.criterio_evaluacion} />
                <Campo label="Material" valor={planHabilidad.plan.material} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Esta habilidad todavía no tiene plan de formación cargado.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-slate-900">{valor}</p>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  alert,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  alert?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {icon}
          {label}
        </div>
        <p className={`mt-1 text-2xl font-bold ${alert ? "text-red-600" : ""}`}>{value}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </CardContent>
    </Card>
  )
}

function DialogEvaluar({
  persona,
  matriz,
  onClose,
  onSaved,
}: {
  persona: SkapPersonaRow
  matriz: SkapMatrizRol
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [niveles, setNiveles] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      persona.celdas.map((c) => [
        c.habilidad_id,
        c.estado === "no_aplica" ? "NA" : c.nivel === null ? "" : String(c.nivel),
      ]),
    ),
  )

  function guardar() {
    const cargados = Object.entries(niveles).filter(([, v]) => v !== "")
    if (cargados.length === 0) { toast.error("Cargá al menos una habilidad"); return }

    startTransition(async () => {
      const res = await guardarEvaluacion({
        rol: matriz.rol,
        empleadoId: persona.empleado_id,
        fecha,
        niveles: cargados.map(([habilidadId, v]) => ({
          habilidadId,
          nivel: v === "NA" ? null : Number(v),
        })),
      })
      if ("error" in res) { toast.error(res.error); return }
      toast.success(`Evaluación guardada (${res.data.guardadas} habilidades)`)
      onSaved()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Evaluar a {persona.nombre}
            <span className="ml-2 text-sm font-normal text-slate-400">#{persona.legajo}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="fecha">Fecha de evaluación</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">
              Una fecha nueva agrega un punto al historial; volver a cargar la misma fecha corrige esa evaluación.
            </p>
          </div>

          {matriz.habilidades.map((h) => (
            <div key={h.id} className="border-b pb-3">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <p className="text-sm">
                  <Badge variant={h.criticidad === "A" ? "destructive" : "secondary"} className="mr-1.5">
                    {h.criticidad}
                  </Badge>
                  {h.habilidad}
                </p>
                <span className="whitespace-nowrap text-xs text-slate-400">estándar {h.estandar}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {["0", "1", "2", "3", "4", "NA"].map((v) => {
                  const sel = niveles[h.id] === v
                  const cumple = v !== "NA" && Number(v) >= h.estandar
                  return (
                    <button
                      key={v}
                      title={v === "NA" ? "No aplica" : ESCALA[Number(v)]}
                      onClick={() => setNiveles((n) => ({ ...n, [h.id]: sel ? "" : v }))}
                      className={`h-8 w-10 rounded border text-sm font-semibold ${
                        sel
                          ? cumple
                            ? "border-emerald-600 bg-emerald-500 text-white"
                            : v === "NA"
                              ? "border-slate-400 bg-slate-200"
                              : "border-red-600 bg-red-500 text-white"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {v}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending}>
            {pending ? "Guardando…" : "Guardar evaluación"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AccionesTab({
  acciones,
  rol,
  canEdit,
}: {
  acciones: SkapAccionDetalle[]
  rol: SkapRol
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState<SkapAccionDetalle | null>(null)

  if (acciones.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-slate-500">
          No hay acciones de formación. Usá “Abrir acciones de los gaps” para generarlas a partir de las
          brechas de la matriz.
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="p-2">Persona</th>
                <th className="p-2">Habilidad</th>
                <th className="p-2 text-center">Nivel</th>
                <th className="p-2 text-center">Estándar</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Programada</th>
                <th className="p-2">Responsable</th>
                {canEdit && <th className="p-2" />}
              </tr>
            </thead>
            <tbody>
              {acciones.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">
                    {a.empleado_nombre}
                    <span className="ml-1 text-xs text-slate-400">#{a.legajo}</span>
                  </td>
                  <td className="p-2">
                    <Badge
                      variant={a.criticidad === "A" ? "destructive" : "secondary"}
                      className="mr-1.5"
                    >
                      {a.criticidad}
                    </Badge>
                    {a.habilidad}
                  </td>
                  <td className="p-2 text-center font-semibold">{a.nivel_origen ?? "—"}</td>
                  <td className="p-2 text-center text-slate-500">{a.estandar}</td>
                  <td className="p-2">
                    <Badge variant={a.estado === "cerrada" ? "secondary" : "outline"}>{a.estado}</Badge>
                  </td>
                  <td className="p-2 text-slate-500">{a.fecha_programada ?? "—"}</td>
                  <td className="p-2 text-slate-500">{a.responsable ?? "—"}</td>
                  {canEdit && (
                    <td className="p-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(a)}>
                        Editar
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editando && (
        <Dialog open onOpenChange={(o) => !o && setEditando(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-base">
                {editando.empleado_nombre} — {editando.habilidad}
              </DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                startTransition(async () => {
                  const res = await actualizarAccion({
                    id: editando.id,
                    rol,
                    estado: fd.get("estado") as SkapEstadoAccion,
                    fecha_programada: (fd.get("fecha_programada") as string) || null,
                    fecha_realizada: (fd.get("fecha_realizada") as string) || null,
                    responsable: (fd.get("responsable") as string) || null,
                    observaciones: (fd.get("observaciones") as string) || null,
                  })
                  if ("error" in res) { toast.error(res.error); return }
                  toast.success("Acción actualizada")
                  setEditando(null)
                  router.refresh()
                })
              }}
            >
              <div>
                <Label>Estado</Label>
                <select
                  name="estado"
                  defaultValue={editando.estado}
                  className="h-9 w-full rounded-md border px-3 text-sm"
                >
                  {ESTADOS_ACCION.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fp">Fecha programada</Label>
                  <Input id="fp" name="fecha_programada" type="date" defaultValue={editando.fecha_programada ?? ""} />
                </div>
                <div>
                  <Label htmlFor="fr">Fecha realizada</Label>
                  <Input id="fr" name="fecha_realizada" type="date" defaultValue={editando.fecha_realizada ?? ""} />
                </div>
              </div>
              <div>
                <Label htmlFor="resp">Responsable</Label>
                <Input id="resp" name="responsable" defaultValue={editando.responsable ?? ""} />
              </div>
              <div>
                <Label htmlFor="obs">Observaciones</Label>
                <Textarea id="obs" name="observaciones" defaultValue={editando.observaciones ?? ""} />
              </div>
              <p className="text-xs text-slate-500">
                Al cerrar la acción, volvé a evaluar a la persona en la matriz con una fecha nueva: así queda
                registrado que el gap se cerró.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  Guardar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
