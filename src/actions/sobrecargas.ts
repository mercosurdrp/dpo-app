"use server"

import { createClient } from "@/lib/supabase/server"
import { getEmpleadoIdFromAuth, requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

// Indicador de Sobrecargas — solo Misiones.
// Los datos vienen de `orden_salida_camion_diario`, alimentada por el sync
// desde la hoja FORMACIÓN del Sheet de Orden de Salida. Cada empleado suma
// como chofer y como ayudante en cada día/camión donde figura.
// "Medias sobrecargas" = media_sobrecarga + cuarto_sobrecarga / 2
// (criterio operativo: una 1/4 sobrecarga equivale a media de una media).

type Result<T> = { data: T } | { error: string }

export interface SobrecargasFila {
  empleado_id: string
  nombre: string
  puesto: string | null
  sobrecargas: number
  medias: number
  dias: number
}

export interface SobrecargasSerieMes {
  mes: string // YYYY-MM
  sobrecargas: number
  medias: number
}

export interface SobrecargasIndicador {
  mes: string // YYYY-MM elegido
  totalSobrecargas: number
  totalMedias: number
  empleados: SobrecargasFila[]
  serie: SobrecargasSerieMes[] // últimos 6 meses
  mesesDisponibles: string[] // todos los meses (YYYY-MM) con al menos una sobrecarga en DB, asc
}

export interface MisSobrecargasResumen {
  mesActual: { mes: string; sobrecargas: number; medias: number; dias: number }
  mesAnterior: { mes: string; sobrecargas: number; medias: number; dias: number }
  detalleMesActual: Array<{
    fecha: string
    patente: string
    rol: "chofer" | "ayudante"
    sobrecargas: number
    medias: number
  }>
}

interface FilaCamionDiario {
  fecha: string
  chofer_empleado_id: string | null
  ayudante_empleado_id: string | null
  sobrecarga_completa: number | null
  media_sobrecarga: number | null
  cuarto_sobrecarga: number | null
  camion: { dominio: string } | null
}

// Supabase tiene server-side `max-rows = 1000`; ni `.limit()` ni el header
// Range lo sobrepasan. Para rangos que exceden ese cap (la serie de 6 meses
// son ~1900 filas) hay que paginar con `.range()` manualmente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllPages<T>(buildQuery: () => any): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const PAGE = 1000
  const acc: T[] = []
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    acc.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return { data: acc, error: null }
}

function rangoMes(mesYYYYMM: string): { desde: string; hasta: string } {
  const [y, m] = mesYYYYMM.split("-").map(Number)
  const desde = new Date(Date.UTC(y, m - 1, 1))
  const hasta = new Date(Date.UTC(y, m, 0))
  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
  }
}

function mesActualISO(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function restarMes(yyyymm: string, n: number): string {
  const [y, m] = yyyymm.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export async function getSobrecargasIndicador(
  mesYYYYMM?: string
): Promise<Result<SobrecargasIndicador>> {
  try {
    await requireAuth()
    if (!IS_MISIONES) {
      return { error: "El indicador de Sobrecargas solo está disponible en Misiones." }
    }

    const mes = mesYYYYMM && /^\d{4}-\d{2}$/.test(mesYYYYMM) ? mesYYYYMM : mesActualISO()
    const supabase = await createClient()

    // ── 1) Detalle del mes elegido: ranking por empleado ──────────────────────
    const { desde, hasta } = rangoMes(mes)
    const { data: filasMes, error: errMes } = await fetchAllPages<{
      fecha: string
      chofer_empleado_id: string | null
      ayudante_empleado_id: string | null
      sobrecarga_completa: number | null
      media_sobrecarga: number | null
      cuarto_sobrecarga: number | null
    }>(() =>
      supabase
        .from("orden_salida_camion_diario")
        .select(
          `fecha, chofer_empleado_id, ayudante_empleado_id,
           sobrecarga_completa, media_sobrecarga, cuarto_sobrecarga`
        )
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: true })
    )
    if (errMes) return { error: errMes.message }

    type Acc = { sob: number; med: number; dias: Set<string> }
    const porEmp = new Map<string, Acc>()
    let totalSobrecargas = 0
    let totalMedias = 0

    for (const f of filasMes ?? []) {
      const sob = f.sobrecarga_completa ?? 0
      const med = (f.media_sobrecarga ?? 0) + (f.cuarto_sobrecarga ?? 0) / 2
      if (sob === 0 && med === 0) continue

      totalSobrecargas += sob
      totalMedias += med

      const ids = new Set<string>()
      if (f.chofer_empleado_id) ids.add(f.chofer_empleado_id)
      if (f.ayudante_empleado_id) ids.add(f.ayudante_empleado_id)
      for (const empId of ids) {
        let acc = porEmp.get(empId)
        if (!acc) { acc = { sob: 0, med: 0, dias: new Set() }; porEmp.set(empId, acc) }
        acc.sob += sob
        acc.med += med
        acc.dias.add(f.fecha)
      }
    }

    // Catálogo de empleados implicados para mostrar nombre + puesto.
    const empleadoIds = Array.from(porEmp.keys())
    const nombrePorId = new Map<string, { nombre: string; puesto: string | null }>()
    if (empleadoIds.length > 0) {
      const { data: emps, error: errEmp } = await supabase
        .from("empleados")
        .select("id, nombre, puesto")
        .in("id", empleadoIds)
      if (errEmp) return { error: errEmp.message }
      for (const e of (emps ?? []) as Array<{ id: string; nombre: string; puesto: string | null }>) {
        nombrePorId.set(e.id, { nombre: e.nombre, puesto: e.puesto })
      }
    }

    const empleados: SobrecargasFila[] = empleadoIds
      .map((id) => {
        const acc = porEmp.get(id)!
        const info = nombrePorId.get(id)
        return {
          empleado_id: id,
          nombre: info?.nombre ?? "(sin nombre)",
          puesto: info?.puesto ?? null,
          sobrecargas: acc.sob,
          medias: acc.med,
          dias: acc.dias.size,
        }
      })
      .sort((a, b) => (b.sobrecargas + b.medias / 2) - (a.sobrecargas + a.medias / 2))

    // ── 2) Serie temporal: últimos 6 meses (incluido el seleccionado) ────────
    const mesesSerie: string[] = []
    for (let i = 5; i >= 0; i--) mesesSerie.push(restarMes(mes, i))
    const { desde: serieDesde } = rangoMes(mesesSerie[0])
    const { hasta: serieHasta } = rangoMes(mesesSerie[5])

    const { data: filasSerie, error: errSerie } = await fetchAllPages<{
      fecha: string
      sobrecarga_completa: number | null
      media_sobrecarga: number | null
      cuarto_sobrecarga: number | null
    }>(() =>
      supabase
        .from("orden_salida_camion_diario")
        .select(`fecha, sobrecarga_completa, media_sobrecarga, cuarto_sobrecarga`)
        .gte("fecha", serieDesde)
        .lte("fecha", serieHasta)
        .order("fecha", { ascending: true })
    )
    if (errSerie) return { error: errSerie.message }

    const totalesMes = new Map<string, { sob: number; med: number }>()
    for (const m of mesesSerie) totalesMes.set(m, { sob: 0, med: 0 })
    for (const f of filasSerie ?? []) {
      const yyyymm = f.fecha.slice(0, 7)
      const acc = totalesMes.get(yyyymm)
      if (!acc) continue
      acc.sob += f.sobrecarga_completa ?? 0
      acc.med += (f.media_sobrecarga ?? 0) + (f.cuarto_sobrecarga ?? 0) / 2
    }
    const serie: SobrecargasSerieMes[] = mesesSerie.map((m) => ({
      mes: m,
      sobrecargas: totalesMes.get(m)!.sob,
      medias: totalesMes.get(m)!.med,
    }))

    // ── 3) Meses disponibles: todos los YYYY-MM con sobrecargas en la DB ──────
    // Solo trae la columna fecha de filas con sob/med/cuarto > 0; paginado.
    const { data: filasConSobrec, error: errDisp } = await fetchAllPages<{ fecha: string }>(() =>
      supabase
        .from("orden_salida_camion_diario")
        .select("fecha")
        .or(
          "sobrecarga_completa.gt.0,media_sobrecarga.gt.0,cuarto_sobrecarga.gt.0"
        )
        .order("fecha", { ascending: true })
    )
    if (errDisp) return { error: errDisp.message }
    const mesesDisponibles = Array.from(
      new Set((filasConSobrec ?? []).map((f) => f.fecha.slice(0, 7)))
    ).sort()
    // El mes actualmente seleccionado siempre debe figurar en el dropdown,
    // incluso si está vacío, para no "saltar" al elegirlo.
    if (!mesesDisponibles.includes(mes)) {
      mesesDisponibles.push(mes)
      mesesDisponibles.sort()
    }

    return {
      data: { mes, totalSobrecargas, totalMedias, empleados, serie, mesesDisponibles },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function getMisSobrecargas(): Promise<Result<MisSobrecargasResumen>> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) {
      return { error: "Tu usuario no está vinculado a un empleado." }
    }
    if (!IS_MISIONES) {
      return { error: "El indicador de Sobrecargas solo está disponible en Misiones." }
    }

    const mesActual = mesActualISO()
    const mesAnterior = restarMes(mesActual, 1)
    const { desde: desdeAnt } = rangoMes(mesAnterior)
    const { hasta: hastaAct } = rangoMes(mesActual)

    const supabase = await createClient()
    const { data: filas, error } = await supabase
      .from("orden_salida_camion_diario")
      .select(
        `fecha, chofer_empleado_id, ayudante_empleado_id,
         sobrecarga_completa, media_sobrecarga, cuarto_sobrecarga,
         camion:catalogo_vehiculos!orden_salida_camion_diario_camion_id_fkey(dominio)`
      )
      .gte("fecha", desdeAnt)
      .lte("fecha", hastaAct)
      .or(`chofer_empleado_id.eq.${empleadoId},ayudante_empleado_id.eq.${empleadoId}`)
    if (error) return { error: error.message }

    type Acc = { sob: number; med: number; dias: Set<string> }
    const actAcc: Acc = { sob: 0, med: 0, dias: new Set() }
    const antAcc: Acc = { sob: 0, med: 0, dias: new Set() }
    const detalle: MisSobrecargasResumen["detalleMesActual"] = []

    for (const f of (filas ?? []) as unknown as FilaCamionDiario[]) {
      const sob = f.sobrecarga_completa ?? 0
      const med = (f.media_sobrecarga ?? 0) + (f.cuarto_sobrecarga ?? 0) / 2
      if (sob === 0 && med === 0) continue

      const yyyymm = f.fecha.slice(0, 7)
      const rol: "chofer" | "ayudante" =
        f.chofer_empleado_id === empleadoId ? "chofer" : "ayudante"

      if (yyyymm === mesActual) {
        actAcc.sob += sob
        actAcc.med += med
        actAcc.dias.add(f.fecha)
        detalle.push({
          fecha: f.fecha,
          patente: f.camion?.dominio ?? "",
          rol,
          sobrecargas: sob,
          medias: med,
        })
      } else if (yyyymm === mesAnterior) {
        antAcc.sob += sob
        antAcc.med += med
        antAcc.dias.add(f.fecha)
      }
    }

    detalle.sort((a, b) => b.fecha.localeCompare(a.fecha))

    return {
      data: {
        mesActual: {
          mes: mesActual,
          sobrecargas: actAcc.sob,
          medias: actAcc.med,
          dias: actAcc.dias.size,
        },
        mesAnterior: {
          mes: mesAnterior,
          sobrecargas: antAcc.sob,
          medias: antAcc.med,
          dias: antAcc.dias.size,
        },
        detalleMesActual: detalle,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}
