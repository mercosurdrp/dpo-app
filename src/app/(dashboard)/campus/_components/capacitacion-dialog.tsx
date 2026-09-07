"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createCampusCapacitacion, updateCampusCapacitacion } from "@/actions/campus"
import type { CampusCapacitacion } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  pilarCodigo: string
  pilarNombre: string
  /** Si viene, el diálogo edita esa capacitación en vez de crear una nueva. */
  capacitacion?: CampusCapacitacion | null
  onSaved: () => void
}

export function CapacitacionDialog({
  open,
  onOpenChange,
  pilarCodigo,
  pilarNombre,
  capacitacion = null,
  onSaved,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {capacitacion ? "Editar capacitación" : `Nueva capacitación en ${pilarNombre}`}
          </DialogTitle>
        </DialogHeader>

        {/* El formulario se remonta en cada apertura (key): así arranca con los
            valores de la fila que se está editando, sin sincronizar por efecto. */}
        {open && (
          <Formulario
            key={capacitacion?.id ?? "nueva"}
            pilarCodigo={pilarCodigo}
            capacitacion={capacitacion}
            onCerrar={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({
  pilarCodigo,
  capacitacion,
  onCerrar,
  onSaved,
}: {
  pilarCodigo: string
  capacitacion: CampusCapacitacion | null
  onCerrar: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [titulo, setTitulo] = useState(capacitacion?.titulo ?? "")
  const [descripcion, setDescripcion] = useState(capacitacion?.descripcion ?? "")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!titulo.trim()) {
      setError("Poné un título.")
      return
    }

    startTransition(async () => {
      const res = capacitacion
        ? await updateCampusCapacitacion({ id: capacitacion.id, titulo, descripcion })
        : await createCampusCapacitacion({ pilar_codigo: pilarCodigo, titulo, descripcion })

      if ("error" in res) {
        setError(res.error)
        return
      }
      onSaved()
      onCerrar()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="campus_cap_titulo">Título *</Label>
        <Input
          id="campus_cap_titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej.: Seguridad Vial"
          autoFocus
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="campus_cap_desc">Descripción</Label>
        <Textarea
          id="campus_cap_desc"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="De qué se trata, a quién le sirve… (opcional)"
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {capacitacion ? "Guardar" : "Crear"}
        </Button>
      </DialogFooter>
    </form>
  )
}
