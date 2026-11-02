// Aplica en Pampeana la tabla radar_rechazos_envios (aviso WhatsApp del radar).
// Uso, desde dpo-app-radar-wa:  node scripts/aplicar-radar-envios.cjs
const fs = require("fs")
const { Client } = require("pg")

const url = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "")
const sql = fs.readFileSync("supabase/migrations/20261027150000_radar_rechazos_envios.sql", "utf8")

;(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(sql)
  const r = await c.query("select count(*)::int as filas from radar_rechazos_envios")
  console.log("OK, tabla radar_rechazos_envios creada. Filas:", r.rows[0].filas)
  await c.end()
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1) })
