"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, requireRole, getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { runFuerasRutaSync } from "@/lib/sync/fueras-ruta-sync"

type Result<T> = { data: T } | { error: string }

const ROLES_PUEDEN_SYNC = ["admin", "admin_rrhh", "supervisor"] as const

export interface FueraRutaFila {
  id_cliente: number
  fecha_entrega: string
  eliminado: boolean
  items_total: number
  items_no_anulados: number
  unidades_total: number
  monto_aprox: number
  razon_social: string | null
  des_canal_mkt: string | null
  des_localidad: string | null
  id_ruta: number | null
  des_ruta: string | null
  id_personal: number | null
  des_personal: string | null
  dias_visita_iso: number[] | null
  dow_iso_entrega: number
  es_fuera_de_ruta: boolean | null
}

export interface AggPorPersonal {
  id_personal: number | null
  des_personal: string | null
  pedidos: number
  fuera_de_ruta: number
  porc: number
}

export interface AggPorRuta {
  id_ruta: number | null
  des_ruta: string | null
  des_personal: string | null
  pedidos: number
  fuera_de_ruta: number
  porc: number
}

export interface SyncRunResumen {
  id: string
  desde: string
  hasta: string
  started_at: string
  finished_at: string | null
  status: string
  stats: unknown
  error_msg: string | null
}

export interface FuerasDeRutaIndicador {
  desde: string
  hasta: string
  totalPedidos: number
  totalFueraDeRuta: number
  totalSinRutaPre: number
  porcFueraDeRuta: number
  porPersonal: AggPorPersonal[]
  porRuta: AggPorRuta[]
  filas: FueraRutaFila[]
  ultimoSync: SyncRunResumen | null
  truncated: boolean
}

const MAX_FILAS = 10000
const PAGE = 1000

function isYYYYMMDD(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function mesPrevioRange(): { desde: string; hasta: string } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-11; el mes anterior es m-1
  const desde = new Date(Date.UTC(y, m - 1, 1))
  const hasta = new Date(Date.UTC(y, m, 0)) // día 0 del mes actual = último día del mes anterior
  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
  }
}

function diffDays(desde: string, hasta: string): number {
  const a = Date.UTC(
    Number(desde.slice(0, 4)),
    Number(desde.slice(5, 7)) - 1,
    Number(desde.slice(8, 10)),
  )
  const b = Date.UTC(
    Number(hasta.slice(0, 4)),
    Number(hasta.slice(5, 7)) - 1,
    Number(hasta.slice(8, 10)),
  )
  return Math.floor((b - a) / 86_400_000)
}

export async function getFuerasDeRutaIndicador(
  params?: { desde?: string; hasta?: string },
): Promise<Result<FuerasDeRutaIndicador>> {
  try {
    await requireAuth()
    if (!IS_MISIONES) {
      return { error: "El indicador de Fueras de Ruta solo está disponible en Misiones." }
    }

    const defaults = mesPrevioRange()
    const desde = isYYYYMMDD(params?.desde) ? params!.desde! : defaults.desde
    const hasta = isYYYYMMDD(params?.hasta) ? params!.hasta! : defaults.hasta
    if (diffDays(desde, hasta) < 0) {
      return { error: "El rango es inválido: 'desde' es posterior a 'hasta'." }
    }

    const supabase = await createClient()

    // ── Detalle paginado desde la vista ──
    const filas: FueraRutaFila[] = []
    let truncated = false
    for (let offset = 0; offset < MAX_FILAS; offset += PAGE) {
      const { data, error } = await supabase
        .from("v_fueras_de_ruta_misiones")
        .select(
          "id_cliente, fecha_entrega, eliminado, items_total, items_no_anulados, unidades_total, monto_aprox, razon_social, des_canal_mkt, des_localidad, id_ruta, des_ruta, id_personal, des_personal, dias_visita_iso, dow_iso_entrega, es_fuera_de_ruta",
        )
        .gte("fecha_entrega", desde)
        .lte("fecha_entrega", hasta)
        .order("fecha_entrega", { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) return { error: error.message }
      if (!data || data.length === 0) break
      filas.push(...(data as FueraRutaFila[]))
      if (data.length < PAGE) break
      if (offset + PAGE >= MAX_FILAS) truncated = true
    }

    // ── KPIs y agregados (excluye pedidos eliminados, e items_no_anulados=0) ──
    let totalPedidos = 0
    let totalFueraDeRuta = 0
    let totalSinRutaPre = 0
    const porPersonalMap = new Map<string, AggPorPersonal>()
    const porRutaMap = new Map<string, AggPorRuta>()

    for (const f of filas) {
      if (f.eliminado) continue
      if (f.items_no_anulados === 0) continue
      totalPedidos++
      const fuera = f.es_fuera_de_ruta === true
      if (fuera) totalFueraDeRuta++
      if (f.es_fuera_de_ruta === null && f.id_ruta == null) totalSinRutaPre++

      const personalKey = String(f.id_personal ?? "null")
      const aggP = porPersonalMap.get(personalKey) ?? {
        id_personal: f.id_personal,
        des_personal: f.des_personal,
        pedidos: 0,
        fuera_de_ruta: 0,
        porc: 0,
      }
      aggP.pedidos++
      if (fuera) aggP.fuera_de_ruta++
      porPersonalMap.set(personalKey, aggP)

      const rutaKey = String(f.id_ruta ?? "null")
      const aggR = porRutaMap.get(rutaKey) ?? {
        id_ruta: f.id_ruta,
        des_ruta: f.des_ruta,
        des_personal: f.des_personal,
        pedidos: 0,
        fuera_de_ruta: 0,
        porc: 0,
      }
      aggR.pedidos++
      if (fuera) aggR.fuera_de_ruta++
      porRutaMap.set(rutaKey, aggR)
    }

    for (const v of porPersonalMap.values()) {
      v.porc = v.pedidos > 0 ? (v.fuera_de_ruta / v.pedidos) * 100 : 0
    }
    for (const v of porRutaMap.values()) {
      v.porc = v.pedidos > 0 ? (v.fuera_de_ruta / v.pedidos) * 100 : 0
    }
    const porPersonal = Array.from(porPersonalMap.values()).sort(
      (a, b) => b.fuera_de_ruta - a.fuera_de_ruta || b.pedidos - a.pedidos,
    )
    const porRuta = Array.from(porRutaMap.values()).sort(
      (a, b) => b.fuera_de_ruta - a.fuera_de_ruta || b.pedidos - a.pedidos,
    )

    // ── Último sync run del módulo ──
    const { data: ultimo } = await supabase
      .from("chess_sync_runs_misiones")
      .select("id, desde, hasta, started_at, finished_at, status, stats, error_msg")
      .eq("modulo", "fueras_de_ruta")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const porcFueraDeRuta =
      totalPedidos > 0 ? (totalFueraDeRuta / totalPedidos) * 100 : 0

    return {
      data: {
        desde,
        hasta,
        totalPedidos,
        totalFueraDeRuta,
        totalSinRutaPre,
        porcFueraDeRuta,
        porPersonal,
        porRuta,
        filas,
        ultimoSync: (ultimo as SyncRunResumen | null) ?? null,
        truncated,
      },
    }
  } catch (err) {
    console.error("getFuerasDeRutaIndicador error", err)
    return { error: "No se pudo cargar el indicador de Fueras de Ruta." }
  }
}

export async function sincronizarFuerasDeRuta(input: {
  desde: string
  hasta: string
}): Promise<Result<{
  rutas: { total: number; preVigentes: number }
  clientes: { total: number; conRutaPre: number; sinRutaPre: number }
  pedidos: { diasConsultados: number; pedidosInsertados: number; itemsTotal: number; itemsNoAnulados: number }
  ms: number
}>> {
  try {
    if (!IS_MISIONES) {
      return { error: "Solo disponible en Misiones." }
    }
    await requireRole([...ROLES_PUEDEN_SYNC])

    if (!isYYYYMMDD(input.desde) || !isYYYYMMDD(input.hasta)) {
      return { error: "Las fechas deben tener formato YYYY-MM-DD." }
    }
    const days = diffDays(input.desde, input.hasta)
    if (days < 0) return { error: "El rango es inválido: 'desde' posterior a 'hasta'." }
    if (days > 90) return { error: "El rango máximo permitido es 90 días." }

    const today = new Date().toISOString().slice(0, 10)
    if (input.hasta > today) {
      return { error: "El 'hasta' no puede ser una fecha futura." }
    }

    const profile = await getProfile()
    const admin = createAdminClient()
    const res = await runFuerasRutaSync(
      { desde: input.desde, hasta: input.hasta, triggeredBy: profile?.id ?? null },
      admin,
    )

    revalidatePath("/indicadores/fueras-de-ruta")

    return {
      data: {
        rutas: res.rutas,
        clientes: res.clientes,
        pedidos: res.pedidos,
        ms: res.ms,
      },
    }
  } catch (err) {
    console.error("sincronizarFuerasDeRuta error", err)
    const msg = err instanceof Error ? err.message : "Error en el sync."
    return { error: msg }
  }
}
