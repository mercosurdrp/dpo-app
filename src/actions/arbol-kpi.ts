"use server"
/**
 * Valores del Árbol de KPI: Rechazo (ver `@/lib/arbol-kpi/rechazo` para la
 * topología y para qué quedó afuera y por qué).
 *
 * Cada nodo se publica con dos números, igual que el árbol corporativo:
 *   - MTH: el mes en curso.
 *   - YTD: del 1 de enero a hoy.
 *
 * Todo sale de fuentes que ya alimentan otras pantallas de la app: no se
 * inventa ningún cálculo nuevo, para que el árbol no diga algo distinto del
 * módulo del que cuelga.
 */

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { cumplimientoPct } from "@/lib/ocupacion-bodega"
import { esRutaLimpia } from "@/lib/foxtrot/ruta-limpia"
import { getFueraRutaMensual } from "@/actions/fuera-ruta"
import { getDqi } from "@/actions/dqi"

export interface NodoValor {
  mth: number | null
  ytd: number | null
}

export interface ArbolKpiData {
  anio: number
  mes: number
  mesLabel: string
  /** key del nodo → valores. Un nodo sin dato no aparece o viene en null. */
  valores: Record<string, NodoValor>
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

/** Hoy en hora argentina (la app corre en UTC en Vercel). */
function hoyAR(): { anio: number; mes: number; iso: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const iso = fmt.format(new Date())
  const [y, m] = iso.split("-").map(Number)
  return { anio: y, mes: m, iso }
}

function div(a: number, b: number): number | null {
  return b > 0 ? a / b : null
}

function prom(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Paginado genérico: PostgREST corta en 1000 y el año se pasa largo. */
async function traerTodo<T>(
  hacerQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await hacerQuery(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

export async function getArbolKpiRechazo(): Promise<
  { data: ArbolKpiData } | { error: string }
> {
  try {
    await requireAuth()
    if (IS_MISIONES) {
      return { error: "El árbol de KPI por ahora sólo está armado para Pampeana." }
    }

    const { anio, mes, iso: hoy } = hoyAR()
    const desdeAnio = `${anio}-01-01`
    const desdeMes = `${anio}-${String(mes).padStart(2, "0")}-01`
    const sb = await createClient()

    const enMes = (fecha: string) => fecha >= desdeMes

    // ── Ventas distribuidas (HL y bultos) ────────────────────────────────
    const ventas = await traerTodo<{ fecha: string; total_hl: number | null; total_bultos: number | null }>(
      (from, to) =>
        sb
          .from("ventas_diarias")
          .select("fecha, total_hl, total_bultos")
          .gte("fecha", desdeAnio)
          .lte("fecha", hoy)
          .order("id", { ascending: true })
          .range(from, to),
    )

    // ── Rechazos (HL por motivo y pedidos afectados) ─────────────────────
    const rechazos = await traerTodo<{
      fecha_venta: string
      hl_rechazados: number | null
      id_rechazo: number | null
      ds_rechazo: string | null
      id_cliente: number | null
    }>((from, to) =>
      sb
        .from("rechazos")
        .select("fecha_venta, hl_rechazados, id_rechazo, ds_rechazo, id_cliente")
        .gte("fecha_venta", desdeAnio)
        .lte("fecha_venta", hoy)
        .order("id", { ascending: true })
        .range(from, to),
    )

    // ── Ocupación de bodega (CEq y HL cargados) ──────────────────────────
    const ob = await traerTodo<{ fecha: string; ceq_total: number | null; hl_total: number | null }>(
      (from, to) =>
        sb
          .from("ocupacion_bodega_diaria")
          .select("fecha, ceq_total, hl_total")
          .gte("fecha", desdeAnio)
          .lte("fecha", hoy)
          .gt("ceq_total", 0)
          .order("fecha", { ascending: true })
          .order("patente", { ascending: true })
          .range(from, to),
    )

    // ── Km recorridos: odómetro del checklist (retorno − liberación) ─────
    // 🚨 NO se usa `raw_data.fx_driven_m`: llega inconsistente desde el CSV de
    // ROUTE_ANALYTICS y por eso la operación dio de baja "Km recorridos" de la
    // matinal el 21/07/2026. El odómetro es la misma fuente que ya alimenta el
    // indicador de km del tablero de reuniones.
    const KM_MAX_DIA = 2000
    const checklists = await traerTodo<{
      fecha: string
      dominio: string
      tipo: string
      odometro: number | null
    }>((from, to) =>
      sb
        .from("checklist_vehiculos")
        .select("fecha, dominio, tipo, odometro")
        .gte("fecha", desdeAnio)
        .lte("fecha", hoy)
        .not("odometro", "is", null)
        .order("fecha", { ascending: true })
        .range(from, to),
    )

    /** Km por camión-día: retorno − liberación, descartando saltos absurdos. */
    function kmDelPeriodo(soloMes: boolean): number {
      const porDia = new Map<string, { lib: number[]; ret: number[] }>()
      for (const c of checklists) {
        if (soloMes && !enMes(c.fecha)) continue
        const odo = Number(c.odometro ?? 0)
        if (!Number.isFinite(odo) || odo <= 0) continue
        const clave = `${c.fecha}|${(c.dominio || "").trim().toUpperCase()}`
        const acc = porDia.get(clave) ?? { lib: [], ret: [] }
        if (c.tipo === "liberacion") acc.lib.push(odo)
        else if (c.tipo === "retorno") acc.ret.push(odo)
        porDia.set(clave, acc)
      }
      let total = 0
      for (const { lib, ret } of porDia.values()) {
        if (lib.length === 0 || ret.length === 0) continue
        const km = Math.max(...ret) - Math.min(...lib)
        if (km > 0 && km <= KM_MAX_DIA) total += km
      }
      return total
    }

    // ── Foxtrot: una sola query con raw_data PROYECTADO ──────────────────
    // 🚨 Traer raw_data entero mata la consulta (son documentos grandes): se
    // piden sólo las claves necesarias con ->>, que llegan como texto.
    const foxRaw = await traerTodo<Record<string, unknown>>((from, to) =>
      sb
        .from("foxtrot_routes")
        .select(
          "fecha, tiempo_ruta_minutos, total_deliveries, deliveries_successful, driver_click_score, adherencia_secuencia, is_finalized, " +
            "ini:raw_data->>started_timestamp, fin:raw_data->>finalized_timestamp, " +
            "visited:raw_data->>tml_visited_customers, plan_sec:raw_data->>fx_planned_journey_sec",
        )
        .gte("fecha", desdeAnio)
        .lte("fecha", hoy)
        .order("fecha", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
    )

    type Ruta = {
      fecha: string
      minutos: number | null
      click: number | null
      adherencia: number | null
      visited: number | null
      planSec: number | null
      limpia: boolean
    }
    const num = (v: unknown): number | null => {
      if (v == null || v === "") return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const rutas: Ruta[] = foxRaw.map((r) => ({
      fecha: String(r.fecha),
      minutos: num(r.tiempo_ruta_minutos),
      click: num(r.driver_click_score),
      adherencia: num(r.adherencia_secuencia),
      visited: num(r.visited) ?? num(r.deliveries_successful) ?? num(r.total_deliveries),
      planSec: num(r.plan_sec),
      limpia: esRutaLimpia(
        r.ini == null ? null : String(r.ini),
        r.fin == null ? null : String(r.fin),
      ),
    }))

    // ── Armado de los dos períodos ───────────────────────────────────────
    function calcular(soloMes: boolean): Record<string, number | null> {
      const v = ventas.filter((r) => (soloMes ? enMes(r.fecha) : true))
      const rech = rechazos.filter((r) => (soloMes ? enMes(r.fecha_venta) : true))
      const o = ob.filter((r) => (soloMes ? enMes(r.fecha) : true))
      const rt = rutas.filter((r) => (soloMes ? enMes(r.fecha) : true))
      const rtLimpias = rt.filter((r) => r.limpia)

      const hlDistribuido = v.reduce((a, r) => a + Number(r.total_hl ?? 0), 0)
      const hlRechazado = rech.reduce((a, r) => a + Number(r.hl_rechazados ?? 0), 0)
      const hlCargado = o.reduce((a, r) => a + Number(r.hl_total ?? 0), 0)
      const ceqCargado = o.reduce((a, r) => a + Number(r.ceq_total ?? 0), 0)

      // Pedidos = cliente × fecha distintos (mismo criterio que el Árbol del
      // Sueño para Sin Dinero / Cerrado). Los pedidos totales salen de las
      // ventas por cliente, que hoy no están en ventas_diarias: se usa como
      // denominador la cantidad de clientes visitados por las rutas.
      const pedidosVisitados = rtLimpias.reduce((a, r) => a + (r.visited ?? 0), 0)
      const claveRech = (r: { fecha_venta: string; id_cliente: number | null }) =>
        `${r.fecha_venta}|${r.id_cliente ?? "s/c"}`
      const pedidosConRechazo = new Set(rech.map(claveRech)).size

      const pctMotivo = (test: (ds: string, id: number | null) => boolean): number | null => {
        const n = new Set(
          rech.filter((r) => test((r.ds_rechazo ?? "").toUpperCase(), r.id_rechazo)).map(claveRech),
        ).size
        const d = div(n, pedidosVisitados)
        return d == null ? null : d * 100
      }

      const kmRecorridos = kmDelPeriodo(soloMes)
      const visitados = rtLimpias.reduce((a, r) => a + (r.visited ?? 0), 0)

      const dispersionTiempo = (() => {
        const conPlan = rtLimpias.filter((r) => (r.planSec ?? 0) > 0 && (r.minutos ?? 0) > 0)
        const real = conPlan.reduce((a, r) => a + (r.minutos ?? 0) * 60, 0)
        const plan = conPlan.reduce((a, r) => a + (r.planSec ?? 0), 0)
        const d = div(real - plan, plan)
        return d == null ? null : d * 100
      })()

      const rechazoPct = div(hlRechazado, hlDistribuido)

      return {
        rechazo: rechazoPct == null ? null : rechazoPct * 100,
        vol_entregado_pdv: hlDistribuido > 0 ? hlDistribuido : null,
        vol_cargado_camion: hlCargado > 0 ? hlCargado : null,
        rechazo_pedidos: (() => {
          const d = div(pedidosConRechazo, pedidosVisitados)
          return d == null ? null : d * 100
        })(),
        tmr: prom(rtLimpias.map((r) => r.minutos).filter((m): m is number => m != null && m > 0).map((m) => m / 60)),
        ob: o.length > 0 ? cumplimientoPct(ceqCargado / o.length) : null,
        pdv_camion: prom(rtLimpias.map((r) => r.visited).filter((n): n is number => n != null && n > 0)),
        click_score: prom(rt.map((r) => r.click).filter((n): n is number => n != null)),
        adherencia_secuencia: prom(rt.map((r) => r.adherencia).filter((n): n is number => n != null)),
        dispersion_tiempo: dispersionTiempo,
        cajas_km: div(ceqCargado, kmRecorridos),
        drop_size: div(hlDistribuido, visitados),
        rech_sin_dinero: pctMotivo((ds, id) => id === 6 || ds.includes("SIN DINERO")),
        rech_cerrado: pctMotivo((ds, id) => id === 1 || ds.includes("CERRADO")),
        // "No pedido" del árbol de Tucumán no existe en nuestro catálogo: se
        // reemplaza por los motivos que de verdad pesan acá, priorizando los
        // que la operación puede cambiar (lo que pide la auditoría).
        rech_producto_no_apto: pctMotivo((ds) => ds.includes("PRODUCTO NO APTO")),
        rech_sin_envases: pctMotivo((ds) => ds.includes("SIN ENVASES")),
        // El catálogo trae la variante con y sin tilde: se matchean las dos.
        rech_error_distribucion: pctMotivo((ds) => ds.startsWith("ERROR DE DISTRIBUCI")),
      }
    }

    const mth = calcular(true)
    const ytd = calcular(false)

    // ── Fuera de ruta: ya tiene su propia action mensual ─────────────────
    try {
      const fr = await getFueraRutaMensual(13)
      if ("data" in fr) {
        const claveMes = `${anio}-${String(mes).padStart(2, "0")}`
        const delAnio = fr.data.filter((m) => m.anio_mes.startsWith(String(anio)))
        const hlFrMes = fr.data.find((m) => m.anio_mes === claveMes)?.hl ?? null
        const hlFrAnio = delAnio.reduce((a, m) => a + Number(m.hl ?? 0), 0)
        // Se expresa como % del volumen distribuido, para que sea comparable.
        mth.fuera_ruta =
          hlFrMes != null && mth.vol_entregado_pdv
            ? (hlFrMes / mth.vol_entregado_pdv) * 100
            : null
        ytd.fuera_ruta = ytd.vol_entregado_pdv
          ? (hlFrAnio / ytd.vol_entregado_pdv) * 100
          : null
      }
    } catch {
      mth.fuera_ruta = null
      ytd.fuera_ruta = null
    }

    // ── DQI: viene del tablero del depósito, un fetch por mes ────────────
    // Se pide sólo el mes en curso: el YTD exigiría 12 llamadas al tablero y
    // hoy ese endpoint no publica la serie corregida (pendiente del punto 1.4).
    try {
      const dqi = await getDqi(anio, mes)
      if ("data" in dqi) {
        const d = dqi.data as { correccion?: { ppm_corregido?: number | null } | null }
        mth.dqi = d.correccion?.ppm_corregido ?? null
      }
    } catch {
      mth.dqi = null
    }
    ytd.dqi = null

    const valores: Record<string, NodoValor> = {}
    for (const key of new Set([...Object.keys(mth), ...Object.keys(ytd)])) {
      valores[key] = { mth: mth[key] ?? null, ytd: ytd[key] ?? null }
    }

    return {
      data: {
        anio,
        mes,
        mesLabel: MESES[mes - 1],
        valores,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
