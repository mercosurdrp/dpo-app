import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseRechazosSearchParams } from "@/lib/rechazos/search-params"
import { buildRechazosCSV, EXPORT_MAX_ROWS } from "@/lib/rechazos/export-csv"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // Middleware ya verificó sesión. Si llegó hasta acá, hay usuario.
  const rawParams: Record<string, string | string[]> = {}
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    rawParams[k] = v
  }

  let request
  try {
    request = parseRechazosSearchParams(rawParams)
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_params", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  let supa
  try {
    supa = await createClient()
  } catch (e) {
    return NextResponse.json(
      { error: "supabase_init", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const result = await buildRechazosCSV(supa, {
    desde: request.desde,
    hasta: request.hasta,
    filters: request.filters,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: "too_many_rows", total: result.total, max: result.max },
      { status: 413 },
    )
  }

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-Total-Rows": String(result.total),
      "X-Max-Rows": String(EXPORT_MAX_ROWS),
    },
  })
}
