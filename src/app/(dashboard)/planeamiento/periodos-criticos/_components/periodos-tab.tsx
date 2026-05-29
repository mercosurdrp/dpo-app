"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarRange, Star, AlertTriangle, CheckCircle2, Copy, Check } from "lucide-react"
import type { DiaCalendario, PlanAccion } from "./client"
import { detectarPeriodosCriticos, type PeriodoCritico } from "../_lib/detectar-periodos"

const fmtHL = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtFecha = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

// Color por cantidad de triggers (idem al calendario)
function colorPorCodigo(codigo: string): string {
  if (codigo.length >= 4) return "bg-red-700 text-white"
  if (codigo.length === 3) return "bg-red-500 text-white"
  if (codigo.length === 2) return "bg-orange-500 text-white"
  if (codigo.length === 1) return "bg-amber-300 text-amber-950"
  return "bg-emerald-500 text-white"
}

export function PeriodosTab({
  dias,
  planes,
}: {
  dias: DiaCalendario[]
  planes: PlanAccion[]
}) {
  const periodos = useMemo(() => detectarPeriodosCriticos(dias), [dias])
  const cumpleR341 = periodos.length >= 3
  const planByCodigo = useMemo(() => {
    const m: Record<string, PlanAccion> = {}
    for (const p of planes) m[p.codigo] = p
    return m
  }, [planes])

  return (
    <div className="space-y-4">
      <Card
        className={
          cumpleR341
            ? "border-l-4 border-l-emerald-600 bg-emerald-50/40"
            : "border-l-4 border-l-amber-600 bg-amber-50/40"
        }
      >
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          {cumpleR341 ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
          )}
          <div className="flex-1 min-w-[240px]">
            <p className="text-sm font-semibold text-slate-900">
              {periodos.length} período{periodos.length === 1 ? "" : "s"} crítico
              {periodos.length === 1 ? "" : "s"} detectado{periodos.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-slate-600">
              R3.4.1 requiere mínimo 3 períodos.{" "}
              {cumpleR341
                ? "Requerimiento cumplido."
                : "Faltan períodos — bajá los umbrales en Configuración."}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Bloque = días con estatus CRÍTICO, máx 7 días, gaps hasta 2 días no-crítico
          </div>
        </CardContent>
      </Card>

      {periodos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            Sin días críticos en el año vigente. Verificá los umbrales o que el ausentismo esté cargado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {periodos.map((p, idx) => (
            <PeriodoCard
              key={p.id}
              periodo={p}
              indice={idx + 1}
              plan={planByCodigo[p.codigoPredominante]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PeriodoCard({
  periodo: p,
  indice,
  plan,
}: {
  periodo: PeriodoCritico
  indice: number
  plan: PlanAccion | undefined
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiarPlan() {
    if (!plan) return
    const texto =
      `Período crítico ${indice}: ${p.nombre}\n` +
      `${fmtFecha(p.fechaInicio)} → ${fmtFecha(p.fechaFin)} · código ${p.codigoPredominante} · ${p.cantDiasCriticos} días críticos\n\n` +
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
          <Badge className={`${colorPorCodigo(p.codigoPredominante)} font-semibold`}>
            {p.codigoPredominante || "—"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-slate-500">{p.motivo}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <span className="font-medium">{fmtFecha(p.fechaInicio)}</span>
          <span className="text-slate-400">→</span>
          <span className="font-medium">{fmtFecha(p.fechaFin)}</span>
          <span className="text-xs text-slate-500">
            ({p.cantDias}d · {p.cantDiasCriticos} críticos)
          </span>
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
            Días del período
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
