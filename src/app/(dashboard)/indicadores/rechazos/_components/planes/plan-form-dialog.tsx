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
  actualizarPlanRechazos,
  crearPlanRechazos,
  type PrioridadRechazoPlan,
  type RechazoPlan,
} from "@/actions/rechazos-planes"

const SIN_MOTIVO = "__sin_motivo__"
const SIN_CLIENTE = "__sin_cliente__"
const SIN_RESPONSABLE = "__sin_responsable__"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  motivos: { id_rechazo: number; ds_rechazo: string }[]
  clientes: { id_cliente: number; nombre_cliente: string }[]
  responsables: { id: string; nombre: string }[]
  planExistente?: RechazoPlan | null
  focoInicial?: {
    foco_motivo_id?: number
    foco_motivo_ds?: string
    foco_cliente_id?: number
    foco_cliente_nombre?: string
  } | null
  onSaved: () => void
}

export function PlanFormDialog({
  open,
  onOpenChange,
  motivos,
  clientes,
  responsables,
  planExistente = null,
  focoInicial = null,
  onSaved,
}: Props) {
  const esEdicion = !!planExistente
  const [pending, startTransition] = useTransition()

  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [prioridad, setPrioridad] = useState<PrioridadRechazoPlan>("media")
  const [motivoId, setMotivoId] = useState<string>(SIN_MOTIVO)
  const [clienteId, setClienteId] = useState<string>(SIN_CLIENTE)
  const [responsableId, setResponsableId] = useState<string>(SIN_RESPONSABLE)
  const [fechaObjetivo, setFechaObjetivo] = useState("")

  // Prefill al abrir (edición o foco inicial).
  useEffect(() => {
    if (!open) return
    if (planExistente) {
      setTitulo(planExistente.titulo ?? "")
      setDescripcion(planExistente.descripcion ?? "")
      setPrioridad(planExistente.prioridad ?? "media")
      setMotivoId(
        planExistente.foco_motivo_id != null
          ? String(planExistente.foco_motivo_id)
          : SIN_MOTIVO,
      )
      setClienteId(
        planExistente.foco_cliente_id != null
          ? String(planExistente.foco_cliente_id)
          : SIN_CLIENTE,
      )
      setResponsableId(planExistente.responsable_id ?? SIN_RESPONSABLE)
      setFechaObjetivo(planExistente.fecha_objetivo ?? "")
    } else {
      setTitulo("")
      setDescripcion("")
      setPrioridad("media")
      setMotivoId(
        focoInicial?.foco_motivo_id != null
          ? String(focoInicial.foco_motivo_id)
          : SIN_MOTIVO,
      )
      setClienteId(
        focoInicial?.foco_cliente_id != null
          ? String(focoInicial.foco_cliente_id)
          : SIN_CLIENTE,
      )
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

    if (motivoId !== SIN_MOTIVO) {
      const m = motivos.find((x) => String(x.id_rechazo) === motivoId)
      fd.append("foco_motivo_id", motivoId)
      fd.append("foco_motivo_ds", m?.ds_rechazo ?? "")
    } else {
      fd.append("foco_motivo_id", "")
      fd.append("foco_motivo_ds", "")
    }

    if (clienteId !== SIN_CLIENTE) {
      const c = clientes.find((x) => String(x.id_cliente) === clienteId)
      fd.append("foco_cliente_id", clienteId)
      fd.append("foco_cliente_nombre", c?.nombre_cliente ?? "")
    } else {
      fd.append("foco_cliente_id", "")
      fd.append("foco_cliente_nombre", "")
    }

    fd.append(
      "responsable_id",
      responsableId !== SIN_RESPONSABLE ? responsableId : "",
    )
    fd.append("fecha_objetivo", fechaObjetivo || "")

    startTransition(async () => {
      const r = esEdicion
        ? await actualizarPlanRechazos(planExistente!.id, fd)
        : await crearPlanRechazos(fd)
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
            <Label htmlFor="pf-titulo">Título</Label>
            <Input
              id="pf-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder='Ej: "Reducir rechazos por faltante de stock"'
              maxLength={150}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="pf-desc">Descripción</Label>
            <Textarea
              id="pf-desc"
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
                onValueChange={(v) =>
                  v && setPrioridad(v as PrioridadRechazoPlan)
                }
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Foco · Motivo de rechazo</Label>
              <Select value={motivoId} onValueChange={(v) => v && setMotivoId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_MOTIVO}>Sin motivo</SelectItem>
                  {motivos.map((m) => (
                    <SelectItem
                      key={m.id_rechazo}
                      value={String(m.id_rechazo)}
                    >
                      {m.ds_rechazo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Foco · Cliente</Label>
              <Select value={clienteId} onValueChange={(v) => v && setClienteId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CLIENTE}>Sin cliente</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem
                      key={c.id_cliente}
                      value={String(c.id_cliente)}
                    >
                      {c.nombre_cliente}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pf-fecha">Fecha objetivo</Label>
            <Input
              id="pf-fecha"
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
