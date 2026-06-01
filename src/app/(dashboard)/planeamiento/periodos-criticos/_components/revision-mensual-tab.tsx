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
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  FileDown,
  Paperclip,
  Plus,
  X,
} from "lucide-react"
import { abrirArchivo } from "@/lib/abrir-archivo"
import type { DiaCalendario } from "./client"
import { detectarPeriodosCriticos } from "../_lib/detectar-periodos"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

type Revision = {
  id: string
  anio: number
  mes: number
  reunion_id: string | null
  conclusiones: string
  periodos_revisados: { nombre: string; fechaInicio: string; fechaFin: string }[]
  estado: "pendiente" | "realizada"
  realizada_at: string | null
  reuniones: { fecha: string } | null
}

type ReunionLite = { id: string; fecha: string }

export function RevisionMensualTab({
  dias,
  anio,
}: {
  dias: DiaCalendario[]
  anio: number
}) {
  const [revisiones, setRevisiones] = useState<Revision[]>([])
  const [reuniones, setReuniones] = useState<ReunionLite[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  const hoy = new Date()
  const anioActual = hoy.getFullYear()
  const mesActual = hoy.getMonth() + 1

  // Períodos críticos próximos (que aún no terminaron) para planificar.
  const proximos = useMemo(() => {
    const hoyStr = hoy.toISOString().slice(0, 10)
    return detectarPeriodosCriticos(dias)
      .filter((p) => p.fechaFin >= hoyStr)
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/planeamiento/periodos-criticos/revision-mensual?anio=${anio}`,
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setRevisiones(j.revisiones ?? [])
      setReuniones(j.reuniones ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando revisiones")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio])

  const revisionPorMes = useMemo(() => {
    const m: Record<number, Revision> = {}
    for (const r of revisiones) m[r.mes] = r
    return m
  }, [revisiones])

  // Aviso: mes en curso sin revisión (solo si miramos el año actual).
  const faltaMesActual = anio === anioActual && !revisionPorMes[mesActual]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          R3.4.2 — Revisión mensual del plan de períodos críticos en la reunión
          de Ventas-Logística. Se debe registrar al menos una revisión por mes.
        </p>
        <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> Registrar revisión del mes
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {faltaMesActual && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          La revisión de <b>{MESES[mesActual - 1]} {anioActual}</b> todavía no está
          registrada.
        </div>
      )}

      {/* Períodos próximos a planificar */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Períodos críticos próximos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {proximos.length === 0 ? (
            <p className="text-muted-foreground">
              No hay períodos críticos próximos detectados para {anio}.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {proximos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {p.codigoPredominante || "—"}
                  </Badge>
                  <span className="font-medium text-slate-800">{p.nombre}</span>
                  <span className="text-xs text-slate-500">
                    {p.fechaInicio} → {p.fechaFin} · {p.cantDiasCriticos} días críticos
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Estado por mes */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Revisiones {anio}</CardTitle>
        </CardHeader>
        <CardContent>
          {cargando ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <div className="divide-y">
              {MESES.map((nombreMes, i) => {
                const mes = i + 1
                const rev = revisionPorMes[mes]
                const expand = rev && expandida === rev.id
                return (
                  <div key={mes} className="py-2">
                    <div className="flex items-center gap-3">
                      <span className="w-28 text-sm font-medium text-slate-700">
                        {nombreMes}
                      </span>
                      {rev ? (
                        <>
                          <Badge className="bg-emerald-600">
                            <CalendarCheck className="mr-1 size-3" /> Revisado
                          </Badge>
                          {rev.reuniones?.fecha && (
                            <span className="text-xs text-slate-500">
                              Reunión {rev.reuniones.fecha}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-7 gap-1 text-xs"
                            onClick={() =>
                              setExpandida(expand ? null : rev.id)
                            }
                          >
                            {expand ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                            Detalle
                          </Button>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-slate-500">
                          Pendiente
                        </Badge>
                      )}
                    </div>
                    {expand && rev && (
                      <div className="ml-28 mt-2 space-y-2">
                        {rev.conclusiones && (
                          <p className="whitespace-pre-wrap text-sm text-slate-800">
                            {rev.conclusiones}
                          </p>
                        )}
                        {rev.periodos_revisados?.length > 0 && (
                          <p className="text-xs text-slate-500">
                            Períodos considerados:{" "}
                            {rev.periodos_revisados
                              .map((x) => x.nombre)
                              .join(" · ")}
                          </p>
                        )}
                        <EvidenciasRevision revisionId={rev.id} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <RegistrarDialog
          anio={anio}
          mesDefault={anio === anioActual ? mesActual : 1}
          reuniones={reuniones}
          proximos={proximos.map((p) => ({
            nombre: p.nombre,
            fechaInicio: p.fechaInicio,
            fechaFin: p.fechaFin,
          }))}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false)
            void cargar()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog para registrar/actualizar la revisión de un mes
// ---------------------------------------------------------------------------
function RegistrarDialog({
  anio,
  mesDefault,
  reuniones,
  proximos,
  onClose,
  onSaved,
}: {
  anio: number
  mesDefault: number
  reuniones: ReunionLite[]
  proximos: { nombre: string; fechaInicio: string; fechaFin: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [mes, setMes] = useState(mesDefault)
  const [reunionId, setReunionId] = useState<string>("")
  const [conclusiones, setConclusiones] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(
        "/api/planeamiento/periodos-criticos/revision-mensual",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anio,
            mes,
            reunion_id: reunionId || null,
            conclusiones,
            periodos_revisados: proximos,
          }),
        },
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success("Revisión registrada")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar revisión mensual</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {error && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mes</Label>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
              >
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reunión Logística-Ventas</Label>
              <select
                value={reunionId}
                onChange={(e) => setReunionId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
              >
                <option value="">— Sin asociar —</option>
                {reuniones.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fecha}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {proximos.length > 0 && (
            <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
              Se guardarán {proximos.length} período(s) próximo(s) como contexto
              de esta revisión.
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Conclusiones / acciones definidas</Label>
            <Textarea
              rows={4}
              value={conclusiones}
              onChange={(e) => setConclusiones(e.target.value)}
              placeholder="Resumen de la revisión del plan de períodos críticos, gaps y acciones acordadas…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Action log de evidencias de una revisión (comentario + archivo con Ctrl+V)
// ---------------------------------------------------------------------------
type Evidencia = {
  id: string
  comentario: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  autor_nombre: string | null
  created_at: string
}

function EvidenciasRevision({ revisionId }: { revisionId: string }) {
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [cargando, setCargando] = useState(true)
  const [comentario, setComentario] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch(
        `/api/planeamiento/periodos-criticos/revision-mensual/${revisionId}/evidencia`,
      )
      const j = await res.json()
      if (res.ok) setEvidencias(j.evidencias ?? [])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId])

  // Ctrl+V pega una captura como archivo.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return
      const img = Array.from(e.clipboardData.items).find((it) =>
        it.type.startsWith("image/"),
      )
      if (!img) return
      const blob = img.getAsFile()
      if (!blob) return
      const ext = blob.type.split("/")[1] || "png"
      setArchivo(
        new File([blob], `captura-${Date.now()}.${ext}`, { type: blob.type }),
      )
      toast.success("Captura pegada como archivo")
      e.preventDefault()
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  async function enviar() {
    if (!comentario.trim() && !archivo) {
      toast.error("Adjuntá un archivo o escribí un comentario")
      return
    }
    setEnviando(true)
    try {
      const fd = new FormData()
      if (comentario.trim()) fd.append("comentario", comentario.trim())
      if (archivo) fd.append("archivo", archivo)
      const res = await fetch(
        `/api/planeamiento/periodos-criticos/revision-mensual/${revisionId}/evidencia`,
        { method: "POST", body: fd },
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setComentario("")
      setArchivo(null)
      await cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="rounded-md border bg-white p-2">
      <p className="mb-1.5 text-xs font-semibold text-slate-600">Evidencia</p>
      {cargando ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : evidencias.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin evidencia cargada.</p>
      ) : (
        <ul className="space-y-1.5">
          {evidencias.map((ev) => (
            <li key={ev.id} className="rounded border bg-slate-50 p-2 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-medium text-slate-700">
                  {ev.autor_nombre ?? "—"}
                </span>
                <span>{new Date(ev.created_at).toLocaleString("es-AR")}</span>
              </div>
              {ev.comentario && (
                <p className="mt-1 whitespace-pre-wrap text-slate-800">
                  {ev.comentario}
                </p>
              )}
              {ev.archivo_url && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 h-6 gap-1 px-2 text-xs"
                  onClick={() =>
                    abrirArchivo(ev.archivo_url!, ev.archivo_nombre ?? undefined)
                  }
                >
                  <FileDown className="size-3" />
                  {ev.archivo_nombre ?? "Archivo"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Form nuevo avance */}
      <div className="mt-2 space-y-1.5 border-t pt-2">
        <Textarea
          rows={2}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Comentario o evidencia (podés pegar una captura con Ctrl+V)…"
          className="text-xs"
        />
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-600">
            <Paperclip className="size-3.5" />
            <span>{archivo ? archivo.name : "Adjuntar archivo"}</span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </label>
          {archivo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1 text-red-600"
              onClick={() => setArchivo(null)}
            >
              <X className="size-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="ml-auto h-7"
            disabled={enviando}
            onClick={enviar}
          >
            {enviando ? "Enviando…" : "Agregar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
