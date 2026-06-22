"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  MES_LABEL_CORTO,
  esRechazoKpi,
  type RechazoClienteRow,
  type RechazoPctData,
  type RechazoPctMes,
  type RechazoPlanOpciones,
} from "@/lib/sueno/rechazo-tipos"

type Result<T> = { data: T } | { error: string }

function pct(part: number, total: number): number | null {
  if (!total) return null
  return Math.round((part / total) * 1000) / 10
}

/** % del motivo sobre el total de rechazos, por mes + YTD (veces y bultos). */
export async function getSuenoRechazoPct(
  kpiKey: string,
  anio: number,
): Promise<Result<RechazoPctData>> {
  try {
    await requireAuth()
    if (!esRechazoKpi(kpiKey)) return { error: "KPI no es de rechazo" }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("sueno_rechazo_pct", {
      p_kpi: kpiKey,
      p_anio: anio,
    })
    if (error) return { error: error.message }

    const rows = (data ?? []) as {
      mes: number
      cant_tipo: number
      cant_total: number
      bultos_tipo: number
      bultos_total: number
    }[]

    const meses: RechazoPctMes[] = rows.map((r) => {
      const cantTipo = Number(r.cant_tipo)
      const cantTotal = Number(r.cant_total)
      const bultosTipo = Number(r.bultos_tipo)
      const bultosTotal = Number(r.bultos_total)
      return {
        mes: r.mes,
        etiqueta: MES_LABEL_CORTO[r.mes - 1] ?? String(r.mes),
        cantTipo,
        cantTotal,
        pctCant: pct(cantTipo, cantTotal),
        bultosTipo,
        bultosTotal,
        pctBultos: pct(bultosTipo, bultosTotal),
      }
    })

    const acc = meses.reduce(
      (a, m) => ({
        cantTipo: a.cantTipo + m.cantTipo,
        cantTotal: a.cantTotal + m.cantTotal,
        bultosTipo: a.bultosTipo + m.bultosTipo,
        bultosTotal: a.bultosTotal + m.bultosTotal,
      }),
      { cantTipo: 0, cantTotal: 0, bultosTipo: 0, bultosTotal: 0 },
    )

    return {
      data: {
        meses,
        ytd: {
          ...acc,
          pctCant: pct(acc.cantTipo, acc.cantTotal),
          pctBultos: pct(acc.bultosTipo, acc.bultosTotal),
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Ranking de clientes para el motivo. mes = null → año completo. */
export async function getSuenoRechazoClientes(
  kpiKey: string,
  anio: number,
  mes?: number | null,
): Promise<Result<RechazoClienteRow[]>> {
  try {
    await requireAuth()
    if (!esRechazoKpi(kpiKey)) return { error: "KPI no es de rechazo" }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("sueno_rechazo_clientes", {
      p_kpi: kpiKey,
      p_anio: anio,
      p_mes: mes ?? null,
    })
    if (error) return { error: error.message }

    const rows = ((data ?? []) as {
      id_cliente: number
      nombre_cliente: string
      eventos: number
      bultos: number
      hl: number
    }[]).map((r) => ({
      idCliente: r.id_cliente,
      nombreCliente: r.nombre_cliente,
      eventos: Number(r.eventos),
      bultos: Number(r.bultos),
      hl: Number(r.hl),
    }))

    return { data: rows }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Opciones para el PlanFormDialog (motivos activos + responsables). */
export async function getRechazoPlanOpciones(): Promise<Result<RechazoPlanOpciones>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [{ data: motivos }, { data: responsables }] = await Promise.all([
      supabase
        .from("catalogo_rechazos")
        .select("id_rechazo, ds_rechazo")
        .eq("activo", true)
        .order("ds_rechazo", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, nombre")
        .eq("active", true)
        .order("nombre", { ascending: true }),
    ])
    return {
      data: {
        motivos: (motivos ?? []) as { id_rechazo: number; ds_rechazo: string }[],
        responsables: (responsables ?? []) as { id: string; nombre: string }[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
