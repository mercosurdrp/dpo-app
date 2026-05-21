"use server"

import { revalidatePath } from "next/cache"
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

const PAGE_PATH = "/5s/ayudantes/deposito"

// Sheet "Errores picking" — cada fila = 1 error (col0 fecha, col1 operario,
// col2 bultos errados). Misma fuente que usa deposito-esteban.
const ERRORES_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1K7zWrhFFx7SBoTxZ6Dk93ZrgO05kULlGvxL6ahmUYTA/gviz/tq?tqx=out:csv&sheet=Errores%20picking"

const DEFAULT_CONFIG: S5AyudantesConfig = {
  peso_errores: 0.6,
  peso_5s: 0.4,
  peso_productividad: 0,
  tope_errores: 200,
  prod_target: 300,
  meses_ventana: 2,
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

/** Primer mes del bimestre por defecto: mes anterior al actual. */
export async function getBimestreActual(): Promise<string> {
  return addMonths(firstDayOfMonth(new Date()), -1)
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

function parseDecimalEs(s: string): number {
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
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

// ── Errores por operario desde el Sheet, acumulado en la ventana ──
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
      if (cells.length < 3) continue
      const fecha = parseFechaSheet(cells[0])
      if (!fecha) continue
      if (!prefijosMes.some((p) => fecha.startsWith(p))) continue
      const operario = (cells[1] ?? "").trim()
      if (!operario) continue
      const bultos = parseDecimalEs(cells[2] ?? "0")
      if (!Number.isFinite(bultos) || bultos <= 0) continue
      out.set(operario, (out.get(operario) ?? 0) + bultos)
    }
  } catch {
    /* best-effort: sin errores la fila queda en null */
  }
  return out
}

// ── Config ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readConfig(supabase: any): Promise<S5AyudantesConfig> {
  const { data } = await supabase
    .from("s5_ayudantes_config")
    .select(
      "peso_errores, peso_5s, peso_productividad, tope_errores, prod_target, meses_ventana",
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

    const desde = periodoDesde ?? (await getBimestreActual())
    const ventana = Math.max(1, Math.min(6, config.meses_ventana))
    const meses: string[] = []
    for (let i = 0; i < ventana; i++) meses.push(addMonths(desde, i))
    const hasta = meses[meses.length - 1]
    const prefijos = meses.map((m) => m.slice(0, 7))

    const [audRes, respRes, sectoresRes, erroresMap, premiosRes] =
      await Promise.all([
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
      errores_bultos: number | null
      es_picker: boolean
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
          errores_bultos: null,
          es_picker: false,
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

    // Pickers (errores). Matchear con un responsable por tokens o crear nuevo.
    for (const [operario, bultos] of erroresMap.entries()) {
      const tk = tokens(operario)
      let c = cands.find((x) => comparten(x._tokens, tk))
      if (!c) {
        c = {
          empleado_id: null,
          nombre: operario,
          notas5s: [],
          sectores: new Set<string>(),
          errores_bultos: 0,
          es_picker: true,
          es_responsable: false,
          _tokens: tk,
        }
        cands.push(c)
      }
      c.es_picker = true
      c.errores_bultos = (c.errores_bultos ?? 0) + bultos
    }

    // Scoring
    const tope = config.tope_errores > 0 ? config.tope_errores : 1
    function scoreOf(c: Cand): {
      nota_5s: number | null
      errores_score: number | null
      productividad: number | null
      productividad_score: number | null
      score: number
    } {
      const nota_5s = c.notas5s.length
        ? c.notas5s.reduce((a, b) => a + b, 0) / c.notas5s.length
        : null
      const errores_score =
        c.errores_bultos != null
          ? clamp(100 * (1 - c.errores_bultos / tope), 0, 100)
          : null
      // Productividad: fuera por ahora (peso 0). Slot listo para enchufar.
      const productividad: number | null = null
      const productividad_score: number | null = null

      const parts: Array<[number, number]> = []
      if (nota_5s != null && config.peso_5s > 0)
        parts.push([config.peso_5s, nota_5s])
      if (errores_score != null && config.peso_errores > 0)
        parts.push([config.peso_errores, errores_score])
      if (productividad_score != null && config.peso_productividad > 0)
        parts.push([config.peso_productividad, productividad_score])
      const tw = parts.reduce((a, [w]) => a + w, 0)
      const score = tw > 0 ? parts.reduce((a, [w, v]) => a + w * v, 0) / tw : 0
      return { nota_5s, errores_score, productividad, productividad_score, score }
    }

    const rows: S5AyudanteDepositoRow[] = cands.map((c) => {
      const s = scoreOf(c)
      return {
        empleado_id: c.empleado_id,
        nombre: c.nombre,
        es_picker: c.es_picker,
        es_responsable: c.es_responsable,
        sectores: Array.from(c.sectores),
        nota_5s: s.nota_5s != null ? Number(s.nota_5s.toFixed(1)) : null,
        errores_bultos:
          c.errores_bultos != null ? Number(c.errores_bultos.toFixed(1)) : null,
        errores_score:
          s.errores_score != null ? Number(s.errores_score.toFixed(1)) : null,
        productividad: s.productividad,
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

    return {
      data: {
        periodo_desde: desde,
        periodo_hasta: hasta,
        meses,
        ranking: rows,
        premios_deposito: premios.filter((p) => p.area === "deposito"),
        premios_distribucion: premios.filter((p) => p.area === "distribucion"),
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
    const { error } = await supabase.from("s5_ayudantes_premios").upsert(
      {
        periodo_desde: input.periodo_desde,
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
    const { error } = await supabase
      .from("s5_ayudantes_premios")
      .delete()
      .eq("periodo_desde", input.periodo_desde)
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
