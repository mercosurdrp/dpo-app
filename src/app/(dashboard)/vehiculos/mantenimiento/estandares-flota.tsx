"use client"

// Estándares de Flota (DPO 1.2): matriz de cumplimiento ítem × unidad.
// Migrada de la planilla "ESTANDAR DE LA FLOTA"; las columnas salen del
// catálogo de vehículos ACTIVOS, así la matriz queda viva cuando entran o
// salen unidades. Click en una celda (admin/supervisor) cicla OK → NO OK → N/A.
//
// Una combinación unidad × ítem SIN FILA no es un "N/A": es que nadie la miró
// todavía. Se dibuja "?" en ámbar y se cuenta aparte, porque un N/A silencioso
// sale del denominador del KPI y el auditor lo lee como no evaluado.
//
// R1.2.4 pide plan de acción para lo que no cumple: al marcar NO OK (o N/A, que
// hay que justificar por qué no aplica al modal) se pide la observación en el
// acto. Se puede editar después con click derecho sobre la celda.
//
// El punto pide además separar lo MANDATORIO de lo de EXCELENCIA: con todos los
// ítems pesando igual, "le falta el arco antienganche" promediaba contra "no
// tiene control crucero". La matriz va agrupada por criticidad y el % sale
// abierto en dos, porque el número que le importa al auditor es el mandatorio.

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import {
  setEstandarCriticidad,
  setEstandarEstado,
  type EstandarCriticidad,
  type EstandarCumplimiento,
  type EstandarEstado,
  type EstandarItem,
  type EstandarUnidad,
} from "@/actions/flota-estandares"

/** `null` = sin evaluar (no hay fila en la matriz). */
type EstadoCelda = EstandarEstado | null

// Desde "sin evaluar" el primer click afirma que cumple, que es el caso normal
// al relevar; de ahí en más es el ciclo de siempre.
const CICLO: Record<EstandarEstado, EstandarEstado> = {
  ok: "no_ok",
  no_ok: "na",
  na: "ok",
}
const siguienteEstado = (e: EstadoCelda): EstandarEstado => (e == null ? "ok" : CICLO[e])

/** Estados que el auditor va a cuestionar ⇒ se pide el porqué al marcarlos. */
const PIDE_OBSERVACION: EstandarEstado[] = ["no_ok", "na"]

// Llegar a NO OK o N/A puede requerir pasar por otros estados del ciclo, así que
// el diálogo espera a que el usuario deje de clickear en vez de interrumpirlo.
const ESPERA_DIALOGO_MS = 1200

const CELDA: Record<EstandarEstado, { label: string; cls: string }> = {
  ok: {
    label: "✓",
    cls: "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400",
  },
  no_ok: {
    label: "✗",
    cls: "bg-destructive/10 font-bold text-destructive hover:bg-destructive/20",
  },
  na: { label: "—", cls: "bg-muted text-muted-foreground/40 hover:bg-muted/70" },
}

const CELDA_SIN_EVALUAR = {
  label: "?",
  cls: "bg-amber-500/15 font-bold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400",
}

const celdaEstilo = (e: EstadoCelda) => (e == null ? CELDA_SIN_EVALUAR : CELDA[e])

const ETIQUETA: Record<EstandarEstado, string> = {
  ok: "cumple",
  no_ok: "no cumple",
  na: "no aplica",
}

const CRITICIDADES: EstandarCriticidad[] = ["mandatorio", "excelencia"]

const CRITICIDAD: Record<
  EstandarCriticidad,
  { titulo: string; chip: string; ayuda: string; cls: string }
> = {
  mandatorio: {
    titulo: "Mandatorios",
    chip: "M",
    ayuda:
      "Mandatorio: lo exige la ley o su ausencia habilita un riesgo de lesión grave. Un desvío acá es un hallazgo de auditoría.",
    cls: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  excelencia: {
    titulo: "Excelencia",
    chip: "E",
    ayuda:
      "Excelencia: mejora desempeño, ergonomía o eficiencia. Su ausencia no habilita un riesgo grave inmediato.",
    cls: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
}

interface Props {
  items: EstandarItem[]
  cumplimiento: EstandarCumplimiento[]
  unidades: EstandarUnidad[]
  pct: number | null
  pctMandatorio: number | null
  pctExcelencia: number | null
  puedeEditar: boolean
}

interface DialogoObs {
  dominio: string
  itemId: string
  itemNombre: string
  estado: EstandarEstado
  texto: string
}

export function EstandaresFlota({
  items,
  cumplimiento,
  unidades,
  pct,
  pctMandatorio,
  pctExcelencia,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Overrides optimistas para que el click no espere el refresh del server.
  const [overrides, setOverrides] = useState<Map<string, EstandarEstado>>(new Map())
  const [obsOverrides, setObsOverrides] = useState<Map<string, string | null>>(new Map())
  const [critOverrides, setCritOverrides] = useState<Map<string, EstandarCriticidad>>(
    new Map()
  )
  const [dialogo, setDialogo] = useState<DialogoObs | null>(null)
  const [guardando, setGuardando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const estadoBy = useMemo(() => {
    const m = new Map<string, EstandarCumplimiento>()
    for (const c of cumplimiento) m.set(`${c.dominio}|${c.item_id}`, c)
    return m
  }, [cumplimiento])

  const estadoDe = (dominio: string, itemId: string): EstadoCelda =>
    overrides.get(`${dominio}|${itemId}`) ??
    estadoBy.get(`${dominio}|${itemId}`)?.estado ??
    null

  const criticidadDe = (it: EstandarItem): EstandarCriticidad =>
    critOverrides.get(it.id) ?? it.criticidad

  /** Alterna mandatorio ⇄ excelencia (R1.2.1: se mantiene en la pantalla). */
  const alternarCriticidad = async (it: EstandarItem) => {
    if (!puedeEditar) return
    const previa = criticidadDe(it)
    const nueva: EstandarCriticidad =
      previa === "mandatorio" ? "excelencia" : "mandatorio"
    setCritOverrides((prev) => new Map(prev).set(it.id, nueva))
    const res = await setEstandarCriticidad({ itemId: it.id, criticidad: nueva })
    if ("error" in res) {
      toast.error(res.error)
      setCritOverrides((prev) => {
        const m = new Map(prev)
        m.set(it.id, previa)
        return m
      })
      return
    }
    toast.success(`${it.nombre}: ahora es ${CRITICIDAD[nueva].titulo.toLowerCase()}`)
    startTransition(() => router.refresh())
  }

  const obsDe = (dominio: string, itemId: string): string | null => {
    const k = `${dominio}|${itemId}`
    return obsOverrides.has(k)
      ? (obsOverrides.get(k) ?? null)
      : (estadoBy.get(k)?.observaciones ?? null)
  }

  /** Celdas sin evaluar en toda la matriz (unidades activas × ítems de su ámbito). */
  const sinEvaluar = useMemo(() => {
    let n = 0
    for (const u of unidades) {
      for (const it of items) {
        if (it.ambito !== u.tipo) continue
        const k = `${u.dominio}|${it.id}`
        if (!overrides.has(k) && !estadoBy.has(k)) n++
      }
    }
    return n
  }, [unidades, items, estadoBy, overrides])

  const guardar = async (
    dominio: string,
    itemId: string,
    estado: EstandarEstado,
    observaciones?: string | null
  ) => {
    const k = `${dominio}|${itemId}`
    const estadoPrevio = overrides.get(k)
    setOverrides((prev) => new Map(prev).set(k, estado))
    if (observaciones !== undefined) {
      setObsOverrides((prev) => new Map(prev).set(k, observaciones))
    }
    const res = await setEstandarEstado({ dominio, itemId, estado, observaciones })
    if ("error" in res) {
      toast.error(res.error)
      setOverrides((prev) => {
        const m = new Map(prev)
        if (estadoPrevio === undefined) m.delete(k)
        else m.set(k, estadoPrevio)
        return m
      })
      if (observaciones !== undefined) {
        setObsOverrides((prev) => {
          const m = new Map(prev)
          m.delete(k)
          return m
        })
      }
      return false
    }
    startTransition(() => router.refresh())
    return true
  }

  const clickCelda = async (dominio: string, itemId: string, itemNombre: string) => {
    if (!puedeEditar) return
    const siguiente = siguienteEstado(estadoDe(dominio, itemId))
    if (timerRef.current) clearTimeout(timerRef.current)
    const ok = await guardar(dominio, itemId, siguiente)
    // Si quedó en un estado que hay que justificar y todavía no tiene texto, se
    // pide en el momento: después nadie vuelve a completarlo.
    if (ok && PIDE_OBSERVACION.includes(siguiente) && !obsDe(dominio, itemId)) {
      timerRef.current = setTimeout(() => {
        setDialogo({ dominio, itemId, itemNombre, estado: siguiente, texto: "" })
      }, ESPERA_DIALOGO_MS)
    }
  }

  const abrirObservacion = (dominio: string, itemId: string, itemNombre: string) => {
    if (!puedeEditar) return
    const estado = estadoDe(dominio, itemId)
    if (estado == null) {
      toast.info("Marcá primero si cumple, no cumple o no aplica.")
      return
    }
    setDialogo({
      dominio,
      itemId,
      itemNombre,
      estado,
      texto: obsDe(dominio, itemId) ?? "",
    })
  }

  const guardarObservacion = async () => {
    if (!dialogo) return
    setGuardando(true)
    const texto = dialogo.texto.trim()
    const ok = await guardar(dialogo.dominio, dialogo.itemId, dialogo.estado, texto || null)
    setGuardando(false)
    if (ok) {
      toast.success("Observación guardada")
      setDialogo(null)
    }
  }

  /**
   * Conformidad de toda la flota abierta por criticidad, recalculada en el
   * cliente para que los clicks se vean al toque (el server la reenvía igual en
   * el refresh).
   */
  const resumen = useMemo(() => {
    const conteo: Record<EstandarCriticidad, [number, number]> = {
      mandatorio: [0, 0],
      excelencia: [0, 0],
    }
    for (const u of unidades) {
      for (const it of items) {
        if (it.ambito !== u.tipo) continue
        const e = estadoDe(u.dominio, it.id)
        if (e === "ok") conteo[criticidadDe(it)][0]++
        else if (e === "no_ok") conteo[criticidadDe(it)][1]++
      }
    }
    const pctDe = ([ok, noOk]: [number, number]) =>
      ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null
    return {
      mandatorio: pctDe(conteo.mandatorio),
      excelencia: pctDe(conteo.excelencia),
      desviosMandatorios: conteo.mandatorio[1],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidades, items, estadoBy, overrides, critOverrides])

  const matriz = (ambito: "camion" | "autoelevador") => {
    const itemsAmbito = items.filter((i) => i.ambito === ambito)
    const cols = unidades.filter((u) => u.tipo === ambito)
    if (cols.length === 0 || itemsAmbito.length === 0) {
      return <p className="py-6 text-center text-sm text-muted-foreground">Sin datos.</p>
    }

    // % por unidad (ok ÷ evaluables), con overrides aplicados. `crit` acota el
    // cálculo a una criticidad; sin ella es el global de la unidad.
    const pctUnidad = (dominio: string, crit?: EstandarCriticidad) => {
      let ok = 0
      let noOk = 0
      for (const it of itemsAmbito) {
        if (crit && criticidadDe(it) !== crit) continue
        const e = estadoDe(dominio, it.id)
        if (e === "ok") ok++
        else if (e === "no_ok") noOk++
      }
      return ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null
    }

    const sinEvaluarUnidad = (dominio: string) =>
      itemsAmbito.filter((it) => estadoDe(dominio, it.id) == null).length

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-64 border-b border-border bg-card p-2 text-left font-medium text-muted-foreground">
                Ítem del estándar
              </th>
              {cols.map((u) => {
                const pMand = pctUnidad(u.dominio, "mandatorio")
                const pExc = pctUnidad(u.dominio, "excelencia")
                const pend = sinEvaluarUnidad(u.dominio)
                return (
                  <th
                    key={u.dominio}
                    className="border-b border-border p-2 text-center align-bottom"
                  >
                    <span className="block text-xs font-semibold text-foreground">
                      {u.dominio}
                    </span>
                    <span
                      className={cn(
                        "block text-[11px] font-medium tabular-nums",
                        pMand == null
                          ? "text-muted-foreground/50"
                          : pMand >= 100
                            ? "text-emerald-600 dark:text-emerald-400"
                            : pMand >= 90
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-destructive"
                      )}
                      title="Conformidad en los ítems mandatorios de esta unidad"
                    >
                      M {pMand == null ? "—" : `${pMand.toFixed(0)}%`}
                    </span>
                    <span
                      className="block text-[10px] tabular-nums text-muted-foreground"
                      title="Conformidad en los ítems de excelencia de esta unidad"
                    >
                      E {pExc == null ? "—" : `${pExc.toFixed(0)}%`}
                    </span>
                    {pend > 0 && (
                      <span
                        className="block text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-400"
                        title={`${pend} ítem(s) sin evaluar`}
                      >
                        {pend} sin ver
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          {CRITICIDADES.map((crit) => {
            const filas = itemsAmbito.filter((it) => criticidadDe(it) === crit)
            if (filas.length === 0) return null
            const meta = CRITICIDAD[crit]
            const pGrupo = (() => {
              let ok = 0
              let noOk = 0
              for (const it of filas) {
                for (const u of cols) {
                  const e = estadoDe(u.dominio, it.id)
                  if (e === "ok") ok++
                  else if (e === "no_ok") noOk++
                }
              }
              return ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null
            })()
            return (
              <tbody key={crit}>
                <tr>
                  <td
                    colSpan={cols.length + 1}
                    className="sticky left-0 z-10 border-y border-border bg-muted/50 px-2 py-1.5"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        {meta.titulo}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {filas.length} ítem{filas.length === 1 ? "" : "s"}
                        {pGrupo != null && ` · ${pGrupo.toFixed(1)}% de conformidad`}
                      </span>
                    </span>
                  </td>
                </tr>
                {filas.map((it) => {
                  const justificacion = [
                    it.productividad && `Productividad: ${it.productividad}`,
                    it.seguridad && `Seguridad: ${it.seguridad}`,
                    it.calidad && `Calidad: ${it.calidad}`,
                  ]
                    .filter(Boolean)
                    .join("\n")
                  return (
                    <tr key={it.id} className="border-b border-border last:border-0">
                      <td
                        className="sticky left-0 z-10 bg-card p-2 text-foreground"
                        title={justificacion || undefined}
                      >
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            className={cn(
                              "rounded border px-1 text-[10px] font-bold leading-4",
                              meta.cls,
                              !puedeEditar && "cursor-default"
                            )}
                            title={
                              puedeEditar
                                ? `${meta.ayuda}\n\nClick para pasarlo a ${
                                    crit === "mandatorio" ? "excelencia" : "mandatorio"
                                  }.`
                                : meta.ayuda
                            }
                            onClick={() => alternarCriticidad(it)}
                          >
                            {meta.chip}
                          </button>
                          {it.nombre}
                        </span>
                      </td>
                      {cols.map((u) => {
                        const e = estadoDe(u.dominio, it.id)
                        const obs = obsDe(u.dominio, it.id)
                        const estilo = celdaEstilo(e)
                        const tip =
                          e == null
                            ? "Sin evaluar"
                            : [ETIQUETA[e], obs].filter(Boolean).join(" — ")
                        return (
                          <td key={u.dominio} className="p-0.5 text-center">
                            <button
                              className={cn(
                                "h-7 w-full min-w-14 rounded transition-colors",
                                estilo.cls,
                                !puedeEditar && "cursor-default"
                              )}
                              title={tip}
                              onClick={() => clickCelda(u.dominio, it.id, it.nombre)}
                              onContextMenu={(ev) => {
                                ev.preventDefault()
                                abrirObservacion(u.dominio, it.id, it.nombre)
                              }}
                            >
                              {estilo.label}
                              {obs && (
                                <span className="ml-0.5 align-super text-[9px]">•</span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
        </table>
      </div>
    )
  }

  // El server ya manda los dos %; el cálculo local sólo adelanta los clicks.
  const mandatorio = resumen.mandatorio ?? pctMandatorio
  const excelencia = resumen.excelencia ?? pctExcelencia

  return (
    <div className="space-y-4">
      <DpoSeccionCinta seccionId="estandares" />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden /> Estándares de
            flota
          </CardTitle>
          <div className="flex items-center gap-2">
            {sinEvaluar > 0 && (
              <Badge className="border-amber-500/30 bg-amber-500/10 text-sm text-amber-600 dark:text-amber-400">
                {sinEvaluar} sin evaluar
              </Badge>
            )}
            <Badge
              className={cn(
                "text-sm",
                mandatorio == null
                  ? "border-border bg-muted text-muted-foreground"
                  : mandatorio >= 100
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
              title={
                resumen.desviosMandatorios > 0
                  ? `${resumen.desviosMandatorios} desvío(s) en ítems mandatorios: son los hallazgos que mira el auditor`
                  : "Sin desvíos en ítems mandatorios"
              }
            >
              Mandatorios: {mandatorio != null ? `${mandatorio.toFixed(1)}%` : "—"}
            </Badge>
            <Badge
              className="border-sky-500/30 bg-sky-500/10 text-sm text-sky-600 dark:text-sky-400"
              title="Ítems de excelencia: mejoras que no habilitan un riesgo grave"
            >
              Excelencia: {excelencia != null ? `${excelencia.toFixed(1)}%` : "—"}
            </Badge>
            <Badge
              className="border-border bg-muted text-sm text-muted-foreground"
              title="Conformidad global (mandatorios + excelencia): es el KPI histórico estandares_conformidad"
            >
              Global: {pct != null ? `${pct.toFixed(1)}%` : "—"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Matriz de cumplimiento del estándar (GTS) por unidad, sobre la flota activa
            del catálogo.{" "}
            {puedeEditar && (
              <>
                Click en una celda para ciclar ✓ OK → ✗ NO OK → — N/A. Al marcar ✗ o — se
                pide el motivo; con click derecho se edita después. El punto (•) indica una
                observación (se ve al pasar el mouse).{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  El ? es un ítem sin evaluar: no cuenta en el %.
                </span>{" "}
                Con el chip <strong>M</strong>/<strong>E</strong> de cada fila se
                cambia la criticidad del ítem.
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <strong className="text-foreground">Mandatorio</strong>: lo exige la ley o
            su ausencia habilita un riesgo de lesión grave — un desvío acá es un
            hallazgo de auditoría.{" "}
            <strong className="text-foreground">Excelencia</strong>: mejora desempeño,
            ergonomía o eficiencia.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="camion">
        <TabsList>
          <TabsTrigger value="camion">Camiones</TabsTrigger>
          <TabsTrigger value="autoelevador">Autoelevadores</TabsTrigger>
        </TabsList>
        <TabsContent value="camion">
          <Card>
            <CardContent className="pt-4">{matriz("camion")}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="autoelevador">
          <Card>
            <CardContent className="pt-4">{matriz("autoelevador")}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogo != null} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogo?.estado === "no_ok" ? "Plan de acción" : "Observación"}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.itemNombre} · {dialogo?.dominio} ·{" "}
              {dialogo ? ETIQUETA[dialogo.estado] : ""}
              {dialogo?.estado === "no_ok"
                ? " — qué se va a hacer y para cuándo (R1.2.4)."
                : dialogo?.estado === "na"
                  ? " — por qué el estándar no aplica a este modal."
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={dialogo?.texto ?? ""}
            onChange={(e) =>
              setDialogo((d) => (d ? { ...d, texto: e.target.value } : d))
            }
            placeholder={
              dialogo?.estado === "no_ok"
                ? "Ej.: se gestiona la colocación del protector antes de fin de año"
                : "Ej.: no aplica al modal camión de reparto urbano"
            }
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardarObservacion} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
