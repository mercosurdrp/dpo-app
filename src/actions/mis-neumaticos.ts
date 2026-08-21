"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import {
  TIPOS_NEUMATICOS_OBLIGATORIOS,
  cubiertaConforme,
} from "@/lib/flota/neumaticos-control"

/**
 * Mis Neumáticos — el chofer u operador mide sus propias cubiertas una vez por
 * mes: profundidad de dibujo y presión (DPO Flota 3.4).
 *
 * Mismo camino que Mi CIL: hasta ahora las mediciones sólo se cargaban desde el
 * módulo de Neumáticos de `/vehiculos/mantenimiento`, que pide rol admin o
 * supervisor. Con 13 unidades y 85 cubiertas, medir una vez por mes desde una
 * sola pantalla de escritorio no ocurre.
 *
 * 🚨 Escribe en `mantenimiento_neumatico_mediciones`, la MISMA tabla que ya usa
 * el módulo del supervisor y de la que sale el KPI `neumaticos_conformidad`. No
 * hay tabla nueva ni número paralelo.
 */

import {
  PROF_MIN_MM,
  PROF_MAX_MM,
  PRESION_MIN_PSI,
  PRESION_MAX_PSI,
} from "@/lib/flota/neumaticos-control"

export interface CubiertaMedir {
  id: string
  /** Posición en la unidad: 1D, 1I, 2DE, 2DI, 2IE, 2II, AUX. */
  posicion: string | null
  eje: string | null
  numero: string | null
  marca: string | null
  medida: string | null
  /** Último dibujo conocido, para que el chofer vea de dónde viene. */
  profundidadActual: number | null
  /** Medición de ESTE mes, si ya la cargó. */
  medidaEsteMes: {
    fecha: string
    profundidad_mm: number | null
    presion_psi: number | null
  } | null
}

export interface UnidadNeumaticos {
  dominio: string
  tipo: string | null
  numero: string | null
  cubiertas: CubiertaMedir[]
  /** Cuántas cubiertas ya tienen medición este mes. */
  medidas: number
  total: number
  completa: boolean
}

export interface MisNeumaticosData {
  ym: string
  unidades: UnidadNeumaticos[]
  /** Unidades del alcance con el mes cerrado. */
  completas: number
  totalUnidades: number
  limites: { profMin: number; psiMin: number; psiMax: number }
}

function ymActual(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7)
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
  return m === 12
    ? `${a + 1}-01-01`
    : `${a}-${String(m + 1).padStart(2, "0")}-01`
}

export async function getMisNeumaticos(): Promise<
  { data: MisNeumaticosData } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const ym = ymActual()

    const tipos = TIPOS_NEUMATICOS_OBLIGATORIOS as readonly string[]

    const [vehRes, neuRes] = await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo")
        .eq("active", true)
        .in("tipo", tipos)
        .order("dominio"),
      supabase
        .from("mantenimiento_neumaticos")
        .select("id, dominio, posicion, eje, numero, marca, medida, profundidad_actual_mm")
        .eq("estado", "instalado")
        .order("posicion"),
    ])

    if (vehRes.error) return { error: vehRes.error.message }
    if (neuRes.error) return { error: neuRes.error.message }

    const dominios = (vehRes.data || []).map((v) => v.dominio)
    const cubiertas = (neuRes.data || []).filter((n) =>
      dominios.includes(n.dominio),
    )

    // Mediciones del mes, sólo de estas cubiertas.
    const ids = cubiertas.map((c) => c.id)
    const { data: meds, error: medErr } = ids.length
      ? await supabase
          .from("mantenimiento_neumatico_mediciones")
          .select("neumatico_id, fecha, profundidad_mm, presion_psi")
          .in("neumatico_id", ids)
          .gte("fecha", `${ym}-01`)
          .lt("fecha", inicioMesSiguiente(ym))
          .order("fecha", { ascending: false })
      : { data: [], error: null }
    if (medErr) return { error: medErr.message }

    // La primera de cada cubierta es la más reciente del mes.
    const porCubierta = new Map<
      string,
      { fecha: string; profundidad_mm: number | null; presion_psi: number | null }
    >()
    for (const m of meds || []) {
      if (!porCubierta.has(m.neumatico_id)) {
        porCubierta.set(m.neumatico_id, {
          fecha: m.fecha,
          profundidad_mm: m.profundidad_mm,
          presion_psi: m.presion_psi,
        })
      }
    }

    const { data: fichas } = await supabase
      .from("vehiculos_ficha")
      .select("dominio, numero_asignado")
      .in("dominio", dominios)
    const numeros = new Map(
      (fichas || []).map((f: { dominio: string; numero_asignado: string | null }) => [
        f.dominio,
        f.numero_asignado,
      ]),
    )

    const unidades: UnidadNeumaticos[] = (vehRes.data || []).map((v) => {
      const propias = cubiertas
        .filter((c) => c.dominio === v.dominio)
        .map((c) => ({
          id: c.id,
          posicion: c.posicion,
          eje: c.eje,
          numero: c.numero,
          marca: c.marca,
          medida: c.medida,
          profundidadActual: c.profundidad_actual_mm,
          medidaEsteMes: porCubierta.get(c.id) ?? null,
        }))
      const medidas = propias.filter((c) => c.medidaEsteMes).length
      return {
        dominio: v.dominio,
        tipo: v.tipo,
        numero: numeros.get(v.dominio) ?? null,
        cubiertas: propias,
        medidas,
        total: propias.length,
        // 🚨 Una unidad sin cubiertas cargadas en el maestro NO está "completa":
        // sería un 100 % que en realidad es "no hay nada que medir".
        completa: propias.length > 0 && medidas === propias.length,
      }
    })

    return {
      data: {
        ym,
        unidades,
        completas: unidades.filter((u) => u.completa).length,
        totalUnidades: unidades.length,
        limites: {
          profMin: PROF_MIN_MM,
          psiMin: PRESION_MIN_PSI,
          psiMax: PRESION_MAX_PSI,
        },
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export interface MedicionInput {
  neumatico_id: string
  profundidad_mm: number | null
  presion_psi: number | null
}

/**
 * Guarda las mediciones de una unidad. Se cargan todas juntas porque el chofer
 * recorre el camión una sola vez, no cubierta por cubierta.
 *
 * 🚨 Las cubiertas que vengan sin ningún valor se SALTEAN, no se guardan en
 * cero: un cero es un dibujo de 0 mm y dispararía el desvío.
 */
export async function guardarMedicionesNeumaticos(
  dominio: string,
  mediciones: MedicionInput[],
  km?: number | null,
): Promise<{ success: true; guardadas: number; desvios: number } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const dom = String(dominio || "").trim().toUpperCase()
    if (!dom) return { error: "Elegí la unidad." }

    const utiles = (mediciones || []).filter(
      (m) => m.neumatico_id && (m.profundidad_mm != null || m.presion_psi != null),
    )
    if (utiles.length === 0) {
      return { error: "Cargá al menos una cubierta con profundidad o presión." }
    }

    // 🚨 Segundo control del rango, del lado del servidor. La pantalla ya exige
    // el decimal, pero la validación que sólo vive en el navegador no protege el
    // dato: una cubierta cargada con 115 mm en vez de 11,5 queda impecable para
    // siempre y nadie la mira más.
    for (const m of utiles) {
      if (m.profundidad_mm != null) {
        if (m.profundidad_mm <= 0 || m.profundidad_mm > PROF_MAX_MM) {
          return {
            error: `Profundidad fuera de rango (${m.profundidad_mm} mm). Tiene que estar entre 0 y ${PROF_MAX_MM} mm.`,
          }
        }
      }
      if (m.presion_psi != null && (m.presion_psi <= 0 || m.presion_psi > 200)) {
        return { error: `Presión fuera de rango (${m.presion_psi} psi).` }
      }
    }

    // Las cubiertas tienen que ser de esta unidad y estar instaladas: si no, la
    // medición queda colgada de una cubierta que ya no rueda ahí.
    const { data: propias, error: pErr } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id")
      .eq("dominio", dom)
      .eq("estado", "instalado")
    if (pErr) return { error: pErr.message }
    const validas = new Set((propias || []).map((p) => p.id))
    const filtradas = utiles.filter((m) => validas.has(m.neumatico_id))
    if (filtradas.length === 0) {
      return { error: "Esas cubiertas ya no figuran instaladas en la unidad." }
    }

    // 🚨 La escritura va con el cliente de servicio, NO con la sesión del que
    // mide. Las dos tablas de cubiertas tienen RLS de admin/supervisor —son del
    // módulo de mantenimiento—, así que al chofer la base le rechazaba el
    // insert con "row-level security" y la pantalla no guardaba nada: el 11/08
    // el AE908DG se midió entero y no entró una sola fila. Quién midió queda en
    // `created_by`, y arriba ya se validó el rango y que la cubierta esté
    // instalada en esa unidad.
    const escritura = createAdminClient()

    const fecha = hoyArgentina()
    const { error } = await escritura.from("mantenimiento_neumatico_mediciones").insert(
      filtradas.map((m) => ({
        neumatico_id: m.neumatico_id,
        fecha,
        profundidad_mm: m.profundidad_mm,
        presion_psi: m.presion_psi,
        km: km ?? null,
        nota: "Control mensual cargado por el operador",
        created_by: profile.id,
      })),
    )
    if (error) return { error: error.message }

    // 🚨 `profundidad_actual_mm` de la cubierta es lo que mira el módulo del
    // supervisor y el cálculo de desgaste: si sólo se inserta la medición, esa
    // pantalla sigue mostrando el dibujo viejo.
    for (const m of filtradas) {
      if (m.profundidad_mm != null) {
        // Sin mirar el error, un rechazo acá dejaba la medición cargada y la
        // cubierta con el dibujo viejo, sin avisarle a nadie.
        const { error: updErr } = await escritura
          .from("mantenimiento_neumaticos")
          .update({ profundidad_actual_mm: m.profundidad_mm })
          .eq("id", m.neumatico_id)
        if (updErr) return { error: updErr.message }
      }
    }

    const desvios = filtradas.filter(
      (m) => !cubiertaConforme(m.profundidad_mm, m.presion_psi),
    ).length

    // 🚨 También el módulo del supervisor: esta acción escribe
    // `profundidad_actual_mm`, que es lo que lee la Cobertura de neumáticos en
    // /vehiculos/mantenimiento. Revalidando sólo /mis-neumaticos, el supervisor
    // seguía viendo el dibujo viejo. Mismo criterio que odometro-lecturas.ts y
    // urea.ts, que sí revalidan las dos rutas.
    revalidatePath("/mis-neumaticos")
    revalidatePath("/vehiculos/mantenimiento")
    return { success: true, guardadas: filtradas.length, desvios }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
