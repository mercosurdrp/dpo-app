"use client"

// Filtros del tablero de Indicadores. Viven en la URL (nuqs, shallow: no
// vuelve a correr las server actions de la página) para que un link
// compartido abra exactamente la misma vista.
//
// No hay filtro por patente ni por tipo de unidad a propósito: sólo 2 de los
// 22 PI se podrían recalcular por unidad en el cliente, y una barra que filtra
// 2 y deja 20 iguales se lee como "todo filtrado". El detalle por unidad ya
// está en Seguimiento, y la tarjeta lleva ahí.

import { useState } from "react"
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs"
import { Check, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { MOTIVO_LABEL, type EstadoKpi, type MotivoSinJuzgar } from "./estado-kpi"
import { fmtMesCorto, fmtMesNombre } from "./formato"
import { TEMA_IDS, TEMAS, type TemaKpi } from "./kpi-defs"
import { ESTADO_UI } from "./semaforo"
import { filtrosActivos, type Facetas, type FiltroPlan, type FiltrosIndicadores, type MesFoco } from "./vistas"

const ESTADOS = ["critico", "alerta", "ok", "neutro"] as const
const ESTADO_CHIP: Record<EstadoKpi, string> = {
  critico: "Fuera de meta",
  alerta: "Cerca",
  ok: "En meta",
  neutro: "Sin juzgar",
}

const parsers = {
  ind_mes: parseAsString.withDefault("auto"),
  ind_estado: parseAsArrayOf(parseAsStringLiteral(ESTADOS)).withDefault([]),
  ind_tema: parseAsArrayOf(parseAsStringLiteral(TEMA_IDS)).withDefault([]),
  ind_mand: parseAsBoolean.withDefault(false),
  ind_plan: parseAsStringLiteral(["falta", "abierto"] as const),
  ind_q: parseAsString.withDefault(""),
}

export function useFiltrosIndicadores(meses: string[]) {
  const [q, setQ] = useQueryStates(parsers, { history: "replace", clearOnDefault: true })
  // Un mes que no está en la ventana (link viejo, mes tipeado a mano) vuelve a "auto".
  const foco: MesFoco = q.ind_mes !== "auto" && meses.includes(q.ind_mes) ? q.ind_mes : "auto"
  const filtros: FiltrosIndicadores = {
    estados: q.ind_estado,
    temas: q.ind_tema,
    soloMandatorios: q.ind_mand,
    plan: q.ind_plan,
    q: q.ind_q,
  }
  const set = (p: Partial<FiltrosIndicadores>) =>
    setQ({
      ...(p.estados !== undefined && { ind_estado: p.estados }),
      ...(p.temas !== undefined && { ind_tema: p.temas }),
      ...(p.soloMandatorios !== undefined && { ind_mand: p.soloMandatorios }),
      ...(p.plan !== undefined && { ind_plan: p.plan }),
      ...(p.q !== undefined && { ind_q: p.q }),
    })
  const setFoco = (m: MesFoco) => setQ({ ind_mes: m })
  const limpiar = () =>
    setQ({ ind_estado: null, ind_tema: null, ind_mand: null, ind_plan: null, ind_q: null })
  return { foco, setFoco, filtros, set, limpiar }
}

// ==================== Piezas ====================

const chipBase =
  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"

function Chip({
  activo,
  onClick,
  children,
  className,
  disabled,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        chipBase,
        activo
          ? "border-foreground bg-foreground font-medium text-background"
          : "border-border bg-background text-foreground hover:border-foreground/30 hover:bg-muted",
        className
      )}
    >
      {activo && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  )
}

const Cuenta = ({ n, activo }: { n: number; activo: boolean }) => (
  <span
    className={cn(
      "tabular-nums text-xs",
      activo ? "text-background/80" : "text-muted-foreground"
    )}
  >
    {n}
  </span>
)

function MesControl({
  meses,
  mesActual,
  foco,
  onFoco,
}: {
  meses: string[]
  mesActual: string
  foco: MesFoco
  onFoco: (m: MesFoco) => void
}) {
  const opciones: { v: MesFoco; label: string; title: string }[] = [
    {
      v: "auto",
      label: "Automático",
      title:
        "Cada indicador en su mes natural: los de foto en el mes en curso y los acumulativos en el último mes cerrado",
    },
    ...[...meses].reverse().map((m) => ({
      v: m,
      label: `${fmtMesCorto(m)}${m === mesActual ? " · en curso" : ""}`,
      title: `Todos los indicadores en ${fmtMesNombre(m)}`,
    })),
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Mes de los indicadores"
      className="inline-flex shrink-0 rounded-xl bg-muted p-1"
    >
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={foco === o.v}
          title={o.title}
          onClick={() => onFoco(o.v)}
          className={cn(
            "min-h-9 rounded-lg px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            foco === o.v
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function EstadoChips({
  filtros,
  facetas,
  set,
}: {
  filtros: FiltrosIndicadores
  facetas: Facetas
  set: (p: Partial<FiltrosIndicadores>) => void
}) {
  const toggle = (e: EstadoKpi) =>
    set({
      estados: filtros.estados.includes(e)
        ? filtros.estados.filter((x) => x !== e)
        : [...filtros.estados, e],
    })
  const motivos = (Object.entries(facetas.motivos) as [MotivoSinJuzgar, number][])
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${n} ${MOTIVO_LABEL[m]}`)
    .join(" · ")
  return (
    <>
      {ESTADOS.map((e) => {
        const activo = filtros.estados.includes(e)
        return (
          <Chip
            key={e}
            activo={activo}
            onClick={() => toggle(e)}
            disabled={!activo && facetas.estado[e] === 0}
          >
            {!activo && (
              <span aria-hidden className={cn("size-2.5 rounded-full", ESTADO_UI[e].bg)} />
            )}
            <span title={e === "neutro" && motivos ? motivos : undefined}>{ESTADO_CHIP[e]}</span>
            <Cuenta n={facetas.estado[e]} activo={activo} />
          </Chip>
        )
      })}
    </>
  )
}

function TemaChips({
  filtros,
  facetas,
  set,
}: {
  filtros: FiltrosIndicadores
  facetas: Facetas
  set: (p: Partial<FiltrosIndicadores>) => void
}) {
  const toggle = (t: TemaKpi) =>
    set({
      temas: filtros.temas.includes(t)
        ? filtros.temas.filter((x) => x !== t)
        : [...filtros.temas, t],
    })
  return (
    <>
      {TEMAS.map((t) => {
        const activo = filtros.temas.includes(t.id)
        const n = facetas.tema[t.id] ?? 0
        return (
          <Chip key={t.id} activo={activo} onClick={() => toggle(t.id)} disabled={!activo && n === 0}>
            {t.label}
            <Cuenta n={n} activo={activo} />
          </Chip>
        )
      })}
    </>
  )
}

function MasFiltros({
  filtros,
  facetas,
  set,
}: {
  filtros: FiltrosIndicadores
  facetas: Facetas
  set: (p: Partial<FiltrosIndicadores>) => void
}) {
  const planes: { v: FiltroPlan | null; label: string; n?: number }[] = [
    { v: null, label: "Todos" },
    { v: "falta", label: "Falta plan", n: facetas.falta },
    { v: "abierto", label: "Plan abierto", n: facetas.abierto },
  ]
  return (
    <>
      <Chip activo={filtros.soloMandatorios} onClick={() => set({ soloMandatorios: !filtros.soloMandatorios })}>
        {!filtros.soloMandatorios && <ShieldCheck className="size-3.5 text-amber-600" aria-hidden />}
        Solo mandatorios DPO
        <Cuenta n={facetas.mandatorios} activo={filtros.soloMandatorios} />
      </Chip>
      <div role="radiogroup" aria-label="Planes de acción" className="inline-flex shrink-0 rounded-xl bg-muted p-1">
        {planes.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={filtros.plan === o.v}
            onClick={() => set({ plan: o.v })}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              filtros.plan === o.v
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
            {o.n != null && <span className="text-xs tabular-nums text-muted-foreground">{o.n}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

function Buscador({
  valor,
  onChange,
  className,
}: {
  valor: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar indicador o punto DPO"
        aria-label="Buscar indicador o punto DPO"
        className="h-10 pl-9"
      />
    </div>
  )
}

// ==================== Barra ====================

export function FiltrosIndicadoresBar({
  meses,
  mesActual,
  foco,
  setFoco,
  filtros,
  facetas,
  set,
  limpiar,
  visibles,
  total,
}: {
  meses: string[]
  mesActual: string
  foco: MesFoco
  setFoco: (m: MesFoco) => void
  filtros: FiltrosIndicadores
  facetas: Facetas
  set: (p: Partial<FiltrosIndicadores>) => void
  limpiar: () => void
  visibles: number
  total: number
}) {
  const [abierto, setAbierto] = useState(false)
  const activos = filtrosActivos(filtros)
  const requiereAccion =
    filtros.estados.length === 2 &&
    filtros.estados.includes("critico") &&
    filtros.estados.includes("alerta")

  const fila = "flex flex-wrap items-center gap-2"
  const rotulo = "w-16 shrink-0 text-xs font-medium text-muted-foreground"

  return (
    <>
      {/* Desktop */}
      <div className="hidden space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={fila}>
            <span className={rotulo}>Mes</span>
            <MesControl meses={meses} mesActual={mesActual} foco={foco} onFoco={setFoco} />
          </div>
          <Buscador valor={filtros.q} onChange={(v) => set({ q: v })} className="w-full max-w-xs" />
        </div>
        <div className={fila}>
          <span className={rotulo}>Estado</span>
          <EstadoChips filtros={filtros} facetas={facetas} set={set} />
          <button
            type="button"
            onClick={() => set({ estados: requiereAccion ? [] : ["critico", "alerta"] })}
            className="ml-1 min-h-10 rounded-lg px-2 text-sm font-medium text-primary hover:underline"
          >
            {requiereAccion ? "Ver todos los estados" : "Sólo lo que requiere acción"}
          </button>
        </div>
        <div className={fila}>
          <span className={rotulo}>Tema</span>
          <TemaChips filtros={filtros} facetas={facetas} set={set} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={fila}>
            <span className={rotulo}>Más</span>
            <MasFiltros filtros={filtros} facetas={facetas} set={set} />
          </div>
          <p className="flex items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
            <span>
              <span className="font-semibold tabular-nums text-foreground">{visibles}</span> de{" "}
              {total} indicadores
            </span>
            {activos > 0 && (
              <button
                type="button"
                onClick={limpiar}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-medium text-primary hover:bg-primary/5"
              >
                <X className="size-4" aria-hidden /> Limpiar filtros ({activos})
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Mobile: mes y estado a mano, el resto en el panel */}
      <div className="space-y-2 md:hidden">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
          <MesControl meses={meses} mesActual={mesActual} foco={foco} onFoco={setFoco} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <EstadoChips filtros={filtros} facetas={facetas} set={set} />
        </div>
      </div>

      {/* Mobile: botón flotante (el <main> del layout tiene overflow, así que
          una barra sticky no se pegaría). */}
      <Button
        type="button"
        onClick={() => setAbierto(true)}
        className="fixed right-4 bottom-4 z-30 h-12 gap-2 rounded-full px-5 shadow-lg shadow-black/20 md:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filtros{activos > 0 ? ` (${activos})` : ""}
      </Button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filtrar indicadores</SheetTitle>
            <SheetDescription>Los filtros quedan en el link: compartilo y se abre igual.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-4">
            <Buscador valor={filtros.q} onChange={(v) => set({ q: v })} />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Mes</p>
              <div className="overflow-x-auto">
                <MesControl meses={meses} mesActual={mesActual} foco={foco} onFoco={setFoco} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Estado</p>
              <div className="flex flex-wrap gap-2">
                <EstadoChips filtros={filtros} facetas={facetas} set={set} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Tema</p>
              <div className="flex flex-wrap gap-2">
                <TemaChips filtros={filtros} facetas={facetas} set={set} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Más</p>
              <div className="flex flex-wrap gap-2">
                <MasFiltros filtros={filtros} facetas={facetas} set={set} />
              </div>
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={limpiar} disabled={activos === 0}>
              Limpiar
            </Button>
            <Button className="h-11 flex-1" onClick={() => setAbierto(false)}>
              Ver {visibles} {visibles === 1 ? "indicador" : "indicadores"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
