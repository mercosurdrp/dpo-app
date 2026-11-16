"use server"

/**
 * Ranking 3R de DISTRIBUCIÓN (Pampeana) — choferes y ayudantes en una misma
 * tabla, bimestral, con el mismo esquema que el ranking de Depósito
 * (`s5-deposito.ts`): componentes 0–100 ponderados, fórmula editable, podio
 * sugerido de 3 que se confirma a `s5_ayudantes_premios` (area distribucion).
 *
 * Componentes (todos se miden sobre los camión-días de la persona, así chofer
 * y ayudantes de una misma formación comparten rechazo, RMD, 5S y TML):
 *   rechazo      % imputable en bultos (sin preventa ni sin stock) — el mismo
 *                número de «Cómo venimos» / «Mis Rechazos»
 *   RMD          promedio de estrellas de las entregas de sus camión-días
 *   reportes     reportes de seguridad que CARGÓ (acto/condición insegura,
 *                acto seguro, ruta de riesgo) — siempre presente: 0 = 0 pts
 *   presentismo  días de licencia en el período (siempre presente)
 *   5S           auditoría 5S de flota de los camiones que llevó, por mes
 *   TML          promedio de los egresos de sus camiones
 *
 * Fuera del podio (sigue en la tabla, con el motivo): raspón con el camión
 * (carga manual), ausencia injustificada / suspensión, menos reportes que el
 * mínimo, o pocos días en la calle.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMiEmpleado, requireAuth, requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { buildComoVenimosPampeana } from "@/lib/indicadores/como-venimos-pampeana"
import { fotosGanadoresDePeriodo, savePremio } from "@/actions/s5-deposito"
import {
  MOTIVOS_AUSENTISMO_LABEL,
  TRES_R_DIST_DEFAULT,
  type ComponenteTresR,
  type MiRanking3RDist,
  type RankingDistribucionData,
  type TresRDistConfig,
  type TresRDistRow,
} from "@/lib/tres-r/distribucion-types"
import type { S5AyudantePremio } from "@/types/database"

const PAGE_PATH = "/5s/ayudantes"
const PAGE = 1000

// ── utils ──
function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

function normPatente(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "").trim()
}

function addMonths(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

/** Ancla un YYYY-MM-01 al primer mes de su bloque de `ventana` meses (Ene, Mar, …). */
function anclarPeriodo(periodoDesde: string, ventana: number): string {
  const [y, m] = periodoDesde.split("-").map((n) => parseInt(n, 10))
  if (!y || !m) return periodoDesde
  const v = Math.max(1, Math.min(6, Math.round(ventana)))
  const primerMes = m - ((m - 1) % v)
  return `${y}-${String(primerMes).padStart(2, "0")}-01`
}

/** Hoy en hora argentina, como YYYY-MM-DD. */
function hoyAR(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Último bimestre calendario cerrado (igual que Depósito). */
function periodoDefault(ventana: number): string {
  const enCurso = anclarPeriodo(`${hoyAR().slice(0, 7)}-01`, ventana)
  return addMonths(enCurso, -ventana)
}

/** Días lunes a sábado en [desde, hasta] (fechas YYYY-MM-DD). */
function diasHabiles(desde: string, hasta: string): number {
  if (hasta < desde) return 0
  let n = 0
  const d = new Date(`${desde}T12:00:00Z`)
  const fin = new Date(`${hasta}T12:00:00Z`)
  while (d <= fin) {
    if (d.getUTCDay() !== 0) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

/** Días de [a1, a2] que caen dentro de [b1, b2]. */
function diasSolapados(a1: string, a2: string, b1: string, b2: string): number {
  const ini = a1 > b1 ? a1 : b1
  const fin = a2 < b2 ? a2 : b2
  if (fin < ini) return 0
  return Math.round((Date.parse(fin) - Date.parse(ini)) / 86400000) + 1
}

function tokens(nombre: string): Set<string> {
  return new Set(
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  )
}
/** >=2 tokens en común, o todos los del nombre más corto. */
function compartenEstricto(a: Set<string>, b: Set<string>): boolean {
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  const minSize = Math.min(a.size, b.size)
  return shared >= 2 || (minSize > 0 && shared === minSize)
}

async function fetchAll<T>(
  build: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(String((error as { message?: string }).message ?? error))
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

// ── Config ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readConfig(client: any): Promise<{ config: TresRDistConfig; tablas_ok: boolean }> {
  const { data, error } = await client.from("tres_r_dist_config").select("*").eq("id", 1).maybeSingle()
  if (error || !data) return { config: { ...TRES_R_DIST_DEFAULT }, tablas_ok: !error }
  const d = TRES_R_DIST_DEFAULT
  const num = (v: unknown, def: number) => (v == null || !Number.isFinite(Number(v)) ? def : Number(v))
  const arr = (v: unknown, def: string[]) => (Array.isArray(v) ? v.map(String) : def)
  return {
    tablas_ok: true,
    config: {
      peso_rechazo: num(data.peso_rechazo, d.peso_rechazo),
      peso_rmd: num(data.peso_rmd, d.peso_rmd),
      peso_reportes: num(data.peso_reportes, d.peso_reportes),
      peso_presentismo: num(data.peso_presentismo, d.peso_presentismo),
      peso_5s: num(data.peso_5s, d.peso_5s),
      peso_tml: num(data.peso_tml, d.peso_tml),
      tope_rechazo: num(data.tope_rechazo, d.tope_rechazo),
      rmd_piso: num(data.rmd_piso, d.rmd_piso),
      rmd_techo: num(data.rmd_techo, d.rmd_techo),
      tope_reportes: num(data.tope_reportes, d.tope_reportes),
      min_reportes: num(data.min_reportes, d.min_reportes),
      tipos_reporte: arr(data.tipos_reporte, d.tipos_reporte),
      tope_dias_licencia: num(data.tope_dias_licencia, d.tope_dias_licencia),
      motivos_descalifican: arr(data.motivos_descalifican, d.motivos_descalifican),
      tml_meta: num(data.tml_meta, d.tml_meta),
      tml_tope: num(data.tml_tope, d.tml_tope),
      min_pct_dias: num(data.min_pct_dias, d.min_pct_dias),
      meses_ventana: Math.max(1, Math.min(6, Math.round(num(data.meses_ventana, d.meses_ventana)))),
    },
  }
}

// ── Cálculo ──

/**
 * El cálculo, sin chequeo de permisos (NO se exporta: en un archivo
 * "use server" cada export es un endpoint). Todo con el cliente admin:
 * ausentismo, reportes y raspones no los lee cualquier rol, y el builder de
 * «Cómo venimos» ya trabaja con el admin.
 */
async function calcularRankingDistribucion(periodoDesde?: string): Promise<RankingDistribucionData> {
  const admin = createAdminClient()
  const { config, tablas_ok } = await readConfig(admin)
  const ventana = config.meses_ventana
  const desde = anclarPeriodo(
    periodoDesde && /^\d{4}-\d{2}-\d{2}$/.test(periodoDesde) ? periodoDesde : periodoDefault(ventana),
    ventana,
  )
  const meses = Array.from({ length: ventana }, (_, i) => addMonths(desde, i))
  const hastaExcl = addMonths(desde, ventana)
  const hastaPeriodo = new Date(Date.parse(`${hastaExcl}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
  const hoy = hoyAR()
  // En el bimestre en curso se mide hasta hoy (el mínimo de días también).
  const hasta = hoy < hastaPeriodo ? hoy : hastaPeriodo
  const enCurso = hasta >= desde

  const [cv, empleados, perfiles, rmdRows, s5Rows, reportesRows, ausRows, rasponesRows, premiosRows, fotos] =
    await Promise.all([
      enCurso
        ? buildComoVenimosPampeana(admin, desde, desde, hasta)
        : Promise.resolve({ personas: new Map(), camionDias: new Map<string, string[]>() }),
      fetchAll<{ id: string; legajo: number | null; nombre: string; sector: string | null; profile_id: string | null }>(
        (a, b) => admin.from("empleados").select("id, legajo, nombre, sector, profile_id").order("id").range(a, b),
      ),
      fetchAll<{ id: string; role: string; empleado_id: string | null }>((a, b) =>
        admin.from("profiles").select("id, role, empleado_id").neq("role", "empleado").order("id").range(a, b),
      ),
      fetchAll<{ fecha_entrega: string; vehiculo_entrega: string | null; puntuacion: number | null }>((a, b) =>
        admin
          .from("nps_rmd_cliente")
          .select("fecha_entrega, vehiculo_entrega, puntuacion")
          .gte("fecha_entrega", desde)
          .lte("fecha_entrega", hasta)
          .not("puntuacion", "is", null)
          .order("fecha_entrega")
          .order("rating_id")
          .range(a, b),
      ),
      fetchAll<{ fecha: string; nota_total: number | null; vehiculo: { dominio: string | null } | null }>((a, b) =>
        admin
          .from("s5_auditorias")
          .select("fecha, nota_total, vehiculo:catalogo_vehiculos(dominio)")
          .eq("tipo", "flota")
          .eq("estado", "completada")
          .gte("fecha", desde)
          .lte("fecha", hastaPeriodo)
          .not("nota_total", "is", null)
          .order("fecha")
          .order("id")
          .range(a, b),
      ),
      fetchAll<{ tipo: string; autor: { nombre: string | null; empleado_id: string | null; id: string } | null }>(
        (a, b) =>
          admin
            .from("reportes_seguridad")
            .select("tipo, autor:profiles!reportes_seguridad_creado_por_fkey(id, nombre, empleado_id)")
            .in("tipo", config.tipos_reporte)
            .gte("fecha", desde)
            .lte("fecha", hastaPeriodo)
            .order("fecha")
            .order("id")
            .range(a, b),
      ),
      fetchAll<{ empleado_id: string | null; fecha_inicio: string; fecha_fin: string | null; dias: number | null; motivo: string }>(
        (a, b) =>
          admin
            .from("ausentismo_eventos")
            .select("empleado_id, fecha_inicio, fecha_fin, dias, motivo")
            .lt("fecha_inicio", hastaExcl)
            .gte("fecha_fin", desde)
            .order("fecha_inicio")
            .order("id")
            .range(a, b),
      ),
      tablas_ok
        ? admin
            .from("tres_r_dist_raspones")
            .select("empleado_id, cantidad, nota")
            .eq("periodo_desde", desde)
            .then((r) => (r.error ? [] : ((r.data ?? []) as { empleado_id: string; cantidad: number; nota: string | null }[])))
        : Promise.resolve([] as { empleado_id: string; cantidad: number; nota: string | null }[]),
      admin
        .from("s5_ayudantes_premios")
        .select("*")
        .eq("periodo_desde", desde)
        .eq("area", "distribucion")
        .then((r) => (r.data ?? []) as S5AyudantePremio[]),
      fotosGanadoresDePeriodo(desde),
    ])

  const empPorId = new Map(empleados.map((e) => [e.id, e]))

  // Gestión (supervisores, admins) no compite aunque haya salido algún día.
  const gestion = new Set<string>()
  for (const pr of perfiles) {
    if (!["admin", "auditor", "supervisor"].includes(pr.role)) continue
    if (pr.empleado_id) gestion.add(pr.empleado_id)
    for (const e of empleados) if (e.profile_id === pr.id) gestion.add(e.id)
  }
  const empPorProfile = new Map(empleados.filter((e) => e.profile_id).map((e) => [e.profile_id as string, e.id]))

  // RMD por camión-día.
  const rmdPorCamionDia = new Map<string, { s: number; n: number }>()
  for (const r of rmdRows) {
    const p = Number(r.puntuacion)
    if (!Number.isFinite(p)) continue
    const k = `${r.fecha_entrega}|${normPatente(r.vehiculo_entrega)}`
    const acc = rmdPorCamionDia.get(k) ?? { s: 0, n: 0 }
    acc.s += p
    acc.n += 1
    rmdPorCamionDia.set(k, acc)
  }

  // 5S de flota por camión y mes (las auditorías son mensuales, no diarias).
  const s5PorMesPatente = new Map<string, number[]>()
  for (const a of s5Rows) {
    const k = `${a.fecha.slice(0, 7)}|${normPatente(a.vehiculo?.dominio)}`
    const arr = s5PorMesPatente.get(k) ?? []
    arr.push(Number(a.nota_total))
    s5PorMesPatente.set(k, arr)
  }

  // Reportes por empleado (autor con empleado vinculado, o por nombre).
  const reportesPorEmp = new Map<string, number>()
  const reportesPorNombre = new Map<string, number>()
  for (const r of reportesRows) {
    const a = r.autor
    if (!a) continue
    const empId = a.empleado_id ?? empPorProfile.get(a.id) ?? null
    if (empId) reportesPorEmp.set(empId, (reportesPorEmp.get(empId) ?? 0) + 1)
    else if (a.nombre) reportesPorNombre.set(a.nombre, (reportesPorNombre.get(a.nombre) ?? 0) + 1)
  }

  // Ausentismo dentro del período.
  const ausPorEmp = new Map<string, { dias: number; descalifica: string[]; detalle: string[] }>()
  for (const e of ausRows) {
    if (!e.empleado_id) continue
    const fin = e.fecha_fin ?? e.fecha_inicio
    const dias = diasSolapados(e.fecha_inicio, fin, desde, hastaPeriodo)
    if (dias <= 0) continue
    const acc = ausPorEmp.get(e.empleado_id) ?? { dias: 0, descalifica: [], detalle: [] }
    const label = MOTIVOS_AUSENTISMO_LABEL[e.motivo] ?? e.motivo
    const [, m, d] = e.fecha_inicio.split("-")
    const item = `${label} ${Number(d)}/${Number(m)} (${dias} ${dias === 1 ? "día" : "días"})`
    acc.detalle.push(item)
    if (config.motivos_descalifican.includes(e.motivo)) acc.descalifica.push(item)
    else acc.dias += dias
    ausPorEmp.set(e.empleado_id, acc)
  }

  const rasponesPorEmp = new Map(rasponesRows.map((r) => [r.empleado_id, r]))

  const habiles = enCurso ? diasHabiles(desde, hasta) : 0
  const minDias = Math.ceil((habiles * clamp(config.min_pct_dias)) / 100)

  const pesos: Record<ComponenteTresR, number> = {
    rechazo: Math.max(0, config.peso_rechazo),
    rmd: Math.max(0, config.peso_rmd),
    reportes: Math.max(0, config.peso_reportes),
    presentismo: Math.max(0, config.peso_presentismo),
    s5: Math.max(0, config.peso_5s),
    tml: Math.max(0, config.peso_tml),
  }
  const rmdRango = Math.max(0.1, config.rmd_techo - config.rmd_piso)
  const tmlRango = Math.max(1, config.tml_tope - config.tml_meta)

  const rows: TresRDistRow[] = []
  for (const [id, p] of cv.personas) {
    const emp = empPorId.get(id)
    // Sólo personal de Distribución (el resolver de nombres puede caer en
    // alguien de Depósito que figuró de acompañante un día).
    if (!emp || emp.sector !== "Distribución" || gestion.has(id)) continue
    const claves = cv.camionDias.get(id) ?? []

    let rs = 0
    let rn = 0
    const s5Dias = new Map<string, number>()
    for (const k of claves) {
      const acc = rmdPorCamionDia.get(k)
      if (acc) {
        rs += acc.s
        rn += acc.n
      }
      const mp = `${k.slice(0, 7)}|${k.slice(11)}`
      if (s5PorMesPatente.has(mp)) s5Dias.set(mp, (s5Dias.get(mp) ?? 0) + 1)
    }
    // 5S: promedio de la nota de cada camión-mes, pesado por los días que lo llevó.
    let s5s = 0
    let s5w = 0
    for (const [mp, w] of s5Dias) {
      const notas = s5PorMesPatente.get(mp)!
      s5s += (notas.reduce((a, b) => a + b, 0) / notas.length) * w
      s5w += w
    }

    let reportes = reportesPorEmp.get(id) ?? 0
    const tk = tokens(emp.nombre)
    for (const [nombre, n] of reportesPorNombre) if (tk.size && compartenEstricto(tokens(nombre), tk)) reportes += n

    const aus = ausPorEmp.get(id)
    const rasp = rasponesPorEmp.get(id)

    const rechazo_pct = p.rechazo_imputable
    const rmd = rn > 0 ? rs / rn : null
    const nota_5s = s5w > 0 ? s5s / s5w : null
    const tml = p.tml

    const sc: Record<ComponenteTresR, number | null> = {
      rechazo: rechazo_pct != null ? clamp(100 * (1 - rechazo_pct / Math.max(0.1, config.tope_rechazo))) : null,
      rmd: rmd != null ? clamp((100 * (rmd - config.rmd_piso)) / rmdRango) : null,
      reportes: clamp((100 * reportes) / Math.max(0.5, config.tope_reportes)),
      presentismo: clamp(100 * (1 - (aus?.dias ?? 0) / Math.max(1, config.tope_dias_licencia))),
      s5: nota_5s != null ? clamp(nota_5s) : null,
      tml: tml != null ? clamp(100 * (1 - (tml - config.tml_meta) / tmlRango)) : null,
    }
    // Componente sin dato → se saca y se repondera; reportes y presentismo siempre están.
    const presentes = (Object.keys(sc) as ComponenteTresR[]).filter((k) => sc[k] != null && pesos[k] > 0)
    const tw = presentes.reduce((a, k) => a + pesos[k], 0)
    const aportes: Partial<Record<ComponenteTresR, number>> = {}
    let score = 0
    for (const k of presentes) {
      const ap = tw > 0 ? (pesos[k] * (sc[k] as number)) / tw : 0
      aportes[k] = r1(ap)
      score += ap
    }

    const motivos: string[] = []
    if ((rasp?.cantidad ?? 0) >= 1)
      motivos.push(`Raspón con el camión (${rasp!.cantidad})${rasp?.nota ? `: ${rasp.nota}` : ""}`)
    if (aus && aus.descalifica.length > 0) motivos.push(aus.descalifica.join("; "))
    if (reportes < config.min_reportes)
      motivos.push(
        config.min_reportes === 1
          ? "Sin reporte de seguridad"
          : `${reportes} de ${config.min_reportes} reportes de seguridad mínimos`,
      )
    if (p.dias_con_ruta < minDias) motivos.push(`Pocos días en la calle (${p.dias_con_ruta} de ${minDias} mínimos)`)

    rows.push({
      empleado_id: id,
      legajo: emp.legajo,
      nombre: emp.nombre,
      rol: p.rol,
      cd: p.cd,
      dias_con_ruta: p.dias_con_ruta,
      bultos: p.bultos_entregados,
      rechazo_pct,
      rechazo_score: sc.rechazo != null ? r1(sc.rechazo) : null,
      rmd: rmd != null ? r2(rmd) : null,
      rmd_n: rn,
      rmd_score: sc.rmd != null ? r1(sc.rmd) : null,
      reportes_cant: reportes,
      reportes_score: r1(sc.reportes as number),
      dias_licencia: aus?.dias ?? 0,
      presentismo_score: r1(sc.presentismo as number),
      nota_5s: nota_5s != null ? r1(nota_5s) : null,
      s5_n: s5Dias.size,
      tml,
      tml_score: sc.tml != null ? r1(sc.tml) : null,
      raspones: rasp?.cantidad ?? 0,
      raspones_nota: rasp?.nota ?? null,
      aportes,
      score: r1(score),
      posicion_sugerida: null,
      elegible: motivos.length === 0,
      motivos,
      ausentismo_detalle: aus && aus.detalle.length > 0 ? aus.detalle.join("; ") : null,
    })
  }

  // Desempate: más días en la calle, después menos rechazo.
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.dias_con_ruta - a.dias_con_ruta ||
      (a.rechazo_pct ?? 99) - (b.rechazo_pct ?? 99),
  )
  rows
    .filter((r) => r.elegible)
    .slice(0, 3)
    .forEach((r, i) => {
      r.posicion_sugerida = i + 1
    })

  return {
    periodo_desde: desde,
    periodo_hasta: hastaPeriodo,
    meses,
    dias_habiles: habiles,
    min_dias: minDias,
    ranking: rows,
    premios: premiosRows.sort((a, b) => a.posicion - b.posicion),
    foto: fotos.distribucion,
    config,
    tablas_ok,
  }
}

// ── Gestión (/5s/ayudantes) ──

export async function getRankingDistribucion(
  periodoDesde?: string,
): Promise<{ data: RankingDistribucionData } | { error: string }> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: "El 3R de Distribución es de Pampeana." }
    return { data: await calcularRankingDistribucion(periodoDesde) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el ranking de Distribución" }
  }
}

/** Carga los raspones de una persona en un bimestre (0 = sin raspones). */
export async function setRaspones(input: {
  periodo_desde: string
  empleado_id: string
  cantidad: number
  nota?: string | null
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "auditor", "supervisor"])
    const cantidad = Math.max(0, Math.round(Number(input.cantidad)))
    if (!Number.isFinite(cantidad)) return { error: "Cantidad inválida" }
    if (!/^\d{4}-\d{2}-01$/.test(input.periodo_desde)) return { error: "Período inválido" }
    const supabase = await createClient()
    const { config } = await readConfig(supabase)
    const periodo = anclarPeriodo(input.periodo_desde, config.meses_ventana)
    const nota = input.nota?.trim() || null
    const { error } = await supabase.from("tres_r_dist_raspones").upsert(
      {
        periodo_desde: periodo,
        empleado_id: input.empleado_id,
        cantidad,
        nota: cantidad > 0 ? nota : null,
        updated_by: profile.id,
      },
      { onConflict: "periodo_desde,empleado_id" },
    )
    if (error) {
      if (error.code === "42P01")
        return { error: "Falta aplicar la migración del 3R de Distribución (tabla tres_r_dist_raspones)." }
      return { error: error.message }
    }
    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudieron guardar los raspones" }
  }
}

export async function updateConfigDistribucion(
  input: Omit<TresRDistConfig, "tipos_reporte" | "motivos_descalifican"> & {
    tipos_reporte: string[]
    motivos_descalifican: string[]
  },
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "auditor"])
    const nums = Object.entries(input).filter(([, v]) => typeof v === "number")
    if (nums.some(([, v]) => !Number.isFinite(v as number) || (v as number) < 0))
      return { error: "Revisá los valores de la fórmula (números ≥ 0)" }
    if (input.rmd_techo <= input.rmd_piso) return { error: "El techo de RMD tiene que ser mayor que el piso" }
    if (input.tml_tope <= input.tml_meta) return { error: "El tope de TML tiene que ser mayor que la meta" }
    const supabase = await createClient()
    const { error } = await supabase
      .from("tres_r_dist_config")
      .update({
        ...input,
        min_reportes: Math.round(input.min_reportes),
        meses_ventana: Math.max(1, Math.min(6, Math.round(input.meses_ventana))),
        updated_by: profile.id,
      })
      .eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar la fórmula" }
  }
}

/** Toma el top 3 sugerido y lo guarda como ganadores de Distribución. */
export async function confirmarSugeridosDistribucion(
  periodoDesde: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const data = await calcularRankingDistribucion(periodoDesde)
    const sugeridos = data.ranking
      .filter((r) => r.posicion_sugerida != null)
      .sort((a, b) => (a.posicion_sugerida ?? 9) - (b.posicion_sugerida ?? 9))
    for (const r of sugeridos) {
      const out = await savePremio({
        periodo_desde: data.periodo_desde,
        area: "distribucion",
        posicion: r.posicion_sugerida as number,
        empleado_id: r.empleado_id,
        nombre: r.nombre,
        score: r.score,
        origen: "auto",
      })
      if ("error" in out) return out
    }
    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo confirmar el top 3" }
  }
}

// ── Portal del empleado: cómo voy en el bimestre en curso ──

/**
 * El 3R de Distribución del bimestre EN CURSO para el portal. Devuelve
 * posición, nombre y puntos de todos, y el desglose completo de uno mismo.
 * No expone raspones, ausentismo ni motivos ajenos, y no marca el podio.
 */
export async function getMiRanking3RDistribucion(): Promise<{ data: MiRanking3RDist } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (IS_MISIONES) return { error: "El ranking 3R es de Pampeana." }
    const emp = await getMiEmpleado()
    const gestion = ["admin", "auditor", "supervisor"].includes(profile.role)
    if (!gestion && emp?.sector !== "Distribución") {
      return { error: "Este ranking 3R es para el personal de Distribución." }
    }
    const admin = createAdminClient()
    const { config } = await readConfig(admin)
    const desde = anclarPeriodo(`${hoyAR().slice(0, 7)}-01`, config.meses_ventana)
    const r = await calcularRankingDistribucion(desde)

    const miIdx = emp ? r.ranking.findIndex((x) => x.empleado_id === emp.id) : -1
    const tabla = r.ranking.map((x, i) => ({
      posicion: i + 1,
      nombre: x.nombre,
      puntos: Math.round(x.score),
      soy_yo: i === miIdx,
    }))

    const c = r.config
    const w: Record<ComponenteTresR, number> = {
      rechazo: Math.max(0, c.peso_rechazo),
      rmd: Math.max(0, c.peso_rmd),
      reportes: Math.max(0, c.peso_reportes),
      presentismo: Math.max(0, c.peso_presentismo),
      s5: Math.max(0, c.peso_5s),
      tml: Math.max(0, c.peso_tml),
    }
    const tw = Object.values(w).reduce((a, b) => a + b, 0) || 1
    const pesos = Object.fromEntries(
      Object.entries(w).map(([k, v]) => [k, Math.round((v / tw) * 100)]),
    ) as Record<ComponenteTresR, number>

    const dias_restantes = Math.max(
      0,
      Math.round((Date.parse(`${r.periodo_hasta}T12:00:00Z`) - Date.parse(`${hoyAR()}T12:00:00Z`)) / 86400000) + 1,
    )

    let mio: MiRanking3RDist["mio"] = null
    if (miIdx >= 0) {
      const x = r.ranking[miIdx]
      mio = {
        ...x,
        posicion: miIdx + 1,
        reportes_faltan: Math.max(0, Math.ceil(c.tope_reportes - x.reportes_cant)),
      }
    }

    return {
      data: {
        periodo_desde: r.periodo_desde,
        meses: r.meses,
        dias_restantes,
        dias_habiles: r.dias_habiles,
        min_dias: r.min_dias,
        pesos,
        config: c,
        tabla,
        mio,
        nombre: emp?.nombre ?? profile.nombre ?? "",
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el ranking" }
  }
}
