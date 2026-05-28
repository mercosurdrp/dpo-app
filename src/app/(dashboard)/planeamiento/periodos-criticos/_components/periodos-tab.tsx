"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarRange, Star, AlertTriangle, CheckCircle2 } from "lucide-react"
import type { DiaCalendario } from "./client"
import { detectarPeriodosCriticos, type PeriodoCritico } from "../_lib/detectar-periodos"

const fmtHL = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtFecha = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

const COLOR_NIVEL: Record<string, string> = {
  ALTO: "bg-red-500 text-white",
  MEDIO: "bg-amber-400 text-amber-950",
  BAJO: "bg-emerald-500/80 text-white",
}

export function PeriodosTab({ dias }: { dias: DiaCalendario[] }) {
  const periodos = useMemo(() => detectarPeriodosCriticos(dias), [dias])
  const cumpleR341 = periodos.length >= 3

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
              {periodos.length === 1 ? "" : "s"} detectado{periodos.length === 1 ? "" : "s"} en el año
            </p>
            <p className="text-xs text-slate-600">
              R3.4.1 requiere mínimo 3 períodos.{" "}
              {cumpleR341
                ? "Requerimiento cumplido."
                : "Faltan períodos — bajar el umbral ALTO en Configuración para detectar más."}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Bloques de 1–7 días con al menos un día clasificado ALTO. Se permiten gaps de hasta 2 días no-ALTO dentro de un mismo bloque.
          </div>
        </CardContent>
      </Card>

      {periodos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            Sin días ALTO en el año vigente. Verificá los umbrales en Configuración o que el seed histórico esté cargado (P90).
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {periodos.map((p, idx) => (
            <PeriodoCard key={p.id} periodo={p} indice={idx + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function PeriodoCard({ periodo: p, indice }: { periodo: PeriodoCritico; indice: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-start justify-between gap-2">
          <span className="flex items-center gap-2">
            <Badge variant="outline">#{indice}</Badge>
            {p.nombre}
          </span>
          <Badge className="bg-red-500 text-white">{p.cantDiasAlto} ALTO</Badge>
        </CardTitle>
        <p className="text-xs text-slate-500">{p.motivo}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <span className="font-medium">{fmtFecha(p.fechaInicio)}</span>
          <span className="text-slate-400">→</span>
          <span className="font-medium">{fmtFecha(p.fechaFin)}</span>
          <span className="text-xs text-slate-500">({p.cantDias}d)</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat k="HL pico" v={fmtHL(p.hlMax)} />
          <Stat k="HL acum" v={fmtHL(p.hlAcum)} />
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
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${COLOR_NIVEL[d.nivel] ?? "bg-slate-100"}`}
                title={`${d.dia_semana} ${d.fecha} · HL ${fmtHL(d.hl)} · score ${Number(d.score).toFixed(3)}`}
              >
                {d.fecha === p.diaPico && <Star className="w-3 h-3" />}
                {fmtFecha(d.fecha)}
              </span>
            ))}
          </div>
        </div>
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
