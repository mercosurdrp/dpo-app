"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { validarLectura } from "@/lib/vehiculos/validar-lectura"
import { addDays, fetchLecturas, kmActualPorDominio } from "@/lib/vehiculos/lecturas"
import { TIPO_CARGA_UREA, validarLitrosUrea } from "@/lib/vehiculos/tipos-carga"

/**
 * Carga de urea (AdBlue) por unidad — la registra el chofer desde `/mi-urea`.
 *
 * Sirve para saber **cada cuántos kilómetros se le está echando urea a cada
 * camión**: con el odómetro de cada carga, la distancia entre una y la
 * siguiente sale sola. Un camión que empieza a pedir urea mucho más seguido que
 * antes está avisando algo (fuga, sistema forzado, dosificación mal), y hasta
 * ahora eso no quedaba registrado en ningún lado.
 *
 * 🚨 Vive en `registro_combustible` con `tipo_combustible = 'urea'`. NO es
 * combustible y no se suma al gasoil: ver `lib/vehiculos/tipos-carga.ts`, que
 * explica por qué comparten tabla y qué consultas tienen que filtrar.
 *
 * 🚨 El costo no se pide: se decidió que el chofer cargue lo mínimo para que la
 * carga no se abandone. `costo_total` queda en null a propósito.
 */

export interface UnidadUrea {
  dominio: string
  descripcion: string | null
  numero: string | null
  /** Lo que dice la ficha: 'Urea', 'Urea (anulada)', 'No tiene'… */
  combustibleAux: string | null
  /** Si la ficha dice que esta unidad lleva urea. */
  llevaUrea: boolean
  /** Última carga de urea registrada, para mostrar los km que pasaron. */
  ultima: { fecha: string; odometro: number; litros: number } | null
}

export interface CargaUreaPropia {
  id: string
  fecha: string
  dominio: string
  litros: number
  odometro: number
  kmDesdeAnterior: number | null
}

export interface MiUreaData {
  unidades: UnidadUrea[]
  /** Las últimas cargas registradas, de todos, para no duplicar sin querer. */
  ultimas: CargaUreaPropia[]
}

/** La ficha marca con "Urea" a secas las unidades que sí la usan. */
function llevaUrea(combustibleAux: string | null): boolean {
  const v = (combustibleAux ?? "").trim().toLowerCase()
  return v === "urea"
}

export async function getMiUrea(): Promise<{ data: MiUreaData } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [vehRes, cargasRes] = await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo, descripcion")
        .eq("active", true)
        .eq("tipo", "camion")
        .order("dominio"),
      supabase
        .from("registro_combustible")
        .select("id, fecha, dominio, litros, odometro, km_recorridos")
        .eq("tipo_combustible", TIPO_CARGA_UREA)
        .order("fecha", { ascending: false })
        .limit(50),
    ])
    if (vehRes.error) return { error: vehRes.error.message }
    if (cargasRes.error) return { error: cargasRes.error.message }

    const dominios = (vehRes.data || []).map((v) => v.dominio)
    const { data: fichas } = await supabase
      .from("vehiculos_ficha")
      .select("dominio, numero_asignado, combustible_aux")
      .in("dominio", dominios)
    const ficha = new Map(
      (fichas || []).map(
        (f: {
          dominio: string
          numero_asignado: string | null
          combustible_aux: string | null
        }) => [f.dominio, f],
      ),
    )

    const cargas = (cargasRes.data || []) as Array<{
      id: string
      fecha: string
      dominio: string
      litros: number | string
      odometro: number
      km_recorridos: number | null
    }>

    // La última carga de cada unidad: las cargas ya vienen de la más nueva a la
    // más vieja.
    const ultimaPorDominio = new Map<string, (typeof cargas)[number]>()
    for (const c of cargas) {
      if (!ultimaPorDominio.has(c.dominio)) ultimaPorDominio.set(c.dominio, c)
    }

    const unidades: UnidadUrea[] = (vehRes.data || []).map((v) => {
      const f = ficha.get(v.dominio)
      const u = ultimaPorDominio.get(v.dominio)
      return {
        dominio: v.dominio,
        descripcion: v.descripcion ?? null,
        numero: f?.numero_asignado ?? null,
        combustibleAux: f?.combustible_aux ?? null,
        llevaUrea: llevaUrea(f?.combustible_aux ?? null),
        ultima: u
          ? { fecha: u.fecha, odometro: u.odometro, litros: Number(u.litros) }
          : null,
      }
    })

    return {
      data: {
        unidades,
        ultimas: cargas.slice(0, 10).map((c) => ({
          id: c.id,
          fecha: c.fecha,
          dominio: c.dominio,
          litros: Number(c.litros),
          odometro: c.odometro,
          kmDesdeAnterior: c.km_recorridos,
        })),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface CrearCargaUreaInput {
  dominio: string
  chofer: string
  odometro: number
  litros: number
  observaciones?: string
}

export async function crearCargaUrea(
  input: CrearCargaUreaInput,
): Promise<
  | { success: true; kmDesdeAnterior: number | null; litrosPor1000Km: number | null }
  | { error: string }
> {
  try {
    const profile = await requireAuth()

    const dominio = input.dominio.trim().toUpperCase()
    const chofer = input.chofer.trim().replace(/\s+/g, " ").toUpperCase()
    if (!dominio) return { error: "Elegí el camión." }
    if (chofer.length < 5) return { error: "Escribí el apellido y el nombre del chofer." }

    const errorLitros = validarLitrosUrea(input.litros)
    if (errorLitros) return { error: errorLitros }

    const supabase = await createClient()

    // La unidad tiene que existir y estar activa: un dominio suelto no suma a
    // ninguna unidad y el seguimiento de km queda huérfano.
    const { data: veh } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio")
      .eq("dominio", dominio)
      .eq("active", true)
      .maybeSingle()
    if (!veh) return { error: "Ese camión no está activo en el maestro de flota." }

    // 🚨 Mismo control de odómetro que la carga de combustible: un dedazo queda
    // pegado como km actual de la unidad y descoloca el plan de mantenimiento y
    // el estado de las cubiertas, además de arruinar los km entre cargas.
    const hoy = new Date().toISOString().slice(0, 10)
    const lecturasPrevias = await fetchLecturas({
      dominio,
      fechaDesde: addDays(hoy, -120),
      fechaHasta: hoy,
    })
    const errorLectura = validarLectura({
      valor: input.odometro,
      previa: kmActualPorDominio(lecturasPrevias).get(dominio) ?? null,
      fecha: hoy,
    })
    if (errorLectura) return { error: errorLectura }

    // Los km desde la carga de urea ANTERIOR — que es el dato que se busca.
    const { data: prev } = await supabase
      .from("registro_combustible")
      .select("odometro")
      .eq("dominio", dominio)
      .eq("tipo_combustible", TIPO_CARGA_UREA)
      .lt("odometro", input.odometro)
      .order("odometro", { ascending: false })
      .limit(1)
      .maybeSingle()

    let kmDesdeAnterior: number | null = null
    let litrosPor1000Km: number | null = null
    if (prev) {
      kmDesdeAnterior = input.odometro - prev.odometro
      if (kmDesdeAnterior > 0) {
        litrosPor1000Km =
          Math.round((input.litros / kmDesdeAnterior) * 1000 * 100) / 100
      }
    }

    const { error } = await supabase.from("registro_combustible").insert({
      fecha: hoy,
      dominio,
      chofer,
      odometro: input.odometro,
      litros: input.litros,
      km_recorridos: kmDesdeAnterior,
      // `rendimiento` guarda km por litro de urea: es la misma cuenta que en el
      // gasoil y así el histórico se lee sin recalcular nada.
      rendimiento:
        kmDesdeAnterior && kmDesdeAnterior > 0
          ? Math.round((kmDesdeAnterior / input.litros) * 100) / 100
          : null,
      tipo_combustible: TIPO_CARGA_UREA,
      costo_total: null,
      observaciones: input.observaciones?.trim() || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }

    revalidatePath("/mi-urea")
    revalidatePath("/vehiculos/mantenimiento")
    return { success: true, kmDesdeAnterior, litrosPor1000Km }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export interface ConsumoUreaUnidad {
  dominio: string
  numero: string | null
  cargas: number
  litrosTotales: number
  /** Promedio de km entre una carga y la siguiente. */
  kmPromedioEntreCargas: number | null
  litrosPor1000Km: number | null
  ultimaFecha: string | null
  /** Km recorridos desde la última carga hasta el km actual de la unidad. */
  kmDesdeUltima: number | null
}

/**
 * Consumo de urea por unidad, para la consola del supervisor.
 *
 * 🚨 El promedio de km entre cargas se calcula sobre los tramos, no sobre la
 * primera carga: una unidad con una sola carga registrada NO tiene tramo y va
 * con `null`, no con cero. Mostrar cero ahí haría parecer que carga urea todo
 * el tiempo.
 */
export async function getConsumoUrea(
  meses = 6,
): Promise<{ data: ConsumoUreaUnidad[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const desde = new Date()
    desde.setMonth(desde.getMonth() - meses)
    const desdeISO = desde.toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from("registro_combustible")
      .select("dominio, fecha, litros, odometro, km_recorridos")
      .eq("tipo_combustible", TIPO_CARGA_UREA)
      .gte("fecha", desdeISO)
      .order("odometro", { ascending: true })
    if (error) return { error: error.message }

    const filas = (data || []) as Array<{
      dominio: string
      fecha: string
      litros: number | string
      odometro: number
      km_recorridos: number | null
    }>
    if (filas.length === 0) return { data: [] }

    const dominios = [...new Set(filas.map((f) => f.dominio))]
    const [{ data: fichas }, lecturas] = await Promise.all([
      supabase
        .from("vehiculos_ficha")
        .select("dominio, numero_asignado")
        .in("dominio", dominios),
      fetchLecturas({ fechaDesde: desdeISO, fechaHasta: new Date().toISOString().slice(0, 10) }),
    ])
    const numero = new Map(
      (fichas || []).map((f: { dominio: string; numero_asignado: string | null }) => [
        f.dominio,
        f.numero_asignado,
      ]),
    )
    const kmActual = kmActualPorDominio(lecturas)

    const porDominio = new Map<string, typeof filas>()
    for (const f of filas) {
      if (!porDominio.has(f.dominio)) porDominio.set(f.dominio, [])
      porDominio.get(f.dominio)!.push(f)
    }

    const out: ConsumoUreaUnidad[] = [...porDominio.entries()].map(([dominio, cargas]) => {
      const litrosTotales =
        Math.round(cargas.reduce((a, c) => a + Number(c.litros), 0) * 100) / 100
      // Tramos = cargas con una anterior contra la cual medir.
      const tramos = cargas.filter((c) => c.km_recorridos != null && c.km_recorridos > 0)
      const kmTramos = tramos.reduce((a, c) => a + (c.km_recorridos ?? 0), 0)
      const litrosTramos = tramos.reduce((a, c) => a + Number(c.litros), 0)
      const ultima = cargas[cargas.length - 1]
      const actual = kmActual.get(dominio)?.odometro ?? null

      return {
        dominio,
        numero: numero.get(dominio) ?? null,
        cargas: cargas.length,
        litrosTotales,
        kmPromedioEntreCargas: tramos.length ? Math.round(kmTramos / tramos.length) : null,
        litrosPor1000Km:
          kmTramos > 0 ? Math.round((litrosTramos / kmTramos) * 1000 * 100) / 100 : null,
        ultimaFecha: cargas.reduce((a, c) => (c.fecha > a ? c.fecha : a), cargas[0].fecha),
        kmDesdeUltima: actual != null && actual >= ultima.odometro ? actual - ultima.odometro : null,
      }
    })

    out.sort((a, b) => a.dominio.localeCompare(b.dominio))
    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
