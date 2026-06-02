"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  CalendarRange, Star, AlertTriangle, CalendarClock, Copy, Check,
  Target, Plus, Pencil, Trash2,
} from "lucide-react"
import type { DiaCalendario, PlanAccion } from "./client"
import { detectarPeriodosCriticos, type PeriodoCritico } from "../_lib/detectar-periodos"

// Período de foco que define el equipo (tabla pc_periodos_foco)
type PeriodoFoco = {
  id: string
  anio: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  foco: string
  prioridad: "alta" | "media" | "baja"
  origen: string | null
}

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "bg-red-600 text-white",
  media: "bg-amber-500 text-white",
  baja: "bg-slate-400 text-white",
}

const FOCO_API = "/api/planeamiento/periodos-criticos/foco"

const fmtHL = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtFecha = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

// Proyecta una fecha 'YYYY-MM-DD' del año base al año a anticipar (mismo mes/día).
// 29-feb cae a 28-feb si el año destino no es bisiesto.
function proyectarFecha(f: string, anioDestino: number): string {
  const [, mm, dd] = f.split("-")
  let d = dd
  if (mm === "02" && dd === "29") {
    const bis = (anioDestino % 4 === 0 && anioDestino % 100 !== 0) || anioDestino % 400 === 0
    if (!bis) d = "28"
  }
  return `${anioDestino}-${mm}-${d}`
}

// Color por cantidad de triggers (idem al calendario)
function colorPorCodigo(codigo: string): string {
  if (codigo.length >= 4) return "bg-red-700 text-white"
  if (codigo.length === 3) return "bg-red-500 text-white"
  if (codigo.length === 2) return "bg-orange-500 text-white"
  if (codigo.length === 1) return "bg-amber-300 text-amber-950"
  return "bg-emerald-500 text-white"
}

export function PeriodosTab({
  diasPorAnio,
  aniosDisponibles,
  anioAnticipar,
  planes,
}: {
  diasPorAnio: Record<number, DiaCalendario[]>
  aniosDisponibles: number[]
  anioAnticipar: number
  planes: PlanAccion[]
}) {
  // Concepto R3.4.1: los períodos críticos NO son una cuota a cumplir. Se
  // IDENTIFICAN mirando el comportamiento del AÑO ANTERIOR (volumen, OTIF,
  // ausentismo, #clientes) para anticipar la operación del año en curso.
  const anioBase = anioAnticipar - 1
  const diasBase = useMemo(() => diasPorAnio[anioBase] ?? [], [diasPorAnio, anioBase])
  const periodos = useMemo(() => detectarPeriodosCriticos(diasBase), [diasBase])
  const hayBase = diasBase.some((d) => Number(d.hl) > 0 || Number(d.pct_ausentismo) > 0)

  const planByCodigo = useMemo(() => {
    const m: Record<string, PlanAccion> = {}
    for (const p of planes) m[p.codigo] = p
    return m
  }, [planes])

  // --- Períodos de FOCO que define el equipo (pc_periodos_foco) ---
  const [focos, setFocos] = useState<PeriodoFoco[]>([])
  const [editor, setEditor] = useState<PeriodoFoco | "nuevo" | null>(null)

  const cargarFocos = useCallback(async () => {
    try {
      const res = await fetch(`${FOCO_API}?anio=${anioAnticipar}`)
      const j = await res.json()
      if (res.ok) setFocos(j.periodos ?? [])
    } catch {
      /* lista queda vacía */
    }
  }, [anioAnticipar])

  useEffect(() => {
    cargarFocos()
  }, [cargarFocos])

  async function borrarFoco(id: string) {
    setFocos((prev) => prev.filter((f) => f.id !== id)) // optimista
    try {
      await fetch(`${FOCO_API}/${id}`, { method: "DELETE" })
    } catch {
      cargarFocos()
    }
  }

  // "Marcar como foco" desde una sugerencia → crea el período ya precargado.
  async function marcarComoFoco(p: PeriodoCritico) {
    try {
      const res = await fetch(FOCO_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anio: anioAnticipar,
          nombre: p.nombre,
          fecha_inicio: proyectarFecha(p.fechaInicio, anioAnticipar),
          fecha_fin: proyectarFecha(p.fechaFin, anioAnticipar),
          foco: p.motivo,
          origen: `${p.nombre} (${anioBase})`,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success(`"${p.nombre}" agregado a tus períodos de foco`)
      cargarFocos()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar")
    }
  }

  if (!hayBase) {
    return (
      <Card className="border-l-4 border-l-amber-600 bg-amber-50/40">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Sin datos de {anioBase} para identificar períodos a anticipar {anioAnticipar}
            </p>
            <p className="text-xs text-slate-600">
              Los períodos críticos se identifican a partir del año anterior.{" "}
              {aniosDisponibles.length > 0
                ? `Años con historia cargada: ${aniosDisponibles.join(", ")}. Desde el selector del encabezado elegí un año cuyo año previo tenga datos.`
                : "Cargá el histórico de ventas/ausentismo primero."}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ===== SECCIÓN 1 · Nuestros períodos de foco (los define el equipo) ===== */}
      <Card className="border-l-4 border-l-violet-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Target className="w-4 h-4 text-violet-600" />
              Nuestros períodos de foco {anioAnticipar}
              {focos.length > 0 && (
                <Badge variant="secondary" className="font-normal">{focos.length}</Badge>
              )}
            </span>
            <Button size="sm" variant="outline" onClick={() => setEditor("nuevo")}>
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          </CardTitle>
          <p className="text-xs text-slate-500">
            Los períodos que el equipo decide priorizar para anticipar la operación. Creá uno a mano
            o usá «Marcar como foco» en una sugerencia de abajo.
          </p>
        </CardHeader>
        <CardContent>
          {focos.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no definiste períodos de foco para {anioAnticipar}. Agregá uno o marcá una
              sugerencia.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {focos.map((f) => (
                <FocoCard
                  key={f.id}
                  foco={f}
                  onEdit={() => setEditor(f)}
                  onDelete={() => borrarFoco(f.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== SECCIÓN 2 · Sugeridos según el año anterior (propuesta del sistema) ===== */}
      <Card className="border-l-4 border-l-sky-600 bg-sky-50/40">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <CalendarClock className="w-5 h-5 text-sky-700 shrink-0" />
          <div className="flex-1 min-w-[260px]">
            <p className="text-sm font-semibold text-slate-900">
              Sugeridos según {anioBase}: {periodos.length} período
              {periodos.length === 1 ? "" : "s"} para anticipar {anioAnticipar}
            </p>
            <p className="text-xs text-slate-600">
              Propuesta del sistema según el comportamiento de {anioBase} (volumen, OTIF, ausentismo
              y #clientes). Marcá los que quieras como foco. El manual sugiere ~3 o más; no es una
              cantidad a cumplir.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Bloque = días CRÍTICOS de {anioBase}, máx 7 días, gaps hasta 2 días
          </div>
        </CardContent>
      </Card>

      {periodos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            No se identificaron períodos críticos en {anioBase} con los umbrales actuales. Ajustalos
            en Configuración si querés un criterio más o menos sensible.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {periodos.map((p, idx) => (
            <PeriodoCard
              key={p.id}
              periodo={p}
              indice={idx + 1}
              anioBase={anioBase}
              anioAnticipar={anioAnticipar}
              plan={planByCodigo[p.codigoPredominante]}
              onMarcarFoco={() => marcarComoFoco(p)}
            />
          ))}
        </div>
      )}

      {editor && (
        <FocoEditor
          foco={editor === "nuevo" ? null : editor}
          anio={anioAnticipar}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            cargarFocos()
          }}
        />
      )}
    </div>
  )
}

function PeriodoCard({
  periodo: p,
  indice,
  anioBase,
  anioAnticipar,
  plan,
  onMarcarFoco,
}: {
  periodo: PeriodoCritico
  indice: number
  anioBase: number
  anioAnticipar: number
  plan: PlanAccion | undefined
  onMarcarFoco: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const iniProy = proyectarFecha(p.fechaInicio, anioAnticipar)
  const finProy = proyectarFecha(p.fechaFin, anioAnticipar)

  async function copiarPlan() {
    if (!plan) return
    const texto =
      `Período crítico ${indice} a anticipar en ${anioAnticipar}: ${p.nombre}\n` +
      `Ventana estimada ${fmtFecha(iniProy)} → ${fmtFecha(finProy)} (observado en ${anioBase}: ${fmtFecha(p.fechaInicio)} → ${fmtFecha(p.fechaFin)})\n` +
      `Código ${p.codigoPredominante} · ${p.cantDiasCriticos} días críticos\n\n` +
      `${plan.descripcion}\n\n${plan.plan_texto}`
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-start justify-between gap-2">
          <span className="flex items-center gap-2">
            <Badge variant="outline">#{indice}</Badge>
            {p.nombre}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <Badge className={`${colorPorCodigo(p.codigoPredominante)} font-semibold`}>
              {p.codigoPredominante || "—"}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={onMarcarFoco}
              className="h-6 text-xs gap-1 text-violet-700 hover:bg-violet-50"
              title="Agregar a 'Nuestros períodos de foco'"
            >
              <Target className="w-3 h-3" /> Foco
            </Button>
          </span>
        </CardTitle>
        <p className="text-xs text-slate-500">{p.motivo}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <CalendarRange className="w-4 h-4 text-slate-400" />
            <span className="font-medium">{fmtFecha(iniProy)}</span>
            <span className="text-slate-400">→</span>
            <span className="font-medium">{fmtFecha(finProy)}</span>
            <Badge variant="outline" className="text-[10px] font-normal">a anticipar {anioAnticipar}</Badge>
            <span className="text-xs text-slate-500">
              ({p.cantDias}d · {p.cantDiasCriticos} críticos)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 pl-6">
            Observado en {anioBase}: {fmtFecha(p.fechaInicio)} → {fmtFecha(p.fechaFin)}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <Stat k="HL pico" v={fmtHL(p.hlMax)} />
          <Stat k="HL acum" v={fmtHL(p.hlAcum)} />
          <Stat k="Cli máx" v={String(p.clientesMax)} />
          <Stat k="Score max" v={p.scoreMax.toFixed(3)} />
        </div>

        {p.feriadoCercano && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
            <Star className="w-3 h-3 text-yellow-600" />
            <span>{p.feriadoCercano}</span>
          </div>
        )}

        <div>
          <p className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 mb-1">
            Días del período (observados en {anioBase})
          </p>
          <div className="flex flex-wrap gap-1">
            {p.dias.map((d) => (
              <span
                key={d.fecha}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                  d.estatus === "CRITICO"
                    ? colorPorCodigo(d.codigo)
                    : "bg-slate-100 text-slate-500"
                }`}
                title={`${d.dia_semana} ${d.fecha} · HL ${fmtHL(d.hl)} · cli ${d.clientes_dia} · score ${Number(d.score).toFixed(3)}${d.codigo ? ` · ${d.codigo}` : ""}`}
              >
                {d.fecha === p.diaPico && <Star className="w-3 h-3" />}
                {fmtFecha(d.fecha)}
              </span>
            ))}
          </div>
        </div>

        {plan ? (
          <div className="border-t border-slate-200 pt-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] uppercase font-semibold tracking-wide text-slate-500">
                Plan de acción ({p.codigoPredominante})
              </p>
              <Button variant="ghost" size="sm" onClick={copiarPlan} className="h-6 text-xs gap-1">
                {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-slate-500 italic mb-1">{plan.descripcion}</p>
            <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans bg-slate-50 border border-slate-200 rounded p-2 max-h-32 overflow-auto">
              {plan.plan_texto}
            </pre>
          </div>
        ) : (
          <div className="border-t border-slate-200 pt-2 text-[11px] text-slate-400">
            Sin plan de acción cargado para código <code>{p.codigoPredominante || "(vacío)"}</code>. Cargalo en Configuración.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50/50 px-2 py-1.5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{k}</p>
      <p className="text-sm font-semibold text-slate-900">{v}</p>
    </div>
  )
}

// ============================================================================
// Período de foco definido por el equipo: card + editor (dialog)
// ============================================================================
function FocoCard({
  foco: f,
  onEdit,
  onDelete,
}: {
  foco: PeriodoFoco
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-start justify-between gap-2">
          <span className="flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-600 shrink-0" />
            {f.nombre}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <Badge className={`${PRIORIDAD_BADGE[f.prioridad]} text-[10px] capitalize`}>
              {f.prioridad}
            </Badge>
            <Button size="sm" variant="ghost" onClick={onEdit} className="h-6 w-6 p-0" title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
              title="Borrar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <span className="font-medium">{fmtFecha(f.fecha_inicio)}</span>
          <span className="text-slate-400">→</span>
          <span className="font-medium">{fmtFecha(f.fecha_fin)}</span>
        </div>
        {f.foco && <p className="text-xs text-slate-600 whitespace-pre-wrap">{f.foco}</p>}
        {f.origen && <p className="text-[11px] text-slate-400">Sugerido por: {f.origen}</p>}
      </CardContent>
    </Card>
  )
}

function FocoEditor({
  foco,
  anio,
  onClose,
  onSaved,
}: {
  foco: PeriodoFoco | null
  anio: number
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(foco?.nombre ?? "")
  const [ini, setIni] = useState(foco?.fecha_inicio ?? `${anio}-01-01`)
  const [fin, setFin] = useState(foco?.fecha_fin ?? `${anio}-01-01`)
  const [prioridad, setPrioridad] = useState<PeriodoFoco["prioridad"]>(foco?.prioridad ?? "media")
  const [textoFoco, setTextoFoco] = useState(foco?.foco ?? "")
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!nombre.trim()) {
      toast.error("Poné un nombre")
      return
    }
    if (fin < ini) {
      toast.error("La fecha fin no puede ser anterior al inicio")
      return
    }
    setGuardando(true)
    try {
      const res = await fetch(foco ? `${FOCO_API}/${foco.id}` : FOCO_API, {
        method: foco ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anio,
          nombre: nombre.trim(),
          fecha_inicio: ini,
          fecha_fin: fin,
          prioridad,
          foco: textoFoco,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success(foco ? "Período de foco actualizado" : "Período de foco creado")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{foco ? "Editar período de foco" : "Nuevo período de foco"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Cluster Carnaval"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Prioridad</Label>
            <div className="flex gap-2 mt-1">
              {(["alta", "media", "baja"] as const).map((pr) => (
                <Button
                  key={pr}
                  type="button"
                  size="sm"
                  variant={prioridad === pr ? "default" : "outline"}
                  onClick={() => setPrioridad(pr)}
                  className="capitalize"
                >
                  {pr}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Dónde poner el foco</Label>
            <Textarea
              value={textoFoco}
              onChange={(e) => setTextoFoco(e.target.value)}
              rows={3}
              placeholder="Qué preparar / a qué prestar atención en este período…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
