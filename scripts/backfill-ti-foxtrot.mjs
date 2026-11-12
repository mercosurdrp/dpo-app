// Backfill del inicio del Tiempo Interno desde Foxtrot (Pampeana).
//
// Baja el CSV de ROUTE_ANALYTICS mes por mes y agrega a `foxtrot_routes.raw_data`
// SOLO dos claves:
//   - tml_actual_arrival: "Actual Route Arrival Time" (geofence al CD). El sync
//     la guarda desde julio 2026; abril-junio quedaron vacíos aunque Foxtrot la
//     tiene.
//   - fx_driver_end: "Driver Marked Route End Timestamp" (el chofer toca
//     "terminar ruta"). Respaldo del inicio del TI cuando no hay geofence.
//
// 🚨 A propósito NO usa syncFoxtrotRouteAnalytics: ese pisa también la salida
// real, km, click score, etc., y movería el histórico del TML y otros
// indicadores de esos meses. Acá sólo se tocan esas dos claves, con un UPDATE
// jsonb por ruta (`raw_data || patch`), sin reescribir el resto del raw_data.
// Nunca borra una llegada existente: si Foxtrot no la manda, no se toca.
//
// Uso:  node scripts/backfill-ti-foxtrot.mjs 2026-04 2026-11 [--dry]
//   (lee DATABASE_URL, FOXTROT_API_KEY y FOXTROT_DC_IDS de .env.local)

import fs from "node:fs"
import pg from "pg"

const args = process.argv.slice(2)
const dry = args.includes("--dry")
const [desdeMes, hastaMes] = args.filter((a) => !a.startsWith("--"))
if (!/^\d{4}-\d{2}$/.test(desdeMes ?? "") || !/^\d{4}-\d{2}$/.test(hastaMes ?? "")) {
  console.error("Uso: node scripts/backfill-ti-foxtrot.mjs AAAA-MM AAAA-MM [--dry]")
  process.exit(1)
}

const env = fs.readFileSync(".env.local", "utf8")
const leer = (k) => env.match(new RegExp(`^${k}="?([^"\\r\\n]*)"?`, "m"))?.[1]?.trim() ?? ""
const DATABASE_URL = leer("DATABASE_URL")
const API_KEY = leer("FOXTROT_API_KEY")
const DC_IDS = (leer("FOXTROT_DC_IDS") || "pergamino,ramallo").split(",").map((s) => s.trim()).filter(Boolean)
if (!DATABASE_URL || !API_KEY) {
  console.error("Faltan DATABASE_URL o FOXTROT_API_KEY en .env.local")
  process.exit(1)
}

const BASE = "https://apiv1.foxtrotsystems.com"
const H = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseCsvLine(line) {
  const out = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q
    } else if (ch === "," && !q) { out.push(cur); cur = "" } else cur += ch
  }
  out.push(cur)
  return out
}
// "2026-04-02 07:19:29" (hora AR, sin horario de verano) → ISO UTC
function arLocalToIso(raw) {
  const v = (raw ?? "").trim()
  if (!v) return null
  const d = new Date(`${v.replace(" ", "T")}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function bajarCsv(desde, hasta) {
  const res = await fetch(`${BASE}/analytics/download-requests`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ dc_ids: DC_IDS, from_date: desde, to_date: hasta, analytics_types: ["ROUTE_ANALYTICS"] }),
  })
  if (!res.ok) throw new Error(`Foxtrot ${res.status} al pedir el CSV`)
  const tx = (await res.json()).data?.download_request_txid
  if (!tx) throw new Error("Foxtrot no devolvió txid")
  for (let i = 0; i < 40; i++) {
    await sleep(3000)
    const f = await (await fetch(`${BASE}/analytics/download-requests/${tx}/files`, { headers: H })).json()
    const csv = f.data?.download_request_files?.find((x) => x.file_type === "CSV")
    if (csv?.download_link) return (await fetch(csv.download_link)).text()
  }
  throw new Error("CSV no disponible (timeout)")
}

function meses(desde, hasta) {
  const out = []
  let [y, m] = desde.split("-").map(Number)
  const [yh, mh] = hasta.split("-").map(Number)
  while (y < yh || (y === yh && m <= mh)) {
    const ini = `${y}-${String(m).padStart(2, "0")}-01`
    const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    out.push([ini, fin])
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 })
await client.connect()
let totalArr = 0, totalFin = 0, totalRutas = 0, totalNoEncontradas = 0
try {
  for (const [desde, hasta] of meses(desdeMes, hastaMes)) {
    const lines = (await bajarCsv(desde, hasta)).split(/\r?\n/).filter(Boolean)
    const h = parseCsvLine(lines[0] ?? "")
    const iRoute = h.indexOf("Route ID")
    const iArr = h.indexOf("Actual Route Arrival Time")
    const iEnd = h.indexOf("Driver Marked Route End Timestamp")
    if (iRoute < 0 || iArr < 0 || iEnd < 0) throw new Error(`columnas faltantes en el CSV de ${desde}`)

    const patches = new Map()
    for (const l of lines.slice(1)) {
      const r = parseCsvLine(l)
      const id = r[iRoute]
      if (!id) continue
      const p = patches.get(id) ?? {}
      const arr = arLocalToIso(r[iArr])
      const end = arLocalToIso(r[iEnd])
      if (arr) p.tml_actual_arrival = arr
      if (end) p.fx_driver_end = end
      if (Object.keys(p).length) patches.set(id, p)
    }

    const ids = [...patches.keys()]
    const { rows } = await client.query("select route_id from foxtrot_routes where route_id = any($1)", [ids])
    const existentes = new Set(rows.map((r) => r.route_id))
    let nArr = 0, nFin = 0, nRutas = 0
    if (!dry) await client.query("begin")
    for (const [id, p] of patches) {
      if (!existentes.has(id)) continue
      nRutas++
      if (p.tml_actual_arrival) nArr++
      if (p.fx_driver_end) nFin++
      if (!dry) {
        await client.query("update foxtrot_routes set raw_data = coalesce(raw_data, '{}'::jsonb) || $2::jsonb where route_id = $1", [id, JSON.stringify(p)])
      }
    }
    if (!dry) await client.query("commit")
    const noEnc = ids.length - nRutas
    totalArr += nArr; totalFin += nFin; totalRutas += nRutas; totalNoEncontradas += noEnc
    console.log(`${desde.slice(0, 7)}: ${nRutas} rutas actualizadas (${nArr} con llegada GPS, ${nFin} con fin marcado)${noEnc ? ` · ${noEnc} rutas del CSV no están en la base` : ""}`)
  }
  console.log(`${dry ? "[DRY] " : ""}TOTAL: ${totalRutas} rutas · ${totalArr} llegadas GPS · ${totalFin} fines marcados · ${totalNoEncontradas} no encontradas`)
} catch (e) {
  if (!dry) await client.query("rollback").catch(() => {})
  console.error("ERROR:", e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
