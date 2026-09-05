import type { SupabaseClient } from "@supabase/supabase-js"

import { AUSENTISMO_MOTIVO_LABELS } from "@/types/database"
import {
  LEGAJOS_WNP_OPERARIOS,
  LEGAJO_WNP_SUPERVISOR,
  WNP_FICHAJE_DESDE,
  calcularHorasDia,
  imputarAlDiaDePicking,
  prorratearHlVendidos,
  sumarDias,
  type WnpDia,
} from "./calculo"

/**
 * La venta se imputa al día hábil anterior (ver `./calculo`), así que el último
 * día del rango necesita ver la entrega que viene DESPUÉS del corte. Se piden
 * unos días de más: alcanza para cruzar un fin de semana largo.
 */
const DIAS_EXTRA_ENTREGA = 10

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

/** Novedades de /asistencia: las cuatro justifican que la persona no estuvo. */
const NOVEDAD_LABELS: Record<string, string> = {
  vacaciones: "Vacaciones",
  licencia_medica: "Licencia médica",
  ausente: "Ausente",
  pergamino: "Pergamino",
}

/** Motivos de /ausentismo, con el mismo texto que muestra ese módulo. */
const AUSENTISMO_LABELS: Record<string, string> = AUSENTISMO_MOTIVO_LABELS

export type SerieWnp = {
  /** Por fecha: WnpDia con hl (prorrateado), horas y el desglose por persona. */
  porFecha: Record<string, WnpDia>
}

/**
 * Arma la serie del WNP para un rango: HL vendidos (distribuido + mostrador
 * BRUTO, notas de crédito incluidas, prorrateado) y horas-hombre (fichaje real,
 * ausencias y jornada teórica donde el reloj falló). Ver `./calculo` para el
 * detalle de cada regla.
 *
 * La serie va indexada por **día de picking**: el HL de cada fecha es el que se
 * entregó al día hábil siguiente, que es el que ese día se preparó.
 */
export async function cargarSerieWnp(
  supabase: SupabaseClient,
  fechaDesde: string,
  fechaHasta: string,
): Promise<SerieWnp> {
  const legajos = [...LEGAJOS_WNP_OPERARIOS, LEGAJO_WNP_SUPERVISOR]
  const fechaHastaEntrega = sumarDias(fechaHasta, DIAS_EXTRA_ENTREGA)

  const [ventas, mostrador, fichaje, empleados] = await Promise.all([
    traerTodo<{ fecha: string; total_hl: number | null }>((desde, hasta) =>
      supabase
        .from("ventas_diarias")
        .select("fecha, total_hl")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHastaEntrega)
        .order("fecha", { ascending: true })
        .range(desde, hasta),
    ),
    traerTodo<{ fecha: string; ds_documento: string | null; total_hl: number | null }>(
      (desde, hasta) =>
        supabase
          .from("ventas_mostrador_diarias")
          .select("fecha, ds_documento, total_hl")
          .gte("fecha", fechaDesde)
          .lte("fecha", fechaHastaEntrega)
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

  // Ausencias: mapa "fecha|legajo" → motivo. Se juntan las DOS fuentes donde la
  // app registra que alguien no estuvo, porque cada módulo escribe en la suya y
  // el WNP tiene que respetar las dos: si no ve la ausencia, le imputa la
  // jornada teórica y el denominador queda inflado (Cerbin de vacaciones desde
  // el 27-jul/26 cargado en /asistencia sumaba 8 hs/día que nadie trabajó).

  // (a) Novedad diaria de /asistencia — es la que se usa en el día a día.
  const novedades = await traerTodo<{ fecha: string; legajo: number; tipo: string }>(
    (desde, hasta) =>
      supabase
        .from("asistencia_novedades")
        .select("fecha, legajo, tipo")
        .in("legajo", legajos)
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("fecha", { ascending: true })
        .range(desde, hasta),
  )
  const ausentePorFecha = new Map<string, string>()
  for (const n of novedades) {
    ausentePorFecha.set(
      `${n.fecha}|${Number(n.legajo)}`,
      NOVEDAD_LABELS[n.tipo] ?? "Ausente",
    )
  }

  // (b) Evento de /ausentismo (rango de fechas) — carga de RRHH.
  const { data: eventos } = await supabase
    .from("ausentismo_eventos")
    .select("empleado_id, fecha_inicio, fecha_fin, motivo")
    .in("empleado_id", Object.keys(legajoPorId))
    .lte("fecha_inicio", fechaHasta)
    .gte("fecha_fin", fechaDesde)
  for (const ev of (eventos ?? []) as Array<{
    empleado_id: string
    fecha_inicio: string
    fecha_fin: string
    motivo: string
  }>) {
    const legajo = legajoPorId[ev.empleado_id]
    if (!legajo) continue
    const hasta = new Date(`${ev.fecha_fin}T12:00:00Z`)
    for (
      const d = new Date(`${ev.fecha_inicio}T12:00:00Z`);
      d <= hasta;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const clave = `${d.toISOString().slice(0, 10)}|${legajo}`
      // La novedad de /asistencia es más específica (día por día): no la pisa.
      if (!ausentePorFecha.has(clave)) {
        ausentePorFecha.set(clave, AUSENTISMO_LABELS[ev.motivo] ?? "Ausente")
      }
    }
  }

  const distribuido: Record<string, number> = {}
  for (const v of ventas) {
    const hl = Number(v.total_hl ?? 0)
    if (Number.isFinite(hl)) distribuido[v.fecha] = (distribuido[v.fecha] ?? 0) + hl
  }
  // `ventas_mostrador_diarias` guarda los cuatro documentos en valor absoluto
  // y acá se SUMAN los cuatro, notas de crédito (DVVTA) y devoluciones (PRDVO)
  // incluidas: el WNP mide lo que el almacén preparó y despachó, y esa
  // mercadería se preparó y despachó aunque después haya vuelto. Es el mismo
  // criterio que el distribuido de arriba, que toma `ventas_diarias` sin
  // descontar rechazos. Decisión del usuario 2026-09-05 (entre el 24/8 y el
  // 5/9 se restaban; se volvió atrás). El cuadro mensual y las pérdidas sí van
  // netos (FCVTA + PRVTA − DVVTA − PRDVO): miden lo que llegó al cliente.
  const mostradorPorFecha: Record<string, number> = {}
  for (const v of mostrador) {
    const hl = Number(v.total_hl ?? 0)
    if (!Number.isFinite(hl)) continue
    mostradorPorFecha[v.fecha] = (mostradorPorFecha[v.fecha] ?? 0) + hl
  }
  const fichajePorFecha: Record<string, Record<number, number>> = {}
  for (const f of fichaje) {
    const h = Number(f.horas_trabajadas ?? 0)
    if (!Number.isFinite(h) || h <= 0) continue
    ;(fichajePorFecha[f.fecha] ??= {})[Number(f.legajo)] = h
  }

  // Las horas se calculan ANTES que el numerador porque son las que definen qué
  // días estuvo abierto el depósito, y esos son los que pueden recibir una
  // venta (la del día hábil siguiente, ver `imputarAlDiaDePicking`).
  const horasPorFecha: Record<string, WnpDia> = {}
  const diasLaborales: string[] = []
  for (let f = fechaDesde; f <= fechaHasta; f = sumarDias(f, 1)) {
    const dia = calcularHorasDia(f, fichajePorFecha, ausentePorFecha, nombrePorLegajo)
    if (dia.horas <= 0) continue
    horasPorFecha[f] = dia
    diasLaborales.push(f)
  }

  const distribuidoPicking = imputarAlDiaDePicking(distribuido, diasLaborales)
  const mostradorPicking = imputarAlDiaDePicking(mostradorPorFecha, diasLaborales)
  // Solo los días con venta reciben mostrador prorrateado (un día sin despacho
  // no es día operativo: no debe cargar volumen ajeno).
  const distribuidoOperativo: Record<string, number> = {}
  for (const [f, hl] of Object.entries(distribuidoPicking)) {
    if (hl > 0) distribuidoOperativo[f] = hl
  }
  const hlPorFecha = prorratearHlVendidos(distribuidoOperativo, mostradorPicking)

  const porFecha: Record<string, WnpDia> = {}
  for (const fecha of diasLaborales) {
    // Antes de que existiera el reloj no hay WNP diario que reconstruir.
    if (fecha < WNP_FICHAJE_DESDE) continue
    const dia = horasPorFecha[fecha]
    // El último día abierto todavía no tiene entrega que imputarle (sale
    // mañana): queda en 0 y el tablero lo muestra vacío, no como día malo.
    dia.hl = hlPorFecha[fecha] ?? 0
    porFecha[fecha] = dia
  }

  return { porFecha }
}
