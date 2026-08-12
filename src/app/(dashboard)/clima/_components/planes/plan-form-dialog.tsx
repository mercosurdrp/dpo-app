"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
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
import { actualizarPlanClima, crearPlanClima } from "@/actions/clima-planes"
import {
  EJES_SUGERIDOS,
  type ClimaOla,
  type ClimaPlan,
  type PrioridadClimaPlan,
} from "@/actions/clima-tipos"
import { preguntaCorta } from "@/lib/clima-vocabulario"
import type { FocoInicialPlan } from "./planes-bloque"

const SIN_RESPONSABLE = "__sin_responsable__"
const SIN_OLA = "__sin_ola__"
const EJE_LIBRE = "__eje_libre__"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  olas: ClimaOla[]
  olaVigente: string | null
  responsables: { id: string; nombre: string }[]
  planExistente?: ClimaPlan | null
  focoInicial?: FocoInicialPlan | null
  onSaved: () => void
}

export function PlanFormDialog({
  open,
  onOpenChange,
  olas,
  olaVigente,
  responsables,
  planExistente = null,
  focoInicial = null,
  onSaved,
}: Props) {
  const esEdicion = !!planExistente
  const [pending, startTransition] = useTransition()

  // El padre remonta este diálogo en cada apertura (prop `key`), así que el
  // estado inicial alcanza para precargar: no hace falta sincronizar con un
  // efecto. En alta, los datos vienen del hallazgo que se tocó en Resultados.
  const ejeGuardado = planExistente?.eje ?? ""
  const ejeEsSugerido = EJES_SUGERIDOS.includes(ejeGuardado)

  const [prioridad, setPrioridad] = useState<PrioridadClimaPlan>(
    planExistente?.prioridad ?? "media",
  )
  const [foco, setFoco] = useState(
    planExistente?.foco ?? focoInicial?.foco ?? "",
  )
  const [eje, setEje] = useState(ejeEsSugerido ? ejeGuardado : EJE_LIBRE)
  const [ejeLibre, setEjeLibre] = useState(ejeEsSugerido ? "" : ejeGuardado)
  const [dimension] = useState(
    planExistente?.dimension ?? focoInicial?.dimension ?? "",
  )
  const [pregunta] = useState(
    planExistente?.pregunta ?? focoInicial?.pregunta ?? "",
  )
  const [hallazgo, setHallazgo] = useState(
    planExistente?.hallazgo ?? focoInicial?.hallazgo ?? "",
  )
  const [accion, setAccion] = useState(planExistente?.accion ?? "")
  const [responsableId, setResponsableId] = useState(
    planExistente?.responsable_id ?? SIN_RESPONSABLE,
  )
  const [responsableTexto, setResponsableTexto] = useState(
    planExistente?.responsable_texto ?? "",
  )
  const [plazo, setPlazo] = useState(planExistente?.plazo ?? "")
  const [fechaObjetivo, setFechaObjetivo] = useState(
    planExistente?.fecha_objetivo ?? "",
  )
  const [indicador, setIndicador] = useState(
    planExistente?.indicador_exito ?? "",
  )
  const [olaId, setOlaId] = useState(
    planExistente?.ola_id ?? focoInicial?.ola_id ?? olaVigente ?? SIN_OLA,
  )

  const guardar = () => {
    if (!accion.trim()) {
      toast.error("Escribí la acción concreta")
      return
    }
    const fd = new FormData()
    fd.set("prioridad", prioridad)
    fd.set("foco", foco)
    fd.set("eje", eje === EJE_LIBRE ? ejeLibre : eje)
    fd.set("dimension", dimension)
    fd.set("pregunta", pregunta)
    fd.set("hallazgo", hallazgo)
    fd.set("accion", accion)
    fd.set("responsable_id", responsableId === SIN_RESPONSABLE ? "" : responsableId)
    fd.set("responsable_texto", responsableTexto)
    fd.set("plazo", plazo)
    fd.set("fecha_objetivo", fechaObjetivo)
    fd.set("indicador_exito", indicador)
    fd.set("ola_id", olaId === SIN_OLA ? "" : olaId)

    startTransition(async () => {
      const res = esEdicion
        ? await actualizarPlanClima(planExistente!.id, fd)
        : await crearPlanClima(fd)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(esEdicion ? "Plan actualizado" : "Plan creado")
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {esEdicion ? "Editar plan de acción" : "Nuevo plan de acción"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Prioridad</Label>
            <Select
              value={prioridad}
              onValueChange={(v) => v && setPrioridad(v as PrioridadClimaPlan)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Foco</Label>
            <Input
              value={foco}
              onChange={(e) => setFoco(e.target.value)}
              placeholder="Empresa, Logística, Ventas, equipo de…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Eje / Driver</Label>
            <Select value={eje} onValueChange={(v) => v && setEje(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EJES_SUGERIDOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
                <SelectItem value={EJE_LIBRE}>Otro (escribir)</SelectItem>
              </SelectContent>
            </Select>
            {eje === EJE_LIBRE && (
              <Input
                value={ejeLibre}
                onChange={(e) => setEjeLibre(e.target.value)}
                placeholder="Escribí el eje"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Ola de origen</Label>
            <Select value={olaId} onValueChange={(v) => v && setOlaId(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_OLA}>Sin ola</SelectItem>
                {olas.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.codigo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Hallazgo (el dato de la encuesta)</Label>
            <Textarea
              value={hallazgo}
              onChange={(e) => setHallazgo(e.target.value)}
              rows={2}
              placeholder="Reconocimiento: 74, sin moverse en dos olas."
            />
            {pregunta && (
              <p className="text-[11px] text-slate-500">
                Ítem asociado: <strong>{preguntaCorta(pregunta)}</strong>
                {dimension ? ` · ${dimension}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Acción concreta *</Label>
            <Textarea
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              rows={3}
              placeholder="Qué se va a hacer, en concreto."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Responsable (usuario de la app)</Label>
            <Select
              value={responsableId}
              onValueChange={(v) => v && setResponsableId(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_RESPONSABLE}>Sin asignar</SelectItem>
                {responsables.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>…o responsable propuesto</Label>
            <Input
              value={responsableTexto}
              onChange={(e) => setResponsableTexto(e.target.value)}
              placeholder="Mantenimiento + RRHH"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plazo</Label>
            <Input
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
              placeholder="Q3 2026 · Continuo · Inmediato"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fecha objetivo (opcional)</Label>
            <Input
              type="date"
              value={fechaObjetivo}
              onChange={(e) => setFechaObjetivo(e.target.value)}
            />
            <p className="text-[11px] text-slate-500">
              Marca el plan como vencido cuando pasa.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Indicador de éxito / Meta</Label>
            <Textarea
              value={indicador}
              onChange={(e) => setIndicador(e.target.value)}
              rows={2}
              placeholder="Reconocimiento ≥ 85 en la próxima ola."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {esEdicion ? "Guardar cambios" : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
