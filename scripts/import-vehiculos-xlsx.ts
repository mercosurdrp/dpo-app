/**
 * Script para importar registros de vehículos desde el Excel del Google Sheets
 * Solo importa datos de 2026 en adelante.
 *
 * Uso: npx tsx scripts/import-vehiculos-xlsx.ts
 *
 * Requiere env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import XLSX from "xlsx"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const HORA_ENTRADA = 7 * 60 // 07:00 en minutos
const SERIAL_2026 = 46023 // Excel serial for Jan 1, 2026

function excelSerialToDate(serial: number): string {
  const date = new Date((serial - 25569) * 86400000)
  return date.toISOString().slice(0, 10)
}

function excelTimeToHHMM(fraction: number): string {
  const totalMin = Math.round(fraction * 24 * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function calcTml(horaStr: string): number {
  const [h, m] = horaStr.split(":").map(Number)
  return h * 60 + m - HORA_ENTRADA
}

async function main() {
  const wb = XLSX.readFile("public/Ingreso_egreso de vehículos (respuestas).xlsx")
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  // Filter 2026+ rows
  const dataRows = rows.slice(1).filter((r) => {
    const serial = r[0] as number
    return serial >= SERIAL_2026
  })

  console.log(`Total rows: ${rows.length - 1}, 2026+: ${dataRows.length}`)

  // Collect unique choferes and dominios for catalogs
  const choferes = new Set<string>()
  const dominios = new Set<string>()

  const records = dataRows.map((r) => {
    const tipo = (r[1] as string).toLowerCase() as "ingreso" | "egreso"
    const dominio = (r[2] as string).trim().toUpperCase()
    const chofer = (r[3] as string).trim().toUpperCase()
    const ay1 = r[4] as string | undefined
    const ay2 = r[5] as string | undefined
    const odometro = r[6] as number | undefined
    const horaFrac = r[7] as number
    const semana = r[8] as number
    const fecha = excelSerialToDate(Math.floor(r[0] as number))
    const hora = excelTimeToHHMM(horaFrac)
    const tml = tipo === "egreso" ? calcTml(hora) : null

    choferes.add(chofer)
    dominios.add(dominio)

    // Also add ayudantes as potential choferes
    const a1 = ay1?.trim().toUpperCase()
    const a2 = ay2?.trim().toUpperCase()
    if (a1 && a1 !== "SIN AYUDANTE" && a1 !== "OTRO") choferes.add(a1)
    if (a2 && a2 !== "SIN AYUDANTE" && a2 !== "OTRO") choferes.add(a2)

    return {
      tipo,
      fecha,
      dominio,
      chofer,
      ayudante1: a1 && a1 !== "SIN AYUDANTE" ? a1 : null,
      ayudante2: a2 && a2 !== "SIN AYUDANTE" ? a2 : null,
      odometro: odometro || null,
      hora: hora + ":00",
      semana,
      tml_minutos: tml,
      observaciones: "Importado desde Google Sheets",
    }
  })

  // 1. Seed catalogo_choferes
  console.log(`\nSeeding ${choferes.size} choferes...`)
  const choferRows = Array.from(choferes)
    .filter((c) => c !== "OTRO")
    .map((nombre) => ({ nombre }))

  const { error: chErr } = await supabase
    .from("catalogo_choferes")
    .upsert(choferRows, { onConflict: "nombre" })
  if (chErr) console.error("Error seeding choferes:", chErr.message)
  else console.log(`  OK: ${choferRows.length} choferes`)

  // 2. Seed catalogo_vehiculos
  console.log(`Seeding ${dominios.size} vehiculos...`)
  const vehRows = Array.from(dominios).map((dominio) => ({ dominio }))

  const { error: vhErr } = await supabase
    .from("catalogo_vehiculos")
    .upsert(vehRows, { onConflict: "dominio" })
  if (vhErr) console.error("Error seeding vehiculos:", vhErr.message)
  else console.log(`  OK: ${vehRows.length} vehiculos`)

  // 3. Insert registros in batches of 100
  console.log(`\nImporting ${records.length} registros...`)
  let inserted = 0
  const batchSize = 100

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error } = await supabase.from("registros_vehiculos").insert(batch)
    if (error) {
      console.error(`Error batch ${i}-${i + batch.length}:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`  ${inserted}/${records.length}\r`)
    }
  }

  console.log(`\nDone! ${inserted} registros imported.`)

  // Quick stats
  const egresos = records.filter((r) => r.tipo === "egreso")
  const tmls = egresos.map((r) => r.tml_minutos!).filter((t) => t != null)
  const avg = Math.round(tmls.reduce((a, b) => a + b, 0) / tmls.length)
  const dentroMeta = tmls.filter((t) => t <= 30).length
  console.log(`\nStats 2026:`)
  console.log(`  Egresos: ${egresos.length}`)
  console.log(`  TML promedio: ${avg} min`)
  console.log(`  Dentro de meta (≤30min): ${dentroMeta}/${tmls.length} (${Math.round(dentroMeta / tmls.length * 100)}%)`)
}

main().catch(console.error)
