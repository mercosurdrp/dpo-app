"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, GraduationCap, ShieldCheck, Users, Wand2, BookOpen, ListChecks } from "lucide-react"
import { useRefrescarConScroll } from "@/lib/use-refrescar-con-scroll"
import { COLOR_GAP, ESCALA_SKAP, LABEL_GAP } from "@/lib/skap/gap"
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
  cargarNotaBase,
  type SkapAccionDetalle,
} from "@/actions/skap-habilidades"
import type {
  SkapMatrizRol,
  SkapRol,
  SkapEstadoGap,
  SkapPersonaRow,
  SkapPlanFormacion,
  SkapEstadoAccion,
  SkapHabilidad,
  SkapCelda,
} from "@/types/database"

const ESTADOS_ACCION: SkapEstadoAccion[] = ["pendiente", "programada", "realizada", "cerrada"]

/** Identidad visual por bloque (se cicla si hubiera más de 5). */
const BLOQUE_STYLE = [
  { bar: "bg-indigo-600", soft: "bg-indigo-50/70", divide: "border-indigo-300" },
  { bar: "bg-sky-600", soft: "bg-sky-50/70", divide: "border-sky-300" },
  { bar: "bg-violet-600", soft: "bg-violet-50/70", divide: "border-violet-300" },
  { bar: "bg-teal-600", soft: "bg-teal-50/70", divide: "border-teal-300" },
  { bar: "bg-fuchsia-600", soft: "bg-fuchsia-50/70", divide: "border-fuchsia-300" },
]
const bloqueStyle = (i: number) => BLOQUE_STYLE[i % BLOQUE_STYLE.length]

/** Chip de criticidad: A destaca en rojo, B/C atenuados. */
function CritChip({ c }: { c: string }) {
  const critA = c === "A"
  return (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-bold leading-none ${
        critA ? "bg-red-100 text-red-700 ring-1 ring-red-200" : "bg-slate-200 text-slate-500"
      }`}
    >
      {c}
    </span>
  )
}

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
  const refrescarConScroll = useRefrescarConScroll()
  const [pending, startTransition] = useTransition()
  const [vista, setVista] = useState<"matriz" | "acciones">("matriz")
  const [evaluando, setEvaluando] = useState<SkapPersonaRow | null>(null)
  const [celdaEdit, setCeldaEdit] = useState<{ persona: SkapPersonaRow; habilidad: SkapHabilidad; celda: SkapCelda } | null>(null)
  const [planHabilidad, setPlanHabilidad] = useState<{ nombre: string; plan: SkapPlanFormacion | null } | null>(null)

  const { habilidades, personas, kpis } = matriz
  const rolActual = roles.find((r) => r.rol === matriz.rol)!

  const bloques = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of habilidades) m.set(h.bloque, (m.get(h.bloque) ?? 0) + 1)
    return [...m.entries()]
  }, [habilidades])

  // Metadata por columna: índice de bloque y si es la primera columna de su bloque
  const cols = useMemo(() => {
    const order: string[] = []
    for (const h of habilidades) if (!order.includes(h.bloque)) order.push(h.bloque)
    const idx = new Map(order.map((b, i) => [b, i]))
    let prev: string | null = null
    return habilidades.map((h) => {
      const first = h.bloque !== prev
      prev = h.bloque
      return { h, first, blockIdx: idx.get(h.bloque)! }
    })
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
          : `${res.data.creadas} planes de acción creados — están en la pestaña Plan de formación`,
      )
      refrescarConScroll()
    })
  }

  function notaBase() {
    startTransition(async () => {
      const res = await cargarNotaBase(matriz.rol)
      if ("error" in res) { toast.error(res.error); return }
      toast.success(
        res.data.cargadas === 0
          ? "No había celdas sin evaluar: no se cargó nada"
          : `Nota base cargada: ${res.data.cargadas} notas para ${res.data.personas} personas (= estándar de cada habilidad)`,
      )
      refrescarConScroll()
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
            <>
              <Button variant="outline" onClick={notaBase} disabled={pending}>
                <ListChecks className="mr-1 size-4" />
                Cargar nota base
              </Button>
              <Button variant="outline" onClick={generarAcciones} disabled={pending}>
                <Wand2 className="mr-1 size-4" />
                Crear planes de acción de los gaps
              </Button>
            </>
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
            <Card className="overflow-hidden py-0">
              <CardContent className="overflow-x-auto p-0">
                <table className="w-max table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: 224 }} />
                    {habilidades.map((h) => (
                      <col key={h.id} style={{ width: 150 }} />
                    ))}
                    <col style={{ width: 92 }} />
                  </colgroup>
                  <thead>
                    {/* Fila de grupos: una banda de color por bloque */}
                    <tr>
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-20 border-b border-r border-slate-200 bg-white px-3 py-2 text-left align-bottom text-sm font-semibold text-slate-700 shadow-[6px_0_6px_-4px_rgba(15,23,42,0.08)]"
                      >
                        Persona
                      </th>
                      {bloques.map(([bloque, n], bi) => (
                        <th
                          key={bloque}
                          colSpan={n}
                          className={`border-b border-l-2 border-white px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-white ${bloqueStyle(bi).bar}`}
                        >
                          {bloque}
                        </th>
                      ))}
                      <th
                        rowSpan={2}
                        className="border-b border-l-2 border-white bg-slate-700 px-2 py-2 text-center align-bottom text-[11px] font-bold uppercase tracking-wide text-white"
                      >
                        Críticas
                      </th>
                    </tr>
                    {/* Fila de habilidades: nombre horizontal + chip de criticidad */}
                    <tr>
                      {cols.map(({ h, first, blockIdx }) => {
                        const st = bloqueStyle(blockIdx)
                        return (
                          <th
                            key={h.id}
                            className={`border-b border-slate-200 p-0 align-top ${st.soft} ${
                              first ? `border-l-2 ${st.divide}` : "border-l border-slate-200/60"
                            }`}
                          >
                            <button
                              onClick={() => abrirPlan(h.id, h.habilidad)}
                              title={`${h.habilidad} · criticidad ${h.criticidad} · estándar ${h.estandar} — ver plan de formación`}
                              className="flex h-full min-h-[7.5rem] w-full flex-col items-center gap-1.5 px-2 pt-2 pb-2.5 transition-colors hover:bg-white/70"
                            >
                              <CritChip c={h.criticidad} />
                              <span className="text-center text-[11px] font-semibold uppercase leading-tight tracking-tight text-slate-700">
                                {h.habilidad}
                              </span>
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                    {/* Fila de estándar requerido */}
                    <tr>
                      <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-100 px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 shadow-[6px_0_6px_-4px_rgba(15,23,42,0.08)]">
                        Estándar requerido
                      </th>
                      {cols.map(({ h, first, blockIdx }) => (
                        <th
                          key={h.id}
                          className={`border-b border-slate-200 bg-slate-100 py-1.5 text-center ${
                            first ? `border-l-2 ${bloqueStyle(blockIdx).divide}` : "border-l border-slate-200/60"
                          }`}
                        >
                          <span className="inline-flex size-6 items-center justify-center rounded-md bg-white text-xs font-bold text-slate-600 ring-1 ring-slate-300">
                            {h.estandar}
                          </span>
                        </th>
                      ))}
                      <th className="border-b border-l-2 border-white bg-slate-100" />
                    </tr>
                  </thead>
                  <tbody>
                    {personas.map((p, ri) => {
                      const rowBg = ri % 2 === 0 ? "bg-white" : "bg-slate-50"
                      const cp = p.pct_criticas
                      const critColor =
                        cp === null
                          ? "text-slate-400"
                          : cp >= 80
                            ? "text-emerald-600"
                            : cp >= 50
                              ? "text-slate-700"
                              : "text-red-600"
                      return (
                        <tr key={p.empleado_id} className={rowBg}>
                          <td
                            className={`sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-2 align-middle shadow-[6px_0_6px_-4px_rgba(15,23,42,0.08)] ${rowBg}`}
                          >
                            <button
                              className="block text-left leading-tight disabled:cursor-default"
                              disabled={!canEdit}
                              onClick={() => setEvaluando(p)}
                            >
                              <span className="block font-semibold text-slate-800">{p.nombre}</span>
                              <span className="text-xs font-normal text-slate-400">#{p.legajo}</span>
                            </button>
                          </td>
                          {p.celdas.map((c, ci) => {
                            const meta = cols[ci]
                            return (
                              <td
                                key={c.habilidad_id}
                                className={`border-b border-slate-100 px-1 py-1 ${
                                  meta.first
                                    ? `border-l-2 ${bloqueStyle(meta.blockIdx).divide}`
                                    : "border-l border-slate-100"
                                }`}
                              >
                                <button
                                  disabled={!canEdit}
                                  onClick={() => setCeldaEdit({ persona: p, habilidad: cols[ci].h, celda: c })}
                                  title={`${LABEL_GAP[c.estado]} · estándar ${c.estandar}${
                                    c.fecha_evaluacion ? ` · evaluado ${c.fecha_evaluacion}` : ""
                                  }${canEdit ? " — clic para cambiar la nota" : ""}`}
                                  className={`mx-auto flex size-8 items-center justify-center rounded-md text-[13px] font-bold shadow-sm transition enabled:cursor-pointer enabled:hover:scale-110 enabled:hover:ring-2 enabled:hover:ring-slate-400 ${COLOR_GAP[c.estado]}`}
                                >
                                  {c.estado === "sin_evaluar" ? "" : c.estado === "no_aplica" ? "NA" : c.nivel}
                                </button>
                              </td>
                            )
                          })}
                          <td className="border-b border-l-2 border-slate-200 px-2 py-2 text-center">
                            <span className={`text-sm font-bold ${critColor}`}>{pct(cp)}</span>
                          </td>
                        </tr>
                      )
                    })}
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
            refrescarConScroll()
          }}
        />
      )}

      {celdaEdit && (
        <DialogNota
          rol={matriz.rol}
          persona={celdaEdit.persona}
          habilidad={celdaEdit.habilidad}
          celda={celdaEdit.celda}
          onClose={() => setCeldaEdit(null)}
          onSaved={() => {
            setCeldaEdit(null)
            refrescarConScroll()
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

/**
 * Nota rápida de UNA celda: clic en un número y guarda al instante con fecha
 * de hoy (si hoy ya había una nota, la corrige; un día distinto suma historial).
 */
function DialogNota({
  rol,
  persona,
  habilidad,
  celda,
  onClose,
  onSaved,
}: {
  rol: SkapRol
  persona: SkapPersonaRow
  habilidad: SkapHabilidad
  celda: SkapCelda
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const actual = celda.estado === "no_aplica" ? "NA" : celda.nivel === null ? null : String(celda.nivel)

  function guardar(v: string) {
    startTransition(async () => {
      const res = await guardarEvaluacion({
        rol,
        empleadoId: persona.empleado_id,
        fecha: new Date().toISOString().slice(0, 10),
        niveles: [{ habilidadId: habilidad.id, nivel: v === "NA" ? null : Number(v) }],
      })
      if ("error" in res) { toast.error(res.error); return }
      toast.success(`${persona.nombre}: ${habilidad.habilidad} → ${v}`)
      onSaved()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            <Badge variant={habilidad.criticidad === "A" ? "destructive" : "secondary"} className="mr-1.5">
              {habilidad.criticidad}
            </Badge>
            {habilidad.habilidad}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {persona.nombre} <span className="text-slate-400">#{persona.legajo}</span> · estándar requerido{" "}
            <span className="font-bold">{celda.estandar}</span>
          </p>

          <div className="flex gap-1.5">
            {["0", "1", "2", "3", "4", "NA"].map((v) => {
              const gap = v === "NA" ? null : Number(v) - celda.estandar
              const color =
                v === "NA"
                  ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  : gap! >= 0
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : gap === -1
                      ? "bg-amber-400 text-amber-950 hover:bg-amber-500"
                      : "bg-red-500 text-white hover:bg-red-600"
              return (
                <button
                  key={v}
                  disabled={pending}
                  title={v === "NA" ? "No aplica" : ESCALA_SKAP[Number(v)]}
                  onClick={() => guardar(v)}
                  className={`h-11 flex-1 rounded-md text-base font-bold shadow-sm transition disabled:opacity-50 ${color} ${
                    actual === v ? "ring-2 ring-slate-900 ring-offset-2" : ""
                  }`}
                >
                  {v}
                </button>
              )
            })}
          </div>

          <ul className="space-y-0.5 text-xs text-slate-500">
            {Object.entries(ESCALA_SKAP).map(([n, d]) => (
              <li key={n}>
                <span className="font-bold text-slate-700">{n}</span> — {d}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400">
            Se guarda al hacer clic, con fecha de hoy. El color muestra cómo queda contra el estándar.
          </p>
        </div>
      </DialogContent>
    </Dialog>
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
                      title={v === "NA" ? "No aplica" : ESCALA_SKAP[Number(v)]}
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
  const refrescarConScroll = useRefrescarConScroll()
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
                  refrescarConScroll()
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
