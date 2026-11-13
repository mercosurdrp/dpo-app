"use client"

import { Fragment, useCallback, useEffect, useState, useTransition } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ListTodo,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { PlanHerramientasInline } from "@/components/herramientas-gestion/plan-herramientas-inline"
import {
  actualizarObservacionMes,
  crearObservacionMes,
  eliminarObservacionMes,
  getSeguimientoMensual,
  type AccionReunionMes,
  type ObservacionMes,
} from "@/actions/indicadores-observaciones-mes"
import type { DqiPlan } from "@/actions/dqi"

const MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
const INDICADOR = "dqi"
/** Clave del DQI en el tablero de las reuniones (matinal de Logística). */
const INDICADOR_REUNION = "auto_dqi"

const fmtPPM = (n: number | null | undefined) =>
  n == null ? "—" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)} PPM`

const fmtFecha = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })
}
const fmtFechaHora = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

const ESTADO_PLAN: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  en_progreso: "bg-blue-100 text-blue-700",
  completado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-slate-100 text-slate-500",
}
const ESTADO_ACCION: Record<AccionReunionMes["estado"], { label: string; cls: string }> = {
  no_comenzada: { label: "no comenzada", cls: "bg-amber-100 text-amber-700" },
  en_curso: { label: "en curso", cls: "bg-blue-100 text-blue-700" },
  cerrada: { label: "cerrada", cls: "bg-emerald-100 text-emerald-700" },
}

const periodoDe = (year: number, m: number) => `${year}-${String(m).padStart(2, "0")}`

/**
 * Tablero de seguimiento mensual del DQI, como el de observaciones/acciones de
 * la matinal de Logística pero por MES: para cada mes con dato se ve si cumplió
 * la meta y qué evidencia hay (observaciones, planes de acción del punto 1.4 y
 * lo que se registró sobre el DQI en las reuniones). Los meses fuera de meta
 * sin nada cargado quedan marcados en rojo.
 */
export function DqiSeguimientoMensualCard({
  year,
  serie,
  target,
  planes,
  puedeEditar,
  onCrearPlan,
  onPlanesChanged,
}: {
  year: number
  serie: (number | null)[]
  target: number | null
  /** Planes del punto 1.4 del año, con su mes. */
  planes: DqiPlan[]
  puedeEditar: boolean
  onCrearPlan: (month: number) => void
  onPlanesChanged?: () => void
}) {
  const [obs, setObs] = useState<ObservacionMes[]>([])
  const [acciones, setAcciones] = useState<AccionReunionMes[]>([])
  // Año ya cargado: mientras no coincide con `year`, está cargando.
  const [cargadoYear, setCargadoYear] = useState<number | null>(null)
  const cargando = cargadoYear !== year
  const [abierto, setAbierto] = useState<number | null>(null)
  const [texto, setTexto] = useState("")
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState("")
  const [pending, startTransition] = useTransition()

  const cargar = useCallback(() => {
    getSeguimientoMensual({ indicador: INDICADOR, indicadorReunionId: INDICADOR_REUNION, year }).then((res) => {
      setCargadoYear(year)
      if ("error" in res) {
        toast.error(`Seguimiento mensual: ${res.error}`)
        return
      }
      setObs(res.data.observaciones)
      setAcciones(res.data.acciones)
    })
  }, [year])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Meses con dato (los que ya se midieron).
  const meses = serie
    .map((v, i) => ({ m: i + 1, v }))
    .filter((x) => x.v != null) as { m: number; v: number }[]

  const porMes = (m: number) => {
    const p = periodoDe(year, m)
    return {
      obs: obs.filter((o) => o.periodo === p),
      acciones: acciones.filter((a) => a.periodo === p),
      planes: planes.filter((x) => x.year === year && x.month === m),
    }
  }

  const fuera = meses.filter((x) => target != null && x.v > target)
  const fueraSinEvidencia = fuera.filter((x) => {
    const d = porMes(x.m)
    return d.obs.length + d.acciones.length + d.planes.length === 0
  })

  function guardar(m: number) {
    if (!texto.trim()) {
      toast.error("Escribí la observación.")
      return
    }
    startTransition(async () => {
      const res = await crearObservacionMes({ indicador: INDICADOR, periodo: periodoDe(year, m), texto })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setTexto("")
      toast.success(`Observación registrada en ${MESES_FULL[m - 1]}.`)
      cargar()
    })
  }

  function guardarEdicion(id: string) {
    startTransition(async () => {
      const res = await actualizarObservacionMes(id, editTexto)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setEditandoId(null)
      cargar()
    })
  }

  function borrar(o: ObservacionMes) {
    if (!confirm(`¿Eliminar la observación?\n\n"${o.texto.slice(0, 80)}${o.texto.length > 80 ? "…" : ""}"`)) return
    startTransition(async () => {
      const res = await eliminarObservacionMes(o.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      cargar()
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <ClipboardList className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-700">
            Seguimiento mensual · observaciones y planes de acción · DQI {year}
          </h2>
          {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Evidencia de cada mes que no cumplió la meta{target != null ? ` (${fmtPPM(target)}, menos es mejor)` : ""}: qué pasó
          (observación), qué se hizo (plan de acción, con 5 Porqués o PDCA) y lo que se trató del DQI en la matinal de
          Logística. Abrí el mes para cargar.
        </p>

        {target != null && fuera.length > 0 && (
          <div
            className={`mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              fueraSinEvidencia.length
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {fueraSinEvidencia.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {fuera.length} {fuera.length === 1 ? "mes" : "meses"} fuera de meta ·{" "}
            {fueraSinEvidencia.length
              ? `${fueraSinEvidencia.length} sin evidencia: ${fueraSinEvidencia.map((x) => MESES_FULL[x.m - 1]).join(", ")}`
              : "todos con evidencia cargada"}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Mes</th>
                <th className="py-2 pr-2 text-right">DQI</th>
                <th className="py-2 pr-2 text-right">Meta</th>
                <th className="py-2 pr-2">Estado</th>
                <th className="py-2 pr-2 text-center">Observ.</th>
                <th className="py-2 pr-2 text-center">Planes</th>
                <th className="py-2 pr-2 text-center">Acciones matinal</th>
                <th className="py-2">Evidencia</th>
              </tr>
            </thead>
            <tbody>
              {meses
                .slice()
                .reverse()
                .map(({ m, v }) => {
                  const d = porMes(m)
                  const fueraMeta = target != null && v > target
                  const nEv = d.obs.length + d.acciones.length + d.planes.length
                  const open = abierto === m
                  return (
                    <Fragment key={m}>
                      <tr
                        className={`cursor-pointer border-b hover:bg-slate-50 ${open ? "bg-slate-50" : ""}`}
                        onClick={() => {
                          setAbierto(open ? null : m)
                          setTexto("")
                          setEditandoId(null)
                        }}
                      >
                        <td className="py-2 pr-2 font-medium text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {MESES_FULL[m - 1]}
                          </span>
                        </td>
                        <td className={`py-2 pr-2 text-right font-semibold ${fueraMeta ? "text-red-600" : "text-emerald-700"}`}>
                          {fmtPPM(v)}
                        </td>
                        <td className="py-2 pr-2 text-right text-slate-500">{target != null ? fmtPPM(target) : "—"}</td>
                        <td className="py-2 pr-2">
                          {target == null ? (
                            <span className="text-xs text-slate-400">sin meta</span>
                          ) : fueraMeta ? (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">fuera de meta</span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">en meta</span>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-center">{d.obs.length || "—"}</td>
                        <td className="py-2 pr-2 text-center">{d.planes.length || "—"}</td>
                        <td className="py-2 pr-2 text-center">{d.acciones.length || "—"}</td>
                        <td className="py-2">
                          {nEv > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> con evidencia
                            </span>
                          ) : fueraMeta ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                              <AlertTriangle className="h-3 w-3" /> falta cargar
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>

                      {open && (
                        <tr className="border-b bg-slate-50/60">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="grid gap-4 lg:grid-cols-2">
                              {/* Observaciones */}
                              <div>
                                <div className="mb-2 flex items-center gap-2">
                                  <MessageSquareText className="h-4 w-4 text-violet-600" />
                                  <h3 className="text-sm font-semibold text-violet-900">Observaciones</h3>
                                  <span className="text-xs text-muted-foreground">({d.obs.length})</span>
                                </div>
                                {puedeEditar && (
                                  <div className="mb-2 rounded-md border border-violet-200 bg-white p-2">
                                    <Textarea
                                      rows={2}
                                      value={texto}
                                      onChange={(e) => setTexto(e.target.value)}
                                      placeholder={`Qué pasó en ${MESES_FULL[m - 1]}, por qué no se cumplió, qué se decidió…`}
                                      disabled={pending}
                                    />
                                    <div className="mt-2 flex justify-end">
                                      <Button size="sm" onClick={() => guardar(m)} disabled={pending || !texto.trim()}>
                                        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                                        Registrar observación
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                {d.obs.length === 0 ? (
                                  <p className="py-2 text-xs text-muted-foreground">Sin observaciones en {MESES_FULL[m - 1]}.</p>
                                ) : (
                                  <ul className="divide-y rounded-md border bg-white">
                                    {d.obs.map((o) => (
                                      <li key={`${o.origen}-${o.id}`} className="flex items-start gap-2 px-3 py-2">
                                        <div className="min-w-0 flex-1">
                                          {editandoId === o.id ? (
                                            <div className="space-y-2">
                                              <Textarea
                                                rows={2}
                                                value={editTexto}
                                                onChange={(e) => setEditTexto(e.target.value)}
                                                disabled={pending}
                                                autoFocus
                                              />
                                              <div className="flex justify-end gap-2">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 px-2 text-xs"
                                                  onClick={() => setEditandoId(null)}
                                                  disabled={pending}
                                                >
                                                  <X className="mr-1 size-3.5" /> Cancelar
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  className="h-7 px-2 text-xs"
                                                  onClick={() => guardarEdicion(o.id)}
                                                  disabled={pending || !editTexto.trim()}
                                                >
                                                  Guardar
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className="whitespace-pre-wrap text-sm text-slate-800">{o.texto}</p>
                                          )}
                                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            {o.origen === "reunion" && o.reunion_id ? (
                                              <Link
                                                href={`/reuniones/${o.reunion_id}`}
                                                className="mr-1 rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 hover:underline"
                                              >
                                                Matinal {o.reunion_tipo === "logistica" ? "Logística" : (o.reunion_tipo ?? "")}{" "}
                                                {o.reunion_fecha ? fmtFecha(o.reunion_fecha) : ""}
                                              </Link>
                                            ) : null}
                                            {o.autor_nombre ?? "—"} · {fmtFechaHora(o.created_at)}
                                          </p>
                                        </div>
                                        {puedeEditar && o.origen === "pagina" && editandoId !== o.id && (
                                          <div className="flex shrink-0 gap-1">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-7 px-2"
                                              title="Editar"
                                              disabled={pending}
                                              onClick={() => {
                                                setEditandoId(o.id)
                                                setEditTexto(o.texto)
                                              }}
                                            >
                                              <Pencil className="size-3.5" />
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-7 px-2 text-red-600 hover:text-red-700"
                                              title="Eliminar"
                                              disabled={pending}
                                              onClick={() => borrar(o)}
                                            >
                                              <Trash2 className="size-3.5" />
                                            </Button>
                                          </div>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* Planes + acciones de la matinal */}
                              <div className="space-y-3">
                                <div>
                                  <div className="mb-2 flex items-center gap-2">
                                    <ClipboardList className="h-4 w-4 text-emerald-600" />
                                    <h3 className="text-sm font-semibold text-emerald-900">Planes de acción (punto 1.4)</h3>
                                    <span className="text-xs text-muted-foreground">({d.planes.length})</span>
                                    {puedeEditar && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="ml-auto h-7 px-2 text-xs"
                                        onClick={() => onCrearPlan(m)}
                                      >
                                        <Plus className="mr-1 size-3.5" /> Crear plan
                                      </Button>
                                    )}
                                  </div>
                                  {d.planes.length === 0 ? (
                                    <p className="py-2 text-xs text-muted-foreground">Sin planes para {MESES_FULL[m - 1]}.</p>
                                  ) : (
                                    <ul className="divide-y rounded-md border bg-white">
                                      {d.planes.map((p) => (
                                        <li key={p.id} className="px-3 py-2">
                                          <div className="mb-0.5 flex items-center gap-2">
                                            <span
                                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ESTADO_PLAN[p.estado] ?? "bg-slate-100 text-slate-600"}`}
                                            >
                                              {p.estado.replace("_", " ")}
                                            </span>
                                            <span className="text-[11px] text-slate-400">prioridad {p.prioridad}</span>
                                          </div>
                                          <p className="text-sm text-slate-700">{p.descripcion}</p>
                                          <p className="mt-0.5 text-[11px] text-slate-400">
                                            {p.responsable ?? "—"}
                                            {p.fecha_limite ? ` · vence ${fmtFecha(p.fecha_limite)}` : ""}
                                          </p>
                                          <div className="mt-1.5">
                                            <PlanHerramientasInline
                                              planId={p.id}
                                              tituloSugerido={`DQI ${MESES_FULL[m - 1]} ${year}: ${p.descripcion.slice(0, 60)}`}
                                              puedeAplicar={puedeEditar}
                                              onSaved={onPlanesChanged}
                                            />
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                                <div>
                                  <div className="mb-2 flex items-center gap-2">
                                    <ListTodo className="h-4 w-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-blue-900">Acciones de la matinal de Logística</h3>
                                    <span className="text-xs text-muted-foreground">({d.acciones.length})</span>
                                  </div>
                                  {d.acciones.length === 0 ? (
                                    <p className="py-2 text-xs text-muted-foreground">
                                      Sin acciones sobre el DQI en las reuniones de {MESES_FULL[m - 1]}.
                                    </p>
                                  ) : (
                                    <ul className="divide-y rounded-md border bg-white">
                                      {d.acciones.map((a) => (
                                        <li key={a.id} className="px-3 py-2">
                                          <div className="mb-0.5 flex items-center gap-2">
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ESTADO_ACCION[a.estado]?.cls ?? ""}`}>
                                              {ESTADO_ACCION[a.estado]?.label ?? a.estado}
                                            </span>
                                            <Link
                                              href={`/reuniones/${a.reunion_id}`}
                                              className="text-[11px] font-medium text-blue-700 hover:underline"
                                            >
                                              Reunión {fmtFecha(a.reunion_fecha)}
                                            </Link>
                                          </div>
                                          <p className="text-sm text-slate-700">{a.descripcion}</p>
                                          <p className="mt-0.5 text-[11px] text-slate-400">
                                            {a.responsable_nombre ?? "—"}
                                            {a.fecha_compromiso ? ` · compromiso ${fmtFecha(a.fecha_compromiso)}` : ""}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
            </tbody>
          </table>
          {meses.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Todavía no hay meses medidos en {year}.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
