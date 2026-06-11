"use client"

import { useEffect, useState, useTransition } from "react"
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
import {
  actualizarPlanNps,
  crearPlanNps,
  type NpsPlan,
  type PrioridadNpsPlan,
} from "@/actions/nps-planes"

const SIN_DRIVER = "__sin_driver__"
const SIN_CLIENTE = "__sin_cliente__"
const SIN_PROMOTOR = "__sin_promotor__"
const SIN_RESPONSABLE = "__sin_responsable__"

export interface FocoInicial {
  foco_driver?: string
  foco_cliente_id?: number
  foco_cliente_nombre?: string
  foco_promotor?: string
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  drivers: string[]
  clientes: { cod_cliente: number; nombre_cliente: string }[]
  promotores: string[]
  responsables: { id: string; nombre: string }[]
  planExistente?: NpsPlan | null
  focoInicial?: FocoInicial | null
  onSaved: () => void
}

export function PlanFormDialog({
  open,
  onOpenChange,
  drivers,
  clientes,
  promotores,
  responsables,
  planExistente = null,
  focoInicial = null,
  onSaved,
}: Props) {
  const esEdicion = !!planExistente
  const [pending, startTransition] = useTransition()

  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [prioridad, setPrioridad] = useState<PrioridadNpsPlan>("media")
  const [driver, setDriver] = useState<string>(SIN_DRIVER)
  const [clienteId, setClienteId] = useState<string>(SIN_CLIENTE)
  const [promotor, setPromotor] = useState<string>(SIN_PROMOTOR)
  const [responsableId, setResponsableId] = useState<string>(SIN_RESPONSABLE)
  const [fechaObjetivo, setFechaObjetivo] = useState("")

  // Prefill al abrir (edición o foco inicial).
  useEffect(() => {
    if (!open) return
    if (planExistente) {
      setTitulo(planExistente.titulo ?? "")
      setDescripcion(planExistente.descripcion ?? "")
      setPrioridad(planExistente.prioridad ?? "media")
      setDriver(planExistente.foco_driver ?? SIN_DRIVER)
      setClienteId(
        planExistente.foco_cliente_id != null
          ? String(planExistente.foco_cliente_id)
          : SIN_CLIENTE,
      )
      setPromotor(planExistente.foco_promotor ?? SIN_PROMOTOR)
      setResponsableId(planExistente.responsable_id ?? SIN_RESPONSABLE)
      setFechaObjetivo(planExistente.fecha_objetivo ?? "")
    } else {
      setTitulo("")
      setDescripcion("")
      setPrioridad("media")
      setDriver(focoInicial?.foco_driver ?? SIN_DRIVER)
      setClienteId(
        focoInicial?.foco_cliente_id != null
          ? String(focoInicial.foco_cliente_id)
          : SIN_CLIENTE,
      )
      setPromotor(focoInicial?.foco_promotor ?? SIN_PROMOTOR)
      setResponsableId(SIN_RESPONSABLE)
      setFechaObjetivo("")
    }
  }, [open, planExistente, focoInicial])

  function handleSubmit() {
    if (!titulo.trim()) {
      toast.error("El título es obligatorio")
      return
    }

    const fd = new FormData()
    fd.append("titulo", titulo.trim())
    fd.append("descripcion", descripcion.trim())
    fd.append("prioridad", prioridad)
    fd.append("foco_driver", driver !== SIN_DRIVER ? driver : "")

    if (clienteId !== SIN_CLIENTE) {
      const c = clientes.find((x) => String(x.cod_cliente) === clienteId)
      fd.append("foco_cliente_id", clienteId)
      fd.append("foco_cliente_nombre", c?.nombre_cliente ?? "")
    } else {
      fd.append("foco_cliente_id", "")
      fd.append("foco_cliente_nombre", "")
    }

    fd.append("foco_promotor", promotor !== SIN_PROMOTOR ? promotor : "")
    fd.append(
      "responsable_id",
      responsableId !== SIN_RESPONSABLE ? responsableId : "",
    )
    fd.append("fecha_objetivo", fechaObjetivo || "")

    startTransition(async () => {
      const r = esEdicion
        ? await actualizarPlanNps(planExistente!.id, fd)
        : await crearPlanNps(fd)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success(esEdicion ? "Plan actualizado" : "Plan creado")
      onOpenChange(false)
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {esEdicion ? "Editar plan de acción" : "Nuevo plan de acción"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="npf-titulo">Título</Label>
            <Input
              id="npf-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder='Ej: "Recuperar detractores por experiencia de entrega"'
              maxLength={150}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="npf-desc">Descripción</Label>
            <Textarea
              id="npf-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Diagnóstico, acciones a tomar, criterio de éxito…"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <Select
                value={prioridad}
                onValueChange={(v) => v && setPrioridad(v as PrioridadNpsPlan)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Responsable</Label>
              <Select
                value={responsableId}
                onValueChange={(v) => v && setResponsableId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_RESPONSABLE}>
                    Sin responsable
                  </SelectItem>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Foco · Driver</Label>
              <Select value={driver} onValueChange={(v) => v && setDriver(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin driver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_DRIVER}>Sin driver</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Foco · Cliente</Label>
              <Select
                value={clienteId}
                onValueChange={(v) => v && setClienteId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CLIENTE}>Sin cliente</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem
                      key={c.cod_cliente}
                      value={String(c.cod_cliente)}
                    >
                      {c.nombre_cliente}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Foco · Promotor</Label>
              <Select
                value={promotor}
                onValueChange={(v) => v && setPromotor(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin promotor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_PROMOTOR}>Sin promotor</SelectItem>
                  {promotores.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="npf-fecha">Fecha objetivo</Label>
            <Input
              id="npf-fecha"
              type="date"
              value={fechaObjetivo}
              onChange={(e) => setFechaObjetivo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {esEdicion ? "Guardar cambios" : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
