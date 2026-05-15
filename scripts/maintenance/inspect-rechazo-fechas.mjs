/**
 * Inspección de fechas de los rechazos — Chess /ventas/ Pampeana.
 *
 * Objetivo: detectar el desfasaje entre la fecha en que se carga el rechazo
 * (devolución) y la fecha de la venta original. Compara:
 *   - fecha de consulta (= rechazos.fecha hoy)
 *   - fechaComprobate     (emisión del comprobante de devolución)
 *   - fechaPedido         (alta del pedido)
 *   - fechaEntrega        (entrega)
 *   - fechaComprobanteRela (comprobante RELACIONADO = la venta original)
 *
 * Uso: node scripts/maintenance/inspect-rechazo-fechas.mjs [fecha1 fecha2 ...]
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
  : ["2026-05-08", "2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14"]

const valida = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== "9999-12-31"
const diffDias = (a, b) => {
  if (!valida(a) || !valida(b)) return null
  return Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000)
}
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
    if (!Array.isArray(rows)) { console.log(`${dia}: sin datos`); continue }
    const rech = rows.filter(r => r.idRechazo > 0)
    for (const r of rech) allRech.push({ diaConsulta: dia, ...r })
  }

  console.log(`Total líneas rechazo (idRechazo>0): ${allRech.length}\n`)

  // --- 1. distribución de idDocumento ---
  const porDoc = {}
  for (const r of allRech) porDoc[r.idDocumento] = (porDoc[r.idDocumento] ?? 0) + 1
  console.log("idDocumento de los rechazos:", JSON.stringify(porDoc))

  // --- 2. campos de fecha presentes ---
  const campos = ["fechaComprobate", "fechaComprobanteRela", "fechaPedido", "fechaEntrega"]
  console.log("\nCobertura de campos de fecha (válidos / total):")
  for (const c of campos) {
    const ok = allRech.filter(r => valida(onlyDate(r[c]))).length
    console.log(`  ${c.padEnd(22)} ${ok}/${allRech.length}`)
  }
  const conRela = allRech.filter(r => r.idDocumentoRela || valida(onlyDate(r.fechaComprobanteRela)))
  console.log(`  idDocumentoRela presente: ${conRela.length}/${allRech.length}`)

  // --- 3. muestra de 14 líneas ---
  console.log("\n— Muestra (diaConsulta | fechaComprobante | fechaCompRela | docRela | fechaPedido | fechaEntrega | idRech):")
  for (const r of allRech.slice(0, 14)) {
    console.log("  " + [
      r.diaConsulta,
      onlyDate(r.fechaComprobate) ?? "-",
      onlyDate(r.fechaComprobanteRela) ?? "-",
      `${r.dsDocumentoRela ?? r.idDocumentoRela ?? "-"} ${r.serieRela ?? ""}-${r.nrodocRela ?? ""}`.trim(),
      onlyDate(r.fechaPedido) ?? "-",
      onlyDate(r.fechaEntrega) ?? "-",
      `#${r.idRechazo}`,
    ].join("  |  "))
  }

  // --- 4. desfasaje: fechaComprobante (rechazo) vs cada fecha candidata ---
  console.log("\n— DESFASAJE en días: fechaComprobante del rechazo MENOS la fecha candidata")
  for (const c of ["fechaComprobanteRela", "fechaPedido", "fechaEntrega"]) {
    const hist = {}
    let n = 0
    for (const r of allRech) {
      const lag = diffDias(onlyDate(r.fechaComprobate), onlyDate(r[c]))
      if (lag == null) continue
      n++
      hist[lag] = (hist[lag] ?? 0) + 1
    }
    const ordenado = Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0]))
    console.log(`  vs ${c} (n=${n}):`)
    for (const [lag, cnt] of ordenado) {
      const pct = ((cnt / n) * 100).toFixed(0)
      console.log(`     ${String(lag).padStart(4)} día(s): ${String(cnt).padStart(4)}  (${pct}%)`)
    }
  }
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1) })
