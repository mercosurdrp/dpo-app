"use server"

// Pirámide de mantenimiento de flota + análisis aperturado (DPO Flota 4.2).
//
// Junta el dato crudo del año (OT, focos de checklist, CIL, rechazos por
// rotura, flota activa) y lo pasa por la lib pura `construirPiramide`. Encima
// de eso vive la parte humana del punto, que es lo que el auditor H1 no vio:
//   · la LECTURA MENSUAL de la pirámide (`flota_piramide_revision`): qué se
//     leyó, qué se decidió, quién y cuándo, con la foto de los números;
//   · los PLANES sobre un foco de la pirámide (un sistema, una unidad, un
//     taller): son `flota_plan_accion` comunes con `kpi = 'piramide:<tipo>:<valor>'`,
//     así heredan ítems, avances y herramientas (5 Porqués / Espina / PDCA) sin
//     tocar el esquema.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { getChecklistsMtto, getMantenimientos } from "@/actions/mantenimiento-vehiculos"
import { getSlas } from "@/actions/sla"
import { MOTIVO_RECHAZO_ROTURA } from "@/lib/vehiculos/correctivo-kpis"
import { esHallazgoAceite } from "@/lib/flota/cil-aceite"
import {
  construirPiramide,
  type PiramideFlota,
} from "@/lib/flota/piramide-flota"
import {
  KPI_PIRAMIDE_PREFIJO,
  type FocoPiramide,
  type PlanPiramide,
  type RevisionPiramide,
  type SlaTaller,
  kpiDeFoco,
} from "@/lib/flota/piramide-planes"

function faltaTabla(error: { code?: string | null; message?: string | null }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(error.message ?? "")
  )
}

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

export interface PiramideFlotaRespuesta {
  anio: number
  piramide: PiramideFlota
  revisiones: RevisionPiramide[]
  planes: PlanPiramide[]
  slas: SlaTaller[]
  /** Cumplimiento del plan de MP por mes (foto del cron; null = sin foto). */
  cumplimientoPlan: Array<{ ym: string; valor: number | null }>
  /** La tabla de revisiones todavía no existe (falta aplicar el SQL). */
  sqlPendiente: boolean
}

export async function getPiramideFlota(
  anio?: number
): Promise<{ data: PiramideFlotaRespuesta } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArgentina()
    const y = anio ?? Number(hoy.slice(0, 4))
    const desde = `${y}-01-01`
    const hasta = y === Number(hoy.slice(0, 4)) ? hoy : `${y}-12-31`
    // Las OT de diciembre del año anterior sirven para el retrabajo y el aviso.
    const [otRes, chkRes, cilRes, rechRes, flotaRes, revRes, planRes, snapRes, slaRes] = await Promise.all([
      getMantenimientos({ fechaDesde: desde, fechaHasta: hasta }),
      getChecklistsMtto(),
      supabase
        .from("mantenimiento_cil")
        .select("fecha, dominio, aceite_nivel, aceite_litros, perdida_detectada")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("rechazos")
        .select("fecha, ds_fletero_carga, nrodoc, bultos_rechazados, nombre_cliente")
        .eq("ds_rechazo", MOTIVO_RECHAZO_ROTURA)
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase.from("catalogo_vehiculos").select("dominio, active"),
      supabase
        .from("flota_piramide_revision")
        .select("*")
        .eq("anio", y)
        .order("mes", { ascending: false }),
      supabase
        .from("flota_plan_accion")
        .select("*, items:flota_plan_accion_items(*)")
        .like("kpi", `${KPI_PIRAMIDE_PREFIJO}%`)
        .order("created_at", { ascending: false }),
      supabase
        .from("flota_kpi_snapshots")
        .select("year, mes, valor")
        .eq("kpi", "cumplimiento_plan")
        .eq("year", y),
      getSlas(),
    ])
    if ("error" in otRes) return { error: otRes.error }
    if ("error" in chkRes) return { error: chkRes.error }
    if (cilRes.error) return { error: cilRes.error.message }
    if (rechRes.error) return { error: rechRes.error.message }
    if (flotaRes.error) return { error: flotaRes.error.message }
    if (planRes.error) return { error: planRes.error.message }

    const sqlPendiente = !!revRes.error && faltaTabla(revRes.error)
    if (revRes.error && !sqlPendiente) return { error: revRes.error.message }

    const piramide = construirPiramide({
      mantenimientos: otRes.data,
      defectos: chkRes.data.itemsNoOk.map((i) => ({
        fecha: i.fecha,
        dominio: i.dominio,
        critico: i.critico,
        categoria: i.categoria,
        item: i.item,
        repeticionDe: i.repeticionDe,
      })),
      cil: ((cilRes.data || []) as Array<{
        fecha: string
        dominio: string
        aceite_nivel: string | null
        aceite_litros: number | null
        perdida_detectada: boolean | null
      }>).map((c) => ({ fecha: c.fecha, dominio: c.dominio, hallazgo: esHallazgoAceite(c) })),
      rechazosRotura: ((rechRes.data || []) as Array<{
        fecha: string
        ds_fletero_carga: string | null
        nrodoc: number | null
        bultos_rechazados: number | null
        nombre_cliente: string | null
      }>).map((r) => ({
        fecha: r.fecha,
        patente: r.ds_fletero_carga ?? "",
        nrodoc: r.nrodoc,
        bultos: Number(r.bultos_rechazados ?? 0),
        cliente: r.nombre_cliente,
      })),
      dominiosActivos: ((flotaRes.data || []) as Array<{ dominio: string; active: boolean | null }>)
        .filter((v) => v.active !== false)
        .map((v) => v.dominio),
      desde,
      hasta,
    })

    // Herramientas aplicadas en cada plan (5PQ / Espina / PDCA).
    const planesRaw = (planRes.data || []) as Array<Record<string, unknown> & { id: string }>
    const herrPorPlan = new Map<string, string[]>()
    if (planesRaw.length > 0) {
      const { data: herr } = await supabase
        .from("plan_herramientas_gestion")
        .select("flota_plan_accion_id, tipo")
        .in(
          "flota_plan_accion_id",
          planesRaw.map((p) => p.id)
        )
      for (const h of (herr || []) as Array<{ flota_plan_accion_id: string; tipo: string }>) {
        const arr = herrPorPlan.get(h.flota_plan_accion_id) ?? []
        arr.push(h.tipo)
        herrPorPlan.set(h.flota_plan_accion_id, arr)
      }
    }
    const planes: PlanPiramide[] = planesRaw.map((p) => ({
      id: p.id,
      kpi: String(p.kpi),
      mes: Number(p.mes),
      year: Number(p.year),
      valorMes: p.valor_mes == null ? null : Number(p.valor_mes),
      causaRaiz: String(p.causa_raiz ?? ""),
      estado: p.estado as PlanPiramide["estado"],
      fechaCierre: (p.fecha_cierre as string | null) ?? null,
      resultadoCierre: (p.resultado_cierre as string | null) ?? null,
      createdAt: String(p.created_at),
      items: ((p.items as PlanPiramide["items"]) ?? []).sort((a, b) => a.orden - b.orden),
      herramientas: herrPorPlan.get(p.id) ?? [],
    }))

    const revisiones: RevisionPiramide[] = ((revRes.data || []) as Array<{
      id: string
      anio: number
      mes: number
      snapshot: RevisionPiramide["snapshot"]
      lectura: string
      decision: string | null
      revisado_por_nombre: string | null
      revisado_at: string
    }>).map((r) => ({
      id: r.id,
      anio: r.anio,
      mes: r.mes,
      snapshot: r.snapshot,
      lectura: r.lectura,
      decision: r.decision,
      revisadoPor: r.revisado_por_nombre,
      revisadoAt: r.revisado_at,
    }))

    const slas: SlaTaller[] =
      "data" in slaRes
        ? (slaRes.data as unknown as Array<{ nombre: string; parte_proveedor: string | null; estado: SlaTaller["estado"]; pilar: string }>)
            .filter((s) => (s.pilar ?? "").toLowerCase().startsWith("flo"))
            .map((s) => ({ nombre: s.nombre, parteProveedor: s.parte_proveedor, estado: s.estado }))
        : []

    const snap = new Map(
      ((snapRes.data || []) as Array<{ mes: number; valor: number | null }>).map((s) => [s.mes, s.valor])
    )
    const cumplimientoPlan = piramide.porMes.map((m) => ({
      ym: m.ym,
      valor: snap.get(Number(m.ym.slice(5, 7))) ?? null,
    }))

    return { data: { anio: y, piramide, revisiones, planes, slas, cumplimientoPlan, sqlPendiente } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Registra (o corrige) la lectura mensual de la pirámide, con la foto de los
 * números de ese mes y del acumulado del año al momento de leerla.
 */
export async function guardarRevisionPiramide(input: {
  anio: number
  mes: number
  lectura: string
  decision?: string | null
  snapshot: RevisionPiramide["snapshot"]
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const lectura = input.lectura.trim()
    if (lectura.length < 20) return { error: "Escribí la lectura del mes (al menos 20 caracteres)." }
    if (input.mes < 1 || input.mes > 12) return { error: "Mes inválido." }
    const supabase = await createClient()
    const { error } = await supabase.from("flota_piramide_revision").upsert(
      {
        anio: input.anio,
        mes: input.mes,
        lectura,
        decision: input.decision?.trim() || null,
        snapshot: input.snapshot,
        revisado_por: profile.id,
        revisado_por_nombre: profile.nombre ?? null,
        revisado_at: new Date().toISOString(),
      },
      { onConflict: "anio,mes" }
    )
    if (error) {
      if (faltaTabla(error)) return { error: "Falta aplicar APLICAR_EN_PAMPEANA_PIRAMIDE_4_2.sql." }
      return { error: error.message }
    }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Abre un plan de acción sobre un foco de la pirámide. Si ya hay uno del mismo
 * foco en el mes, lo devuelve en vez de fallar (UNIQUE kpi+year+mes).
 */
export async function abrirPlanPiramide(input: {
  foco: FocoPiramide
  causaRaiz: string
  valorMes?: number | null
  primeraAccion?: { accion: string; responsable: string; fechaCompromiso: string } | null
}): Promise<{ data: { id: string; existente: boolean } } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const causa = input.causaRaiz.trim()
    if (causa.length < 10) return { error: "Escribí el problema / causa a atacar (al menos 10 caracteres)." }
    const supabase = await createClient()
    const hoy = hoyArgentina()
    const year = Number(hoy.slice(0, 4))
    const mes = Number(hoy.slice(5, 7))
    const kpi = kpiDeFoco(input.foco)

    const { data: existente } = await supabase
      .from("flota_plan_accion")
      .select("id")
      .eq("kpi", kpi)
      .eq("year", year)
      .eq("mes", mes)
      .maybeSingle()
    if (existente) return { data: { id: (existente as { id: string }).id, existente: true } }

    const { data: plan, error } = await supabase
      .from("flota_plan_accion")
      .insert({
        kpi,
        mes,
        year,
        valor_mes: input.valorMes ?? null,
        meta_mes: null,
        causa_raiz: causa,
        estado: "abierto",
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (error) return { error: error.message }
    const id = (plan as { id: string }).id

    const a = input.primeraAccion
    if (a && a.accion.trim() && a.responsable.trim() && a.fechaCompromiso) {
      const { error: errItem } = await supabase.from("flota_plan_accion_items").insert({
        plan_id: id,
        accion: a.accion.trim(),
        responsable: a.responsable.trim(),
        fecha_compromiso: a.fechaCompromiso,
        estado: "pendiente",
        orden: 0,
      })
      if (errItem) return { error: `Plan creado, pero no se pudo cargar la acción: ${errItem.message}` }
    }
    return { data: { id, existente: false } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Rechazos «ROTURA DE CAMION» de la unidad ±3 días de la fecha de la OT. El
 * diálogo de la OT correctiva lo usa para preguntar si fue auxilio en ruta:
 * hasta el 06/11/2026 el tilde `auxilio_ruta` no se había marcado nunca, y la
 * punta de la pirámide dependía de eso.
 */
export async function getRechazosRoturaCerca(
  dominio: string,
  fecha: string
): Promise<{ data: Array<{ fecha: string; docs: number }> } | { error: string }> {
  try {
    await requireAuth()
    const dom = (dominio ?? "").trim().toUpperCase()
    if (!dom || !/^\d{4}-\d{2}-\d{2}/.test(fecha ?? "")) return { data: [] }
    const base = Date.parse(fecha.slice(0, 10) + "T12:00:00Z")
    const d = (n: number) => new Date(base + n * 86_400_000).toISOString().slice(0, 10)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rechazos")
      .select("fecha, ds_fletero_carga")
      .eq("ds_rechazo", MOTIVO_RECHAZO_ROTURA)
      .gte("fecha", d(-3))
      .lte("fecha", d(3))
    if (error) return { error: error.message }
    const porFecha = new Map<string, number>()
    for (const r of (data || []) as Array<{ fecha: string; ds_fletero_carga: string | null }>) {
      if ((r.ds_fletero_carga ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") !== dom.replace(/[^A-Z0-9]/g, "")) continue
      porFecha.set(r.fecha.slice(0, 10), (porFecha.get(r.fecha.slice(0, 10)) ?? 0) + 1)
    }
    return { data: [...porFecha.entries()].sort().map(([f, docs]) => ({ fecha: f, docs })) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
