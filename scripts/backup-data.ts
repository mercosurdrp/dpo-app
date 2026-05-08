/**
 * Backup de datos (solo filas) de todas las tablas del schema public.
 * Usa service role key — no requiere DB password.
 *
 * No incluye schema ni auth.users ni storage.
 * Salida: /root/dpo-app-backups/{YYYY-MM-DD_HHMM}/{tabla}.json
 */
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan envs NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fetchTables(): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status}`)
  const data = await res.json()
  const defs = data.definitions ?? {}
  // Filtrar vistas (empiezan con 'v_' o 'vista_'). Las incluimos igual, son read-only.
  return Object.keys(defs).sort()
}

async function dumpTable(
  name: string,
  outDir: string
): Promise<{ name: string; rows: number; bytes: number } | { name: string; error: string }> {
  const pageSize = 1000
  let from = 0
  const all: unknown[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from(name)
      .select("*")
      .range(from, to)
    if (error) return { name, error: error.message }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const json = JSON.stringify(all, null, 2)
  const file = path.join(outDir, `${name}.json`)
  fs.writeFileSync(file, json)
  return { name, rows: all.length, bytes: Buffer.byteLength(json) }
}

async function main() {
  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "_")
  const outDir = `/root/dpo-app-backups/${ts}`
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`Destino: ${outDir}\n`)

  const tables = await fetchTables()
  console.log(`Tablas detectadas: ${tables.length}\n`)

  const summary: Array<
    { name: string; rows: number; bytes: number } | { name: string; error: string }
  > = []

  // Concurrencia moderada
  const concurrency = 4
  const queue = [...tables]
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const t = queue.shift()!
      const r = await dumpTable(t, outDir)
      summary.push(r)
      if ("error" in r) {
        console.log(`  ✗ ${t}: ${r.error}`)
      } else {
        console.log(
          `  ✓ ${t.padEnd(38)} ${String(r.rows).padStart(7)} filas  ${(
            r.bytes / 1024
          ).toFixed(1)} KB`
        )
      }
    }
  })
  await Promise.all(workers)

  const totalRows = summary.reduce(
    (a, s) => a + ("rows" in s ? s.rows : 0),
    0
  )
  const totalBytes = summary.reduce(
    (a, s) => a + ("bytes" in s ? s.bytes : 0),
    0
  )
  const errores = summary.filter((s) => "error" in s)

  const meta = {
    timestamp: new Date().toISOString(),
    supabase_url: SUPABASE_URL,
    tables_count: tables.length,
    tables_ok: summary.length - errores.length,
    tables_error: errores.length,
    total_rows: totalRows,
    total_bytes: totalBytes,
    errors: errores,
  }
  fs.writeFileSync(path.join(outDir, "_metadata.json"), JSON.stringify(meta, null, 2))

  console.log(
    `\nTotal: ${totalRows} filas, ${(totalBytes / 1024 / 1024).toFixed(
      2
    )} MB, ${errores.length} errores`
  )
  console.log(`Backup en: ${outDir}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
