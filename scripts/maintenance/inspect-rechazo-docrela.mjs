/**
 * Investigación: (1) qué son los PRDVO y (2) qué documento relacionado
 * tienen los rechazos DVVTA. Chess /ventas/ Pampeana.
 */
import { readFileSync } from "node:fs"
import https from "node:https"

const env = {}
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line)
  if (m) env[m[1]] = m[2]
}
const BASE = env.CHESS_API_BASE_URL, USER = env.CHESS_API_USER, PASS = env.CHESS_API_PASS
const agent = new https.Agent({ rejectUnauthorized: false })
const cf = (url, init) => fetch(url, { ...init, agent })

const DIAS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["2026-04-29", "2026-05-04", "2026-05-08", "2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14"]

const onlyDate = (s) => (typeof s === "string" ? s.slice(0, 10) : s)

async function main() {
  const lr = await cf(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: USER, password: PASS }),
  })
  const sessionId = (await lr.json()).sessionId
  console.log("login OK\n")

  const allRech = []
  for (const dia of DIAS) {
    const url = `${BASE}/ventas/?fechaDesde=${dia}&fechaHasta=${dia}&detallado=true`
    const r = await cf(url, { headers: { Accept: "application/json", Cookie: sessionId } })
    const d = await r.json().catch(() => ({}))
    const rows = d?.dsReporteComprobantesApi?.VentasResumen
    if (Array.isArray(rows)) {
      for (const x of rows.filter(r => r.idRechazo > 0)) allRech.push({ diaConsulta: dia, ...x })
    }
  }
  const dvvta = allRech.filter(r => r.idDocumento === "DVVTA")
  const prdvo = allRech.filter(r => r.idDocumento === "PRDVO")
  console.log(`Rechazos: ${allRech.length}  (DVVTA=${dvvta.length}, PRDVO=${prdvo.length})\n`)

  // ===== PUNTO 2: documento relacionado de los DVVTA =====
  console.log("══ PUNTO 2 — idDocumentoRela / dsDocumentoRela de los DVVTA ══")
  const relaDoc = {}
  for (const r of dvvta) {
    const k = `${r.idDocumentoRela ?? "(null)"} / ${r.dsDocumentoRela ?? "(null)"}`
    relaDoc[k] = (relaDoc[k] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(relaDoc).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(30)} ${n}`)
  }

  // ===== PUNTO 1: anatomía de los PRDVO =====
  console.log("\n══ PUNTO 1 — anatomía de los PRDVO ══")
  // distribución idRechazo y movComercial
  const prMov = {}, prRech = {}
  for (const r of prdvo) {
    prMov[`${r.idMovComercial ?? "-"}/${r.dsMovComercial ?? "-"}`] = (prMov[`${r.idMovComercial ?? "-"}/${r.dsMovComercial ?? "-"}`] ?? 0) + 1
    prRech[`#${r.idRechazo} ${r.dsRechazo}`] = (prRech[`#${r.idRechazo} ${r.dsRechazo}`] ?? 0) + 1
  }
  console.log("  movComercial:", JSON.stringify(prMov))
  console.log("  motivos:", JSON.stringify(prRech))
  console.log("  ¿algún PRDVO con idDocumentoRela?:",
    prdvo.filter(r => r.idDocumentoRela).length, "/", prdvo.length)
  console.log("  ¿algún PRDVO con fechaComprobanteRela válida?:",
    prdvo.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(onlyDate(r.fechaComprobanteRela)) && onlyDate(r.fechaComprobanteRela) !== "9999-12-31").length, "/", prdvo.length)

  console.log("\n  — PRDVO: campos con valor (primeras 6 líneas):")
  for (const r of prdvo.slice(0, 6)) {
    const noVacio = {}
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === "" || v === 0 || v === "9999-12-31" || v === "0001-01-01") continue
      noVacio[k] = typeof v === "string" ? onlyDate(v) : v
    }
    console.log("   " + JSON.stringify({
      diaConsulta: r.diaConsulta, idDoc: r.idDocumento, serie: r.serie, nrodoc: r.nrodoc,
      fechaComprobante: onlyDate(r.fechaComprobate), fechaPedido: onlyDate(r.fechaPedido),
      fechaEntrega: onlyDate(r.fechaEntrega), idPedido: r.idPedido,
      idRechazo: r.idRechazo, dsRechazo: r.dsRechazo,
      idDocRela: r.idDocumentoRela, serieRela: r.serieRela, nrodocRela: r.nrodocRela,
      fechaCompRela: onlyDate(r.fechaComprobanteRela),
    }))
  }

  // ¿Cada PRDVO comparte (idPedido) con un DVVTA? → podríamos linkear por pedido
  console.log("\n  — ¿PRDVO comparte idPedido con algún DVVTA del mismo set?")
  const dvvtaPedidos = new Set(dvvta.map(r => r.idPedido).filter(Boolean))
  const prdvoConPedidoDvvta = prdvo.filter(r => r.idPedido && dvvtaPedidos.has(r.idPedido))
  console.log(`    PRDVO cuyo idPedido también aparece en un DVVTA: ${prdvoConPedidoDvvta.length}/${prdvo.length}`)
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1) })
