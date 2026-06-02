"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RotateCcw, Copy, Trash2, FolderOpen, Bookmark } from "lucide-react"
import type { CfgPC, DiaCalendario, UmbralesPC } from "./client"

// Escenario tal como vuelve del GET /escenarios. Las 4 variables se persisten.
type EscenarioGuardado = {
  id: string
  nombre: string
  fecha_base: string
  delta_volumen: number
  delta_otif: number
  delta_ausentismo: number
  delta_clientes: number
  resultado_nivel: string | null
  created_at: string
}

type SimResult = {
  hl: number
  pct_rechazo: number
  otif_estimado: number
  pct_ausentismo: number
  clientes_dia: number
  score: number
  nivel: "BAJO" | "MEDIO" | "ALTO"
  // Triggers
  trigger_vol: boolean
  trigger_cli: boolean
  trigger_otif: boolean
  trigger_aus: boolean
  codigo: string
  estatus: "CRITICO" | "NORMAL"
}

// Réplica client-side de la fórmula de v_pc_calendario_dia con triggers Mercosur.
// Se mantienen los clamps (rechazo y ausentismo en [0,1]; score en [0,2]) para
// que el preview coincida con la vista cuando se guarde el escenario.
function recalcular(
  base: {
    hl: number
    pct_rechazo: number
    pct_ausentismo: number
    clientes_dia: number
  },
  delta: { vol: number; otif: number; aus: number; cli: number },
  cfg: CfgPC,
  umbrales: UmbralesPC,
): SimResult {
  const hl = Math.max(0, base.hl * (1 + delta.vol / 100))
  // delta.otif positivo = MÁS rechazo = peor. Va en puntos porcentuales.
  const pct_rechazo = clamp(base.pct_rechazo + delta.otif / 100, 0, 1)
  const otif_estimado = 1 - pct_rechazo
  const pct_ausentismo = clamp(base.pct_ausentismo + delta.aus / 100, 0, 1)
  const clientes_dia = Math.max(0, Math.round(base.clientes_dia * (1 + delta.cli / 100)))

  // Score continuo (compatibilidad con la vista)
  const p90 = cfg.hl_p90_2025 && cfg.hl_p90_2025 > 0 ? cfg.hl_p90_2025 : 1
  const volNorm = hl / p90
  const score = Math.min(2, cfg.w_vol * volNorm + cfg.w_otif * pct_rechazo + cfg.w_aus * pct_ausentismo)
  const nivel: "BAJO" | "MEDIO" | "ALTO" =
    score >= cfg.umbral_alto ? "ALTO" : score >= cfg.umbral_medio ? "MEDIO" : "BAJO"

  // Triggers Mercosur (lo que define crítico)
  const trigger_vol = hl >= umbrales.vol_pico
  const trigger_cli = clientes_dia > umbrales.clientes
  const trigger_otif = hl > 0 && otif_estimado < umbrales.otif_min
  const trigger_aus = pct_ausentismo >= umbrales.ausentismo_max
  const codigo =
    (trigger_otif ? "P" : "") +
    (trigger_vol ? "P" : "") +
    (trigger_cli ? "P" : "") +
    (trigger_aus ? "P" : "")
  const triggerCount = codigo.length
  const estatus: "CRITICO" | "NORMAL" =
    triggerCount >= umbrales.min_triggers ? "CRITICO" : "NORMAL"

  return {
    hl, pct_rechazo, otif_estimado, pct_ausentismo, clientes_dia,
    score, nivel,
    trigger_vol, trigger_cli, trigger_otif, trigger_aus,
    codigo, estatus,
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

const fmtHL = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtPct = (n: number) => (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%"

const COLOR_NIVEL: Record<string, string> = {
  ALTO: "bg-red-500 text-white",
  MEDIO: "bg-amber-400 text-amber-950",
  BAJO: "bg-emerald-500 text-white",
}

export function SimuladorTab({
  dias,
  cfg,
  umbrales,
}: {
  dias: DiaCalendario[]
  cfg: CfgPC
  umbrales: UmbralesPC
}) {
  // Solo se pueden elegir como base días con datos (hl > 0 o ausentismo > 0)
  const opciones = useMemo(
    () =>
      dias.filter((d) => d.hl > 0 || d.pct_ausentismo > 0 || d.es_feriado).map((d) => ({
        value: d.fecha,
        label: `${d.fecha} · ${d.dia_semana} · ${fmtHL(d.hl)} HL · ${d.estatus}${d.codigo ? " " + d.codigo : ""}`,
      })),
    [dias],
  )

  const [fechaBase, setFechaBase] = useState<string>(
    () => opciones.find((o) => o.label.includes("CRITICO"))?.value ?? opciones[0]?.value ?? "",
  )
  const [delta, setDelta] = useState({ vol: 0, otif: 0, aus: 0, cli: 0 })
  const [nombre, setNombre] = useState("")

  const base = dias.find((d) => d.fecha === fechaBase)
  const sim = useMemo(
    () =>
      base
        ? recalcular(
            {
              hl: base.hl,
              pct_rechazo: base.pct_rechazo,
              pct_ausentismo: base.pct_ausentismo,
              clientes_dia: base.clientes_dia,
            },
            delta,
            cfg,
            umbrales,
          )
        : null,
    [base, delta, cfg, umbrales],
  )

  // Guardar escenario
  const [guardando, setGuardando] = useState(false)
  const [msgGuardar, setMsgGuardar] = useState<string | null>(null)

  // Escenarios guardados (lista persistida en pc_escenarios)
  const [escenarios, setEscenarios] = useState<EscenarioGuardado[]>([])
  const [cargandoEsc, setCargandoEsc] = useState(true)

  const cargarEscenarios = useCallback(async () => {
    setCargandoEsc(true)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/escenarios")
      const j = await res.json()
      if (res.ok) setEscenarios(j.escenarios ?? [])
    } catch {
      /* silencioso: la lista simplemente queda vacía */
    } finally {
      setCargandoEsc(false)
    }
  }, [])

  useEffect(() => {
    cargarEscenarios()
  }, [cargarEscenarios])

  async function guardar() {
    if (!base || !sim) return
    setGuardando(true)
    setMsgGuardar(null)
    try {
      const res = await fetch("/api/planeamiento/periodos-criticos/escenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre || `Escenario ${new Date().toLocaleString("es-AR")}`,
          fecha_base: base.fecha,
          delta_volumen: delta.vol,
          delta_otif: delta.otif,
          delta_ausentismo: delta.aus,
          delta_clientes: delta.cli,
          resultado_score: Number(sim.score.toFixed(3)),
          resultado_nivel: sim.nivel,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setMsgGuardar("Escenario guardado")
      setNombre("")
      cargarEscenarios()
    } catch (e) {
      setMsgGuardar(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  // Recargar un escenario guardado → vuelca día base + las 4 deltas a los controles.
  function aplicarEscenario(e: EscenarioGuardado) {
    setFechaBase(e.fecha_base)
    setDelta({
      vol: e.delta_volumen,
      otif: e.delta_otif,
      aus: e.delta_ausentismo,
      cli: e.delta_clientes ?? 0,
    })
    setMsgGuardar(null)
  }

  async function borrarEscenario(id: string) {
    setEscenarios((prev) => prev.filter((e) => e.id !== id)) // optimista
    try {
      await fetch(`/api/planeamiento/periodos-criticos/escenarios/${id}`, { method: "DELETE" })
    } catch {
      cargarEscenarios() // si falló, recuperar el estado real
    }
  }

  if (!base) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-slate-500">
          No hay días con datos para usar como escenario base. Cargá ventas o ausentismo primero.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="fecha-base" className="text-sm shrink-0">
              Día base
            </Label>
            <select
              id="fecha-base"
              value={fechaBase}
              onChange={(e) => setFechaBase(e.target.value)}
              className="flex-1 h-9 rounded-md border border-slate-200 px-2 text-sm"
            >
              {opciones.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDelta({ vol: 0, otif: 0, aus: 0, cli: 0 })}
              title="Reset deltas"
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EscenarioCard
          titulo="Realidad (día base)"
          hl={base.hl}
          pct_rechazo={base.pct_rechazo}
          pct_ausentismo={base.pct_ausentismo}
          clientes_dia={base.clientes_dia}
          camiones={base.camiones}
          score={base.score}
          codigo={base.codigo}
          estatus={base.estatus}
          triggers={{
            vol: base.trigger_vol,
            cli: base.trigger_cli,
            otif: base.trigger_otif,
            aus: base.trigger_aus,
          }}
        />
        {sim && (
          <EscenarioCard
            titulo="Simulación"
            destacado
            hl={sim.hl}
            pct_rechazo={sim.pct_rechazo}
            pct_ausentismo={sim.pct_ausentismo}
            clientes_dia={sim.clientes_dia}
            camiones={base.camiones}
            score={sim.score}
            codigo={sim.codigo}
            estatus={sim.estatus}
            triggers={{
              vol: sim.trigger_vol,
              cli: sim.trigger_cli,
              otif: sim.trigger_otif,
              aus: sim.trigger_aus,
            }}
          />
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ajustes del escenario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SliderRow
            label="Volumen (HL)"
            value={delta.vol}
            min={-100}
            max={150}
            step={5}
            unit="%"
            tono="vol"
            onChange={(v) => setDelta((d) => ({ ...d, vol: v }))}
          />
          <SliderRow
            label="OTIF (% rechazo)"
            help="+ = peor (más rechazo) · − = mejor"
            value={delta.otif}
            min={-30}
            max={30}
            step={1}
            unit="pp"
            tono="otif"
            onChange={(v) => setDelta((d) => ({ ...d, otif: v }))}
          />
          <SliderRow
            label="Ausentismo"
            value={delta.aus}
            min={-30}
            max={30}
            step={1}
            unit="pp"
            tono="aus"
            onChange={(v) => setDelta((d) => ({ ...d, aus: v }))}
          />
          <SliderRow
            label="Clientes"
            value={delta.cli}
            min={-50}
            max={100}
            step={5}
            unit="%"
            tono="cli"
            onChange={(v) => setDelta((d) => ({ ...d, cli: v }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Label htmlFor="nombre-esc" className="text-sm shrink-0">
            Nombre
          </Label>
          <Input
            id="nombre-esc"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Pre-Pascua con +30% volumen y 10pp ausentismo"
            className="flex-1 max-w-md"
          />
          <Button onClick={guardar} disabled={guardando}>
            <Copy className="w-4 h-4 mr-1" /> Guardar escenario
          </Button>
          {msgGuardar && (
            <span
              className={
                msgGuardar.includes("guardado")
                  ? "text-sm text-emerald-700"
                  : "text-sm text-red-700"
              }
            >
              {msgGuardar}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Escenarios guardados: lista persistida. "Cargar" vuelca día base +
          deltas a los controles de arriba; "Borrar" lo elimina. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-600" />
            Escenarios guardados
            {escenarios.length > 0 && (
              <Badge variant="secondary" className="font-normal">{escenarios.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cargandoEsc ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : escenarios.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no guardaste escenarios. Ajustá los sliders y tocá «Guardar escenario».
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {escenarios.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 truncate">{e.nombre}</span>
                      {e.resultado_nivel && (
                        <Badge className={`${COLOR_NIVEL[e.resultado_nivel] ?? "bg-slate-400 text-white"} text-[10px]`}>
                          {e.resultado_nivel}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                      <span>Base {e.fecha_base}</span>
                      <span>· Vol {fmtDelta(e.delta_volumen)}%</span>
                      <span>· OTIF {fmtDelta(e.delta_otif)}pp</span>
                      <span>· Aus {fmtDelta(e.delta_ausentismo)}pp</span>
                      <span>· Cli {fmtDelta(e.delta_clientes ?? 0)}%</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => aplicarEscenario(e)} title="Cargar en el simulador">
                    <FolderOpen className="w-4 h-4 mr-1" /> Cargar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => borrarEscenario(e.id)}
                    title="Borrar escenario"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const fmtDelta = (n: number) => (n > 0 ? "+" : "") + n

function EscenarioCard({
  titulo,
  destacado,
  hl,
  pct_rechazo,
  pct_ausentismo,
  clientes_dia,
  camiones,
  score,
  codigo,
  estatus,
  triggers,
}: {
  titulo: string
  destacado?: boolean
  hl: number
  pct_rechazo: number
  pct_ausentismo: number
  clientes_dia: number
  camiones: number
  score: number
  codigo: string
  estatus: "CRITICO" | "NORMAL"
  triggers: { vol: boolean; cli: boolean; otif: boolean; aus: boolean }
}) {
  const colorEstatus =
    estatus === "CRITICO"
      ? codigo.length >= 4 ? "bg-red-700 text-white" :
        codigo.length === 3 ? "bg-red-500 text-white" :
        "bg-orange-500 text-white"
      : "bg-emerald-500 text-white"
  return (
    <Card className={destacado ? "border-2 border-slate-900" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          {titulo}
          <Badge className={`${colorEstatus} font-semibold`}>
            {codigo || "—"} · {estatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <KV k="HL" v={fmtHL(hl)} trigger={triggers.vol} />
        <KV k="Clientes" v={String(clientes_dia)} trigger={triggers.cli} />
        <KV k="OTIF est" v={fmtPct(1 - pct_rechazo)} trigger={triggers.otif} />
        <KV k="% Ausentismo" v={fmtPct(pct_ausentismo)} trigger={triggers.aus} />
        <KV k="% Rechazo" v={fmtPct(pct_rechazo)} />
        <KV k="Camiones" v={String(camiones)} />
        <KV k="Score" v={score.toFixed(3)} />
      </CardContent>
    </Card>
  )
}

function KV({ k, v, trigger }: { k: string; v: string; trigger?: boolean }) {
  return (
    <div
      className={`flex justify-between border-b border-slate-100 last:border-0 py-1 ${
        trigger ? "bg-red-50 -mx-2 px-2 rounded" : ""
      }`}
    >
      <span className="text-slate-500 flex items-center gap-1">
        {trigger && <span className="text-red-600 font-bold">●</span>}
        {k}
      </span>
      <span className={`font-medium ${trigger ? "text-red-700" : "text-slate-900"}`}>{v}</span>
    </div>
  )
}

function SliderRow({
  label,
  help,
  value,
  min,
  max,
  step,
  unit,
  tono,
  onChange,
}: {
  label: string
  help?: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  tono: "vol" | "otif" | "aus" | "cli"
  onChange: (v: number) => void
}) {
  const colors: Record<typeof tono, string> = {
    vol: "accent-sky-600",
    otif: "accent-rose-600",
    aus: "accent-amber-600",
    cli: "accent-violet-600",
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-sm">
          {label}
          {help && <span className="ml-2 text-xs text-slate-500">{help}</span>}
        </Label>
        <span
          className={`text-sm font-mono ${value === 0 ? "text-slate-500" : value > 0 ? "text-red-700" : "text-emerald-700"}`}
        >
          {value > 0 ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${colors[tono]}`}
      />
      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
        <span>
          {min}
          {unit}
        </span>
        <span>0</span>
        <span>
          +{max}
          {unit}
        </span>
      </div>
    </div>
  )
}
