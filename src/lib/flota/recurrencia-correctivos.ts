// Recurrencia de correctivos y evolución del plan preventivo (DPO Flota R2.2.6).
//
// El requisito dice: "el plan de MP ha evolucionado para resolver proactivamente
// los problemas recurrentes de mantenimiento correctivo". Son dos preguntas:
//   1. ¿Qué correctivo se repite? → `sistemas`: las OT correctivas de los
//      últimos 12 meses agrupadas por sistema del vehículo, con las unidades,
//      la plata y los días parados que costaron, y qué tarea del plan (si
//      alguna) ya debería estar previniéndolo.
//   2. ¿Qué cambió el plan por eso? → `evoluciones`: el historial del plan con
//      su motivo, su origen y las OT que lo justifican, y el EFECTO: cuántos
//      correctivos de ese sistema hubo en los 6 meses anteriores al cambio y
//      cuántos en los 6 posteriores.
//
// Es una función pura: la action trae los datos y la pantalla los muestra.
// Las OT sin `sistema` cargado se clasifican al vuelo con `sugerirSistema` y
// quedan marcadas como `sugerido`, así el análisis sirve desde el primer día,
// antes del backfill y aunque alguien se olvide de elegirlo al cargar la OT.

import type {
  MantenimientoPlanTarea,
  MantenimientoPlanTareaHistorial,
  MantenimientoRealizado,
  MantenimientoSistema,
  PlanEvolucionOrigen,
  VehiculoTipo,
} from "@/types/database"
import {
  MESES_RECURRENCIA,
  SISTEMAS_OT,
  UMBRAL_RECURRENTE_FLOTA,
  UMBRAL_RECURRENTE_UNIDAD,
  labelSistema,
  sistemaDeTareaPlan,
  sugerirSistema,
  textosDeOt,
} from "./sistemas-ot"

export interface OtResumen {
  id: string
  numeroOt: string | null
  fecha: string
  dominio: string
  tipo: MantenimientoRealizado["tipo"]
  taller: string | null
  /** Tareas de la OT (o las observaciones si no hay tareas descriptivas). */
  descripcion: string
  costo: number
  diasParado: number
  sistema: MantenimientoSistema
  /** true = el sistema no está cargado en la OT, lo dedujo el texto. */
  sugerido: boolean
}

export interface TareaPlanResumen {
  id: string
  nombre: string
  tipoVehiculo: VehiculoTipo
  frecuencia: string
  activo: boolean
}

export interface EfectoEvolucion {
  /** Correctivos del sistema en los `meses` anteriores al cambio. */
  antes: number
  /** Correctivos del sistema en los `meses` posteriores (hasta hoy). */
  despues: number
  /** Meses realmente transcurridos después del cambio (tope `meses`). */
  mesesDespues: number
  meses: number
}

export interface EvolucionPlan {
  id: string
  fecha: string
  accion: MantenimientoPlanTareaHistorial["accion"]
  tareaId: string | null
  tareaNombre: string
  tipoVehiculo: VehiculoTipo | null
  /** Qué cambió, en una frase: "cada 40.000 km → 100.000 km". */
  cambio: string
  motivo: string | null
  origen: PlanEvolucionOrigen | null
  otIds: string[]
  sistema: MantenimientoSistema | null
  autor: string | null
  efecto: EfectoEvolucion | null
}

export interface RecurrenciaSistema {
  sistema: MantenimientoSistema
  label: string
  ots: OtResumen[]
  n: number
  unidades: string[]
  /** Unidades con 2 o más correctivos del sistema en la ventana. */
  unidadesRepetidas: Array<{ dominio: string; n: number }>
  costo: number
  diasParado: number
  recurrente: boolean
  /** Tareas activas del plan que ya cubren este sistema. */
  tareasPlan: TareaPlanResumen[]
  /** Cambios del plan atribuidos a este sistema (los más nuevos primero). */
  evoluciones: EvolucionPlan[]
}

export interface AnalisisRecurrencia {
  desde: string
  hasta: string
  sistemas: RecurrenciaSistema[]
  evoluciones: EvolucionPlan[]
  resumen: {
    correctivas: number
    sistemasRecurrentes: number
    sinClasificar: number
    cambios: number
    conMotivo: number
    deCorrectivos: number
  }
}

const DIA = 86_400_000

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function restarMeses(fechaISO: string, meses: number): string {
  const d = new Date(fechaISO + "T12:00:00Z")
  d.setUTCMonth(d.getUTCMonth() - meses)
  return iso(d)
}

function sumarMeses(fechaISO: string, meses: number): string {
  return restarMeses(fechaISO, -meses)
}

function diasEntre(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0
  const d = Math.round(
    (new Date(b.slice(0, 10) + "T12:00:00Z").getTime() - new Date(a.slice(0, 10) + "T12:00:00Z").getTime()) /
      DIA
  )
  return Math.max(0, d)
}

const fmtKm = (n: number) => new Intl.NumberFormat("es-AR").format(n)

export function frecuenciaTexto(t: {
  frecuencia_km?: number | null
  frecuencia_meses?: number | null
  frecuencia_horas?: number | null
}): string {
  const partes: string[] = []
  if (t.frecuencia_km) partes.push(`${fmtKm(t.frecuencia_km)} km`)
  if (t.frecuencia_meses) partes.push(`${t.frecuencia_meses} meses`)
  if (t.frecuencia_horas) partes.push(`${fmtKm(t.frecuencia_horas)} h`)
  return partes.length > 0 ? `cada ${partes.join(" / ")}` : "sin frecuencia"
}

/** Resume una OT para las tablas: tareas o, si no las hay, las observaciones. */
export function descripcionDeOt(m: MantenimientoRealizado): string {
  const tareas = (m.tareas ?? [])
    .map((t) => (t.descripcion ?? "").trim())
    .filter((d) => d && !/^mantenimiento (correctivo|preventivo|proactivo)$/i.test(d))
  if (tareas.length > 0) return tareas.join("; ")
  const obs = (m.observaciones ?? "").replace(/\s+/g, " ").trim()
  return obs || "(sin descripción)"
}

/**
 * Costo de la OT: el mayor entre la cabecera y el desglose (mismo criterio que
 * `costoTotalOt`).
 *
 * 🚨 Si la suma de las tareas coincide con `costo_mano_obra` es LA MISMA PLATA
 * y va una sola vez: el sync de Cloudfleet carga cada labor como tarea con su
 * costo Y su total en `costo_mano_obra`. Ver el comentario largo en
 * `_components/ot-formato.ts`.
 */
function costoDeOt(m: MantenimientoRealizado): number {
  const tareas = (m.tareas ?? []).reduce((a, t) => a + Number(t.costo || 0), 0)
  const repuestos = (m.repuestos ?? []).reduce(
    (a, r) => a + Number(r.cantidad || 1) * Number(r.costo_unitario || 0),
    0
  )
  const manoObra = Number(m.costo_mano_obra || 0)
  const duplicada = tareas > 0 && Math.abs(tareas - manoObra) < 1
  return Math.max(Number(m.costo || 0), tareas + (duplicada ? 0 : manoObra) + repuestos)
}

/** Sistema efectivo de una OT: el cargado o, si falta, el sugerido por el texto. */
export function sistemaDeOt(m: MantenimientoRealizado): { sistema: MantenimientoSistema; sugerido: boolean } {
  if (m.sistema) return { sistema: m.sistema, sugerido: false }
  const sug = sugerirSistema(textosDeOt(m), { rubro: m.rubro })
  return { sistema: sug?.sistema ?? "otro", sugerido: true }
}

export function resumirOt(m: MantenimientoRealizado): OtResumen {
  const { sistema, sugerido } = sistemaDeOt(m)
  return {
    id: m.id,
    numeroOt: m.numero_ot ?? null,
    fecha: m.fecha.slice(0, 10),
    dominio: m.dominio,
    tipo: m.tipo,
    taller: m.taller ?? null,
    descripcion: descripcionDeOt(m),
    costo: costoDeOt(m),
    diasParado: diasEntre(m.fuera_servicio_desde, m.fuera_servicio_hasta),
    sistema,
    sugerido,
  }
}

/** "cada 40.000 km → cada 100.000 km", "alta", "baja", "activa → inactiva". */
function describirCambio(h: MantenimientoPlanTareaHistorial): string {
  if (h.accion === "alta") return `Alta: ${frecuenciaTexto(h.datos_despues ?? {})}`
  if (h.accion === "baja") return "Baja de la tarea"
  const a = h.datos_antes ?? {}
  const d = h.datos_despues ?? {}
  const partes: string[] = []
  const fa = frecuenciaTexto(a)
  const fd = frecuenciaTexto(d)
  if (fa !== fd) partes.push(`${fa} → ${fd}`)
  if (a.activo !== d.activo && d.activo != null) partes.push(d.activo ? "se activa en el plan" : "se desactiva")
  if (a.nombre && d.nombre && a.nombre !== d.nombre) partes.push(`«${a.nombre}» → «${d.nombre}»`)
  if (a.categoria && d.categoria && a.categoria !== d.categoria) partes.push(`categoría ${a.categoria} → ${d.categoria}`)
  const pa = JSON.stringify(a.palabras_clave ?? null)
  const pd = JSON.stringify(d.palabras_clave ?? null)
  if (partes.length === 0 && pa !== pd) partes.push("palabras clave")
  return partes.length > 0 ? partes.join(" · ") : "Cambio sin diferencias visibles"
}

function evolucionDesdeHistorial(
  h: MantenimientoPlanTareaHistorial,
  tareasById: Map<string, MantenimientoPlanTarea>
): EvolucionPlan {
  const datos = h.datos_despues ?? h.datos_antes ?? {}
  const tarea = h.tarea_id ? tareasById.get(h.tarea_id) : undefined
  const nombre = datos.nombre ?? tarea?.nombre ?? "(tarea borrada)"
  // Sistema: el anotado en el historial; si no, el que se deduce de la tarea.
  const sistema =
    h.sistema ??
    (datos.nombre && datos.categoria
      ? sistemaDeTareaPlan({
          nombre: datos.nombre,
          categoria: datos.categoria,
          palabras_clave: datos.palabras_clave ?? tarea?.palabras_clave ?? null,
        })
      : tarea
        ? sistemaDeTareaPlan(tarea)
        : null)
  return {
    id: h.id,
    fecha: h.changed_at.slice(0, 10),
    accion: h.accion,
    tareaId: h.tarea_id,
    tareaNombre: nombre,
    tipoVehiculo: (datos.tipo_vehiculo ?? tarea?.tipo_vehiculo ?? null) as VehiculoTipo | null,
    cambio: describirCambio(h),
    motivo: h.motivo?.trim() || null,
    origen: h.origen ?? null,
    otIds: h.ot_ids ?? [],
    sistema,
    autor: h.autor_nombre ?? null,
    efecto: null,
  }
}

export function analizarRecurrencia(params: {
  /** OT de al menos 24 meses: la ventana de recurrencia usa 12, el efecto mira 6 a cada lado del cambio. */
  mantenimientos: MantenimientoRealizado[]
  tareasPlan: MantenimientoPlanTarea[]
  historial: MantenimientoPlanTareaHistorial[]
  hoy: string
  mesesVentana?: number
  mesesEfecto?: number
}): AnalisisRecurrencia {
  const { mantenimientos, tareasPlan, historial, hoy } = params
  const mesesVentana = params.mesesVentana ?? MESES_RECURRENCIA
  const mesesEfecto = params.mesesEfecto ?? 6
  const desde = restarMeses(hoy, mesesVentana)

  // Sólo correctivos completados o en taller: lo que efectivamente rompió.
  const correctivos = mantenimientos
    .filter((m) => m.tipo === "correctivo" && m.estado !== "cancelado")
    .map(resumirOt)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  const enVentana = correctivos.filter((o) => o.fecha >= desde && o.fecha <= hoy)

  const tareasById = new Map(tareasPlan.map((t) => [t.id, t]))

  // Tareas activas del plan por sistema (para "ya lo cubre el plan").
  const tareasPorSistema = new Map<MantenimientoSistema, TareaPlanResumen[]>()
  for (const t of tareasPlan) {
    if (!t.activo) continue
    const s = sistemaDeTareaPlan(t)
    const arr = tareasPorSistema.get(s) ?? []
    arr.push({
      id: t.id,
      nombre: t.nombre,
      tipoVehiculo: t.tipo_vehiculo,
      frecuencia: frecuenciaTexto(t),
      activo: t.activo,
    })
    tareasPorSistema.set(s, arr)
  }

  // Historial → evoluciones con efecto antes/después.
  const evoluciones = [...historial]
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
    .map((h) => evolucionDesdeHistorial(h, tareasById))
  for (const e of evoluciones) {
    if (!e.sistema) continue
    const delSistema = correctivos.filter((o) => o.sistema === e.sistema)
    const desdeAntes = restarMeses(e.fecha, mesesEfecto)
    const hastaDespues = sumarMeses(e.fecha, mesesEfecto)
    const antes = delSistema.filter((o) => o.fecha >= desdeAntes && o.fecha < e.fecha).length
    const despues = delSistema.filter((o) => o.fecha >= e.fecha && o.fecha <= hastaDespues && o.fecha <= hoy).length
    const mesesDespues = Math.min(
      mesesEfecto,
      Math.max(0, Math.round((new Date(hoy).getTime() - new Date(e.fecha).getTime()) / (30.4 * DIA)))
    )
    e.efecto = { antes, despues, mesesDespues, meses: mesesEfecto }
  }

  // Agrupar por sistema, en el orden del catálogo, sólo los que tienen OT o evoluciones.
  const sistemas: RecurrenciaSistema[] = []
  for (const s of SISTEMAS_OT) {
    const ots = enVentana.filter((o) => o.sistema === s.id)
    const evos = evoluciones.filter((e) => e.sistema === s.id)
    if (ots.length === 0 && evos.length === 0) continue
    const porUnidad = new Map<string, number>()
    for (const o of ots) porUnidad.set(o.dominio, (porUnidad.get(o.dominio) ?? 0) + 1)
    const unidadesRepetidas = [...porUnidad.entries()]
      .filter(([, n]) => n >= UMBRAL_RECURRENTE_UNIDAD)
      .map(([dominio, n]) => ({ dominio, n }))
      .sort((a, b) => b.n - a.n)
    sistemas.push({
      sistema: s.id,
      label: labelSistema(s.id),
      ots,
      n: ots.length,
      unidades: [...porUnidad.keys()].sort(),
      unidadesRepetidas,
      costo: ots.reduce((a, o) => a + o.costo, 0),
      diasParado: ots.reduce((a, o) => a + o.diasParado, 0),
      recurrente: ots.length >= UMBRAL_RECURRENTE_FLOTA || unidadesRepetidas.length > 0,
      tareasPlan: tareasPorSistema.get(s.id) ?? [],
      evoluciones: evos,
    })
  }
  sistemas.sort((a, b) => b.n - a.n || b.costo - a.costo)

  return {
    desde,
    hasta: hoy,
    sistemas,
    evoluciones,
    resumen: {
      correctivas: enVentana.length,
      sistemasRecurrentes: sistemas.filter((s) => s.recurrente).length,
      sinClasificar: enVentana.filter((o) => o.sugerido).length,
      cambios: evoluciones.length,
      conMotivo: evoluciones.filter((e) => e.motivo).length,
      deCorrectivos: evoluciones.filter((e) => e.origen === "correctivo_recurrente").length,
    },
  }
}

/**
 * Motivo prellenado para llevar un sistema recurrente al plan. Lo que el
 * auditor quiere leer: "se agregó X porque fallaba Y", con las OT que lo prueban.
 */
export function redactarMotivo(s: RecurrenciaSistema, accion: "alta" | "ajuste", nombreTarea?: string): string {
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v)
  const refs = s.ots
    .slice(0, 8)
    .map((o) => `${o.numeroOt ? `OT ${o.numeroOt} ` : ""}${o.dominio} ${o.fecha.slice(8, 10)}/${o.fecha.slice(5, 7)}`)
    .join(", ")
  const extra = s.ots.length > 8 ? ` y ${s.ots.length - 8} más` : ""
  const parado = s.diasParado > 0 ? `, ${s.diasParado} días de unidad parada` : ""
  const que =
    accion === "alta"
      ? `Se agrega ${nombreTarea ? `«${nombreTarea}»` : "esta tarea"} al plan preventivo`
      : `Se ajusta ${nombreTarea ? `«${nombreTarea}»` : "esta tarea"}`
  return (
    `${que} porque en los últimos ${MESES_RECURRENCIA} meses hubo ${s.n} OT correctivas de ` +
    `${s.label.toLowerCase()} en ${s.unidades.length} unidad${s.unidades.length === 1 ? "" : "es"} ` +
    `(${fmtMoney(s.costo)}${parado}): ${refs}${extra}.`
  )
}
