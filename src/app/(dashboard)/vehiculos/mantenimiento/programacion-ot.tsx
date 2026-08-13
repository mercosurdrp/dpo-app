"use client"

// Programación de órdenes de trabajo (DPO 2.2/2.4): el Supervisor de Flota
// planifica qué se le hace a cada unidad día a día, queda el registro histórico
// y cada orden se descarga en PDF para el mecánico.
//
// Dos vistas del mismo dato: la SEMANA (lo que hay que hacer ahora) y el
// CALENDARIO del mes, que además proyecta el plan preventivo — es la vista que
// pide el R2.2.3 (plan preventivo en herramienta digital).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ProveedorPicker } from "./_components/proveedor-picker"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { CalendarioPreventivo } from "./_components/calendario-preventivo"
import type { LecturaDia } from "@/lib/flota/calendario-preventivo"
import {
  cerrarOtProgramada,
  createOtProgramada,
  deleteOtProgramada,
  getOtCandidatasParaVincular,
  getOtProgramadas,
  llevarOtAlTaller,
  resolverOtProgramada,
  updateOtProgramada,
  vincularOtProgramada,
  type ComprobanteInput,
  type OtCandidata,
  type OtProgramada,
  type OtProgramadaEstado,
} from "@/actions/ot-programadas"
import { subirFacturasMantenimiento } from "@/actions/mantenimiento-vehiculos"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import {
  GASTO_TIPO_MANTENIMIENTO_LABELS,
  type EstadoPlanCelda,
  type EstadoPlanVehiculo,
  type MantenimientoPlanTarea,
  type MantenimientoProveedor,
  type MantenimientoTipo,
} from "@/types/database"
import type { ServiceGeneralUnidad } from "@/lib/vehiculos/service-general"
import type { LecturaSugerida } from "@/lib/vehiculos/lecturas"

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

const ESTADO_LABEL: Record<OtProgramadaEstado, string> = {
  planificada: "Planificada",
  enviada: "Enviada",
  en_taller: "En taller",
  realizada: "Realizada",
  cancelada: "Cancelada",
}
const ESTADO_CLS: Record<OtProgramadaEstado, string> = {
  planificada: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  enviada: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  en_taller: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  realizada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  cancelada: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
}

const pad = (n: number) => String(n).padStart(2, "0")
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Lunes de la semana de una fecha ISO. */
function lunesDe(fechaIso: string): string {
  const d = new Date(`${fechaIso}T00:00:00`)
  const dow = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - dow)
  return iso(d)
}
function addDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return iso(d)
}
const fmtCorta = (fechaIso: string) =>
  `${fechaIso.slice(8, 10)}/${fechaIso.slice(5, 7)}`

interface Sugerencia {
  texto: string
  estado: "vencido" | "proximo"
}

/** Una tarea del plan con cómo viene esa unidad (null = nunca se le hizo). */
export interface TareaConEstado {
  tarea: MantenimientoPlanTarea
  celda: EstadoPlanCelda | null
}

export interface DatosPlanUnidad {
  esAutoelevador: boolean
  tareas: TareaConEstado[]
  kmActual: number | null
  horasActuales: number | null
  lecturas: LecturaSugerida[]
}

/** Vencidas primero, después las próximas: es el orden en que se tildan. */
const pesoEstado = (e: EstadoPlanCelda["estado"] | undefined) =>
  e === "vencido" ? 3 : e === "proximo" ? 2 : e === "ok" ? 1 : 0

export function ProgramacionOt({
  estados,
  tareas,
  historialLecturas,
  programacion,
  ultimasLecturas,
  proveedores,
  onProveedorCreado,
  puedeEditar,
}: {
  estados: EstadoPlanVehiculo[]
  tareas: MantenimientoPlanTarea[]
  /** Lecturas por dominio: el calendario estima con ellas las tareas por km/horas. */
  historialLecturas: Record<string, LecturaDia[]>
  /** Service general por unidad (Tablero operativo): fuente única de su fecha. */
  programacion: ServiceGeneralUnidad[]
  /** Últimas lecturas de odómetro/horómetro por unidad, para sugerir al cargar. */
  ultimasLecturas: Record<string, LecturaSugerida[]>
  proveedores: MantenimientoProveedor[]
  onProveedorCreado: (p: MantenimientoProveedor) => void
  puedeEditar: boolean
}) {
  const hoy = iso(new Date())
  const [lunes, setLunes] = useState(() => lunesDe(hoy))
  const [cacheOtas, setOtas] = useState<{ clave: string; data: OtProgramada[] } | null>(null)
  const [dialog, setDialog] = useState<{
    ot: OtProgramada | null
    fecha: string
    dominio?: string
    tareasIniciales?: string[]
  } | null>(null)
  /** Cambia al guardar: el calendario vuelve a pedir las OT de su mes. */
  const [refreshToken, setRefreshToken] = useState(0)

  const domingo = addDias(lunes, 6)

  // Las órdenes de la semana se guardan junto con la clave de su rango, así una
  // semana recién elegida no muestra las de la anterior mientras llega la
  // respuesta. `refreshToken` entra en la clave: al guardar, semana y calendario
  // se recargan por el mismo mecanismo.
  const claveSemana = `${lunes}|${domingo}|${refreshToken}`
  useEffect(() => {
    let cancelado = false
    void getOtProgramadas({ desde: lunes, hasta: domingo }).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setOtas({ clave: claveSemana, data: res.data })
    })
    return () => {
      cancelado = true
    }
  }, [claveSemana, lunes, domingo])

  const otas = cacheOtas?.clave === claveSemana ? cacheOtas.data : null

  const dominios = useMemo(
    () => estados.map((e) => e.vehiculo.dominio).sort(),
    [estados],
  )

  /** Todo lo que el panel del taller necesita de una unidad: las tareas que le
   *  corresponden por tipo, cómo viene cada una en el plan (vencida, próxima) y
   *  las últimas lecturas para sugerir el kilometraje. */
  const datosPlanDe = useCallback(
    (dom: string): DatosPlanUnidad => {
      const est = estados.find((e) => e.vehiculo.dominio === dom)
      const tipo = est?.vehiculo.tipo ?? "camion"
      const celdas = new Map((est?.celdas ?? []).map((c) => [c.tareaId, c]))
      return {
        esAutoelevador: tipo === "autoelevador",
        tareas: tareas
          .filter((t) => t.activo && t.tipo_vehiculo === tipo)
          .map((t) => ({ tarea: t, celda: celdas.get(t.id) ?? null }))
          .sort((a, b) => pesoEstado(b.celda?.estado) - pesoEstado(a.celda?.estado)),
        kmActual: est?.kmActual ?? null,
        horasActuales: est?.horasActuales ?? null,
        lecturas: (ultimasLecturas[dom] ?? []).slice(0, 4),
      }
    },
    [estados, tareas, ultimasLecturas],
  )

  // Sugerencias por dominio: tareas del plan vencidas o próximas.
  const tareaNombre = useMemo(
    () => new Map(tareas.map((t) => [t.id, t.nombre])),
    [tareas],
  )
  const sugerenciasPorDominio = useMemo(() => {
    const out = new Map<string, Sugerencia[]>()
    for (const e of estados) {
      const sug: Sugerencia[] = []
      for (const c of e.celdas) {
        if (c.estado !== "vencido" && c.estado !== "proximo") continue
        const nombre = tareaNombre.get(c.tareaId)
        if (!nombre) continue
        sug.push({ texto: nombre, estado: c.estado })
      }
      sug.sort((a, b) => (a.estado === b.estado ? 0 : a.estado === "vencido" ? -1 : 1))
      out.set(e.vehiculo.dominio, sug)
    }
    return out
  }, [estados, tareaNombre])

  const porDia = useMemo(() => {
    const map = new Map<string, OtProgramada[]>()
    for (const o of otas ?? []) {
      if (!map.has(o.fecha_programada)) map.set(o.fecha_programada, [])
      map.get(o.fecha_programada)!.push(o)
    }
    return map
  }, [otas])

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="programacion" />

      <Tabs defaultValue="calendario" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendario">Calendario del mes</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario">
          <CalendarioPreventivo
            estados={estados}
            tareas={tareas}
            historialLecturas={historialLecturas}
            programacion={programacion}
            puedeEditar={puedeEditar}
            refreshToken={refreshToken}
            onProgramar={(fecha, dominio, tareasSugeridas) =>
              setDialog({ ot: null, fecha, dominio, tareasIniciales: tareasSugeridas })
            }
            onAbrirOt={(o) => setDialog({ ot: o, fecha: o.fecha_programada })}
          />
        </TabsContent>

        <TabsContent value="semana" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-muted-foreground" />
              Semana del {fmtCorta(lunes)} al {fmtCorta(domingo)}
              {otas != null && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {otas.length} {otas.length === 1 ? "orden" : "órdenes"}
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setLunes(addDias(lunes, -7))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLunes(lunesDe(hoy))}>
                Hoy
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLunes(addDias(lunes, 7))}>
                <ChevronRight className="size-4" />
              </Button>
              {puedeEditar && (
                <Button size="sm" onClick={() => setDialog({ ot: null, fecha: hoy >= lunes && hoy <= domingo ? hoy : lunes })}>
                  <Plus className="mr-1 size-4" /> Programar OT
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Qué se le hace a cada unidad y qué día. Cada orden se descarga en PDF para
            enviarla o entregarla impresa al mecánico, y la semana queda como registro
            del programa de mantenimiento (DPO 2.2 / 2.4).
          </p>
        </CardHeader>
        <CardContent>
          {otas == null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
              {DIAS.map((nombre, i) => {
                const fecha = addDias(lunes, i)
                const dia = porDia.get(fecha) ?? []
                const esHoy = fecha === hoy
                return (
                  <div
                    key={fecha}
                    className={cn(
                      "flex min-h-28 flex-col gap-1.5 rounded-md border border-border p-2",
                      esHoy && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide",
                        esHoy ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {nombre} {fmtCorta(fecha)}
                    </p>
                    {dia.map((o) => (
                      <button
                        key={o.id}
                        className="rounded-md border border-border bg-card p-1.5 text-left transition-colors hover:border-primary/40"
                        onClick={() => puedeEditar && setDialog({ ot: o, fecha: o.fecha_programada })}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold">{o.dominio}</span>
                          <Badge className={cn("px-1.5 py-0 text-[10px]", ESTADO_CLS[o.estado])}>
                            {ESTADO_LABEL[o.estado]}
                          </Badge>
                        </div>
                        {o.ot_numero && (
                          <p className="font-mono text-[11px] font-semibold">OT {o.ot_numero}</p>
                        )}
                        <p className="truncate text-[11px] text-muted-foreground">
                          {o.tareas.length} {o.tareas.length === 1 ? "trabajo" : "trabajos"}
                          {o.taller ? ` · ${o.taller}` : ""}
                        </p>
                        <span
                          role="link"
                          tabIndex={0}
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`/api/vehiculos/ot-programada/pdf?id=${o.id}`, "_blank")
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation()
                              window.open(`/api/vehiculos/ot-programada/pdf?id=${o.id}`, "_blank")
                            }
                          }}
                        >
                          <FileDown className="size-3" /> PDF
                        </span>
                      </button>
                    ))}
                    {dia.length === 0 && (
                      <p className="text-[11px] text-muted-foreground/60">Sin órdenes</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {dialog && (
        <OtDialog
          ot={dialog.ot}
          fechaInicial={dialog.fecha}
          dominioInicial={dialog.dominio}
          tareasIniciales={dialog.tareasIniciales}
          dominios={dominios}
          sugerenciasPorDominio={sugerenciasPorDominio}
          datosPlanDe={datosPlanDe}
          proveedores={proveedores}
          onProveedorCreado={onProveedorCreado}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            setRefreshToken((t) => t + 1)
          }}
        />
      )}
    </div>
  )
}

function OtDialog({
  ot,
  fechaInicial,
  dominioInicial,
  tareasIniciales,
  dominios,
  sugerenciasPorDominio,
  datosPlanDe,
  proveedores,
  onProveedorCreado,
  onClose,
  onSaved,
}: {
  ot: OtProgramada | null
  fechaInicial: string
  /** Unidad preseleccionada al abrir desde el calendario. */
  dominioInicial?: string
  /** Trabajos ya escritos: los vencimientos del día que se está programando. */
  tareasIniciales?: string[]
  dominios: string[]
  sugerenciasPorDominio: Map<string, Sugerencia[]>
  datosPlanDe: (dominio: string) => DatosPlanUnidad
  proveedores: MantenimientoProveedor[]
  onProveedorCreado: (p: MantenimientoProveedor) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [dominio, setDominio] = useState(ot?.dominio ?? dominioInicial ?? "")
  const [fecha, setFecha] = useState(ot?.fecha_programada ?? fechaInicial)
  const [tareasTxt, setTareasTxt] = useState(
    (ot?.tareas ?? tareasIniciales ?? []).join("\n")
  )
  const [taller, setTaller] = useState(ot?.taller ?? "")
  const [notas, setNotas] = useState(ot?.notas ?? "")
  const [estado, setEstado] = useState<OtProgramadaEstado>(ot?.estado ?? "planificada")
  const [saving, setSaving] = useState(false)

  const sugerencias = sugerenciasPorDominio.get(dominio) ?? []
  const lineas = tareasTxt.split("\n").map((l) => l.trim())

  const agregarSugerencia = (s: Sugerencia) => {
    if (lineas.includes(s.texto)) return
    setTareasTxt((prev) => (prev.trim() ? `${prev.trimEnd()}\n${s.texto}` : s.texto))
  }

  const guardar = async () => {
    setSaving(true)
    const tareasArr = tareasTxt.split("\n")
    const res = ot
      ? await updateOtProgramada({
          id: ot.id,
          fecha_programada: fecha,
          tareas: tareasArr,
          taller,
          notas,
          estado,
        })
      : await createOtProgramada({
          dominio,
          fecha_programada: fecha,
          tareas: tareasArr,
          taller,
          notas,
        })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(ot ? "Orden actualizada" : "Orden programada")
    onSaved()
  }

  const eliminar = async () => {
    if (!ot) return
    if (!confirm(`¿Eliminar la orden programada de ${ot.dominio}?`)) return
    setSaving(true)
    const res = await deleteOtProgramada(ot.id)
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Orden eliminada")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {ot
              ? `Orden programada · ${ot.dominio}${ot.ot_numero ? ` · OT ${ot.ot_numero}` : ""}`
              : "Programar orden de trabajo"}
          </DialogTitle>
          <DialogDescription>
            Los trabajos van uno por línea: son el checklist que le llega al mecánico en el PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Lo primero es cerrar la orden: cuando alguien la abre es para eso,
              no para corregirle el taller. Estaba abajo de todo y no se veía. */}
          {ot && <TallerPanel ot={ot} datos={datosPlanDe(ot.dominio)} onHecho={onSaved} />}

          <div className="grid grid-cols-2 gap-3">
            {!ot && (
              <div className="space-y-1">
                <Label>Unidad</Label>
                <Select value={dominio} onValueChange={(v) => setDominio(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegir unidad" />
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
            )}
            <div className="space-y-1">
              <Label>Fecha programada</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            {ot && (
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select
                  value={estado}
                  onValueChange={(v) => setEstado(v as OtProgramadaEstado)}
                  // Con OT de trabajo creada, el estado lo maneja el circuito del
                  // taller (llevar / cerrar): a mano se desincronizaría de la OT real.
                  disabled={!!ot.realizado_id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ESTADO_LABEL) as OtProgramadaEstado[]).map((e) => (
                      <SelectItem key={e} value={e}>
                        {ESTADO_LABEL[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {sugerencias.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Del plan preventivo de {dominio} (click para agregar)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {sugerencias.map((s) => (
                  <button
                    key={s.texto}
                    type="button"
                    onClick={() => agregarSugerencia(s)}
                    disabled={lineas.includes(s.texto)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                      s.estado === "vencido"
                        ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                        : "border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400",
                    )}
                  >
                    {s.estado === "vencido" ? "⚠ " : "• "}
                    {s.texto}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Trabajos a realizar (uno por línea)</Label>
            <Textarea
              value={tareasTxt}
              onChange={(e) => setTareasTxt(e.target.value)}
              rows={6}
              placeholder={"Cambio de aceite y filtros\nRevisión de frenos\n…"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Taller / mecánico</Label>
              <ProveedorPicker
                proveedores={proveedores}
                value={taller}
                onChange={setTaller}
                onCreado={onProveedorCreado}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            {ot && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={eliminar} disabled={saving}>
                <Trash2 className="mr-1 size-4" /> Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving || (!ot && !dominio)}>
              {saving ? "Guardando…" : ot ? "Guardar cambios" : "Programar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
/** Últimas lecturas reales de la unidad: evita tipear el kilometraje de memoria. */
function ChipsLectura({
  lecturas,
  unidad,
  onElegir,
}: {
  lecturas: LecturaSugerida[]
  unidad: string
  onElegir: (valor: string) => void
}) {
  if (lecturas.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {lecturas.map((l) => (
        <button
          key={`${l.fecha}-${l.odometro}`}
          type="button"
          onClick={() => onElegir(String(l.odometro))}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          {l.odometro.toLocaleString("es-AR")} {unidad} · {fmtCorta(l.fecha)}
        </button>
      ))}
    </div>
  )
}

interface ComprobanteForm {
  proveedor: string
  numero: string
  monto: string
  archivo: File | null
}

const nuevoComprobante = (): ComprobanteForm => ({
  proveedor: "",
  numero: "",
  monto: "",
  archivo: null,
})

const ACCEPT_COMPROBANTE = "image/*,application/pdf,.pdf"

/**
 * Sube las fotos y devuelve los comprobantes listos para la action.
 * null = falló una subida (ya se avisó) y no hay que guardar nada.
 */
async function subirComprobantes(
  dominio: string,
  filas: ComprobanteForm[],
): Promise<ComprobanteInput[] | null> {
  const utiles = filas.filter(
    (f) => f.archivo || f.proveedor.trim() || f.numero.trim() || f.monto.trim(),
  )
  if (utiles.length === 0) return []

  const fd = new FormData()
  fd.append("dominio", dominio)
  const conArchivo = utiles.filter((f) => f.archivo)
  for (const f of conArchivo) {
    // Si la compresión falla (formato raro, canvas) se sube el original: no
    // puede cortar el cierre de la OT.
    let archivo = f.archivo as File
    try {
      archivo = await comprimirImagen(archivo)
    } catch {
      archivo = f.archivo as File
    }
    fd.append("facturas", archivo)
  }

  let urls: string[] = []
  if (conArchivo.length > 0) {
    const res = await subirFacturasMantenimiento(fd)
    if ("error" in res) {
      toast.error(res.error)
      return null
    }
    urls = res.data
  }

  let i = 0
  return utiles.map((f) => ({
    proveedor: f.proveedor.trim() || null,
    numero: f.numero.trim() || null,
    montoTotal: f.monto.trim() ? Number(f.monto.replace(",", ".")) : null,
    adjuntoUrl: f.archivo ? (urls[i++] ?? null) : null,
  }))
}

/** Comprobantes de la OT: el mecánico y los repuestos facturan por separado. */
function ComprobantesEditor({
  filas,
  setFilas,
  proveedores,
}: {
  filas: ComprobanteForm[]
  setFilas: (f: ComprobanteForm[]) => void
  /** Si no viene, el picker toma el catálogo del provider más cercano. */
  proveedores?: MantenimientoProveedor[]
}) {
  const set = (i: number, patch: Partial<ComprobanteForm>) =>
    setFilas(filas.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-xs">Foto de la factura</Label>
          <p className="text-[11px] text-muted-foreground">
            Una por proveedor: la del mecánico y la de los repuestos suelen venir separadas.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFilas([...filas, nuevoComprobante()])}
        >
          <Plus className="mr-1 size-3.5" /> Agregar
        </Button>
      </div>

      {filas.map((f, i) => (
        <div key={i} className="grid grid-cols-12 items-end gap-1.5">
          <div className="col-span-5">
            <ProveedorPicker
              value={f.proveedor}
              onChange={(v) => set(i, { proveedor: v })}
              proveedores={proveedores}
              placeholder="Proveedor"
            />
          </div>
          <Input
            className="col-span-3"
            value={f.numero}
            onChange={(e) => set(i, { numero: e.target.value })}
            placeholder="N° factura"
          />
          <Input
            className="col-span-3"
            inputMode="decimal"
            value={f.monto}
            onChange={(e) => set(i, { monto: e.target.value })}
            placeholder="Monto"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="col-span-1"
            title="Quitar"
            onClick={() => setFilas(filas.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
          <div className="col-span-12">
            <Input
              type="file"
              accept={ACCEPT_COMPROBANTE}
              className="h-8 text-xs file:mr-2 file:text-xs"
              onChange={(e) => set(i, { archivo: e.target.files?.[0] ?? null })}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Órdenes de trabajo ya cargadas que pueden ser esta misma orden programada.
 *
 * Hasta que existió el circuito programada → OT las dos cosas se cargaban por
 * separado, así que hay órdenes que figuran "planificada" con el trabajo hecho y
 * facturado del otro lado. Vincularlas evita cargar la OT por segunda vez.
 */
function VincularExistente({
  ot,
  onHecho,
}: {
  ot: OtProgramada
  onHecho: () => void
}) {
  const [candidatas, setCandidatas] = useState<OtCandidata[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelado = false
    void getOtCandidatasParaVincular(ot.id).then((res) => {
      if (cancelado) return
      setCandidatas("error" in res ? [] : res.data)
    })
    return () => {
      cancelado = true
    }
  }, [ot.id])

  if (!candidatas || candidatas.length === 0) return null

  const vincular = async (realizadoId: string) => {
    setSaving(true)
    const res = await vincularOtProgramada({ id: ot.id, realizadoId })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Quedó vinculada: la orden ya no figura pendiente")
    onHecho()
  }

  return (
    <div className="space-y-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
      <div>
        <p className="text-sm font-medium text-sky-700 dark:text-sky-400">
          ¿Este trabajo ya está cargado?
        </p>
        <p className="text-xs text-muted-foreground">
          Encontré {candidatas.length === 1 ? "esta orden de trabajo" : "estas órdenes de trabajo"}{" "}
          de {ot.dominio} por esas fechas. Si es la misma, vinculalas y esta orden queda resuelta
          sin cargar nada de nuevo.
        </p>
      </div>
      {candidatas.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2"
        >
          <div className="min-w-0 text-xs">
            <p className="font-semibold">
              OT {c.numero_ot ?? "s/n"} · {fmtCorta(c.fecha)}
            </p>
            <p className="truncate text-muted-foreground">
              {c.taller || "Sin taller"}
              {c.costo != null ? ` · $${c.costo.toLocaleString("es-AR")}` : ""}
              {c.estado === "en_taller" ? " · en taller" : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => vincular(c.id)}>
            Es esta
          </Button>
        </div>
      ))}
    </div>
  )
}

/**
 * El circuito del taller dentro de la orden programada, para no cargar la misma
 * OT dos veces:
 *
 *   se llevó al taller → se crea la ORDEN DE TRABAJO real (queda en taller y la
 *   unidad fuera de servicio desde ese día)
 *   volvió            → se cierra con el kilometraje, el costo y la factura
 *
 * Acá está todo lo que antes había que volver a tipear en "Registrar
 * mantenimiento": tipo, kilometraje con las últimas lecturas, service general y
 * la tabla del plan preventivo. En Órdenes de Trabajo queda la plata: la
 * factura, los repuestos y su proveedor.
 *
 * 🚨 Tildar las tareas del PLAN es lo único que las descuenta del preventivo: si
 * el service se hace y no queda tildado, sigue figurando pendiente.
 */
function TallerPanel({
  ot,
  datos,
  onHecho,
}: {
  ot: OtProgramada
  datos: DatosPlanUnidad
  onHecho: () => void
}) {
  const hoy = iso(new Date())
  const [saving, setSaving] = useState(false)
  const { esAutoelevador, lecturas } = datos

  // Preselección: los trabajos escritos que coinciden con una tarea del plan.
  const lineas = useMemo(
    () => new Set(ot.tareas.map((t) => t.trim().toLowerCase()).filter(Boolean)),
    [ot.tareas],
  )
  const [tildadas, setTildadas] = useState<Set<string>>(
    () =>
      new Set(
        datos.tareas
          .filter(({ tarea }) => lineas.has(tarea.nombre.trim().toLowerCase()))
          .map(({ tarea }) => tarea.id),
      ),
  )

  // Preventivo si lo que se va a hacer sale del plan; si no, correctivo.
  const [tipo, setTipo] = useState<MantenimientoTipo>(() =>
    datos.tareas.some(({ tarea }) => lineas.has(tarea.nombre.trim().toLowerCase()))
      ? "preventivo"
      : "correctivo",
  )
  const [esServiceGeneral, setEsServiceGeneral] = useState(() =>
    ot.tareas.some((t) => t.trim().toLowerCase().includes("service")),
  )
  const [fechaTaller, setFechaTaller] = useState(
    ot.fecha_programada > hoy ? ot.fecha_programada : hoy,
  )
  const [fechaSalida, setFechaSalida] = useState(hoy)
  // El kilometraje ya se cargó al llevarla al taller: viene puesto y sólo se
  // toca si la unidad volvió con otro. Volver a tipearlo era trabajo al pedo.
  const yaCargado = esAutoelevador ? ot.ot_horometro : ot.ot_odometro
  const [medicion, setMedicion] = useState(yaCargado != null ? String(yaCargado) : "")
  const [costo, setCosto] = useState("")
  const [factura, setFactura] = useState("")
  const [obsCierre, setObsCierre] = useState("")
  /** Horas del taller: entrada y resolución. Vacías = se guarda sólo la fecha. */
  const [horaEntrada, setHoraEntrada] = useState("")
  const [horaSalida, setHoraSalida] = useState("")
  const [comprobantes, setComprobantes] = useState<ComprobanteForm[]>([])
  /**
   * Qué pasó con la orden. El caso de todos los días es que el trabajo ya está
   * hecho —la unidad va a la gomería y vuelve el mismo día—, así que arranca en
   * "resuelta": pedir primero la entrada al taller para poder cerrarla es
   * papeleo que termina dejando la orden colgada en "planificada".
   */
  const [modo, setModo] = useState<"resuelta" | "en_taller">("resuelta")

  const unidad = esAutoelevador ? "hs" : "km"
  const labelMedicion = esAutoelevador ? "Horómetro (hs)" : "Odómetro (km)"
  const numero = (v: string) => {
    const n = Number(v.replace(",", "."))
    return v.trim() && isFinite(n) ? n : null
  }
  const medicionParaEnviar = () => {
    const n = numero(medicion)
    return esAutoelevador ? { horometro: n } : { odometro: n }
  }

  const nombresTildados = () =>
    datos.tareas.filter(({ tarea }) => tildadas.has(tarea.id)).map(({ tarea }) => tarea.nombre)

  const llevar = async () => {
    setSaving(true)
    const res = await llevarOtAlTaller({
      id: ot.id,
      fecha: fechaTaller,
      hora: horaEntrada,
      tipo,
      tareaIds: [...tildadas],
      nombresDelPlan: nombresTildados(),
      esServiceGeneral,
      ...medicionParaEnviar(),
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Orden de trabajo creada: la unidad figura en taller")
    onHecho()
  }

  /** El trabajo ya se hizo: crea la orden de trabajo y la cierra de una. */
  const resolver = async () => {
    setSaving(true)
    const comps = await subirComprobantes(ot.dominio, comprobantes)
    if (comps === null) return setSaving(false)
    const res = await resolverOtProgramada({
      id: ot.id,
      fecha: fechaTaller,
      hora: horaEntrada,
      horaSalida,
      tipo,
      tareaIds: [...tildadas],
      nombresDelPlan: nombresTildados(),
      esServiceGeneral,
      costo: numero(costo),
      numero_factura: factura.trim() || undefined,
      observaciones: obsCierre.trim() || undefined,
      facturas: comps,
      ...medicionParaEnviar(),
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Orden resuelta: quedó cargada en Órdenes de Trabajo")
    onHecho()
  }

  const cerrar = async () => {
    setSaving(true)
    const comps = await subirComprobantes(ot.dominio, comprobantes)
    if (comps === null) return setSaving(false)
    const res = await cerrarOtProgramada({
      id: ot.id,
      fechaSalida,
      horaSalida,
      costo: numero(costo),
      numero_factura: factura.trim() || undefined,
      observaciones: obsCierre.trim() || undefined,
      facturas: comps,
      ...medicionParaEnviar(),
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("OT cerrada: la unidad volvió a servicio")
    onHecho()
  }

  if (ot.estado === "realizada") {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">Orden cerrada</p>
        <p className="text-xs text-muted-foreground">
          Quedó registrada en Órdenes de Trabajo. La factura, los repuestos y su proveedor se
          cargan ahí.
        </p>
      </div>
    )
  }

  if (ot.estado === "en_taller" && ot.realizado_id) {
    return (
      <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <div>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            La unidad está en el taller
          </p>
          <p className="text-xs text-muted-foreground">
            Cuando vuelva, cerrala acá: se completa la orden de trabajo y {ot.dominio} vuelve a
            servicio.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Volvió el</Label>
            <Input
              type="date"
              value={fechaSalida}
              onChange={(e) => setFechaSalida(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>A qué hora</Label>
            <Input
              type="time"
              value={horaSalida}
              onChange={(e) => setHoraSalida(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>{labelMedicion}</Label>
            <Input
              inputMode="decimal"
              value={medicion}
              onChange={(e) => setMedicion(e.target.value)}
              placeholder="Al volver"
            />
            <p className="text-[11px] text-muted-foreground">
              {yaCargado != null
                ? `Ya cargado al llevarla al taller. Cambialo sólo si volvió con otro ${unidad}.`
                : "No se cargó al llevarla: conviene ponerlo ahora."}
            </p>
            <ChipsLectura lecturas={lecturas} unidad={unidad} onElegir={setMedicion} />
          </div>
          <div className="space-y-1">
            <Label>Costo</Label>
            <Input
              inputMode="decimal"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-1">
            <Label>N° factura</Label>
            <Input
              value={factura}
              onChange={(e) => setFactura(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Qué se hizo</Label>
            <Textarea
              rows={2}
              value={obsCierre}
              onChange={(e) => setObsCierre(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
        <ComprobantesEditor filas={comprobantes} setFilas={setComprobantes} />
        <p className="text-[11px] text-muted-foreground">
          Los repuestos con su proveedor se cargan en Órdenes de Trabajo, sobre esta misma orden.
        </p>
        <Button onClick={cerrar} disabled={saving} className="w-full">
          {saving ? "Cerrando…" : "Finalizar OT — volvió la unidad"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">Finalizar esta orden</p>
        <p className="text-xs text-muted-foreground">
          Con cualquiera de las dos se crea la orden de trabajo con estos mismos datos: no hay que
          cargarla de nuevo en otra pantalla.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["resuelta", "Ya se resolvió", "El trabajo está hecho"],
            ["en_taller", "Está en el taller", `${ot.dominio} todavía no volvió`],
          ] as const
        ).map(([valor, titulo, ayuda]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setModo(valor)}
            className={cn(
              "rounded-md border p-2 text-left text-xs transition-colors",
              modo === valor
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span className="block font-semibold">{titulo}</span>
            <span className="block text-[11px] text-muted-foreground">{ayuda}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{modo === "resuelta" ? "Se hizo el" : "Se llevó el"}</Label>
          <Input
            type="date"
            value={fechaTaller}
            onChange={(e) => setFechaTaller(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>{modo === "resuelta" ? "Entró a las" : "A qué hora"}</Label>
          <Input
            type="time"
            value={horaEntrada}
            onChange={(e) => setHoraEntrada(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as MantenimientoTipo)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(GASTO_TIPO_MANTENIMIENTO_LABELS) as MantenimientoTipo[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {GASTO_TIPO_MANTENIMIENTO_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>{labelMedicion} al entrar</Label>
          <Input
            inputMode="decimal"
            value={medicion}
            onChange={(e) => setMedicion(e.target.value)}
            placeholder="Se puede cargar al cerrar"
          />
          <ChipsLectura lecturas={lecturas} unidad={unidad} onElegir={setMedicion} />
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={esServiceGeneral}
          onChange={(e) => setEsServiceGeneral(e.target.checked)}
        />
        <span>
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            Es service general (rodado)
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Reinicia el contador del próximo service: el tablero y el calendario pasan a contar
            desde esta fecha y este {unidad === "hs" ? "horómetro" : "kilometraje"}.
          </span>
        </span>
      </label>

      {datos.tareas.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Tareas del plan preventivo que se van a hacer — tildarlas es lo que las descuenta del
            plan
          </Label>
          <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-border p-2">
            {datos.tareas.map(({ tarea, celda }) => {
              const falta =
                celda?.proximoKm != null && datos.kmActual != null
                  ? celda.proximoKm - datos.kmActual
                  : celda?.proximasHoras != null && datos.horasActuales != null
                    ? celda.proximasHoras - datos.horasActuales
                    : null
              return (
                <label
                  key={tarea.id}
                  className="flex items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={tildadas.has(tarea.id)}
                    onChange={(e) => {
                      setTildadas((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(tarea.id)
                        else next.delete(tarea.id)
                        return next
                      })
                    }}
                  />
                  <span className="flex-1">
                    <span className="text-foreground">{tarea.nombre}</span>
                    <span className="ml-1 text-muted-foreground">
                      {tarea.frecuencia_km
                        ? `· cada ${tarea.frecuencia_km.toLocaleString("es-AR")} km`
                        : tarea.frecuencia_horas
                          ? `· cada ${tarea.frecuencia_horas} hs`
                          : tarea.frecuencia_meses
                            ? `· cada ${tarea.frecuencia_meses} meses`
                            : ""}
                    </span>
                  </span>
                  {celda?.estado === "vencido" && (
                    <Badge className="px-1.5 py-0 text-[10px] bg-destructive/10 text-destructive">
                      Vencida
                    </Badge>
                  )}
                  {celda?.estado === "proximo" && (
                    <Badge className="px-1.5 py-0 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      {falta != null ? `faltan ${Math.round(falta).toLocaleString("es-AR")} ${unidad}` : "Próxima"}
                    </Badge>
                  )}
                  {!celda && (
                    <span className="text-[10px] text-muted-foreground/70">nunca registrada</span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {modo === "resuelta" && (
        <div className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Cómo quedó resuelta
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Resuelto a las</Label>
              <Input
                type="time"
                value={horaSalida}
                onChange={(e) => setHoraSalida(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Costo</Label>
              <Input
                inputMode="decimal"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1">
              <Label>N° factura</Label>
              <Input
                value={factura}
                onChange={(e) => setFactura(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Qué se hizo</Label>
              <Textarea
                rows={2}
                value={obsCierre}
                onChange={(e) => setObsCierre(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <ComprobantesEditor filas={comprobantes} setFilas={setComprobantes} />
        </div>
      )}

      <Button
        onClick={modo === "resuelta" ? resolver : llevar}
        disabled={saving}
        className="w-full"
      >
        {saving
          ? "Guardando…"
          : modo === "resuelta"
            ? "Finalizar OT — queda en Órdenes de Trabajo"
            : "Se llevó al taller — crear la orden de trabajo"}
      </Button>

      <VincularExistente ot={ot} onHecho={onHecho} />
    </div>
  )
}
