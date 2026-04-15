"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { getTmlKpis } from "./registros-vehiculos"
import { getSkapMatriz } from "./sop-certificaciones"
import { getOwdKpis } from "./owd-pre-ruta"
import { getTmlPlanesResumen } from "./tml-plan-accion"
import type {
  SkapMatriz,
  TmlMensual,
  TmlMesComparado,
  TmlPlanResumen,
  OwdMensual,
  OwdItemStats,
} from "@/types/database"

export interface PackAuditoria11 {
  generado_en: string
  pilar: string
  punto: string
  titulo: string
  score_estimado: {
    valor: number
    texto: string
    requisitos: Array<{ codigo: string; descripcion: string; estado: "cumple" | "parcial" | "no_cumple"; evidencia: string }>
  }
  r1_1_1_sop: {
    archivo: string
    ultima_revision: string
    secciones_clave: string[]
  }
  r1_1_2_ejecucion: {
    owd_total_observaciones: number
    owd_promedio_cumplimiento: number
    owd_obs_mes_actual: number
    owd_items_fallados: OwdItemStats[]
    owd_por_etapa: Array<{ etapa: string; pct: number; total: number }>
  }
  r1_1_3_capacitacion: {
    matriz: SkapMatriz
  }
  r1_1_4_planes: {
    total_meses_fuera_meta: number
    meses_con_plan: number
    pct_con_plan: number
    resumen: TmlPlanResumen[]
  }
  r1_1_5_tml: {
    promedio_tml_actual: number
    pct_dentro_meta_actual: number
    meta_minutos: number
    meta_pct: number
    mensual: TmlMensual[]
    comparado_yoy: TmlMesComparado[]
    mensual_en_meta: number
    mensual_total: number
  }
  mensual_resumen: {
    mes: number
    year: number
  }
}

export async function getPackAuditoria11(): Promise<
  { data: PackAuditoria11 } | { error: string }
> {
  try {
    await requireAuth()

    const [tmlRes, skapRes, owdRes, planesRes] = await Promise.all([
      getTmlKpis(),
      getSkapMatriz("1.1"),
      getOwdKpis(),
      getTmlPlanesResumen(),
    ])

    if ("error" in tmlRes) return { error: tmlRes.error }
    if ("error" in skapRes) return { error: skapRes.error }
    if ("error" in owdRes) return { error: owdRes.error }
    if ("error" in planesRes) return { error: planesRes.error }

    const tml = tmlRes.data
    const skap = skapRes.data
    const owd = owdRes.data
    const planes = planesRes.data

    const mesesFuera = planes.filter((p) => p.fuera_meta)
    const mesesConPlan = mesesFuera.filter((p) => p.plan != null).length
    const pctConPlan =
      mesesFuera.length === 0 ? 100 : Math.round((mesesConPlan / mesesFuera.length) * 100)

    const mensualEnMeta = tml.mensual.filter((m) => m.promedio_tml <= 30 && m.pct_dentro_meta >= 65).length

    const r1_1_5_cumple = tml.promedioTml <= 30 && tml.pctDentroMeta >= 65
    const r1_1_4_cumple = pctConPlan === 100
    const r1_1_3_cumple = skap.pct_cobertura >= 90
    const r1_1_3_parcial = skap.pct_cobertura >= 70 && skap.pct_cobertura < 90
    const r1_1_2_cumple = owd.promedioCumplimiento >= 90 && owd.obsMesActual >= 8
    const r1_1_2_parcial = owd.totalObservaciones > 0 && !r1_1_2_cumple

    function estado(cumple: boolean, parcial?: boolean) {
      if (cumple) return "cumple" as const
      if (parcial) return "parcial" as const
      return "no_cumple" as const
    }

    const requisitos = [
      {
        codigo: "R1.1.1",
        descripcion: "SOP Pre-Ruta actualizado",
        estado: "cumple" as const,
        evidencia: "SOP vigente en /sops/04-entrega/1.1 — última revisión 14/04/2026",
      },
      {
        codigo: "R1.1.2",
        descripcion: "Proceso ejecutado según SOP",
        estado: estado(r1_1_2_cumple, r1_1_2_parcial),
        evidencia: `OWD Pre-Ruta: ${owd.totalObservaciones} observaciones, ${owd.promedioCumplimiento.toFixed(1)}% cumplimiento promedio, ${owd.obsMesActual} este mes`,
      },
      {
        codigo: "R1.1.3",
        descripcion: "Equipos capacitados en SOP",
        estado: estado(r1_1_3_cumple, r1_1_3_parcial),
        evidencia: `Matriz SKAP: ${skap.pct_cobertura.toFixed(0)}% cobertura (${skap.vigentes}/${skap.total_empleados} vigentes)`,
      },
      {
        codigo: "R1.1.4",
        descripcion: "Plan de acción si TML no cumple",
        estado: estado(r1_1_4_cumple),
        evidencia: `${mesesConPlan}/${mesesFuera.length} meses fuera de meta con plan (${pctConPlan}%)`,
      },
      {
        codigo: "R1.1.5",
        descripcion: "TML muestra mejoras o resultados consistentes",
        estado: estado(r1_1_5_cumple),
        evidencia: `TML global ${tml.promedioTml} min, ${tml.pctDentroMeta}% dentro meta 30 min`,
      },
    ]

    const cumplenTodos = requisitos.filter((r) => r.estado === "cumple").length
    const parciales = requisitos.filter((r) => r.estado === "parcial").length
    let scoreTexto: string
    let scoreValor: number
    if (cumplenTodos === 5) {
      scoreValor = 5
      scoreTexto = "5/5 — Cumple todos los requisitos"
    } else if (cumplenTodos === 4 && !requisitos.find((r) => r.codigo === "R1.1.5" && r.estado !== "cumple")) {
      scoreValor = 3
      scoreTexto = "3/5 — Falta solo R1.1.5"
    } else if (cumplenTodos >= 3) {
      scoreValor = 1
      scoreTexto = `1/5 — ${cumplenTodos} cumplidos, ${parciales} parciales`
    } else {
      scoreValor = 0
      scoreTexto = `0/5 — ${cumplenTodos} cumplidos, ${parciales} parciales`
    }

    const now = new Date()

    return {
      data: {
        generado_en: now.toISOString(),
        pilar: "Entrega",
        punto: "1.1",
        titulo: "PRE RUTA",
        score_estimado: {
          valor: scoreValor,
          texto: scoreTexto,
          requisitos,
        },
        r1_1_1_sop: {
          archivo: "1.1 - SOP - Procesos de Pre - Ruta 2025.docx",
          ultima_revision: "2026-04-14",
          secciones_clave: [
            "Ingreso biométrico (antes de 07:00)",
            "Entrega de documentación (SDR → chofer)",
            "Reunión matinal (07:00-07:12)",
            "Inicio de ruta en Foxtrot",
            "Verificación de carga",
            "Checklist de liberación (app DPO)",
          ],
        },
        r1_1_2_ejecucion: {
          owd_total_observaciones: owd.totalObservaciones,
          owd_promedio_cumplimiento: owd.promedioCumplimiento,
          owd_obs_mes_actual: owd.obsMesActual,
          owd_items_fallados: owd.itemsMasFallados,
          owd_por_etapa: owd.porEtapa,
        },
        r1_1_3_capacitacion: {
          matriz: skap,
        },
        r1_1_4_planes: {
          total_meses_fuera_meta: mesesFuera.length,
          meses_con_plan: mesesConPlan,
          pct_con_plan: pctConPlan,
          resumen: planes,
        },
        r1_1_5_tml: {
          promedio_tml_actual: tml.promedioTml,
          pct_dentro_meta_actual: tml.pctDentroMeta,
          meta_minutos: 30,
          meta_pct: 65,
          mensual: tml.mensual,
          comparado_yoy: tml.comparadoYoY,
          mensual_en_meta: mensualEnMeta,
          mensual_total: tml.mensual.length,
        },
        mensual_resumen: {
          mes: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
