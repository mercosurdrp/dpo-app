"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Info, Pencil, Plus, Trash2 } from "lucide-react"
import type { DiaCalendario } from "./client"
import { detectarPeriodosCriticos } from "../_lib/detectar-periodos"

type Categoria = "F" | "O" | "D" | "A"
type Impacto = "alto" | "medio" | "bajo"

type SwotItem = {
  id: string
  categoria: Categoria
  texto: string
  impacto: Impacto
  accion_recomendada: string
  periodo_nombre: string | null
  periodo_anio: number | null
  periodo_fecha_inicio: string | null
  periodo_fecha_fin: string | null
}

type PeriodoOpcion = {
  nombre: string
  fechaInicio: string
  fechaFin: string
  anio: number
}

const CUADRANTES: {
  cat: Categoria
  titulo: string
  card: string
  header: string
}[] = [
  { cat: "F", titulo: "Fortalezas", card: "border-emerald-200", header: "text-emerald-700" },
  { cat: "O", titulo: "Oportunidades", card: "border-sky-200", header: "text-sky-700" },
  { cat: "D", titulo: "Debilidades", card: "border-amber-200", header: "text-amber-700" },
  { cat: "A", titulo: "Amenazas", card: "border-red-200", header: "text-red-700" },
]

const IMPACTO_BADGE: Record<Impacto, string> = {
  alto: "bg-red-600",
  medio: "bg-amber-500",
  bajo: "bg-slate-400",
}

const IMPACTOS: Impacto[] = ["alto", "medio", "bajo"]

export function SwotTab({
  dias,
  anio,
}: {
  dias: DiaCalendario[]
  anio: number
}) {
  const [items, setItems] = useState<SwotItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // null = cerrado · {item|null, cat} = abierto (item null => crear)
  const [editor, setEditor] = useState<{ item: SwotItem | null; cat: Categoria } | null>(null)

  // Períodos críticos del año visible, para taggear de cuál surgió un item.
  const periodos = useMemo<PeriodoOpcion[]>(() => {
    return detectarPeriodosCriticos(dias).map((p) => ({
      nombre: p.nombre,
      fechaInicio: p.fechaInicio,
      fechaFin: p.fechaFin,
      anio,
    }))
  }, [dias, anio])

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/swot")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setItems(j.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando el análisis FODA")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  const porCategoria = useMemo(() => {
    const m: Record<Categoria, SwotItem[]> = { F: [], O: [], D: [], A: [] }
    for (const it of items) m[it.categoria]?.push(it)
    return m
  }, [items])

  async function eliminar(it: SwotItem) {
    if (!confirm(`¿Eliminar este item del FODA?\n\n"${it.texto}"`)) return
    try {
      const res = await fetch(
        `/api/planeamiento/periodos-criticos/swot/${it.id}`,
        { method: "DELETE" },
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success("Item eliminado")
      void cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-sm text-slate-600">
          R3.4.3 — Análisis FODA de los períodos críticos. Es un{" "}
          <b>documento continuo</b>: una vez finalizado un período crítico, sumá
          aprendizajes y <b>movelos entre cuadrantes</b> (por ejemplo, pasar una
          Debilidad a Fortaleza o mitigar una Amenaza).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
        <Info className="size-4 shrink-0 text-slate-400" />
        Para mover un item de cuadrante, editalo y cambiá su categoría. El tag de
        período es opcional e indica de qué período crítico surgió el aprendizaje.
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {CUADRANTES.map((q) => (
            <Card key={q.cat} className={q.card}>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className={`text-base ${q.header}`}>
                  {q.titulo}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    ({porCategoria[q.cat].length})
                  </span>
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setEditor({ item: null, cat: q.cat })}
                >
                  <Plus className="size-3.5" /> Agregar
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {porCategoria[q.cat].length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin items.</p>
                ) : (
                  porCategoria[q.cat].map((it) => (
                    <div
                      key={it.id}
                      className="group rounded-md border bg-white p-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="whitespace-pre-wrap text-slate-800">
                          {it.texto}
                        </p>
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => setEditor({ item: it, cat: it.categoria })}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-600"
                            onClick={() => void eliminar(it)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge className={`${IMPACTO_BADGE[it.impacto]} text-[10px]`}>
                          Impacto {it.impacto}
                        </Badge>
                        {it.periodo_nombre && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {it.periodo_nombre}
                          </Badge>
                        )}
                      </div>
                      {it.accion_recomendada && (
                        <p className="mt-1.5 border-t pt-1.5 text-xs text-slate-600">
                          <span className="font-medium text-slate-500">
                            Acción:{" "}
                          </span>
                          {it.accion_recomendada}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editor && (
        <ItemDialog
          item={editor.item}
          catDefault={editor.cat}
          periodos={periodos}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            void cargar()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog crear/editar item FODA (cambiar categoría = mover de cuadrante)
// ---------------------------------------------------------------------------
function ItemDialog({
  item,
  catDefault,
  periodos,
  onClose,
  onSaved,
}: {
  item: SwotItem | null
  catDefault: Categoria
  periodos: PeriodoOpcion[]
  onClose: () => void
  onSaved: () => void
}) {
  const [categoria, setCategoria] = useState<Categoria>(item?.categoria ?? catDefault)
  const [texto, setTexto] = useState(item?.texto ?? "")
  const [impacto, setImpacto] = useState<Impacto>(item?.impacto ?? "medio")
  const [accion, setAccion] = useState(item?.accion_recomendada ?? "")
  // "" = General (sin período). Si tiene, guardamos el nombre como clave.
  const [periodoNombre, setPeriodoNombre] = useState<string>(item?.periodo_nombre ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!texto.trim()) {
      setError("El texto es obligatorio")
      return
    }
    setGuardando(true)
    setError(null)
    const periodo = periodos.find((p) => p.nombre === periodoNombre)
    const payload = {
      categoria,
      texto: texto.trim(),
      impacto,
      accion_recomendada: accion.trim(),
      periodo_nombre: periodo?.nombre ?? null,
      periodo_anio: periodo?.anio ?? null,
      periodo_fecha_inicio: periodo?.fechaInicio ?? null,
      periodo_fecha_fin: periodo?.fechaFin ?? null,
    }
    try {
      const url = item
        ? `/api/planeamiento/periodos-criticos/swot/${item.id}`
        : "/api/planeamiento/periodos-criticos/swot"
      const res = await fetch(url, {
        method: item ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success(item ? "Item actualizado" : "Item agregado")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Editar item FODA" : "Agregar item FODA"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {error && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as Categoria)}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
              >
                <option value="F">Fortaleza</option>
                <option value="O">Oportunidad</option>
                <option value="D">Debilidad</option>
                <option value="A">Amenaza</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Impacto</Label>
              <select
                value={impacto}
                onChange={(e) => setImpacto(e.target.value as Impacto)}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
              >
                {IMPACTOS.map((i) => (
                  <option key={i} value={i}>
                    {i.charAt(0).toUpperCase() + i.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Item</Label>
            <Textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Descripción del elemento FODA…"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Acción recomendada (opcional)</Label>
            <Textarea
              rows={2}
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              placeholder="Qué hacer al respecto…"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Período crítico (opcional)</Label>
            <select
              value={periodoNombre}
              onChange={(e) => setPeriodoNombre(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
            >
              <option value="">— General (sin período) —</option>
              {periodos.map((p) => (
                <option key={`${p.nombre}-${p.fechaInicio}`} value={p.nombre}>
                  {p.nombre} ({p.fechaInicio} → {p.fechaFin})
                </option>
              ))}
              {periodoNombre &&
                !periodos.some((p) => p.nombre === periodoNombre) && (
                  <option value={periodoNombre}>{periodoNombre}</option>
                )}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : item ? "Guardar" : "Agregar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
