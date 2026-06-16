"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { OwdItem, OwdResultado, CatalogoVehiculo } from "@/types/database"
import { Loader2, CheckCircle2, XCircle, MinusCircle, ImagePlus, X } from "lucide-react"
import { createObservacion } from "@/actions/owd"

interface Props {
  templateId: string
  titulo: string
  items: OwdItem[]
  empleados: { nombre: string; sector: string | null }[]
  supervisorDefault?: string
  vehiculos: CatalogoVehiculo[]
}

type Respuestas = Record<string, { resultado: OwdResultado; comentario: string }>
type FotoLocal = { file: File; url: string }

// Comprime una imagen en el navegador antes de subirla: la reescala a un lado
// máximo y la re-exporta como JPEG. Una foto de celular (3–8 MB) baja a
// ~200–400 KB, así varias fotos no revientan el límite de 25 MB del request.
// Si algo falla, devuelve el archivo original sin tocar.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file
  try {
    const bitmap = await createImageBitmap(file)
    const MAX = 1600
    let { width, height } = bitmap
    if (width > MAX || height > MAX) {
      const scale = Math.min(MAX / width, MAX / height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.7),
    )
    if (!blob || blob.size >= file.size) return file
    const nombre = file.name.replace(/\.\w+$/, "") + ".jpg"
    return new File([blob], nombre, { type: "image/jpeg" })
  } catch {
    return file
  }
}

export function NuevaOwdClient({ templateId, titulo, items, empleados, supervisorDefault, vehiculos }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Fotos de evidencia por ítem (varias por ítem). El preview usa object URLs.
  const [fotos, setFotos] = useState<Record<string, FotoLocal[]>>({})
  const fotosRef = useRef(fotos)
  // Ítem destino del pegado con Ctrl+V (último cuya zona de fotos se activó)
  const [pasteTarget, setPasteTarget] = useState<string | null>(null)
  const pasteTargetRef = useRef<string | null>(null)

  useEffect(() => {
    fotosRef.current = fotos
  }, [fotos])
  useEffect(() => {
    pasteTargetRef.current = pasteTarget
  }, [pasteTarget])

  const addFotos = useCallback(async (itemId: string, files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"))
    if (imgs.length === 0) {
      toast.error("Solo se pueden adjuntar imágenes")
      return
    }
    const comprimidas = await Promise.all(imgs.map(compressImage))
    setFotos((prev) => ({
      ...prev,
      [itemId]: [
        ...(prev[itemId] ?? []),
        ...comprimidas.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
      ],
    }))
  }, [])

  const removeFoto = useCallback((itemId: string, idx: number) => {
    setFotos((prev) => {
      const arr = prev[itemId] ?? []
      const target = arr[idx]
      if (target) URL.revokeObjectURL(target.url)
      return { ...prev, [itemId]: arr.filter((_, i) => i !== idx) }
    })
  }, [])

  // Pegar captura con Ctrl+V → va al ítem cuya zona de fotos se activó por última vez
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = pasteTargetRef.current
      if (!target || !e.clipboardData) return
      const files: File[] = []
      for (const it of Array.from(e.clipboardData.items)) {
        if (!it.type.startsWith("image/")) continue
        const blob = it.getAsFile()
        if (!blob) continue
        const ext = blob.type.split("/")[1] || "png"
        files.push(new File([blob], `captura-${Date.now()}.${ext}`, { type: blob.type }))
      }
      if (files.length === 0) return
      addFotos(target, files)
      toast.success("Captura pegada como evidencia")
      e.preventDefault()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [addFotos])

  // Revocar todos los object URLs al desmontar
  useEffect(
    () => () => {
      for (const arr of Object.values(fotosRef.current)) {
        for (const f of arr) URL.revokeObjectURL(f.url)
      }
    },
    [],
  )

  const today = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(today)
  const [supervisor, setSupervisor] = useState(supervisorDefault ?? "")
  const [empleado, setEmpleado] = useState("")
  const [rol, setRol] = useState<string>("Chofer")
  const [dominio, setDominio] = useState<string>("")
  const [accionCorrectiva, setAccionCorrectiva] = useState("")
  const [obsGeneral, setObsGeneral] = useState("")

  const [respuestas, setRespuestas] = useState<Respuestas>(() =>
    Object.fromEntries(items.map((i) => [i.id, { resultado: "ok" as OwdResultado, comentario: "" }])),
  )

  const itemsPorEtapa = useMemo(() => {
    const map = new Map<string, OwdItem[]>()
    for (const i of items) {
      if (!map.has(i.etapa)) map.set(i.etapa, [])
      map.get(i.etapa)!.push(i)
    }
    return Array.from(map.entries())
  }, [items])

  const totalOk = Object.values(respuestas).filter((r) => r.resultado === "ok").length
  const totalNook = Object.values(respuestas).filter((r) => r.resultado === "nook").length
  const totalNa = Object.values(respuestas).filter((r) => r.resultado === "na").length
  const evaluables = totalOk + totalNook
  const pct = evaluables === 0 ? 0 : Math.round((totalOk / evaluables) * 1000) / 10

  function setResultado(itemId: string, resultado: OwdResultado) {
    setRespuestas((prev) => ({ ...prev, [itemId]: { ...prev[itemId], resultado } }))
  }
  function setComentario(itemId: string, comentario: string) {
    setRespuestas((prev) => ({ ...prev, [itemId]: { ...prev[itemId], comentario } }))
  }

  async function handleSubmit() {
    if (!supervisor.trim()) {
      toast.error("Ingresá el nombre del supervisor")
      return
    }
    if (!empleado.trim()) {
      toast.error("Seleccioná el empleado observado")
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.append("templateId", templateId)
    fd.append("fecha", fecha)
    fd.append("supervisor", supervisor)
    fd.append("empleadoObservado", empleado)
    fd.append("rolEmpleado", rol)
    fd.append("dominio", dominio)
    fd.append("accionCorrectiva", accionCorrectiva)
    fd.append("observaciones", obsGeneral)
    fd.append(
      "respuestas",
      JSON.stringify(
        items.map((i) => ({
          item_id: i.id,
          resultado: respuestas[i.id].resultado,
          comentario: respuestas[i.id].comentario || undefined,
        })),
      ),
    )
    for (const i of items) {
      for (const f of fotos[i.id] ?? []) fd.append(`foto__${i.id}`, f.file)
    }
    try {
      const result = await createObservacion(fd)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("OWD guardada")
      router.push(`/owd/${templateId}/${result.data.id}`)
    } catch {
      toast.error(
        "No se pudo guardar. Si cargaste fotos, puede que pesen demasiado: quitá algunas o sacalas más livianas e intentá de nuevo.",
      )
    } finally {
      setSaving(false)
    }
  }

  const personasOptions = empleados.map((e) => e.nombre)

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Esta plantilla todavía no tiene ítems en el checklist. Pedile a un administrador que los
          cargue desde el editor de plantillas.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nueva observación</h1>
        <p className="text-sm text-muted-foreground">{titulo}</p>
      </div>

      {/* Cabecera */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la observación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Supervisor</Label>
              <Input
                placeholder="Nombre del observador"
                value={supervisor}
                onChange={(e) => setSupervisor(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Empleado observado</Label>
              <Select value={empleado} onValueChange={(v: string | null) => setEmpleado(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {personasOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Sin empleados activos cargados
                    </div>
                  ) : (
                    personasOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={rol} onValueChange={(v: string | null) => setRol(v ?? "Chofer")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Chofer">Chofer</SelectItem>
                  <SelectItem value="Ayudante">Ayudante</SelectItem>
                  <SelectItem value="Operario">Operario</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Dominio (opcional)</Label>
            <Select value={dominio} onValueChange={(v: string | null) => setDominio(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Sin seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {vehiculos.map((v) => (
                  <SelectItem key={v.id} value={v.dominio}>
                    {v.dominio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Resumen en vivo */}
      <Card className="sticky top-2 z-10 border-slate-200 bg-white/95 backdrop-blur">
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" /> {totalOk}
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-4 w-4" /> {totalNook}
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <MinusCircle className="h-4 w-4" /> {totalNa}
            </span>
          </div>
          <div
            className={`text-lg font-bold ${
              pct >= 90 ? "text-green-600" : pct >= 75 ? "text-amber-600" : "text-red-600"
            }`}
          >
            {pct.toFixed(1)}%
          </div>
        </CardContent>
      </Card>

      {/* Ítems agrupados por etapa */}
      {itemsPorEtapa.map(([etapa, grupo]) => (
        <Card key={etapa}>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-slate-500">{etapa}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {grupo.map((item) => {
              const r = respuestas[item.id]
              return (
                <div key={item.id} className="space-y-2 rounded-md border bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {item.texto}
                        {item.critico && (
                          <span className="ml-1 text-xs font-bold text-red-600">*</span>
                        )}
                      </p>
                      {item.descripcion && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.descripcion}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={r.resultado === "ok" ? "default" : "outline"}
                      className={r.resultado === "ok" ? "bg-green-600 hover:bg-green-700" : ""}
                      onClick={() => setResultado(item.id, "ok")}
                    >
                      OK
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={r.resultado === "nook" ? "default" : "outline"}
                      className={r.resultado === "nook" ? "bg-red-600 hover:bg-red-700" : ""}
                      onClick={() => setResultado(item.id, "nook")}
                    >
                      NO OK
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={r.resultado === "na" ? "default" : "outline"}
                      className={r.resultado === "na" ? "bg-slate-600 hover:bg-slate-700" : ""}
                      onClick={() => setResultado(item.id, "na")}
                    >
                      N/A
                    </Button>
                  </div>
                  {r.resultado === "nook" && (
                    <Textarea
                      placeholder="Comentario obligatorio para NO OK"
                      rows={2}
                      value={r.comentario}
                      onChange={(e) => setComentario(item.id, e.target.value)}
                    />
                  )}
                  {r.resultado !== "nook" && r.comentario && (
                    <Textarea
                      placeholder="Comentario"
                      rows={2}
                      value={r.comentario}
                      onChange={(e) => setComentario(item.id, e.target.value)}
                    />
                  )}

                  {/* Fotos de evidencia (varias por ítem) */}
                  <div
                    className={`space-y-1.5 rounded-md p-2 transition-colors ${
                      pasteTarget === item.id ? "bg-blue-50 ring-1 ring-blue-200" : ""
                    }`}
                    onClick={() => setPasteTarget(item.id)}
                    onFocusCapture={() => setPasteTarget(item.id)}
                  >
                    <Label className="text-xs text-muted-foreground">
                      Evidencia (fotos — podés pegar con Ctrl+V)
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {(fotos[item.id] ?? []).map((f, idx) => (
                        <div
                          key={idx}
                          className="group relative h-16 w-16 overflow-hidden rounded-md border bg-white"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={f.url}
                            alt={`evidencia ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFoto(item.id, idx)
                            }}
                            className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-80 transition-opacity hover:opacity-100"
                            aria-label="Quitar foto"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600">
                        <ImagePlus className="h-5 w-5" />
                        <span className="mt-0.5 text-[10px]">Agregar</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const fl = Array.from(e.target.files ?? [])
                            if (fl.length) addFotos(item.id, fl)
                            e.target.value = ""
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Cierre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cierre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Acción correctiva (si hubo NO OK)</Label>
            <Textarea
              rows={3}
              placeholder="Qué se hizo o se va a hacer para corregir los desvíos"
              value={accionCorrectiva}
              onChange={(e) => setAccionCorrectiva(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones generales</Label>
            <Textarea rows={3} value={obsGeneral} onChange={(e) => setObsGeneral(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push(`/owd/${templateId}`)}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar OWD
        </Button>
      </div>
    </div>
  )
}
