"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Loader2, Trash2, Settings, ClipboardList } from "lucide-react"
import type { OwdTemplateResumen } from "@/types/database"
import { createOwdTemplate, deleteOwdTemplate } from "@/actions/owd"

interface Pregunta {
  id: string
  numero: string
  texto: string
}
interface Bloque {
  id: string
  nombre: string
  preguntas: Pregunta[]
}
interface PilarH {
  id: string
  nombre: string
  color: string
  bloques: Bloque[]
}

interface Props {
  templates: OwdTemplateResumen[]
  hierarchy: PilarH[]
}

export function OwdAdminClient({ templates, hierarchy }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pilarId, setPilarId] = useState("")
  const [bloqueId, setBloqueId] = useState("")
  const [preguntaId, setPreguntaId] = useState("")
  const [nombre, setNombre] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const conPlantilla = useMemo(
    () => new Set(templates.map((t) => t.template.pregunta_id)),
    [templates],
  )

  const pilar = hierarchy.find((p) => p.id === pilarId)
  const bloque = pilar?.bloques.find((b) => b.id === bloqueId)

  function resetForm() {
    setPilarId("")
    setBloqueId("")
    setPreguntaId("")
    setNombre("")
  }

  async function handleCreate() {
    if (!preguntaId) {
      toast.error("Seleccioná el punto del manual")
      return
    }
    setSaving(true)
    const res = await createOwdTemplate({ preguntaId, nombre: nombre.trim() || undefined })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plantilla creada")
    setOpen(false)
    resetForm()
    router.push(`/owd/admin/${res.data.id}`)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const res = await deleteOwdTemplate(id)
    setDeletingId(null)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plantilla eliminada")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plantillas OWD</h1>
          <p className="text-sm text-muted-foreground">
            Definí el checklist de observación de cada punto del manual DPO.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva plantilla
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva plantilla OWD</DialogTitle>
              <DialogDescription>Elegí el punto del manual al que aplica.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Pilar</Label>
                <Select
                  value={pilarId}
                  onValueChange={(v: string | null) => {
                    setPilarId(v ?? "")
                    setBloqueId("")
                    setPreguntaId("")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar pilar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {hierarchy.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bloque</Label>
                <Select
                  value={bloqueId}
                  onValueChange={(v: string | null) => {
                    setBloqueId(v ?? "")
                    setPreguntaId("")
                  }}
                  disabled={!pilar}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar bloque..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pilar?.bloques.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Punto</Label>
                <Select
                  value={preguntaId}
                  onValueChange={(v: string | null) => setPreguntaId(v ?? "")}
                  disabled={!bloque}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar punto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bloque?.preguntas.map((q) => {
                      const yaExiste = conPlantilla.has(q.id)
                      return (
                        <SelectItem key={q.id} value={q.id} disabled={yaExiste}>
                          {q.numero} — {q.texto.slice(0, 50)}
                          {yaExiste ? " (ya tiene OWD)" : ""}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nombre (opcional)</Label>
                <Input
                  placeholder="Se autocompleta del punto si lo dejás vacío"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={saving || !preguntaId}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear y configurar
              </Button>
            </DialogFooter>
          </DialogContent>
      </Dialog>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-slate-300" />
            <p className="text-muted-foreground">
              Todavía no hay plantillas. Creá la primera con el botón de arriba.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.template.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: t.pilar_color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{t.template.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.pilar_nombre} · {t.pregunta_numero} · {t.total_items} ítems
                    </p>
                  </div>
                  {!t.template.activo && (
                    <Badge variant="outline" className="text-amber-600">
                      Inactiva
                    </Badge>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Link href={`/owd/admin/${t.template.id}`}>
                    <Button variant="outline" size="sm">
                      <Settings className="mr-1 h-4 w-4" /> Configurar
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(t.template.id)}
                    disabled={deletingId === t.template.id}
                  >
                    {deletingId === t.template.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
