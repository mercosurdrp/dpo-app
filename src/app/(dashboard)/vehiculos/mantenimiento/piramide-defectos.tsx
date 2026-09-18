"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Info, TriangleAlert, X } from "lucide-react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MantenimientoRealizado } from "@/types/database"
import type { ChecklistItemNoOk } from "@/actions/mantenimiento-vehiculos"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import {
  FiltroPeriodo,
  dentroDe,
  etiquetaDe,
  hoyISO,
  periodoInicial,
  rangoDe,
  type PeriodoState,
} from "./_components/filtro-periodo"
import { MAX_SERIES, usePaletaViz } from "./_components/paleta-viz"
import {
  getCalidadDeteccion,
  type ExposicionUnidad,
} from "@/actions/checklist-deteccion"

interface Props {
  itemsNoOk: ChecklistItemNoOk[]
  mantenimientos: MantenimientoRealizado[]
}

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)
const fmtPct = (v: number) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v)}%`

// Niveles de la pirámide, de la PUNTA (lo más grave) hacia la BASE (lo más leve).
//
// La punta es el AUXILIO EN RUTA y no la avería grave: la falla que duele no es
// la que para la unidad en el taller, es la que la deja tirada afuera con el
// reparto arriba. Se marca con un tilde en la OT (`auxilio_ruta`).
const NIVELES = [
  {
    key: "auxilio",
    titulo: "Auxilio en ruta",
    detalle: "La unidad quedó parada fuera de la planta",
    color: "#7f1d1d",
  },
  {
    key: "averia",
    titulo: "Avería grave",
    // 🚨 Antes contaba las OT correctivas en estado "en_taller" y por eso daba
    // SIEMPRE 0: las órdenes se cargan ya cerradas, en "completado". La avería
    // grave es la que dejó la unidad parada, y eso lo dice el período de fuera
    // de servicio, no el estado de la orden.
    detalle: "Correctivo que dejó la unidad fuera de servicio",
    color: "#a63a2a",
  },
  {
    key: "correctivo",
    titulo: "Correctivo en taller",
    detalle: "Reparación no planificada",
    color: "#c47a2c",
  },
  {
    key: "critico",
    titulo: "Defecto crítico",
    detalle: "Ítem crítico no conforme en el checklist",
    color: "#b79020",
  },
  {
    key: "defectos",
    // No decir "Observaciones": las observaciones son el texto libre del
    // checklist (cientos por año) y este nivel son sólo los ítems no conformes
    // que no son críticos. Los críticos están en el nivel de arriba, así que la
    // base NUNCA es el total de defectos — de ahí venía la confusión.
    titulo: "Defectos de checklist",
    detalle: "Todos los ítems no conformes, críticos incluidos",
    color: "#5b7f9e",
  },
] as const

interface PorcionTorta {
  dominio: string
  leves: number
  criticos: number
  total: number
  pct: number
  esOtras: boolean
}

/** Un ítem del checklist que falló, con todas sus repeticiones juntas. */
interface ItemFallado {
  categoria: string
  item: string
  critico: boolean
  veces: number
  primera: string
  ultima: string
  comentarios: string[]
}

const fmtFecha = (iso: string) => iso.split("-").reverse().join("/")

/** Excel del período: las cuatro hojas que pide la auditoría del punto 1.3. */
function urlExport(r: { desde: string | null; hasta: string | null }): string {
  const p = new URLSearchParams()
  if (r.desde) p.set("desde", r.desde)
  if (r.hasta) p.set("hasta", r.hasta)
  const qs = p.toString()
  return `/api/vehiculos/checklist/export${qs ? `?${qs}` : ""}`
}

export function PiramideDefectos({ itemsNoOk, mantenimientos }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoState>(() => periodoInicial())
  const paleta = usePaletaViz()
  // Cuántos checklists tuvo cada unidad en el período: sin ese denominador, la
  // unidad que más se controla parece la peor.
  const [exposicion, setExposicion] = useState<Map<string, ExposicionUnidad>>(
    new Map()
  )

  // Años con datos, para no ofrecer años vacíos en el selector.
  const aniosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const i of itemsNoOk) if (i.fecha) set.add(i.fecha.slice(0, 4))
    for (const m of mantenimientos) if (m.fecha) set.add(m.fecha.slice(0, 4))
    set.add(hoyISO().slice(0, 4))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [itemsNoOk, mantenimientos])

  const rango = useMemo(() => rangoDe(periodo), [periodo])
  const etiquetaRango = useMemo(() => etiquetaDe(rango), [rango])

  useEffect(() => {
    let vigente = true
    getCalidadDeteccion(rango).then((res) => {
      if (!vigente || "error" in res) return
      setExposicion(new Map(res.data.porUnidad.map((u) => [u.dominio, u])))
    })
    return () => {
      vigente = false
    }
  }, [rango])

  const datos = useMemo(() => {
    const items = itemsNoOk.filter((i) => dentroDe(i.fecha, rango))
    const mantes = mantenimientos.filter((m) => dentroDe(m.fecha, rango))
    const correctivos = mantes.filter((m) => m.tipo === "correctivo")

    const conteo: Record<string, number> = {
      leve: items.filter((i) => !i.critico).length,
      critico: items.filter((i) => i.critico).length,
      correctivo: correctivos.length,
      averia: correctivos.filter((m) => !!m.fuera_servicio_desde).length,
      // La punta. Cuenta cualquier OT marcada, no sólo las correctivas: el
      // auxilio del AF469UR del 23/06 está cargado como preventivo.
      auxilio: mantes.filter((m) => m.auxilio_ruta).length,
    }
    // El cimiento: lo planificado, que es lo que evita que la pirámide crezca.
    const preventivos = mantes.filter((m) => m.tipo === "preventivo").length
    const proactivos = mantes.filter((m) => m.tipo === "proactivo").length
    const planificadas = preventivos + proactivos
    const plata = (f: (m: MantenimientoRealizado) => boolean) =>
      mantes.filter(f).reduce((a, m) => a + Number(m.costo ?? 0), 0)
    const cimiento = {
      preventivos,
      proactivos,
      planificadas,
      pctPlanificado: mantes.length > 0 ? (planificadas / mantes.length) * 100 : 0,
      costoPlanificado: plata((m) => m.tipo !== "correctivo"),
      costoCorrectivo: plata((m) => m.tipo === "correctivo"),
    }
    // ¿Corrió ya la migración del tilde? Sin columna, `auxilio_ruta` llega
    // undefined en todas las filas y un 0 mentiría: diría que nunca pasó,
    // cuando lo que pasa es que no se anota.
    const hayColumnaAuxilio = mantenimientos.some((m) => m.auxilio_ruta !== undefined)

    /**
     * Correctivos que llegaron al taller SIN AVISO: ninguna unidad los tenía
     * anunciados con un defecto crítico de checklist en los 30 días previos.
     *
     * 🚨 Antes acá se comparaba el total de correctivos contra el total de
     * críticos ("35 contra 31") y se lo cantaba como pirámide invertida. Estaba
     * MAL: son cosas distintas —una OT no es un defecto, una sola orden puede
     * resolver varios, y muchos correctivos (una ECU, un alternador) nunca
     * pasan por un ítem del checklist—. Comparar los totales hacía que el aviso
     * saltara siempre, incluso con el checklist funcionando bien.
     *
     * Esto sí es comparable: unidad por unidad y contra la fecha, cuántas
     * reparaciones no tuvieron ningún aviso previo. Es el número que se puede
     * bajar trabajando el checklist.
     */
    const criticosPorUnidad = new Map<string, string[]>()
    for (const i of items) {
      if (!i.critico) continue
      const arr = criticosPorUnidad.get(i.dominio) ?? []
      arr.push(i.fecha)
      criticosPorUnidad.set(i.dominio, arr)
    }
    const DIAS_AVISO = 30
    const diasEntre = (a: string, b: string) =>
      Math.round(
        (new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86_400_000
      )
    const sinAviso = correctivos.filter((m) => {
      const previos = criticosPorUnidad.get(m.dominio) ?? []
      return !previos.some((f) => {
        const d = diasEntre(f, m.fecha)
        return d >= 0 && d <= DIAS_AVISO
      })
    })
    const deteccion = {
      sinAviso: sinAviso.length,
      total: correctivos.length,
      dias: DIAS_AVISO,
      pct: correctivos.length > 0 ? (sinAviso.length / correctivos.length) * 100 : 0,
    }
    // La base de la pirámide son TODOS los defectos de checklist (leves +
    // críticos), no sólo los leves: es el mismo número que el KPI "Defectos" y
    // el que se cuenta en la planta. El nivel de arriba es el subconjunto
    // crítico. Antes la base mostraba sólo los leves y no cerraba con nada.
    conteo.defectos = conteo.leve + conteo.critico

    const porUnidad = new Map<string, { leves: number; criticos: number }>()
    for (const i of items) {
      const u = porUnidad.get(i.dominio) ?? { leves: 0, criticos: 0 }
      if (i.critico) u.criticos++
      else u.leves++
      porUnidad.set(i.dominio, u)
    }

    // Qué falló en cada unidad: mismo ítem repetido = una sola fila con sus
    // veces, el período en que viene apareciendo y lo que escribió el chofer.
    const detalle = new Map<string, ItemFallado[]>()
    const porItem = new Map<string, Map<string, ItemFallado>>()
    for (const i of items) {
      const items_ = porItem.get(i.dominio) ?? new Map<string, ItemFallado>()
      const clave = `${i.categoria}|${i.item}`
      const agg = items_.get(clave) ?? {
        categoria: i.categoria,
        item: i.item,
        critico: i.critico,
        veces: 0,
        primera: i.fecha,
        ultima: i.fecha,
        comentarios: [],
      }
      agg.veces++
      agg.critico = agg.critico || i.critico
      if (i.fecha < agg.primera) agg.primera = i.fecha
      if (i.fecha > agg.ultima) agg.ultima = i.fecha
      const com = i.comentario?.trim()
      if (com && !agg.comentarios.includes(com)) agg.comentarios.push(com)
      items_.set(clave, agg)
      porItem.set(i.dominio, items_)
    }
    for (const [dominio, m] of porItem) {
      detalle.set(
        dominio,
        Array.from(m.values()).sort(
          (a, b) =>
            b.veces - a.veces ||
            Number(b.critico) - Number(a.critico) ||
            a.item.localeCompare(b.item)
        )
      )
    }

    const ranking = Array.from(porUnidad.entries())
      .map(([dominio, v]) => {
        const total = v.leves + v.criticos
        const checks = exposicion.get(dominio)?.checklists ?? null
        return {
          dominio,
          ...v,
          total,
          principal: detalle.get(dominio)?.[0] ?? null,
          distintos: detalle.get(dominio)?.length ?? 0,
          checklists: checks,
          // Cada 10 revisiones, para poder comparar un autoelevador que se
          // chequea 40 veces contra un camión que se chequea 120.
          cada10: checks && checks > 0 ? (total / checks) * 10 : null,
        }
      })
      .sort((a, b) => b.total - a.total || a.dominio.localeCompare(b.dominio))

    const totalDefectos = conteo.leve + conteo.critico

    // Torta: una porción por unidad; a partir de la octava se agrupan para que
    // el gráfico siga siendo legible (el detalle completo está en la tabla).
    const pct = (n: number) => (totalDefectos > 0 ? (n * 100) / totalDefectos : 0)
    const torta: PorcionTorta[] = ranking
      .slice(0, MAX_SERIES)
      .map(({ dominio, leves, criticos, total }) => ({
        dominio,
        leves,
        criticos,
        total,
        pct: pct(total),
        esOtras: false,
      }))
    const resto = ranking.slice(MAX_SERIES)
    if (resto.length > 0) {
      const leves = resto.reduce((s, u) => s + u.leves, 0)
      const criticos = resto.reduce((s, u) => s + u.criticos, 0)
      const total = leves + criticos
      torta.push({
        dominio: `Otras ${resto.length} unidades`,
        leves,
        criticos,
        total,
        pct: pct(total),
        esOtras: true,
      })
    }

    const ratioFalla =
      conteo.correctivo > 0
        ? Math.round(totalDefectos / conteo.correctivo)
        : null

    return {
      conteo,
      ranking,
      torta,
      detalle,
      totalDefectos,
      ratioFalla,
      cimiento,
      hayColumnaAuxilio,
      deteccion,
      // Listas que abren las tarjetas de indicadores (antes eran sólo números).
      criticos: items
        .filter((i) => i.critico)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
      correctivos: [...correctivos].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    }
  }, [itemsNoOk, mantenimientos, rango, exposicion])

  /** Qué tarjeta de indicadores se abrió: cada una lista lo que la forma. */
  const [detalleKpi, setDetalleKpi] = useState<"criticos" | "correctivos" | "ratio" | null>(null)

  const verTablaUnidades = () =>
    document
      .getElementById("defectos-por-unidad")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })

  const colorPorcion = (p: PorcionTorta, i: number) =>
    p.esOtras ? paleta.otras : paleta.serie(i)

  // Unidad abierta en el panel de detalle (click en la torta o en la tabla).
  const [unidadSel, setUnidadSel] = useState<string | null>(null)
  const detalleSel = unidadSel ? (datos.detalle.get(unidadSel) ?? null) : null
  const resumenSel = unidadSel
    ? (datos.ranking.find((u) => u.dominio === unidadSel) ?? null)
    : null
  const verUnidad = (dominio: string) =>
    setUnidadSel((actual) => (actual === dominio ? null : dominio))

  // ===== Geometría de la pirámide =====
  // Pirámide de verdad (la punta termina en punta) a la izquierda, el nombre de
  // cada nivel a la derecha y el cimiento de trabajo planificado abajo.
  const NIV = NIVELES.length // 5
  const VIEW_W = 820
  const VIEW_H = 430
  const PYR_TOP = 12
  const PYR_BOT = 336
  const ALTO_NIV = (PYR_BOT - PYR_TOP) / NIV
  const PYR_CX = 210
  const PYR_HALF = 190
  /** Semiancho de la pirámide a una altura dada. */
  const semi = (y: number) => ((y - PYR_TOP) / (PYR_BOT - PYR_TOP)) * PYR_HALF

  return (
    <div className="space-y-4">
      {/* Encabezado + rango de fechas */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">
            Pirámide de defectos de flota
          </h2>
          <DpoSeccionCinta seccionId="piramide" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiltroPeriodo
            value={periodo}
            onChange={setPeriodo}
            anios={aniosDisponibles}
          />
          <a
            href={urlExport(rango)}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" aria-hidden /> Excel
          </a>
        </div>
      </div>

      {/* Pirámide */}
      <div className="rounded-lg border bg-card p-3 sm:p-4">
        <div className="mx-auto max-w-4xl">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Pirámide de fallas de flota"
          >
            {NIVELES.map((n, i) => {
              const yTop = PYR_TOP + i * ALTO_NIV
              const yBot = yTop + ALTO_NIV
              const sT = semi(yTop)
              const sB = semi(yBot)
              const points = `${PYR_CX - sT},${yTop} ${PYR_CX + sT},${yTop} ${PYR_CX + sB},${yBot} ${PYR_CX - sB},${yBot}`
              const sinDato = n.key === "auxilio" && !datos.hayColumnaAuxilio
              const count = datos.conteo[n.key] ?? 0
              const cy = yTop + ALTO_NIV / 2
              // "1 cada tanto" contra el nivel de abajo: es lo que hace hablar a
              // la pirámide (cuántos defectos hay por cada avería).
              const abajo = NIVELES[i + 1]
              const nAbajo = abajo ? (datos.conteo[abajo.key] ?? 0) : 0
              const razon =
                abajo && count > 0 && nAbajo > 0
                  ? `1 cada ${new Intl.NumberFormat("es-AR", {
                      maximumFractionDigits: 1,
                    }).format(nAbajo / count)}`
                  : null
              return (
                <g key={n.key}>
                  <polygon
                    points={points}
                    fill={n.color}
                    className="stroke-card"
                    strokeWidth={2}
                  />
                  <text
                    x={PYR_CX}
                    y={cy + (i === 0 ? 10 : 8)}
                    textAnchor="middle"
                    fontSize={i === 0 ? 15 : 24}
                    fontWeight={700}
                    fill="#FFFFFF"
                    style={{
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.30)",
                      strokeWidth: 2.5,
                    }}
                  >
                    {sinDato ? "s/d" : fmtNum(count)}
                  </text>
                  <line
                    x1={PYR_CX + sB - 2}
                    y1={yBot - 6}
                    x2={PYR_CX + PYR_HALF + 22}
                    y2={yBot - 6}
                    className="stroke-border"
                    strokeWidth={1.2}
                  />
                  <text
                    x={PYR_CX + PYR_HALF + 30}
                    y={yBot - 18}
                    fontSize={15}
                    fontWeight={600}
                    fill={n.color}
                  >
                    {n.titulo}
                  </text>
                  <text
                    x={PYR_CX + PYR_HALF + 30}
                    y={yBot - 2}
                    fontSize={11.5}
                    className="fill-muted-foreground"
                  >
                    {sinDato
                      ? "Sin registro todavía · se marca con el tilde en la OT"
                      : n.detalle}
                  </text>
                  {razon && (
                    <text
                      x={PYR_CX - sB - 8}
                      y={yBot + 4}
                      textAnchor="end"
                      fontSize={10.5}
                      className="fill-muted-foreground"
                    >
                      {razon}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Cimiento: el trabajo planificado sostiene la base */}
            <rect
              x={PYR_CX - PYR_HALF}
              y={PYR_BOT + 20}
              width={VIEW_W - (PYR_CX - PYR_HALF) - 12}
              height={58}
              rx={8}
              className="fill-emerald-500/10 stroke-emerald-600/40"
              strokeWidth={1.5}
            />
            <text
              x={PYR_CX - PYR_HALF + 16}
              y={PYR_BOT + 42}
              fontSize={11}
              fontWeight={600}
              letterSpacing="1.2"
              className="fill-emerald-700 dark:fill-emerald-400"
            >
              CIMIENTO · TRABAJO PLANIFICADO
            </text>
            <text
              x={PYR_CX - PYR_HALF + 16}
              y={PYR_BOT + 62}
              fontSize={12.5}
              className="fill-foreground"
            >
              {`${fmtNum(datos.cimiento.preventivos)} preventivos + ${fmtNum(
                datos.cimiento.proactivos
              )} proactivos · ${fmtPct(datos.cimiento.pctPlanificado)} de las OT del período`}
            </text>
          </svg>
        </div>
        {/* La cuenta escrita al pie: la base son sólo los leves, y sin esto el
            KPI "Defectos" (leves + críticos) parecía no cerrar con la pirámide. */}
        <p className="mt-1 text-[11px] text-muted-foreground">
          <strong className="font-semibold text-foreground">
            {fmtNum(datos.totalDefectos)} defectos de checklist
          </strong>{" "}
          en la base = {fmtNum(datos.conteo.leve)} leves + {fmtNum(datos.conteo.critico)}{" "}
          críticos. El nivel de arriba son esos mismos {fmtNum(datos.conteo.critico)} críticos.
        </p>
{/* Lo que la pirámide tiene que contestar: de las reparaciones que
            entraron, ¿cuántas se podrían haber visto venir? Se mide unidad por
            unidad y contra la fecha, no comparando totales. */}
        {datos.deteccion.sinAviso > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50/70 p-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>
              <strong className="font-semibold">
                {fmtNum(datos.deteccion.sinAviso)} de {fmtNum(datos.deteccion.total)} correctivos
                llegaron sin aviso
              </strong>{" "}
              ({fmtPct(datos.deteccion.pct)}): la unidad no tenía ningún defecto crítico marcado en
              el checklist en los {datos.deteccion.dias} días previos a la reparación. Es el número
              a bajar trabajando la base.
            </span>
          </p>
        )}
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] italic text-muted-foreground">
          <Info className="size-3" />
          De la base (todo lo que marca el checklist) a la punta (la unidad tirada en la
          ruta). Gestionando la base se previene la punta; el cimiento verde es lo que se
          hace para que no crezca.
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard
          label="Defectos"
          valor={fmtNum(datos.totalDefectos)}
          sub="Ítems no conformes de checklist · click para verlos por unidad"
          onClick={verTablaUnidades}
        />
        <KpiCard
          label="Críticos"
          valor={fmtNum(datos.conteo.critico)}
          estado={datos.conteo.critico > 0 ? "alerta" : "ok"}
          sub="Defectos críticos detectados · click para verlos"
          onClick={() => setDetalleKpi("criticos")}
        />
        <KpiCard
          label="Correctivos"
          valor={fmtNum(datos.conteo.correctivo)}
          estado={datos.conteo.correctivo > 0 ? "alerta" : "ok"}
          sub="Fallas que llegaron al taller · click para verlas"
          onClick={() => setDetalleKpi("correctivos")}
        />
        <KpiCard
          label="Defectos / correctivo"
          valor={datos.ratioFalla !== null ? `${datos.ratioFalla} : 1` : "—"}
          dpo="4.2"
          sub="Base detectada por cada falla en taller · click para ver la cuenta"
          onClick={() => setDetalleKpi("ratio")}
        />
      </div>

      {/* Torta: reparto de los defectos entre las unidades */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">
            Reparto de defectos por vehículo
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {fmtNum(datos.totalDefectos)}{" "}
            {datos.totalDefectos === 1 ? "defecto" : "defectos"} de checklist ·{" "}
            {etiquetaRango} · tocá una porción para ver qué falló
          </p>
        </CardHeader>
        <CardContent>
          {datos.torta.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sin defectos registrados en el período seleccionado.
            </p>
          ) : (
            <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datos.torta}
                    dataKey="total"
                    nameKey="dominio"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={100}
                    paddingAngle={1.5}
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(_, i) => {
                      const p = datos.torta[i]
                      if (p && !p.esOtras) verUnidad(p.dominio)
                    }}
                  >
                    {datos.torta.map((p, i) => (
                      <Cell
                        key={p.dominio}
                        fill={colorPorcion(p, i)}
                        className="stroke-card"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload as PorcionTorta
                      return (
                        <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                          <div className="mb-1 font-semibold text-foreground">
                            {p.dominio}
                          </div>
                          <div className="space-y-0.5 text-muted-foreground">
                            <div>
                              Defectos:{" "}
                              <span className="font-medium tabular-nums text-foreground">
                                {fmtNum(p.total)}
                              </span>{" "}
                              ({fmtPct(p.pct)})
                            </div>
                            <div>
                              Leves:{" "}
                              <span className="tabular-nums text-foreground">
                                {fmtNum(p.leves)}
                              </span>
                            </div>
                            <div>
                              Críticos:{" "}
                              <span className="tabular-nums text-foreground">
                                {fmtNum(p.criticos)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Leyenda: la identidad nunca queda librada sólo al color */}
              <ul className="space-y-1.5 text-xs">
                {datos.torta.map((p, i) => {
                  const Fila = p.esOtras ? "div" : "button"
                  return (
                    <li key={p.dominio}>
                      <Fila
                        type={p.esOtras ? undefined : "button"}
                        onClick={
                          p.esOtras ? undefined : () => verUnidad(p.dominio)
                        }
                        aria-pressed={p.esOtras ? undefined : unidadSel === p.dominio}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left",
                          !p.esOtras && "hover:bg-muted",
                          unidadSel === p.dominio && "bg-muted"
                        )}
                      >
                        <span
                          className="size-2.5 flex-none rounded-sm"
                          style={{ backgroundColor: colorPorcion(p, i) }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate text-foreground">
                          {p.dominio}
                          {p.criticos > 0 && (
                            <TriangleAlert className="ml-1 inline size-3 text-amber-600 dark:text-amber-400" />
                          )}
                        </span>
                        <span className="tabular-nums font-medium text-foreground">
                          {fmtNum(p.total)}
                        </span>
                        <span className="w-12 text-right tabular-nums text-muted-foreground">
                          {fmtPct(p.pct)}
                        </span>
                      </Fila>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Detalle de la unidad elegida: qué falló, cuántas veces y desde cuándo */}
          {detalleSel && resumenSel && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {resumenSel.dominio}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtNum(resumenSel.total)}{" "}
                    {resumenSel.total === 1 ? "defecto" : "defectos"} ·{" "}
                    {fmtNum(resumenSel.distintos)}{" "}
                    {resumenSel.distintos === 1
                      ? "ítem distinto"
                      : "ítems distintos"}
                    {resumenSel.checklists != null && (
                      <>
                        {" · "}
                        {new Intl.NumberFormat("es-AR", {
                          maximumFractionDigits: 1,
                        }).format(resumenSel.cada10 ?? 0)}{" "}
                        cada 10 checklists
                      </>
                    )}
                    {resumenSel.principal && resumenSel.total > 1 && (
                      <>
                        {" · "}
                        {fmtNum(resumenSel.principal.veces)} de{" "}
                        {fmtNum(resumenSel.total)} son{" "}
                        <span className="font-medium text-foreground">
                          {resumenSel.principal.item}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUnidadSel(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Cerrar el detalle"
                >
                  <X className="size-4" />
                </button>
              </div>

              <ul className="mt-2 space-y-2">
                {detalleSel.map((d) => (
                  <li
                    key={`${d.categoria}|${d.item}`}
                    className="rounded-md border bg-card p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {d.item}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {d.categoria}
                      </Badge>
                      {d.critico && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          crítico
                        </Badge>
                      )}
                      <span className="ml-auto text-xs font-semibold tabular-nums text-foreground">
                        {fmtNum(d.veces)}{" "}
                        <span className="font-normal text-muted-foreground">
                          {d.veces === 1 ? "vez" : "veces"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {d.primera === d.ultima
                        ? fmtFecha(d.primera)
                        : `${fmtFecha(d.primera)} al ${fmtFecha(d.ultima)}`}
                      {d.comentarios.length > 0 && (
                        <>
                          {" · "}
                          <span className="italic">
                            «{d.comentarios.slice(0, 3).join("» · «")}»
                          </span>
                          {d.comentarios.length > 3 &&
                            ` +${d.comentarios.length - 3}`}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking por unidad */}
      <Card id="defectos-por-unidad">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">
            Defectos por unidad
          </CardTitle>
        </CardHeader>
        <CardContent>
          {datos.ranking.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">
              Sin defectos registrados en checklists para el período
              seleccionado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Defecto principal</TableHead>
                  <TableHead className="text-right">Leves</TableHead>
                  <TableHead className="text-right">Críticos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                  <TableHead className="text-right">Cada 10 checks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.ranking.map((u) => (
                  <TableRow
                    key={u.dominio}
                    onClick={() => verUnidad(u.dominio)}
                    className={cn(
                      "cursor-pointer",
                      unidadSel === u.dominio && "bg-muted"
                    )}
                  >
                    <TableCell className="font-medium">
                      {u.dominio}
                      {u.criticos > 0 && (
                        <TriangleAlert className="ml-1 inline size-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[22rem] text-xs text-muted-foreground">
                      {u.principal ? (
                        <span className="line-clamp-2">
                          {u.principal.item}
                          <span className="ml-1 tabular-nums">
                            ({fmtNum(u.principal.veces)} de {fmtNum(u.total)})
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(u.leves)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.criticos > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          {fmtNum(u.criticos)}
                        </Badge>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtNum(u.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {datos.totalDefectos > 0
                        ? fmtPct((u.total * 100) / datos.totalDefectos)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.cada10 == null ? (
                        "—"
                      ) : (
                        <>
                          <span className="font-semibold text-foreground">
                            {new Intl.NumberFormat("es-AR", {
                              maximumFractionDigits: 1,
                            }).format(u.cada10)}
                          </span>
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            ({fmtNum(u.checklists ?? 0)} checks)
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {detalleKpi && (
        <Dialog open onOpenChange={(o: boolean) => !o && setDetalleKpi(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {detalleKpi === "criticos"
                  ? `Defectos críticos (${datos.criticos.length})`
                  : detalleKpi === "correctivos"
                    ? `Correctivos en taller (${datos.correctivos.length})`
                    : "Defectos por cada correctivo"}
              </DialogTitle>
              <DialogDescription>
                {detalleKpi === "criticos"
                  ? `Ítems marcados como críticos en los checklists · ${etiquetaRango}`
                  : detalleKpi === "correctivos"
                    ? `Órdenes de trabajo correctivas del período · ${etiquetaRango}`
                    : `${fmtNum(datos.totalDefectos)} defectos de checklist ÷ ${fmtNum(
                        datos.conteo.correctivo
                      )} correctivos = ${
                        datos.ratioFalla !== null ? `${datos.ratioFalla} : 1` : "sin correctivos"
                      }. Cuanto más alto, más se detecta abajo antes de que llegue al taller. Abajo, los correctivos que forman el divisor.`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto">
              {detalleKpi === "criticos" ? (
                datos.criticos.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Sin defectos críticos en el período.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Unidad</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Ítem</TableHead>
                        <TableHead>Comentario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.criticos.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="whitespace-nowrap">{fmtFecha(i.fecha)}</TableCell>
                          <TableCell className="font-medium">{i.dominio}</TableCell>
                          <TableCell className="text-muted-foreground">{i.categoria}</TableCell>
                          <TableCell>{i.item}</TableCell>
                          <TableCell className="max-w-72 text-muted-foreground">
                            {i.comentario || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : datos.correctivos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin correctivos en el período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>OT</TableHead>
                      <TableHead>Qué se hizo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datos.correctivos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{fmtFecha(m.fecha)}</TableCell>
                        <TableCell className="font-medium">{m.dominio}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.numero_ot || "—"}
                        </TableCell>
                        <TableCell className="max-w-80 text-muted-foreground">
                          {m.tareas?.map((t) => t.descripcion).filter(Boolean).join(", ") ||
                            m.observaciones ||
                            "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.estado === "en_taller" ? "En taller" : m.estado}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
