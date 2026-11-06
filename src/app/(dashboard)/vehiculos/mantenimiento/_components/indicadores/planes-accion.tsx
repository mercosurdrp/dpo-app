"use client"

// Planes de acción de flota como lista de trabajo, no como tabla de archivo:
// primero lo que falta (meses fuera de meta sin plan), después los planes con
// acciones vencidas, los que están en curso, y los cerrados plegados.

import { useState } from "react"
import { ChevronDown, ClipboardList, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { FlotaPlanConItems } from "@/actions/flota-indicadores"
import { cn } from "@/lib/utils"
import { cumpleMeta } from "./estado-kpi"
import { fmtDiaMes, fmtMesCorto, fmtMesLargo, pad } from "./formato"
import { KPI_DEF_BY } from "./kpi-defs"
import type { MesSinPlan } from "./resumen-salud"

export function EstadoPlanBadge({ estado }: { estado: FlotaPlanConItems["estado"] }) {
  const map: Record<string, string> = {
    abierto: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    en_progreso: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    cerrado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  }
  const label: Record<string, string> = {
    abierto: "Abierto",
    en_progreso: "En progreso",
    cerrado: "Cerrado",
  }
  return <Badge className={cn("font-medium", map[estado])}>{label[estado]}</Badge>
}

function vencidasDe(p: FlotaPlanConItems, hoy: string) {
  return p.items.filter(
    (i) => i.estado !== "completado" && i.fecha_compromiso.slice(0, 10) < hoy
  ).length
}

function FilaPlan({
  plan,
  hoy,
  comparador,
  onVer,
}: {
  plan: FlotaPlanConItems
  hoy: string
  /** Sentido de la meta del PI (el plan guarda el número, no el sentido). */
  comparador: ">=" | "<="
  onVer: (p: FlotaPlanConItems) => void
}) {
  const def = KPI_DEF_BY.get(plan.kpi)
  const total = plan.items.length
  const hechas = plan.items.filter((i) => i.estado === "completado").length
  const vencidas = plan.estado === "cerrado" ? 0 : vencidasDe(plan, hoy)
  const proxima = plan.items
    .filter((i) => i.estado !== "completado")
    .sort((a, b) => a.fecha_compromiso.localeCompare(b.fecha_compromiso))[0]
  const valor = plan.valor_mes != null ? Number(plan.valor_mes) : null
  const meta = plan.meta_mes != null ? Number(plan.meta_mes) : null
  const fuera =
    valor != null && meta != null
      ? cumpleMeta(valor, { kpi: plan.kpi, meta, comparador, unidad: "", justificacion: null }) === false
      : false

  return (
    <li>
      <button
        type="button"
        onClick={() => onVer(plan)}
        className="grid w-full gap-x-4 gap-y-1.5 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {def?.label ?? plan.kpi}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {def?.dpo ? `DPO ${def.dpo} · ` : ""}
              {fmtMesLargo(`${plan.year}-${pad(plan.mes)}`)}
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium">Causa:</span> {plan.causa_raiz}
          </p>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs tabular-nums text-muted-foreground">
            <span className={cn("font-semibold", fuera ? "text-red-600 dark:text-red-400" : "text-foreground")}>
              {valor != null && def ? def.fmt(valor) : "—"}
            </span>
            {" → meta "}
            {meta != null && def ? def.fmt(meta) : "—"}
          </p>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: total > 0 ? `${(hechas / total) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {hechas}/{total}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {vencidas > 0 ? (
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
              {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}
            </span>
          ) : plan.estado !== "cerrado" && total > 0 && hechas === total ? (
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              listo para cerrar
            </span>
          ) : proxima && plan.estado !== "cerrado" ? (
            <span className="text-xs text-muted-foreground">
              próx. {fmtDiaMes(proxima.fecha_compromiso)} · {proxima.responsable}
            </span>
          ) : null}
          <EstadoPlanBadge estado={plan.estado} />
        </div>
      </button>
    </li>
  )
}

export function PlanesAccion({
  planes,
  totalPlanes,
  filtrando,
  onVerTodos,
  faltan,
  hoy,
  comparadorDe,
  puedeEditar,
  onVerPlan,
  onCrearPlan,
}: {
  planes: FlotaPlanConItems[]
  totalPlanes: number
  /** Los filtros de arriba están recortando la lista. */
  filtrando: boolean
  onVerTodos: () => void
  faltan: MesSinPlan[]
  hoy: string
  comparadorDe: (kpi: string) => ">=" | "<="
  puedeEditar: boolean
  onVerPlan: (p: FlotaPlanConItems) => void
  onCrearPlan: (f: MesSinPlan) => void
}) {
  const [verCerrados, setVerCerrados] = useState(false)
  const faltanPorKpi = [
    ...faltan.reduce((m, f) => {
      const arr = m.get(f.vista.def.kpi) ?? []
      arr.push(f)
      return m.set(f.vista.def.kpi, arr)
    }, new Map<string, MesSinPlan[]>()),
  ]
  const porFecha = (a: FlotaPlanConItems, b: FlotaPlanConItems) =>
    (b.year - a.year) * 100 + (b.mes - a.mes)
  const vivos = planes.filter((p) => p.estado !== "cerrado").sort(porFecha)
  const atencion = vivos.filter((p) => vencidasDe(p, hoy) > 0)
  const enCurso = vivos.filter((p) => vencidasDe(p, hoy) === 0)
  const cerrados = planes.filter((p) => p.estado === "cerrado").sort(porFecha)

  const grupo = (titulo: string, items: FlotaPlanConItems[]) =>
    items.length === 0 ? null : (
      <div>
        <h3 className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {titulo}
        </h3>
        <ul className="divide-y divide-border">
          {items.map((p) => (
            <FilaPlan key={p.id} plan={p} hoy={hoy} comparador={comparadorDe(p.kpi)} onVer={onVerPlan} />
          ))}
        </ul>
      </div>
    )

  return (
    <section
      id="planes-accion"
      aria-labelledby="planes-t"
      className="scroll-mt-28 rounded-2xl border border-border bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 id="planes-t" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
          Planes de acción de flota
        </h2>
        {filtrando && (
          <p className="text-xs text-muted-foreground">
            Mostrando {planes.length} de {totalPlanes} ·{" "}
            <button type="button" onClick={onVerTodos} className="font-medium text-primary hover:underline">
              Ver todos
            </button>
          </p>
        )}
      </header>

      <div className="space-y-5 px-2 py-4">
        {faltan.length > 0 && (
          <div className="px-3">
            <h3 className="pb-2 text-[11px] font-semibold tracking-wider text-amber-800 uppercase dark:text-amber-300">
              Meses fuera de meta sin plan ({faltan.length})
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5">
              {faltanPorKpi.map(([kpi, fs]) => (
                <li key={kpi} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                    {fs[0].vista.def.label}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {fs.map((f) =>
                      puedeEditar ? (
                        <button
                          key={f.ym}
                          type="button"
                          onClick={() => onCrearPlan(f)}
                          aria-label={`Crear plan de ${f.vista.def.label} para ${fmtMesLargo(f.ym)}`}
                          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-amber-500/40 bg-background px-3 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/20"
                        >
                          <Plus className="size-3.5" aria-hidden />
                          {fmtMesCorto(f.ym)}
                        </button>
                      ) : (
                        <span key={f.ym} className="text-sm text-amber-900 dark:text-amber-200">
                          {fmtMesCorto(f.ym)}
                        </span>
                      )
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {planes.length === 0 ? (
          <p className="px-3 text-sm text-muted-foreground">
            {totalPlanes === 0
              ? "Sin planes cargados. Se crean desde cada indicador cuando un mes queda fuera de meta."
              : "Ningún plan de los indicadores filtrados."}
          </p>
        ) : (
          <>
            {grupo("Con acciones vencidas", atencion)}
            {grupo("En curso", enCurso)}
            {cerrados.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setVerCerrados((v) => !v)}
                  aria-expanded={verCerrados}
                  className="flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn("size-4 transition-transform", verCerrados && "rotate-180")}
                    aria-hidden
                  />
                  {verCerrados ? "Ocultar" : "Ver"} {cerrados.length}{" "}
                  {cerrados.length === 1 ? "plan cerrado" : "planes cerrados"}
                </button>
                {verCerrados && (
                  <ul className="divide-y divide-border">
                    {cerrados.map((p) => (
                      <FilaPlan key={p.id} plan={p} hoy={hoy} comparador={comparadorDe(p.kpi)} onVer={onVerPlan} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
