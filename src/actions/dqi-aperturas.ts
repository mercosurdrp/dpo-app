"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  calcularAperturas,
  normalizarPatente,
  type AperturasResultado,
  type CamionDia,
  type EgresoDia,
  type LocalidadCamionDia,
  type RoturaDia,
} from "@/lib/dqi/aperturas"

// DQI por chofer, día de la semana y zona (/indicadores/dqi). El cálculo está en
// src/lib/dqi/aperturas.ts; acá sólo se juntan los datos del período.
// Mismos valores que src/actions/dqi.ts (no se pueden importar constantes de
// un archivo "use server").
const DEPOSITO_API_BASE = "https://deposito-regionpampeana.vercel.app"
const FETCH_TIMEOUT_MS = 8000
const TTL_MS = 15 * 60 * 1000
const PAGE = 1000

export type PeriodoApertura = "mes" | "3m" | "anio"

export interface DqiAperturasData extends AperturasResultado {
  periodo: PeriodoApertura
  desde: string
  hasta: string
  /** Meses incluidos (YYYY-MM) y los que el tablero no devolvió. */
  meses: string[]
  meses_sin_dato: string[]
}

interface SerieMes {
  roturas: RoturaDia[]
  hlEntregadoDia: Record<string, number>
}

const serieCache = new Map<string, { t: number; v: SerieMes | null }>()

async function fetchSerieMes(year: number, month: number): Promise<SerieMes | null> {
  const k = `${year}-${month}`
  const hit = serieCache.get(k)
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v
  let v: SerieMes | null = null
  try {
    const res = await fetch(`${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.ok) {
      const j = (await res.json()) as {
        roturas_detalle_dia?: Record<
          string,
          { sku?: string | number; descripcion?: string; origen?: string; patentes?: string[]; hl?: number }[] | null
        >
        hl_entregado_dia?: Record<string, number | null>
      }
      const roturas: RoturaDia[] = []
      for (const [fecha, arr] of Object.entries(j.roturas_detalle_dia ?? {})) {
        for (const it of arr ?? []) {
          if (it?.origen !== "distribucion" || !(Number(it.hl) > 0)) continue
          const pats = (it.patentes ?? []).map(normalizarPatente).filter(Boolean)
          const partes = pats.length ? pats : [""]
          // Si la fila trae varias patentes, el HL se reparte por igual.
          for (const p of partes) {
            roturas.push({
              fecha,
              patente: p,
              sku: String(it.sku ?? ""),
              descripcion: it.descripcion ?? "",
              hl: Number(it.hl) / partes.length,
            })
          }
        }
      }
      const hlEntregadoDia: Record<string, number> = {}
      for (const [f, hl] of Object.entries(j.hl_entregado_dia ?? {})) if (hl != null && hl > 0) hlEntregadoDia[f] = hl
      v = { roturas, hlEntregadoDia }
    }
  } catch {
    v = null
  }
  // No cachear un fallo: que el próximo intento vuelva a consultar.
  if (v) serieCache.set(k, { t: Date.now(), v })
  return v
}

function mesesDelPeriodo(year: number, month: number, periodo: PeriodoApertura): { y: number; m: number }[] {
  if (periodo === "mes") return [{ y: year, m: month }]
  if (periodo === "anio") return Array.from({ length: month }, (_, i) => ({ y: year, m: i + 1 }))
  const out: { y: number; m: number }[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1))
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 })
  }
  return out
}

async function paginar<T>(
  armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await armar(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/** DQI del período abierto por chofer, día de la semana y zona.
 * @param month mes de referencia 1-12 (3m = ese mes y los dos anteriores; año = enero a ese mes). */
export async function getDqiAperturas(input: {
  year: number
  month: number
  periodo: PeriodoApertura
}): Promise<{ data: DqiAperturasData } | { error: string }> {
  try {
    await requireAuth()
    const meses = mesesDelPeriodo(input.year, input.month, input.periodo)
    const primero = meses[0]
    const ultimo = meses[meses.length - 1]
    const desde = `${primero.y}-${String(primero.m).padStart(2, "0")}-01`
    const finMes = new Date(Date.UTC(ultimo.y, ultimo.m, 0)).getUTCDate()
    const hasta = `${ultimo.y}-${String(ultimo.m).padStart(2, "0")}-${String(finMes).padStart(2, "0")}`

    const supabase = await createClient()
    const [series, egresosRaw, despRaw, locRaw] = await Promise.all([
      Promise.all(meses.map((x) => fetchSerieMes(x.y, x.m))),
      paginar<{ fecha: string; dominio: string | null; chofer: string | null }>((a, b) =>
        supabase
          .from("registros_vehiculos")
          .select("fecha, dominio, chofer")
          .eq("tipo", "egreso")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha")
          .order("hora")
          .range(a, b),
      ),
      paginar<{ fecha: string; patente: string | null; hl_total: number | null }>((a, b) =>
        supabase
          .from("ocupacion_bodega_diaria")
          .select("fecha, patente, hl_total")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha")
          .order("patente")
          .range(a, b),
      ),
      paginar<{ fecha: string; patente: string | null; localidad: string | null; hl_total: number | null }>((a, b) =>
        supabase
          .from("ocupacion_bodega_localidad_diaria")
          .select("fecha, patente, localidad, hl_total")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha")
          .order("patente")
          .order("localidad")
          .range(a, b),
      ),
    ])

    const roturas: RoturaDia[] = []
    const hlEntregadoDia: Record<string, number> = {}
    const mesesSinDato: string[] = []
    series.forEach((s, i) => {
      const etiqueta = `${meses[i].y}-${String(meses[i].m).padStart(2, "0")}`
      if (!s) {
        mesesSinDato.push(etiqueta)
        return
      }
      roturas.push(...s.roturas)
      Object.assign(hlEntregadoDia, s.hlEntregadoDia)
    })
    if (mesesSinDato.length === meses.length) {
      return { error: "El tablero de pérdidas no respondió. Probá de nuevo en un rato." }
    }

    const dia = (f: string) => String(f).slice(0, 10)
    const egresos: EgresoDia[] = egresosRaw.map((r) => ({
      fecha: dia(r.fecha),
      patente: normalizarPatente(r.dominio),
      chofer: r.chofer ?? "",
    }))
    const despachos: CamionDia[] = despRaw.map((r) => ({
      fecha: dia(r.fecha),
      patente: normalizarPatente(r.patente),
      hl: Number(r.hl_total ?? 0),
    }))
    const localidades: LocalidadCamionDia[] = locRaw.map((r) => ({
      fecha: dia(r.fecha),
      patente: normalizarPatente(r.patente),
      localidad: r.localidad ?? "",
      hl: Number(r.hl_total ?? 0),
    }))

    const res = calcularAperturas({ roturas, hlEntregadoDia, despachos, egresos, localidades })
    return {
      data: {
        ...res,
        periodo: input.periodo,
        desde,
        hasta,
        meses: meses.map((x) => `${x.y}-${String(x.m).padStart(2, "0")}`),
        meses_sin_dato: mesesSinDato,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error calculando las aperturas del DQI" }
  }
}
