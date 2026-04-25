import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { buildSnapshot } from "@/lib/foxtrot-snapshot/build"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const VALID_RANGES = new Set(["today", "yesterday", "week", "month", "custom"])
const VALID_ZONAS = new Set(["all", "Norte", "Central", "Este"])

function getDcs(): string[] {
  const raw = process.env.FOXTROT_DC_IDS ?? "iguazu,eldorado"
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

export async function GET(req: Request) {
  await requireAuth()

  const { searchParams } = new URL(req.url)
  const zona = searchParams.get("zona") ?? "all"
  const range = searchParams.get("range") ?? "today"
  const fromDate = searchParams.get("from_date")
  const toDate = searchParams.get("to_date")

  if (!VALID_RANGES.has(range)) {
    return NextResponse.json({ error: "rango inválido" }, { status: 400 })
  }
  if (!VALID_ZONAS.has(zona)) {
    return NextResponse.json({ error: "zona inválida" }, { status: 400 })
  }

  const allDcs = getDcs()
  let dcs: string[]
  let zonaFilter: string | null

  if (zona === "all") {
    dcs = allDcs
    zonaFilter = null
  } else if (zona === "Norte") {
    // Norte = Iguazú entero (cuando está disponible)
    dcs = allDcs.includes("iguazu") ? ["iguazu"] : allDcs
    zonaFilter = null
  } else {
    // Central | Este = Eldorado dividido
    dcs = allDcs.includes("eldorado") ? ["eldorado"] : allDcs
    zonaFilter = zona
  }

  try {
    const snapshot = await buildSnapshot({ dcs, rng: range, fromDate, toDate, zonaFilter })
    return NextResponse.json(snapshot)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
