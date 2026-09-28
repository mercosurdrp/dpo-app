"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ClipboardCheck,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  decidirAnomaliaInspeccion,
  listarRubrosInspeccion,
  obtenerAnomaliasInspeccion,
  obtenerEstadoInspeccion,
  periodoDeReunion,
  type AnomaliaInspeccion,
  type AnomaliasInspeccion,
  type DestinoDecision,
  type EstadoInspeccion,
  type RubroInspeccion,
} from "@/actions/inspeccion-edilicia"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function nombreMes(periodo: string): string {
  const m = parseInt(periodo.slice(5, 7), 10)
  return `${MESES[m - 1]} ${periodo.slice(0, 4)}`
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ""
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

const ESTADO: Record<string, { label: string; clase: string }> = {
  no_generada: { label: "Sin generar", clase: "bg-slate-100 text-slate-700" },
  pendiente: { label: "Sin hacer", clase: "bg-red-100 text-red-800" },
  en_curso: { label: "En curso", clase: "bg-amber-100 text-amber-800" },
  cerrada: { label: "Hecha", clase: "bg-emerald-100 text-emerald-700" },
}

const PDA_ESTADO: Record<string, string> = {
  planificado: "planificado",
  en_curso: "en curso",
  ejecutado: "ejecutado",
}

interface ResponsableOpt {
  id: string
  nombre: string
}

interface Props {
  fechaReunion: string
  reunionId: string
  puedeEditar: boolean
  responsables: ResponsableOpt[]
  /** Se llama cuando una decisión dejó un compromiso nuevo en el Action Log. */
  onCompromisoCreado?: () => void
}

/**
 * Temario de la reunión de Mantenimiento: la recorrida mensual del depósito.
 *
 * La recorrida se completa en la app de mantenimiento edilicio; acá se muestra
 * cómo salió y, sobre todo, los puntos que se marcaron "No". Cada uno se
 * decide desde la reunión con los mismos tres caminos de esa app: plan de
 * acción (queda también como compromiso del Action Log), largo plazo o no
 * aplica. Eso es lo que el punto 1.7 del DPO pide de esta reunión: que la
 * rutina exista y que lo que da mal tenga un destino.
 */
export function SeccionInspeccionEdilicia({
  fechaReunion,
  reunionId,
  puedeEditar,
  responsables,
  onCompromisoCreado,
}: Props) {
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<EstadoInspeccion | null>(null)
  const [periodo, setPeriodo] = useState("")
  const [anomalias, setAnomalias] = useState<AnomaliasInspeccion | null>(null)
  const [cargandoAnomalias, setCargandoAnomalias] = useState(false)
  const [decidiendo, setDecidiendo] = useState<AnomaliaInspeccion | null>(null)

  const cargarAnomalias = useCallback(async (revisionId: number) => {
    setCargandoAnomalias(true)
    const a = await obtenerAnomaliasInspeccion(revisionId)
    setAnomalias(a)
    setCargandoAnomalias(false)
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const p = await periodoDeReunion(fechaReunion)
      const e = await obtenerEstadoInspeccion(p)
      if (!vivo) return
      setPeriodo(p)
      setEstado(e)
      setCargando(false)
      if (e?.revision_id && (e.anomalias ?? 0) > 0) {
        const a = await obtenerAnomaliasInspeccion(e.revision_id)
        if (!vivo) return
        setAnomalias(a)
      }
    })()
    return () => {
      vivo = false
    }
  }, [fechaReunion])

  const badge = ESTADO[estado?.estado ?? "no_generada"] ?? ESTADO.no_generada
  const url = estado?.url ?? "https://plan-mantenimiento-edilicio.vercel.app"
  const hecha = estado?.estado === "cerrada" || estado?.estado === "en_curso"
  const sinDecidir = anomalias?.resumen.sin_decidir ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Inspección edilicia del mes
          {periodo && (
            <span className="text-sm font-normal text-muted-foreground">
              · {nombreMes(periodo)}
            </span>
          )}
          {!cargando && (
            <Badge className={`${badge.clase} ml-auto`} variant="secondary">
              {badge.label}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {cargando ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando la app de mantenimiento…
          </div>
        ) : !estado ? (
          <p className="text-muted-foreground">
            No se pudo consultar la app de mantenimiento. Volvé a intentar o entrá
            directo a la recorrida.
          </p>
        ) : (
          <>
            {hecha ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  Relevado:{" "}
                  <strong>
                    {estado.items_respondidos}/{estado.items_total}
                  </strong>{" "}
                  ítems
                </span>
                <span>
                  Sin anomalías:{" "}
                  <strong>{(estado.adherencia_pct ?? 0).toFixed(0)}%</strong>
                </span>
                <span>
                  Anomalías:{" "}
                  <strong
                    className={estado.anomalias ? "text-red-700" : "text-emerald-700"}
                  >
                    {estado.anomalias}
                  </strong>
                </span>
              </div>
            ) : estado.estado === "no_generada" ? (
              <p className="text-muted-foreground">
                La recorrida de {nombreMes(periodo)} no se generó en la app de
                mantenimiento, así que no hay puntos para revisar.
              </p>
            ) : (
              <p className="text-muted-foreground">
                La recorrida de este mes todavía no se hizo. Son 27 puntos sobre los
                4 sectores del depósito y lleva unos quince minutos.
              </p>
            )}

            {estado.secciones && estado.secciones.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {estado.secciones.map((s) => (
                  <div key={s.seccion_num} className="rounded border px-2 py-1.5">
                    <div className="truncate text-xs text-muted-foreground">
                      {s.seccion_titulo}
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        s.adherencia_pct >= 100
                          ? "text-emerald-700"
                          : s.adherencia_pct >= 80
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}
                    >
                      {s.adherencia_pct.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Los puntos que dieron "No": el temario real de la reunión. */}
            {hecha && (estado.anomalias ?? 0) > 0 && (
              <div className="space-y-2 rounded-md border border-red-200 bg-red-50/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-700" />
                  <span className="font-semibold text-red-900">
                    Puntos marcados &quot;No&quot;
                  </span>
                  {anomalias && (
                    <span className="text-xs text-muted-foreground">
                      · {anomalias.resumen.total} en total
                      {sinDecidir > 0 && (
                        <>
                          , <strong className="text-red-800">{sinDecidir} sin decidir</strong>
                        </>
                      )}
                    </span>
                  )}
                  {cargandoAnomalias && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>

                {!anomalias && !cargandoAnomalias ? (
                  <p className="text-muted-foreground">
                    No se pudo traer el detalle de los puntos. Volvé a intentar.
                  </p>
                ) : (
                  <ul className="divide-y divide-red-100">
                    {anomalias?.items.map((it) => (
                      <li
                        key={it.pregunta_id}
                        className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-muted-foreground">
                              {it.codigo}
                            </span>
                            <Badge variant="outline" className="text-xs font-normal">
                              {it.seccion_titulo}
                            </Badge>
                            {it.categoria && (
                              <span className="text-xs text-muted-foreground">
                                {it.categoria}
                              </span>
                            )}
                            {it.revisiones_en_nok > 1 && (
                              <Badge className="bg-amber-100 text-amber-800" variant="secondary">
                                Viene mal hace {it.revisiones_en_nok} meses
                              </Badge>
                            )}
                          </div>
                          <div className="font-medium">{it.pregunta}</div>
                          {it.comentario && (
                            <div className="text-muted-foreground">
                              “{it.comentario}”
                            </div>
                          )}
                          <DecisionResumen it={it} />
                        </div>
                        <div className="shrink-0">
                          {!it.decision ? (
                            puedeEditar ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setDecidiendo(it)}
                              >
                                Decidir
                              </Button>
                            ) : (
                              <Badge className="bg-red-100 text-red-800" variant="secondary">
                                Sin decidir
                              </Badge>
                            )
                          ) : puedeEditar ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => setDecidiendo(it)}
                            >
                              Cambiar
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline"
            >
              {estado.estado === "cerrada" ? "Ver la recorrida" : "Completar la recorrida"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </CardContent>

      {decidiendo && estado?.revision_id && (
        <DecidirAnomaliaDialog
          anomalia={decidiendo}
          reunionId={reunionId}
          periodo={periodo}
          revisionId={estado.revision_id}
          responsables={responsables}
          onClose={() => setDecidiendo(null)}
          onDecidido={(creoCompromiso) => {
            setDecidiendo(null)
            if (estado.revision_id) void cargarAnomalias(estado.revision_id)
            if (creoCompromiso) onCompromisoCreado?.()
          }}
        />
      )}
    </Card>
  )
}

function DecisionResumen({ it }: { it: AnomaliaInspeccion }) {
  const d = it.decision
  if (!d) {
    return (
      <div className="text-xs text-red-800">
        Sin decidir: hay que definir si se hace un plan, se difiere o no aplica.
      </div>
    )
  }
  if (d.destino === "plan") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge className="bg-emerald-100 text-emerald-800" variant="secondary">
          Plan de acción
        </Badge>
        <span>
          {d.pda_codigo && <span className="font-mono">{d.pda_codigo}</span>}{" "}
          {d.pda_titulo}
          {d.pda_estado && (
            <span className="text-muted-foreground">
              {" "}· {PDA_ESTADO[d.pda_estado] ?? d.pda_estado}
            </span>
          )}
        </span>
      </div>
    )
  }
  if (d.destino === "largo_plazo") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge
          className={
            it.decision_vencida
              ? "bg-red-100 text-red-800"
              : "bg-amber-100 text-amber-800"
          }
          variant="secondary"
        >
          {it.decision_vencida ? "Largo plazo · vencido" : "Largo plazo"}
        </Badge>
        <span>
          {d.motivo}
          {d.fecha_revision && (
            <span className="text-muted-foreground">
              {" "}· revisar el {fechaCorta(d.fecha_revision)}
            </span>
          )}
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge className="bg-slate-100 text-slate-700" variant="secondary">
        No aplica
      </Badge>
      <span>{d.motivo}</span>
    </div>
  )
}

// ---------- diálogo de decisión ----------

const DESTINOS: { valor: DestinoDecision; titulo: string; ayuda: string }[] = [
  {
    valor: "plan",
    titulo: "Plan de acción",
    ayuda:
      "Se crea el plan en la app de mantenimiento y queda como compromiso en el Action Log de esta reunión.",
  },
  {
    valor: "largo_plazo",
    titulo: "Largo plazo",
    ayuda: "Se difiere con un motivo y una fecha para volver a mirarlo.",
  },
  {
    valor: "no_aplica",
    titulo: "No aplica",
    ayuda: "Se descarta con un motivo. Queda registrado para el auditor.",
  },
]

function DecidirAnomaliaDialog({
  anomalia,
  reunionId,
  periodo,
  revisionId,
  responsables,
  onClose,
  onDecidido,
}: {
  anomalia: AnomaliaInspeccion
  reunionId: string
  periodo: string
  revisionId: number
  responsables: ResponsableOpt[]
  onClose: () => void
  onDecidido: (creoCompromiso: boolean) => void
}) {
  // Si ya tiene un plan, volver a elegir "plan" crearía otro PDA: el plan
  // existente se toca desde la app de mantenimiento, y acá sólo se puede
  // pasar el punto a largo plazo o no aplica.
  const yaTienePlan = anomalia.decision?.destino === "plan"
  const [destino, setDestino] = useState<DestinoDecision>(
    yaTienePlan ? "largo_plazo" : (anomalia.decision?.destino ?? "plan"),
  )
  const [titulo, setTitulo] = useState(
    anomalia.comentario?.trim() || anomalia.pregunta,
  )
  const [descripcion, setDescripcion] = useState("")
  const [responsableId, setResponsableId] = useState("")
  const [fechaProbable, setFechaProbable] = useState("")
  const [rubro, setRubro] = useState(anomalia.categoria ?? "")
  const [rubros, setRubros] = useState<RubroInspeccion[]>([])
  const [motivo, setMotivo] = useState(anomalia.decision?.motivo ?? "")
  const [fechaRevision, setFechaRevision] = useState(
    anomalia.decision?.fecha_revision?.slice(0, 10) ?? "",
  )
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    listarRubrosInspeccion().then((r) => {
      if (vivo) setRubros(r)
    })
    return () => {
      vivo = false
    }
  }, [])

  // La categoría de la recorrida ("Electricas", "Obras civiles"…) no coincide
  // con los rubros de los planes: si no está en la lista, se elige a mano.
  const opcionesRubro = useMemo(() => {
    const nombres = rubros.map((r) => r.nombre)
    if (rubro && !nombres.includes(rubro)) return [rubro, ...nombres]
    return nombres
  }, [rubros, rubro])

  const responsablesOrdenados = useMemo(
    () => [...responsables].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [responsables],
  )

  const puedeGuardar =
    destino === "plan"
      ? titulo.trim().length > 0
      : motivo.trim().length > 0

  async function guardar() {
    if (!puedeGuardar || guardando) return
    setGuardando(true)
    const responsable = responsables.find((r) => r.id === responsableId)
    const res = await decidirAnomaliaInspeccion({
      reunionId,
      periodo,
      revisionId,
      preguntaId: anomalia.pregunta_id,
      codigo: anomalia.codigo,
      pregunta: anomalia.pregunta,
      destino,
      motivo,
      fechaRevision: fechaRevision || null,
      plan:
        destino === "plan"
          ? {
              titulo,
              descripcion,
              responsableId: responsableId || null,
              responsableNombre: responsable?.nombre ?? "",
              fechaProbable: fechaProbable || null,
              rubro,
            }
          : undefined,
    })
    setGuardando(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    if (res.data.aviso) {
      toast.warning(res.data.aviso)
    } else if (destino === "plan") {
      toast.success(
        `${res.data.decision.pda_codigo ?? "Plan"} creado y agregado al Action Log`,
      )
    } else {
      toast.success("Decisión registrada")
    }
    onDecidido(res.data.compromisoCreado)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Punto {anomalia.codigo} · {anomalia.seccion_titulo}
          </DialogTitle>
          <DialogDescription>{anomalia.pregunta}</DialogDescription>
        </DialogHeader>

        {anomalia.comentario && (
          <p className="rounded bg-muted px-3 py-2 text-sm">
            Observación de la recorrida: “{anomalia.comentario}”
          </p>
        )}

        <RadioGroup
          value={destino}
          onValueChange={(v) => setDestino(v as DestinoDecision)}
          className="gap-2"
        >
          {DESTINOS.map((d) => {
            const deshabilitado = d.valor === "plan" && yaTienePlan
            return (
              <label
                key={d.valor}
                className={`flex items-start gap-3 rounded-md border p-3 ${
                  deshabilitado
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer"
                } ${destino === d.valor ? "border-primary bg-primary/5" : ""}`}
              >
                <RadioGroupItem
                  value={d.valor}
                  className="mt-0.5"
                  disabled={deshabilitado}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{d.titulo}</span>
                  <span className="block text-xs text-muted-foreground">
                    {deshabilitado
                      ? `Ya tiene el plan ${anomalia.decision?.pda_codigo ?? ""}. Se edita desde la app de mantenimiento.`
                      : d.ayuda}
                  </span>
                </span>
              </label>
            )
          })}
        </RadioGroup>

        {destino === "plan" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="insp-titulo">Título del plan</Label>
              <Input
                id="insp-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="insp-desc">Descripción (opcional)</Label>
              <Textarea
                id="insp-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Responsable</Label>
                <Select value={responsableId} onValueChange={(v) => setResponsableId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir" />
                  </SelectTrigger>
                  <SelectContent>
                    {responsablesOrdenados.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="insp-fecha">Fecha probable</Label>
                <Input
                  id="insp-fecha"
                  type="date"
                  value={fechaProbable}
                  onChange={(e) => setFechaProbable(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Rubro</Label>
              {opcionesRubro.length > 0 ? (
                <Select value={rubro} onValueChange={(v) => setRubro(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcionesRubro.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={rubro}
                  onChange={(e) => setRubro(e.target.value)}
                  placeholder="Eléctrico, Plomería, Pintura…"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="insp-motivo">Motivo</Label>
              <Textarea
                id="insp-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder={
                  destino === "largo_plazo"
                    ? "Por qué se difiere y qué tiene que pasar antes"
                    : "Por qué este punto no corresponde"
                }
              />
            </div>
            {destino === "largo_plazo" && (
              <div className="space-y-1">
                <Label htmlFor="insp-rev">Volver a mirarlo el</Label>
                <Input
                  id="insp-rev"
                  type="date"
                  value={fechaRevision}
                  onChange={(e) => setFechaRevision(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={!puedeGuardar || guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {destino === "plan" ? "Crear plan" : "Guardar decisión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
