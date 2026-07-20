"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  calcularDisponibilidadMes,
  flotaDeRuta,
  noDisponiblesEnFecha,
  ruteoSetDe,
  TARGET_DISP,
  type UnidadFlota,
  type UnidadNoDisponible,
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

/** Services que entran en "próximos": los que vencen dentro de este horizonte. */
const HORIZONTE_SERVICES_DIAS = 30

export interface FlotaRuteoReunion {
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
    /**
     * Unidades paradas EL DÍA de la reunión (no del mes): es lo que se mira al
     * abrir el detalle de la tarjeta, para hablar de "qué tenemos abajo hoy".
     * Ojo: el % de arriba es del mes acumulado, así que este listado explica la
     * foto del día, no reconstruye ese porcentaje.
     */
    noDisponiblesHoy: UnidadNoDisponible[]
    /** Unidades de reparto consideradas (denominador del %): excluye depósito. */
    unidadesFlota: number
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

/**
 * Datos del bloque de Flota de la reunión de logística de los lunes, sobre el
 * mes en curso, para que el número coincida con el que la misma gente ve en el
 * tablero de Indicadores de Flota y no se discutan dos cifras distintas del
 * mismo indicador. El volumen reprogramado (VRL/VRC) va aparte, en la tarjeta
 * de Pedidos con problemas (reuniones-pedidos-problemas.ts).
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

  const mes = fechaReunion.slice(0, 7)
  const inicioMes = `${mes}-01`

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
          "dominio, fecha, tipo, estado, observaciones, fuera_servicio_desde, fuera_servicio_hasta"
        )
        .not("fuera_servicio_desde", "is", null)
        .or(`fuera_servicio_hasta.is.null,fuera_servicio_hasta.gte.${inicioMes}`),
      supabase
        .from("flota_indisponibilidad")
        .select("dominio, fecha_desde, fecha_hasta, motivo")
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
  const mttos = (mttosRes.data ?? []) as MantenimientoRealizado[]
  const indisp = (indispRes.data ?? []) as FlotaIndisponibilidad[]
  const calc = calcularDisponibilidadMes(
    mes,
    flota,
    mttos,
    indisp,
    ruteoSet,
    fechaReunion
  )
  const noDisponiblesHoy = noDisponiblesEnFecha(
    fechaReunion,
    flota,
    mttos,
    indisp,
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
        noDisponiblesHoy,
        unidadesFlota: flota.length,
      },
    },
  }
}
