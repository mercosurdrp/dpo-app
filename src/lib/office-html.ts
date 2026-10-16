// Convierte Excel y Word a HTML para verlos en el navegador sin depender del
// visor web de Microsoft (view.officeapps.live.com), que dejó de abrir nuestros
// archivos. Sólo servidor: usa xlsx (SheetJS) y mammoth.

import * as XLSX from "xlsx"

export type OfficeHtml = {
  titulo: string
  /** HTML del cuerpo (sin <html>/<body>). */
  cuerpo: string
  /** Nombres de hojas (Excel) para la barra de solapas. */
  hojas: string[]
}

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const MAX_CELDAS_POR_HOJA = 60_000

/** Excel → una tabla HTML por hoja, con la grilla acotada al rango usado. */
export function xlsxAHtml(buffer: ArrayBuffer, nombre: string): OfficeHtml {
  const wb = XLSX.read(buffer, { type: "array", cellStyles: false })
  const hojas: string[] = []
  const partes: string[] = []
  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName]
    if (!ws || !ws["!ref"]) return
    const i = hojas.length
    const rango = XLSX.utils.decode_range(ws["!ref"])
    const celdas = (rango.e.r - rango.s.r + 1) * (rango.e.c - rango.s.c + 1)
    let aviso = ""
    if (celdas > MAX_CELDAS_POR_HOJA) {
      // Hoja enorme: recorto filas para que el navegador no se muera.
      const cols = rango.e.c - rango.s.c + 1
      const filasMax = Math.max(50, Math.floor(MAX_CELDAS_POR_HOJA / cols))
      rango.e.r = Math.min(rango.e.r, rango.s.r + filasMax - 1)
      ws["!ref"] = XLSX.utils.encode_range(rango)
      aviso = `<p class="aviso">Hoja grande: se muestran las primeras ${filasMax} filas. Descargá el archivo para verla completa.</p>`
    }
    const html = XLSX.utils.sheet_to_html(ws, { header: "", footer: "" })
    hojas.push(sheetName)
    partes.push(
      `<section class="hoja" data-hoja="${i}"${i === 0 ? "" : " hidden"}>${aviso}${html}</section>`,
    )
  })
  if (hojas.length === 0) {
    partes.push('<p class="aviso">El archivo no tiene hojas con datos.</p>')
  }
  return { titulo: nombre, cuerpo: partes.join("\n"), hojas }
}

/** Word → HTML con mammoth (texto, títulos, listas, tablas e imágenes). */
export async function docxAHtml(
  buffer: ArrayBuffer,
  nombre: string,
): Promise<OfficeHtml> {
  const mammoth = await import("mammoth")
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) })
  return {
    titulo: nombre,
    cuerpo: `<article class="doc">${result.value}</article>`,
    hojas: [],
  }
}

/** Página completa con barra superior (nombre, solapas y Descargar). */
export function paginaVisor(
  doc: OfficeHtml,
  urlDescarga: string,
  urlVisorExterno?: string,
): string {
  const solapas =
    doc.hojas.length > 1
      ? `<nav class="solapas">${doc.hojas
          .map(
            (h, i) =>
              `<button type="button" data-hoja="${i}"${i === 0 ? ' class="activa"' : ""}>${escapar(h)}</button>`,
          )
          .join("")}</nav>`
      : ""
  const externo = urlVisorExterno
    ? `<a class="btn" href="${escapar(urlVisorExterno)}" target="_blank" rel="noopener noreferrer">Abrir con el visor de Microsoft</a>`
    : ""
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(doc.titulo)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #f8fafc; }
  header { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn { font-size: 13px; padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; text-decoration: none; }
  .btn.primario { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
  .solapas { flex-basis: 100%; display: flex; gap: 4px; overflow-x: auto; }
  .solapas button { font-size: 12px; padding: 4px 10px; border-radius: 6px 6px 0 0; border: 1px solid #e2e8f0; border-bottom: none; background: #f1f5f9; cursor: pointer; white-space: nowrap; }
  .solapas button.activa { background: #fff; font-weight: 600; border-color: #94a3b8; }
  main { padding: 12px 16px 40px; }
  .aviso { font-size: 12px; color: #92400e; background: #fef3c7; border: 1px solid #fcd34d; padding: 6px 10px; border-radius: 6px; }
  .hoja { overflow: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
  .hoja table { border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  .hoja td { border: 1px solid #e2e8f0; padding: 2px 8px; white-space: nowrap; max-width: 480px; overflow: hidden; text-overflow: ellipsis; }
  .hoja tr:first-child td { position: sticky; top: 0; background: #f1f5f9; font-weight: 600; }
  .doc { max-width: 820px; margin: 0 auto; background: #fff; padding: 40px 48px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; line-height: 1.5; }
  .doc table { border-collapse: collapse; margin: 8px 0; }
  .doc td, .doc th { border: 1px solid #cbd5e1; padding: 4px 8px; }
  .doc img { max-width: 100%; height: auto; }
  @media (max-width: 600px) { .doc { padding: 20px 16px; } }
</style></head>
<body>
<header>
  <h1 title="${escapar(doc.titulo)}">${escapar(doc.titulo)}</h1>
  ${externo}
  <a class="btn primario" href="${escapar(urlDescarga)}">Descargar</a>
  ${solapas}
</header>
<main>
${doc.cuerpo}
</main>
<script>
  document.querySelectorAll(".solapas button").forEach(function (b) {
    b.addEventListener("click", function () {
      var i = b.getAttribute("data-hoja");
      document.querySelectorAll(".solapas button").forEach(function (x) { x.classList.toggle("activa", x === b); });
      document.querySelectorAll(".hoja").forEach(function (s) { s.hidden = s.getAttribute("data-hoja") !== i; });
    });
  });
</script>
</body></html>`
}
