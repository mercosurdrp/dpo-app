import type { SupabaseClient } from "@supabase/supabase-js"

import {
  LEGAJOS_WNP_OPERARIOS,
  LEGAJO_WNP_SUPERVISOR,
  WNP_FICHAJE_DESDE,
  calcularHorasDia,
  prorratearHlVendidos,
  type WnpDia,
} from "./calculo"

/** PostgREST corta cada request en 1000 filas: hay que paginar o las sumas mienten. */
async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{
    data: T[] | null
    error: unknown
  }>,
): Promise<T[]> {
  const PAGE = 1000
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await pagina(desde, desde + PAGE - 1)
    if (error || !data || data.length === 0) break
    filas.push(...data)
    if (data.length < PAGE) break
  }
  return filas
}

export type SerieWnp = {
  /** Por fecha: WnpDia con hl (prorrateado), horas y el desglose por persona. */
  porFecha: Record<string, WnpDia>
}

/**
 * Arma la serie del WNP para un rango: HL vendidos (distribuido + mostrador
 * prorrateado) y horas-hombre (fichaje real, ausencias y jornada teórica donde
 * el reloj falló). Ver `./calculo` para el detalle de cada regla.
 */
export async function cargarSerieWnp(
  supabase: SupabaseClient,
  fechaDesde: string,
  fechaHasta: string,
): Promise<SerieWnp> {
  const legajos = [...LEGAJOS_WNP_OPERARIOS, LEGAJO_WNP_SUPERVISOR]

  const [ventas, mostrador, fichaje, empleados] = await Promise.all([
    traerTodo<{ fecha: string; total_hl: number | null }>((desde, hasta) =>
      supabase
        .from("ventas_diarias")
        .select("fecha, total_hl")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("fecha", { ascending: true })
        .range(desde, hasta),
    ),
    traerTodo<{ fecha: string; total_hl: number | null }>((desde, hasta) =>
      supabase
        .from("ventas_mostrador_diarias")
        .select("fecha, total_hl")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("fecha", { ascending: true })
        .range(desde, hasta),
    ),
    traerTodo<{ fecha: string; legajo: number; horas_trabajadas: number | null }>(
      (desde, hasta) =>
        supabase
          .from("asistencia_resumen_diario")
          .select("fecha, legajo, horas_trabajadas")
          .in("legajo", legajos)
          .gte("fecha", fechaDesde)
          .lte("fecha", fechaHasta)
          .order("fecha", { ascending: true })
          .range(desde, hasta),
    ),
    supabase
      .from("empleados")
      .select("id, legajo, nombre")
      .in("legajo", legajos)
      .then((r) => (r.data ?? []) as Array<{ id: string; legajo: number; nombre: string }>),
  ])

  const nombrePorLegajo: Record<number, string> = {}
  const legajoPorId: Record<string, number> = {}
  for (const e of empleados) {
    nombrePorLegajo[Number(e.legajo)] = e.nombre
    legajoPorId[e.id] = Number(e.legajo)
  }

  // Ausencias: eventos que solapan el rango, expandidos a un set "fecha|legajo".
  const { data: eventos } = await supabase
    .from("ausentismo_eventos")
    .select("empleado_id, fecha_inicio, fecha_fin")
    .in("empleado_id", Object.keys(legajoPorId))
    .lte("fecha_inicio", fechaHasta)
    .gte("fecha_fin", fechaDesde)
  const ausentePorFecha = new Set<string>()
  for (const ev of (eventos ?? []) as Array<{
    empleado_id: string
    fecha_inicio: string
    fecha_fin: string
  }>) {
    const legajo = legajoPorId[ev.empleado_id]
    if (!legajo) continue
    const hasta = new Date(`${ev.fecha_fin}T12:00:00Z`)
    for (
      const d = new Date(`${ev.fecha_inicio}T12:00:00Z`);
      d <= hasta;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      ausentePorFecha.add(`${d.toISOString().slice(0, 10)}|${legajo}`)
    }
  }

  const distribuido: Record<string, number> = {}
  for (const v of ventas) {
    const hl = Number(v.total_hl ?? 0)
    if (Number.isFinite(hl)) distribuido[v.fecha] = (distribuido[v.fecha] ?? 0) + hl
  }
  const mostradorPorFecha: Record<string, number> = {}
  for (const v of mostrador) {
    const hl = Number(v.total_hl ?? 0)
    if (Number.isFinite(hl)) {
      mostradorPorFecha[v.fecha] = (mostradorPorFecha[v.fecha] ?? 0) + hl
    }
  }
  // Solo los días con venta reciben mostrador prorrateado (un día sin despacho
  // no es día operativo: no debe cargar volumen ajeno).
  const distribuidoOperativo: Record<string, number> = {}
  for (const [f, hl] of Object.entries(distribuido)) {
    if (hl > 0) distribuidoOperativo[f] = hl
  }
  const hlPorFecha = prorratearHlVendidos(distribuidoOperativo, mostradorPorFecha)

  const fichajePorFecha: Record<string, Record<number, number>> = {}
  for (const f of fichaje) {
    const h = Number(f.horas_trabajadas ?? 0)
    if (!Number.isFinite(h) || h <= 0) continue
    ;(fichajePorFecha[f.fecha] ??= {})[Number(f.legajo)] = h
  }

  const porFecha: Record<string, WnpDia> = {}
  for (const fecha of Object.keys(hlPorFecha).sort()) {
    // Antes de que existiera el reloj no hay WNP diario que reconstruir.
    if (fecha < WNP_FICHAJE_DESDE) continue
    const dia = calcularHorasDia(fecha, fichajePorFecha, ausentePorFecha, nombrePorLegajo)
    dia.hl = hlPorFecha[fecha] ?? 0
    porFecha[fecha] = dia
  }

  return { porFecha }
}
