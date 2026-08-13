// Aplica APLICAR_EN_PAMPEANA_RUTAS_TARGETS.sql en el Supabase de Pampeana
// usando el DATABASE_URL de .env.local. Correr desde la raíz del repo:
//   node scripts/aplicar-rutas-targets.mjs
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { Client } = require("pg")

const envLine = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL"))
if (!envLine) throw new Error("No hay DATABASE_URL en .env.local")
const url = envLine.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")

const sql = readFileSync("APLICAR_EN_PAMPEANA_RUTAS_TARGETS.sql", "utf8")

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query(sql)
const { rows } = await client.query(
  "select nombre, array_length(localidades, 1) locs, target_ceq from rutas_reparto order by orden",
)
console.table(rows)
await client.end()
console.log("Listo: tabla rutas_reparto creada y sembrada.")
