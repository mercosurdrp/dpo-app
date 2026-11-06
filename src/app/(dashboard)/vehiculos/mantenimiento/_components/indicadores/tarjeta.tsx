"use client"

// Tarjeta de un PI en dos tamaños: héroe (tier 1, con regla de meta y tendencia
// grande) y compacta (el resto). Mismo orden de lectura en las dos:
//   1. qué es y qué punto DPO responde, y su estado en palabras;
//   2. el número del mes, su muestra y contra qué mes se compara;
//   3. dónde cae respecto de la meta y cómo viene;
//   4. meta, cómo se calcula, y a dónde ir a auditarlo.

import { memo } from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react"
import type { FlotaPlanConItems } from "@/actions/flota-indicadores"
import type { CalcDisponibilidadMes } from "@/lib/vehiculos/disponibilidad-flota"
import { cn } from "@/lib/utils"
import { DpoPuntoBadge } from "../dpo-badge"
import { MOTIVO_LABEL } from "./estado-kpi"
import { fmtMesCorto, fmtMesNombre } from "./formato"
import { AvanceMes, CausasParada, MesesStrip, MetaRegla, TendenciaMeses } from "./graficos"
import { DESTINO_KPI } from "./kpi-defs"
import { InfoKpiPopover, MetaPopover } from "./popovers"
import { ESTADO_UI, EstadoPill } from "./semaforo"
import type { KpiVista } from "./vistas"

export interface AccionesTarjeta {
  puedeEditar: boolean
  onMetaSaved: () => void
  onCrearPlan: (v: KpiVista, ym: string, valor: number | null) => void
  onVerPlan: (p: FlotaPlanConItems) => void
  /** Botón de detalle; `undefined` = no hay a dónde ir y no se muestra. */
  onAbrir?: () => void
}

function KpiTarjetaBase({
  vista,
  heroe,
  hoy,
  mesActual,
  calcDisp,
  resaltada,
  acciones,
}: {
  vista: KpiVista
  heroe: boolean
  hoy: string
  mesActual: string
  calcDisp?: CalcDisponibilidadMes
  resaltada?: boolean
  acciones: AccionesTarjeta
}) {
  const { def, punto, meta } = vista
  const estado = punto.estado
  const ui = ESTADO_UI[estado]

  const destino = DESTINO_KPI[def.kpi]
  // El botón avisa cuando el mes no tiene número por una tarea sin hacer.
  const sinDato = punto.valor == null && destino?.labelSinDato != null
  const textoBoton = sinDato ? destino!.labelSinDato : destino?.label

  const forma = def.forma
  const conRegla = forma === "estado" || forma === "tasa" || forma === "sinSerie"
  const mesTxt = !def.conSerie
    ? "foto actual · no mensual"
    : `${fmtMesNombre(vista.ym)} · ${punto.parcial ? `en curso, día ${Number(hoy.slice(8, 10))}` : "cerrado"}`

  const deltaTxt =
    vista.delta == null
      ? null
      : def.pct
        ? `${Math.abs(vista.delta).toFixed(1)} pts`
        : def.fmt(Math.abs(vista.delta))

  // 🚨 Por qué este KPI no tiene semáforo, en una línea visible: un indicador
  // gris se lee como "no hay dato", y muchas veces el dato está — lo que falta
  // es la carga que lo haría representativo, o que termine el mes.
  const motivoTxt =
    estado !== "neutro" || !punto.motivo || punto.motivo === "sin_dato"
      ? null
      : punto.motivo === "poca_cobertura" && punto.cobertura != null
        ? `Sin semáforo: ${Math.round(punto.cobertura)} % de cobertura (mínimo ${def.coberturaMinima} %)`
        : `Sin semáforo: ${MOTIVO_LABEL[punto.motivo]}`

  return (
    <article
      id={`kpi-${def.kpi}`}
      className={cn(
        "flex scroll-mt-28 flex-col border border-border bg-card shadow-sm transition-shadow duration-500",
        heroe ? "rounded-2xl" : "rounded-xl",
        resaltada && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      aria-labelledby={`kpi-${def.kpi}-t`}
    >
      {/* 1. Qué es */}
      <header className={cn("flex items-start justify-between gap-3", heroe ? "px-5 pt-5" : "px-4 pt-4")}>
        <div className="min-w-0 space-y-1.5">
          <h3
            id={`kpi-${def.kpi}-t`}
            className={cn(
              "leading-snug text-balance text-foreground",
              heroe ? "text-base font-semibold" : "text-sm font-medium"
            )}
          >
            {def.label}
          </h3>
          {def.dpo && <DpoPuntoBadge numero={def.dpo} />}
        </div>
        <EstadoPill estado={estado} motivo={punto.motivo} />
      </header>

      <div className={cn("flex flex-1 flex-col", heroe ? "gap-4 px-5 pt-3 pb-4" : "gap-3 px-4 pt-2 pb-3")}>
        {/* 2. El número */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p
              className={cn(
                "font-semibold tracking-tight",
                heroe ? "text-5xl" : "text-3xl",
                sinDato && "text-xl text-muted-foreground",
                !sinDato && (estado === "neutro" ? "text-foreground" : ui.texto)
              )}
            >
              {punto.valor == null ? (sinDato ? "Sin conteo" : "—") : def.fmt(punto.valor)}
            </p>
            {vista.delta != null && vista.ymPrevio && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
                  vista.delta === 0
                    ? "text-muted-foreground"
                    : vista.mejora
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                )}
                title={vista.mejora ? "Mejoró" : "Empeoró"}
              >
                {vista.delta === 0 ? (
                  <Minus className="size-3.5" aria-hidden />
                ) : vista.delta > 0 ? (
                  <ArrowUpRight className="size-3.5" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden />
                )}
                {vista.delta > 0 ? "+" : vista.delta < 0 ? "−" : ""}
                {deltaTxt} vs {fmtMesCorto(vista.ymPrevio)}
                <span className="sr-only">{vista.mejora ? " (mejoró)" : " (empeoró)"}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="first-letter:uppercase">{mesTxt}</span>
            {/* 🚨 El n al lado del valor, no escondido: un 0 % sobre UNA sola OT
                no es lo mismo que un 0 % sobre veinte. */}
            {punto.n != null && def.nLabel && (
              <span className="tabular-nums">
                {" · "}n={punto.n}
                {punto.nTotal != null && ` de ${punto.nTotal}`}{" "}
                {punto.n === 1 ? def.nLabel.sing : def.nLabel.plural}
              </span>
            )}
            {punto.excluidos != null && punto.excluidos > 0 && (
              <span className="tabular-nums"> · {punto.excluidos} excluidos</span>
            )}
          </p>
          {motivoTxt && (
            <p
              className={cn(
                "text-xs font-medium",
                punto.motivo === "poca_cobertura"
                  ? "text-amber-800 dark:text-amber-300"
                  : "text-muted-foreground"
              )}
            >
              {motivoTxt}
            </p>
          )}
        </div>

        {/* 3. Contra la meta y cómo viene */}
        {conRegla && (heroe || forma === "sinSerie") && (
          <MetaRegla
            valor={punto.valor}
            meta={meta}
            estado={estado}
            fmt={def.fmt}
            pct={def.pct}
            grande={heroe}
          />
        )}
        {vista.avance && (
          <AvanceMes punto={vista.avance} meta={meta} fmt={def.fmt} hoy={hoy} />
        )}
        {vista.serie.length > 0 && (
          <div className="mt-auto space-y-1">
            <TendenciaMeses
              puntos={vista.serie}
              meta={meta}
              forma={forma === "acumulativo" || forma === "conteo" ? "columnas" : "linea"}
              fmt={def.fmt}
              alto={heroe ? 112 : 52}
              pct={def.pct}
              label={def.label}
            />
            <MesesStrip
              puntos={vista.serie}
              fmt={def.fmt}
              conN={def.nLabel != null}
              puedeEditar={acciones.puedeEditar}
              onVerPlan={acciones.onVerPlan}
              onCrearPlan={(ym, valor) => acciones.onCrearPlan(vista, ym, valor)}
              compacta={!heroe}
            />
          </div>
        )}
        {forma === "sinSerie" && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sin serie mensual a propósito: la tasa sale de la recta ajustada sobre todas las
            rondas, no de lo que pasó en el mes.
          </p>
        )}
        {heroe && def.kpi === "disponibilidad" && calcDisp && (
          <CausasParada calc={calcDisp} ym={vista.ym} />
        )}
        {/* Plan del mes de una foto sin serie (desgaste): se cuelga del mes en curso. */}
        {forma === "sinSerie" &&
          (estado === "critico" || estado === "alerta") &&
          (punto.plan || acciones.puedeEditar) && (
            <button
              type="button"
              className="h-10 rounded-lg border border-border text-sm font-medium text-primary transition-colors hover:bg-primary/5"
              onClick={() =>
                punto.plan
                  ? acciones.onVerPlan(punto.plan)
                  : acciones.onCrearPlan(vista, mesActual, punto.valor)
              }
            >
              {punto.plan ? "Ver el plan de acción" : "Crear plan de acción"}
            </button>
          )}
      </div>

      {/* 4. Meta, cálculo y detalle */}
      <footer className="border-t border-border">
        <div className={cn("flex items-center justify-between gap-2 py-2", heroe ? "px-5" : "px-4")}>
          <MetaPopover
            vista={vista}
            puedeEditar={acciones.puedeEditar}
            onSaved={acciones.onMetaSaved}
          />
          <InfoKpiPopover vista={vista} def={def} />
        </div>
        {/* 🚨 El acceso al detalle es un BOTÓN y no la tarjeta entera: la
            tarjeta tiene controles propios (meta, meses con su plan), y hacerla
            clickeable entera dejaba medio card con cursor de mano sin reaccionar. */}
        {acciones.onAbrir && textoBoton && (
          <button
            type="button"
            onClick={acciones.onAbrir}
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-2 border-t border-border text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
              heroe ? "rounded-b-2xl px-5" : "rounded-b-xl px-4",
              sinDato
                ? "text-amber-800 hover:bg-amber-500/10 dark:text-amber-300"
                : "text-primary hover:bg-primary/5"
            )}
          >
            <span>{textoBoton}</span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </button>
        )}
      </footer>
    </article>
  )
}

export const KpiTarjeta = memo(KpiTarjetaBase)
