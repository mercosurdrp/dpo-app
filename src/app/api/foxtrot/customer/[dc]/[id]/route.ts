import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { getCustomerLocation } from "@/lib/foxtrot-snapshot/build"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ dc: string; id: string }> },
) {
  await requireAuth()
  const { dc, id } = await ctx.params
  if (!dc || !id) return NextResponse.json({ error: "dc/id requeridos" }, { status: 400 })
  const data = await getCustomerLocation(dc, id)
  return NextResponse.json(data)
}
