"use client"

/**
 * Sección de Períodos Críticos de la reunión Ventas-Logística (R3.4.2).
 *
 * El manual DPO 2026 (3.4) pide que el plan de períodos críticos se revise
 * MENSUALMENTE en la reunión de ventas y logística. Esta sección aparece sólo
 * en la reunión del último martes del mes y deja cuatro cosas registradas:
 *
 *   1. El calendario del MES SIGUIENTE, día por día, con lo observado en la
 *      misma fecha del año anterior (volumen contra la capacidad, clientes,
 *      rechazo, ausentismo) y los feriados: cómo afrontamos el mes que viene.
 *   2. Los períodos de foco definidos por el equipo (el largo plazo).
 *   3. Una foto como evidencia de que se revisaron.
 *   4. Un action log con los compromisos que surgieron.
 *
 * La foto y el action log reusan `SeccionGaleriaFotos`, el mismo componente que
 * ya usan RMD y NPS en esta reunión: para el equipo es un bloque más de los que
 * ya conoce, y no hay tablas nuevas.
 */

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CalendarRange, Check, Save, Star } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SeccionGaleriaFotos } from "./seccion-galeria-fotos"
import type { ReunionActividadConResponsable } from "@/types/database"
import type {
  DiaMesSiguiente,
  DiaObservado,
  Intensidad,
} from "@/app/api/planeamiento/periodos-criticos/mes-siguiente/route"

/** Mismo shape que espera SeccionGaleriaFotos para el selector de responsable. */
interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

/** Slug de `reuniones_actividades.seccion` y `reunion_seccion_fotos.seccion`. */
export const SECCION_PERIODOS_CRITICOS = "periodos_criticos"

type PeriodoFoco = {
  id: string
  anio: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  prioridad: string | null
  foco: string | null
}

type MesSiguiente = {
  anio: number
  mes: number
  anio_base: number
  capacidad: number | null
  dias: DiaMesSiguiente[]
  criticos_base: { fecha: string; dia_semana: string; base: DiaObservado }[]
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const NOMBRES_DOW = ["D", "L", "M", "M", "J", "V", "S"]

// Misma escala y colores que el calendario de Planeamiento → Períodos críticos.
const INTENSIDAD_LABEL: Record<Intensidad, string> = {
  CRITICO_ALTO: "CRÍTICO +",
  CRITICO: "CRÍTICO",
  ATENCION: "ATENCIÓN",
  NORMAL: "NORMAL",
}
const INTENSIDAD_BG: Record<Intensidad, string> = {
  CRITICO_ALTO: "bg-red-700 text-white font-bold",
  CRITICO: "bg-red-500 text-white font-semibold",
  ATENCION: "bg-amber-300 text-amber-950 font-medium",
  NORMAL: "bg-emerald-500/80 text-white",
}

const fmtHL = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
const fmtPct = (n: number) =>
  (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%"
const fmtDiaMes = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })

function formatearRango(inicio: string, fin: string): string {
  return inicio === fin ? fmtDiaMes(inicio) : `${fmtDiaMes(inicio)} al ${fmtDiaMes(fin)}`
}

/** Días que faltan para que arranque el período (negativo = ya empezó). */
function diasHasta(inicio: string, hoy: string): number {
  const ms =
    new Date(inicio + "T12:00:00").getTime() -
    new Date(hoy + "T12:00:00").getTime()
  return Math.round(ms / 86_400_000)
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendario del mes siguiente
// ─────────────────────────────────────────────────────────────────────────────

function CalendarioMesSiguiente({ fecha }: { fecha: string }) {
  const [data, setData] = useState<MesSiguiente | null | undefined>(undefined)

  useEffect(() => {
    let vivo = true
    fetch(`/api/planeamiento/periodos-criticos/mes-siguiente?fecha=${fecha}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: MesSiguiente) => vivo && setData(j))
      .catch(() => vivo && setData(null))
    return () => {
      vivo = false
    }
  }, [fecha])

  if (data === undefined) {
    return <p className="text-sm text-muted-foreground">Cargando el mes siguiente…</p>
  }
  if (data === null || data.dias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No se pudo armar el calendario del mes siguiente. Se puede ver en Planeamiento →
        Períodos críticos.
      </p>
    )
  }

  const nombreMes = MESES[data.mes - 1]
  const offset = data.dias[0].dow
  const celdas: (DiaMesSiguiente | null)[] = Array(offset).fill(null).concat(data.dias)
  while (celdas.length % 7 !== 0) celdas.push(null)
  const feriados = data.dias.filter((d) => d.es_feriado)
  const yaHayReal = data.dias.some((d) => d.real)

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold capitalize text-slate-800">
            {nombreMes} {data.anio} — cómo viene el mes
          </p>
          <p className="text-[11px] text-slate-500">
            Cada día muestra lo observado en la misma fecha de {data.anio_base}
            {data.capacidad != null && (
              <> contra la capacidad de distribución de {fmtHL(data.capacidad)} HL</>
            )}
            . El día de la semana puede no coincidir.
            {yaHayReal && " Los días que ya pasaron muestran el dato real."}
          </p>
        </div>
        <Badge
          className={
            data.criticos_base.length > 0
              ? "bg-red-600 text-[10px]"
              : "bg-emerald-600 text-[10px]"
          }
        >
          {data.criticos_base.length} día{data.criticos_base.length === 1 ? "" : "s"} sobre la
          capacidad en {nombreMes} {data.anio_base}
        </Badge>
      </div>

      <TooltipProvider delay={150}>
        <div className="grid grid-cols-7 gap-1">
          {NOMBRES_DOW.map((d, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-semibold uppercase text-slate-500"
            >
              {d}
            </div>
          ))}
          {celdas.map((d, i) => (
            <CeldaDia key={i} d={d} />
          ))}
        </div>
      </TooltipProvider>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
        <Leyenda color="bg-red-700" label="Crítico + contexto" />
        <Leyenda color="bg-red-500" label="Crítico (supera la capacidad)" />
        <Leyenda color="bg-amber-300" label="Atención, sin volumen" />
        <Leyenda color="bg-emerald-500/80" label="Normal" />
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm ring-2 ring-yellow-400" /> Feriado
        </span>
      </div>

      {(data.criticos_base.length > 0 || feriados.length > 0) && (
        <div className="mt-2 grid gap-2 border-t pt-2 text-xs md:grid-cols-2">
          <div>
            <p className="mb-0.5 font-semibold text-slate-700">
              Días a anticipar (según {data.anio_base})
            </p>
            {data.criticos_base.length === 0 ? (
              <p className="text-slate-500">Ningún día superó la capacidad.</p>
            ) : (
              <ul className="space-y-0.5">
                {data.criticos_base.map((c) => (
                  <li key={c.fecha} className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{fmtDiaMes(c.fecha)}</span>
                    <span className="text-slate-600">
                      {fmtHL(c.base.hl)} HL · {fmtPct(c.base.pct_capacidad)} de la capacidad
                    </span>
                    {c.base.intensidad === "CRITICO_ALTO" && (
                      <span className="rounded bg-red-700 px-1 text-[9px] font-bold text-white">
                        + contexto
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-0.5 font-semibold text-slate-700">Feriados del mes</p>
            {feriados.length === 0 ? (
              <p className="text-slate-500">Sin feriados.</p>
            ) : (
              <ul className="space-y-0.5">
                {feriados.map((f) => (
                  <li key={f.fecha} className="flex items-center gap-1.5">
                    <Star className="size-3 text-yellow-600" />
                    <span className="font-medium text-slate-800">{fmtDiaMes(f.fecha)}</span>
                    <span className="text-slate-600">
                      {f.dia_semana} · {f.nombre_feriado}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Leyenda({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block size-3 rounded-sm ${color}`} /> {label}
    </span>
  )
}

function CeldaDia({ d }: { d: DiaMesSiguiente | null }) {
  if (!d) return <div className="aspect-square rounded" />

  // Si el día ya pasó se muestra lo real; si no, lo observado el año anterior.
  const v = d.real ?? d.base
  const esReal = d.real !== null
  const sinDato = !v || v.hl === 0 || d.dow === 0
  const cls = sinDato
    ? "bg-slate-100 text-slate-400"
    : INTENSIDAD_BG[v.intensidad]

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={`relative flex aspect-square cursor-default flex-col items-center justify-center rounded leading-none ${cls} ${
              d.es_feriado ? "ring-2 ring-yellow-400" : ""
            }`}
          >
            <span className="text-[13px] font-semibold">{d.dia}</span>
            {!sinDato && (
              <span className="mt-0.5 text-[8px] opacity-80">{fmtHL(v.hl)}</span>
            )}
          </div>
        }
      />
      <TooltipContent side="top" className="text-xs">
        <div className="min-w-[210px] space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">
              {d.dia_semana} {fmtDiaMes(d.fecha)}
            </span>
            {v && !sinDato && v.intensidad !== "NORMAL" && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${INTENSIDAD_BG[v.intensidad]}`}
              >
                {INTENSIDAD_LABEL[v.intensidad]}
              </span>
            )}
          </div>
          {d.es_feriado && (
            <div className="font-medium text-yellow-700">★ {d.nombre_feriado}</div>
          )}
          {v && !sinDato ? (
            <>
              <div className="text-[10px] text-slate-500">
                {esReal ? "Dato real del día" : `Observado el ${v.dia_semana} ${fmtDiaMes(v.fecha)} de ${v.fecha.slice(0, 4)}`}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-slate-200 pt-1">
                <span>HL:</span>
                <span className="text-right">
                  <b>{fmtHL(v.hl)}</b> · {fmtPct(v.pct_capacidad)} de la capacidad
                </span>
                <span>Clientes:</span>
                <span className="text-right"><b>{v.clientes_dia}</b></span>
                <span>Rechazo:</span>
                <span className="text-right"><b>{fmtPct(v.pct_rechazo)}</b></span>
                <span>Ausentismo:</span>
                <span className="text-right"><b>{fmtPct(v.pct_ausentismo)}</b></span>
              </div>
            </>
          ) : (
            <div className="text-[10px] text-slate-500">
              {d.dow === 0 ? "Domingo: sin distribución." : "Sin dato del año anterior."}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección
// ─────────────────────────────────────────────────────────────────────────────

export function SeccionPeriodosCriticos({
  reunionId,
  fecha,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  reunionId: string
  /** Fecha de la reunión (ISO). De acá salen el año y el mes de la revisión. */
  fecha: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [periodos, setPeriodos] = useState<PeriodoFoco[] | null>(null)
  const [hoy, setHoy] = useState<string>("")
  const [conclusiones, setConclusiones] = useState("")
  const [registrada, setRegistrada] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const anio = Number(fecha.slice(0, 4))
  const mes = Number(fecha.slice(5, 7))

  useEffect(() => {
    let vivo = true
    fetch("/api/planeamiento/periodos-criticos/proximos")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return
        setPeriodos(j.periodos ?? [])
        setHoy(j.hoy ?? "")
      })
      // Si falla, la galería y el action log se siguen usando: la revisión no
      // depende de poder listar los períodos.
      .catch(() => vivo && setPeriodos([]))
    return () => {
      vivo = false
    }
  }, [])

  // Revisión mensual del mes de esta reunión. Se edita acá y no sólo en el
  // módulo de Planeamiento: quien está en la reunión no debería tener que ir a
  // otra pantalla para dejar registrada la conclusión (R3.4.2).
  const cargarRevision = useCallback(() => {
    fetch(`/api/planeamiento/periodos-criticos/revision-mensual?anio=${anio}`)
      .then((r) => r.json())
      .then((j) => {
        const mia = (j.revisiones ?? []).find(
          (r: { mes: number }) => r.mes === mes,
        )
        if (mia) {
          setConclusiones(mia.conclusiones ?? "")
          setRegistrada(mia.estado === "realizada")
        }
      })
      .catch(() => {
        /* la sección sigue usable sin la revisión */
      })
  }, [anio, mes])

  useEffect(() => {
    cargarRevision()
  }, [cargarRevision])

  async function guardarRevision() {
    setGuardando(true)
    try {
      const res = await fetch(
        "/api/planeamiento/periodos-criticos/revision-mensual",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anio,
            mes,
            reunion_id: reunionId,
            conclusiones,
            periodos_revisados: (periodos ?? []).map((p) => ({
              nombre: p.nombre,
              fecha_inicio: p.fecha_inicio,
              fecha_fin: p.fecha_fin,
              prioridad: p.prioridad,
            })),
          }),
        },
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success("Revisión mensual registrada")
      cargarRevision()
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo guardar la revisión",
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-bold text-amber-900">
            <CalendarRange className="size-5" />
            Períodos críticos — revisión mensual
            {registrada && (
              <Badge className="gap-1 bg-emerald-600 text-[10px]">
                <Check className="size-3" /> Registrada
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-amber-800">
            Revisión mensual del plan de períodos críticos (DPO 3.4). Repasar cómo
            viene el mes siguiente y el estado de cada período de foco, dejar la
            foto como registro y cargar los compromisos en el action log.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 1. El mes que viene, día por día. */}
          <CalendarioMesSiguiente fecha={fecha} />

          {/* 2. Los períodos de foco definidos por el equipo (largo plazo). */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Períodos de foco definidos
            </p>
            {periodos === null ? (
              <p className="text-sm text-muted-foreground">Cargando períodos…</p>
            ) : periodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay períodos críticos vigentes cargados. Se definen en
                Planeamiento → Períodos críticos.
              </p>
            ) : (
              periodos.map((p) => {
                const dias = hoy ? diasHasta(p.fecha_inicio, hoy) : null
                const proximo = dias !== null && dias >= 0 && dias <= 30
                return (
                  <div
                    key={p.id}
                    className="rounded-md border bg-white p-2.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {p.nombre}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {formatearRango(p.fecha_inicio, p.fecha_fin)}
                      </Badge>
                      {p.prioridad && (
                        <Badge className="bg-amber-600 text-[10px]">
                          Prioridad {p.prioridad}
                        </Badge>
                      )}
                      {proximo && (
                        <Badge className="bg-red-600 text-[10px]">
                          {dias === 0 ? "Es hoy" : `En ${dias} días`}
                        </Badge>
                      )}
                    </div>
                    {p.foco && (
                      <p className="mt-1 text-xs text-slate-600">{p.foco}</p>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Conclusión de la revisión del mes. Es lo que se audita en R3.4.2,
              así que se carga acá mismo y no en otra pantalla. */}
          <div className="space-y-1.5 border-t pt-3">
            <label className="text-xs font-medium text-slate-700">
              Conclusiones de la revisión de{" "}
              {new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", {
                month: "long",
                year: "numeric",
              })}
            </label>
            <Textarea
              value={conclusiones}
              onChange={(e) => setConclusiones(e.target.value)}
              disabled={!puedeEditar}
              rows={4}
              className="bg-white text-sm"
              placeholder="Qué se revisó del mes siguiente y de los períodos de foco, y qué se definió. Si finalizó un período, actualizar también el análisis FODA."
            />
            {puedeEditar && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => void guardarRevision()}
                  disabled={guardando || !conclusiones.trim()}
                >
                  <Save className="mr-1 size-4" />
                  {guardando ? "Guardando…" : "Registrar revisión del mes"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <SeccionGaleriaFotos
        reunionId={reunionId}
        seccion={SECCION_PERIODOS_CRITICOS}
        titulo="Períodos críticos — evidencia y compromisos"
        icono={CalendarRange}
        tema="rose"
        emptyHint="Sin fotos cargadas. Subí la captura del calendario de períodos críticos para dejar registro de la revisión del mes."
        actividades={actividades}
        responsables={responsables}
        puedeEditar={puedeEditar}
        onActividadesChanged={onActividadesChanged}
        verMasHref="/planeamiento/periodos-criticos"
        verMasLabel="Ver calendario completo"
      />
    </div>
  )
}

