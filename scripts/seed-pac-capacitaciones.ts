import { createClient } from "@supabase/supabase-js"
import ExcelJS from "exceljs"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Normalize pilar names
function normalizePilar(p: string): string {
  const map: Record<string, string> = {
    "ALMACEN": "Almacen",
    "ALMACÉN": "Almacen",
    "GENTE": "Gente",
    "FLOTA": "Flota",
    "ENTREGA": "Entrega",
    "GESTIÓN": "Gestion",
    "GESTION": "Gestion",
    "PLANEAMIENTO": "Planeamiento",
    "SEGURIDAD": "Seguridad",
  }
  return map[p.toUpperCase()] || p
}

async function main() {
  // 1. Delete all existing capacitaciones (cascade deletes asistencias)
  console.log("Borrando capacitaciones existentes...")
  const { error: delErr } = await supabase.from("capacitaciones").delete().neq("id", "00000000-0000-0000-0000-000000000000")
  if (delErr) console.log("  Error borrando:", delErr.message)
  else console.log("  OK")

  // 2. Get admin profile
  const { data: admin } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .single()
  const createdBy = admin?.id ?? null

  // 3. Get all empleados
  const { data: empleados } = await supabase
    .from("empleados")
    .select("id")
    .eq("activo", true)
  const empleadoIds = (empleados ?? []).map((e: { id: string }) => e.id)

  // 4. Parse Excel
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile("public/PAC 2026 - DPO - MERCOSUR.xlsx")
  const ws = wb.getWorksheet("PAC 2026 - Propuesta")!

  // Group unique capacitaciones by pilar+titulo
  const seen = new Map<string, {
    pilar: string
    titulo: string
    contenidos: string[]
    mes: string
  }>()
  let lastPilar = ""
  let lastCap = ""

  for (let r = 6; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const pilarRaw = String(row.getCell(1).value || "").trim()
    const capacitacion = String(row.getCell(3).value || "").trim()
    const contenido = String(row.getCell(4).value || "").trim()
    const mes = String(row.getCell(13).value || "").trim()

    if (pilarRaw) lastPilar = pilarRaw
    const capName = capacitacion || lastCap
    if (capacitacion) lastCap = capacitacion

    if (!capName) continue

    const key = lastPilar + "|" + capName
    if (!seen.has(key)) {
      const contenidos: string[] = []
      if (contenido) contenidos.push(contenido)
      seen.set(key, { pilar: normalizePilar(lastPilar), titulo: capName, contenidos, mes })
    } else {
      const existing = seen.get(key)!
      if (contenido && !existing.contenidos.includes(contenido)) {
        existing.contenidos.push(contenido)
      }
      if (mes && !existing.mes) existing.mes = mes
    }
  }

  const capacitaciones = [...seen.values()]
  console.log(`\nCreando ${capacitaciones.length} capacitaciones con ${empleadoIds.length} empleados...\n`)

  let ok = 0
  let fail = 0

  for (const cap of capacitaciones) {
    const descripcion = cap.contenidos.length > 0
      ? cap.contenidos.join(". ")
      : null

    const { data: created, error } = await supabase
      .from("capacitaciones")
      .insert({
        titulo: cap.titulo,
        descripcion,
        instructor: "Por definir",
        fecha: "2026-12-31", // placeholder - to be defined
        duracion_horas: 1,
        lugar: null,
        material_url: null,
        pilar: cap.pilar,
        estado: "programada",
        created_by: createdBy,
      })
      .select()
      .single()

    if (error) {
      console.log(`FAIL  [${cap.pilar}] ${cap.titulo}: ${error.message}`)
      fail++
      continue
    }

    // Enroll all empleados
    const asistencias = empleadoIds.map((eid: string) => ({
      capacitacion_id: created.id,
      empleado_id: eid,
      presente: false,
      resultado: "pendiente",
    }))

    await supabase.from("asistencias").insert(asistencias)

    console.log(`OK    [${cap.pilar}] ${cap.titulo}`)
    ok++
  }

  console.log(`\nListo: ${ok} creadas, ${fail} fallidas`)
}

main()
