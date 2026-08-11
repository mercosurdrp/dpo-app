"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import type { VehiculoTipo } from "@/types/database"

/**
 * Revisión de neumáticos del chofer.
 *
 * La ronda mensual la mide el que maneja la unidad, no mantenimiento: la
 * pantalla de /vehiculos/mantenimiento es una consola de escritorio con diez
 * solapas y el chofer entra desde el celular, así que la carga vive acá, con
 * el mismo formato que /mi-cil.
 *
 * Las tablas de cubiertas tienen RLS de admin/supervisor —medir con la sesión
 * del chofer la rechazaba con "row-level security"—, así que la escritura va
 * con el cliente de servicio y queda firmada con `created_by`.
 */

export interface CubiertaParaMedir {
  id: string
  posicion: string
  eje: string | null
  numero: string | null
  medida: string | null
  profundidad_actual_mm: number | null
  /** Última medición de este mes, si ya se cargó. */
  medidaEsteMes: {
    fecha: string
    profundidad_mm: number | null
    presion_psi: number | null
  } | null
}

export interface UnidadParaMedir {
  dominio: string
  tipo: VehiculoTipo | null
  numero: string | null
  cubiertas: CubiertaParaMedir[]
}

export interface MisNeumaticosData {
  unidades: UnidadParaMedir[]
  /** Mes de la ronda (YYYY-MM, hora argentina). */
  mes: string
}

/** Hoy en horario argentino: el server corre en UTC. */
function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export async function getMisNeumaticos(): Promise<
  { data: MisNeumaticosData } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const mes = hoyArgentina().slice(0, 7)

    const { data: cubiertas, error } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id, dominio, posicion, eje, numero, medida, profundidad_actual_mm")
      .eq("estado", "instalado")
      .not("dominio", "is", null)
      .order("dominio")
    if (error) return { error: error.message }

    const ids = (cubiertas || []).map((c) => c.id)
    const [medRes, vehRes, fichaRes] = await Promise.all([
      ids.length > 0
        ? supabase
            .from("mantenimiento_neumatico_mediciones")
            .select("neumatico_id, fecha, profundidad_mm, presion_psi")
            .in("neumatico_id", ids)
            .gte("fecha", `${mes}-01`)
            .order("fecha", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from("catalogo_vehiculos").select("dominio, tipo").eq("active", true),
      supabase.from("vehiculos_ficha").select("dominio, numero_asignado"),
    ])
    if (medRes.error) return { error: medRes.error.message }

    // Primera fila por cubierta = la más reciente del mes (viene ordenado).
    const medPorCubierta = new Map<
      string,
      { fecha: string; profundidad_mm: number | null; presion_psi: number | null }
    >()
    for (const m of medRes.data || []) {
      if (!medPorCubierta.has(m.neumatico_id))
        medPorCubierta.set(m.neumatico_id, {
          fecha: m.fecha,
          profundidad_mm: m.profundidad_mm,
          presion_psi: m.presion_psi,
        })
    }

    const tipos = new Map<string, VehiculoTipo | null>(
      (vehRes.data || []).map((v: { dominio: string; tipo: VehiculoTipo | null }) => [
        v.dominio,
        v.tipo,
      ])
    )
    const numeros = new Map<string, string | null>(
      (fichaRes.data || []).map(
        (f: { dominio: string; numero_asignado: string | null }) => [
          f.dominio,
          f.numero_asignado,
        ]
      )
    )

    const porDominio = new Map<string, CubiertaParaMedir[]>()
    for (const c of cubiertas || []) {
      const arr = porDominio.get(c.dominio!) ?? []
      arr.push({
        id: c.id,
        posicion: c.posicion ?? "—",
        eje: c.eje,
        numero: c.numero,
        medida: c.medida,
        profundidad_actual_mm: c.profundidad_actual_mm,
        medidaEsteMes: medPorCubierta.get(c.id) ?? null,
      })
      porDominio.set(c.dominio!, arr)
    }

    const unidades: UnidadParaMedir[] = [...porDominio.entries()]
      .map(([dominio, cubiertas]) => ({
        dominio,
        tipo: tipos.get(dominio) ?? null,
        numero: numeros.get(dominio) ?? null,
        // Orden estable: las de auxilio al final, el resto por código.
        cubiertas: cubiertas.sort((a, b) =>
          a.posicion === "AUX"
            ? 1
            : b.posicion === "AUX"
              ? -1
              : a.posicion.localeCompare(b.posicion)
        ),
      }))
      .sort((a, b) => a.dominio.localeCompare(b.dominio))

    return { data: { unidades, mes } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Guarda la revisión de una unidad: una medición por cubierta medida.
 *
 * Se guarda todo junto —no una cubierta por vez— porque el chofer recorre las
 * seis con el calibre en la mano; con un formulario por rueda la carga se
 * abandona por la mitad.
 */
export async function guardarRevisionNeumaticos(input: {
  dominio: string
  km?: number | null
  mediciones: {
    neumatico_id: string
    profundidad_mm?: number | null
    presion_psi?: number | null
  }[]
}): Promise<{ success: true; guardadas: number } | { error: string }> {
  try {
    const profile = await requireAuth()

    const filas = input.mediciones.filter(
      (m) => m.profundidad_mm != null || m.presion_psi != null
    )
    if (filas.length === 0) return { error: "No cargaste ninguna medición" }

    for (const m of filas) {
      if (m.profundidad_mm != null && (m.profundidad_mm <= 0 || m.profundidad_mm > 40))
        return { error: "La profundidad tiene que estar entre 0 y 40 mm" }
      if (m.presion_psi != null && (m.presion_psi <= 0 || m.presion_psi > 200))
        return { error: "La presión tiene que estar entre 0 y 200 psi" }
    }

    const supabase = createAdminClient()
    const fecha = hoyArgentina()

    const { error: insErr } = await supabase
      .from("mantenimiento_neumatico_mediciones")
      .insert(
        filas.map((m) => ({
          neumatico_id: m.neumatico_id,
          fecha,
          profundidad_mm: m.profundidad_mm ?? null,
          km: input.km ?? null,
          presion_psi: m.presion_psi ?? null,
          nota: null,
          created_by: profile.id,
        }))
      )
    if (insErr) return { error: insErr.message }

    // La profundidad de la cubierta queda con la última lectura: es lo que
    // pinta el semáforo del diagrama y lo que mira el desgaste crítico.
    for (const m of filas) {
      if (m.profundidad_mm == null) continue
      const { error: updErr } = await supabase
        .from("mantenimiento_neumaticos")
        .update({
          profundidad_actual_mm: m.profundidad_mm,
          updated_at: new Date().toISOString(),
        })
        .eq("id", m.neumatico_id)
      if (updErr) return { error: updErr.message }
    }

    return { success: true, guardadas: filas.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
