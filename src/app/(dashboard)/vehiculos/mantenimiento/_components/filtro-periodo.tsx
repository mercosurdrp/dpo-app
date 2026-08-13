"use client"

// Filtro de período único del módulo de flota.
//
// Cada pestaña traía su propio recorte de tiempo —una con "año en curso /
// últimos 12 meses", otra con un combo de meses, otra con desde-hasta— y el
// mismo número daba distinto según dónde se lo mirara. Acá el período se arma
// con la granularidad que haga falta (un día, un mes, un año o un rango libre)
// y las pestañas comparten el control, el estado y el cálculo del rango.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

export type Granularidad = "dia" | "mes" | "anio" | "12m" | "rango" | "todo"

export interface PeriodoState {
  granularidad: Granularidad
  dia: string
  mes: string
  anio: string
  desde: string
  hasta: string
}

/** Rango efectivo en ISO; `null` en una punta = sin límite por ese lado. */
export interface RangoFechas {
  desde: string | null
  hasta: string | null
}

const GRANULARIDADES: { value: Granularidad; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "mes", label: "Mes" },
  { value: "anio", label: "Año" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "rango", label: "Rango de fechas" },
  { value: "todo", label: "Histórico completo" },
]

/** El día "de hoy" se calcula en la zona del negocio para que el servidor y el
 *  navegador escriban lo mismo (si no, entre las 21 y las 24 difieren). */
const TZ = "America/Argentina/Buenos_Aires"
const fmtISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
export const hoyISO = () => fmtISO.format(new Date())

/** Resta meses a una fecha ISO sin caer en el 31 de un mes que no lo tiene. */
export function restarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  const base = new Date(Date.UTC(a, m - 1 - meses, 1))
  const ultimoDia = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const dia = String(Math.min(d, ultimoDia)).padStart(2, "0")
  const mes = String(base.getUTCMonth() + 1).padStart(2, "0")
  return `${base.getUTCFullYear()}-${mes}-${dia}`
}

/** Último día del mes de un `YYYY-MM`. */
export function finDeMes(ym: string): string {
  const [a, m] = ym.split("-").map(Number)
  const dia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${ym}-${String(dia).padStart(2, "0")}`
}

export function periodoInicial(
  granularidad: Granularidad = "anio"
): PeriodoState {
  const hoy = hoyISO()
  return {
    granularidad,
    dia: hoy,
    mes: hoy.slice(0, 7),
    anio: hoy.slice(0, 4),
    desde: restarMeses(hoy, 1),
    hasta: hoy,
  }
}

export function rangoDe(p: PeriodoState): RangoFechas {
  switch (p.granularidad) {
    case "dia":
      return { desde: p.dia, hasta: p.dia }
    case "mes":
      return { desde: `${p.mes}-01`, hasta: finDeMes(p.mes) }
    case "anio":
      return { desde: `${p.anio}-01-01`, hasta: `${p.anio}-12-31` }
    case "12m":
      return { desde: restarMeses(hoyISO(), 12), hasta: hoyISO() }
    case "rango":
      return { desde: p.desde || null, hasta: p.hasta || null }
    default:
      return { desde: null, hasta: null }
  }
}

export function etiquetaDe(r: RangoFechas): string {
  const f = (iso: string) => iso.split("-").reverse().join("/")
  if (!r.desde && !r.hasta) return "Histórico completo"
  if (r.desde && r.hasta) {
    return r.desde === r.hasta ? f(r.desde) : `${f(r.desde)} al ${f(r.hasta)}`
  }
  return r.desde ? `desde ${f(r.desde)}` : `hasta ${f(r.hasta!)}`
}

/** ¿La fecha (ISO o timestamp) cae dentro del rango? */
export function dentroDe(
  fecha: string | null | undefined,
  r: RangoFechas
): boolean {
  const f = (fecha || "").slice(0, 10)
  if (!f) return false
  if (r.desde && f < r.desde) return false
  if (r.hasta && f > r.hasta) return false
  return true
}

interface Props {
  value: PeriodoState
  onChange: (p: PeriodoState) => void
  /** Años a ofrecer en la granularidad "Año"; por defecto, el año en curso. */
  anios?: string[]
  className?: string
}

export function FiltroPeriodo({ value, onChange, anios, className }: Props) {
  const set = (parcial: Partial<PeriodoState>) =>
    onChange({ ...value, ...parcial })
  const aniosOpc =
    anios && anios.length > 0 ? anios : [hoyISO().slice(0, 4)]

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <div className="w-44 shrink-0">
        <Select
          value={value.granularidad}
          onValueChange={(v: string | null) =>
            set({ granularidad: (v as Granularidad) ?? "anio" })
          }
        >
          <SelectTrigger aria-label="Granularidad del período">
            <SelectValue>
              {(v: string | null) =>
                GRANULARIDADES.find((g) => g.value === v)?.label ?? "Año"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GRANULARIDADES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.granularidad === "dia" && (
        <Input
          type="date"
          value={value.dia}
          onChange={(e) => set({ dia: e.target.value })}
          className="w-40"
          aria-label="Día"
        />
      )}

      {value.granularidad === "mes" && (
        <Input
          type="month"
          value={value.mes}
          onChange={(e) => set({ mes: e.target.value })}
          className="w-40"
          aria-label="Mes"
        />
      )}

      {value.granularidad === "anio" && (
        <div className="w-28 shrink-0">
          <Select
            value={value.anio}
            onValueChange={(v: string | null) =>
              set({ anio: v ?? hoyISO().slice(0, 4) })
            }
          >
            <SelectTrigger aria-label="Año">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aniosOpc.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.granularidad === "rango" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={value.desde}
            max={value.hasta || undefined}
            onChange={(e) => set({ desde: e.target.value })}
            className="w-36"
            aria-label="Desde"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            value={value.hasta}
            min={value.desde || undefined}
            onChange={(e) => set({ hasta: e.target.value })}
            className="w-36"
            aria-label="Hasta"
          />
        </div>
      )}
    </div>
  )
}
