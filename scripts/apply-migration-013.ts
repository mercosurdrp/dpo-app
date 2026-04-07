import fs from "fs"
import path from "path"

const PROJECT_REF = "tpafgmbhnucdiavvxbcg"
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI"

const BASE_URL = `https://${PROJECT_REF}.supabase.co`

async function execSql(sql: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  // Try the /pg endpoint (Supabase's direct SQL execution via HTTP)
  const endpoints = [
    `/rest/v1/rpc/exec_sql`,
    `/pg/query`,
  ]

  // Method 1: Try creating and using exec_sql function via a workaround
  // Actually, the simplest: use Supabase's pg HTTP endpoint
  const res = await fetch(`${BASE_URL}/rest/v1/`, {
    method: "OPTIONS",
    headers: {
      apikey: SERVICE_KEY,
    },
  })

  // The real approach: use supabase-js .rpc() with a custom function
  // First, let's check if we can create a function via the schema endpoint

  // Actually, try the new Supabase SQL endpoint (available in newer projects)
  const sqlRes = await fetch(`${BASE_URL}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (sqlRes.ok) {
    const data = await sqlRes.json()
    return { ok: true, data }
  }

  return { ok: false, error: `${sqlRes.status}: ${await sqlRes.text()}` }
}

async function main() {
  console.log("Applying migration 013_mapeo_empleados...\n")

  // Read SQL file
  const sqlPath = path.join(process.cwd(), "supabase/migrations/013_mapeo_empleados.sql")
  const sql = fs.readFileSync(sqlPath, "utf8")

  // Try executing
  const result = await execSql(sql)

  if (result.ok) {
    console.log("✓ Migration applied successfully!")
    console.log("Result:", JSON.stringify(result.data).slice(0, 300))
  } else {
    console.log(`✗ Failed: ${result.error}`)

    // Try individual statements
    console.log("\nTrying individual statements...\n")

    // Split by semicolon-newline (rough but works for our SQL)
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"))

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ";"
      const label = stmt.slice(0, 60).replace(/\n/g, " ")
      const r = await execSql(stmt)
      if (r.ok) {
        console.log(`  [${i + 1}/${statements.length}] OK: ${label}...`)
      } else {
        console.log(`  [${i + 1}/${statements.length}] FAIL: ${label}...`)
        console.log(`    Error: ${r.error?.slice(0, 150)}`)
      }
    }
  }

  // Verify tables exist
  console.log("\nVerifying...")
  const verifyRes = await execSql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mapeo_%'")
  if (verifyRes.ok) {
    console.log("Tables:", JSON.stringify(verifyRes.data))
  } else {
    console.log("Could not verify:", verifyRes.error?.slice(0, 100))
  }
}

main()
