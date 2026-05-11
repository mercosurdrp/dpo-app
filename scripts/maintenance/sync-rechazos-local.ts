/**
 * Script local que replica EXACTO la lógica del endpoint /api/rechazos/sync.
 * Bypasea auth (corre con service_role) — solo para uso desde CLI.
 * Lee .env.local actual (debe apuntar a Pampeana).
 */
import { createClient } from "@supabase/supabase-js"
import https from "node:https"
import { readFileSync } from "node:fs"

// Cargar .env.local manualmente
const envText = readFileSync("/root/dpo-app/.env.local", "utf8")
const env: Record<string, string> = {}
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/)
  if (m) env[m[1]] = m[2]
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const CHESS_BASE = env.CHESS_API_BASE_URL
const CHESS_USER = env.CHESS_API_USER
const CHESS_PASS = env.CHESS_API_PASS
const FOXTROT_KEY = env.FOXTROT_API_KEY
const FOXTROT_BASE = "https://apiv1.foxtrotsystems.com"
const FOXTROT_DCS = (env.FOXTROT_DC_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean)

console.log(`Supabase: ${SUPABASE_URL}`)
console.log(`Chess:    ${CHESS_BASE} (user ${CHESS_USER})`)
console.log(`Foxtrot:  DCs=${FOXTROT_DCS.join(",")}`)
console.log()

const PATENTE_REGEX = /^([A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})(\.\d+)?$/i
const MOTIVOS_EXCLUIDOS = new Set(["DEV X TRAMITES INTER"])

const isPatenteValida = (s: string | null | undefined) => !!s && PATENTE_REGEX.test(s.trim())
const normalizarPatente = (s: string) => s.toUpperCase().trim()

const insecureAgent = new https.Agent({ rejectUnauthorized: false })
const chessFetch = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, // @ts-expect-error agent option
    agent: insecureAgent })

async function chessLogin(): Promise<string> {
  const resp = await chessFetch(`${CHESS_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: CHESS_USER, password: CHESS_PASS }),
  })
  if (!resp.ok) throw new Error(`Chess login failed: ${resp.status}`)
  const data = await resp.json() as { sessionId?: string }
  if (!data.sessionId) throw new Error("No sessionId from Chess")
  return data.sessionId
}

async function fetchFoxtrotDrivers() {
  const m = new Map<string, string>()
  if (!FOXTROT_KEY) return m
  await Promise.all(FOXTROT_DCS.map(async dc => {
    const r = await fetch(`${FOXTROT_BASE}/dcs/${dc}/drivers`,
      { headers: { Authorization: `Bearer ${FOXTROT_KEY}`, Accept: "application/json" } })
    if (!r.ok) return
    const d = await r.json() as { data?: { drivers?: { id: string; name: string }[] } }
    for (const drv of d?.data?.drivers ?? []) m.set(`${dc}:${drv.id}`, drv.name)
  }))
  return m
}

async function fetchPatenteChoferMap(fecha: string, driversById: Map<string, string>) {
  const m = new Map<string, string>()
  if (!FOXTROT_KEY) return m
  await Promise.all(FOXTROT_DCS.map(async dc => {
    const r = await fetch(`${FOXTROT_BASE}/dcs/${dc}/routes/find_by_date/${fecha}`,
      { headers: { Authorization: `Bearer ${FOXTROT_KEY}`, Accept: "application/json" } })
    if (!r.ok) return
    const d = await r.json() as { data?: { routes?: { name: string | null; assigned_driver_id: string | null }[] } }
    for (const rt of d?.data?.routes ?? []) {
      if (!rt.name || !rt.assigned_driver_id) continue
      const chofer = driversById.get(`${dc}:${rt.assigned_driver_id}`)
      if (!chofer) continue
      m.set(normalizarPatente(rt.name), chofer)
    }
  }))
  return m
}

async function fetchVentasDia(sessionId: string, fecha: string): Promise<any[]> {
  const url = `${CHESS_BASE}/ventas/?fechaDesde=${fecha}&fechaHasta=${fecha}&detallado=true`
  const r = await chessFetch(url, { headers: { Accept: "application/json", Cookie: sessionId } })
  if (!r.ok) return []
  const d = await r.json() as any
  const res = d?.dsReporteComprobantesApi?.VentasResumen
  return Array.isArray(res) ? res : []
}

async function syncDay(supabase: any, sessionId: string, foxtrotDrivers: Map<string, string>, fecha: string) {
  const [ventas, patenteChofer] = await Promise.all([
    fetchVentasDia(sessionId, fecha),
    fetchPatenteChoferMap(fecha, foxtrotDrivers),
  ])
  if (ventas.length === 0) {
    return { fecha, rechazos_upsert: 0, rechazos_errors: 0, ventas_diarias_upsert: 0, ventas_diarias_errors: 0, sin_datos: true, total_rechazos_intentados: 0 }
  }

  const entregadosPorFletero = new Map<string, number>()
  for (const v of ventas) {
    if (v.anulado === "SI") continue
    if (!isPatenteValida(v.dsFleteroCarga)) continue
    entregadosPorFletero.set(v.dsFleteroCarga, (entregadosPorFletero.get(v.dsFleteroCarga) ?? 0) + Math.abs(Number(v.unidadesSolicitadas) || 0))
  }

  const rechazos = ventas.filter((v: any) =>
    v.idRechazo > 0 && v.anulado !== "SI" && !MOTIVOS_EXCLUIDOS.has(v.dsRechazo) && isPatenteValida(v.dsFleteroCarga)
  )

  let rUp = 0, rErr = 0, rErrMsg = ""
  for (const r of rechazos) {
    const fletero = r.dsFleteroCarga
    const chofer = patenteChofer.get(normalizarPatente(fletero)) ?? null
    const row: any = {
      fecha, serie: r.serie, nrodoc: r.nrodoc, id_articulo: r.idArticulo, ds_articulo: r.dsArticulo,
      id_fletero_carga: r.idFleteroCarga, ds_fletero_carga: fletero,
      id_rechazo: r.idRechazo, ds_rechazo: r.dsRechazo,
      bultos_rechazados: Math.abs(Number(r.cantidadesRechazo) || 0),
      bultos_entregados: entregadosPorFletero.get(fletero) ?? 0,
      id_cliente: r.idCliente, nombre_cliente: r.nombreCliente,
      id_vendedor: r.idVendedor, ds_vendedor: r.dsVendedor,
      planilla_carga: r.planillaCarga,
    }
    // chofer column may not exist (Pampeana). Try with, fallback without.
    row.chofer = chofer
    const { error } = await supabase.from("rechazos").upsert(row, { onConflict: "serie,nrodoc,id_articulo" })
    if (error) {
      // retry sin chofer si el error es "column chofer does not exist"
      if (error.code === "PGRST204" || (error.message ?? "").includes("chofer")) {
        delete row.chofer
        const { error: e2 } = await supabase.from("rechazos").upsert(row, { onConflict: "serie,nrodoc,id_articulo" })
        if (e2) { rErr++; rErrMsg = e2.message }
        else rUp++
      } else {
        rErr++; rErrMsg = error.message
      }
    } else rUp++
  }

  // ventas_diarias
  const fcvta = ventas.filter((v: any) => v.idDocumento === "FCVTA" && v.anulado !== "SI" && isPatenteValida(v.dsFleteroCarga))
  const agg = new Map<string, { bultos: number; unidades: number; hl: number; planillas: Set<string> }>()
  for (const v of fcvta) {
    const x = agg.get(v.dsFleteroCarga) ?? { bultos: 0, unidades: 0, hl: 0, planillas: new Set<string>() }
    x.bultos += Math.abs(Number(v.unidadesSolicitadas) || 0)
    x.unidades += Math.abs(Number(v.cantidadesTotal) || 0)
    x.hl += Math.abs(Number(v.unimedtotal) || 0)
    if (v.planillaCarga) x.planillas.add(v.planillaCarga)
    agg.set(v.dsFleteroCarga, x)
  }
  let vUp = 0, vErr = 0
  for (const [fletero, x] of agg) {
    const { error } = await supabase.from("ventas_diarias").upsert({
      fecha, ds_fletero_carga: fletero,
      total_bultos: Math.round(x.bultos * 100) / 100,
      total_unidades: Math.round(x.unidades * 10000) / 10000,
      total_hl: Math.round(x.hl * 10000) / 10000,
      viajes: x.planillas.size,
    }, { onConflict: "fecha,ds_fletero_carga" })
    if (error) vErr++; else vUp++
  }

  return { fecha, rechazos_upsert: rUp, rechazos_errors: rErr, ventas_diarias_upsert: vUp, ventas_diarias_errors: vErr, sin_datos: false, total_rechazos_intentados: rechazos.length, last_rechazo_err: rErrMsg || undefined }
}

async function main() {
  const mode = process.argv[2] ?? "test"   // test | backfill
  const arg = process.argv[3]
  const supabase = createClient(SUPABASE_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } })

  const sessionId = await chessLogin()
  console.log("Chess login OK")
  const foxtrotDrivers = await fetchFoxtrotDrivers()
  console.log(`Foxtrot drivers loaded: ${foxtrotDrivers.size}`)
  console.log()

  if (mode === "test") {
    // Single day idempotency test
    const fecha = arg ?? "2026-04-29"
    // count antes
    const { count: countBefore } = await supabase.from("rechazos").select("*", { count: "exact", head: true }).eq("fecha", fecha)
    const { count: vBefore } = await supabase.from("ventas_diarias").select("*", { count: "exact", head: true }).eq("fecha", fecha)
    const { data: sampleBefore } = await supabase.from("rechazos").select("created_at").eq("fecha", fecha).order("created_at", { ascending: true }).limit(1)
    console.log(`ANTES — rechazos[${fecha}]: ${countBefore}, ventas_diarias[${fecha}]: ${vBefore}`)
    console.log(`ANTES — first created_at: ${sampleBefore?.[0]?.created_at ?? "(none)"}`)
    console.log()
    const r = await syncDay(supabase, sessionId, foxtrotDrivers, fecha)
    console.log(`SYNC result: ${JSON.stringify(r)}`)
    console.log()
    const { count: countAfter } = await supabase.from("rechazos").select("*", { count: "exact", head: true }).eq("fecha", fecha)
    const { count: vAfter } = await supabase.from("ventas_diarias").select("*", { count: "exact", head: true }).eq("fecha", fecha)
    const { data: sampleAfter } = await supabase.from("rechazos").select("created_at").eq("fecha", fecha).order("created_at", { ascending: true }).limit(1)
    console.log(`DESPUÉS — rechazos[${fecha}]: ${countAfter}, ventas_diarias[${fecha}]: ${vAfter}`)
    console.log(`DESPUÉS — first created_at: ${sampleAfter?.[0]?.created_at ?? "(none)"}`)
    console.log()
    console.log(`IDEMPOTENCIA: ${countBefore === countAfter && vBefore === vAfter ? "✓ OK" : "✗ FALLA"}`)
    console.log(`created_at preservado: ${sampleBefore?.[0]?.created_at === sampleAfter?.[0]?.created_at ? "✓ SÍ" : "✗ NO (¡rotó!)"}`)
  } else if (mode === "backfill") {
    const startedAt = Date.now()
    const fromStr = arg ?? "2026-04-30"
    const toStr = process.argv[4] ?? "2026-05-11"
    const from = new Date(fromStr + "T00:00:00Z")
    const to = new Date(toStr + "T00:00:00Z")
    let totalR = 0, totalV = 0
    const errors: Array<{ day: string; kind: string; message: string }> = []
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const f = d.toISOString().slice(0, 10)
      try {
        const r = await syncDay(supabase, sessionId, foxtrotDrivers, f)
        const flag = r.sin_datos ? "sin datos" : `R=${r.rechazos_upsert}/${r.total_rechazos_intentados} V=${r.ventas_diarias_upsert}`
        const errFlag = r.rechazos_errors || r.ventas_diarias_errors ? ` ERR(R:${r.rechazos_errors}, V:${r.ventas_diarias_errors})${r.last_rechazo_err ? " "+r.last_rechazo_err : ""}` : ""
        console.log(`${f}: ${flag}${errFlag}`)
        totalR += r.rechazos_upsert
        totalV += r.ventas_diarias_upsert
        if (r.last_rechazo_err) errors.push({ day: f, kind: "rechazo", message: r.last_rechazo_err })
      } catch (e: any) {
        const msg = e?.message ?? String(e)
        console.log(`${f}: ERROR ${msg}`)
        errors.push({ day: f, kind: "fatal", message: msg })
      }
    }
    const durationMs = Date.now() - startedAt
    console.log()
    console.log(`=== RESUMEN ===`)
    console.log(`Rechazos upsert total:        ${totalR}`)
    console.log(`Ventas_diarias upsert total:  ${totalV}`)
    console.log(`Días con error: ${errors.length ? [...new Set(errors.map(e => e.day))].join(", ") : "(ninguno)"}`)
    // sync_log con source=script (best-effort; si la tabla no existe en este tenant, ignorar)
    const { error: logErr } = await supabase.from("sync_log").insert({
      source: "script",
      date_from: fromStr,
      date_to: toStr,
      rechazos_upserted: totalR,
      ventas_upserted: totalV,
      errors,
      duration_ms: durationMs,
    })
    if (logErr) console.warn(`(sync_log no escrito: ${logErr.message})`)
  }
  process.exit(0)
}
main().catch(e => { console.error("Fatal:", e); process.exit(1) })
