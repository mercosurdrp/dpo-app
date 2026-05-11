"use client"

import { useTransition } from "react"
import {
  parseAsString,
  parseAsStringLiteral,
  parseAsArrayOf,
  parseAsInteger,
  useQueryStates,
} from "nuqs"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FilterMultiSelect } from "./filter-multi-select"
import type { RechazosFilterOptions, ComparisonMode } from "@/lib/types/rechazos"

const COMPARISON_MODES: { value: ComparisonMode; label: string }[] = [
  { value: "mes_en_curso", label: "Mes en curso" },
  { value: "mes_cerrado",  label: "Mes cerrado" },
  { value: "rango_custom", label: "Rango personalizado" },
]

const parsers = {
  desde:        parseAsString,
  hasta:        parseAsString,
  mode:         parseAsStringLiteral(["mes_en_curso", "mes_cerrado", "rango_custom"] as const),
  motivos:      parseAsArrayOf(parseAsInteger),
  fleteros:     parseAsArrayOf(parseAsString),
  canales:      parseAsArrayOf(parseAsString),
  supervisores: parseAsArrayOf(parseAsString),
}

// nuqs hace shallow:false → URL change → server re-render con nueva data.
const nuqsOpts = { shallow: false, history: "push" as const }

export function Filtros({
  filterOptions,
  defaultDesde,
  defaultHasta,
}: {
  filterOptions: RechazosFilterOptions
  defaultDesde: string
  defaultHasta: string
}) {
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useQueryStates(parsers, { ...nuqsOpts, startTransition })

  const desde = q.desde ?? defaultDesde
  const hasta = q.hasta ?? defaultHasta
  const mode  = q.mode ?? null
  const motivos = q.motivos ?? []
  const fleteros = q.fleteros ?? []
  const canales = q.canales ?? []
  const supervisores = q.supervisores ?? []

  const hasFilters =
    motivos.length > 0 || fleteros.length > 0 ||
    canales.length > 0 || supervisores.length > 0 ||
    q.desde != null || q.hasta != null || q.mode != null

  const reset = () =>
    setQ({
      desde: null, hasta: null, mode: null,
      motivos: null, fleteros: null, canales: null, supervisores: null,
    })

  return (
    <div
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
      aria-busy={isPending}
      data-pending={isPending ? "1" : undefined}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-desde" className="text-xs font-medium text-muted-foreground">Desde</Label>
          <Input
            id="filtro-desde"
            type="date"
            value={desde}
            onChange={(e) => setQ({ desde: e.target.value || null })}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-hasta" className="text-xs font-medium text-muted-foreground">Hasta</Label>
          <Input
            id="filtro-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setQ({ hasta: e.target.value || null })}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium text-muted-foreground">Comparación</Label>
          <Select
            value={mode ?? "auto"}
            onValueChange={(v) => setQ({ mode: v === "auto" ? null : (v as ComparisonMode) })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (según rango)</SelectItem>
              {COMPARISON_MODES.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FilterMultiSelect
          label="Motivos"
          placeholder="Todos los motivos"
          options={filterOptions.motivos.map(m => ({
            value: m.id_rechazo,
            label: m.ds_rechazo,
            sublabel: `${m.categoria}${m.controlable ? " · controlable" : ""}`,
          }))}
          selected={motivos}
          onChange={(next) => setQ({ motivos: next.length ? next : null })}
        />
        <FilterMultiSelect
          label="Patentes"
          placeholder="Todas las patentes"
          options={filterOptions.fleteros.map(f => ({
            value: f.patente,
            label: f.chofer_display,
            sublabel: f.chofer_display !== f.patente ? f.patente : undefined,
          }))}
          selected={fleteros}
          onChange={(next) => setQ({ fleteros: next.length ? next : null })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <FilterMultiSelect
          label="Canal"
          placeholder="Todos los canales"
          options={filterOptions.canales.map(c => ({ value: c, label: c }))}
          selected={canales}
          onChange={(next) => setQ({ canales: next.length ? next : null })}
        />
        <FilterMultiSelect
          label="Supervisor"
          placeholder="Todos los supervisores"
          options={filterOptions.supervisores.map(s => ({ value: s, label: s }))}
          selected={supervisores}
          onChange={(next) => setQ({ supervisores: next.length ? next : null })}
        />
        <div className="col-span-2 flex items-end justify-end md:col-span-2 lg:col-span-3">
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="h-9 gap-1 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
