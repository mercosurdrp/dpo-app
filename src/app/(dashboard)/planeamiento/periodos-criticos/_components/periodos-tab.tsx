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
  CalendarRange, Star, AlertTriangle, Copy, Check,
  Target, Plus, Pencil, Trash2, Sparkles,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { DiaCalendario, PlanAccion, Intensidad } from "./client"
import { intensidadDia, intensidadMax, INTENSIDAD_BG, INTENSIDAD_LABEL, PCT_LIMITE } from "./client"
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
const fmtPct = (n: number) =>
  (Number(n) * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%"
const fmtFecha = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

type VarP = {
  label: string
  trigger: keyof DiaCalendario
  valor: (d: DiaCalendario) => string
}

// El Volumen es el único que define el período crítico; Clientes y Rechazo
// acompañan como contexto. Son las que mira el tooltip.
const VARIABLES_P: VarP[] = [
  { label: "Volumen", trigger: "trigger_vol", valor: (d) => `${fmtHL(d.hl)} HL · ${fmtPct(d.pct_capacidad)} de la capacidad` },
  { label: "Clientes", trigger: "trigger_cli", valor: (d) => String(d.clientes_dia) },
  { label: "Rechazo", trigger: "trigger_otif", valor: (d) => fmtPct(d.otif_estimado) },
]

// El ausentismo también es contexto: se muestra como dato aparte porque suele
// estar activo casi todo el mes.
const VAR_AUSENTISMO: VarP = {
  label: "Ausentismo", trigger: "trigger_aus", valor: (d) => fmtPct(d.pct_ausentismo),
}

// Proyecta una fecha 'YYYY-MM-DD' de un año a otro (mismo mes/día).
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

// Prioridad del foco según la intensidad del período.
function prioridadDeIntensidad(i: Intensidad): PeriodoFoco["prioridad"] {
  if (i === "CRITICO") return "alta"
  if (i === "LIMITE") return "media"
  return "baja"
}

/**
 * Una fila del listado: el período observado en el año base (sugerido por el
 * sistema) y, si el equipo lo adoptó, su foco. Es UN solo formato: la
 * sugerencia y el foco eran lo mismo visto desde dos lados.
 */
type Fila = {
  key: string
  periodo: PeriodoCritico
  foco: PeriodoFoco | null
  /** Ventana a anticipar en el año en curso. Si hay foco, manda la del foco. */
  ini: string
  fin: string
  /** true cuando el período lo creó el equipo a mano y no salió de la detección. */
  manual: boolean
}

// Arma un pseudo-período con los días del año base que caen en la ventana de un
// foco creado a mano, para que la tarjeta muestre la misma información que las
// sugeridas (HL, clientes, fichas por día).
function periodoDesdeFoco(f: PeriodoFoco, diasBase: DiaCalendario[], anioBase: number): PeriodoCritico {
  const ini = proyectarFecha(f.fecha_inicio, anioBase)
  const fin = proyectarFecha(f.fecha_fin, anioBase)
  const dias = diasBase.filter((d) => d.fecha >= ini && d.fecha <= fin)
  const num = (xs: number[]) => (xs.length ? Math.max(...xs) : 0)
  const pico = dias.reduce<DiaCalendario | null>((m, d) => (!m || Number(d.hl) > Number(m.hl) ? d : m), null)
  return {
    id: `foco-${f.id}`,
    nombre: f.nombre,
    motivo: "Definido por el equipo",
    fechaInicio: ini,
    fechaFin: fin,
    cantDias: dias.length,
    cantDiasCriticos: dias.filter((d) => d.trigger_vol).length,
    cantDiasLimite: dias.filter((d) => intensidadDia(d) === "LIMITE").length,
    intensidad: dias.length ? intensidadMax(dias) : "NORMAL",
    hlMax: num(dias.map((d) => Number(d.hl))),
    hlAcum: dias.reduce((s, d) => s + Number(d.hl), 0),
    clientesMax: num(dias.map((d) => Number(d.clientes_dia ?? 0))),
    pctCapacidadMax: num(dias.map((d) => Number(d.pct_capacidad))),
    diaPico: pico?.fecha ?? ini,
    feriadoCercano: null,
    dias,
  }
}

const solapan = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2

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
  const [editor, setEditor] = useState<{ foco: PeriodoFoco | null; base?: PeriodoCritico } | null>(null)

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

  // Un solo listado: cada período sugerido con su foco (si el equipo lo adoptó),
  // más los focos creados a mano que no coinciden con ninguna sugerencia.
  const filas = useMemo<Fila[]>(() => {
    const usados = new Set<string>()
    const out: Fila[] = periodos.map((p) => {
      const ini = proyectarFecha(p.fechaInicio, anioAnticipar)
      const fin = proyectarFecha(p.fechaFin, anioAnticipar)
      const foco =
        focos.find((f) => !usados.has(f.id) && f.origen === `${p.nombre} (${anioBase})`) ??
        focos.find((f) => !usados.has(f.id) && solapan(f.fecha_inicio, f.fecha_fin, ini, fin)) ??
        null
      if (foco) usados.add(foco.id)
      return {
        key: p.id,
        periodo: p,
        foco,
        ini: foco?.fecha_inicio ?? ini,
        fin: foco?.fecha_fin ?? fin,
        manual: false,
      }
    })
    for (const f of focos) {
      if (usados.has(f.id)) continue
      out.push({
        key: `foco-${f.id}`,
        periodo: periodoDesdeFoco(f, diasBase, anioBase),
        foco: f,
        ini: f.fecha_inicio,
        fin: f.fecha_fin,
        manual: true,
      })
    }
    return out.sort((a, b) => a.ini.localeCompare(b.ini))
  }, [periodos, focos, diasBase, anioAnticipar, anioBase])

  const cantFocos = filas.filter((f) => f.foco).length

  async function quitarFoco(id: string) {
    setFocos((prev) => prev.filter((f) => f.id !== id)) // optimista
    try {
      await fetch(`${FOCO_API}/${id}`, { method: "DELETE" })
    } catch {
      cargarFocos()
    }
  }

  // Payload de foco a partir de un período sugerido (fechas proyectadas + prioridad por intensidad).
  const focoDesdePeriodo = useCallback(
    (p: PeriodoCritico) => ({
      anio: anioAnticipar,
      nombre: p.nombre,
      fecha_inicio: proyectarFecha(p.fechaInicio, anioAnticipar),
      fecha_fin: proyectarFecha(p.fechaFin, anioAnticipar),
      foco: p.motivo,
      prioridad: prioridadDeIntensidad(p.intensidad),
      origen: `${p.nombre} (${anioBase})`,
    }),
    [anioAnticipar, anioBase],
  )

  // "Marcar como foco" → crea el período ya precargado con lo observado.
  async function marcarComoFoco(p: PeriodoCritico) {
    try {
      const res = await fetch(FOCO_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(focoDesdePeriodo(p)),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success(`"${p.nombre}" marcado como foco`)
      cargarFocos()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo marcar")
    }
  }

  // Marca como foco TODOS los sugeridos que aún no lo sean.
  const [generando, setGenerando] = useState(false)
  async function marcarTodos() {
    const aCrear = filas.filter((f) => !f.manual && !f.foco).map((f) => f.periodo)
    if (aCrear.length === 0) {
      toast.info("Todos los períodos sugeridos ya están marcados como foco")
      return
    }
    setGenerando(true)
    try {
      for (const p of aCrear) {
        await fetch(FOCO_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(focoDesdePeriodo(p)),
        })
      }
      toast.success(`${aCrear.length} período${aCrear.length === 1 ? "" : "s"} marcado${aCrear.length === 1 ? "" : "s"} como foco`)
      cargarFocos()
    } catch {
      toast.error("No se pudieron marcar todos")
      cargarFocos()
    } finally {
      setGenerando(false)
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
      <Card className="border-l-4 border-l-violet-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-violet-600" />
              Períodos críticos {anioAnticipar}
              <Badge variant="secondary" className="font-normal">
                {filas.length} período{filas.length === 1 ? "" : "s"} · {cantFocos} en foco
              </Badge>
            </span>
            <span className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={marcarTodos}
                disabled={generando || filas.every((f) => f.foco)}
                title="Marcar como foco todos los sugeridos que todavía no lo son"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                {generando ? "Marcando…" : "Marcar todos como foco"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditor({ foco: null })}>
                <Plus className="w-4 h-4 mr-1" /> Agregar a mano
              </Button>
            </span>
          </CardTitle>
          <p className="text-xs text-slate-500">
            Salen de {anioBase}: bloques de días que superaron la capacidad de distribución (rojo) o
            quedaron al límite, {Math.round(PCT_LIMITE * 100)}% o más (amarillo), de hasta una semana.
            Cada tarjeta trae lo observado ese período y el plan de acción de su escalón. Marcá como{" "}
            <b>foco</b> los que el equipo va a preparar: el foco guarda el nombre, la prioridad y
            qué preparar, y es lo que se repasa en la reunión mensual Ventas-Logística.
          </p>
        </CardHeader>
      </Card>

      {filas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            No se identificaron períodos críticos en {anioBase} con la capacidad actual. Ajustala en
            el encabezado si querés un criterio más o menos sensible, o agregá un período a mano.
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider delay={200}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filas.map((fila, idx) => (
              <PeriodoCard
                key={fila.key}
                fila={fila}
                indice={idx + 1}
                anioBase={anioBase}
                anioAnticipar={anioAnticipar}
                plan={planByCodigo[fila.periodo.intensidad]}
                onMarcarFoco={() => marcarComoFoco(fila.periodo)}
                onEditarFoco={() => fila.foco && setEditor({ foco: fila.foco })}
                onQuitarFoco={() => fila.foco && quitarFoco(fila.foco.id)}
              />
            ))}
          </div>
        </TooltipProvider>
      )}

      {editor && (
        <FocoEditor
          foco={editor.foco}
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
  fila,
  indice,
  anioBase,
  anioAnticipar,
  plan,
  onMarcarFoco,
  onEditarFoco,
  onQuitarFoco,
}: {
  fila: Fila
  indice: number
  anioBase: number
  anioAnticipar: number
  plan: PlanAccion | undefined
  onMarcarFoco: () => void
  onEditarFoco: () => void
  onQuitarFoco: () => void
}) {
  const { periodo: p, foco } = fila
  const [copiado, setCopiado] = useState(false)
  const titulo = foco?.nombre ?? p.nombre

  // Día más exigente del período (el de más HL) → de ahí tomamos el valor
  // puntual de cada variable en el tooltip.
  const diaPico = p.dias.find((d) => d.fecha === p.diaPico) ?? p.dias[0]
  // Para cada variable contamos en cuántos días del período cruzó su umbral.
  const diasCruzados = (v: VarP) => p.dias.filter((d) => d[v.trigger] === true).length
  const ausDias = p.dias.filter((d) => d.trigger_aus === true).length
  const intensidad = p.intensidad

  async function copiarPlan() {
    const texto =
      `Período crítico ${indice} a anticipar en ${anioAnticipar}: ${titulo}\n` +
      `Ventana ${fmtFecha(fila.ini)} → ${fmtFecha(fila.fin)} (observado en ${anioBase}: ${fmtFecha(p.fechaInicio)} → ${fmtFecha(p.fechaFin)})\n` +
      `${INTENSIDAD_LABEL[intensidad]} · ${p.cantDiasCriticos} días sobre la capacidad · ${p.cantDiasLimite} al límite (pico ${fmtPct(p.pctCapacidadMax)})\n` +
      (foco ? `Prioridad ${foco.prioridad}. Foco: ${foco.foco}\n` : "") +
      (plan ? `\n${plan.descripcion}\n\n${plan.plan_texto}` : "")
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
    <Card className={`cursor-help ${foco ? "border-violet-300 shadow-sm" : ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-start justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <Badge variant="outline">#{indice}</Badge>
            {foco && <Target className="w-4 h-4 text-violet-600 shrink-0" />}
            <span className="truncate">{titulo}</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <Badge className={`${INTENSIDAD_BG[intensidad]} font-semibold`}>
              {INTENSIDAD_LABEL[intensidad]}
            </Badge>
            {foco ? (
              <>
                <Badge className={`${PRIORIDAD_BADGE[foco.prioridad]} text-[10px] capitalize`}>
                  {foco.prioridad}
                </Badge>
                <Button size="sm" variant="ghost" onClick={onEditarFoco} className="h-6 w-6 p-0" title="Editar el foco">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onQuitarFoco}
                  className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                  title={fila.manual ? "Borrar este período" : "Quitar el foco (la sugerencia queda)"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={onMarcarFoco}
                className="h-6 text-xs gap-1 text-violet-700 hover:bg-violet-50"
                title="Marcar como período de foco del equipo"
              >
                <Target className="w-3 h-3" /> Marcar foco
              </Button>
            )}
          </span>
        </CardTitle>
        <p className="text-xs text-slate-500">{p.motivo}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <CalendarRange className="w-4 h-4 text-slate-400" />
            <span className="font-medium">{fmtFecha(fila.ini)}</span>
            <span className="text-slate-400">→</span>
            <span className="font-medium">{fmtFecha(fila.fin)}</span>
            <Badge variant="outline" className="text-[10px] font-normal">
              {foco ? `foco ${anioAnticipar}` : `a anticipar ${anioAnticipar}`}
            </Badge>
            <span className="text-xs text-slate-500">
              ({p.cantDias}d · {p.cantDiasCriticos} críticos{p.cantDiasLimite > 0 ? ` · ${p.cantDiasLimite} al límite` : ""})
            </span>
          </div>
          <p className="text-[11px] text-slate-400 pl-6">
            Observado en {anioBase}: {p.dias.length > 0
              ? `${fmtFecha(p.fechaInicio)} → ${fmtFecha(p.fechaFin)}`
              : "sin datos en esas fechas"}
          </p>
        </div>

        {foco && (
          <div className="rounded border border-violet-200 bg-violet-50/60 px-2.5 py-2">
            <p className="text-[11px] uppercase font-semibold tracking-wide text-violet-700 mb-0.5">
              Dónde poner el foco
            </p>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">
              {foco.foco || <span className="text-slate-400">Sin texto. Editá el foco para cargar qué preparar.</span>}
            </p>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 text-xs">
          <Stat k="HL pico" v={fmtHL(p.hlMax)} />
          <Stat k="HL acum" v={fmtHL(p.hlAcum)} />
          <Stat k="Cli máx" v={String(p.clientesMax)} />
          <Stat k="Capacidad máx" v={fmtPct(p.pctCapacidadMax)} />
        </div>

        {p.feriadoCercano && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
            <Star className="w-3 h-3 text-yellow-600" />
            <span>{p.feriadoCercano}</span>
          </div>
        )}

        {p.dias.length > 0 && (
          <div>
            <p className="text-[11px] uppercase font-semibold tracking-wide text-slate-500 mb-1">
              Días del período (observados en {anioBase})
            </p>
            <div className="flex flex-wrap gap-1">
              {p.dias.map((d) => (
                <span
                  key={d.fecha}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                    intensidadDia(d) !== "NORMAL"
                      ? INTENSIDAD_BG[intensidadDia(d)]
                      : "bg-slate-100 text-slate-500"
                  }`}
                  title={`${d.dia_semana} ${d.fecha} · ${fmtHL(d.hl)} HL · ${fmtPct(d.pct_capacidad)} · cli ${d.clientes_dia} · ${INTENSIDAD_LABEL[intensidadDia(d)]}`}
                >
                  {d.fecha === p.diaPico && <Star className="w-3 h-3" />}
                  {fmtFecha(d.fecha)}
                </span>
              ))}
            </div>
          </div>
        )}

        {plan ? (
          <div className="border-t border-slate-200 pt-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] uppercase font-semibold tracking-wide text-slate-500">
                Plan de acción ({INTENSIDAD_LABEL[intensidad]})
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
            Sin plan de acción cargado para «{INTENSIDAD_LABEL[intensidad]}». Cargalo en Configuración.
          </div>
        )}
        {foco?.origen && (
          <p className="text-[10px] text-slate-400">Sugerido por: {foco.origen}</p>
        )}
      </CardContent>
    </Card>
        }
      />
      <TooltipContent side="top" className="max-w-none">
        <div className="space-y-1 min-w-[230px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">
              {p.cantDiasCriticos} sobre la capacidad · {p.cantDiasLimite} al límite · {p.cantDias} días
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${INTENSIDAD_BG[intensidad]}`}>
              {INTENSIDAD_LABEL[intensidad]}
            </span>
          </div>
          <div className="space-y-0.5 pt-1 border-t border-white/15">
            {VARIABLES_P.map((v) => {
              const dias = diasCruzados(v)
              const noCumple = dias > 0
              return (
                <div key={v.label} className="flex items-center justify-between gap-4 text-[11px]">
                  <span className={noCumple ? "text-red-300 font-medium" : "text-emerald-300"}>
                    {noCumple ? "✗" : "✓"} {v.label}
                  </span>
                  <span className="opacity-80">
                    {diaPico ? v.valor(diaPico) : "—"}
                    {noCumple && ` · ${dias}d`}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-4 text-[10px] opacity-70 pt-1 border-t border-white/15">
            <span>{VAR_AUSENTISMO.label} (secundario)</span>
            <span>{diaPico ? VAR_AUSENTISMO.valor(diaPico) : "—"}{ausDias > 0 && ` · ${ausDias}d`}</span>
          </div>
          <div className="text-[10px] opacity-60 pt-1 border-t border-white/15">
            ✗ = cruzó su umbral. Crítico = el volumen supera la capacidad de distribución; al límite = llega al {Math.round(PCT_LIMITE * 100)}%. Clientes, rechazo y ausentismo son contexto.
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
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
// Editor del foco (dialog): nombre, ventana, prioridad y qué preparar
// ============================================================================
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
      toast.success(foco ? "Foco actualizado" : "Período creado")
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
          <DialogTitle>{foco ? "Editar el foco" : "Nuevo período a mano"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Pre-Navidad"
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
