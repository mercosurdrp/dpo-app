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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Check, ChevronDown, ChevronRight, ClipboardCheck, History, Info,
  Minus, Pencil, Plus, Trash2,
} from "lucide-react"
import type { DiaCalendario } from "./client"
import { detectarPeriodosCriticos } from "../_lib/detectar-periodos"
import type { Revision, UltimaRevision } from "@/app/api/planeamiento/periodos-criticos/swot/revisiones/route"

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
const CAT_LABEL: Record<Categoria, string> = {
  F: "Fortaleza", O: "Oportunidad", D: "Debilidad", A: "Amenaza",
}

const IMPACTO_BADGE: Record<Impacto, string> = {
  alto: "bg-red-600",
  medio: "bg-amber-500",
  bajo: "bg-slate-400",
}

const IMPACTOS: Impacto[] = ["alto", "medio", "bajo"]

// Cómo se lee cada decisión de una revisión, en el historial y en el ítem.
const ACCION_LABEL = {
  mantiene: "sin cambios",
  modifica: "modificado",
  elimina: "eliminado",
  agrega: "nuevo",
} as const
const ACCION_BADGE = {
  mantiene: "bg-slate-200 text-slate-700",
  modifica: "bg-amber-500 text-white",
  elimina: "bg-red-600 text-white",
  agrega: "bg-emerald-600 text-white",
} as const

const fmtFecha = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })

export function SwotTab({
  dias,
  anio,
}: {
  dias: DiaCalendario[]
  anio: number
}) {
  const [items, setItems] = useState<SwotItem[]>([])
  const [revisiones, setRevisiones] = useState<Revision[]>([])
  const [ultima, setUltima] = useState<Record<string, UltimaRevision>>({})
  const [avisoRevisiones, setAvisoRevisiones] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // null = cerrado · {item|null, cat} = abierto (item null => crear)
  const [editor, setEditor] = useState<{ item: SwotItem | null; cat: Categoria } | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)

  // Períodos críticos del año visible: para elegir cuál terminó y para taggear ítems.
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
      const [resItems, resRev] = await Promise.all([
        fetch("/api/planeamiento/periodos-criticos/swot"),
        fetch("/api/planeamiento/periodos-criticos/swot/revisiones"),
      ])
      const jItems = await resItems.json()
      if (!resItems.ok) throw new Error(jItems.error || `HTTP ${resItems.status}`)
      setItems(jItems.items ?? [])

      // El historial es secundario: si falla (por ejemplo, falta la migración),
      // el FODA vivo se sigue viendo y se avisa.
      const jRev = await resRev.json().catch(() => ({}))
      if (resRev.ok) {
        setRevisiones(jRev.revisiones ?? [])
        setUltima(jRev.ultima_por_item ?? {})
        setAvisoRevisiones(null)
      } else {
        setAvisoRevisiones(jRev.error || `No se pudo cargar el historial (HTTP ${resRev.status})`)
      }
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

  const ultimaRev = revisiones[0]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-sm text-slate-600">
          R3.4.3 — Análisis FODA de los períodos críticos. Es <b>un solo documento</b>,
          siempre vigente. Cuando termina un período crítico se lo <b>revisa ítem por
          ítem</b>: qué sigue igual, qué cambió y qué apareció. Ese registro por período
          es la evidencia.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={() => setVerHistorial((v) => !v)}
            disabled={revisiones.length === 0}
          >
            <History className="size-3.5" />
            Historial ({revisiones.length})
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setRevisando(true)}
            disabled={cargando || items.length === 0 || !!avisoRevisiones}
            title={avisoRevisiones ?? "Revisar el FODA tras un período que terminó"}
          >
            <ClipboardCheck className="size-3.5" />
            Revisar tras un período
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}
      {avisoRevisiones && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          {avisoRevisiones}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
        <Info className="size-4 shrink-0 text-slate-400" />
        {ultimaRev ? (
          <span>
            Última revisión: <b>Rev {ultimaRev.numero} · {ultimaRev.periodo_nombre}</b> el{" "}
            {fmtFecha(ultimaRev.fecha)} · {ultimaRev.resumen.mantiene} sin cambios ·{" "}
            {ultimaRev.resumen.modifica} modificados · {ultimaRev.resumen.elimina} eliminados ·{" "}
            {ultimaRev.resumen.agrega} nuevos. Cada ítem muestra abajo cuándo se lo revisó por última vez.
          </span>
        ) : (
          <span>
            Todavía no hay revisiones registradas. Cuando termine un período crítico, tocá
            «Revisar tras un período». También podés editar o mover ítems entre cuadrantes en
            cualquier momento con el lápiz.
          </span>
        )}
      </div>

      {verHistorial && revisiones.length > 0 && (
        <HistorialRevisiones revisiones={revisiones} />
      )}

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
                  porCategoria[q.cat].map((it) => {
                    const u = ultima[it.id]
                    return (
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
                          {u ? (
                            <span className="ml-auto text-[10px] text-slate-400" title={`${u.periodo_nombre} · ${fmtFecha(u.fecha)}`}>
                              Rev {u.numero} · {fmtFecha(u.fecha)} ·{" "}
                              <span className={u.accion === "mantiene" ? "" : "font-medium text-slate-600"}>
                                {ACCION_LABEL[u.accion]}
                              </span>
                            </span>
                          ) : (
                            <span className="ml-auto text-[10px] text-slate-300">sin revisar</span>
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
                    )
                  })
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

      {revisando && (
        <RevisionDialog
          items={items}
          periodos={periodos}
          anio={anio}
          onClose={() => setRevisando(false)}
          onSaved={() => {
            setRevisando(false)
            setVerHistorial(true)
            void cargar()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Historial: una fila por período revisado, expandible a los cambios
// ---------------------------------------------------------------------------
function HistorialRevisiones({ revisiones }: { revisiones: Revision[] }) {
  const [abierta, setAbierta] = useState<string | null>(revisiones[0]?.id ?? null)
  return (
    <Card className="border-indigo-200">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base text-indigo-800">
          <History className="size-4" /> Revisiones por período
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {revisiones.map((r) => {
          const open = abierta === r.id
          const cambios = r.items.filter((i) => i.accion !== "mantiene")
          return (
            <div key={r.id} className="rounded-md border bg-white">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm"
                onClick={() => setAbierta(open ? null : r.id)}
              >
                {open ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
                <Badge variant="outline" className="font-mono text-[11px]">Rev {r.numero}</Badge>
                <span className="font-semibold text-slate-800">{r.periodo_nombre}</span>
                <span className="text-xs text-slate-500">{fmtFecha(r.fecha)}</span>
                <span className="ml-auto flex flex-wrap gap-1">
                  <Badge className={`${ACCION_BADGE.mantiene} text-[10px]`}>{r.resumen.mantiene} sin cambios</Badge>
                  <Badge className={`${ACCION_BADGE.modifica} text-[10px]`}>{r.resumen.modifica} modificados</Badge>
                  <Badge className={`${ACCION_BADGE.elimina} text-[10px]`}>{r.resumen.elimina} eliminados</Badge>
                  <Badge className={`${ACCION_BADGE.agrega} text-[10px]`}>{r.resumen.agrega} nuevos</Badge>
                </span>
              </button>
              {open && (
                <div className="space-y-2 border-t px-3 py-2">
                  {r.nota && <p className="text-xs italic text-slate-600">{r.nota}</p>}
                  {cambios.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Se revisaron los {r.resumen.mantiene} ítems y ninguno cambió.
                    </p>
                  ) : (
                    cambios.map((c) => (
                      <div key={c.id} className="rounded border border-slate-100 bg-slate-50/60 p-2 text-xs">
                        <div className="mb-1 flex items-center gap-1.5">
                          <Badge className={`${ACCION_BADGE[c.accion]} text-[10px]`}>{ACCION_LABEL[c.accion]}</Badge>
                          <span className="text-slate-500">{CAT_LABEL[c.categoria]}</span>
                          {c.nota && <span className="text-slate-400">· {c.nota}</span>}
                        </div>
                        {c.accion === "modifica" && (
                          <div className="grid gap-1 md:grid-cols-2">
                            <div>
                              <p className="text-[10px] uppercase text-slate-400">Antes</p>
                              <p className="text-slate-600 line-through decoration-slate-300">{c.texto_anterior}</p>
                              {c.accion_anterior && <p className="text-slate-400">Acción: {c.accion_anterior}</p>}
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-slate-400">Después</p>
                              <p className="text-slate-800">{c.texto_nuevo}</p>
                              {c.accion_nuevo && <p className="text-slate-500">Acción: {c.accion_nuevo}</p>}
                            </div>
                          </div>
                        )}
                        {c.accion === "elimina" && (
                          <p className="text-slate-600 line-through decoration-slate-300">{c.texto_anterior}</p>
                        )}
                        {c.accion === "agrega" && (
                          <>
                            <p className="text-slate-800">{c.texto_nuevo}</p>
                            {c.accion_nuevo && <p className="text-slate-500">Acción: {c.accion_nuevo}</p>}
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Revisión tras un período: una decisión por ítem + los nuevos, y se cierra entera
// ---------------------------------------------------------------------------
type DecisionUI = {
  accion: "mantiene" | "modifica" | "elimina" | null
  texto: string
  accion_recomendada: string
  categoria: Categoria
}
type NuevoUI = { categoria: Categoria; texto: string; impacto: Impacto; accion_recomendada: string }

function RevisionDialog({
  items,
  periodos,
  anio,
  onClose,
  onSaved,
}: {
  items: SwotItem[]
  periodos: PeriodoOpcion[]
  anio: number
  onClose: () => void
  onSaved: () => void
}) {
  const [periodoKey, setPeriodoKey] = useState<string>(periodos[0] ? `${periodos[0].nombre}|${periodos[0].fechaInicio}` : "otro")
  const [otroNombre, setOtroNombre] = useState("")
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [nota, setNota] = useState("")
  const [decisiones, setDecisiones] = useState<Record<string, DecisionUI>>(() =>
    Object.fromEntries(items.map((it) => [it.id, { accion: null, texto: it.texto, accion_recomendada: it.accion_recomendada ?? "", categoria: it.categoria }])),
  )
  const [nuevos, setNuevos] = useState<NuevoUI[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const periodo = periodos.find((p) => `${p.nombre}|${p.fechaInicio}` === periodoKey) ?? null
  const decididos = Object.values(decisiones).filter((d) => d.accion !== null).length
  const completo = decididos === items.length && (periodo !== null || otroNombre.trim() !== "")

  const set = (id: string, patch: Partial<DecisionUI>) =>
    setDecisiones((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const marcarRestoSinCambios = () =>
    setDecisiones((prev) => Object.fromEntries(Object.entries(prev).map(([id, d]) => [id, d.accion ? d : { ...d, accion: "mantiene" }])))

  async function cerrar() {
    if (!completo) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/swot/revisiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo_nombre: periodo?.nombre ?? otroNombre.trim(),
          periodo_anio: anio,
          periodo_fecha_inicio: periodo?.fechaInicio ?? null,
          periodo_fecha_fin: periodo?.fechaFin ?? null,
          fecha,
          nota,
          decisiones: items.map((it) => {
            const d = decisiones[it.id]
            return d.accion === "modifica"
              ? { item_id: it.id, accion: "modifica", texto: d.texto, accion_recomendada: d.accion_recomendada, categoria: d.categoria }
              : { item_id: it.id, accion: d.accion }
          }),
          nuevos: nuevos.filter((n) => n.texto.trim()),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success(
        `Revisión registrada: ${j.resumen.mantiene} sin cambios · ${j.resumen.modifica} modificados · ${j.resumen.elimina} eliminados · ${j.resumen.agrega} nuevos`,
      )
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la revisión")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-indigo-600" /> Revisar el FODA tras un período
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Período que terminó</Label>
              <select
                value={periodoKey}
                onChange={(e) => setPeriodoKey(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
              >
                {periodos.map((p) => (
                  <option key={`${p.nombre}|${p.fechaInicio}`} value={`${p.nombre}|${p.fechaInicio}`}>
                    {p.nombre} ({p.fechaInicio} → {p.fechaFin})
                  </option>
                ))}
                <option value="otro">Otro período…</option>
              </select>
              {periodoKey === "otro" && (
                <Input
                  value={otroNombre}
                  onChange={(e) => setOtroNombre(e.target.value)}
                  placeholder="Nombre del período (ej.: Cierre de septiembre)"
                  className="mt-1"
                />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha de la revisión</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
            <span>
              Para cada ítem decidí: <b>sigue igual</b>, <b>cambió</b> (y corregilo acá) o <b>ya no aplica</b>.
              Abajo agregá lo nuevo que dejó el período.
            </span>
            <span className="flex items-center gap-2">
              <b>{decididos} de {items.length}</b> decididos
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={marcarRestoSinCambios}>
                Marcar el resto como «sigue igual»
              </Button>
            </span>
          </div>

          {CUADRANTES.map((q) => {
            const lista = items.filter((it) => it.categoria === q.cat)
            if (lista.length === 0) return null
            return (
              <div key={q.cat} className={`rounded-md border ${q.card}`}>
                <p className={`border-b px-3 py-1.5 text-sm font-semibold ${q.header}`}>{q.titulo}</p>
                <div className="divide-y">
                  {lista.map((it) => {
                    const d = decisiones[it.id]
                    return (
                      <div key={it.id} className={`space-y-2 px-3 py-2 ${d.accion === "elimina" ? "bg-red-50/40" : d.accion === "modifica" ? "bg-amber-50/40" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className={`flex-1 text-slate-800 ${d.accion === "elimina" ? "line-through decoration-slate-400" : ""}`}>
                            {it.texto}
                          </p>
                          <div className="flex shrink-0 gap-1">
                            <Opcion activa={d.accion === "mantiene"} tono="slate" onClick={() => set(it.id, { accion: "mantiene" })} icon={<Check className="size-3" />}>Sigue igual</Opcion>
                            <Opcion activa={d.accion === "modifica"} tono="amber" onClick={() => set(it.id, { accion: "modifica" })} icon={<Pencil className="size-3" />}>Cambió</Opcion>
                            <Opcion activa={d.accion === "elimina"} tono="red" onClick={() => set(it.id, { accion: "elimina" })} icon={<Minus className="size-3" />}>Ya no aplica</Opcion>
                          </div>
                        </div>
                        {d.accion === "modifica" && (
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px]">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-slate-500">Texto nuevo</Label>
                              <Textarea rows={2} value={d.texto} onChange={(e) => set(it.id, { texto: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-slate-500">Acción</Label>
                              <Textarea rows={2} value={d.accion_recomendada} onChange={(e) => set(it.id, { accion_recomendada: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-slate-500">Cuadrante</Label>
                              <select
                                value={d.categoria}
                                onChange={(e) => set(it.id, { categoria: e.target.value as Categoria })}
                                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
                              >
                                {CUADRANTES.map((c) => <option key={c.cat} value={c.cat}>{CAT_LABEL[c.cat]}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="rounded-md border border-emerald-200">
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <p className="text-sm font-semibold text-emerald-700">Nuevo con este período</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => setNuevos((n) => [...n, { categoria: "F", texto: "", impacto: "medio", accion_recomendada: "" }])}
              >
                <Plus className="size-3.5" /> Agregar ítem
              </Button>
            </div>
            {nuevos.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">Nada nuevo por ahora.</p>
            ) : (
              <div className="divide-y">
                {nuevos.map((n, i) => (
                  <div key={i} className="grid gap-2 px-3 py-2 md:grid-cols-[140px_1fr_1fr_110px_32px]">
                    <select
                      value={n.categoria}
                      onChange={(e) => setNuevos((arr) => arr.map((x, j) => (j === i ? { ...x, categoria: e.target.value as Categoria } : x)))}
                      className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                    >
                      {CUADRANTES.map((c) => <option key={c.cat} value={c.cat}>{CAT_LABEL[c.cat]}</option>)}
                    </select>
                    <Textarea rows={2} placeholder="Qué aprendimos…" value={n.texto}
                      onChange={(e) => setNuevos((arr) => arr.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                    <Textarea rows={2} placeholder="Acción (opcional)" value={n.accion_recomendada}
                      onChange={(e) => setNuevos((arr) => arr.map((x, j) => (j === i ? { ...x, accion_recomendada: e.target.value } : x)))} />
                    <select
                      value={n.impacto}
                      onChange={(e) => setNuevos((arr) => arr.map((x, j) => (j === i ? { ...x, impacto: e.target.value as Impacto } : x)))}
                      className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                    >
                      {IMPACTOS.map((im) => <option key={im} value={im}>Impacto {im}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" className="h-9 w-8 p-0 text-red-600" onClick={() => setNuevos((arr) => arr.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nota de la revisión (opcional)</Label>
            <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué pasó en el período y qué se concluyó…" />
          </div>

          {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button onClick={cerrar} disabled={guardando || !completo} title={completo ? "" : "Decidí todos los ítems y elegí el período"}>
              {guardando ? "Guardando…" : "Cerrar revisión"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Opcion({
  activa, tono, onClick, icon, children,
}: {
  activa: boolean
  tono: "slate" | "amber" | "red"
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const on = {
    slate: "bg-slate-700 text-white border-slate-700",
    amber: "bg-amber-500 text-white border-amber-500",
    red: "bg-red-600 text-white border-red-600",
  }[tono]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors ${
        activa ? on : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      {children}
    </button>
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
      periodo_nombre: periodo?.nombre ?? (periodoNombre || null),
      periodo_anio: periodo?.anio ?? (item?.periodo_anio ?? null),
      periodo_fecha_inicio: periodo?.fechaInicio ?? (item?.periodo_fecha_inicio ?? null),
      periodo_fecha_fin: periodo?.fechaFin ?? (item?.periodo_fecha_fin ?? null),
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
