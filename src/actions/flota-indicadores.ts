"use server"

// Tablero de Indicadores de Flota: metas configurables por KPI y planes de
// acción por KPI + mes. Planes: clon del patrón TML/TI (tml-plan-accion.ts)
// con discriminador `kpi`.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import {
  cubiertaConforme,
  medicionCompleta,
  TIPOS_NEUMATICOS_OBLIGATORIOS,
} from "@/lib/flota/neumaticos-control"
import { horasEntre } from "@/lib/vehiculos/tiempo-resolucion"
import { tasaFlota } from "@/lib/vehiculos/desgaste-neumaticos"
import { getDesgasteNeumaticos } from "@/actions/neumaticos"
import { TIPO_CARGA_GASOIL } from "@/lib/vehiculos/tipos-carga"

export type FlotaKpi =
  | "disponibilidad"
  | "utilizacion"
  | "costo_total"
  | "pct_preventivo"
  | "cumplimiento_plan"
  | "services_vencidos"
  | "checklist_deteccion"
  | "checklist_resolucion"
  | "docs_conformidad"
  | "estandares_conformidad"
  | "estandares_mandatorios"
  | "estandares_excelencia"
  | "inventario_exactitud"
  | "repuestos_stock_minimo"
  | "repuestos_trazabilidad"
  | "combustible_kml"
  | "co2_flota"
  | "cil_tareas"
  | "cil_defectos_anticipables"
  | "correctivo_dias_parado"
  | "neumaticos_conformidad"
  | "neumaticos_medicion"
  | "neumaticos_desgaste"

export type PlanFlotaEstado = "abierto" | "en_progreso" | "cerrado"
export type PlanFlotaItemEstado = "pendiente" | "en_progreso" | "completado"

export interface FlotaMeta {
  kpi: FlotaKpi
  meta: number | null
  comparador: ">=" | "<="
  unidad: string
  justificacion: string | null
}

export interface FlotaPlanAccion {
  id: string
  kpi: FlotaKpi
  mes: number
  year: number
  valor_mes: number | null
  meta_mes: number | null
  causa_raiz: string
  estado: PlanFlotaEstado
  fecha_cierre: string | null
  resultado_cierre: string | null
  evidencia_cierre_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FlotaPlanAccionItem {
  id: string
  plan_id: string
  accion: string
  responsable: string
  fecha_compromiso: string
  estado: PlanFlotaItemEstado
  fecha_completado: string | null
  observaciones: string | null
  orden: number
  created_at: string
}

export interface FlotaPlanConItems extends FlotaPlanAccion {
  items: FlotaPlanAccionItem[]
}

// ==================== METAS ====================

export async function getFlotaMetas(): Promise<
  { data: FlotaMeta[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_metas")
      .select("kpi, meta, comparador, unidad, justificacion")
    if (error) return { error: error.message }
    return { data: (data || []) as FlotaMeta[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateFlotaMeta(input: {
  kpi: FlotaKpi
  meta: number | null
  justificacion?: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = { meta: input.meta, updated_by: profile.id }
    if (input.justificacion !== undefined) {
      update.justificacion = input.justificacion?.trim() || null
    }
    const { error } = await supabase.from("flota_metas").update(update).eq("kpi", input.kpi)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== SERIES EXTRA (PIs calculados) ====================

export interface PuntoSerieKpi {
  ym: string // "YYYY-MM"
  valor: number | null
  /**
   * Tamaño de la muestra detrás del porcentaje (el denominador).
   *
   * 🚨 Sin esto, un PI con 1 solo caso en el mes sólo puede valer 0 % o 100 % y
   * se lee como si fuera una medición estable. En agosto de 2026 la detección
   * por checklist mostraba 0 % sobre **una única OT correctiva**: el número era
   * correcto y a la vez no significaba nada. El `n` va SIEMPRE al lado del
   * porcentaje, igual que en NPS.
   */
  n?: number | null
  /**
   * Universo del que salió `n`, cuando el PI mide una rutina que debería
   * cubrirlo entero: "7 cubiertas medidas DE 85".
   *
   * 🚨 Sin esto, un PI de cobertura y uno de conformidad se leen igual. La
   * conformidad de neumáticos de julio de 2026 daba 62 % con `n=53`, y esos 53
   * estaban TODOS conformes: el 38 % que faltaba eran cubiertas sin medir.
   */
  nTotal?: number | null
  /**
   * Casos que el PI dejó afuera del promedio por ser dato inválido, no por
   * quedar fuera del período. Se muestra al lado del `n` para que nadie tenga
   * que preguntarse por qué el denominador es más chico de lo que espera.
   */
  excluidos?: number | null
}

/** Ventana de matcheo defecto de checklist → OT correctiva (días). */
const DETECCION_VENTANA_DIAS = 15

/**
 * Qué categorías de checklist pueden considerarse anticipación de una OT, según
 * el rubro de la OT. `null` = no se puede exigir correspondencia.
 *
 * 🚨 Antes valía CUALQUIER defecto de la unidad en los 15 días previos, y eso
 * daba falsos positivos: el único caso "anticipado" de junio a agosto de 2026
 * era la OT 1714 del HELI1 —**una reparación de neumático**— emparejada con un
 * defecto de **MOTOR** («Pérdida de fluidos», marcado `regular`, que era la
 * gotita de la tapa ya reparada). Un defecto de motor no anticipa una rotura de
 * cubierta: contarlo infla el PI y es de lo primero que un auditor desarma.
 *
 * 🚨 `general` queda en `null` a propósito: hoy `mantenimiento_realizados.rubro`
 * sólo tiene dos valores (`general` 189 · `neumaticos` 34), así que en el 85 % de
 * las OT el sistema no informa QUÉ falló y exigir correspondencia sería inventar
 * un criterio. Cuando el rubro se abra por sistema (motor, frenos, eléctrico…),
 * se agregan acá y el PI se vuelve más exigente solo.
 */
const CATEGORIAS_POR_RUBRO: Record<string, readonly string[] | null> = {
  neumaticos: ["NEUMÁTICOS"],
  general: null,
}

/**
 * DPO Flota 4.1 (ATO/CIL) — las tres familias de defecto que el CIL anticipa.
 *
 * `cil_tareas` cuenta ACTIVIDAD (cuántas limpiezas/lubricaciones se hicieron);
 * este KPI cuenta el RESULTADO, que es lo que el requisito pide: si el CIL
 * funciona, estos defectos tienen que bajar mes a mes.
 *
 * Se eligieron por lo que muestra el histórico de checklists (48 defectos):
 *  - fluidos: 23, casi la mitad de todo — es el ejemplo textual del requisito;
 *  - luces: 7, focos y destelladores que una inspección de rutina detecta;
 *  - soldaduras: 0 hasta hoy. Va igual porque es la que el CIL previene antes
 *    de que aparezca; si empieza a marcar, el KPI lo muestra.
 *
 * 🚨 Se identifican por el ítem del checklist, no por texto libre: los nombres
 * están en `checklist_items` y cambiarlos acá es todo lo que hace falta si
 * mañana se suma un ítem a alguna familia.
 */
const FAMILIAS_DEFECTO_CIL = {
  /** MOTOR :: "Pérdida de fluidos y/o alarmas" (camión y autoelevador). */
  fluidos: (it: ItemChecklist) => /p[ée]rdida de fluidos/i.test(it.nombre),
  /** Toda la categoría LUCES: focos, destelladores, balizas y giros. */
  luces: (it: ItemChecklist) => it.categoria === "LUCES",
  /** CARROCERÍA :: "Estado de manijas, barandas, estribos y soldaduras". */
  soldaduras: (it: ItemChecklist) => /soldadura/i.test(it.nombre),
} as const

interface ItemChecklist {
  id: string
  nombre: string
  categoria: string | null
}

/** true si el ítem pertenece a alguna de las tres familias del CIL. */
function esDefectoAnticipableCil(it: ItemChecklist): boolean {
  return Object.values(FAMILIAS_DEFECTO_CIL).some((test) => test(it))
}

/** Factor de emisión gasoil (kg CO2 por litro), estándar ABI/GOP. */
const CO2_KG_POR_LITRO = 2.68

const pad2 = (n: number) => String(n).padStart(2, "0")

/** Últimos 3 meses ARG como "YYYY-MM" (2 cerrados + el actual). */
function meses3Argentina(): string[] {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
  const year = Number(s.slice(0, 4))
  const mes = Number(s.slice(5, 7))
  const out: string[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(year, mes - 1 - i, 1)
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }
  return out
}

/**
 * PIs del pilar Flota 1.3 calculados por mes (últimos 3):
 *  - checklist_deteccion: % de OTs correctivas del mes con defecto detectado
 *    en el checklist del mismo dominio dentro de los 15 días previos.
 *  - checklist_resolucion: días promedio entre el defecto y su plan resuelto
 *    (por mes de resolución; usa updated_at del plan al pasar a resuelto).
 *  - cil_defectos_anticipables (4.1): defectos de las familias que el CIL
 *    previene (fluidos, luces, soldaduras), por mes.
 *
 * Todas se recalculan desde el dato crudo en cada request, así que los tres
 * meses vienen siempre completos — a diferencia de los KPI "foto" de
 * `flota_kpi_snapshots`, que sólo tienen historia desde que el cron empezó.
 */
export async function getFlotaKpiSeriesExtra(): Promise<
  { data: Partial<Record<FlotaKpi, PuntoSerieKpi[]>> } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const meses = meses3Argentina()
    const inicioVentana = `${meses[0]}-01`
    // Los defectos previos a una correctiva de principios del 1er mes pueden
    // caer hasta 15 días antes de la ventana.
    const d0 = new Date(`${inicioVentana}T00:00:00`)
    d0.setDate(d0.getDate() - DETECCION_VENTANA_DIAS)
    const inicioDefectos = `${d0.getFullYear()}-${pad2(d0.getMonth() + 1)}-${pad2(d0.getDate())}`

    // Defectos de checklist (paginado: PostgREST topea en 1000 filas).
    // Trae también el ítem, que es lo que clasifica el defecto por familia CIL.
    const PAGE = 1000
    const defectos: Array<{ fecha: string; dominio: string; itemId: string | null }> = []
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await supabase
        .from("checklist_respuestas")
        .select("id, item_id, cv:checklist_vehiculos!inner(fecha, dominio)")
        .not("valor", "in", '("ok","bueno")')
        .gte("cv.fecha", inicioDefectos)
        .order("id", { ascending: true })
        .range(desde, desde + PAGE - 1)
      if (error) return { error: error.message }
      const rows = (data || []) as unknown as Array<{
        item_id: string | null
        cv: { fecha: string; dominio: string } | null
      }>
      for (const r of rows) {
        if (r.cv) defectos.push({ fecha: r.cv.fecha, dominio: r.cv.dominio, itemId: r.item_id })
      }
      if (rows.length < PAGE) break
    }

    // Catálogo de ítems, para saber a qué familia del CIL pertenece cada defecto.
    const itemsRes = await supabase
      .from("checklist_items")
      .select("id, nombre, categoria")
    if (itemsRes.error) return { error: itemsRes.error.message }
    const itemsCil = new Set(
      ((itemsRes.data || []) as ItemChecklist[])
        .filter(esDefectoAnticipableCil)
        .map((it) => it.id),
    )

    const [otRes, otParadaRes, medicionesRes, instaladasRes, planesRes, conteosRes, cargasRes, cilRes, vehRes, repOtRes] = await Promise.all([
      supabase
        .from("mantenimiento_realizados")
        .select("dominio, fecha, rubro")
        .eq("tipo", "correctivo")
        .neq("estado", "cancelado")
        .gte("fecha", inicioVentana),
      // Días parado por correctivo (DPO 2.4): rangos fuera de servicio de OT
      // correctivas que tocan la ventana (pueden arrancar antes del 1er mes).
      supabase
        .from("mantenimiento_realizados")
        .select("dominio, fuera_servicio_desde, fuera_servicio_hasta")
        .eq("tipo", "correctivo")
        .neq("estado", "cancelado")
        .not("fuera_servicio_desde", "is", null)
        .or(`fuera_servicio_hasta.gte.${inicioVentana},fuera_servicio_hasta.is.null`),
      // Neumáticos (DPO 3.4): mediciones del período y padrón de cubiertas
      // instaladas. El dominio viaja con la cubierta porque el control mensual
      // sólo alcanza a camiones y autoelevadores (ver `alcanceNeumaticos`).
      supabase
        .from("mantenimiento_neumatico_mediciones")
        .select(
          "neumatico_id, fecha, profundidad_mm, presion_psi, created_at, neumatico:mantenimiento_neumaticos!inner(estado, dominio)"
        )
        .eq("neumatico.estado", "instalado")
        .gte("fecha", inicioVentana),
      supabase
        .from("mantenimiento_neumaticos")
        .select("id, dominio")
        .eq("estado", "instalado"),
      // Resolución de defectos (DPO 1.3). El reloj arranca en la carga del
      // checklist, así que hace falta la respuesta que originó el plan.
      supabase
        .from("checklist_planes_accion")
        .select("respuesta_id, created_at, updated_at, resuelto_at")
        .eq("estado", "resuelto")
        .gte("updated_at", `${inicioVentana}T00:00:00`),
      supabase
        .from("mantenimiento_conteos")
        .select(
          "id, fecha, items:mantenimiento_conteo_items(stock_sistema, stock_contado, repuesto:mantenimiento_repuestos(stock_min))"
        )
        .gte("fecha", inicioVentana)
        .order("fecha", { ascending: true }),
      supabase
        .from("registro_combustible")
        .select("dominio, fecha, litros, km_recorridos")
        .eq("tipo_combustible", TIPO_CARGA_GASOIL)
        .gte("fecha", inicioVentana),
      supabase.from("mantenimiento_cil").select("fecha").gte("fecha", inicioVentana),
      // Catálogo: hace falta para saber QUÉ unidad es cada dominio. Sin esto,
      // los días parado contaban equipos de depósito y unidades dadas de baja.
      supabase.from("catalogo_vehiculos").select("dominio, tipo, sector, active"),
      // Trazabilidad de egresos (DPO 2.3): filas de repuesto de OT y si apuntan
      // o no a un ítem del pañol. La fecha es la de la OT, no la de la fila.
      supabase
        .from("mantenimiento_realizado_repuestos")
        .select("repuesto_id, ot:mantenimiento_realizados!inner(fecha, estado)")
        .neq("ot.estado", "cancelado")
        .gte("ot.fecha", inicioVentana),
    ])
    if (otRes.error) return { error: otRes.error.message }
    if (otParadaRes.error) return { error: otParadaRes.error.message }
    if (medicionesRes.error) return { error: medicionesRes.error.message }
    if (instaladasRes.error) return { error: instaladasRes.error.message }
    if (planesRes.error) return { error: planesRes.error.message }
    if (conteosRes.error) return { error: conteosRes.error.message }
    if (cargasRes.error) return { error: cargasRes.error.message }
    if (cilRes.error) return { error: cilRes.error.message }
    if (vehRes.error) return { error: vehRes.error.message }
    if (repOtRes.error) return { error: repOtRes.error.message }

    /**
     * Trazabilidad de egresos de pañol (DPO 2.3, R2.3.2): de los repuestos que
     * se cargan en una OT, cuántos apuntan al ítem del pañol y por lo tanto
     * descuentan stock solos.
     *
     * 🚨 El denominador son TODAS las filas de repuesto de la OT, incluidas las
     * compradas contra la OT que nunca entraron al pañol y que por diseño no
     * deben vincular. Por eso la meta NO es 100 %: el número que se pone es la
     * proporción de piezas que la operación espera sacar del pañol. La
     * alternativa —preguntar en cada fila si salió del pañol— es autodeclarada
     * y no sirve como control.
     *
     * Piso de fecha: antes del 25/08/2026 el vínculo no existía en la app, así
     * que los meses anteriores dan `null` (sin dato) y no 0 %.
     */
    const INICIO_TRAZABILIDAD = "2026-08-25"
    const trazaMes = new Map<string, { total: number; vinculados: number }>()
    for (const r of (repOtRes.data || []) as unknown as Array<{
      repuesto_id: string | null
      ot: { fecha: string } | null
    }>) {
      const fecha = r.ot?.fecha
      if (!fecha || fecha < INICIO_TRAZABILIDAD) continue
      const ym = fecha.slice(0, 7)
      const acc = trazaMes.get(ym) ?? { total: 0, vinculados: 0 }
      acc.total++
      if (r.repuesto_id) acc.vinculados++
      trazaMes.set(ym, acc)
    }

    /**
     * Desgaste real de cubiertas (DPO 3.4). Se reusa el mismo cálculo que el
     * tablero de Neumáticos —una sola recta por toda la flota— en vez de
     * recalcularlo acá: si mañana cambia el criterio, cambia en un solo lugar.
     */
    const desgaste = await getDesgasteNeumaticos()
    const tasa = tasaFlota(desgaste.data.periodos.todo)

    /**
     * Unidades que cuentan para los PI de flota: camiones activos de
     * distribución. Mismo criterio que `flotaDeRuta()` de disponibilidad.
     *
     * 🚨 Los días parado NO filtraban nada: contaban el `TOYOTA3`, que es un
     * autoelevador de depósito DADO DE BAJA, y le sumaban ~30 días por mes al
     * indicador de la flota de reparto.
     */
    const esFlotaDeRuta = new Set(
      ((vehRes.data || []) as Array<{
        dominio: string
        tipo: string | null
        sector: string | null
        active: boolean | null
      }>)
        .filter(
          (v) =>
            v.active !== false &&
            v.sector !== "deposito" &&
            v.tipo !== "autoelevador" &&
            v.tipo !== "acoplado" &&
            v.tipo !== "camioneta",
        )
        .map((v) => v.dominio),
    )

    // Fechas de defecto por dominio, ordenadas, para el matcheo por ventana.
    // El defecto viaja con su CATEGORÍA: sin eso no se puede saber si tiene algo
    // que ver con la falla que después mandó la unidad al taller.
    const catPorItem = new Map(
      ((itemsRes.data || []) as ItemChecklist[]).map((i) => [i.id, i.categoria]),
    )
    const defectosPorDominio = new Map<
      string,
      Array<{ fecha: string; categoria: string | null }>
    >()
    for (const d of defectos) {
      if (!defectosPorDominio.has(d.dominio)) defectosPorDominio.set(d.dominio, [])
      defectosPorDominio.get(d.dominio)!.push({
        fecha: d.fecha,
        categoria: d.itemId ? (catPorItem.get(d.itemId) ?? null) : null,
      })
    }
    for (const arr of defectosPorDominio.values())
      arr.sort((a, b) => a.fecha.localeCompare(b.fecha))

    const MS_DIA = 86_400_000
    const anticipadas = new Map<string, { conDefecto: number; total: number }>()
    for (const ot of (otRes.data || []) as Array<{
      dominio: string
      fecha: string
      rubro: string | null
    }>) {
      const ym = ot.fecha.slice(0, 7)
      if (!meses.includes(ym)) continue
      const acc = anticipadas.get(ym) ?? { conDefecto: 0, total: 0 }
      acc.total++
      const tOt = new Date(`${ot.fecha}T00:00:00`).getTime()
      // Categorías admitidas para esta OT; `null` = cualquiera (ver el comentario
      // de CATEGORIAS_POR_RUBRO).
      const admitidas = CATEGORIAS_POR_RUBRO[ot.rubro ?? "general"] ?? null
      const hubo = (defectosPorDominio.get(ot.dominio) ?? []).some((d) => {
        const t = new Date(`${d.fecha}T00:00:00`).getTime()
        const enVentana = t <= tOt && tOt - t <= DETECCION_VENTANA_DIAS * MS_DIA
        if (!enVentana) return false
        return admitidas === null || admitidas.includes(d.categoria ?? "")
      })
      if (hubo) acc.conDefecto++
      anticipadas.set(ym, acc)
    }

    /**
     * Resolución de defectos (DPO 1.3): días entre que el chofer OBSERVA el
     * defecto y que mantenimiento cierra el plan.
     *
     * 🚨 Antes se medía `updated_at − created_at`, o sea el tiempo que el PLAN
     * estuvo abierto, y eso no es el tiempo de respuesta: mide desde que
     * alguien se sentó a cargarlo. En agosto de 2026, 21 de 22 planes se
     * cargaron ya resueltos en la misma sesión (11/08 15:10) y aportaban 0 días
     * cada uno, dejando el PI en 1,0 d contra una meta de ≤7 mientras el único
     * defecto con seguimiento real llevaba semanas abierto.
     *
     * Ahora el reloj es el mismo que usa la pantalla de focos: T0 = hora del
     * checklist, T1 = `resuelto_at` (lo sella un trigger, la app no lo puede
     * escribir). Una carga retroactiva ya no vale 0 días: vale lo que
     * efectivamente tardó desde que el defecto se vio. Con eso los tres meses
     * pasaron de "0,0 · — · 1,0 d" a "31,0 · 1,0 · 13,4 d".
     */
    const planes = (planesRes.data || []) as Array<{
      respuesta_id: string | null
      created_at: string
      updated_at: string
      resuelto_at: string | null
    }>
    // Hora del checklist que originó cada plan (T0 del tiempo de respuesta).
    const horaPorRespuesta = new Map<string, string | null>()
    const respuestaIds = [...new Set(planes.map((p) => p.respuesta_id).filter(Boolean))] as string[]
    for (let i = 0; i < respuestaIds.length; i += 200) {
      const { data, error } = await supabase
        .from("checklist_respuestas")
        .select("id, cv:checklist_vehiculos!inner(fecha, hora)")
        .in("id", respuestaIds.slice(i, i + 200))
      if (error) return { error: error.message }
      for (const r of (data || []) as unknown as Array<{
        id: string
        cv: { fecha: string; hora: string | null } | null
      }>) {
        if (r.cv) horaPorRespuesta.set(r.id, r.cv.hora)
      }
    }

    const resolucion = new Map<string, { dias: number; n: number; excluidos: number }>()
    for (const p of planes) {
      // El mes es el del CIERRE real, no el de la última edición del plan.
      const fin = p.resuelto_at ?? p.updated_at
      const ym = fin.slice(0, 7)
      if (!meses.includes(ym)) continue
      const acc = resolucion.get(ym) ?? { dias: 0, n: 0, excluidos: 0 }
      // Sin la hora del checklist no hay T0 medible: se cuenta como excluido en
      // vez de caer al viejo `created_at`, que es justo lo que se está sacando.
      const horas = horasEntre(
        p.respuesta_id ? horaPorRespuesta.get(p.respuesta_id) : null,
        fin,
      )
      if (horas == null) acc.excluidos++
      else {
        acc.dias += horas / 24
        acc.n++
      }
      resolucion.set(ym, acc)
    }

    // Exactitud de inventario: el ÚLTIMO conteo de cada mes (viene ordenado asc,
    // así que el último visto por mes pisa a los anteriores).
    const exactitud = new Map<string, number | null>()
    // Cuántos ítems tuvo el conteo del mes: un 100 % sobre 2 repuestos de 19 no
    // es lo mismo que un 100 % sobre los 19, y sin el n se leen igual.
    const exactitudN = new Map<string, number>()
    // Cumplimiento del stock mínimo (SOP de repuestos, DPO 2.3): de los ítems
    // contados que TIENEN un mínimo definido, cuántos estaban en o por encima.
    //
    // 🚨 Los ítems con mínimo 0 o sin cargar quedan afuera del denominador. Son
    // los que no tienen regla que cumplir, y contarlos como cumplidos infla el
    // indicador hasta el 100 % sin que nadie haya hecho nada: al 25/08/2026 la
    // mayoría del pañol está en `stock_min = 0`. Mes sin ningún ítem con
    // mínimo definido = null (sin dato), no 100 %.
    const stockMinimo = new Map<string, number | null>()
    const stockMinimoN = new Map<string, number>()
    for (const c of (conteosRes.data || []) as unknown as Array<{
      fecha: string
      items: Array<{
        stock_sistema: number
        stock_contado: number
        repuesto: { stock_min: number | null } | null
      }>
    }>) {
      const ym = c.fecha.slice(0, 7)
      if (!meses.includes(ym) || c.items.length === 0) continue
      const sinDif = c.items.filter(
        (i) => Number(i.stock_sistema) === Number(i.stock_contado)
      ).length
      exactitud.set(ym, (sinDif / c.items.length) * 100)
      exactitudN.set(ym, c.items.length)

      const conMinimo = c.items.filter((i) => Number(i.repuesto?.stock_min ?? 0) > 0)
      if (conMinimo.length === 0) {
        stockMinimo.set(ym, null)
        stockMinimoN.set(ym, 0)
        continue
      }
      const cumplen = conMinimo.filter(
        (i) => Number(i.stock_contado) >= Number(i.repuesto!.stock_min)
      ).length
      stockMinimo.set(ym, (cumplen / conMinimo.length) * 100)
      stockMinimoN.set(ym, conMinimo.length)
    }

    // Combustible: km/l ponderado del mes (Σ km ÷ Σ litros de cargas con
    // medición, mismo criterio que el módulo Combustible) + CO2 estimado
    // sobre TODOS los litros cargados.
    const combustible = new Map<
      string,
      { km: number; litrosConKm: number; litros: number }
    >()
    for (const c of (cargasRes.data || []) as Array<{
      dominio: string
      fecha: string
      litros: number | null
      km_recorridos: number | null
    }>) {
      const ym = String(c.fecha).slice(0, 7)
      if (!meses.includes(ym)) continue
      // 🚨 Sólo flota de reparto. Entraban las cargas de los autoelevadores y de
      // una camioneta: para el CO2 sumaban litros ajenos, y para el km/l era peor
      // todavía porque un autoelevador mide HORAS, no kilómetros.
      if (!esFlotaDeRuta.has(c.dominio)) continue
      const acc = combustible.get(ym) ?? { km: 0, litrosConKm: 0, litros: 0 }
      const litros = Number(c.litros ?? 0)
      const km = Number(c.km_recorridos ?? 0)
      acc.litros += litros
      if (km > 0) {
        acc.km += km
        acc.litrosConKm += litros
      }
      combustible.set(ym, acc)
    }

    // Tareas CIL completadas por mes.
    const cilPorMes = new Map<string, number>()
    for (const t of (cilRes.data || []) as Array<{ fecha: string }>) {
      const ym = String(t.fecha).slice(0, 7)
      if (meses.includes(ym)) cilPorMes.set(ym, (cilPorMes.get(ym) ?? 0) + 1)
    }

    // Defectos anticipables por el CIL, por mes (DPO 4.1). Se cuenta sobre los
    // mismos defectos de checklist ya traídos, quedándose con los ítems de las
    // tres familias. El mes sin defectos vale 0 y no null: un cero es el mejor
    // resultado posible de este KPI, no un mes sin dato.
    //
    // 🚨 Sólo flota de reparto, igual que combustible y días parado. Sin el
    // filtro el KPI contaba los autoelevadores del depósito y julio de 2026
    // marcaba 20 defectos, de los cuales 16 eran la MISMA pérdida de fluidos
    // del HELI1 re-marcada día a día hasta que se cambió la tapa: el indicador
    // de la flota de reparto lo fijaba un equipo que ni siquiera sale a la
    // calle. Con el filtro julio son 4.
    const defectosCilPorMes = new Map<string, number>()
    for (const ym of meses) defectosCilPorMes.set(ym, 0)
    for (const d of defectos) {
      const ym = d.fecha.slice(0, 7)
      if (!defectosCilPorMes.has(ym)) continue
      if (!esFlotaDeRuta.has(d.dominio)) continue
      if (d.itemId && itemsCil.has(d.itemId)) {
        defectosCilPorMes.set(ym, (defectosCilPorMes.get(ym) ?? 0) + 1)
      }
    }

    // Días parado por correctivo: por cada mes, suma del solapamiento de los
    // rangos fuera de servicio con el mes (una OT que cruza meses reparte sus
    // días). Rango abierto (sin fecha de alta) = sigue parado hasta hoy.
    const hoyArg = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date())
    /**
     * 🚨 Se cuentan DÍAS-UNIDAD ÚNICOS, no la suma de los rangos de cada OT.
     *
     * Un camión con dos OT abiertas a la vez estuvo parado UNA vez. Sumando
     * rangos, el `OJA403` tenía las OT 1723 y 1724 con el mismo período exacto
     * (04/06 → 21/07) más otras dos adentro: el indicador le contaba **60 días
     * de parada en un mes de 31**. Junio daba 87 días cuando eran 29, y julio
     * 125 cuando eran 55.
     *
     * El set `(dominio|fecha)` hace que el mismo día de la misma unidad valga
     * una sola vez, sin importar cuántas OT lo cubran.
     */
    const paradoPorMes = new Map<string, Set<string>>()
    for (const ym of meses) paradoPorMes.set(ym, new Set())
    for (const ot of (otParadaRes.data || []) as Array<{
      dominio: string
      fuera_servicio_desde: string
      fuera_servicio_hasta: string | null
    }>) {
      // Sólo flota de reparto activa: ver `esFlotaDeRuta`.
      if (!esFlotaDeRuta.has(ot.dominio)) continue
      const desde = ot.fuera_servicio_desde.slice(0, 10)
      const hasta = (ot.fuera_servicio_hasta ?? hoyArg).slice(0, 10)
      if (hasta < desde) continue
      for (const ym of meses) {
        const finMes = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)
        const mesIni = `${ym}-01`
        const mesFin = `${ym}-${pad2(finMes.getDate())}`
        const ini = desde > mesIni ? desde : mesIni
        const fin = hasta < mesFin ? hasta : mesFin
        if (fin < ini) continue
        const set = paradoPorMes.get(ym)!
        for (
          let t = new Date(`${ini}T00:00:00`).getTime();
          t <= new Date(`${fin}T00:00:00`).getTime();
          t += MS_DIA
        ) {
          set.add(`${ot.dominio}|${new Date(t).toISOString().slice(0, 10)}`)
        }
      }
    }
    const diasParado = new Map<string, number>()
    for (const [ym, set] of paradoPorMes) diasParado.set(ym, set.size)

    /**
     * Neumáticos (DPO 3.4), en DOS indicadores que antes eran uno solo.
     *
     * 🚨 "Conformidad" dividía las cubiertas conformes por las 108 INSTALADAS,
     * así que una cubierta sin medir pesaba igual que una gastada. En agosto de
     * 2026 el tablero mostraba 6 % en rojo —parecía una flota con las cubiertas
     * destruidas— cuando las 98 mediciones de los tres meses habían dado TODAS
     * dentro de estándar: lo que faltaba era la medición, no la cubierta.
     *
     * Partido en dos, cada número dice una cosa sola y accionable:
     *  - `neumaticos_medicion`: cuántas cubiertas se midieron (¿se hace la
     *    rutina?) — le corresponde al que mide.
     *  - `neumaticos_conformidad`: de las medidas, cuántas están dentro de
     *    estándar (¿cómo está la flota?) — le corresponde a mantenimiento.
     *
     * 🚨 El universo es el del control mensual (`TIPOS_NEUMATICOS_OBLIGATORIOS`:
     * camión y autoelevador activos), no todas las cubiertas cargadas: el
     * acoplado y las camionetas se ven en el módulo de Neumáticos pero la
     * rutina mensual no las exige, y meterlas en el denominador es el mismo
     * error que se está corrigiendo. Son 85 cubiertas, no 108.
     */
    const dominiosNeumaticos = new Set(
      ((vehRes.data || []) as Array<{
        dominio: string
        tipo: string | null
        active: boolean | null
      }>)
        .filter(
          (v) =>
            v.active !== false &&
            (TIPOS_NEUMATICOS_OBLIGATORIOS as readonly string[]).includes(v.tipo ?? "camion"),
        )
        .map((v) => v.dominio),
    )
    const enAlcance = new Set(
      ((instaladasRes.data || []) as Array<{ id: string; dominio: string }>)
        .filter((n) => dominiosNeumaticos.has(n.dominio))
        .map((n) => n.id),
    )
    const instaladas = enAlcance.size
    const medPorMes = new Map<
      string,
      Map<string, { prof: number | null; psi: number | null; fecha: string; createdAt: string | null }>
    >()
    for (const m of (medicionesRes.data || []) as unknown as Array<{
      neumatico_id: string
      fecha: string
      profundidad_mm: number | null
      presion_psi: number | null
      created_at: string | null
    }>) {
      const ym = String(m.fecha).slice(0, 7)
      if (!meses.includes(ym)) continue
      if (!enAlcance.has(m.neumatico_id)) continue
      if (!medPorMes.has(ym)) medPorMes.set(ym, new Map())
      const porNeu = medPorMes.get(ym)!
      const prev = porNeu.get(m.neumatico_id)
      // 🚨 Con la misma FECHA hay que desempatar por `created_at`, porque una
      // cubierta se mide y se vuelve a cargar el mismo día. El 13/08/2026 la
      // posición 2DE del AE908DH quedó con dos valores distintos —5,7 y 9,4 mm—
      // cargados con 16 minutos de diferencia: sin desempate el KPI se quedaba
      // con el que devolviera la base primero, que es orden arbitrario. Vale la
      // ÚLTIMA carga, que es la corrección.
      const masNueva =
        !prev ||
        m.fecha > prev.fecha ||
        (m.fecha === prev.fecha && (m.created_at ?? "") > (prev.createdAt ?? ""))
      if (masNueva) {
        porNeu.set(m.neumatico_id, {
          prof: m.profundidad_mm != null ? Number(m.profundidad_mm) : null,
          psi: m.presion_psi != null ? Number(m.presion_psi) : null,
          fecha: m.fecha,
          createdAt: m.created_at,
        })
      }
    }
    // Por mes: cuántas cubiertas del alcance se midieron y cuántas de ésas están
    // dentro de norma. Los umbrales salen de `neumaticos-control`, el mismo
    // módulo que usa la pantalla del chofer.
    const neumaticosMes = new Map<string, { medidas: number; conformes: number }>()
    for (const ym of meses) {
      let medidas = 0
      let conformes = 0
      for (const v of medPorMes.get(ym)?.values() ?? []) {
        if (!medicionCompleta(v.prof, v.psi)) continue
        medidas++
        if (cubiertaConforme(v.prof, v.psi)) conformes++
      }
      neumaticosMes.set(ym, { medidas, conformes })
    }

    return {
      data: {
        cil_tareas: meses.map((ym) => ({ ym, valor: cilPorMes.get(ym) ?? null })),
        cil_defectos_anticipables: meses.map((ym) => ({
          ym,
          valor: defectosCilPorMes.get(ym) ?? null,
        })),
        combustible_kml: meses.map((ym) => {
          const c = combustible.get(ym)
          return { ym, valor: c && c.litrosConKm > 0 ? c.km / c.litrosConKm : null }
        }),
        co2_flota: meses.map((ym) => {
          const c = combustible.get(ym)
          return { ym, valor: c && c.litros > 0 ? c.litros * CO2_KG_POR_LITRO : null }
        }),
        checklist_deteccion: meses.map((ym) => {
          const a = anticipadas.get(ym)
          return {
            ym,
            valor: a && a.total > 0 ? (a.conDefecto / a.total) * 100 : null,
            // El denominador viaja con el valor: son las OT correctivas del mes.
            n: a?.total ?? 0,
          }
        }),
        checklist_resolucion: meses.map((ym) => {
          const r = resolucion.get(ym)
          return {
            ym,
            valor: r && r.n > 0 ? r.dias / r.n : null,
            n: r?.n ?? 0,
            excluidos: r?.excluidos ?? 0,
          }
        }),
        inventario_exactitud: meses.map((ym) => ({
          ym,
          valor: exactitud.get(ym) ?? null,
          n: exactitudN.get(ym) ?? null,
        })),
        repuestos_stock_minimo: meses.map((ym) => ({
          ym,
          valor: stockMinimo.get(ym) ?? null,
          n: stockMinimoN.get(ym) ?? null,
        })),
        correctivo_dias_parado: meses.map((ym) => ({
          ym,
          valor: diasParado.get(ym) ?? 0,
        })),
        // Cuántas de las cubiertas medidas están dentro de norma. Mes sin
        // ninguna medición = null (sin dato), no 0 %: no medir no es lo mismo
        // que estar fuera de norma — eso lo dice `neumaticos_medicion`.
        neumaticos_conformidad: meses.map((ym) => {
          const c = neumaticosMes.get(ym)
          return {
            ym,
            valor: c && c.medidas > 0 ? (c.conformes / c.medidas) * 100 : null,
            n: c?.medidas ?? 0,
          }
        }),
        // Trazabilidad de egresos de pañol (DPO 2.3). Mes anterior al vínculo
        // = null: no se puede exigir lo que la app no permitía hacer.
        repuestos_trazabilidad: meses.map((ym) => {
          const t = trazaMes.get(ym)
          return {
            ym,
            valor: t && t.total > 0 ? (t.vinculados / t.total) * 100 : null,
            n: t?.vinculados ?? 0,
            nTotal: t?.total ?? 0,
          }
        }),
        /**
         * Desgaste de cubiertas en mm por cada 1.000 km (DPO 3.4).
         *
         * 🚨 NO es un número mensual y por eso va sólo en el mes en curso: sale
         * de una recta ajustada sobre TODAS las rondas del programa. Con dos o
         * tres rondas la pendiente todavía se mueve con el ruido del calibre,
         * así que la serie mes a mes mostraría un zigzag que no es desgaste.
         * `promedioPonderado` devuelve null hasta juntar `MIN_KM_TRAMO`, que es
         * la forma honesta de decir "todavía no hay número".
         */
        neumaticos_desgaste: meses.map((ym) => ({
          ym,
          valor: ym === meses[meses.length - 1] ? (tasa?.mmPorMilKm ?? null) : null,
          n: ym === meses[meses.length - 1] ? (tasa?.cubiertas ?? 0) : null,
          nTotal: ym === meses[meses.length - 1] ? (tasa?.kmMedidos ?? null) : null,
        })),
        // Cuánto de la rutina mensual se cumplió.
        neumaticos_medicion: meses.map((ym) => {
          const c = neumaticosMes.get(ym)
          return {
            ym,
            valor: instaladas > 0 ? ((c?.medidas ?? 0) / instaladas) * 100 : null,
            n: c?.medidas ?? 0,
            nTotal: instaladas,
          }
        }),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== SNAPSHOTS ====================

// Fotos mensuales de los KPIs sin histórico (las escribe el cron
// /api/vehiculos/flota-kpi-cron). El tablero las usa como serie de meses
// cerrados; el mes en curso se calcula en vivo.
export interface FlotaKpiSnapshot {
  kpi: string
  year: number
  mes: number
  valor: number | null
}

export async function getFlotaKpiSnapshots(): Promise<
  { data: FlotaKpiSnapshot[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_kpi_snapshots")
      .select("kpi, year, mes, valor")
    if (error) return { error: error.message }
    return { data: (data || []) as FlotaKpiSnapshot[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== PLANES ====================

export async function getFlotaPlanes(): Promise<
  { data: FlotaPlanConItems[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [planRes, itemRes] = await Promise.all([
      supabase
        .from("flota_plan_accion")
        .select("*")
        .order("year", { ascending: false })
        .order("mes", { ascending: false }),
      supabase
        .from("flota_plan_accion_items")
        .select("*")
        .order("orden", { ascending: true }),
    ])
    if (planRes.error) return { error: planRes.error.message }
    if (itemRes.error) return { error: itemRes.error.message }

    const items = (itemRes.data || []) as FlotaPlanAccionItem[]
    const itemsByPlan = new Map<string, FlotaPlanAccionItem[]>()
    for (const it of items) {
      if (!itemsByPlan.has(it.plan_id)) itemsByPlan.set(it.plan_id, [])
      itemsByPlan.get(it.plan_id)!.push(it)
    }
    const planes = ((planRes.data || []) as FlotaPlanAccion[]).map((p) => ({
      ...p,
      items: itemsByPlan.get(p.id) || [],
    }))
    return { data: planes }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function createFlotaPlan(input: {
  kpi: FlotaKpi
  mes: number
  year: number
  valorMes: number | null
  metaMes: number | null
  causaRaiz: string
  items: Array<{ accion: string; responsable: string; fechaCompromiso: string }>
}): Promise<{ data: FlotaPlanAccion } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: plan, error: errPlan } = await supabase
      .from("flota_plan_accion")
      .insert({
        kpi: input.kpi,
        mes: input.mes,
        year: input.year,
        valor_mes: input.valorMes,
        meta_mes: input.metaMes,
        causa_raiz: input.causaRaiz.trim(),
        estado: "abierto" as PlanFlotaEstado,
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (errPlan) return { error: errPlan.message }

    if (input.items.length > 0) {
      const payload = input.items.map((it, idx) => ({
        plan_id: plan.id,
        accion: it.accion.trim(),
        responsable: it.responsable.trim(),
        fecha_compromiso: it.fechaCompromiso,
        estado: "pendiente" as PlanFlotaItemEstado,
        orden: idx,
      }))
      const { error: errItems } = await supabase
        .from("flota_plan_accion_items")
        .insert(payload)
      if (errItems) {
        await supabase.from("flota_plan_accion").delete().eq("id", plan.id)
        return { error: errItems.message }
      }
    }

    return { data: plan as FlotaPlanAccion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function cerrarFlotaPlan(
  id: string,
  resultadoCierre: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_plan_accion")
      .update({
        estado: "cerrado" as PlanFlotaEstado,
        fecha_cierre: new Date().toISOString().slice(0, 10),
        resultado_cierre: resultadoCierre.trim(),
      })
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteFlotaPlan(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { error } = await supabase.from("flota_plan_accion").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ITEMS ====================

export async function addFlotaPlanItem(input: {
  planId: string
  accion: string
  responsable: string
  fechaCompromiso: string
}): Promise<{ data: FlotaPlanAccionItem } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { count } = await supabase
      .from("flota_plan_accion_items")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", input.planId)

    const { data, error } = await supabase
      .from("flota_plan_accion_items")
      .insert({
        plan_id: input.planId,
        accion: input.accion.trim(),
        responsable: input.responsable.trim(),
        fecha_compromiso: input.fechaCompromiso,
        estado: "pendiente" as PlanFlotaItemEstado,
        orden: count ?? 0,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }

    // Plan con items en marcha: pasa de abierto a en_progreso.
    await supabase
      .from("flota_plan_accion")
      .update({ estado: "en_progreso" as PlanFlotaEstado })
      .eq("id", input.planId)
      .eq("estado", "abierto")

    return { data: data as FlotaPlanAccionItem }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateFlotaPlanItem(input: {
  id: string
  estado?: PlanFlotaItemEstado
  observaciones?: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.estado !== undefined) {
      update.estado = input.estado
      update.fecha_completado =
        input.estado === "completado" ? new Date().toISOString().slice(0, 10) : null
    }
    if (input.observaciones !== undefined) update.observaciones = input.observaciones
    const { error } = await supabase
      .from("flota_plan_accion_items")
      .update(update)
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteFlotaPlanItem(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_plan_accion_items")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
