import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Normalize name for comparison: uppercase, trim, remove extra spaces
function normalize(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
}

// Extract surname (first token) for fuzzy matching
function surname(name: string): string {
  return normalize(name).split(" ")[0]
}

async function main() {
  console.log("Seed Mapeo Empleados — Auto-match\n")
  console.log("=".repeat(60))

  // 1. Fetch all data sources
  const [empleadosRes, choferesRes, vehiculosRes, rechazosRes] = await Promise.all([
    supabase.from("empleados").select("id, legajo, nombre").eq("activo", true).order("nombre"),
    supabase.from("catalogo_choferes").select("id, nombre").eq("active", true).order("nombre"),
    supabase.from("registros_vehiculos").select("dominio, chofer").order("fecha", { ascending: false }),
    supabase.from("rechazos").select("ds_fletero_carga, id_fletero_carga").not("ds_fletero_carga", "is", null),
  ])

  const empleados = empleadosRes.data ?? []
  const choferes = choferesRes.data ?? []
  const vehiculos = vehiculosRes.data ?? []
  const rechazos = rechazosRes.data ?? []

  console.log(`Empleados activos: ${empleados.length}`)
  console.log(`Choferes TML: ${choferes.length}`)
  console.log(`Registros vehículos: ${vehiculos.length}`)
  console.log(`Rechazos con fletero: ${rechazos.length}`)
  console.log()

  // Build empleado lookup by normalized name and surname
  const empByName = new Map<string, typeof empleados[0]>()
  const empBySurname = new Map<string, typeof empleados[0][]>()

  for (const e of empleados) {
    empByName.set(normalize(e.nombre), e)
    const sn = surname(e.nombre)
    if (!empBySurname.has(sn)) empBySurname.set(sn, [])
    empBySurname.get(sn)!.push(e)
  }

  // ============================================
  // STEP 1: Auto-match choferes TML → empleados
  // ============================================
  console.log("--- CHOFERES TML → EMPLEADOS ---\n")

  let choferOk = 0
  let choferSkip = 0
  const unmatchedChoferes: string[] = []

  for (const chofer of choferes) {
    const normName = normalize(chofer.nombre)

    // Try exact match
    let match = empByName.get(normName)

    // Try surname match (only if unique)
    if (!match) {
      const sn = surname(chofer.nombre)
      const candidates = empBySurname.get(sn) ?? []
      if (candidates.length === 1) {
        match = candidates[0]
      }
    }

    if (match) {
      const { error } = await supabase.from("mapeo_empleado_chofer").upsert(
        {
          empleado_id: match.id,
          nombre_chofer: chofer.nombre,
          notas: "auto-match",
        },
        { onConflict: "nombre_chofer" }
      )
      if (error) {
        console.log(`  ERROR ${chofer.nombre}: ${error.message}`)
        choferSkip++
      } else {
        console.log(`  OK   ${chofer.nombre} → ${match.legajo} ${match.nombre}`)
        choferOk++
      }
    } else {
      console.log(`  ???  ${chofer.nombre} — sin match`)
      unmatchedChoferes.push(chofer.nombre)
      choferSkip++
    }
  }

  console.log(`\nChoferes: ${choferOk} mapeados, ${choferSkip} pendientes`)

  // ============================================
  // STEP 2: Auto-match fleteros ERP → empleados
  // via cross-reference with TML records
  // ============================================
  console.log("\n--- FLETEROS ERP → EMPLEADOS (via TML cross-ref) ---\n")

  // Build map: dominio (plate) → chofer name (from TML records)
  const plateToChofer = new Map<string, string>()
  for (const v of vehiculos) {
    if (v.dominio && v.chofer && !plateToChofer.has(v.dominio)) {
      plateToChofer.set(v.dominio, v.chofer)
    }
  }

  // Get distinct fletero plates from rechazos
  const fleteroPlates = new Map<string, number | null>()
  for (const r of rechazos) {
    if (r.ds_fletero_carga && !fleteroPlates.has(r.ds_fletero_carga)) {
      fleteroPlates.set(r.ds_fletero_carga, r.id_fletero_carga)
    }
  }

  // Get already-mapped choferes to resolve fletero→empleado
  const { data: mappedChoferes } = await supabase
    .from("mapeo_empleado_chofer")
    .select("empleado_id, nombre_chofer")

  const choferToEmpleado = new Map<string, string>()
  for (const mc of mappedChoferes ?? []) {
    choferToEmpleado.set(mc.nombre_chofer, mc.empleado_id)
  }

  let fleteroOk = 0
  let fleteroSkip = 0
  const unmatchedFleteros: string[] = []

  for (const [plate, idFletero] of fleteroPlates) {
    // Find chofer name for this plate from TML records
    const choferName = plateToChofer.get(plate)
    let empleadoId: string | undefined

    if (choferName) {
      empleadoId = choferToEmpleado.get(choferName)
    }

    if (empleadoId) {
      const { error } = await supabase.from("mapeo_empleado_fletero").upsert(
        {
          empleado_id: empleadoId,
          ds_fletero_carga: plate,
          id_fletero_carga: idFletero,
          notas: `auto-match via TML chofer: ${choferName}`,
        },
        { onConflict: "ds_fletero_carga" }
      )
      if (error) {
        console.log(`  ERROR ${plate}: ${error.message}`)
        fleteroSkip++
      } else {
        const emp = empleados.find((e) => e.id === empleadoId)
        console.log(`  OK   ${plate} → ${emp?.legajo} ${emp?.nombre} (via ${choferName})`)
        fleteroOk++
      }
    } else {
      const reason = choferName
        ? `chofer "${choferName}" no mapeado`
        : "sin registro TML"
      console.log(`  ???  ${plate} — ${reason}`)
      unmatchedFleteros.push(plate)
      fleteroSkip++
    }
  }

  console.log(`\nFleteros: ${fleteroOk} mapeados, ${fleteroSkip} pendientes`)

  // ============================================
  // SUMMARY
  // ============================================
  console.log("\n" + "=".repeat(60))
  console.log("RESUMEN")
  console.log("=".repeat(60))
  console.log(`Choferes TML mapeados:  ${choferOk}/${choferes.length}`)
  console.log(`Fleteros ERP mapeados:  ${fleteroOk}/${fleteroPlates.size}`)

  if (unmatchedChoferes.length > 0) {
    console.log(`\nChoferes sin match (resolver en /admin/mapeo-empleados):`)
    unmatchedChoferes.forEach((c) => console.log(`  - ${c}`))
  }

  if (unmatchedFleteros.length > 0) {
    console.log(`\nFleteros sin match (resolver en /admin/mapeo-empleados):`)
    unmatchedFleteros.forEach((f) => console.log(`  - ${f}`))
  }
}

main()
