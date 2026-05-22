import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib"
import type {
  HerramientaGestion,
  HerramientaGestionConContexto,
  CincoPorquesContenido,
  CausaEfectoContenido,
  PdcaContenido,
} from "@/types/database"
import { HERRAMIENTA_GESTION_LABELS } from "@/lib/herramientas-gestion"

// Página A4 en puntos
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 50
const BOTTOM = 60

const C = {
  texto: rgb(0.12, 0.16, 0.23), // slate-800
  label: rgb(0.39, 0.45, 0.55), // slate-500
  tenue: rgb(0.55, 0.6, 0.67), // slate-400
  linea: rgb(0.886, 0.91, 0.94), // slate-200
  amber: rgb(0.7, 0.33, 0.04), // causa raíz
  emerald: rgb(0.02, 0.47, 0.34), // contramedida
  azul: rgb(0.15, 0.39, 0.92),
  rojo: rgb(0.86, 0.15, 0.15),
}

// pdf-lib StandardFonts usan WinAnsi (CP1252): soportan acentos latinos
// pero NO emojis ni caracteres fuera de Latin-1. Sanitizamos input de usuario.
function limpiar(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "") // drop fuera de Latin-1 (emojis, etc.)
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, "0")
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    return `${dd}/${mm}/${d.getFullYear()}`
  } catch {
    return ""
  }
}

/** Builder con cursor vertical, word-wrap y salto de página automático. */
class Builder {
  doc!: PDFDocument
  page!: PDFPage
  font!: PDFFont
  bold!: PDFFont
  y = PAGE_H - MARGIN

  async init() {
    this.doc = await PDFDocument.create()
    this.font = await this.doc.embedFont(StandardFonts.Helvetica)
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold)
    this.addPage()
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN
  }

  private ensure(h: number) {
    if (this.y - h < BOTTOM) this.addPage()
  }

  private wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = []
    for (const raw of text.split("\n")) {
      const words = raw.split(/\s+/).filter(Boolean)
      if (words.length === 0) {
        out.push("")
        continue
      }
      let line = ""
      for (const w of words) {
        const cand = line ? `${line} ${w}` : w
        if (font.widthOfTextAtSize(cand, size) > maxW && line) {
          out.push(line)
          line = w
        } else {
          line = cand
        }
      }
      if (line) out.push(line)
    }
    return out
  }

  /** Párrafo de texto con wrap. */
  text(
    str: string,
    opts: {
      size?: number
      bold?: boolean
      color?: ReturnType<typeof rgb>
      indent?: number
      gap?: number
    } = {},
  ) {
    const size = opts.size ?? 10
    const font = opts.bold ? this.bold : this.font
    const color = opts.color ?? C.texto
    const x = MARGIN + (opts.indent ?? 0)
    const maxW = PAGE_W - MARGIN * 2 - (opts.indent ?? 0)
    const lh = size * 1.35
    const clean = limpiar(str)
    if (!clean.trim()) return
    for (const line of this.wrap(clean, font, size, maxW)) {
      this.ensure(lh)
      this.page.drawText(line, { x, y: this.y, size, font, color })
      this.y -= lh
    }
    if (opts.gap) this.y -= opts.gap
  }

  /** Etiqueta tipo "LABEL" en mayúsculas tenues. */
  label(str: string, color = C.label) {
    this.ensure(14)
    this.page.drawText(limpiar(str).toUpperCase(), {
      x: MARGIN,
      y: this.y,
      size: 8,
      font: this.bold,
      color,
    })
    this.y -= 14
  }

  bullet(str: string, indent = 12) {
    const clean = limpiar(str)
    if (!clean.trim()) return
    this.ensure(13)
    this.page.drawText("-", {
      x: MARGIN + indent,
      y: this.y,
      size: 10,
      font: this.font,
      color: C.tenue,
    })
    this.text(clean, { indent: indent + 12, size: 10 })
  }

  rule() {
    this.ensure(12)
    this.y -= 4
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 1,
      color: C.linea,
    })
    this.y -= 10
  }

  gap(h = 6) {
    this.y -= h
  }
}

function encabezado(b: Builder, h: HerramientaGestion | HerramientaGestionConContexto) {
  const ctx = h as HerramientaGestionConContexto
  b.label(`Herramienta de gestión · ${HERRAMIENTA_GESTION_LABELS[h.tipo]}`, C.azul)
  b.text(h.titulo || "(sin título)", { size: 16, bold: true, gap: 2 })

  const partes: string[] = []
  if (h.reunion_actividad_id || ctx.actividad_descripcion) {
    partes.push("Actividad de reunión")
    if (ctx.reunion_tipo) partes.push(`Reunión: ${ctx.reunion_tipo}`)
    if (ctx.actividad_descripcion) partes.push(ctx.actividad_descripcion)
  } else {
    if (ctx.plan_pilar_nombre) partes.push(`Pilar: ${ctx.plan_pilar_nombre}`)
    if (ctx.plan_pregunta_numero != null) partes.push(`Pregunta ${ctx.plan_pregunta_numero}`)
    if (ctx.plan_titulo) partes.push(ctx.plan_titulo)
    if (partes.length === 0) partes.push("Tarea / plan de acción")
  }
  b.text(partes.join("  ·  "), { size: 9, color: C.label })

  const meta: string[] = []
  if (ctx.autor_nombre) meta.push(`Responsable: ${ctx.autor_nombre}`)
  if (h.created_at) meta.push(`Fecha: ${fechaCorta(h.created_at)}`)
  if (meta.length) b.text(meta.join("  ·  "), { size: 9, color: C.tenue })
  b.rule()
}

function cincoPorques(b: Builder, c: CincoPorquesContenido) {
  b.label("Problema inicial")
  b.text(c.problema || "—", { gap: 8 })

  if (c.porques?.length) {
    b.label('Cascada de "¿Por qué?"')
    c.porques.forEach((p, i) => {
      b.text(`${i + 1}. ${p.pregunta || `¿Por qué ${i + 1}?`}`, {
        bold: true,
        size: 10,
      })
      b.text(p.respuesta || "—", { indent: 14, color: C.label, gap: 4 })
    })
    b.gap(4)
  }

  if (c.causa_raiz?.trim()) {
    b.label("Causa raíz identificada", C.amber)
    b.text(c.causa_raiz, { color: C.amber, gap: 8 })
  }
  if (c.contramedida?.trim()) {
    b.label("Contramedida propuesta", C.emerald)
    b.text(c.contramedida, { color: C.emerald })
  }
}

function causaEfecto(b: Builder, c: CausaEfectoContenido) {
  b.label("Efecto / problema observado")
  b.text(c.efecto || "—", { gap: 8 })
  if (c.problema?.trim()) {
    b.label("Contexto adicional")
    b.text(c.problema, { gap: 8 })
  }

  const conCausas = (c.categorias ?? []).filter((cat) => cat.causas?.some((x) => x.trim()))
  if (conCausas.length) {
    b.label("Causas por categoría (6M)")
    b.gap(2)
    for (const cat of conCausas) {
      b.text(cat.nombre, { bold: true, size: 10 })
      for (const causa of cat.causas.filter((x) => x.trim())) b.bullet(causa)
      b.gap(4)
    }
  }

  if (c.causa_raiz?.trim()) {
    b.label("Causa raíz priorizada", C.amber)
    b.text(c.causa_raiz, { color: C.amber })
  }
}

function pdca(b: Builder, c: PdcaContenido) {
  const secciones: { titulo: string; color: ReturnType<typeof rgb>; campos: [string, string][] }[] = [
    {
      titulo: "PLAN — Planificar",
      color: C.azul,
      campos: [
        ["Problema", c.plan?.problema ?? ""],
        ["Brechas", c.plan?.brechas ?? ""],
        ["Objetivos", c.plan?.objetivos ?? ""],
        ["Causas analizadas", c.plan?.causas ?? ""],
      ],
    },
    {
      titulo: "HACER — Ejecutar",
      color: C.emerald,
      campos: [["Acciones implementadas", c.hacer?.acciones ?? ""]],
    },
    {
      titulo: "VERIFICAR — Controlar",
      color: C.amber,
      campos: [["Resultados observados", c.verificar?.resultados ?? ""]],
    },
    {
      titulo: "ACTUAR — Estandarizar",
      color: C.rojo,
      campos: [["Estandarización y próximos pasos", c.actuar?.estandarizacion ?? ""]],
    },
  ]

  for (const s of secciones) {
    b.label(s.titulo, s.color)
    b.gap(2)
    let algo = false
    for (const [k, v] of s.campos) {
      if (!v.trim()) continue
      algo = true
      b.text(k, { bold: true, size: 9, color: C.label })
      b.text(v, { gap: 4 })
    }
    if (!algo) b.text("Sin datos registrados.", { size: 9, color: C.tenue })
    b.gap(6)
  }
}

/** Genera el PDF de una herramienta de gestión y devuelve los bytes. */
export async function generarPdfHerramienta(
  h: HerramientaGestion | HerramientaGestionConContexto,
): Promise<Uint8Array> {
  const b = new Builder()
  await b.init()

  encabezado(b, h)

  if (h.tipo === "cinco_porques") cincoPorques(b, h.contenido as CincoPorquesContenido)
  else if (h.tipo === "causa_efecto") causaEfecto(b, h.contenido as CausaEfectoContenido)
  else if (h.tipo === "pdca") pdca(b, h.contenido as PdcaContenido)

  // Pie en la última página
  b.gap(16)
  b.page.drawText(
    limpiar(`Generado automáticamente por DPO · ${fechaCorta(new Date().toISOString())}`),
    { x: MARGIN, y: 36, size: 7, font: b.font, color: C.tenue },
  )

  return b.doc.save()
}
