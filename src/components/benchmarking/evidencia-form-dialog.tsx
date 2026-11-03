"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdjuntosInput } from "@/components/adjuntos-input"
import { subirEvidencias } from "@/actions/benchmarking"
import type { Bench } from "@/types/benchmarking"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  bench: Bench | null
}

export function EvidenciaFormDialog({ open, onOpenChange, onSaved, bench }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [descripcion, setDescripcion] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!bench) return
    setError(null)
    const fd = new FormData()
    fd.set("descripcion", descripcion)
    for (const f of archivos) fd.append("archivo", f)
    startTransition(async () => {
      const r = await subirEvidencias(bench.id, fd)
      if ("error" in r) {
        setError(r.error)
        return
      }
      setArchivos([])
      setDescripcion("")
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar evidencia</DialogTitle>
          <DialogDescription>{bench?.titulo}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Qué muestra (opcional)</Label>
            <Input
              id="ev-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={200}
              placeholder="Ej.: foto del picking por olas en Palco"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fotos o archivos (Ctrl+V para pegar capturas)</Label>
            <AdjuntosInput
              archivos={archivos}
              onChange={setArchivos}
              disabled={pending}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx,.ppt,.pptx"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || archivos.length === 0}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Subir {archivos.length > 1 ? `${archivos.length} archivos` : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
