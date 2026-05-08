/**
 * Fuzzy match: planes_accion.responsable (TEXT) → profiles.id
 *
 * Soporta múltiples responsables separados por "/", ",", " y ", " & ".
 * El primero matcheado queda como responsable_principal, el resto coresponsable.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/match-responsables-planes.ts          (dry-run)
 *   npx tsx --env-file=.env.local scripts/match-responsables-planes.ts --apply  (inserta)
 *
 * Para correr en otro tenant, sobrescribir env vars:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/match-responsables-planes.ts
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APPLY = process.argv.includes("--apply")
const HIGH = 0.85
const MIN_SHOW = 0.55

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 2)
}

function lev(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function levRatio(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const longer = a.length >= b.length ? a : b
  const shorter = a.length >= b.length ? b : a
  return 1 - lev(longer, shorter) / longer.length
}

function score(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1.0

  const tokA = new Set(tokens(a))
  const tokB = new Set(tokens(b))
  const intersect = [...tokA].filter((t) => tokB.has(t)).length

  const containment =
    (tokA.size > 0 && intersect === tokA.size) || (tokB.size > 0 && intersect === tokB.size)
      ? 0.95
      : 0

  const union = new Set([...tokA, ...tokB]).size
  const jaccard = union > 0 ? intersect / union : 0

  return Math.max(containment, jaccard, levRatio(na, nb))
}

function splitResponsables(text: string): string[] {
  return text
    .split(/\s*(?:\/|,|\s+y\s+|\s+&\s+|\s+-\s+)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

type Profile = { id: string; nombre: string; email: string; role: string }
type Candidate = { profile_id: string; nombre: string; score: number }

function bestMatch(part: string, profiles: Profile[]): Candidate[] {
  return profiles
    .map((p) => ({
      profile_id: p.id,
      nombre: p.nombre || "(sin nombre)",
      score: score(part, p.nombre || ""),
    }))
    .filter((c) => c.score >= MIN_SHOW)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

async function main() {
  console.log("=".repeat(70))
  console.log(`Mode: ${APPLY ? "APPLY (inserta)" : "DRY-RUN (no escribe)"}`)
  console.log(`URL:  ${SUPABASE_URL}`)
  console.log("=".repeat(70))

  const { data: planesAll, error: e1 } = await supabase
    .from("planes_accion")
    .select("id, responsable, descripcion")
  if (e1) throw e1

  const { data: yaAsignados, error: e2 } = await supabase
    .from("plan_responsables")
    .select("plan_id, profile_id, rol")
  if (e2) throw e2

  const planesConAsignacion = new Set(yaAsignados!.map((r) => r.plan_id))
  const planesConPrincipal = new Set(
    yaAsignados!.filter((r) => r.rol === "responsable_principal").map((r) => r.plan_id),
  )
  const yaAsignadosKey = new Set(yaAsignados!.map((r) => `${r.plan_id}:${r.profile_id}`))

  const planesPendientes = planesAll!.filter(
    (p) => p.responsable && p.responsable.trim() !== "",
  )

  const { data: profilesData, error: e3 } = await supabase
    .from("profiles")
    .select("id, nombre, email, role, active")
  if (e3) throw e3

  const profiles: Profile[] = profilesData!
    .filter((p) => p.active !== false)
    .map((p) => ({ id: p.id, nombre: p.nombre || "", email: p.email || "", role: p.role }))

  // Detectar duplicados en profiles (mismo nombre normalizado)
  const byNorm = new Map<string, Profile[]>()
  for (const p of profiles) {
    const key = normalize(p.nombre).split(" ").sort().join(" ")
    if (!key) continue
    if (!byNorm.has(key)) byNorm.set(key, [])
    byNorm.get(key)!.push(p)
  }
  const dups = [...byNorm.entries()].filter(([, arr]) => arr.length > 1)

  console.log(`\nTotal planes con responsable TEXT:  ${planesPendientes.length}`)
  console.log(`Planes con alguna asignación UUID:  ${planesConAsignacion.size}`)
  console.log(`Planes con principal asignado:      ${planesConPrincipal.size}`)
  console.log(`Profiles activos:                   ${profiles.length}`)
  if (dups.length > 0) {
    console.log(`\n⚠️  DUPLICADOS en profiles (mismo nombre):`)
    for (const [, arr] of dups) {
      console.log(`   ${arr.map((p) => `"${p.nombre}"[${p.id.slice(0, 8)}]`).join(" + ")}`)
    }
  }

  type PlanAssign = {
    plan_id: string
    responsable_text: string
    descripcion: string
    parts: { text: string; candidates: Candidate[] }[]
  }

  const planAssigns: PlanAssign[] = planesPendientes.map((plan) => {
    const parts = splitResponsables(plan.responsable!)
    return {
      plan_id: plan.id,
      responsable_text: plan.responsable!,
      descripcion: (plan.descripcion || "").slice(0, 70),
      parts: parts.map((part) => ({ text: part, candidates: bestMatch(part, profiles) })),
    }
  })

  // Decidir: para cada part, si tiene candidato HIGH único → asignar
  type Insert = { plan_id: string; profile_id: string; rol: "responsable_principal" | "coresponsable" }
  const inserts: Insert[] = []
  const ambiguos: { plan_id: string; text: string; part: string; candidates: Candidate[]; descripcion: string }[] = []
  const sinMatch: { plan_id: string; text: string; part: string; descripcion: string }[] = []

  const seenPerPlan = new Map<string, Set<string>>()
  function alreadyAssigned(plan_id: string, profile_id: string) {
    if (yaAsignadosKey.has(`${plan_id}:${profile_id}`)) return true
    if (seenPerPlan.get(plan_id)?.has(profile_id)) return true
    return false
  }
  function markSeen(plan_id: string, profile_id: string) {
    if (!seenPerPlan.has(plan_id)) seenPerPlan.set(plan_id, new Set())
    seenPerPlan.get(plan_id)!.add(profile_id)
  }

  for (const pa of planAssigns) {
    const planTienePrincipal = planesConPrincipal.has(pa.plan_id)
    let principalAsignadoEnEstaCorrida = false
    let firstResolvedIndex = -1

    // Primera pasada: detectar el primer part resoluble (será principal)
    // Match exacto (1.00) gana siempre; sino exige diferencia >= 0.08 vs siguiente
    for (let i = 0; i < pa.parts.length; i++) {
      const cands = pa.parts[i].candidates
      if (cands.length === 0 || cands[0].score < HIGH) continue
      const exacto = cands[0].score >= 0.999
      const unico = cands.length === 1 || cands[1].score < cands[0].score - 0.08
      if (exacto || unico) {
        firstResolvedIndex = i
        break
      }
    }

    for (let i = 0; i < pa.parts.length; i++) {
      const { text: partText, candidates: cands } = pa.parts[i]
      if (cands.length === 0) {
        sinMatch.push({
          plan_id: pa.plan_id,
          text: pa.responsable_text,
          part: partText,
          descripcion: pa.descripcion,
        })
        continue
      }
      const top = cands[0]
      const exacto = top.score >= 0.999
      const esUnico = cands.length === 1 || cands[1].score < top.score - 0.08
      if (top.score >= HIGH && (exacto || esUnico)) {
        if (alreadyAssigned(pa.plan_id, top.profile_id)) continue

        const seraPrincipalEnEstaCorrida =
          i === firstResolvedIndex && !principalAsignadoEnEstaCorrida && !planTienePrincipal
        const rol: Insert["rol"] = seraPrincipalEnEstaCorrida ? "responsable_principal" : "coresponsable"
        if (seraPrincipalEnEstaCorrida) principalAsignadoEnEstaCorrida = true

        inserts.push({ plan_id: pa.plan_id, profile_id: top.profile_id, rol })
        markSeen(pa.plan_id, top.profile_id)
      } else {
        ambiguos.push({
          plan_id: pa.plan_id,
          text: pa.responsable_text,
          part: partText,
          candidates: cands,
          descripcion: pa.descripcion,
        })
      }
    }
  }

  console.log(`\n${"─".repeat(70)}`)
  console.log(`AUTO-ASIGNAR: ${inserts.length}`)
  console.log("─".repeat(70))
  // Agrupar por plan para mostrar
  const insertsByPlan = new Map<string, Insert[]>()
  for (const ins of inserts) {
    if (!insertsByPlan.has(ins.plan_id)) insertsByPlan.set(ins.plan_id, [])
    insertsByPlan.get(ins.plan_id)!.push(ins)
  }
  for (const pa of planAssigns) {
    const ins = insertsByPlan.get(pa.plan_id)
    if (!ins || ins.length === 0) continue
    console.log(`  "${pa.responsable_text}":`)
    for (const i of ins) {
      const nom = profiles.find((p) => p.id === i.profile_id)?.nombre
      const tag = i.rol === "responsable_principal" ? "👑 principal" : "   coresp."
      console.log(`     ${tag}  →  "${nom}"`)
    }
  }

  console.log(`\n${"─".repeat(70)}`)
  console.log(`AMBIGUOS (decidir manualmente): ${ambiguos.length}`)
  console.log("─".repeat(70))
  for (const a of ambiguos) {
    console.log(`  plan: "${a.descripcion}..."`)
    console.log(`    parte sin resolver: "${a.part}"  (de "${a.text}")`)
    for (const c of a.candidates) {
      console.log(`       ${c.score.toFixed(2)}  →  "${c.nombre}"  [${c.profile_id.slice(0, 8)}]`)
    }
  }

  console.log(`\n${"─".repeat(70)}`)
  console.log(`SIN MATCH (no hay profile parecido): ${sinMatch.length}`)
  console.log("─".repeat(70))
  for (const s of sinMatch) {
    console.log(`  "${s.part}" (de plan "${s.descripcion}...")`)
  }

  if (APPLY && inserts.length > 0) {
    console.log(`\n${"=".repeat(70)}`)
    console.log(`Insertando ${inserts.length} responsables...`)
    const { error: eIns } = await supabase.from("plan_responsables").insert(inserts)
    if (eIns) {
      console.error("Error en INSERT:", eIns.message)
      process.exit(1)
    }
    console.log(`✓ Insertados ${inserts.length}`)
  } else if (!APPLY) {
    console.log(`\n(dry-run — corré con --apply para insertar los ${inserts.length})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
