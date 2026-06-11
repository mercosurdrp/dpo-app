"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

export interface NpsResumen {
  anio: number
  nps: number
  encuestas: number
  promoters: number
  pasivos: number
  detractores: number
  rmd: number | null
  rmd_respuestas: number
  ultima_encuesta: string | null
  /** Última corrida OK del sync con el Power BI (nps_sync_log). */
  actualizado_en: string | null
}

export interface NpsMes {
  mes: number // 1-12
  nps: number | null
  encuestas: number
  promoters: number
  pasivos: number
  detractores: number
  rmd: number | null
  otif_interno: number | null // 1 - bultos_rechazados/bultos_entregados (def. 109)
}

export interface NpsSubdriver {
  subdriver: string
  encuestas_dp: number
}

export interface NpsDriver {
  driver: string
  encuestas_dp: number // encuestas Detractor+Pasivo que lo marcaron como primario
  subdrivers: NpsSubdriver[] // motivos específicos dentro del driver
}

export interface NpsPromotorVenta {
  promotor: string
  nps: number
  encuestas: number
  promoters: number
  pasivos: number
  detractores: number
}

export interface NpsClienteDP {
  cod_cliente: number
  nombre_cliente: string
  localidad: string | null
  categoria: "Detractor" | "Passive"
  score: number
  fecha_enc: string
  n_encuestas: number
  drivers: string[]
  /** Pares [driver primario, subdriver] que puntuó (todas sus encuestas D+P). */
  drivers_detalle: Array<[string, string | null]>
  comentario: string | null
  promotor: string | null
}

export interface NpsDashboardData {
  resumen: NpsResumen
  por_mes: NpsMes[]
  drivers_dp: NpsDriver[]
  por_promotor: NpsPromotorVenta[]
  clientes_dp: NpsClienteDP[]
}

interface EncuestaRow {
  fecha_enc: string
  cod_cliente: number
  nombre_cliente: string | null
  localidad: string | null
  score: number
  categoria: "Promoter" | "Passive" | "Detractor"
  driver_primario: string | null
  drivers: Array<[string | null, string | null]> | null
  comentario: string | null
  promotor: string | null
}

const ANIO = 2026

export async function getNpsDashboard(): Promise<Result<NpsDashboardData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [encRes, metRes, rechRes, syncRes] = await Promise.all([
      supabase
        .from("nps_encuestas")
        .select(
          "fecha_enc, cod_cliente, nombre_cliente, localidad, score, categoria, driver_primario, drivers, comentario, promotor",
        )
        .gte("fecha_enc", `${ANIO}-01-01`)
        .lt("fecha_enc", `${ANIO + 1}-01-01`)
        .order("fecha_enc", { ascending: true })
        .limit(10000),
      supabase
        .from("nps_metricas_mensuales")
        .select("anio, mes, rmd, rmd_puntuadas")
        .eq("anio", ANIO),
      // OTIF interno (def. de 109_pc_otif_real_desde_rechazos), ya agregado por mes.
      supabase
        .from("v_nps_otif_mensual")
        .select("mes, otif_interno")
        .eq("anio", ANIO),
      supabase
        .from("nps_sync_log")
        .select("ejecutado_en")
        .eq("ok", true)
        .order("ejecutado_en", { ascending: false })
        .limit(1),
    ])

    if (encRes.error) return { error: encRes.error.message }
    const encuestas = (encRes.data ?? []) as unknown as EncuestaRow[]

    const rmdPorMes = new Map<number, { rmd: number | null; n: number }>()
    for (const m of (metRes.data ?? []) as Array<{
      mes: number
      rmd: number | null
      rmd_puntuadas: number | null
    }>) {
      rmdPorMes.set(m.mes, { rmd: m.rmd, n: m.rmd_puntuadas ?? 0 })
    }

    const otifPorMes = new Map<number, number | null>()
    for (const r of (rechRes.data ?? []) as Array<{
      mes: number
      otif_interno: number | null
    }>) {
      otifPorMes.set(r.mes, r.otif_interno)
    }

    // ---- resumen anual ----
    const cuenta = { Promoter: 0, Passive: 0, Detractor: 0 }
    for (const e of encuestas) cuenta[e.categoria] += 1
    const total = encuestas.length
    const nps = total
      ? round1(((cuenta.Promoter - cuenta.Detractor) / total) * 100)
      : 0

    let rmdSum = 0
    let rmdN = 0
    for (const { rmd, n } of rmdPorMes.values()) {
      if (rmd != null && n > 0) {
        rmdSum += rmd * n
        rmdN += n
      }
    }

    const resumen: NpsResumen = {
      anio: ANIO,
      nps,
      encuestas: total,
      promoters: cuenta.Promoter,
      pasivos: cuenta.Passive,
      detractores: cuenta.Detractor,
      rmd: rmdN ? round2(rmdSum / rmdN) : null,
      rmd_respuestas: rmdN,
      ultima_encuesta: encuestas.length
        ? encuestas[encuestas.length - 1].fecha_enc
        : null,
      actualizado_en:
        ((syncRes.data ?? []) as Array<{ ejecutado_en: string }>)[0]
          ?.ejecutado_en ?? null,
    }

    // ---- por mes ----
    const meses = new Map<
      number,
      { Promoter: number; Passive: number; Detractor: number }
    >()
    for (const e of encuestas) {
      const mes = Number(e.fecha_enc.slice(5, 7))
      const cur = meses.get(mes) ?? { Promoter: 0, Passive: 0, Detractor: 0 }
      cur[e.categoria] += 1
      meses.set(mes, cur)
    }
    const mesMax = Math.max(...meses.keys(), ...rmdPorMes.keys(), 1)
    const por_mes: NpsMes[] = []
    for (let mes = 1; mes <= mesMax; mes++) {
      const c = meses.get(mes)
      const t = c ? c.Promoter + c.Passive + c.Detractor : 0
      por_mes.push({
        mes,
        nps: c && t ? round1(((c.Promoter - c.Detractor) / t) * 100) : null,
        encuestas: t,
        promoters: c?.Promoter ?? 0,
        pasivos: c?.Passive ?? 0,
        detractores: c?.Detractor ?? 0,
        rmd: rmdPorMes.get(mes)?.rmd ?? null,
        otif_interno: otifPorMes.get(mes) ?? null,
      })
    }

    // ---- drivers (encuestas Detractor+Pasivo, primarios y subdrivers distintos por encuesta) ----
    const dpEnc = encuestas.filter((e) => e.categoria !== "Promoter")
    const driverCount = new Map<string, number>()
    const subCount = new Map<string, Map<string, number>>()
    for (const e of dpEnc) {
      const prims = new Set<string>()
      const pares = new Set<string>()
      for (const par of e.drivers ?? []) {
        if (par?.[0]) {
          prims.add(par[0])
          if (par[1]) pares.add(JSON.stringify([par[0], par[1]]))
        }
      }
      if (prims.size === 0 && e.driver_primario) prims.add(e.driver_primario)
      for (const d of prims) {
        driverCount.set(d, (driverCount.get(d) ?? 0) + 1)
      }
      for (const key of pares) {
        const [p, s] = JSON.parse(key) as [string, string]
        const m = subCount.get(p) ?? new Map<string, number>()
        m.set(s, (m.get(s) ?? 0) + 1)
        subCount.set(p, m)
      }
    }
    const drivers_dp: NpsDriver[] = [...driverCount.entries()]
      .map(([driver, n]) => ({
        driver,
        encuestas_dp: n,
        subdrivers: [...(subCount.get(driver) ?? new Map()).entries()]
          .map(([subdriver, sn]) => ({ subdriver, encuestas_dp: sn as number }))
          .sort((a, b) => b.encuestas_dp - a.encuestas_dp),
      }))
      .sort((a, b) => b.encuestas_dp - a.encuestas_dp)

    // ---- NPS por promotor (vendedor de preventa vigente en Chess) ----
    const porProm = new Map<
      string,
      { Promoter: number; Passive: number; Detractor: number }
    >()
    for (const e of encuestas) {
      if (!e.promotor) continue
      const cur = porProm.get(e.promotor) ?? {
        Promoter: 0,
        Passive: 0,
        Detractor: 0,
      }
      cur[e.categoria] += 1
      porProm.set(e.promotor, cur)
    }
    const por_promotor: NpsPromotorVenta[] = [...porProm.entries()]
      .map(([promotor, c]) => {
        const t = c.Promoter + c.Passive + c.Detractor
        return {
          promotor,
          nps: round1(((c.Promoter - c.Detractor) / t) * 100),
          encuestas: t,
          promoters: c.Promoter,
          pasivos: c.Passive,
          detractores: c.Detractor,
        }
      })
      .sort((a, b) => a.nps - b.nps || b.detractores - a.detractores)

    // ---- clientes detractores/pasivos (última encuesta por cliente) ----
    const porCliente = new Map<number, EncuestaRow[]>()
    for (const e of dpEnc) {
      const arr = porCliente.get(e.cod_cliente) ?? []
      arr.push(e)
      porCliente.set(e.cod_cliente, arr)
    }
    const clientes_dp: NpsClienteDP[] = [...porCliente.entries()]
      .map(([cod, arr]) => {
        const u = arr[arr.length - 1] // encuestas vienen ordenadas asc
        const drivers = new Set<string>()
        const detalle = new Map<string, [string, string | null]>()
        for (const e of arr) {
          for (const par of e.drivers ?? []) {
            if (par?.[0]) {
              drivers.add(par[0])
              detalle.set(JSON.stringify(par), [par[0], par[1] ?? null])
            }
          }
        }
        return {
          cod_cliente: cod,
          nombre_cliente: u.nombre_cliente ?? `Cliente ${cod}`,
          localidad: u.localidad,
          categoria: u.categoria as "Detractor" | "Passive",
          score: u.score,
          fecha_enc: u.fecha_enc,
          n_encuestas: arr.length,
          drivers: [...drivers],
          drivers_detalle: [...detalle.values()],
          comentario: u.comentario,
          promotor: u.promotor,
        }
      })
      .sort(
        (a, b) =>
          Number(a.categoria !== "Detractor") -
            Number(b.categoria !== "Detractor") || a.score - b.score,
      )

    return {
      data: { resumen, por_mes, drivers_dp, por_promotor, clientes_dp },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando el dashboard NPS",
    }
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
