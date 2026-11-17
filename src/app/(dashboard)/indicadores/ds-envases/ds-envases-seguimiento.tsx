"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { ClipboardList, Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  actualizarObservacionMes,
  crearObservacionMes,
  eliminarObservacionMes,
  getSeguimientoMensual,
  type ObservacionMes,
} from "@/actions/indicadores-observaciones-mes"

/**
 * Observación y plan de acción del DS de Envases. Usa la tabla genérica
 * indicadores_observaciones_mes con dos claves: 'ds_envases' (observaciones,
 * texto libre) y 'ds_envases_plan' (acciones; el texto es un JSON con
 * acción, responsable, fecha y estado).
 */
const IND_OBS = "ds_envases"
const IND_PLAN = "ds_envases_plan"
const RUTA = "/indicadores/ds-envases"

type Estado = "pendiente" | "en_curso" | "cerrada"
interface Accion {
  accion: string
  responsable: string
  fecha: string
  estado: Estado
}
const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  cerrada: "Cerrada",
}
const ESTADO_CLASE: Record<Estado, string> = {
  pendiente: "bg-slate-100 text-slate-700",
  en_curso: "bg-amber-100 text-amber-800",
  cerrada: "bg-emerald-100 text-emerald-800",
}

function parseAccion(texto: string): Accion {
  try {
    const a = JSON.parse(texto)
    return {
      accion: String(a.accion ?? ""),
      responsable: String(a.responsable ?? ""),
      fecha: String(a.fecha ?? ""),
      estado: (["pendiente", "en_curso", "cerrada"].includes(a.estado) ? a.estado : "pendiente") as Estado,
    }
  } catch {
    return { accion: texto, responsable: "", fecha: "", estado: "pendiente" }
  }
}
const fechaCorta = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—")
const periodoHoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
const ACCION_VACIA: Accion = { accion: "", responsable: "", fecha: "", estado: "pendiente" }

export function DsEnvasesSeguimiento() {
  const [obs, setObs] = useState<ObservacionMes[]>([])
  const [plan, setPlan] = useState<ObservacionMes[]>([])
  const [cargando, setCargando] = useState(true)
  const [pending, start] = useTransition()

  const [obsEdit, setObsEdit] = useState<{ id: string | null; texto: string } | null>(null)
  const [accEdit, setAccEdit] = useState<{ id: string | null; a: Accion } | null>(null)

  const cargar = useCallback(async () => {
    const year = new Date().getFullYear()
    const [o, p] = await Promise.all([
      getSeguimientoMensual({ indicador: IND_OBS, year }),
      getSeguimientoMensual({ indicador: IND_PLAN, year }),
    ])
    if ("data" in o) setObs(o.data.observaciones)
    if ("data" in p) setPlan([...p.data.observaciones].reverse())
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  function guardarObs() {
    if (!obsEdit) return
    start(async () => {
      const r = obsEdit.id
        ? await actualizarObservacionMes(obsEdit.id, obsEdit.texto)
        : await crearObservacionMes({ indicador: IND_OBS, periodo: periodoHoy(), texto: obsEdit.texto, revalidar: RUTA })
      if ("error" in r) return void toast.error(r.error)
      toast.success("Observación guardada")
      setObsEdit(null)
      await cargar()
    })
  }

  function guardarAccion() {
    if (!accEdit) return
    if (!accEdit.a.accion.trim()) return void toast.error("Escribí la acción.")
    const texto = JSON.stringify({ ...accEdit.a, accion: accEdit.a.accion.trim(), responsable: accEdit.a.responsable.trim() })
    start(async () => {
      const r = accEdit.id
        ? await actualizarObservacionMes(accEdit.id, texto)
        : await crearObservacionMes({ indicador: IND_PLAN, periodo: periodoHoy(), texto, revalidar: RUTA })
      if ("error" in r) return void toast.error(r.error)
      toast.success("Acción guardada")
      setAccEdit(null)
      await cargar()
    })
  }

  function borrar(id: string) {
    start(async () => {
      const r = await eliminarObservacionMes(id)
      if ("error" in r) return void toast.error(r.error)
      await cargar()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Observación */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="h-4 w-4" /> Observación
          </CardTitle>
          {!obsEdit && (
            <Button size="sm" variant="outline" onClick={() => setObsEdit({ id: null, texto: "" })}>
              <Plus className="mr-1 h-4 w-4" /> Agregar
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {obsEdit && (
            <div className="space-y-2 rounded-md border bg-slate-50 p-3">
              <Textarea
                id="ds-envases-obs"
                rows={4}
                value={obsEdit.texto}
                onChange={(e) => setObsEdit({ ...obsEdit, texto: e.target.value })}
                placeholder="Qué se ve en el DS y qué se acordó con Quilmes"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setObsEdit(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={guardarObs} disabled={pending || !obsEdit.texto.trim()}>
                  {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Guardar
                </Button>
              </div>
            </div>
          )}
          {cargando ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : obs.length === 0 && !obsEdit ? (
            <p className="text-sm text-muted-foreground">Todavía no hay observaciones.</p>
          ) : (
            obs.map((o) => (
              <div key={o.id} className="group rounded-md border p-3">
                <p className="whitespace-pre-wrap text-sm text-slate-800">{o.texto}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{o.autor_nombre ?? ""}</span>
                  <span className="flex gap-1 opacity-60 group-hover:opacity-100">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setObsEdit({ id: o.id, texto: o.texto })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => borrar(o.id)} disabled={pending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Plan de acción */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" /> Plan de acción
          </CardTitle>
          {!accEdit && (
            <Button size="sm" variant="outline" onClick={() => setAccEdit({ id: null, a: { ...ACCION_VACIA } })}>
              <Plus className="mr-1 h-4 w-4" /> Agregar acción
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {accEdit && (
            <div className="space-y-3 rounded-md border bg-slate-50 p-3">
              <div className="space-y-1">
                <Label htmlFor="ds-envases-accion">Acción</Label>
                <Textarea
                  id="ds-envases-accion"
                  rows={2}
                  value={accEdit.a.accion}
                  onChange={(e) => setAccEdit({ ...accEdit, a: { ...accEdit.a, accion: e.target.value } })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="ds-envases-resp">Responsable</Label>
                  <Input
                    id="ds-envases-resp"
                    value={accEdit.a.responsable}
                    onChange={(e) => setAccEdit({ ...accEdit, a: { ...accEdit.a, responsable: e.target.value } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ds-envases-fecha">Fecha compromiso</Label>
                  <Input
                    id="ds-envases-fecha"
                    type="date"
                    value={accEdit.a.fecha}
                    onChange={(e) => setAccEdit({ ...accEdit, a: { ...accEdit.a, fecha: e.target.value } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Select
                    value={accEdit.a.estado}
                    onValueChange={(v) => setAccEdit({ ...accEdit, a: { ...accEdit.a, estado: v as Estado } })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ESTADO_LABEL) as Estado[]).map((e) => (
                        <SelectItem key={e} value={e}>
                          {ESTADO_LABEL[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAccEdit(null)} disabled={pending}>
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
                <Button size="sm" onClick={guardarAccion} disabled={pending}>
                  {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Guardar
                </Button>
              </div>
            </div>
          )}
          {cargando ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : plan.length === 0 && !accEdit ? (
            <p className="text-sm text-muted-foreground">Todavía no hay acciones.</p>
          ) : (
            plan.map((p) => {
              const a = parseAccion(p.texto)
              return (
                <div key={p.id} className="group rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{a.accion}</p>
                    <Badge className={`shrink-0 ${ESTADO_CLASE[a.estado]}`} variant="secondary">
                      {ESTADO_LABEL[a.estado]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Responsable: <b className="text-slate-700">{a.responsable || "—"}</b> · Fecha:{" "}
                      <b className="text-slate-700">{fechaCorta(a.fecha)}</b>
                    </span>
                    <span className="flex gap-1 opacity-60 group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAccEdit({ id: p.id, a })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => borrar(p.id)} disabled={pending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
