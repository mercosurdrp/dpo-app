/**
 * PDF de los clientes reprogramados del día (VRL).
 *
 * Va por POST porque el corte vive en el cliente: el cupo por ciudad y los
 * sacar/subir manuales no están guardados en ningún lado hasta que se aprieta
 * "Registrar corte". El navegador descarga el binario (attachment), sin pasar
 * por el diálogo de impresión.
 */
import { NextResponse, type NextRequest } from "next/server"
import { requireAuth } from "@/lib/session"
import {
  renderReprogramadosPdf,
  type GrupoPdf,
  type ReprogramadosPayload,
} from "./_render"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Valida lo justo: el payload lo arma nuestro propio cliente, pero llega por red. */
function parsePayload(body: unknown): ReprogramadosPayload | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) return null
  if (!Array.isArray(b.grupos) || b.grupos.length === 0) return null
  const total = b.total as ReprogramadosPayload["total"] | undefined
  if (!total || typeof total.clientes !== "number") return null
  return {
    fecha: b.fecha,
    nota: typeof b.nota === "string" ? b.nota.slice(0, 2000) : "",
    total,
    grupos: b.grupos as GrupoPdf[],
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const payload = parsePayload(await req.json().catch(() => null))
  if (!payload) {
    return NextResponse.json(
      { error: "invalid_params", message: "Corte inválido o sin clientes reprogramados." },
      { status: 400 },
    )
  }

  let pdf: Buffer
  try {
    pdf = await renderReprogramadosPdf(payload)
  } catch (err) {
    return NextResponse.json(
      { error: "pdf_error", message: err instanceof Error ? err.message : "Error renderizando PDF" },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reprogramados-${payload.fecha}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
