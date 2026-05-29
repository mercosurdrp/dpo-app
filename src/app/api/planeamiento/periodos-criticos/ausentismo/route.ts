import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// POST multipart con un .xlsx en alguno de estos 2 formatos:
//
// (A) FORMATO SIMPLE — una fila por mes:
//     anio | mes | pct_ausentismo [| total_planta | total_ausentes | comentario]
//
// (B) FORMATO LICENCIAS (export de Quilmes "Licencias"):
//     Sector · Legajo · Nombre · Fecha inicio · Fecha fin · Días · Motivo · ...
//     Cada fila = 1 licencia. El endpoint:
//       - filtra Sector contiene "Distribución" (caso-insensible, sin acentos)
//       - expande cada licencia día por día entre inicio y fin (inclusive)
//       - excluye DOMINGOS (no hay distribución)
//       - agrupa por (año, mes) sumando días-persona caídos
//       - calcula universo SEGÚN TEMPORADA:
//           Alta  (Nov-Dic-Ene-Feb-Mar): 32
//           Media (Abr-May-Sep-Oct):     25
//           Baja  (Jun-Jul-Ago):         18
//       - denominador = universo × días Lun-Sáb del mes
//       - pct_ausentismo = días_caidos / denominador
//
// El detector elige el parser según las columnas presentes.
//
// Resultado en ambos casos: upsert por (anio, mes) en pc_ausentismo_mensual.

type FilaUpload = {
  anio: number
  mes: number
  pct_ausentismo: number
  total_planta: number | null
  total_ausentes: number | null
  comentario: string | null
}

const TEMPORADA_ALTA  = new Set([11, 12, 1, 2, 3]) // 32 personas
const TEMPORADA_BAJA  = new Set([6, 7, 8])         // 18 personas
const UNIVERSO_ALTA  = 32
const UNIVERSO_BAJA  = 18
const UNIVERSO_MEDIA = Math.round((UNIVERSO_ALTA + UNIVERSO_BAJA) / 2) // 25

function universoDelMes(mes: number): { universo: number; etiqueta: string } {
  if (TEMPORADA_ALTA.has(mes)) return { universo: UNIVERSO_ALTA, etiqueta: "Alta" }
  if (TEMPORADA_BAJA.has(mes)) return { universo: UNIVERSO_BAJA, etiqueta: "Baja" }
  return { universo: UNIVERSO_MEDIA, etiqueta: "Media" }
}

// Días Lun-Sáb (excluye Domingos) de un mes
function diasLunSabDelMes(anio: number, mes: number): number {
  const ultimoDia = new Date(anio, mes, 0).getDate()
  let n = 0
  for (let d = 1; d <= ultimoDia; d++) {
    if (new Date(anio, mes - 1, d).getDay() !== 0) n++
  }
  return n
}

// Quita acentos + lowercase para detectar columnas
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

export async function POST(req: NextRequest) {
  if (!IS_MISIONES) {
    return NextResponse.json({ error: "No disponible en este tenant" }, { status: 404 })
  }
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!["admin", "admin_rrhh", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 })
  }

  let filas: FilaUpload[]
  let formatoDetectado: "simple" | "licencias"
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: "array" })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) throw new Error("El Excel no tiene hojas")
    const filasRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      blankrows: false,
    })

    formatoDetectado = detectarFormato(filasRaw)
    filas =
      formatoDetectado === "licencias"
        ? parsearLicencias(filasRaw)
        : parsearSimple(filasRaw)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al leer el Excel" },
      { status: 400 },
    )
  }
  if (filas.length === 0) {
    return NextResponse.json({ error: "El Excel no tiene filas válidas" }, { status: 400 })
  }

  const supabase = await createClient()
  const payload = filas.map((f) => ({
    anio: f.anio,
    mes: f.mes,
    pct_ausentismo: f.pct_ausentismo,
    total_planta: f.total_planta,
    total_ausentes: f.total_ausentes,
    comentario: f.comentario,
    uploaded_by: profile.id,
  }))
  const { error } = await supabase
    .from("pc_ausentismo_mensual")
    .upsert(payload, { onConflict: "anio,mes" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    formato: formatoDetectado,
    insertadas: filas.length,
    rangos: {
      desde: `${filas[0].anio}-${String(filas[0].mes).padStart(2, "0")}`,
      hasta: `${filas[filas.length - 1].anio}-${String(filas[filas.length - 1].mes).padStart(2, "0")}`,
    },
    // Devuelve el desglose mensual para que la UI pueda mostrarlo (sin
    // necesidad de re-fetch ni de pegarle a pc_ausentismo_mensual)
    detalle: filas.map((f) => ({
      anio: f.anio,
      mes: f.mes,
      pct_ausentismo: f.pct_ausentismo,
      total_planta: f.total_planta,
      total_ausentes: f.total_ausentes,
      comentario: f.comentario,
    })),
  })
}

// ============================================================================
// Detector
// ============================================================================
function detectarFormato(filas: Record<string, unknown>[]): "simple" | "licencias" {
  if (filas.length === 0) return "simple"
  const cols = new Set(Object.keys(filas[0] ?? {}).map(norm))
  // Si tiene Sector + (Fecha inicio o Fecha fin) → es export de Licencias
  if (cols.has("sector") && (cols.has("fecha inicio") || cols.has("fecha fin"))) {
    return "licencias"
  }
  return "simple"
}

// ============================================================================
// Parser A — formato simple (1 fila por mes)
// ============================================================================
function parsearSimple(filas: Record<string, unknown>[]): FilaUpload[] {
  const out: FilaUpload[] = []
  for (const [idx, raw] of filas.entries()) {
    const fila: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      fila[norm(k).replace(/[^a-z0-9]+/g, "_")] = v
    }
    const anio = Number(fila["anio"] ?? fila["ano"] ?? fila["year"])
    const mes  = Number(fila["mes"] ?? fila["month"])
    const pctRaw = Number(fila["pct_ausentismo"] ?? fila["ausentismo"] ?? fila["pct"])
    if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(pctRaw)) {
      throw new Error(`Fila ${idx + 2}: anio/mes/pct_ausentismo deben ser numéricos`)
    }
    if (anio < 2024 || anio > 2035) throw new Error(`Fila ${idx + 2}: anio fuera de rango`)
    if (mes < 1 || mes > 12) throw new Error(`Fila ${idx + 2}: mes 1-12`)
    const pct = pctRaw > 1 ? pctRaw / 100 : pctRaw
    if (pct < 0 || pct > 1) throw new Error(`Fila ${idx + 2}: pct fuera de rango 0-100%`)
    out.push({
      anio, mes,
      pct_ausentismo: Number(pct.toFixed(4)),
      total_planta:   filaNumOrNull(fila["total_planta"]),
      total_ausentes: filaNumOrNull(fila["total_ausentes"]),
      comentario:     typeof fila["comentario"] === "string" ? (fila["comentario"] as string) : null,
    })
  }
  out.sort((a, b) => (a.anio - b.anio) * 100 + (a.mes - b.mes))
  return out
}

function filaNumOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ============================================================================
// Parser B — formato "Licencias" Quilmes (1 fila por evento)
// ============================================================================
function parsearLicencias(filas: Record<string, unknown>[]): FilaUpload[] {
  // Normalizar headers
  const filasN = filas.map((raw) => {
    const f: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) f[norm(k)] = v
    return f
  })

  // Filtrar Distribución (acepta "Distribución", "Distribucion", todo mayus/minus)
  const dist = filasN.filter((f) => {
    const sector = String(f["sector"] ?? "")
    return norm(sector).includes("distribucion")
  })
  if (dist.length === 0) {
    throw new Error("No se encontraron filas con Sector = Distribución")
  }

  // Expandir cada licencia a días-persona caídos (excluir Domingos)
  const caidosPorMes = new Map<string, number>()   // "YYYY-MM" → días-persona caídos L-S
  for (const [idx, f] of dist.entries()) {
    const ini = parsearFecha(f["fecha inicio"])
    const fin = parsearFecha(f["fecha fin"])
    if (!ini || !fin) {
      // licencia sin fechas — no la puedo expandir, salto
      continue
    }
    if (fin < ini) {
      throw new Error(`Fila ${idx + 2}: Fecha fin antes que Fecha inicio`)
    }
    // Cap: si una licencia atraviesa años (raro pero posible), igual la cuento día por día
    for (const d of rangeDiasInclusive(ini, fin)) {
      if (d.getDay() === 0) continue // Domingo NO impacta
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      caidosPorMes.set(key, (caidosPorMes.get(key) ?? 0) + 1)
    }
  }

  // Armar filas mensuales con universo por temporada
  const out: FilaUpload[] = []
  for (const [ym, caidos] of Array.from(caidosPorMes.entries()).sort()) {
    const [yStr, mStr] = ym.split("-")
    const anio = Number(yStr)
    const mes  = Number(mStr)
    const { universo, etiqueta } = universoDelMes(mes)
    const denom = universo * diasLunSabDelMes(anio, mes)
    const pct = Math.min(1, caidos / denom)
    out.push({
      anio, mes,
      pct_ausentismo: Number(pct.toFixed(4)),
      total_planta: universo,
      total_ausentes: caidos,
      comentario: `Temporada ${etiqueta} · ${caidos} días-persona / (${universo} × ${diasLunSabDelMes(anio, mes)} días L-S)`,
    })
  }
  return out
}

function parsearFecha(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v === "number") {
    // Excel serial date — XLSX ya suele convertir, pero por si acaso:
    // epoch Excel = 1899-12-30
    const ms = (v - 25569) * 86400 * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const s = String(v).trim()
  // Aceptar "DD/MM/YYYY" o "YYYY-MM-DD"
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function* rangeDiasInclusive(ini: Date, fin: Date): Generator<Date> {
  const cur = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate())
  const end = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate())
  while (cur <= end) {
    yield new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
}
