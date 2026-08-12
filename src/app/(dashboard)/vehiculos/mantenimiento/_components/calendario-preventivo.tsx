"use client"

// Calendario del plan preventivo (DPO 2.2 · R2.2.3): el mes completo con lo que
// vence cada día y las OT ya programadas, para planificar el taller y para
// mostrarle al auditor el plan en una herramienta digital.
//
// Las tareas que vencen por km u horas no tienen fecha propia: se estiman con el
// ritmo de uso de cada unidad y se marcan con "~". Ver `lib/flota/calendario-preventivo`.
//
// 🚨 El SERVICE GENERAL no se recalcula acá: se toma de `programacion`, la misma
// proyección que muestra el Tablero operativo ("faltan 8 días"). Si el calendario
// lo midiera por su cuenta, el mismo service caería en dos días distintos según
// dónde se lo mire. Por eso el ritmo del tablero (`kmDia`) manda también sobre el
// resto de las tareas.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { cn } from "@/lib/utils"
import { getOtProgramadas, type OtProgramada } from "@/actions/ot-programadas"
import {
  eventosPorFecha,
  eventosPreventivos,
  grillaMes,
  isoDe,
  ritmoDiarioPorDominio,
  type EventoPreventivo,
  type LecturaDia,
  type ServiceProyectado,
} from "@/lib/flota/calendario-preventivo"
import type { EstadoPlanVehiculo, MantenimientoPlanTarea } from "@/types/database"
import type { ServiceGeneralUnidad } from "@/lib/vehiculos/service-general"

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const mesLargo = (iso: string) => {
  const [y, m] = iso.split("-").map(Number)
  return `${MESES[m - 1]} ${y}`
}
const addMesesIso = (iso: string, n: number) => {
  const [y, m] = iso.split("-").map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return isoDe(d)
}

const CLS_EVENTO: Record<EventoPreventivo["estado"], string> = {
  vencido: "border-destructive/40 bg-destructive/10 text-destructive",
  proximo:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ok: "border-border bg-muted/60 text-muted-foreground",
}

export function CalendarioPreventivo({
  estados,
  tareas,
  historialLecturas,
  programacion,
  puedeEditar,
  onProgramar,
  refreshToken,
}: {
  estados: EstadoPlanVehiculo[]
  tareas: MantenimientoPlanTarea[]
  /** Historial de lecturas por dominio (de `getEstadoPlanFlota`), para el ritmo de uso. */
  historialLecturas: Record<string, LecturaDia[]>
  /** Service general por unidad, el mismo que muestra el Tablero operativo. */
  programacion: ServiceGeneralUnidad[]
  puedeEditar: boolean
  /** Abre el diálogo de programación del padre con la fecha (y unidad) elegida. */
  onProgramar: (fecha: string, dominio?: string, tareasSugeridas?: string[]) => void
  /** Cambia cuando el padre guarda una OT: fuerza recargar el mes. */
  refreshToken: number
}) {
  const hoy = isoDe(new Date())
  const [ancla, setAncla] = useState(() => `${hoy.slice(0, 7)}-01`)
  const [fUnidad, setFUnidad] = useState("todas")
  const [cacheOts, setCacheOts] = useState<{ clave: string; data: OtProgramada[] } | null>(null)
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)

  const { dias, primeroDelMes, ultimoDelMes } = useMemo(() => grillaMes(ancla), [ancla])
  const desde = dias[0]
  const hasta = dias[dias.length - 1]

  // Las OT del mes se piden al servidor. Se guardan junto con la clave del rango
  // para que un mes recién elegido no muestre las órdenes del anterior mientras
  // llega la respuesta (y sin resetear estado dentro del efecto).
  const clave = `${desde}|${hasta}|${refreshToken}`
  useEffect(() => {
    let cancelado = false
    void getOtProgramadas({ desde, hasta }).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setCacheOts({ clave, data: res.data })
    })
    return () => {
      cancelado = true
    }
  }, [clave, desde, hasta])

  const ots = cacheOts?.clave === clave ? cacheOts.data : null

  const tareasById = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas])

  const servicePorDominio = useMemo(() => {
    const map = new Map<string, ServiceProyectado>()
    for (const p of programacion) {
      if (p.estado === "no_aplica") continue
      map.set(p.dominio, {
        dominio: p.dominio,
        proximaFecha: p.proximaFecha,
        diasRestantes: p.diasRestantes,
        kmDia: p.kmDia,
        motivo: p.motivo,
        kmRestante: p.kmRestante,
        mide: p.mide,
      })
    }
    return map
  }, [programacion])

  const eventos = useMemo(() => {
    const tipos = new Map(estados.map((e) => [e.vehiculo.dominio, e.vehiculo.tipo ?? "camion"]))
    const ritmo = ritmoDiarioPorDominio(historialLecturas, tipos)
    const todos = eventosPreventivos({
      estados,
      tareasById,
      ritmoPorDominio: ritmo,
      servicePorDominio,
      hoy,
    })
    return fUnidad === "todas" ? todos : todos.filter((e) => e.dominio === fUnidad)
  }, [estados, tareasById, historialLecturas, servicePorDominio, fUnidad, hoy])

  /** Vencidas con fecha anterior a la grilla: si no se muestran aparte, desaparecen. */
  const arrastre = useMemo(
    () => eventos.filter((e) => e.estado === "vencido" && e.fecha < desde),
    [eventos, desde]
  )
  const delMes = useMemo(
    () => eventos.filter((e) => e.fecha >= primeroDelMes && e.fecha <= ultimoDelMes),
    [eventos, primeroDelMes, ultimoDelMes]
  )
  const porFecha = useMemo(
    () => eventosPorFecha(eventos.filter((e) => e.fecha >= desde && e.fecha <= hasta)),
    [eventos, desde, hasta]
  )

  const otsPorFecha = useMemo(() => {
    const map = new Map<string, OtProgramada[]>()
    for (const o of ots ?? []) {
      if (fUnidad !== "todas" && o.dominio !== fUnidad) continue
      const arr = map.get(o.fecha_programada)
      if (arr) arr.push(o)
      else map.set(o.fecha_programada, [o])
    }
    return map
  }, [ots, fUnidad])

  const dominios = useMemo(
    () => estados.map((e) => e.vehiculo.dominio).sort(),
    [estados]
  )

  const otsDelMes = useMemo(
    () =>
      (ots ?? []).filter(
        (o) =>
          o.fecha_programada >= primeroDelMes &&
          o.fecha_programada <= ultimoDelMes &&
          (fUnidad === "todas" || o.dominio === fUnidad)
      ),
    [ots, primeroDelMes, ultimoDelMes, fUnidad]
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-muted-foreground" />
              {mesLargo(ancla)}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select value={fUnidad} onValueChange={(v) => setFUnidad(v ?? "todas")}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las unidades</SelectItem>
                  {dominios.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setAncla(addMesesIso(ancla, -1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAncla(`${hoy.slice(0, 7)}-01`)}
              >
                Hoy
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAncla(addMesesIso(ancla, 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-sky-500/70" /> OT programada ({otsDelMes.length})
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-amber-500/70" /> Vence este mes (
              {delMes.filter((e) => e.estado !== "vencido").length})
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-destructive/70" /> Vencido (
              {delMes.filter((e) => e.estado === "vencido").length + arrastre.length})
            </span>
            <span>
              · «~» = fecha estimada por el uso (km/horas) · el Service general cae el mismo
              día que dice el Tablero operativo
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {DIAS_CORTOS.map((d) => (
              <div
                key={d}
                className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dias.map((fecha) => {
              const delDia = porFecha.get(fecha) ?? []
              const otsDia = otsPorFecha.get(fecha) ?? []
              const esDelMes = fecha >= primeroDelMes && fecha <= ultimoDelMes
              const esHoy = fecha === hoy
              const total = delDia.length + otsDia.length
              return (
                <button
                  key={fecha}
                  type="button"
                  onClick={() => setDiaAbierto(fecha)}
                  className={cn(
                    "flex min-h-24 flex-col gap-1 rounded-md border border-border p-1.5 text-left transition-colors hover:border-primary/40",
                    !esDelMes && "bg-muted/30 opacity-60",
                    esHoy && "border-primary/50 bg-primary/5"
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] font-semibold",
                      esHoy ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {Number(fecha.slice(8, 10))}
                  </span>
                  {otsDia.slice(0, 2).map((o) => (
                    <span
                      key={o.id}
                      className="truncate rounded border border-sky-500/40 bg-sky-500/10 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400"
                    >
                      {o.dominio} · OT
                    </span>
                  ))}
                  {delDia.slice(0, Math.max(0, 3 - Math.min(otsDia.length, 2))).map((e) => (
                    <span
                      key={`${e.dominio}-${e.tareaId}`}
                      className={cn(
                        "truncate rounded border px-1 py-0.5 text-[10px] font-medium",
                        CLS_EVENTO[e.estado]
                      )}
                    >
                      {e.estimada ? "~" : ""}
                      {e.dominio} · {e.tarea}
                    </span>
                  ))}
                  {total > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{total - 3} más</span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {arrastre.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">
              Vencidas de antes de {mesLargo(ancla)} ({arrastre.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Su fecha de vencimiento quedó fuera del mes que estás mirando: siguen abiertas.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {arrastre.map((e) => (
              <button
                key={`${e.dominio}-${e.tareaId}`}
                type="button"
                onClick={() => puedeEditar && onProgramar(hoy, e.dominio, [e.tarea])}
                className="rounded-full border border-destructive/40 px-2 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                {e.dominio} · {e.tarea}
                <span className="ml-1 opacity-70">
                  {e.fecha.slice(8, 10)}/{e.fecha.slice(5, 7)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {diaAbierto && (
        <DiaDialog
          fecha={diaAbierto}
          eventos={porFecha.get(diaAbierto) ?? []}
          ots={otsPorFecha.get(diaAbierto) ?? []}
          puedeEditar={puedeEditar}
          onProgramar={onProgramar}
          onClose={() => setDiaAbierto(null)}
        />
      )}
    </div>
  )
}

function DiaDialog({
  fecha,
  eventos,
  ots,
  puedeEditar,
  onProgramar,
  onClose,
}: {
  fecha: string
  eventos: EventoPreventivo[]
  ots: OtProgramada[]
  puedeEditar: boolean
  onProgramar: (fecha: string, dominio?: string, tareasSugeridas?: string[]) => void
  onClose: () => void
}) {
  const porUnidad = useMemo(() => {
    const map = new Map<string, EventoPreventivo[]>()
    for (const e of eventos) {
      const arr = map.get(e.dominio)
      if (arr) arr.push(e)
      else map.set(e.dominio, [e])
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [eventos])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {fecha.slice(8, 10)}/{fecha.slice(5, 7)}/{fecha.slice(0, 4)}
          </DialogTitle>
          <DialogDescription>
            Lo que vence ese día y las órdenes ya programadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ots.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Órdenes programadas</Label>
              {ots.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{o.dominio}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.tareas.join(" · ") || "Sin trabajos cargados"}
                      {o.taller ? ` · ${o.taller}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      window.open(`/api/vehiculos/ot-programada/pdf?id=${o.id}`, "_blank")
                    }
                  >
                    <FileDown className="mr-1 size-4" /> PDF
                  </Button>
                </div>
              ))}
            </div>
          )}

          {porUnidad.length === 0 && ots.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No vence nada ese día.
            </p>
          )}

          {porUnidad.map(([dominio, evs]) => (
            <div key={dominio} className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{dominio}</p>
                {puedeEditar && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onProgramar(
                        fecha,
                        dominio,
                        evs.map((e) => e.tarea)
                      )
                    }
                  >
                    <Plus className="mr-1 size-4" /> Programar OT
                  </Button>
                )}
              </div>
              {evs.map((e) => (
                <div
                  key={e.tareaId}
                  className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Badge
                    variant="outline"
                    className={cn("px-1.5 py-0 text-[10px]", CLS_EVENTO[e.estado])}
                  >
                    {e.estado === "vencido" ? "Vencido" : e.estado === "proximo" ? "Próximo" : "En plazo"}
                  </Badge>
                  <span className="text-foreground">{e.tarea}</span>
                  <span>
                    · {e.estimada ? "estimado por " : "por "}
                    {e.eje === "tiempo" ? "plazo" : e.eje === "km" ? "kilómetros" : "horas"}
                    {e.detalle ? ` · ${e.detalle}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
