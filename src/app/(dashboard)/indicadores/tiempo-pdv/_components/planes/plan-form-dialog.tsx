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
  actualizarPlanTiempoPdv,
  crearPlanTiempoPdv,
  type PrioridadTiempoPdvPlan,
  type TiempoPdvPlan,
} from "@/actions/tiempo-pdv-planes"

const SIN_CIUDAD = "__sin_ciudad__"
const SIN_PATENTE = "__sin_patente__"
const SIN_RESPONSABLE = "__sin_responsable__"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  ciudades: string[]
  patentes: string[]
  responsables: { id: string; nombre: string }[]
  planExistente?: TiempoPdvPlan | null
  focoInicial?: {
    foco_cliente_id?: string
    foco_cliente?: string
    foco_ciudad?: string
    foco_patente?: string
  } | null
  onSaved: () => void
}

export function PlanFormDialog({
  open,
  onOpenChange,
  ciudades,
  patentes,
  responsables,
  planExistente = null,
  focoInicial = null,
  onSaved,
}: Props) {
  const esEdicion = !!planExistente
  const [pending, startTransition] = useTransition()

  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [prioridad, setPrioridad] = useState<PrioridadTiempoPdvPlan>("media")
  // El PDV no se elige de una lista (son ~700): viene de la fila del ranking
  // desde la que se abrió el plan, o del plan que se está editando.
  const [clienteId, setClienteId] = useState("")
  const [cliente, setCliente] = useState("")
  const [ciudad, setCiudad] = useState<string>(SIN_CIUDAD)
  const [patente, setPatente] = useState<string>(SIN_PATENTE)
  const [responsableId, setResponsableId] = useState<string>(SIN_RESPONSABLE)
  const [fechaObjetivo, setFechaObjetivo] = useState("")

  useEffect(() => {
    if (!open) return
    if (planExistente) {
      setTitulo(planExistente.titulo ?? "")
      setDescripcion(planExistente.descripcion ?? "")
      setPrioridad(planExistente.prioridad ?? "media")
      setClienteId(planExistente.foco_cliente_id ?? "")
      setCliente(planExistente.foco_cliente ?? "")
      setCiudad(planExistente.foco_ciudad ?? SIN_CIUDAD)
      setPatente(planExistente.foco_patente ?? SIN_PATENTE)
      setResponsableId(planExistente.responsable_id ?? SIN_RESPONSABLE)
      setFechaObjetivo(planExistente.fecha_objetivo ?? "")
    } else {
      setTitulo("")
      setDescripcion("")
      setPrioridad("media")
      setClienteId(focoInicial?.foco_cliente_id ?? "")
      setCliente(focoInicial?.foco_cliente ?? "")
      setCiudad(focoInicial?.foco_ciudad ?? SIN_CIUDAD)
      setPatente(focoInicial?.foco_patente ?? SIN_PATENTE)
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
    fd.append("foco_cliente_id", clienteId)
    fd.append("foco_cliente", cliente)
    fd.append("foco_ciudad", ciudad !== SIN_CIUDAD ? ciudad : "")
    fd.append("foco_patente", patente !== SIN_PATENTE ? patente : "")
    fd.append(
      "responsable_id",
      responsableId !== SIN_RESPONSABLE ? responsableId : "",
    )
    fd.append("fecha_objetivo", fechaObjetivo || "")

    startTransition(async () => {
      const r = esEdicion
        ? await actualizarPlanTiempoPdv(planExistente!.id, fd)
        : await crearPlanTiempoPdv(fd)
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
              placeholder='Ej: "Mejorar TLP en Pergamino reordenando rutas"'
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
                onValueChange={(v) => v && setPrioridad(v as PrioridadTiempoPdvPlan)}
                items={{ alta: "Alta", media: "Media", baja: "Baja" }}
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
                items={{
                  [SIN_RESPONSABLE]: "Sin responsable",
                  ...Object.fromEntries(responsables.map((r) => [r.id, r.nombre])),
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_RESPONSABLE}>Sin responsable</SelectItem>
                  {responsables.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {cliente && (
            <div className="space-y-1">
              <Label>Foco · Punto de venta</Label>
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-900">
                {cliente}
                {clienteId && (
                  <span className="ml-2 font-normal text-orange-700">#{clienteId}</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Foco · Ciudad</Label>
              <Select
                value={ciudad}
                onValueChange={(v) => v && setCiudad(v)}
                items={{
                  [SIN_CIUDAD]: "Sin ciudad (general)",
                  ...Object.fromEntries(ciudades.map((c) => [c, c])),
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin ciudad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CIUDAD}>Sin ciudad (general)</SelectItem>
                  {ciudades.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Foco · Camión (patente)</Label>
              <Select
                value={patente}
                onValueChange={(v) => v && setPatente(v)}
                items={{
                  [SIN_PATENTE]: "Sin camión (general)",
                  ...Object.fromEntries(patentes.map((p) => [p, p])),
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin camión" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_PATENTE}>Sin camión (general)</SelectItem>
                  {patentes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
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
