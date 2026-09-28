"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { tareaDelCiclo } from "@/lib/flota/cil-tareas"
import {
  TIPOS_CIL_PROGRAMADOS,
  TOLERANCIA_DIAS,
  fechasCilDelMes,
  proximaFechaCil,
} from "@/lib/flota/cil-programacion"
import {
  DIAS_VENTANA_CHOFER,
  choferesPorUnidad,
  fechaMenosDias,
} from "@/lib/flota/cil-choferes"

/**
 * Programación del CIL: a cada camión le tocan dos días sorteados por mes, y acá
 * se ve qué pasó con cada uno.
 *
 * 🚨 No hay tabla de programación: los días se calculan con
 * `lib/flota/cil-programacion` y son siempre los mismos para la misma unidad y
 * el mismo mes. Lo único que se lee de la base es lo que se CARGÓ, para decir si
 * el día se cumplió o se venció.
 *
 * 🚨 Esto NO reemplaza la cobertura de `cil-cobertura.ts`, que es lo que mira el
 * auditor: la cobertura pregunta si la unidad cerró las tres letras del ciclo en
 * el mes, y esto pregunta si las hizo EL DÍA que le tocaba. Una unidad puede
 * estar al día en la cobertura y tener los dos días vencidos (las hizo cuando
 * quiso), y al revés no: si cumplió los dos días, cerró el ciclo.
 */

export type EstadoDiaCil =
  | "hecha"
  | "fuera_de_fecha"
  | "hoy"
  | "pendiente"
  | "vencida"

export interface TareaDelDia {
  fecha: string
  tarea: string
  operario: string
}

export interface DiaCil {
  /** El día sorteado, `YYYY-MM-DD`. */
  fecha: string
  estado: EstadoDiaCil
  /** Lo que se cargó para ese día (el día exacto o dentro de la tolerancia). */
  tareas: TareaDelDia[]
}

export interface UnidadProgramada {
  dominio: string
  numero: string | null
  /** Nombre del chofer, para saber a quién se le está pidiendo. */
  chofer: string | null
  choferOrigen: "checklists" | "ficha" | null
  dias: DiaCil[]
}

export interface ProgramacionCilMes {
  ym: string
  hoy: string
  unidades: UnidadProgramada[]
  totales: {
    dias: number
    hechas: number
    fueraDeFecha: number
    vencidas: number
    hoy: number
    pendientes: number
  }
}

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function inicioMesSiguiente(ym: string): string {
  const [a, m] = ym.split("-").map(Number)
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`
}

/** Días de diferencia entre dos fechas `YYYY-MM-DD` (a − b). */
function diasEntre(a: string, b: string): number {
  const ms = (f: string) => {
    const [y, m, d] = f.split("-").map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(a) - ms(b)) / 86_400_000)
}

/**
 * Reparte las tareas cargadas del mes entre los días sorteados de cada unidad.
 *
 * 🚨 Cada tarea va al día sorteado MÁS CERCANO dentro de la tolerancia y a uno
 * solo: con los dos días pegados (el 15 y el 16, que puede pasar) una misma
 * carga contaba para los dos y la unidad cerraba el mes con un solo lavado.
 */
function repartir(
  fechas: string[],
  tareas: TareaDelDia[],
): Map<string, TareaDelDia[]> {
  const out = new Map<string, TareaDelDia[]>(fechas.map((f) => [f, []]))
  for (const t of tareas) {
    let mejor: string | null = null
    let mejorDist = Infinity
    for (const f of fechas) {
      const dist = Math.abs(diasEntre(t.fecha, f))
      if (dist <= TOLERANCIA_DIAS && dist < mejorDist) {
        mejor = f
        mejorDist = dist
      }
    }
    if (mejor) out.get(mejor)!.push(t)
  }
  return out
}

function estadoDelDia(
  fecha: string,
  tareas: TareaDelDia[],
  hoy: string,
): EstadoDiaCil {
  if (tareas.some((t) => t.fecha === fecha)) return "hecha"
  if (tareas.length > 0) return "fuera_de_fecha"
  if (fecha === hoy) return "hoy"
  return fecha > hoy ? "pendiente" : "vencida"
}

export async function getProgramacionCilMes(
  ym?: string,
): Promise<{ data: ProgramacionCilMes } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArgentina()
    const mes = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : hoy.slice(0, 7)

    const programados = TIPOS_CIL_PROGRAMADOS as readonly string[]
    const { data: veh, error: errVeh } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio, tipo")
      .eq("active", true)
      .order("dominio")
    if (errVeh) return { error: errVeh.message }

    const dominios = (veh || [])
      .filter((v: { tipo: string | null }) => programados.includes(v.tipo ?? ""))
      .map((v: { dominio: string }) => v.dominio)

    // Las tareas se piden con la tolerancia incluida a los dos lados del mes: un
    // día sorteado el 2 puede haberse cumplido el 30 del mes anterior.
    const desde = fechaMenosDias(`${mes}-01`, TOLERANCIA_DIAS)
    const hasta = inicioMesSiguiente(mes)
    const [cilRes, fichasRes, choferes] = await Promise.all([
      supabase
        .from("mantenimiento_cil")
        .select("fecha, dominio, tarea, operario")
        .in("dominio", dominios)
        .gte("fecha", desde)
        .lt("fecha", fechaMenosDias(hasta, -TOLERANCIA_DIAS))
        .order("fecha", { ascending: false }),
      supabase
        .from("vehiculos_ficha")
        .select("dominio, numero_asignado")
        .in("dominio", dominios),
      choferesPorUnidad(
        supabase,
        dominios,
        fechaMenosDias(hoy, DIAS_VENTANA_CHOFER),
      ),
    ])
    if (cilRes.error) return { error: cilRes.error.message }

    const numeros = new Map(
      ((fichasRes.data || []) as Array<{
        dominio: string
        numero_asignado: string | null
      }>).map((f) => [f.dominio, f.numero_asignado]),
    )

    const porDominio = new Map<string, TareaDelDia[]>()
    for (const t of (cilRes.data || []) as Array<{
      fecha: string
      dominio: string
      tarea: string
      operario: string
    }>) {
      if (!porDominio.has(t.dominio)) porDominio.set(t.dominio, [])
      porDominio.get(t.dominio)!.push({
        fecha: t.fecha.slice(0, 10),
        // El histórico guarda `limpieza`, que es la misma letra que
        // `limpieza_profunda`: se normaliza acá como en toda lectura.
        tarea: tareaDelCiclo(t.tarea),
        operario: t.operario,
      })
    }

    const unidades: UnidadProgramada[] = dominios.map((dominio) => {
      const fechas = fechasCilDelMes(dominio, mes)
      const reparto = repartir(fechas, porDominio.get(dominio) ?? [])
      const chofer = choferes.get(dominio)
      return {
        dominio,
        numero: numeros.get(dominio) ?? null,
        chofer: chofer?.nombre ?? null,
        choferOrigen: chofer?.origen ?? null,
        dias: fechas.map((f) => {
          const tareas = reparto.get(f) ?? []
          return { fecha: f, estado: estadoDelDia(f, tareas, hoy), tareas }
        }),
      }
    })

    const todos = unidades.flatMap((u) => u.dias)
    return {
      data: {
        ym: mes,
        hoy,
        unidades,
        totales: {
          dias: todos.length,
          hechas: todos.filter((d) => d.estado === "hecha").length,
          fueraDeFecha: todos.filter((d) => d.estado === "fuera_de_fecha").length,
          vencidas: todos.filter((d) => d.estado === "vencida").length,
          hoy: todos.filter((d) => d.estado === "hoy").length,
          pendientes: todos.filter((d) => d.estado === "pendiente").length,
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ----- La vista del chofer -----

export interface MiUnidadProgramada {
  dominio: string
  numero: string | null
  /** Los dos días de ESTE mes, con lo que pasó en cada uno. */
  dias: DiaCil[]
  /** La próxima fecha que le toca, incluso si cae el mes que viene. */
  proxima: string | null
  /** Le toca hoy y todavía no cargó nada. */
  esHoy: boolean
}

export interface MiProgramacionCil {
  hoy: string
  unidades: MiUnidadProgramada[]
}

/**
 * Los días del chofer logueado: sólo las unidades que son suyas.
 *
 * 🚨 "Suyas" = las que viene cargando en el checklist diario (ver
 * `lib/flota/cil-choferes`). Un supervisor que no carga checklists no ve nada
 * acá, y está bien: la programación del mes completa la ve en la solapa CIL.
 */
export async function getMiProgramacionCil(): Promise<
  { data: MiProgramacionCil } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArgentina()
    const mes = hoy.slice(0, 7)

    const programados = TIPOS_CIL_PROGRAMADOS as readonly string[]
    const { data: veh, error: errVeh } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio, tipo")
      .eq("active", true)
      .order("dominio")
    if (errVeh) return { error: errVeh.message }

    const dominios = (veh || [])
      .filter((v: { tipo: string | null }) => programados.includes(v.tipo ?? ""))
      .map((v: { dominio: string }) => v.dominio)

    const choferes = await choferesPorUnidad(
      supabase,
      dominios,
      fechaMenosDias(hoy, DIAS_VENTANA_CHOFER),
    )
    const mias = dominios.filter((d) => choferes.get(d)?.userId === profile.id)
    if (mias.length === 0) return { data: { hoy, unidades: [] } }

    const [cilRes, fichasRes] = await Promise.all([
      supabase
        .from("mantenimiento_cil")
        .select("fecha, dominio, tarea, operario")
        .in("dominio", mias)
        .gte("fecha", fechaMenosDias(`${mes}-01`, TOLERANCIA_DIAS))
        .order("fecha", { ascending: false }),
      supabase
        .from("vehiculos_ficha")
        .select("dominio, numero_asignado")
        .in("dominio", mias),
    ])
    if (cilRes.error) return { error: cilRes.error.message }

    const numeros = new Map(
      ((fichasRes.data || []) as Array<{
        dominio: string
        numero_asignado: string | null
      }>).map((f) => [f.dominio, f.numero_asignado]),
    )
    const porDominio = new Map<string, TareaDelDia[]>()
    for (const t of (cilRes.data || []) as Array<{
      fecha: string
      dominio: string
      tarea: string
      operario: string
    }>) {
      if (!porDominio.has(t.dominio)) porDominio.set(t.dominio, [])
      porDominio.get(t.dominio)!.push({
        fecha: t.fecha.slice(0, 10),
        tarea: tareaDelCiclo(t.tarea),
        operario: t.operario,
      })
    }

    const unidades: MiUnidadProgramada[] = mias.map((dominio) => {
      const fechas = fechasCilDelMes(dominio, mes)
      const reparto = repartir(fechas, porDominio.get(dominio) ?? [])
      const dias = fechas.map((f) => {
        const tareas = reparto.get(f) ?? []
        return { fecha: f, estado: estadoDelDia(f, tareas, hoy), tareas }
      })
      return {
        dominio,
        numero: numeros.get(dominio) ?? null,
        dias,
        proxima: proximaFechaCil(dominio, hoy),
        esHoy: dias.some((d) => d.estado === "hoy"),
      }
    })

    return { data: { hoy, unidades } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

