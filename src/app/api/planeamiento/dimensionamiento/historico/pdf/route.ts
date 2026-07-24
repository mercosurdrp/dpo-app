/**
 * PDF "Cómo fue enero–junio" del dimensionamiento, por sector.
 * GET ?sector=flota|almacen → descarga el binario (attachment).
 * La auth la resuelve `getDatosDimensionamiento()` (requireAuth + gate Pampeana).
 */
import { NextResponse, type NextRequest } from "next/server"
import { construirHistorico, type SectorHistorico } from "./_data"
import { renderHistoricoPdf } from "./_render"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("sector")
  const sector: SectorHistorico = raw === "almacen" ? "almacen" : "flota"

  let pdf: Buffer
  try {
    const payload = await construirHistorico(sector)
    pdf = await renderHistoricoPdf(payload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error generando el PDF"
    const status = /no autoriz|unauthorized|sesión/i.test(msg) ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dimensionamiento-ene-jun-${sector}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
