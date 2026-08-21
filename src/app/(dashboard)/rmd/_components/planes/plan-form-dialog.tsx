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
import { AdjuntosInput } from "@/components/adjuntos-input"
import {
  actualizarPlanRmd,
  agregarAvancePlanRmd,
  crearPlanRmd,
  type RmdPlan,
  type PrioridadRmdPlan,
} from "@/actions/rmd-planes"

const SIN_MOTIVO = "__sin_motivo__"
const SIN_CLIENTE = "__sin_cliente__"
const SIN_CHOFER = "__sin_chofer__"
const SIN_RESPONSABLE = "__sin_responsable__"

export interface FocoInicial {
  foco_motivo?: string
  foco_cliente_id?: number
  foco_cliente_nombre?: string
  foco_chofer?: string
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  motivos: string[]
  clientes: { cod_cliente: number; nombre_cliente: string }[]
  choferes: string[]
  responsables: { id: string; nombre: string }[]
  planExistente?: RmdPlan | null
  focoInicial?: FocoInicial | null
  onSaved: () => void
}

export function PlanFormDialog({
  open,
  onOpenChange,
  motivos,
  clientes,
  choferes,
  responsables,
  planExistente = null,
  focoInicial = null,
  onSaved,
}: Props) {
  const esEdicion = !!planExistente
  const [pending, startTransition] = useTransition()

  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [prioridad, setPrioridad] = useState<PrioridadRmdPlan>("media")
  const [motivo, setMotivo] = useState<string>(SIN_MOTIVO)
  const [clienteId, setClienteId] = useState<string>(SIN_CLIENTE)
  const [chofer, setChofer] = useState<string>(SIN_CHOFER)
  const [responsableId, setResponsableId] = useState<string>(SIN_RESPONSABLE)
  const [fechaObjetivo, setFechaObjetivo] = useState("")
  // Evidencia del arranque: se sube como PRIMER AVANCE del plan recién creado
  // (los adjuntos cuelgan de los avances, no del plan). Sólo en alta: en
  // edición la evidencia se agrega desde el detalle, que ya tiene su bloque.
  const [archivos, setArchivos] = useState<File[]>([])

  // Prefill al abrir (edición o foco inicial).
  useEffect(() => {
    if (!open) return
    if (planExistente) {
      setTitulo(planExistente.titulo ?? "")
      setDescripcion(planExistente.descripcion ?? "")
      setPrioridad(planExistente.prioridad ?? "media")
      setMotivo(planExistente.foco_motivo ?? SIN_MOTIVO)
      setClienteId(
        planExistente.foco_cliente_id != null
          ? String(planExistente.foco_cliente_id)
          : SIN_CLIENTE,
      )
      setChofer(planExistente.foco_chofer ?? SIN_CHOFER)
      setResponsableId(planExistente.responsable_id ?? SIN_RESPONSABLE)
      setFechaObjetivo(planExistente.fecha_objetivo ?? "")
    } else {
      setTitulo("")
      setDescripcion("")
      setPrioridad("media")
      setMotivo(focoInicial?.foco_motivo ?? SIN_MOTIVO)
      setClienteId(
        focoInicial?.foco_cliente_id != null
          ? String(focoInicial.foco_cliente_id)
          : SIN_CLIENTE,
      )
      setChofer(focoInicial?.foco_chofer ?? SIN_CHOFER)
      setResponsableId(SIN_RESPONSABLE)
      setFechaObjetivo("")
    }
    setArchivos([])
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
    fd.append("foco_motivo", motivo !== SIN_MOTIVO ? motivo : "")

    if (clienteId !== SIN_CLIENTE) {
      const c = clientes.find((x) => String(x.cod_cliente) === clienteId)
      fd.append("foco_cliente_id", clienteId)
      fd.append("foco_cliente_nombre", c?.nombre_cliente ?? "")
    } else {
      fd.append("foco_cliente_id", "")
      fd.append("foco_cliente_nombre", "")
    }

    fd.append("foco_chofer", chofer !== SIN_CHOFER ? chofer : "")
    fd.append(
      "responsable_id",
      responsableId !== SIN_RESPONSABLE ? responsableId : "",
    )
    fd.append("fecha_objetivo", fechaObjetivo || "")

    startTransition(async () => {
      if (esEdicion) {
        const r = await actualizarPlanRmd(planExistente!.id, fd)
        if ("error" in r) {
          toast.error(r.error)
          return
        }
        toast.success("Plan actualizado")
        onOpenChange(false)
        onSaved()
        return
      }

      const r = await crearPlanRmd(fd)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      // Evidencia inicial: va como primer avance del plan recién creado. Si
      // fallara, el plan YA existe: se avisa y se reintenta desde el detalle.
      if (archivos.length > 0) {
        const fdAv = new FormData()
        fdAv.append("comentario", "Evidencia cargada al crear el plan")
        for (const f of archivos) fdAv.append("archivo", f)
        const rav = await agregarAvancePlanRmd(r.data.id, fdAv)
        if ("error" in rav) {
          toast.error(`Plan creado, pero la evidencia no subió: ${rav.error}`)
          onOpenChange(false)
          onSaved()
          return
        }
      }
      toast.success("Plan creado")
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
              placeholder='Ej: "Recuperar clientes por experiencia de entrega"'
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
                onValueChange={(v) => v && setPrioridad(v as PrioridadRmdPlan)}
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
              <Label>Foco · Motivo</Label>
              <Select value={motivo} onValueChange={(v) => v && setMotivo(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_MOTIVO}>Sin motivo</SelectItem>
                  {motivos.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
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
              <Label>Foco · Chofer</Label>
              <Select value={chofer} onValueChange={(v) => v && setChofer(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin chofer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CHOFER}>Sin chofer</SelectItem>
                  {choferes.map((p) => (
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

          {!esEdicion && (
            <div className="space-y-1">
              <Label>
                Evidencia (opcional — foto o archivo, podés pegar con Ctrl+V)
              </Label>
              <AdjuntosInput
                archivos={archivos}
                onChange={setArchivos}
                activo={open}
                disabled={pending}
              />
              <p className="text-xs text-slate-500">
                Queda como primer avance del plan. Después podés sumar más
                evidencia abriendo el plan.
              </p>
            </div>
          )}
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
