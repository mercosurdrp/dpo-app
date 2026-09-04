import { NextResponse, type NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/planeamiento/periodos-criticos/incentivos/pdf?id=1
//
// Comunicado del programa de incentivos de temporada alta (R3.4.4), armado en
// el momento con lo que está cargado en la app: nombre, vigencia, descripción,
// indicadores con su meta, y una planilla de firmas «Tomé conocimiento» para
// que quede la evidencia de que se comunicó a todo el equipo. Se abre inline
// para imprimirlo desde el navegador.

type Programa = {
  id: number
  nombre: string
  periodo: string | null
  descripcion: string | null
  vigencia_desde: string | null
  vigencia_hasta: string | null
}
type Kpi = { ambito: string; nombre: string; tipo: string; meta: string; fuente: string; orden: number }

// Helvetica sólo trae WinAnsi: reemplazar los símbolos que no existen ahí.
const tx = (s: string) =>
  s.replace(/≤/g, "hasta ").replace(/≥/g, "mínimo ").replace(/—/g, "-").replace(/«|»/g, '"').replace(/·/g, "-")

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : ""

function render(p: Programa, kpis: Kpi[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: { Title: `Comunicado ${p.nombre}`, Author: "Mercosur Distribuciones" },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const W = doc.page.width - 100
    const x0 = 50

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#555").text("MERCOSUR DRP - REGIÓN PAMPEANA - LOGÍSTICA", { align: "right" })
    doc.moveDown(0.6)
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text("COMUNICADO")
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#b91c1c").text(tx(p.nombre))
    doc.moveDown(0.3)
    doc.font("Helvetica").fontSize(10).fillColor("#111")
      .text("Para: todo el equipo de Entrega (choferes y ayudantes) y de Almacén (picking y maquinistas).")
    if (p.vigencia_desde && p.vigencia_hasta) {
      doc.text(`Vigencia: del ${fmtFecha(p.vigencia_desde)} al ${fmtFecha(p.vigencia_hasta)}.`)
    } else if (p.periodo) {
      doc.text(`Período: ${tx(p.periodo)}.`)
    }
    doc.text("Fecha del comunicado: ____ / ____ / ______")
    doc.moveDown(0.8)

    // La descripción viene en párrafos; los que arrancan con un título en
    // mayúsculas seguido de ":" se imprimen con el título en negrita.
    const parrafos = (p.descripcion ?? "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
    for (const par of parrafos) {
      const m = par.match(/^([A-ZÁÉÍÓÚÑ0-9 ()\-–—:,.]+?):\s*([\s\S]*)$/)
      if (m && m[1].length <= 90 && m[1] === m[1].toUpperCase()) {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text(tx(m[1].trim()))
        doc.moveDown(0.15)
        if (m[2].trim()) doc.font("Helvetica").fontSize(10).fillColor("#222").text(tx(m[2].trim()), { width: W, lineGap: 1.5 })
      } else {
        doc.font("Helvetica").fontSize(10).fillColor("#222").text(tx(par), { width: W, lineGap: 1.5 })
      }
      doc.moveDown(0.6)
    }

    // Tabla de indicadores
    const puntaje = kpis.filter((k) => k.tipo === "puntaje")
    const habilitantes = kpis.filter((k) => k.tipo === "habilitante")
    if (kpis.length > 0) {
      if (doc.y > doc.page.height - 220) doc.addPage()
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text("Indicadores")
      doc.font("Helvetica").fontSize(9).fillColor("#444").text("La meta es el promedio del mes por persona: no es acumulado del año ni hay que cumplirla todos los días.")
      doc.moveDown(0.3)
      const cols = [130, 190, 175]
      let y = doc.y
      const fila = (a: string, b: string, c: string, bold = false, bg: string | null = null) => {
        const h = 26
        if (bg) doc.save().rect(x0, y, W, h).fill(bg).restore()
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#111")
        doc.text(tx(a), x0 + 6, y + 5, { width: cols[0] - 10 })
        doc.text(tx(b), x0 + cols[0] + 6, y + 5, { width: cols[1] - 10 })
        doc.text(tx(c), x0 + cols[0] + cols[1] + 6, y + 5, { width: cols[2] - 10 })
        doc.save().rect(x0, y, W, h).strokeColor("#bbb").lineWidth(0.5).stroke().restore()
        y += h
      }
      fila("Ámbito", "Indicador", "Meta", true, "#f3f4f6")
      for (const k of habilitantes) fila(k.ambito, `${k.nombre} (habilitante)`, k.meta)
      for (const k of puntaje) fila(k.ambito, k.nombre, k.meta)
      doc.y = y + 12
      doc.x = x0
    }

    // Planilla de firmas
    doc.addPage()
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111").text(tx(`Tomé conocimiento: ${p.nombre}`))
    doc.font("Helvetica").fontSize(9).fillColor("#444").text("Evidencia de comunicación al equipo (DPO 3.4, R3.4.4). Una fila por persona.")
    doc.moveDown(0.6)
    let y = doc.y
    const c2 = [28, 200, 110, 157]
    const filaF = (n: string, nombre: string, sector: string, firma: string, head = false) => {
      const h = 24
      if (head) doc.save().rect(x0, y, W, h).fill("#f3f4f6").restore()
      doc.font(head ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#111")
      doc.text(n, x0 + 4, y + 7, { width: c2[0] - 6 })
      doc.text(nombre, x0 + c2[0] + 6, y + 7, { width: c2[1] - 10 })
      doc.text(sector, x0 + c2[0] + c2[1] + 6, y + 7, { width: c2[2] - 10 })
      doc.text(firma, x0 + c2[0] + c2[1] + c2[2] + 6, y + 7, { width: c2[3] - 10 })
      doc.save().rect(x0, y, W, h).strokeColor("#bbb").lineWidth(0.5).stroke().restore()
      y += h
    }
    filaF("#", "Nombre y apellido", "Sector", "Firma / fecha", true)
    for (let i = 1; i <= 26; i++) filaF(String(i), "", "", "")
    doc.end()
  })
}

export async function GET(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const id = Number(req.nextUrl.searchParams.get("id") ?? 1) || 1
  const supabase = await createClient()
  const [{ data: prog, error }, { data: kpis }] = await Promise.all([
    supabase.from("pc_incentivos_programa").select("id, nombre, periodo, descripcion, vigencia_desde, vigencia_hasta").eq("id", id).maybeSingle(),
    supabase.from("pc_incentivos_kpis").select("ambito, nombre, tipo, meta, fuente, orden").eq("programa_id", id).order("orden"),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!prog) return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 })

  let pdf: Buffer
  try {
    pdf = await render(prog as Programa, (kpis ?? []) as Kpi[])
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error renderizando PDF" }, { status: 500 })
  }
  const nombreArchivo = `Comunicado ${String(prog.nombre).replace(/[^\w\dáéíóúñÁÉÍÓÚÑ .-]+/g, "").trim()}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(nombreArchivo)}"`,
      "Cache-Control": "no-store",
    },
  })
}
