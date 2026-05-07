"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  crearTareaDirecta,
  searchPuntosManual,
  type PuntoManualSearchResult,
} from "@/actions/tareas-directas"

type Operador = {
  id: string
  nombre: string
  email: string | null
  role: string
}

interface Props {
  operadores: Operador[]
}

export function NuevaTareaClient({ operadores }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Form state
  const [titulo, setTitulo] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [fechaLimite, setFechaLimite] = useState("")
  const [requiereFoto, setRequiereFoto] = useState(false)
  const [responsableIds, setResponsableIds] = useState<string[]>([])
  const [puntoManual, setPuntoManual] = useState<PuntoManualSearchResult | null>(
    null
  )

  // Buscador de operadores
  const [opQuery, setOpQuery] = useState("")
  const operadoresFiltrados = useMemo(() => {
    const q = opQuery.trim().toLowerCase()
    if (!q) return operadores
    return operadores.filter(
      (o) =>
        o.nombre.toLowerCase().includes(q) ||
        (o.email ?? "").toLowerCase().includes(q)
    )
  }, [opQuery, operadores])

  // Buscador de puntos del manual
  const [puntoQuery, setPuntoQuery] = useState("")
  const [puntos, setPuntos] = useState<PuntoManualSearchResult[]>([])
  const [searchingPuntos, setSearchingPuntos] = useState(false)
  const [puntoOpen, setPuntoOpen] = useState(false)
  const puntoRootRef = useRef<HTMLDivElement | null>(null)

  // Debounced search puntos
  useEffect(() => {
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
  }, [puntoQuery, puntoOpen])

  // Click-outside cierre del popover de puntos
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
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    )
  }

  function removeResponsable(id: string) {
    setResponsableIds((prev) => prev.filter((r) => r !== id))
  }

  function elegirPunto(p: PuntoManualSearchResult) {
    setPuntoManual(p)
    setPuntoOpen(false)
    setPuntoQuery("")
    // Pre-cargar descripción con el "como verificar" si está vacía
    if (!descripcion.trim() && p.como_verificar) {
      setDescripcion(p.como_verificar)
    }
  }

  function quitarPunto() {
    setPuntoManual(null)
  }

  async function handleSubmit(e: React.FormEvent) {
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

    startTransition(async () => {
      const result = await crearTareaDirecta({
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        responsable_ids: responsableIds,
        fecha_limite: fechaLimite || null,
        evidencia_obligatoria: requiereFoto,
        pregunta_id: puntoManual?.pregunta_id ?? null,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Tarea creada")
      router.push(`/planes/${result.data.id}`)
    })
  }

  const responsablesElegidos = responsableIds
    .map((id) => operadores.find((o) => o.id === id))
    .filter((o): o is Operador => !!o)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" render={<Link href="/registro-tareas" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-slate-900">Nueva tarea</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Punto del manual */}
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
                    {puntoManual.requerimiento && (
                      <p className="mt-2 text-xs text-slate-600">
                        <span className="font-semibold">Requerimiento:</span>{" "}
                        {puntoManual.requerimiento}
                      </p>
                    )}
                    {puntoManual.como_verificar && (
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-semibold">Cómo verificar:</span>{" "}
                        {puntoManual.como_verificar}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={quitarPunto}
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
                        Sin resultados. Podés crear la tarea sin asociar punto y editarla luego.
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
                  Asociar al manual deja la tarea trazable para auditorías. Podés
                  hacerlo luego desde el detalle.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Datos básicos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Tarea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder='Ej: "Limpieza zona de expedición"'
                maxLength={120}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="descripcion">Instrucciones</Label>
              <Textarea
                id="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalle qué tiene que hacer el operador, criterio de cumplimiento, etc."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="fecha_limite">Fecha límite</Label>
                <Input
                  id="fecha_limite"
                  type="date"
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={requiereFoto}
                    onCheckedChange={(v) => setRequiereFoto(v === true)}
                  />
                  Requiere foto al cerrar
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
            {/* Chips */}
            {responsablesElegidos.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {responsablesElegidos.map((o) => (
                  <Badge
                    key={o.id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
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
                <div className="p-3 text-xs text-slate-500">
                  Sin resultados.
                </div>
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
              puede cerrar la tarea.
            </p>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            render={<Link href="/registro-tareas" />}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear tarea
          </Button>
        </div>
      </form>
    </div>
  )
}
