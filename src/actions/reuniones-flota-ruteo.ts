"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getPool } from "@/lib/mercosur-dashboard"
import {
  calcularDisponibilidadMes,
  flotaDeRuta,
  ruteoSetDe,
  TARGET_DISP,
  type UnidadFlota,
} from "@/lib/vehiculos/disponibilidad-flota"
import {
  loadServiceGeneral,
  type ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import { servicesVencidosDesdeProgramacion } from "@/lib/vehiculos/flota-kpis"
import { today } from "@/lib/vehiculos/lecturas"
import type {
  DiaRuteo,
  FlotaIndisponibilidad,
  MantenimientoRealizado,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA =
  "El bloque de Flota y Ruteo solo está disponible en Pampeana."

/** Días de la ventana de ruteo: la semana previa a la reunión. */
const VENTANA_DIAS = 7

/** Services que entran en "próximos": los que vencen dentro de este horizonte. */
const HORIZONTE_SERVICES_DIAS = 30

export interface DiaRuteoReunion {
  fecha: string
  vrlHl: number
  vrlBultos: number
  vrlPedidos: number
  /** null = no se pudo consultar el dashboard Mercosur (≠ 0 reprogramado). */
  vrcHl: number | null
  vrcBultos: number | null
}

export interface FlotaRuteoReunion {
  ruteo: {
    desde: string
    hasta: string
    dias: DiaRuteoReunion[]
    totalVrlHl: number
    totalVrlBultos: number
    /** null si el VRC no se pudo leer: no se totaliza lo que no se conoce. */
    totalVrcHl: number | null
    totalVrcBultos: number | null
    /** Mensaje a mostrar cuando el VRC no está disponible. */
    vrcError: string | null
  }
  flota: {
    mes: string
    disponibilidadPct: number | null
    disponibilidadTarget: number
    utilizacionPct: number | null
    combustibleKml: number | null
    combustibleTarget: number | null
    combustibleLitros: number
    combustibleKm: number
    servicesVencidos: number
    servicesTarget: number | null
    proximosServices: ServiceGeneralUnidad[]
    /**
     * Fecha a la que están calculados los services. Es HOY, no la fecha de la
     * reunión: la proyección parte del km actual de cada unidad, que sale de su
     * última lectura, y no hay estado histórico para reconstruirlo a una fecha
     * pasada. En una reunión retroactiva (ej. el lunes 6 abierto el 16) la UI lo
     * aclara, en vez de hacer pasar la foto de hoy por la de ese día.
     */
    servicesAlDia: string
  }
}

function sumar(valores: Array<number | null | undefined>): number {
  return valores.reduce<number>((acc, v) => acc + (Number(v) || 0), 0)
}

/** PostgREST topea en 1000 filas: un mes de ruteo (≈40 unidades × 30 días) pasa
 *  ese techo y las filas que faltan se leerían como "no ruteó". */
const PAGE = 1000

async function traerTodo<T>(
  query: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[] } | { error: string }> {
  const out: T[] = []
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await query(desde, desde + PAGE - 1)
    if (error) return { error: error.message }
    const filas = data ?? []
    out.push(...filas)
    if (filas.length < PAGE) return { data: out }
  }
}

function diaAnterior(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00`)
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Datos del bloque Flota y Ruteo de la reunión de logística de los lunes.
 *
 * Dos ventanas distintas a propósito:
 * - Ruteo (VRL/VRC): los 7 días previos a la reunión, día por día.
 * - Flota: el mes en curso, para que el número coincida con el que la misma
 *   gente ve en el tablero de Indicadores de Flota y no se discutan dos cifras
 *   distintas del mismo indicador.
 */
export async function getFlotaRuteoReunion(
  fechaReunion: string
): Promise<Result<FlotaRuteoReunion>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaReunion)) {
    return { error: "Fecha de reunión inválida (formato esperado YYYY-MM-DD)" }
  }

  const supabase = await createClient()

  const hasta = diaAnterior(fechaReunion, 1)
  const desde = diaAnterior(fechaReunion, VENTANA_DIAS)
  const mes = fechaReunion.slice(0, 7)
  const inicioMes = `${mes}-01`

  // ── Ruteo: VRL ────────────────────────────────────────────────────────────
  // Vía v_vrl_diario: entrega_cortes tiene RLS sólo para service_role y leerla
  // directo devolvería 0 filas sin error.
  const vrlRes = await supabase
    .from("v_vrl_diario")
    .select("fecha, hl, bultos, pedidos_reprogramados")
    .gte("fecha", desde)
    .lte("fecha", hasta)
  if (vrlRes.error) {
    return { error: `No se pudo leer el VRL: ${vrlRes.error.message}` }
  }
  const vrlPorDia = new Map<
    string,
    { hl: number; bultos: number; pedidos: number }
  >()
  for (const r of vrlRes.data ?? []) {
    vrlPorDia.set(String(r.fecha), {
      hl: Number(r.hl ?? 0),
      bultos: Number(r.bultos ?? 0),
      pedidos: Number(r.pedidos_reprogramados ?? 0),
    })
  }

  // ── Ruteo: VRC ────────────────────────────────────────────────────────────
  // Vive en la Railway del dashboard Mercosur. Si no responde se informa como
  // error visible: en un cuadro de 7 días, un cero silencioso se leería como
  // "no hubo reprogramado por crédito" y es una conclusión falsa.
  const vrcPorDia = new Map<string, { hl: number; bultos: number }>()
  let vrcError: string | null = null
  try {
    const pool = getPool()
    const { rows } = await pool.query<{
      fecha: string
      hl: string | null
      bultos: string | null
    }>(
      `select to_char(fecha_entrega_original, 'YYYY-MM-DD') as fecha,
              sum(hl) as hl, sum(bultos) as bultos
         from vol_reprog_com_pedido
        where lower(region) = 'pampeana'
          and fecha_entrega_original between $1 and $2
        group by 1`,
      [desde, hasta]
    )
    for (const r of rows) {
      vrcPorDia.set(r.fecha, {
        hl: Number(r.hl ?? 0),
        bultos: Number(r.bultos ?? 0),
      })
    }
  } catch (e) {
    vrcError =
      e instanceof Error
        ? `VRC no disponible (dashboard Mercosur): ${e.message}`
        : "VRC no disponible: no se pudo consultar el dashboard Mercosur."
  }

  const dias: DiaRuteoReunion[] = []
  for (let i = VENTANA_DIAS; i >= 1; i--) {
    const fecha = diaAnterior(fechaReunion, i)
    const vrl = vrlPorDia.get(fecha)
    const vrc = vrcPorDia.get(fecha)
    dias.push({
      fecha,
      vrlHl: vrl?.hl ?? 0,
      vrlBultos: vrl?.bultos ?? 0,
      vrlPedidos: vrl?.pedidos ?? 0,
      vrcHl: vrcError ? null : (vrc?.hl ?? 0),
      vrcBultos: vrcError ? null : (vrc?.bultos ?? 0),
    })
  }

  // ── Flota: disponibilidad del mes en curso ────────────────────────────────
  // Las paradas que arrancaron antes del mes siguen contando: se traen las OT
  // con retorno dentro del mes o todavía sin cerrar.
  const [unidadesRes, mttosRes, indispRes, ruteoRes, metasRes, combRes] =
    await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo, sector, modelo, anio")
        .eq("active", true),
      supabase
        .from("mantenimiento_realizados")
        .select(
          "dominio, fecha, tipo, estado, fuera_servicio_desde, fuera_servicio_hasta"
        )
        .not("fuera_servicio_desde", "is", null)
        .or(`fuera_servicio_hasta.is.null,fuera_servicio_hasta.gte.${inicioMes}`),
      supabase
        .from("flota_indisponibilidad")
        .select("dominio, fecha_desde, fecha_hasta")
        .gte("fecha_hasta", inicioMes),
      traerTodo<DiaRuteo>((desde, hasta) =>
        supabase
          .from("vista_dias_ruteo")
          .select("dominio, fecha")
          .gte("fecha", inicioMes)
          .range(desde, hasta)
      ),
      supabase.from("flota_metas").select("kpi, meta, comparador, unidad"),
      traerTodo<{ litros: number | null; km_recorridos: number | null }>(
        (desde, hasta) =>
          supabase
            .from("registro_combustible")
            .select("litros, km_recorridos")
            .gte("fecha", inicioMes)
            .lte("fecha", fechaReunion)
            .range(desde, hasta)
      ),
    ])

  const primerError =
    unidadesRes.error?.message ??
    mttosRes.error?.message ??
    indispRes.error?.message ??
    ("error" in ruteoRes ? ruteoRes.error : null) ??
    metasRes.error?.message ??
    ("error" in combRes ? combRes.error : null)
  if (primerError) {
    return { error: `No se pudieron leer los datos de flota: ${primerError}` }
  }
  if ("error" in ruteoRes || "error" in combRes) {
    return { error: "No se pudieron leer los datos de flota" }
  }

  const flota = flotaDeRuta((unidadesRes.data ?? []) as UnidadFlota[])
  const ruteoSet = ruteoSetDe(ruteoRes.data)
  const calc = calcularDisponibilidadMes(
    mes,
    flota,
    (mttosRes.data ?? []) as MantenimientoRealizado[],
    (indispRes.data ?? []) as FlotaIndisponibilidad[],
    ruteoSet,
    fechaReunion
  )

  // ── Flota: combustible del mes ────────────────────────────────────────────
  // Rendimiento agregado Σkm/Σlitros, igual criterio que el tablero de flota:
  // sólo suman los litros de cargas que declararon km, si no el km/l se hunde.
  const conKm = combRes.data.filter((c) => Number(c.km_recorridos) > 0)
  const combustibleKm = sumar(conKm.map((c) => c.km_recorridos))
  const combustibleLitros = sumar(conKm.map((c) => c.litros))
  const combustibleKml =
    combustibleLitros > 0
      ? Math.round((combustibleKm / combustibleLitros) * 100) / 100
      : null

  // ── Flota: próximos services ──────────────────────────────────────────────
  const programacion = await loadServiceGeneral(supabase)
  const proximosServices = programacion
    .filter(
      (p) =>
        p.estado === "vencido" ||
        (p.diasRestantes != null && p.diasRestantes <= HORIZONTE_SERVICES_DIAS)
    )
    .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0))

  const metas = (metasRes.data ?? []) as Array<{ kpi: string; meta: number | null }>
  const metaDe = (kpi: string) =>
    metas.find((m) => m.kpi === kpi)?.meta ?? null

  return {
    data: {
      ruteo: {
        desde,
        hasta,
        dias,
        totalVrlHl: sumar(dias.map((d) => d.vrlHl)),
        totalVrlBultos: sumar(dias.map((d) => d.vrlBultos)),
        totalVrcHl: vrcError ? null : sumar(dias.map((d) => d.vrcHl)),
        totalVrcBultos: vrcError ? null : sumar(dias.map((d) => d.vrcBultos)),
        vrcError,
      },
      flota: {
        mes,
        disponibilidadPct: calc.flotaDisp,
        disponibilidadTarget: metaDe("disponibilidad") ?? TARGET_DISP,
        utilizacionPct: calc.flotaUtil,
        combustibleKml,
        combustibleTarget: metaDe("combustible_kml"),
        combustibleLitros,
        combustibleKm,
        servicesVencidos: servicesVencidosDesdeProgramacion(programacion),
        servicesTarget: metaDe("services_vencidos"),
        proximosServices,
        servicesAlDia: today(),
      },
    },
  }
}
