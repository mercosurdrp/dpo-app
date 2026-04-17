"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createSugerencia } from "@/actions/sugerencias"
import {
  SUGERENCIA_TIPO_LABELS,
  type SugerenciaTipo,
} from "@/types/database"

const TIPOS: SugerenciaTipo[] = [
  "bug",
  "dato_incorrecto",
  "mejora_ux",
  "feature_request",
]

export function NuevaSugerenciaDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    tipo: "bug" as SugerenciaTipo,
    modulo: "",
  })

  function reset() {
    setForm({ titulo: "", descripcion: "", tipo: "bug", modulo: "" })
  }

  function handleSubmit() {
    if (!form.titulo.trim() || !form.descripcion.trim()) {
      toast.error("Completá título y descripción")
      return
    }

    startTransition(async () => {
      const result = await createSugerencia({
        titulo: form.titulo,
        descripcion: form.descripcion,
        tipo: form.tipo,
        modulo: form.modulo.trim() || undefined,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Sugerencia creada")
      reset()
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva sugerencia</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Resumen corto del problema o idea"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) =>
                  setForm({ ...form, tipo: (v ?? "bug") as SugerenciaTipo })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SUGERENCIA_TIPO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Módulo / página</Label>
              <Input
                value={form.modulo}
                onChange={(e) => setForm({ ...form, modulo: e.target.value })}
                placeholder="Ej: Tablero DPO"
              />
            </div>
          </div>

          <div>
            <Label>Descripción *</Label>
            <Textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Describí el problema, pasos para reproducir o la mejora que proponés"
              rows={5}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Creando..." : "Crear sugerencia"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
