"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RotateCcw, Copy } from "lucide-react"
import type { CfgPC, DiaCalendario } from "./client"

// Réplica client-side de la fórmula de v_pc_calendario_dia. Se mantienen los
// mismos clamps (rechazo y ausentismo se acotan a [0,1]; score se acota a 2)
// para que el preview coincida con lo que la vista calcularía si los datos
// estuvieran realmente cargados.
function recalcular(
  base: { hl: number; pct_rechazo: number; pct_ausentismo: number },
  delta: { vol: number; otif: number; aus: number },
  cfg: CfgPC,
): { hl: number; pct_rechazo: number; pct_ausentismo: number; score: number; nivel: "BAJO" | "MEDIO" | "ALTO" } {
  const hl = Math.max(0, base.hl * (1 + delta.vol / 100))
  // delta.otif positivo = MÁS rechazo = peor. Va en puntos porcentuales.
  const pct_rechazo = clamp(base.pct_rechazo + delta.otif / 100, 0, 1)
  const pct_ausentismo = clamp(base.pct_ausentismo + delta.aus / 100, 0, 1)

  const p90 = cfg.hl_p90_2025 && cfg.hl_p90_2025 > 0 ? cfg.hl_p90_2025 : 1
  const volNorm = hl / p90
  const score = Math.min(2, cfg.w_vol * volNorm + cfg.w_otif * pct_rechazo + cfg.w_aus * pct_ausentismo)
  const nivel: "BAJO" | "MEDIO" | "ALTO" =
    score >= cfg.umbral_alto ? "ALTO" : score >= cfg.umbral_medio ? "MEDIO" : "BAJO"
  return { hl, pct_rechazo, pct_ausentismo, score, nivel }
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

export function SimuladorTab({ dias, cfg }: { dias: DiaCalendario[]; cfg: CfgPC }) {
  // Solo se pueden elegir como base días con datos (hl > 0 o ausentismo > 0)
  const opciones = useMemo(
    () =>
      dias.filter((d) => d.hl > 0 || d.pct_ausentismo > 0 || d.es_feriado).map((d) => ({
        value: d.fecha,
        label: `${d.fecha} · ${d.dia_semana} · ${fmtHL(d.hl)} HL · ${d.nivel}`,
      })),
    [dias],
  )

  const [fechaBase, setFechaBase] = useState<string>(
    () => opciones.find((o) => o.label.includes("ALTO"))?.value ?? opciones[0]?.value ?? "",
  )
  const [delta, setDelta] = useState({ vol: 0, otif: 0, aus: 0 })
  const [nombre, setNombre] = useState("")

  const base = dias.find((d) => d.fecha === fechaBase)
  const sim = useMemo(
    () =>
      base
        ? recalcular(
            { hl: base.hl, pct_rechazo: base.pct_rechazo, pct_ausentismo: base.pct_ausentismo },
            delta,
            cfg,
          )
        : null,
    [base, delta, cfg],
  )

  // Guardar escenario
  const [guardando, setGuardando] = useState(false)
  const [msgGuardar, setMsgGuardar] = useState<string | null>(null)

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
    } catch (e) {
      setMsgGuardar(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
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
              onClick={() => setDelta({ vol: 0, otif: 0, aus: 0 })}
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
          camiones={base.camiones}
          score={base.score}
          nivel={base.nivel}
        />
        {sim && (
          <EscenarioCard
            titulo="Simulación"
            destacado
            hl={sim.hl}
            pct_rechazo={sim.pct_rechazo}
            pct_ausentismo={sim.pct_ausentismo}
            camiones={base.camiones}
            score={sim.score}
            nivel={sim.nivel}
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
    </div>
  )
}

function EscenarioCard({
  titulo,
  destacado,
  hl,
  pct_rechazo,
  pct_ausentismo,
  camiones,
  score,
  nivel,
}: {
  titulo: string
  destacado?: boolean
  hl: number
  pct_rechazo: number
  pct_ausentismo: number
  camiones: number
  score: number
  nivel: "BAJO" | "MEDIO" | "ALTO"
}) {
  return (
    <Card className={destacado ? "border-2 border-slate-900" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          {titulo}
          <Badge className={`${COLOR_NIVEL[nivel]} font-semibold`}>{nivel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <KV k="HL" v={fmtHL(hl)} />
        <KV k="% Rechazo" v={fmtPct(pct_rechazo)} />
        <KV k="% Ausentismo" v={fmtPct(pct_ausentismo)} />
        <KV k="Camiones" v={String(camiones)} />
        <KV k="Score" v={score.toFixed(3)} />
      </CardContent>
    </Card>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 last:border-0 py-1">
      <span className="text-slate-500">{k}</span>
      <span className="font-medium text-slate-900">{v}</span>
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
  tono: "vol" | "otif" | "aus"
  onChange: (v: number) => void
}) {
  const colors: Record<typeof tono, string> = {
    vol: "accent-sky-600",
    otif: "accent-rose-600",
    aus: "accent-amber-600",
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
