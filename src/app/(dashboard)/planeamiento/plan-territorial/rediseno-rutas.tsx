"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Route, Pencil, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  guardarRedisenoRutas,
  type CiudadMes,
  type CiudadResumen,
  type PlanTerritorial,
  type RuteroMomento,
} from "@/actions/plan-territorial"
import type { RuteroVigente } from "@/actions/territorial-rutero"
import { MESES, num, pesos } from "./formato"

// ==================================================================
// Rediseño de rutas de un plan territorial
//
// Es lo que pidió el auditor de H1 2026 al dejar el 5.1 en 0: "análisis de
// reestructuración de rutas en pos de la mejora en el costo/HL, teniendo en
// cuenta relevamiento de ventas horarias, frecuencia de entrega, rechazo". Y
// el plan territorial toca las dos rutas: la del promotor (ventas) y la del
// camión (logística). Por eso la sección muestra el antes/después de ambas,
// la justificación, y abajo el resultado en $/HL calculado en vivo.
// ==================================================================

interface CampoMomento {
  k: keyof RuteroMomento
  label: string
  tipo: "num" | "txt"
  dec?: number
}

const CAMPOS_PREVENTA: CampoMomento[] = [
  { k: "promotores", label: "Promotores", tipo: "num", dec: 0 },
  { k: "pdv", label: "PDV en rutero", tipo: "num", dec: 0 },
  { k: "dias_visita", label: "Días de visita", tipo: "txt" },
  { k: "visitas_sem", label: "Visitas al pueblo por semana", tipo: "num", dec: 0 },
  { k: "mix_frecuencia", label: "Mix de frecuencia", tipo: "txt" },
]
const CAMPOS_REPARTO: CampoMomento[] = [
  { k: "dias_entrega", label: "Días de entrega", tipo: "txt" },
  { k: "viajes_sem", label: "Viajes por semana", tipo: "num", dec: 1 },
  { k: "paradas_viaje", label: "Paradas por viaje", tipo: "num", dec: 1 },
  { k: "km_viaje", label: "Km por viaje", tipo: "num", dec: 0 },
]
const CAMPOS_JUSTIF: CampoMomento[] = [
  { k: "rechazo_pct", label: "Rechazo (%)", tipo: "num", dec: 2 },
]
const GRUPOS: Array<{ titulo: string; campos: CampoMomento[] }> = [
  { titulo: "Rutero de preventa (ventas)", campos: CAMPOS_PREVENTA },
  { titulo: "Rutas de reparto (logística)", campos: CAMPOS_REPARTO },
  { titulo: "Justificación", campos: CAMPOS_JUSTIF },
]

function fmtCampo(m: RuteroMomento, c: CampoMomento): string {
  const v = m[c.k]
  if (v == null || v === "") return "—"
  return c.tipo === "num" ? num(Number(v), c.dec ?? 0) : String(v)
}

// ------------------------------------------------------------------
// Resultado en vivo: la serie de la ciudad partida en antes/después
// ------------------------------------------------------------------

interface ResumenPeriodo {
  meses: number[]
  costo_x_hl: number | null
  entregas_mes: number | null
  entregas_pdv_mes: number | null
  hl_entrega: number | null
}

/**
 * Parte la serie mensual de la ciudad en "antes" y "después" de la fecha de
 * implementación y agrega cada mitad sobre totales (nunca promediando ratios).
 * El mes de implementación cuenta como "antes" si el cambio arrancó después
 * del día 15 (Colón: 27/07 → julio es antes) y como "después" si arrancó al
 * principio del mes.
 */
function resultadoAntesDespues(
  ciudad: CiudadResumen | undefined,
  fechaImplementacion: string | null,
): { antes: ResumenPeriodo; despues: ResumenPeriodo } | null {
  if (!ciudad || !fechaImplementacion) return null
  const anioImpl = Number(fechaImplementacion.slice(0, 4))
  const mesImpl = Number(fechaImplementacion.slice(5, 7))
  const diaImpl = Number(fechaImplementacion.slice(8, 10))
  const esDespues = (m: CiudadMes) => {
    if (m.anio !== anioImpl) return m.anio > anioImpl
    if (m.mes !== mesImpl) return m.mes > mesImpl
    return diaImpl <= 15
  }
  const agregar = (ms: CiudadMes[]): ResumenPeriodo => {
    const n = ms.length
    if (!n) {
      return {
        meses: [],
        costo_x_hl: null,
        entregas_mes: null,
        entregas_pdv_mes: null,
        hl_entrega: null,
      }
    }
    const hl = ms.reduce((a, m) => a + m.hl, 0)
    const costo = ms.reduce((a, m) => a + m.costo_total, 0)
    const entregas = ms.reduce((a, m) => a + m.entregas, 0)
    const pdv = ms.reduce((a, m) => a + m.pdv, 0) / n
    return {
      meses: ms.map((m) => m.mes),
      costo_x_hl: hl ? costo / hl : null,
      entregas_mes: entregas / n,
      entregas_pdv_mes: pdv ? entregas / n / pdv : null,
      hl_entrega: entregas ? hl / entregas : null,
    }
  }
  return {
    antes: agregar(ciudad.serie.filter((m) => !esDespues(m))),
    despues: agregar(ciudad.serie.filter(esDespues)),
  }
}

function rangoMeses(meses: number[]): string {
  if (!meses.length) return "sin meses"
  const a = MESES[meses[0]]
  const b = MESES[meses[meses.length - 1]]
  return meses.length === 1 ? a : `${a}–${b}`
}

function deltaPct(antes: number | null, despues: number | null): string {
  if (antes == null || despues == null || !antes) return "—"
  return `${num((100 * (despues - antes)) / antes, 1)}%`
}

// ------------------------------------------------------------------
// Sección en la tarjeta del plan
// ------------------------------------------------------------------

export function RedisenoRutasSection({
  plan,
  ciudad,
  rutero,
  esEditor,
}: {
  plan: PlanTerritorial
  ciudad: CiudadResumen | undefined
  rutero: RuteroVigente | null
  esEditor: boolean
}) {
  const red = plan.rediseno
  const res = resultadoAntesDespues(ciudad, plan.fecha_implementacion)

  const filasResultado: Array<{
    label: string
    fmt: (v: number | null) => string
    k: keyof Omit<ResumenPeriodo, "meses">
  }> = [
    { label: "$/HL", k: "costo_x_hl", fmt: pesos },
    { label: "Entregas por mes", k: "entregas_mes", fmt: (v) => num(v, 0) },
    { label: "Entregas por PDV por mes", k: "entregas_pdv_mes", fmt: (v) => num(v, 2) },
    { label: "HL por entrega", k: "hl_entrega", fmt: (v) => num(v, 2) },
  ]

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Route className="h-3.5 w-3.5" />
          Rediseño de rutas · promotores + reparto
        </p>
        {esEditor && <RedisenoDialog plan={plan} rutero={rutero} />}
      </div>

      {!red ? (
        <p className="flex items-start gap-1 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          El auditor pide el análisis de reestructuración de rutas (ventas
          horarias, frecuencia de entrega, rechazo). Todavía no está documentado
          para este plan.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead className="text-right">Antes</TableHead>
                <TableHead className="text-right">Después</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GRUPOS.map((g) => (
                <GrupoFilas key={g.titulo} titulo={g.titulo} campos={g.campos} red={red} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {red?.ventanas_horarias && (
        <p className="text-sm">
          <span className="text-muted-foreground">Ventanas horarias: </span>
          {red.ventanas_horarias}
        </p>
      )}
      {red?.justificacion && (
        <p className="whitespace-pre-wrap text-sm">
          <span className="text-muted-foreground">Por qué se cambió: </span>
          {red.justificacion}
        </p>
      )}

      {/* Resultado en vivo (R5.1.4): mismo número que Costo por PDV */}
      <div className="rounded-md bg-slate-50 p-3">
        <p className="text-xs font-semibold text-muted-foreground">
          Resultado en $/HL de {plan.ciudad}
          {plan.fecha_implementacion ? ` · cambio del ${plan.fecha_implementacion.slice(8, 10)}/${plan.fecha_implementacion.slice(5, 7)}/${plan.fecha_implementacion.slice(0, 4)}` : ""}
        </p>
        {!res ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Cargá la fecha de implementación del plan para comparar antes y
            después.
          </p>
        ) : (
          <>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Métrica</TableHead>
                    <TableHead className="text-right">
                      Antes ({rangoMeses(res.antes.meses)})
                    </TableHead>
                    <TableHead className="text-right">
                      Después ({rangoMeses(res.despues.meses)})
                    </TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasResultado.map((f) => {
                    const a = res.antes[f.k]
                    const d = res.despues[f.k]
                    const delta = a != null && d != null && a ? (d - a) / a : null
                    const mejora = f.k === "costo_x_hl" ? delta != null && delta < 0 : delta != null && delta > 0
                    return (
                      <TableRow key={f.k}>
                        <TableCell>{f.label}</TableCell>
                        <TableCell className="text-right">{f.fmt(a)}</TableCell>
                        <TableCell className="text-right font-semibold">{f.fmt(d)}</TableCell>
                        <TableCell
                          className={`text-right ${
                            delta == null ? "" : mejora ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {deltaPct(a, d)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {res.despues.meses.length === 0 && (
              <p className="mt-2 flex items-start gap-1 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Todavía no hay meses con costo cargado después del cambio. Cargá
                el costo logístico del mes siguiente en Costo por PDV para ver el
                después.
              </p>
            )}
          </>
        )}
        {red?.resultado && (
          <p className="mt-2 whitespace-pre-wrap text-sm">
            <span className="text-muted-foreground">Conclusión: </span>
            {red.resultado}
          </p>
        )}
      </div>

      {rutero && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold">Rutero vigente hoy</span> (base
          comercial
          {rutero.sincronizado
            ? `, sincronizado ${rutero.sincronizado.slice(8, 10)}/${rutero.sincronizado.slice(5, 7)}`
            : ""}
          ): {rutero.promotores.length} promotor
          {rutero.promotores.length === 1 ? "" : "es"} · {rutero.pdv_en_rutero}{" "}
          PDV en rutero de {rutero.clientes_activos} activos · {rutero.dias_visita}{" "}
          · {rutero.mix_texto} · {rutero.con_horario} con horario relevado.{" "}
          {rutero.promotores
            .map((p) => `${p.nombre}: ${p.pdv} PDV, ${p.dias}`)
            .join(" / ")}
        </p>
      )}
    </div>
  )
}

function GrupoFilas({
  titulo,
  campos,
  red,
}: {
  titulo: string
  campos: CampoMomento[]
  red: NonNullable<PlanTerritorial["rediseno"]>
}) {
  return (
    <>
      <TableRow className="bg-slate-50">
        <TableCell colSpan={3} className="py-1 text-xs font-semibold text-muted-foreground">
          {titulo}
        </TableCell>
      </TableRow>
      {campos.map((c) => {
        const a = fmtCampo(red.antes, c)
        const d = fmtCampo(red.despues, c)
        const cambio = a !== d && a !== "—" && d !== "—"
        return (
          <TableRow key={c.k}>
            <TableCell className="text-sm">{c.label}</TableCell>
            <TableCell className="text-right text-sm">{a}</TableCell>
            <TableCell className="text-right text-sm font-semibold">
              {d}
              {cambio && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  cambió
                </Badge>
              )}
            </TableCell>
          </TableRow>
        )
      })}
    </>
  )
}

// ------------------------------------------------------------------
// Diálogo de carga
//
// Campos controlados por momento (antes/después). El botón "Tomar del rutero
// vigente" llena el "después" de preventa con lo que dice hoy la base
// comercial; lo demás (reparto, rechazo, antes) lo sabe la gente, no la app.
// ------------------------------------------------------------------

type Momento = Record<string, string>

function desdeRediseno(m: RuteroMomento | undefined): Momento {
  const out: Momento = {}
  if (!m) return out
  for (const [k, v] of Object.entries(m)) out[k] = v == null ? "" : String(v)
  return out
}

function RedisenoDialog({
  plan,
  rutero,
}: {
  plan: PlanTerritorial
  rutero: RuteroVigente | null
}) {
  const red = plan.rediseno
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const [antes, setAntes] = useState<Momento>(() => desdeRediseno(red?.antes))
  const [despues, setDespues] = useState<Momento>(() => desdeRediseno(red?.despues))
  const [ventanas, setVentanas] = useState(red?.ventanas_horarias ?? "")
  const [justificacion, setJustificacion] = useState(red?.justificacion ?? "")
  const [resultado, setResultado] = useState(red?.resultado ?? "")

  function tomarRuteroVigente() {
    if (!rutero) return
    setDespues((d) => ({
      ...d,
      promotores: String(rutero.promotores.length),
      pdv: String(rutero.pdv_en_rutero),
      dias_visita: rutero.dias_visita,
      visitas_sem: String(rutero.visitas_sem),
      mix_frecuencia: rutero.mix_texto,
    }))
    if (!ventanas.trim()) {
      setVentanas(
        `${rutero.con_horario} de ${rutero.clientes_activos} clientes con horario relevado por el promotor.`,
      )
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    for (const [k, v] of Object.entries(antes)) fd.set(`antes.${k}`, v)
    for (const [k, v] of Object.entries(despues)) fd.set(`despues.${k}`, v)
    fd.set("ventanas_horarias", ventanas)
    fd.set("justificacion", justificacion)
    fd.set("resultado", resultado)
    startTransition(async () => {
      const r = await guardarRedisenoRutas(plan.id, fd)
      if ("error" in r) setError(r.error)
      else setAbierto(false)
    })
  }

  const campoInput = (c: CampoMomento, m: Momento, set: (f: (m: Momento) => Momento) => void) => (
    <Input
      type={c.tipo === "num" ? "number" : "text"}
      step={c.tipo === "num" ? "any" : undefined}
      value={m[c.k] ?? ""}
      onChange={(e) => {
        const v = e.target.value
        set((prev) => ({ ...prev, [c.k]: v }))
      }}
      className="h-8 text-sm"
    />
  )

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="h-4 w-4" />
        {red ? "Editar rediseño" : "Documentar rediseño de rutas"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediseño de rutas — {plan.titulo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Antes = cómo se atendía {plan.ciudad} antes del plan. Después = cómo
            queda con el plan implementado. Dejá en blanco lo que no se sabe; no
            pongas cero.
          </p>

          {rutero && (
            <Button type="button" variant="secondary" size="sm" onClick={tomarRuteroVigente}>
              <Download className="h-4 w-4" />
              Tomar el «después» de preventa del rutero vigente
            </Button>
          )}

          {GRUPOS.map((g) => (
            <div key={g.titulo} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{g.titulo}</p>
              <div className="grid grid-cols-[1fr_7rem_7rem] items-center gap-2 text-xs text-muted-foreground sm:grid-cols-[1fr_9rem_9rem]">
                <span />
                <span>Antes</span>
                <span>Después</span>
              </div>
              {g.campos.map((c) => (
                <div
                  key={c.k}
                  className="grid grid-cols-[1fr_7rem_7rem] items-center gap-2 sm:grid-cols-[1fr_9rem_9rem]"
                >
                  <Label className="text-sm">{c.label}</Label>
                  {campoInput(c, antes, setAntes)}
                  {campoInput(c, despues, setDespues)}
                </div>
              ))}
            </div>
          ))}

          <div>
            <Label htmlFor="ventanas_horarias">Ventanas horarias relevadas</Label>
            <Textarea
              id="ventanas_horarias"
              rows={2}
              className="mt-1"
              value={ventanas}
              onChange={(e) => setVentanas(e.target.value)}
              placeholder="A qué hora compran y reciben los PDV: base del rediseño."
            />
          </div>
          <div>
            <Label htmlFor="justificacion">Por qué se cambió así</Label>
            <Textarea
              id="justificacion"
              rows={3}
              className="mt-1"
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder="Rechazo, frecuencia, drop size, capacidad del camión…"
            />
          </div>
          <div>
            <Label htmlFor="resultado">Conclusión (cuando cierre el período)</Label>
            <Textarea
              id="resultado"
              rows={2}
              className="mt-1"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar rediseño"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
