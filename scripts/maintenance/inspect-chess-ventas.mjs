/**
 * Inspección puntual de la API Chess /ventas/ — Pampeana.
 * Lee creds de .env.local. Trae un día y muestra:
 *   - shape de dsFleteroCarga / idFleteroCarga
 *   - comportamiento de nroLote (paginación)
 */
import { readFileSync } from "node:fs"
import https from "node:https"

// --- cargar .env.local ---
const env = {}
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line)
  if (m) env[m[1]] = m[2]
}
const BASE = env.CHESS_API_BASE_URL
const USER = env.CHESS_API_USER
const PASS = env.CHESS_API_PASS

const agent = new https.Agent({ rejectUnauthorized: false })
const cf = (url, init) => fetch(url, { ...init, agent })

const FECHA = process.argv[2] || "2026-05-14"

async function main() {
  // login
  const lr = await cf(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: USER, password: PASS }),
  })
  if (!lr.ok) throw new Error(`login HTTP ${lr.status}`)
  const sessionId = (await lr.json()).sessionId
  console.log(`login OK — fecha consultada: ${FECHA}\n`)

  const fetchLote = async (nroLote) => {
    let url = `${BASE}/ventas/?fechaDesde=${FECHA}&fechaHasta=${FECHA}&detallado=true`
    if (nroLote != null) url += `&nroLote=${nroLote}`
    const r = await cf(url, { headers: { Accept: "application/json", Cookie: sessionId } })
    if (!r.ok) return { http: r.status, rows: [] }
    const d = await r.json()
    const rows = d?.dsReporteComprobantesApi?.VentasResumen
    return { http: r.status, rows: Array.isArray(rows) ? rows : [] }
  }

  // --- test nroLote ---
  const sinLote = await fetchLote(null)
  console.log(`SIN nroLote        → ${sinLote.rows.length} filas (HTTP ${sinLote.http})`)
  for (const n of [0, 1, 2, 3]) {
    const l = await fetchLote(n)
    console.log(`nroLote=${n}          → ${l.rows.length} filas (HTTP ${l.http})`)
  }

  const rows = sinLote.rows
  if (rows.length === 0) { console.log("\nsin datos ese día"); return }

  // --- keys disponibles ---
  console.log(`\nKeys del primer row (${Object.keys(rows[0]).length}):`)
  console.log(Object.keys(rows[0]).sort().join(", "))

  // --- fletero ---
  const flet = [...new Set(rows.map(r => `${JSON.stringify(r.dsFleteroCarga)} | id=${r.idFleteroCarga}`))]
  console.log(`\ndsFleteroCarga distintos (${flet.length}):`)
  flet.slice(0, 25).forEach(f => console.log("  " + f))

  // --- muestra de líneas con rechazo: foco en unidades de medida ---
  const rech = rows.filter(r => r.idRechazo > 0)
  console.log(`\nlíneas con idRechazo>0: ${rech.length} / ${rows.length} total`)
  const um = r => ({
    art: String(r.dsArticulo).slice(0, 28), pres: r.presentacionArticulo,
    cantSolic: r.cantidadSolicitada, uniSolic: r.unidadesSolicitadas,
    cantTotal: r.cantidadesTotal, cantRech: r.cantidadesRechazo,
    unimedcargo: r.unimedcargo, unimedtotal: r.unimedtotal,
    idDoc: r.idDocumento, dsMov: r.dsMovComercial,
  })
  console.log("\n— 6 líneas de RECHAZO (unidades de medida):")
  for (const r of rech.slice(0, 6)) console.log(" ", JSON.stringify(um(r)))

  // --- línea FCVTA normal (sin rechazo) para comparar el denominador ---
  const fcvta = rows.filter(r => r.idDocumento === "FCVTA" && r.idRechazo === 0 && r.anulado !== "SI")
  console.log("\n— 6 líneas FCVTA normales (denominador):")
  for (const r of fcvta.slice(0, 6)) console.log(" ", JSON.stringify(um(r)))

  // --- totales del día: bultos vs unidades vs HL ---
  const sum = (arr, f) => arr.reduce((s, r) => s + Math.abs(Number(r[f]) || 0), 0)
  console.log("\n— TOTALES del día (FCVTA, no anulado):")
  console.log("  Σ cantidadSolicitada :", sum(fcvta, "cantidadSolicitada").toFixed(2))
  console.log("  Σ unidadesSolicitadas:", sum(fcvta, "unidadesSolicitadas").toFixed(2))
  console.log("  Σ cantidadesTotal    :", sum(fcvta, "cantidadesTotal").toFixed(2))
  console.log("  Σ unimedtotal (HL)   :", sum(fcvta, "unimedtotal").toFixed(2))
  console.log("— TOTALES rechazos del día:")
  console.log("  Σ cantidadesRechazo  :", sum(rech, "cantidadesRechazo").toFixed(2))
  console.log("  Σ unimedtotal (HL)   :", sum(rech, "unimedtotal").toFixed(2))
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1) })
