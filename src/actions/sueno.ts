"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import {
  ARBOL_SUENO,
  type MejorSi,
  type SuenoNodo,
} from "@/lib/sueno/arbol-config"
import { estadoSemaforo } from "@/lib/sueno/semaforo"

interface ValorRow {
  kpi_key: string
  valor_ytd: number | null
  meta: number | null
  gatillo: number | null
  mejor_si: MejorSi
  nota: string | null
  updated_at: string | null
}

function anioActual(): number {
  return new Date().getFullYear()
}

/**
 * Devuelve los 17 nodos del árbol enriquecidos con los valores cargados para
 * el año. Resiliente: si la tabla aún no existe en esta Supabase (PGRST205),
 * cae a las metas por defecto del config para que la pantalla no rompa.
 */
export async function getSuenoArbol(
  anio?: number,
): Promise<{ data: { anio: number; nodos: SuenoNodo[] } } | { error: string }> {
  try {
    await requireAuth()
    const year = anio ?? anioActual()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("sueno_kpi_valores")
      .select("kpi_key,valor_ytd,meta,gatillo,mejor_si,nota,updated_at")
      .eq("anio", year)

    if (error && error.code !== "PGRST205") return { error: error.message }

    const byKey = new Map<string, ValorRow>()
    for (const r of (data ?? []) as ValorRow[]) byKey.set(r.kpi_key, r)

    const nodos: SuenoNodo[] = ARBOL_SUENO.map((cfg) => {
      const row = byKey.get(cfg.key)
      const meta = row?.meta ?? cfg.metaDefault
      const valorYtd = row?.valor_ytd ?? null
      const gatillo = row?.gatillo ?? null
      const mejorSi = row?.mejor_si ?? cfg.mejorSi
      return {
        ...cfg,
        mejorSi,
        anio: year,
        valorYtd,
        meta,
        gatillo,
        nota: row?.nota ?? null,
        updatedAt: row?.updated_at ?? null,
        estado: estadoSemaforo(valorYtd, meta, gatillo, mejorSi),
      }
    })

    return { data: { anio: year, nodos } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

const MES_LABEL = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const EXPLICACION: Record<string, string> = {
  otif: "OTIF = 1 − (bultos rechazados ÷ bultos entregados). Detalle mensual del % logrado y los bultos rechazados de cada mes.",
  rechazo: "Rechazo = bultos rechazados ÷ bultos entregados (%). Por mes, con los bultos rechazados.",
  in_full: "In-Full = % de bultos entregados completos (100 − % de rechazo). Detalle por mes.",
  n_incidentes: "Cantidad de incidentes de seguridad reportados, por mes.",
  comportamientos: "Cantidad de actos / comportamientos inseguros reportados, por mes.",
  sin_dinero: "Rechazos por motivo «Sin dinero», por mes (cantidad y bultos).",
  cerrado: "Rechazos por motivo «Cerrado», por mes (cantidad y bultos).",
}

export interface SuenoDetalleMes {
  mes: number
  etiqueta: string
  valor: number
  detalle: number | null
}

export interface SuenoDetalle {
  kpiKey: string
  label: string
  unidad: string
  fuente: "auto" | "manual"
  explicacion: string
  meses: SuenoDetalleMes[]
}

/** Detalle mensual de un KPI (para el modal que explica el número). */
export async function getSuenoDetalle(
  kpiKey: string,
  anio?: number,
): Promise<{ data: SuenoDetalle } | { error: string }> {
  try {
    await requireAuth()
    const year = anio ?? anioActual()
    const cfg = ARBOL_SUENO.find((n) => n.key === kpiKey)
    if (!cfg) return { error: "KPI desconocido" }

    const explicacion = EXPLICACION[kpiKey]
    if (!explicacion) {
      // KPI manual: sin detalle automático
      return {
        data: {
          kpiKey,
          label: cfg.label,
          unidad: cfg.unidad,
          fuente: "manual",
          explicacion:
            "Indicador de carga manual: todavía no tiene detalle mensual automático.",
          meses: [],
        },
      }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc("sueno_kpi_detalle", {
      p_kpi: kpiKey,
      p_anio: year,
    })
    if (error && error.code !== "PGRST202") return { error: error.message }

    const meses: SuenoDetalleMes[] = ((data ?? []) as {
      mes: number
      valor: number | null
      detalle: number | null
    }[]).map((r) => ({
      mes: r.mes,
      etiqueta: MES_LABEL[r.mes - 1] ?? String(r.mes),
      valor: Number(r.valor ?? 0),
      detalle: r.detalle == null ? null : Number(r.detalle),
    }))

    return {
      data: {
        kpiKey,
        label: cfg.label,
        unidad: cfg.unidad,
        fuente: "auto",
        explicacion,
        meses,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Recalcula los KPIs con fuente automática (YTD) desde las tablas vivas. Solo admin. */
export async function refreshSuenoAuto(
  anio?: number,
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const year = anio ?? anioActual()
    const supabase = await createClient()
    const { error } = await supabase.rpc("sueno_kpi_refresh", { p_anio: year })
    if (error) return { error: error.message }
    revalidatePath("/")
    revalidatePath("/mis-capacitaciones")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Carga/edita el valor de un KPI. Solo admin. */
export async function setSuenoValor(input: {
  kpi_key: string
  anio?: number
  valor_ytd?: number | null
  meta?: number | null
  gatillo?: number | null
  mejor_si?: MejorSi
  nota?: string | null
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin"])
    const year = input.anio ?? anioActual()

    // Validar que el kpi_key exista en la topología
    if (!ARBOL_SUENO.some((n) => n.key === input.kpi_key)) {
      return { error: "KPI desconocido" }
    }

    const supabase = await createClient()
    const { error } = await supabase.from("sueno_kpi_valores").upsert(
      {
        kpi_key: input.kpi_key,
        anio: year,
        valor_ytd: input.valor_ytd ?? null,
        meta: input.meta ?? null,
        gatillo: input.gatillo ?? null,
        ...(input.mejor_si ? { mejor_si: input.mejor_si } : {}),
        nota: input.nota ?? null,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kpi_key,anio" },
    )

    if (error) return { error: error.message }

    revalidatePath("/")
    revalidatePath("/mis-capacitaciones")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
