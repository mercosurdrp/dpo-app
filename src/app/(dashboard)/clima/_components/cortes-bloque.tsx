"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { DIM_ENGAGEMENT, semaforo } from "@/lib/clima-vocabulario"
import type { CorteResumen, FilaComparada } from "@/actions/clima-tipos"
import type { FocoInicialPlan } from "./planes/planes-bloque"
import { Delta } from "./resultados-bloque"

const TIPO_TITULO: Record<string, string> = {
  sector: "Por sector",
  posicion: "Por puesto",
  jefe: "Por equipo",
  genero: "Por género",
}

const TIPO_AYUDA: Record<string, string> = {
  sector: "El promedio de la empresa puede tapar sectores que van para lados opuestos.",
  posicion: "Dos puestos del mismo sector pueden vivir realidades distintas.",
  jefe: "Para la devolución de cada líder a su equipo. No sirve para rankear jefes: los equipos son chicos.",
  genero: "Bases muy chicas: leer la tendencia, no el número exacto.",
}

const SEMAFORO_TEXTO: Record<string, string> = {
  verde: "text-emerald-700",
  amarillo: "text-amber-700",
  naranja: "text-orange-700",
  rojo: "text-red-700",
}

/** Nombre de equipo en formato legible: "MICHAJLOW, CYRO" -> "Cyro Michajlow". */
function nombreLegible(corte: string): string {
  if (!corte.includes(",")) return corte
  const [apellido, nombre] = corte.split(",").map((s) => s.trim())
  const cap = (s: string) =>
    s
      .toLocaleLowerCase("es-AR")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toLocaleUpperCase("es-AR") + w.slice(1))
      .join(" ")
  return `${cap(nombre)} ${cap(apellido)}`
}

function TarjetaCorte({
  corte,
  onCrearPlan,
  olaId,
  olaCodigo,
  olaAnteriorCodigo,
}: {
  corte: CorteResumen
  onCrearPlan: (foco: FocoInicialPlan) => void
  olaId: string
  olaCodigo: string
  olaAnteriorCodigo: string | null
}) {
  const [abierto, setAbierto] = useState(false)
  const s = semaforo(corte.engagement)
  const dims = corte.dimensiones.filter((d) => d.dimension !== DIM_ENGAGEMENT)
  const peores = corte.preguntas.filter((p) => p.valor != null).slice(0, 5)

  const crear = (f: FilaComparada) =>
    onCrearPlan({
      dimension: f.dimension,
      pregunta: f.texto,
      foco:
        corte.corte_tipo === "jefe"
          ? `Equipo de ${nombreLegible(corte.corte)}`
          : corte.corte,
      hallazgo:
        `${corte.corte_tipo === "jefe" ? nombreLegible(corte.corte) : corte.corte} · ` +
        `${f.etiqueta}: ${f.valor} en ${olaCodigo}` +
        (f.delta != null
          ? ` (${f.delta > 0 ? "+" : ""}${f.delta} vs ${olaAnteriorCodigo})`
          : ""),
      ola_id: olaId,
    })

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-slate-50"
      >
        {abierto ? (
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
          {corte.corte_tipo === "jefe"
            ? nombreLegible(corte.corte)
            : corte.corte}
        </span>
        <span className="hidden gap-3 sm:flex">
          {dims.map((d) => (
            <span key={d.dimension} className="w-9 text-center" title={d.etiqueta}>
              <span
                className={`text-xs font-semibold ${
                  semaforo(d.valor) ? SEMAFORO_TEXTO[semaforo(d.valor)!] : "text-slate-400"
                }`}
              >
                {d.valor ?? "—"}
              </span>
            </span>
          ))}
        </span>
        <span className="flex w-24 shrink-0 items-baseline justify-end gap-2">
          <span
            className={`text-xl font-bold ${
              s ? SEMAFORO_TEXTO[s] : "text-slate-400"
            }`}
          >
            {corte.engagement ?? "—"}
          </span>
          <Delta delta={corte.engagementDelta} />
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {dims.map((d) => (
              <div
                key={d.dimension}
                className="rounded border border-slate-100 bg-slate-50 p-2"
              >
                <p className="truncate text-[11px] text-slate-500">
                  {d.etiqueta}
                </p>
                <p className="flex items-baseline gap-1.5">
                  <span
                    className={`text-lg font-bold ${
                      semaforo(d.valor)
                        ? SEMAFORO_TEXTO[semaforo(d.valor)!]
                        : "text-slate-400"
                    }`}
                  >
                    {d.valor ?? "—"}
                  </span>
                  <Delta delta={d.delta} />
                </p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
              Sus puntajes más bajos
            </p>
            {peores.map((p) => (
              <div
                key={p.texto}
                className="group flex items-center gap-3 border-b border-slate-100 py-1.5 last:border-0"
              >
                <span
                  className={`w-8 text-right text-sm font-bold ${
                    semaforo(p.valor)
                      ? SEMAFORO_TEXTO[semaforo(p.valor)!]
                      : "text-slate-400"
                  }`}
                >
                  {p.valor}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm text-slate-700"
                  title={p.texto}
                >
                  {p.etiqueta}
                </span>
                <Delta delta={p.delta} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => crear(p)}
                  title="Crear plan de acción"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  cortes: CorteResumen[]
  olaId: string
  olaCodigo: string
  olaAnteriorCodigo: string | null
  onCrearPlan: (foco: FocoInicialPlan) => void
  /** El corte por equipo es nominal: solo lo ven RRHH y quienes conducen. */
  puedeVerEquipos: boolean
}

export function CortesBloque({
  cortes,
  olaId,
  olaCodigo,
  olaAnteriorCodigo,
  onCrearPlan,
  puedeVerEquipos,
}: Props) {
  const tipos = useMemo(() => {
    const orden = ["sector", "posicion", "jefe", "genero"]
    const presentes = [...new Set(cortes.map((c) => c.corte_tipo))]
      .filter((t) => t !== "jefe" || puedeVerEquipos)
      .sort((a, b) => orden.indexOf(a) - orden.indexOf(b))
    return presentes
  }, [cortes, puedeVerEquipos])

  const [tab, setTab] = useState(tipos[0] ?? "sector")

  if (!tipos.length) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cómo se abre el resultado</CardTitle>
        <p className="text-xs text-slate-500">
          Todos los cortes son de {olaCodigo}, propios de la empresa. Tocá una
          fila para ver sus dimensiones y sus ítems más bajos.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
          <TabsList>
            {tipos.map((t) => (
              <TabsTrigger key={t} value={t}>
                {TIPO_TITULO[t] ?? t}
              </TabsTrigger>
            ))}
          </TabsList>
          {tipos.map((t) => (
            <TabsContent key={t} value={t} className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">{TIPO_AYUDA[t]}</p>
              {cortes
                .filter((c) => c.corte_tipo === t)
                .map((c) => (
                  <TarjetaCorte
                    key={`${c.corte_tipo}|${c.corte}`}
                    corte={c}
                    onCrearPlan={onCrearPlan}
                    olaId={olaId}
                    olaCodigo={olaCodigo}
                    olaAnteriorCodigo={olaAnteriorCodigo}
                  />
                ))}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
