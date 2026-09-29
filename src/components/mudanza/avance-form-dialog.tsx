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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AdjuntosInput } from "@/components/adjuntos-input"
import { registrarAvance } from "@/actions/mudanza"
import { MUDANZA_ESTADOS, type MudanzaTarea } from "@/types/mudanza"
import { isoHoy } from "./formato"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  tarea: MudanzaTarea | null
  /** Si no viene tarea, se elige de esta lista. */
  tareas?: MudanzaTarea[]
}

export function AvanceFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        {props.open && <AvanceForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function AvanceForm({ onOpenChange, onSaved, tarea, tareas = [] }: Omit<Props, "open">) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tareaId, setTareaId] = useState<string>(tarea?.id ?? "")
  const [estado, setEstado] = useState<string>(
    tarea ? (tarea.estado === "pendiente" ? "en_curso" : tarea.estado) : "en_curso",
  )
  const [avance, setAvance] = useState<number>(tarea?.avance ?? 0)
  const [archivos, setArchivos] = useState<File[]>([])

  const actual = tarea ?? tareas.find((t) => t.id === tareaId) ?? null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!actual) {
      setError("Elegí la tarea.")
      return
    }
    const fd = new FormData(e.currentTarget)
    fd.set("tarea_id", actual.id)
    fd.set("estado", estado)
    fd.set("avance", String(estado === "hecha" ? 100 : avance))
    for (const f of archivos) fd.append("archivo", f)
    startTransition(async () => {
      const r = await registrarAvance(fd)
      if ("error" in r) {
        setError(r.error)
        return
      }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Registrar avance</DialogTitle>
          <DialogDescription>
            {actual ? actual.nombre : "Contá qué se hizo y en cuánto va la tarea."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!tarea && (
            <div className="space-y-1.5">
              <Label>Tarea *</Label>
              <Select
                value={tareaId}
                onValueChange={(v: string | null) => {
                  const id = v ?? ""
                  setTareaId(id)
                  const t = tareas.find((x) => x.id === id)
                  if (t) {
                    setEstado(t.estado === "pendiente" ? "en_curso" : t.estado)
                    setAvance(t.avance)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir tarea…" />
                </SelectTrigger>
                <SelectContent>
                  {tareas
                    .filter((t) => t.estado !== "hecha")
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.rubro} · {t.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ma-fecha">Fecha</Label>
              <Input id="ma-fecha" name="fecha" type="date" defaultValue={isoHoy()} required />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v: string | null) => setEstado(v ?? "en_curso")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUDANZA_ESTADOS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-avance">Avance %</Label>
              <Input
                id="ma-avance"
                type="number"
                min={0}
                max={100}
                step={5}
                value={estado === "hecha" ? 100 : avance}
                onChange={(e) => setAvance(Number(e.target.value))}
                disabled={estado === "hecha"}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ma-comentario">Qué se hizo</Label>
            <Textarea
              id="ma-comentario"
              name="comentario"
              rows={3}
              maxLength={1000}
              placeholder="Ej.: Terminó la pintura de la zona de descarga, falta demarcar sendas."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fotos o archivos (Ctrl+V para pegar capturas)</Label>
            <AdjuntosInput
              archivos={archivos}
              onChange={setArchivos}
              disabled={pending}
              accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !actual}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
    </>
  )
}
