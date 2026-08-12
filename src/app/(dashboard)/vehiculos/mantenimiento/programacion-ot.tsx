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
  getOtProgramadas,
  llevarOtAlTaller,
  updateOtProgramada,
  type OtProgramada,
  type OtProgramadaEstado,
} from "@/actions/ot-programadas"
import {
  GASTO_TIPO_MANTENIMIENTO_LABELS,
  type EstadoPlanVehiculo,
  type MantenimientoPlanTarea,
  type MantenimientoProveedor,
  type MantenimientoTipo,
} from "@/types/database"
import type { ServiceGeneralUnidad } from "@/lib/vehiculos/service-general"

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

export function ProgramacionOt({
  estados,
  tareas,
  historialLecturas,
  programacion,
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

  /** Tareas del plan que le corresponden a una unidad, por su tipo (camión,
   *  autoelevador, camioneta): son las que se pueden marcar como hechas. */
  const tareasDelPlanDe = useCallback(
    (dom: string) => {
      const tipo = estados.find((e) => e.vehiculo.dominio === dom)?.vehiculo.tipo ?? "camion"
      return tareas.filter((t) => t.activo && t.tipo_vehiculo === tipo)
    },
    [estados, tareas],
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

      <Tabs defaultValue="semana" className="space-y-4">
        <TabsList>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="calendario">Calendario del mes</TabsTrigger>
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
          tareasDelPlanDe={tareasDelPlanDe}
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
  tareasDelPlanDe,
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
  tareasDelPlanDe: (dominio: string) => MantenimientoPlanTarea[]
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
            {ot ? `Orden programada · ${ot.dominio}` : "Programar orden de trabajo"}
          </DialogTitle>
          <DialogDescription>
            Los trabajos van uno por línea: son el checklist que le llega al mecánico en el PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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

          {ot && (
            <TallerPanel
              ot={ot}
              tareasPlan={tareasDelPlanDe(ot.dominio)}
              onHecho={onSaved}
            />
          )}
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

/**
 * El circuito del taller dentro de la orden programada, para no cargar la misma
 * OT dos veces:
 *
 *   se llevó al taller → se crea la ORDEN DE TRABAJO real (queda en taller y la
 *   unidad fuera de servicio desde ese día)
 *   volvió            → se cierra con el kilometraje, el costo y la factura
 *
 * Las tareas del PLAN que se tildan son las que descuentan del preventivo: sin
 * eso el service queda como pendiente aunque la OT esté hecha.
 */
function TallerPanel({
  ot,
  tareasPlan,
  onHecho,
}: {
  ot: OtProgramada
  tareasPlan: MantenimientoPlanTarea[]
  onHecho: () => void
}) {
  const hoy = iso(new Date())
  const [saving, setSaving] = useState(false)

  // Preselección: los trabajos escritos que coinciden con una tarea del plan.
  const lineas = useMemo(
    () => new Set(ot.tareas.map((t) => t.trim().toLowerCase()).filter(Boolean)),
    [ot.tareas],
  )
  const [tildadas, setTildadas] = useState<Set<string>>(
    () => new Set(tareasPlan.filter((t) => lineas.has(t.nombre.trim().toLowerCase())).map((t) => t.id)),
  )

  // Preventivo si lo que se va a hacer sale del plan; si no, correctivo.
  const [tipo, setTipo] = useState<MantenimientoTipo>(() =>
    tareasPlan.some((t) => lineas.has(t.nombre.trim().toLowerCase())) ? "preventivo" : "correctivo",
  )
  const [fechaTaller, setFechaTaller] = useState(
    ot.fecha_programada > hoy ? ot.fecha_programada : hoy,
  )
  const [fechaSalida, setFechaSalida] = useState(hoy)
  const [medicion, setMedicion] = useState("")
  const [costo, setCosto] = useState("")
  const [factura, setFactura] = useState("")
  const [obsCierre, setObsCierre] = useState("")

  const esAutoelevador = tareasPlan.some((t) => t.tipo_vehiculo === "autoelevador")
  const unidadMedicion = esAutoelevador ? "Horómetro (hs)" : "Odómetro (km)"
  const numero = (v: string) => {
    const n = Number(v.replace(",", "."))
    return v.trim() && isFinite(n) ? n : null
  }
  const medicionParaEnviar = () => {
    const n = numero(medicion)
    return esAutoelevador ? { horometro: n } : { odometro: n }
  }

  const llevar = async () => {
    setSaving(true)
    const nombres = tareasPlan.filter((t) => tildadas.has(t.id)).map((t) => t.nombre)
    const res = await llevarOtAlTaller({
      id: ot.id,
      fecha: fechaTaller,
      tipo,
      tareaIds: [...tildadas],
      nombresDelPlan: nombres,
      ...medicionParaEnviar(),
    })
    setSaving(false)
    if ("error" in res) return toast.error(res.error)
    toast.success("Orden de trabajo creada: la unidad figura en taller")
    onHecho()
  }

  const cerrar = async () => {
    setSaving(true)
    const res = await cerrarOtProgramada({
      id: ot.id,
      fechaSalida,
      costo: numero(costo),
      numero_factura: factura.trim() || undefined,
      observaciones: obsCierre.trim() || undefined,
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
        <p className="font-medium text-emerald-700 dark:text-emerald-400">
          Orden cerrada
        </p>
        <p className="text-xs text-muted-foreground">
          Quedó registrada en Órdenes de Trabajo. Si falta la factura, se agrega ahí.
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
            Cuando vuelva, cerrala acá: se completa la orden de trabajo y {ot.dominio} vuelve
            a servicio.
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
            <Label>{unidadMedicion}</Label>
            <Input
              inputMode="decimal"
              value={medicion}
              onChange={(e) => setMedicion(e.target.value)}
              placeholder="Al volver"
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
        <Button onClick={cerrar} disabled={saving} className="w-full">
          {saving ? "Cerrando…" : "Cerrar OT — volvió la unidad"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">¿Se llevó la unidad al taller?</p>
        <p className="text-xs text-muted-foreground">
          Al confirmarlo se crea la orden de trabajo con estos mismos datos —no hay que
          cargarla de nuevo— y {ot.dominio} queda fuera de servicio hasta que vuelva.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Se llevó el</Label>
          <Input
            type="date"
            value={fechaTaller}
            onChange={(e) => setFechaTaller(e.target.value)}
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
          <Label>{unidadMedicion} al entrar (opcional)</Label>
          <Input
            inputMode="decimal"
            value={medicion}
            onChange={(e) => setMedicion(e.target.value)}
            placeholder="Se puede cargar al cerrar"
          />
        </div>
      </div>

      {tareasPlan.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Tareas del plan preventivo que se van a hacer (tildarlas es lo que descuenta del plan)
          </Label>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {tareasPlan.map((t) => (
              <label key={t.id} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={tildadas.has(t.id)}
                  onChange={(e) => {
                    setTildadas((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(t.id)
                      else next.delete(t.id)
                      return next
                    })
                  }}
                />
                <span>
                  {t.nombre}
                  <span className="ml-1 text-muted-foreground">
                    {t.frecuencia_km
                      ? `· cada ${t.frecuencia_km.toLocaleString("es-AR")} km`
                      : t.frecuencia_horas
                        ? `· cada ${t.frecuencia_horas} hs`
                        : t.frecuencia_meses
                          ? `· cada ${t.frecuencia_meses} meses`
                          : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <Button onClick={llevar} disabled={saving} className="w-full">
        {saving ? "Creando la OT…" : "Se llevó al taller — crear la orden de trabajo"}
      </Button>
    </div>
  )
}
