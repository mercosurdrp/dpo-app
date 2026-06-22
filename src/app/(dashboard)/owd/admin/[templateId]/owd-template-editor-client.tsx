"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Loader2, Save, ExternalLink } from "lucide-react"
import type { OwdItem, OwdTemplate, OwdResponsable } from "@/types/database"
import { createOwdItem, updateOwdItem, deleteOwdItem, updateOwdTemplate } from "@/actions/owd"

const RESPONSABLE_LABEL: Record<OwdResponsable, string> = {
  operario: "Operario observado",
  sdr: "SDR / supervisor",
  proceso: "Proceso / Admin",
}

interface Contexto {
  template: OwdTemplate
  pregunta_numero: string
  pregunta_texto: string
  pilar_nombre: string
  pilar_color: string
}

interface Props {
  templateId: string
  contexto: Contexto
  items: OwdItem[]
}

export function OwdTemplateEditorClient({ templateId, contexto, items }: Props) {
  const router = useRouter()
  const t = contexto.template

  // --- Cabecera ---
  const [nombre, setNombre] = useState(t.nombre)
  const [descripcion, setDescripcion] = useState(t.descripcion ?? "")
  const [metaMensual, setMetaMensual] = useState(String(t.meta_mensual))
  const [metaCumplimiento, setMetaCumplimiento] = useState(String(t.meta_cumplimiento_pct))
  const [activo, setActivo] = useState(t.activo)
  const [savingHeader, setSavingHeader] = useState(false)

  async function saveHeader() {
    setSavingHeader(true)
    const res = await updateOwdTemplate(templateId, {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      meta_mensual: Number(metaMensual) || 8,
      meta_cumplimiento_pct: Number(metaCumplimiento) || 90,
      activo,
    })
    setSavingHeader(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plantilla guardada")
    router.refresh()
  }

  // --- Ítems ---
  const itemsPorEtapa = useMemo(() => {
    const map = new Map<string, OwdItem[]>()
    for (const i of items) {
      if (!map.has(i.etapa)) map.set(i.etapa, [])
      map.get(i.etapa)!.push(i)
    }
    return Array.from(map.entries())
  }, [items])

  const etapasExistentes = useMemo(() => [...new Set(items.map((i) => i.etapa))], [items])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OwdItem | null>(null)
  const [fEtapa, setFEtapa] = useState("")
  const [fTexto, setFTexto] = useState("")
  const [fDescripcion, setFDescripcion] = useState("")
  const [fCritico, setFCritico] = useState(false)
  const [fResponsable, setFResponsable] = useState<OwdResponsable>("operario")
  const [fOrden, setFOrden] = useState("")
  const [savingItem, setSavingItem] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openNew() {
    setEditing(null)
    setFEtapa(etapasExistentes[0] ?? "")
    setFTexto("")
    setFDescripcion("")
    setFCritico(false)
    setFResponsable("operario")
    setFOrden("")
    setDialogOpen(true)
  }
  function openEdit(item: OwdItem) {
    setEditing(item)
    setFEtapa(item.etapa)
    setFTexto(item.texto)
    setFDescripcion(item.descripcion ?? "")
    setFCritico(item.critico)
    setFResponsable(item.responsable ?? "operario")
    setFOrden(String(item.orden))
    setDialogOpen(true)
  }

  async function saveItem() {
    if (!fEtapa.trim()) return toast.error("Indicá la etapa")
    if (!fTexto.trim()) return toast.error("Indicá qué se observa")
    setSavingItem(true)
    const res = editing
      ? await updateOwdItem(editing.id, {
          etapa: fEtapa.trim(),
          texto: fTexto.trim(),
          descripcion: fDescripcion.trim() || null,
          critico: fCritico,
          responsable: fResponsable,
          ...(fOrden ? { orden: Number(fOrden) } : {}),
        })
      : await createOwdItem({
          templateId,
          etapa: fEtapa.trim(),
          texto: fTexto.trim(),
          descripcion: fDescripcion.trim() || undefined,
          critico: fCritico,
          responsable: fResponsable,
          ...(fOrden ? { orden: Number(fOrden) } : {}),
        })
    setSavingItem(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(editing ? "Ítem actualizado" : "Ítem agregado")
    setDialogOpen(false)
    router.refresh()
  }

  async function handleDeleteItem(id: string) {
    setDeletingId(id)
    const res = await deleteOwdItem(id)
    setDeletingId(null)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success(res.softDeleted ? "Ítem desactivado (tenía respuestas)" : "Ítem eliminado")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: contexto.pilar_color }}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {contexto.pilar_nombre} · {contexto.pregunta_numero}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Editar plantilla OWD</h1>
          <p className="text-sm text-muted-foreground">{contexto.pregunta_texto}</p>
        </div>
        <Link href={`/owd/${templateId}`}>
          <Button variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" /> Ver módulo
          </Button>
        </Link>
      </div>

      {/* Cabecera editable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Meta de OWD por mes</Label>
              <Input
                type="number"
                min={1}
                value={metaMensual}
                onChange={(e) => setMetaMensual(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Meta de cumplimiento (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={metaCumplimiento}
                onChange={(e) => setMetaCumplimiento(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Plantilla activa (visible en el módulo OWD)
          </label>
          <div className="flex justify-end">
            <Button onClick={saveHeader} disabled={savingHeader}>
              {savingHeader ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar configuración
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ítems del checklist */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Checklist ({items.length} ítems)</CardTitle>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Agregar ítem
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Sin ítems todavía. Agregá el primero para que se pueda cargar una observación.
            </p>
          ) : (
            itemsPorEtapa.map(([etapa, grupo]) => (
              <div key={etapa} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {etapa}
                </p>
                {grupo.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
                      item.active ? "bg-slate-50" : "bg-slate-100 opacity-60"
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 text-xs text-slate-400">#{item.orden}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {item.texto}
                          {item.critico && (
                            <span className="ml-1 text-xs font-bold text-red-600">*</span>
                          )}
                          {(item.responsable ?? "operario") !== "operario" && (
                            <Badge
                              variant="outline"
                              className="ml-2 align-middle text-[10px] text-slate-500"
                            >
                              {RESPONSABLE_LABEL[item.responsable ?? "operario"]}
                            </Badge>
                          )}
                        </p>
                        {item.descripcion && (
                          <p className="text-xs text-muted-foreground">{item.descripcion}</p>
                        )}
                        {!item.active && (
                          <Badge variant="outline" className="mt-1 text-amber-600">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Dialog crear/editar ítem */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar ítem" : "Nuevo ítem"}</DialogTitle>
            <DialogDescription>Qué debe observar el supervisor en este paso.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Input
                list="owd-etapas"
                placeholder="Ej: Ingreso al CD"
                value={fEtapa}
                onChange={(e) => setFEtapa(e.target.value)}
              />
              <datalist id="owd-etapas">
                {etapasExistentes.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Qué se observa</Label>
              <Textarea
                rows={2}
                placeholder="Ej: Ingresa al CD antes de las 07:00"
                value={fTexto}
                onChange={(e) => setFTexto(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ayuda / detalle (opcional)</Label>
              <Input value={fDescripcion} onChange={(e) => setFDescripcion(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Orden (opcional)</Label>
                <Input
                  type="number"
                  placeholder="auto"
                  value={fOrden}
                  onChange={(e) => setFOrden(e.target.value)}
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={fCritico}
                  onChange={(e) => setFCritico(e.target.checked)}
                />
                Ítem crítico
              </label>
            </div>
            <div className="space-y-1.5">
              <Label>¿De quién depende este ítem?</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={fResponsable}
                onChange={(e) => setFResponsable(e.target.value as OwdResponsable)}
              >
                <option value="operario">Operario observado</option>
                <option value="sdr">SDR / supervisor</option>
                <option value="proceso">Proceso / Admin</option>
              </select>
              <p className="text-xs text-muted-foreground">
                La tendencia por operario sólo computa los ítems del operario, así no se lo penaliza
                por desvíos del SDR o del proceso.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={savingItem}>
              Cancelar
            </Button>
            <Button onClick={saveItem} disabled={savingItem}>
              {savingItem && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
