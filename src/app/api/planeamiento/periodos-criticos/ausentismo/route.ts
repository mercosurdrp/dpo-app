import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

export const dynamic = "force-dynamic"

// POST multipart con un .xlsx que tenga la primera hoja con columnas
//   anio | mes | pct_ausentismo [| total_planta | total_ausentes | comentario]
//
// pct_ausentismo se acepta como decimal (0.045) o porcentaje (4.5). Si el
// valor es > 1 se asume porcentaje y se divide por 100.
//
// Upsert por (anio, mes). Reemplaza valores existentes.
type FilaUpload = {
  anio: number
  mes: number
  pct_ausentismo: number
  total_planta: number | null
  total_ausentes: number | null
  comentario: string | null
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
  try {
    filas = parsearExcel(await file.arrayBuffer())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al leer el Excel" },
      { status: 400 },
    )
  }
  if (filas.length === 0) {
    return NextResponse.json({ error: "El Excel no tiene filas con datos" }, { status: 400 })
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
    insertadas: filas.length,
    rangos: {
      desde: `${filas[0].anio}-${String(filas[0].mes).padStart(2, "0")}`,
      hasta: `${filas[filas.length - 1].anio}-${String(filas[filas.length - 1].mes).padStart(2, "0")}`,
    },
  })
}

function parsearExcel(buffer: ArrayBuffer): FilaUpload[] {
  const wb = XLSX.read(buffer, { type: "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error("El Excel no tiene hojas")
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    blankrows: false,
  })

  // Normalizo headers (lowercase, sin tildes, sin espacios)
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")

  const out: FilaUpload[] = []
  for (const [idx, raw] of filas.entries()) {
    const fila: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      fila[norm(k)] = v
    }
    const anio = Number(fila["anio"] ?? fila["ano"] ?? fila["year"])
    const mes = Number(fila["mes"] ?? fila["month"])
    const pctRaw = Number(fila["pct_ausentismo"] ?? fila["ausentismo"] ?? fila["pct"])
    if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(pctRaw)) {
      throw new Error(`Fila ${idx + 2}: anio/mes/pct_ausentismo deben ser numéricos`)
    }
    if (anio < 2024 || anio > 2035) {
      throw new Error(`Fila ${idx + 2}: anio fuera de rango (2024–2035)`)
    }
    if (mes < 1 || mes > 12) {
      throw new Error(`Fila ${idx + 2}: mes debe estar entre 1 y 12`)
    }
    // Detectar si vino como porcentaje (>1) o decimal (≤1)
    const pct = pctRaw > 1 ? pctRaw / 100 : pctRaw
    if (pct < 0 || pct > 1) {
      throw new Error(`Fila ${idx + 2}: pct_ausentismo fuera de rango 0–100%`)
    }
    const totalPlanta = fila["total_planta"]
    const totalAusentes = fila["total_ausentes"]
    out.push({
      anio,
      mes,
      pct_ausentismo: Number(pct.toFixed(4)),
      total_planta: totalPlanta != null && Number.isFinite(Number(totalPlanta)) ? Number(totalPlanta) : null,
      total_ausentes: totalAusentes != null && Number.isFinite(Number(totalAusentes)) ? Number(totalAusentes) : null,
      comentario: typeof fila["comentario"] === "string" ? (fila["comentario"] as string) : null,
    })
  }
  // ordeno por (anio, mes) para meta del rango
  out.sort((a, b) => (a.anio - b.anio) * 100 + (a.mes - b.mes))
  return out
}
