"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, getMiEmpleado } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { TML_META_MINUTOS } from "@/lib/tml/calculo"
import {
  buildComoVenimosPampeana,
  type NumerosPersonaPampeana,
  type SeriePorFecha,
} from "@/lib/indicadores/como-venimos-pampeana"
import { buildMiIncentivoPampeana, type MiIncentivo } from "@/lib/indicadores/incentivo-pampeana"
import { buildAvanceCapacitaciones, type MiAvanceCapacitaciones } from "@/lib/indicadores/capacitaciones-personal"

// «Cómo venimos» — el tablero diario del equipo de entrega (DPO Entrega 2.1).
// Réplica del de Distribuciones (mismos 5 PI, misma pantalla) con las fuentes
// de Pampeana: ver `lib/indicadores/como-venimos-pampeana.ts`.
//
// R2.1.1 pide que el equipo vea el desempeño DIARIO de sus principales PI (la
// guía pide de 3 a 5). R2.1.4, que cada uno vea SUS números sin que un líder
// se los muestre: el operario recibe sólo su fila; la tabla persona por
// persona le llega únicamente a supervisión, y el corte es del servidor.

const DIAS_SERIE = 7

export type PiId = "asistencia_preruta" | "tml" | "entregas_ok" | "rechazo" | "clickeo"

export interface ComoVenimosPi {
  id: PiId
  titulo: string
  unidad: string
  dec: number
  meta: number
  /** "mayor" = cumple si valor ≥ meta; "menor" = cumple si valor ≤ meta. */
  sentido: "mayor" | "menor"
  /** Valor del último día CERRADO con dato. */
  valor: number | null
  fecha_valor: string | null
  /** Valor del día en curso, provisorio. */
  valor_hoy: number | null
  serie: { fecha: string; valor: number | null }[]
  habilita_incentivo: boolean
  como_se_calcula: string
  /** Cómo se calcula el número de cada persona, si difiere del del equipo. */
  como_se_calcula_persona?: string
}

/** Roles que ven los números de TODO el equipo, persona por persona. */
const ROLES_VEN_EQUIPO = ["admin", "supervisor", "admin_rrhh", "auditor"]

export interface ComoVenimosData {
  hoy: string
  pis: ComoVenimosPi[]
  avisos: string[]
  mes_desde: string
  /** Los números del que mira. null si no está vinculado o no salió en el mes. */
  mis_numeros: NumerosPersonaPampeana | null
  /** Persona por persona — SOLO supervisión. */
  equipo: NumerosPersonaPampeana[] | null
  mi_incentivo: MiIncentivo | null
  mis_capacitaciones: MiAvanceCapacitaciones | null
}

// Metas. 🚨 TML 25 es la constante del tablero de TML; rechazo 1,7 % y clickeo
// 90 % son las de la matinal de Distribución de Pampeana. Entregas 98 % y
// asistencia a la pre-ruta 90 % todavía no tienen meta oficial: son las que
// propone el tablero hasta que la operación las fije.
const DEF_PI: Omit<ComoVenimosPi, "valor" | "fecha_valor" | "valor_hoy" | "serie">[] = [
  {
    id: "asistencia_preruta",
    titulo: "Asistencia a la pre-ruta",
    unidad: "%",
    dec: 1,
    meta: 90,
    sentido: "mayor",
    habilita_incentivo: false,
    como_se_calcula:
      "De los que salieron a la calle, cuántos marcaron la reunión pre-ruta en la app. Pergamino no se cuenta: ahí no hay check-in de pre-ruta.",
  },
  {
    id: "tml",
    titulo: "TML",
    unidad: "min",
    dec: 0,
    meta: TML_META_MINUTOS,
    sentido: "menor",
    habilita_incentivo: false,
    como_se_calcula:
      "Desde la hora de entrada del turno hasta que el camión sale por portería, promedio del día. Mismo número que el tablero de TML.",
  },
  {
    id: "entregas_ok",
    titulo: "Entregas exitosas",
    unidad: "%",
    dec: 1,
    meta: 98,
    sentido: "mayor",
    habilita_incentivo: false,
    como_se_calcula: "Clientes entregados sobre clientes de la hoja de ruta de Foxtrot. Solo rutas ya cerradas.",
  },
  {
    id: "rechazo",
    titulo: "Rechazo",
    unidad: "%",
    dec: 2,
    meta: 1.7,
    sentido: "menor",
    habilita_incentivo: true,
    como_se_calcula: "HL rechazados sobre HL vendidos, por fecha de venta. El mismo «Rechazos %» de la matinal.",
    como_se_calcula_persona:
      "Tus bultos rechazados sobre los bultos de tus camiones (el mismo número de «Mis rechazos»).",
  },
  {
    id: "clickeo",
    titulo: "Clickeo Foxtrot",
    unidad: "%",
    dec: 1,
    meta: 90,
    sentido: "mayor",
    habilita_incentivo: false,
    como_se_calcula: "Qué tan completo se carga el viaje en el celular (Driver Click Score), promedio de las rutas.",
  },
]

function hoyArg(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
}

function ultimasFechas(dias: number, hasta: string): string[] {
  const [y, m, d] = hasta.split("-").map(Number)
  const base = Date.UTC(y, m - 1, d, 12)
  const out: string[] = []
  for (let i = dias - 1; i >= 0; i--) out.push(new Date(base - i * 86400000).toISOString().slice(0, 10))
  return out
}

function armarPis(series: Record<PiId, SeriePorFecha> | null, fechas: string[], hoy: string): ComoVenimosPi[] {
  return DEF_PI.map((d) => {
    const serie = series?.[d.id] ?? {}
    let valor: number | null = null
    let fecha: string | null = null
    for (let i = fechas.length - 1; i >= 0; i--) {
      const f = fechas[i]
      if (f === hoy) continue
      if (serie[f] != null) {
        valor = serie[f]
        fecha = f
        break
      }
    }
    return {
      ...d,
      valor,
      fecha_valor: fecha,
      valor_hoy: serie[hoy] ?? null,
      serie: fechas.map((f) => ({ fecha: f, valor: serie[f] ?? null })),
    }
  })
}

export async function getComoVenimos(): Promise<{ data: ComoVenimosData } | { error: string }> {
  try {
    if (IS_MISIONES) return { error: "Disponible solo en Pampeana" }
    const profile = await requireAuth()
    const admin = createAdminClient()
    const empleado = await getMiEmpleado()

    const hoy = hoyArg()
    const mesDesde = `${hoy.slice(0, 7)}-01`
    const fechas = ultimasFechas(DIAS_SERIE, hoy)
    const avisos: string[] = []

    const [base, capacitaciones] = await Promise.all([
      buildComoVenimosPampeana(admin, mesDesde, fechas[0], hoy).catch((e: unknown) => {
        avisos.push(`No se pudieron calcular los indicadores: ${e instanceof Error ? e.message : "error"}`)
        return null
      }),
      empleado
        ? buildAvanceCapacitaciones(admin, empleado.id).catch(() => {
            avisos.push("No se pudieron leer tus capacitaciones.")
            return null
          })
        : Promise.resolve(null),
    ])

    const misNumeros = empleado && base ? (base.personas.get(empleado.id) ?? null) : null
    const equipo =
      base && ROLES_VEN_EQUIPO.includes(profile.role)
        ? Array.from(base.personas.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        : null

    let miIncentivo: MiIncentivo | null = null
    if (misNumeros) {
      try {
        miIncentivo = await buildMiIncentivoPampeana(admin, misNumeros, Number(hoy.slice(0, 4)))
      } catch {
        avisos.push("No se pudo leer el programa de incentivos.")
      }
    }

    return {
      data: {
        hoy,
        pis: armarPis(base?.equipo ?? null, fechas, hoy),
        avisos,
        mes_desde: mesDesde,
        mis_numeros: misNumeros,
        equipo,
        mi_incentivo: miIncentivo,
        mis_capacitaciones: capacitaciones,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error armando el tablero" }
  }
}

/**
 * La pantalla de UNA persona, tal como la ve ella. Sólo supervisión, y el
 * corte es del SERVIDOR: el guard del empleado es del navegador y no alcanza.
 */
export async function getVistaPersona(empleadoId: string): Promise<
  | {
      data: {
        persona: NumerosPersonaPampeana
        incentivo: MiIncentivo | null
        capacitaciones: MiAvanceCapacitaciones | null
        pis: ComoVenimosPi[]
        mes_desde: string
      }
    }
  | { error: string }
> {
  try {
    if (IS_MISIONES) return { error: "Disponible solo en Pampeana" }
    const profile = await requireAuth()
    if (!ROLES_VEN_EQUIPO.includes(profile.role)) return { error: "No encontrado" }
    const admin = createAdminClient()

    const hoy = hoyArg()
    const mesDesde = `${hoy.slice(0, 7)}-01`
    const base = await buildComoVenimosPampeana(admin, mesDesde, mesDesde, hoy)
    const persona = base.personas.get(empleadoId)
    if (!persona) return { error: "Esta persona no salió a la calle este mes" }

    const [incentivo, capacitaciones] = await Promise.all([
      buildMiIncentivoPampeana(admin, persona, Number(hoy.slice(0, 4))).catch(() => null),
      buildAvanceCapacitaciones(admin, empleadoId).catch(() => null),
    ])

    return {
      data: { persona, incentivo, capacitaciones, pis: armarPis(null, [], hoy), mes_desde: mesDesde },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error armando la vista" }
  }
}
