"use server"

import { revalidatePath } from "next/cache"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import type {
  S5AyudantesConfig,
  S5AyudanteDepositoRow,
  S5AyudantePremio,
  S5PremioArea,
  S5RankingDepositoData,
} from "@/types/database"

const PAGE_PATH = "/5s/ayudantes"

// Sheet "Errores picking": col0 FECHA, col1 OPERARIO, col2 CANTIDAD DE BULTOS,
// col3 FALTANTE/SOBRANTE, col4 TIPO DE ERROR (HUMANO/SISTEMA).
// El error se cuenta por FILA (cada fila = 1 error) y SOLO si es HUMANO.
const ERRORES_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1K7zWrhFFx7SBoTxZ6Dk93ZrgO05kULlGvxL6ahmUYTA/gviz/tq?tqx=out:csv&sheet=Errores%20picking"

// Productividad por operario (bul/HH) — deposito-esteban. Solo tasas.
const PRODUCTIVIDAD_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=productividad-picking"

// Productividad de maquinistas (Pal/HH) — deposito-esteban. Trae filas por
// (fecha, operario, actividad); para el ranking solo cuenta la actividad
// MAQUINISTA (DESPACHO y otras quedan afuera).
const PRODUCTIVIDAD_MAQ_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=productividad-maquinistas"

const DEFAULT_CONFIG: S5AyudantesConfig = {
  peso_errores: 0.6,
  peso_5s: 0.4,
  peso_productividad: 0,
  tope_errores: 200,
  prod_target: 300,
  prod_target_maq: 18,
  meses_ventana: 2,
}

// ── Foto de ganadores 5S ──
// Una foto grupal por (período, área). Se guarda en un bucket público de
// Supabase con ruta determinística {periodo}/{area}.jpg para que la lea tanto
// esta página como la cartelera del Depósito (endpoint /api/tv/ranking-5s).
const FOTOS_GANADORES_BUCKET = "s5-ganadores"

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// URLs públicas de las fotos de ganadores del período (con cache-buster).
// Si el bucket aún no existe, devuelve nulls (sin migración previa).
export async function fotosGanadoresDePeriodo(
  periodoDesde: string,
): Promise<{ deposito: string | null; distribucion: string | null }> {
  const out: { deposito: string | null; distribucion: string | null } = {
    deposito: null,
    distribucion: null,
  }
  try {
    const svc = serviceClient()
    const { data, error } = await svc.storage
      .from(FOTOS_GANADORES_BUCKET)
      .list(periodoDesde)
    if (error || !data) return out
    for (const area of ["deposito", "distribucion"] as const) {
      const f = data.find((x) => x.name === `${area}.jpg`)
      if (!f) continue
      const { data: pub } = svc.storage
        .from(FOTOS_GANADORES_BUCKET)
        .getPublicUrl(`${periodoDesde}/${area}.jpg`)
      const v = (f.updated_at || f.created_at || "").replace(/\D/g, "")
      out[area] = v ? `${pub.publicUrl}?v=${v}` : pub.publicUrl
    }
  } catch {
    // bucket inexistente / storage no disponible: sin fotos
  }
  return out
}

// ── utils de fecha ──
function firstDayOfMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

function addMonths(periodo: string, delta: number): string {
  const [y, m] = periodo.split("-").map((n) => parseInt(n, 10))
  return firstDayOfMonth(new Date(y, m - 1 + delta, 1))
}

/**
 * Bimestre por defecto al abrir la página: primer mes del último bimestre
 * CALENDARIO cerrado. Los bimestres se anclan al año (Ene-Feb, Mar-Abr,
 * May-Jun, …) para que la grilla no quede corrida; navegar ±1 desde acá (paso
 * = ventana) mantiene esa alineación. Hoy May 2026 → devuelve Mar (Mar-Abr,
 * último cerrado); el bimestre en curso May-Jun queda a un click de distancia.
 * Asume ventana de 2 meses (config por defecto).
 */
export async function getBimestreDefault(): Promise<string> {
  const now = new Date()
  const m = now.getMonth() + 1 // 1..12
  const primerMesEnCurso = m - ((m - 1) % 2) // ancla al bimestre calendario: 1,3,5,7,9,11
  const enCurso = `${now.getFullYear()}-${String(primerMesEnCurso).padStart(2, "0")}-01`
  return addMonths(enCurso, -2) // retrocede un bimestre completo → último cerrado
}

/**
 * Ancla un `periodo_desde` (YYYY-MM-01) al PRIMER mes del bloque de `ventana`
 * meses en la grilla del año (Ene, Ene+ventana, …). Así dos meses del mismo
 * bimestre (p.ej. Marzo y Abril con ventana 2) comparten siempre `periodo_desde`
 * y los premios no se duplican en períodos "corridos". Se aplica al leer y al
 * guardar para blindar contra cargas con un mes de inicio desalineado.
 */
function anclarPeriodo(periodoDesde: string, ventana: number): string {
  const [y, m] = periodoDesde.split("-").map((n) => parseInt(n, 10))
  if (!y || !m) return periodoDesde
  const v = Math.max(1, Math.min(6, Math.round(ventana)))
  const primerMes = m - ((m - 1) % v) // 1, 1+v, 1+2v, …
  return `${y}-${String(primerMes).padStart(2, "0")}-01`
}

// ── CSV / nombres ──
function parseCsvRow(line: string): string[] {
  const cells: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') inQuote = false
      else cur += c
    } else if (c === '"') inQuote = true
    else if (c === ",") {
      cells.push(cur)
      cur = ""
    } else cur += c
  }
  cells.push(cur)
  return cells
}

function parseFechaSheet(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}


/** Tokens en mayúscula sin acentos, >=4 chars, para matchear personas. */
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

function comparten(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true
  return false
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// ── Errores por operario: CANTIDAD de errores HUMANOS (filas) en la ventana ──
async function fetchErroresPorOperario(
  prefijosMes: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const res = await fetch(ERRORES_SHEET_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return out
    const csv = await res.text()
    const lines = csv.split(/\r?\n/).filter((l) => l.trim())
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvRow(lines[i])
      if (cells.length < 5) continue
      const fecha = parseFechaSheet(cells[0])
      if (!fecha) continue
      if (!prefijosMes.some((p) => fecha.startsWith(p))) continue
      const operario = (cells[1] ?? "").trim()
      if (!operario) continue
      // Solo errores HUMANOS (col E). Los del SISTEMA no cuentan.
      const tipo = (cells[4] ?? "").trim().toUpperCase()
      if (!tipo.includes("HUMANO")) continue
      // Cada fila = 1 error (cuenta de ocurrencias, no bultos).
      out.set(operario, (out.get(operario) ?? 0) + 1)
    }
  } catch {
    /* best-effort: sin errores la fila queda en null */
  }
  return out
}

// ── Productividad por operario (promedio bul/HH en la ventana) ──
async function fetchProductividadPorOperario(
  prefijosMes: string[],
): Promise<Map<string, number>> {
  const acc = new Map<string, { sum: number; n: number }>()
  try {
    const res = await fetch(PRODUCTIVIDAD_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return new Map()
    const json = (await res.json()) as {
      data?: { filas?: Array<{ fecha?: string; operario?: string; bul_hh?: number }> }
    }
    for (const f of json.data?.filas ?? []) {
      const fecha = String(f.fecha ?? "")
      if (!prefijosMes.some((p) => fecha.startsWith(p))) continue
      const op = (f.operario ?? "").trim()
      const bh = f.bul_hh
      if (!op || typeof bh !== "number" || !Number.isFinite(bh)) continue
      const cur = acc.get(op) ?? { sum: 0, n: 0 }
      cur.sum += bh
      cur.n += 1
      acc.set(op, cur)
    }
  } catch {
    /* best-effort: sin productividad queda en null */
  }
  const out = new Map<string, number>()
  for (const [op, v] of acc.entries()) if (v.n > 0) out.set(op, v.sum / v.n)
  return out
}

// ── Productividad de maquinistas (promedio Pal/HH en la ventana) ──
async function fetchProductividadMaquinistas(
  prefijosMes: string[],
): Promise<Map<string, number>> {
  const acc = new Map<string, { sum: number; n: number }>()
  try {
    const res = await fetch(PRODUCTIVIDAD_MAQ_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return new Map()
    const json = (await res.json()) as {
      data?: {
        filas?: Array<{
          fecha?: string
          operario?: string
          actividad?: string
          pal_hh?: number
        }>
      }
    }
    for (const f of json.data?.filas ?? []) {
      const fecha = String(f.fecha ?? "")
      if (!prefijosMes.some((p) => fecha.startsWith(p))) continue
      if ((f.actividad ?? "").trim().toUpperCase() !== "MAQUINISTA") continue
      const op = (f.operario ?? "").trim()
      const ph = f.pal_hh
      if (!op || typeof ph !== "number" || !Number.isFinite(ph)) continue
      const cur = acc.get(op) ?? { sum: 0, n: 0 }
      cur.sum += ph
      cur.n += 1
      acc.set(op, cur)
    }
  } catch {
    /* best-effort: sin datos de maquinista queda en null */
  }
  const out = new Map<string, number>()
  for (const [op, v] of acc.entries()) if (v.n > 0) out.set(op, v.sum / v.n)
  return out
}

// ── Config ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readConfig(supabase: any): Promise<S5AyudantesConfig> {
  const { data } = await supabase
    .from("s5_ayudantes_config")
    .select(
      "peso_errores, peso_5s, peso_productividad, tope_errores, prod_target, prod_target_maq, meses_ventana",
    )
    .eq("id", 1)
    .maybeSingle()
  if (!data) return { ...DEFAULT_CONFIG }
  return {
    peso_errores: Number(data.peso_errores ?? DEFAULT_CONFIG.peso_errores),
    peso_5s: Number(data.peso_5s ?? DEFAULT_CONFIG.peso_5s),
    peso_productividad: Number(
      data.peso_productividad ?? DEFAULT_CONFIG.peso_productividad,
    ),
    tope_errores: Number(data.tope_errores ?? DEFAULT_CONFIG.tope_errores),
    prod_target: Number(data.prod_target ?? DEFAULT_CONFIG.prod_target),
    prod_target_maq: Number(
      data.prod_target_maq ?? DEFAULT_CONFIG.prod_target_maq,
    ),
    meses_ventana: Number(data.meses_ventana ?? DEFAULT_CONFIG.meses_ventana),
  }
}

// ── Ranking principal ──
export async function getRankingDeposito(
  periodoDesde?: string,
): Promise<{ data: S5RankingDepositoData } | { error: string }> {
  try {
    await requireAuth()
    if (IS_MISIONES) {
      return { error: "El ranking de depósito es exclusivo de Pampeana." }
    }
    const supabase = await createClient()
    const config = await readConfig(supabase)

    const ventana = Math.max(1, Math.min(6, config.meses_ventana))
    const desde = anclarPeriodo(
      periodoDesde ?? (await getBimestreDefault()),
      ventana,
    )
    const meses: string[] = []
    for (let i = 0; i < ventana; i++) meses.push(addMonths(desde, i))
    const hasta = meses[meses.length - 1]
    const prefijos = meses.map((m) => m.slice(0, 7))

    const [
      audRes,
      respRes,
      sectoresRes,
      erroresMap,
      prodMap,
      prodMaqMap,
      premiosRes,
    ] = await Promise.all([
        supabase
          .from("s5_auditorias")
          .select("periodo, sector_numero, nota_total")
          .eq("tipo", "almacen")
          .eq("estado", "completada")
          .in("periodo", meses)
          .not("nota_total", "is", null),
        supabase
          .from("s5_sector_responsables")
          .select(
            "periodo, sector_numero, empleado:empleados!s5_sector_responsables_empleado_id_fkey(id, nombre)",
          )
          .in("periodo", meses),
        supabase.from("s5_sectores_almacen").select("numero, nombre"),
        fetchErroresPorOperario(prefijos),
        fetchProductividadPorOperario(prefijos),
        fetchProductividadMaquinistas(prefijos),
        supabase
          .from("s5_ayudantes_premios")
          .select("id, periodo_desde, area, posicion, empleado_id, nombre, score, origen")
          .eq("periodo_desde", desde),
      ])

    // Nombre de sectores
    const sectorNombre = new Map<number, string>()
    for (const s of (sectoresRes.data ?? []) as {
      numero: number
      nombre: string
    }[]) {
      sectorNombre.set(s.numero, s.nombre)
    }

    // Nota promedio por (periodo, sector)
    const notaSector = new Map<string, { sum: number; n: number }>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (audRes.data ?? []) as any[]) {
      if (a.nota_total == null) continue
      const key = `${a.periodo}|${a.sector_numero}`
      const cur = notaSector.get(key) ?? { sum: 0, n: 0 }
      cur.sum += Number(a.nota_total)
      cur.n += 1
      notaSector.set(key, cur)
    }
    const avgSector = (periodo: string, sector: number): number | null => {
      const v = notaSector.get(`${periodo}|${sector}`)
      return v && v.n > 0 ? v.sum / v.n : null
    }

    // Candidatos: empiezan por responsables (tienen 5S) y se enriquecen con
    // pickers (errores). Reponderación de faltantes en el score.
    interface Cand {
      empleado_id: string | null
      nombre: string
      notas5s: number[]
      sectores: Set<string>
      errores_cant: number | null
      productividad: number | null
      productividad_maq: number | null
      es_picker: boolean
      es_maquinista: boolean
      es_responsable: boolean
      _tokens: Set<string>
    }
    const cands: Cand[] = []
    const byEmpleado = new Map<string, Cand>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (respRes.data ?? []) as any[]) {
      const emp = r.empleado
      if (!emp) continue
      const nota = avgSector(r.periodo, r.sector_numero)
      let c = byEmpleado.get(emp.id)
      if (!c) {
        c = {
          empleado_id: emp.id,
          nombre: emp.nombre,
          notas5s: [],
          sectores: new Set<string>(),
          errores_cant: null,
          productividad: null,
          productividad_maq: null,
          es_picker: false,
          es_maquinista: false,
          es_responsable: true,
          _tokens: tokens(emp.nombre),
        }
        byEmpleado.set(emp.id, c)
        cands.push(c)
      }
      c.es_responsable = true
      if (nota != null) c.notas5s.push(nota)
      c.sectores.add(sectorNombre.get(r.sector_numero) ?? `Sector ${r.sector_numero}`)
    }

    // Helper para matchear un operario (del Sheet/productividad) a un
    // candidato por tokens del nombre, o crear uno nuevo.
    function matchOCrear(operario: string): Cand {
      const tk = tokens(operario)
      let c = cands.find((x) => comparten(x._tokens, tk))
      if (!c) {
        c = {
          empleado_id: null,
          nombre: operario,
          notas5s: [],
          sectores: new Set<string>(),
          errores_cant: null,
          productividad: null,
          productividad_maq: null,
          es_picker: false,
          es_maquinista: false,
          es_responsable: false,
          _tokens: tk,
        }
        cands.push(c)
      }
      return c
    }

    // Pickers (errores): cantidad de errores humanos en la ventana.
    for (const [operario, cant] of erroresMap.entries()) {
      const c = matchOCrear(operario)
      c.es_picker = true
      c.errores_cant = (c.errores_cant ?? 0) + cant
    }

    // Pickers (productividad bul/HH promedio de la ventana).
    for (const [operario, bulhh] of prodMap.entries()) {
      const c = matchOCrear(operario)
      c.es_picker = true
      c.productividad = bulhh
    }

    // Maquinistas (productividad Pal/HH promedio de la ventana).
    for (const [operario, palhh] of prodMaqMap.entries()) {
      const c = matchOCrear(operario)
      c.es_maquinista = true
      c.productividad_maq = palhh
    }

    // Scoring
    const tope = config.tope_errores > 0 ? config.tope_errores : 1
    function scoreOf(c: Cand): {
      nota_5s: number | null
      errores_score: number | null
      productividad: number | null
      productividad_maq: number | null
      productividad_score: number | null
      score: number
    } {
      const nota_5s = c.notas5s.length
        ? c.notas5s.reduce((a, b) => a + b, 0) / c.notas5s.length
        : null
      const errores_score =
        c.errores_cant != null
          ? clamp(100 * (1 - c.errores_cant / tope), 0, 100)
          : null
      // Productividad: cada actividad se normaliza contra su propio target
      // (picking bul/HH vs prod_target; maquinista Pal/HH vs prod_target_maq)
      // y el puntaje es el promedio de las que tenga el operario. Solo afecta
      // el score si peso_productividad > 0 (editable en el panel).
      const target = config.prod_target > 0 ? config.prod_target : 300
      const targetMaq = config.prod_target_maq > 0 ? config.prod_target_maq : 18
      const productividad = c.productividad
      const productividad_maq = c.productividad_maq
      const subScores: number[] = []
      if (c.productividad != null)
        subScores.push(clamp((c.productividad / target) * 100, 0, 100))
      if (c.productividad_maq != null)
        subScores.push(clamp((c.productividad_maq / targetMaq) * 100, 0, 100))
      const productividad_score = subScores.length
        ? subScores.reduce((a, b) => a + b, 0) / subScores.length
        : null

      const parts: Array<[number, number]> = []
      if (nota_5s != null && config.peso_5s > 0)
        parts.push([config.peso_5s, nota_5s])
      if (errores_score != null && config.peso_errores > 0)
        parts.push([config.peso_errores, errores_score])
      if (productividad_score != null && config.peso_productividad > 0)
        parts.push([config.peso_productividad, productividad_score])
      const tw = parts.reduce((a, [w]) => a + w, 0)
      const score = tw > 0 ? parts.reduce((a, [w, v]) => a + w * v, 0) / tw : 0
      return {
        nota_5s,
        errores_score,
        productividad,
        productividad_maq,
        productividad_score,
        score,
      }
    }

    const rows: S5AyudanteDepositoRow[] = cands.map((c) => {
      const s = scoreOf(c)
      return {
        empleado_id: c.empleado_id,
        nombre: c.nombre,
        es_picker: c.es_picker,
        es_maquinista: c.es_maquinista,
        es_responsable: c.es_responsable,
        sectores: Array.from(c.sectores),
        nota_5s: s.nota_5s != null ? Number(s.nota_5s.toFixed(1)) : null,
        errores_cant:
          c.errores_cant != null ? Number(c.errores_cant.toFixed(1)) : null,
        errores_score:
          s.errores_score != null ? Number(s.errores_score.toFixed(1)) : null,
        productividad: s.productividad,
        productividad_maq: s.productividad_maq,
        productividad_score: s.productividad_score,
        score: Number(s.score.toFixed(1)),
        posicion_sugerida: null,
      }
    })
    rows.sort((a, b) => b.score - a.score)

    // Podio sugerido: los 3 mejores por score, sin reservar puestos.
    // (Regla pedida por el usuario 2026-05-21: que queden los primeros 3.)
    rows.slice(0, 3).forEach((r, i) => {
      r.posicion_sugerida = i + 1
    })

    // Premios guardados
    const premios = ((premiosRes.data ?? []) as S5AyudantePremio[]).sort(
      (a, b) => a.posicion - b.posicion,
    )

    const fotos_ganadores = await fotosGanadoresDePeriodo(desde)

    return {
      data: {
        periodo_desde: desde,
        periodo_hasta: hasta,
        meses,
        ranking: rows,
        premios_deposito: premios.filter((p) => p.area === "deposito"),
        premios_distribucion: premios.filter((p) => p.area === "distribucion"),
        fotos_ganadores,
        config,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el ranking",
    }
  }
}

// ── Config: actualizar fórmula ──
export async function updateAyudantesConfig(input: {
  peso_errores: number
  peso_5s: number
  peso_productividad: number
  tope_errores: number
  prod_target: number
  prod_target_maq: number
  meses_ventana: number
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "auditor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("s5_ayudantes_config")
      .update({
        peso_errores: input.peso_errores,
        peso_5s: input.peso_5s,
        peso_productividad: input.peso_productividad,
        tope_errores: input.tope_errores,
        prod_target: input.prod_target,
        prod_target_maq: input.prod_target_maq,
        meses_ventana: Math.max(1, Math.min(6, Math.round(input.meses_ventana))),
        updated_by: profile.id,
      })
      .eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar la fórmula",
    }
  }
}

// ── Premios: guardar / borrar ──
export async function savePremio(input: {
  periodo_desde: string
  area: S5PremioArea
  posicion: number
  empleado_id: string | null
  nombre: string
  score: number | null
  origen: "auto" | "manual"
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "auditor"])
    if (!input.nombre.trim()) return { error: "El nombre es obligatorio" }
    const supabase = await createClient()
    const config = await readConfig(supabase)
    const periodoDesde = anclarPeriodo(input.periodo_desde, config.meses_ventana)
    const { error } = await supabase.from("s5_ayudantes_premios").upsert(
      {
        periodo_desde: periodoDesde,
        area: input.area,
        posicion: input.posicion,
        empleado_id: input.empleado_id,
        nombre: input.nombre.trim(),
        score: input.score,
        origen: input.origen,
        updated_by: profile.id,
      },
      { onConflict: "periodo_desde,area,posicion" },
    )
    if (error) return { error: error.message }
    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar el premio",
    }
  }
}

export async function deletePremio(input: {
  periodo_desde: string
  area: S5PremioArea
  posicion: number
}): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()
    const config = await readConfig(supabase)
    const periodoDesde = anclarPeriodo(input.periodo_desde, config.meses_ventana)
    const { error } = await supabase
      .from("s5_ayudantes_premios")
      .delete()
      .eq("periodo_desde", periodoDesde)
      .eq("area", input.area)
      .eq("posicion", input.posicion)
    if (error) return { error: error.message }
    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo borrar el premio",
    }
  }
}

// ── Foto de ganadores: subir / borrar ──
export async function uploadFotoGanadores(
  formData: FormData,
): Promise<{ ok: true; url: string } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const periodo = String(formData.get("periodo_desde") || "")
    const area = String(formData.get("area") || "")
    const file = formData.get("file")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodo)) return { error: "Período inválido" }
    if (area !== "deposito" && area !== "distribucion") return { error: "Área inválida" }
    if (!(file instanceof File) || file.size === 0) return { error: "Archivo inválido" }

    const svc = serviceClient()
    // El bucket se crea on-demand (público) la primera vez; si ya existe, se ignora.
    await svc.storage.createBucket(FOTOS_GANADORES_BUCKET, { public: true }).catch(() => {})

    const path = `${periodo}/${area}.jpg`
    const buf = await file.arrayBuffer()
    const { error: upErr } = await svc.storage
      .from(FOTOS_GANADORES_BUCKET)
      .upload(path, buf, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      })
    if (upErr) return { error: upErr.message }

    const { data: pub } = svc.storage.from(FOTOS_GANADORES_BUCKET).getPublicUrl(path)
    revalidatePath(PAGE_PATH)
    return { ok: true, url: pub.publicUrl }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo subir la foto",
    }
  }
}

export async function deleteFotoGanadores(input: {
  periodo_desde: string
  area: S5PremioArea
}): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const svc = serviceClient()
    const { error } = await svc.storage
      .from(FOTOS_GANADORES_BUCKET)
      .remove([`${input.periodo_desde}/${input.area}.jpg`])
    if (error) return { error: error.message }
    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo borrar la foto",
    }
  }
}

/** Toma el top 3 sugerido por la fórmula y lo guarda como premios de depósito. */
export async function confirmarSugeridosDeposito(
  periodoDesde: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const res = await getRankingDeposito(periodoDesde)
    if ("error" in res) return { error: res.error }
    const sugeridos = res.data.ranking
      .filter((r) => r.posicion_sugerida != null)
      .sort((a, b) => (a.posicion_sugerida ?? 9) - (b.posicion_sugerida ?? 9))
    for (const r of sugeridos) {
      const out = await savePremio({
        periodo_desde: periodoDesde,
        area: "deposito",
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
    return {
      error: err instanceof Error ? err.message : "No se pudo confirmar el top 3",
    }
  }
}
