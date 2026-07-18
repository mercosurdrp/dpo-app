"use client"

import { useState, useTransition } from "react"
import { Camera, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AdjuntosInput } from "@/components/adjuntos-input"
import { comprimirImagen } from "@/lib/comprimir-imagen"
import { agregarAvancePlan } from "@/actions/plan-avances"
import type { EstadoPlan } from "@/types/database"

type Resultado = "igual" | "en_progreso" | "completado"

/**
 * Botón + diálogo para cargar evidencia (fotos/archivos + comentario) a una
 * tarea directamente desde su tarjeta, sin pasar por el detalle. Funciona
 * también sobre tareas cerradas: la evidencia se suma al historial sin
 * cambiar el estado.
 */
export function EvidenciaPlanDialog({
  planId,
  estado,
  onEstadoChange,
}: {
  planId: string
  estado: EstadoPlan
  onEstadoChange?: (estado: EstadoPlan) => void
}) {
  const [open, setOpen] = useState(false)
  const [comentario, setComentario] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])
  const [resultado, setResultado] = useState<Resultado>("igual")
  const [submitting, startSubmit] = useTransition()

  const cerrada = estado === "completado"

  function reset() {
    setComentario("")
    setArchivos([])
    setResultado("igual")
  }

  function handleSubmit() {
    if (!comentario.trim() && archivos.length === 0) {
      toast.error("Adjuntá una foto/archivo o escribí un comentario")
      return
    }
    startSubmit(async () => {
      try {
        const fd = new FormData()
        fd.append("comentario", comentario.trim())
        for (const f of archivos) {
          fd.append("archivo", await comprimirImagen(f))
        }
        if (!cerrada && resultado !== "igual") {
          fd.append("nuevo_estado", resultado)
        }
        const r = await agregarAvancePlan(planId, fd)
        if ("error" in r) {
          toast.error(r.error)
          return
        }
        toast.success(
          !cerrada && resultado === "completado"
            ? "Evidencia cargada · tarea cerrada"
            : "Evidencia cargada",
        )
        if (!cerrada && resultado !== "igual") onEstadoChange?.(resultado)
        setOpen(false)
        reset()
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error cargando la evidencia",
        )
      }
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setOpen(true)}
        title="Cargar evidencia (foto / archivo)"
      >
        <Camera className="h-3 w-3 text-blue-600" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cargar evidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fotos o archivos (podés pegar con Ctrl+V)</Label>
              <div className="mt-1">
                <AdjuntosInput
                  archivos={archivos}
                  onChange={setArchivos}
                  activo={open}
                  disabled={submitting}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="evidencia-comentario">Comentario</Label>
              <Textarea
                id="evidencia-comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Qué se hizo, contexto…"
                rows={3}
                className="mt-1"
              />
            </div>
            {cerrada ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                La tarea ya está cerrada: la evidencia se agrega a su historial
                sin cambiar el estado.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>Resultado</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["igual", "Dejar como está"],
                      ["en_progreso", "En curso"],
                      ["completado", "Cerrada"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setResultado(val)}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        resultado === val
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setOpen(false)
                reset()
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {!cerrada && resultado === "completado"
                ? "Guardar y cerrar"
                : "Guardar evidencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
