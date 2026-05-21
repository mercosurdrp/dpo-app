"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PRIORIDAD_LABELS } from "@/lib/constants"
import {
  crearTareaDirecta,
  searchPuntosManual,
  type PuntoManualSearchResult,
} from "@/actions/tareas-directas"
import type { PrioridadPlan } from "@/types/database"

export type Operador = {
  id: string
  nombre: string
  email: string | null
  role: string
}

/** Punto del manual prefijado (cuando el form se abre desde un pilar). */
export type PuntoFijo = {
  pregunta_id: string
  numero: string
  texto: string
  pilar_nombre: string
  pilar_color: string
}

interface Props {
  operadores: Operador[]
  /**
   * Si viene, la tarea queda asociada a este punto del manual (tipo
   * 'auditoria') y no se muestra el buscador de puntos.
   */
  puntoFijo?: PuntoFijo | null
  /** Se llama con el id de la tarea creada. El caller decide navegar o cerrar. */
  onCreated?: (id: string) => void
  /** Botón de envío. */
  submitLabel?: string
  /** Botón/acción de cancelar (opcional, p.ej. cerrar diálogo). */
  onCancel?: () => void
  /** Limpiar el form tras crear (modo diálogo). Default false. */
  resetOnSuccess?: boolean
}

export function TareaForm({
  operadores,
  puntoFijo = null,
  onCreated,
  submitLabel = "Crear tarea",
  onCancel,
  resetOnSuccess = false,
}: Props) {
  const [pending, startTransition] = useTransition()

  // Campos
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [fechaInicio, setFechaInicio] = useState("")
  const [fechaLimite, setFechaLimite] = useState("")
  const [prioridad, setPrioridad] = useState<PrioridadPlan>("media")
  const [requiereEvidencia, setRequiereEvidencia] = useState(true)
  const [responsableIds, setResponsableIds] = useState<string[]>([])
  const [puntoManual, setPuntoManual] = useState<PuntoManualSearchResult | null>(
    null,
  )

  // Buscador de operadores
  const [opQuery, setOpQuery] = useState("")
  const operadoresFiltrados = useMemo(() => {
    const q = opQuery.trim().toLowerCase()
    if (!q) return operadores
    return operadores.filter(
      (o) =>
        o.nombre.toLowerCase().includes(q) ||
        (o.email ?? "").toLowerCase().includes(q),
    )
  }, [opQuery, operadores])

  // Buscador de puntos del manual (sólo si no hay punto fijo)
  const [puntoQuery, setPuntoQuery] = useState("")
  const [puntos, setPuntos] = useState<PuntoManualSearchResult[]>([])
  const [searchingPuntos, setSearchingPuntos] = useState(false)
  const [puntoOpen, setPuntoOpen] = useState(false)
  const puntoRootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (puntoFijo) return
    const t = setTimeout(async () => {
      if (puntoQuery.trim().length === 0 && !puntoOpen) return
      setSearchingPuntos(true)
      try {
        const result = await searchPuntosManual(puntoQuery, 25)
        setPuntos(result)
      } finally {
        setSearchingPuntos(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [puntoQuery, puntoOpen, puntoFijo])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        puntoRootRef.current &&
        !puntoRootRef.current.contains(e.target as Node)
      ) {
        setPuntoOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  function toggleResponsable(id: string) {
    setResponsableIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    )
  }

  function removeResponsable(id: string) {
    setResponsableIds((prev) => prev.filter((r) => r !== id))
  }

  function elegirPunto(p: PuntoManualSearchResult) {
    setPuntoManual(p)
    setPuntoOpen(false)
    setPuntoQuery("")
    if (!descripcion.trim() && p.como_verificar) {
      setDescripcion(p.como_verificar)
    }
  }

  function resetForm() {
    setTitulo("")
    setDescripcion("")
    setFechaInicio("")
    setFechaLimite("")
    setPrioridad("media")
    setRequiereEvidencia(true)
    setResponsableIds([])
    setPuntoManual(null)
    setOpQuery("")
    setPuntoQuery("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!titulo.trim()) {
      toast.error("El título es requerido")
      return
    }
    if (!descripcion.trim()) {
      toast.error("La descripción es requerida")
      return
    }
    if (responsableIds.length === 0) {
      toast.error("Asigná al menos un responsable")
      return
    }

    const preguntaId = puntoFijo?.pregunta_id ?? puntoManual?.pregunta_id ?? null

    startTransition(async () => {
      const result = await crearTareaDirecta({
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        responsable_ids: responsableIds,
        fecha_inicio: fechaInicio || null,
        fecha_limite: fechaLimite || null,
        prioridad,
        evidencia_obligatoria: requiereEvidencia,
        pregunta_id: preguntaId,
        // Desde un pilar la tarea es de auditoría; suelta es directa.
        tipo: puntoFijo ? "auditoria" : "directa",
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Tarea creada")
      if (resetOnSuccess) resetForm()
      onCreated?.(result.data.id)
    })
  }

  const responsablesElegidos = responsableIds
    .map((id) => operadores.find((o) => o.id === id))
    .filter((o): o is Operador => !!o)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Punto del manual */}
      {puntoFijo ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: puntoFijo.pilar_color }}
            >
              {puntoFijo.pilar_nombre}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-700">{puntoFijo.numero}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{puntoFijo.texto}</p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Punto del manual (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {puntoManual ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: puntoManual.pilar_color }}
                      >
                        {puntoManual.pilar_nombre}
                      </span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-700">
                        {puntoManual.bloque_nombre}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {puntoManual.numero} · {puntoManual.texto}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPuntoManual(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div ref={puntoRootRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={puntoQuery}
                    onChange={(e) => {
                      setPuntoQuery(e.target.value)
                      setPuntoOpen(true)
                    }}
                    onFocus={() => setPuntoOpen(true)}
                    placeholder="Buscar por número, texto, guía o requerimiento…"
                    className="pl-8"
                  />
                </div>
                {puntoOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-white shadow-lg">
                    {searchingPuntos && (
                      <div className="flex items-center justify-center gap-2 p-3 text-xs text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                      </div>
                    )}
                    {!searchingPuntos && puntos.length === 0 && (
                      <div className="p-3 text-xs text-slate-500">
                        Sin resultados. Podés crear la tarea sin asociar punto y
                        editarla luego.
                      </div>
                    )}
                    {!searchingPuntos &&
                      puntos.map((p) => (
                        <button
                          key={p.pregunta_id}
                          type="button"
                          onClick={() => elegirPunto(p)}
                          className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
                              style={{ backgroundColor: p.pilar_color }}
                            >
                              {p.pilar_nombre}
                            </span>
                            <span className="text-slate-500">{p.numero}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-slate-800">
                            {p.texto}
                          </p>
                        </button>
                      ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Asociar al manual deja la tarea trazable para auditorías.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Datos básicos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tarea</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tf-titulo">Título</Label>
            <Input
              id="tf-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder='Ej: "Limpieza zona de expedición"'
              maxLength={120}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tf-desc">Descripción / Instrucciones</Label>
            <Textarea
              id="tf-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué hay que hacer, criterio de cumplimiento, etc."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tf-fi">Fecha inicio</Label>
              <Input
                id="tf-fi"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-fl">Fecha límite / vencimiento</Label>
              <Input
                id="tf-fl"
                type="date"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <Select
                value={prioridad}
                onValueChange={(v) => v && setPrioridad(v as PrioridadPlan)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["alta", "media", "baja"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDAD_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={requiereEvidencia}
                  onCheckedChange={(v) => setRequiereEvidencia(v === true)}
                />
                Requiere evidencia al cerrar
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Responsables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Responsables{" "}
            <span className="text-xs font-normal text-slate-500">
              ({responsableIds.length} seleccionado
              {responsableIds.length === 1 ? "" : "s"})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {responsablesElegidos.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {responsablesElegidos.map((o) => (
                <Badge key={o.id} variant="secondary" className="gap-1 pr-1">
                  {o.nombre}
                  <button
                    type="button"
                    onClick={() => removeResponsable(o.id)}
                    className="rounded-full p-0.5 hover:bg-slate-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={opQuery}
              onChange={(e) => setOpQuery(e.target.value)}
              placeholder="Buscar persona…"
              className="pl-8"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border">
            {operadoresFiltrados.length === 0 && (
              <div className="p-3 text-xs text-slate-500">Sin resultados.</div>
            )}
            {operadoresFiltrados.map((o) => {
              const checked = responsableIds.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleResponsable(o.id)}
                  className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    checked ? "bg-emerald-50" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{o.nombre}</p>
                    {o.email && (
                      <p className="text-xs text-slate-500">{o.email}</p>
                    )}
                  </div>
                  {checked && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">
            El primero seleccionado queda como responsable principal. Cualquiera
            puede responder y cerrar la tarea.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
