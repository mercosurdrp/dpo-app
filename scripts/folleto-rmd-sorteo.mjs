// Genera el folleto del sorteo RMD: 12 folletos por hoja A4 (3 × 4, de
// 70 × 74 mm cada uno) con el QR a /sorteo-rmd, listos para imprimir y cortar.
//
//   node scripts/folleto-rmd-sorteo.mjs [salida.pdf]
//
// Arma un HTML con las 12 tarjetas y lo imprime a PDF con Edge o Chrome en modo
// headless (vienen con Windows / están instalados en las PCs de la operación).
// El QR se genera con el paquete `qrcode` que ya usa la app.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import QRCode from "qrcode"

const URL_SORTEO = "https://dpo-app-self.vercel.app/sorteo-rmd"
const EMPRESA = "Mercosur · Distribución"
const PREMIO = "Escaneá el QR y mirá el premio"

const salida = resolve(process.argv[2] ?? "folleto-rmd-sorteo.pdf")
const html = salida.replace(/\.pdf$/i, "") + ".html"

const qr = await QRCode.toDataURL(URL_SORTEO, {
  errorCorrectionLevel: "M",
  margin: 0,
  width: 600,
  color: { dark: "#0f172a", light: "#ffffff" },
})

const tarjeta = `
<div class="f">
  <div class="top">
    <div class="kicker">★ ¿Cómo llegó tu pedido?</div>
    <div class="titulo">Calificá tu entrega<br>en BEES</div>
  </div>
  <div class="lema">Votando el <b>RMD</b> nos ayudás a mejorar.</div>
  <div class="cuerpo">
    <ol class="pasos">
      <li><b>Abrí BEES</b> cuando te llega el pedido y puntuá la entrega <span class="estrellas">★★★★★</span></li>
      <li><b>Escaneá el QR</b> e inscribí tu negocio.</li>
      <li><b>¡Participás del sorteo!</b><br><span class="premio">${PREMIO}</span></li>
    </ol>
    <div class="qrbox">
      <img class="qr" src="${qr}" alt="QR al sorteo">
      <div class="qrtxt">Escaneá e inscribite</div>
    </div>
  </div>
  <div class="bottom">
    <span>Calificás en BEES</span><span class="mas">+</span><span>te inscribís</span><span class="mas">=</span><span class="fuerte">participás</span>
  </div>
  <div class="pie">${EMPRESA}</div>
</div>`

// Dorso: la otra encuesta. Se imprime doble faz; como las 12 tarjetas son
// iguales, no importa por qué borde gire la hoja.
const tarjetaNps = `
<div class="f">
  <div class="top top-nps">
    <div class="kicker">★ ¿Conocés el NPS?</div>
    <div class="titulo">La otra encuesta<br>que nos ayuda</div>
  </div>
  <div class="lema">Si te llega, respondela.</div>
  <div class="cuerpo">
    <div class="texto">
      <p>El <b>NPS</b> es una encuesta corta que le llega <b>al azar</b> a algunos clientes y pregunta, del <b>0 al 10</b>, qué tan satisfecho estás con nosotros y qué mejorarías.</p>
      <ul class="puntos">
        <li>Lleva menos de un minuto.</li>
        <li>No le llega a todos ni todos los meses: si te toca, ¡es tu momento!</li>
        <li>Tu respuesta nos dice qué mejorar: entrega, vendedor, frío, app.</li>
      </ul>
    </div>
    <div class="escala">
      <div class="escala-num">0</div>
      <div class="escala-barra"></div>
      <div class="escala-num">10</div>
      <div class="escala-txt">¿Cuánto nos recomendarías?</div>
    </div>
  </div>
  <div class="bottom bottom-nps">
    <span><b>RMD</b> = cada entrega</span><span class="mas">·</span><span><b>NPS</b> = cómo te tratamos en general</span>
  </div>
  <div class="pie">${EMPRESA}</div>
</div>`

const doc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Folleto RMD · sorteo</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 210mm; height: 297mm;
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .hoja {
    width: 210mm; height: 297mm;
    display: grid;
    grid-template-columns: repeat(3, 70mm);
    grid-template-rows: repeat(4, 74.25mm);
  }
  .f {
    width: 70mm; height: 74.25mm;
    padding: 3.2mm 3.4mm 2.6mm;
    border: 0.15mm dashed #94a3b8;
    display: flex; flex-direction: column;
    background: #fff;
    position: relative;
    overflow: hidden;
  }
  .top {
    background: #0f172a; color: #fff;
    border-radius: 2mm;
    padding: 1.8mm 2.4mm 2mm;
  }
  .kicker {
    font-size: 6.6pt; font-weight: 700; letter-spacing: 0.04em;
    text-transform: uppercase; color: #fcd34d;
  }
  .titulo { font-size: 12.5pt; font-weight: 800; line-height: 1.05; margin-top: 0.6mm; }
  .lema {
    margin-top: 1.8mm;
    font-size: 8.4pt; font-weight: 600; color: #b45309;
    text-align: center;
  }
  .cuerpo {
    display: flex; gap: 2mm; align-items: center;
    margin-top: 1.6mm; flex: 1;
  }
  .pasos {
    margin: 0; padding-left: 4.2mm;
    font-size: 6.9pt; line-height: 1.25; color: #1e293b;
    flex: 1;
  }
  .pasos li { margin-bottom: 1.4mm; }
  .premio { color: #b91c1c; font-weight: 700; font-size: 6.6pt; }
  .pasos li::marker { font-weight: 800; color: #b45309; }
  .estrellas { color: #f59e0b; letter-spacing: -0.02em; white-space: nowrap; }
  .qrbox { width: 25mm; text-align: center; flex: 0 0 25mm; }
  .qr { width: 23mm; height: 23mm; display: block; margin: 0 auto; }
  .qrtxt { font-size: 6pt; font-weight: 700; color: #0f172a; margin-top: 0.8mm; }
  .bottom {
    margin-top: 1.4mm;
    background: #fef3c7; border: 0.2mm solid #fcd34d; border-radius: 1.5mm;
    padding: 1.2mm 1.5mm;
    font-size: 6.9pt; font-weight: 600; color: #78350f;
    display: flex; justify-content: center; align-items: center; gap: 1mm;
    white-space: nowrap;
  }
  .bottom .mas { font-weight: 800; color: #b45309; }
  .bottom .fuerte { font-weight: 800; text-transform: uppercase; }
  .pie {
    margin-top: 1.2mm;
    font-size: 5.4pt; color: #64748b; text-align: center;
    letter-spacing: 0.01em;
  }
  /* --- dorso NPS --- */
  .hoja { break-after: page; }
  .hoja:last-child { break-after: auto; }
  .top-nps { background: #0c4a6e; }
  .top-nps .kicker { color: #7dd3fc; }
  .texto { flex: 1; font-size: 6.4pt; line-height: 1.2; color: #1e293b; }
  .texto p { margin: 0 0 0.9mm; }
  .puntos { margin: 0; padding-left: 3.6mm; }
  .puntos li { margin-bottom: 0.4mm; }
  .puntos li::marker { color: #0369a1; }
  .escala {
    flex: 0 0 22mm; width: 22mm;
    display: flex; flex-direction: column; align-items: center; gap: 0.8mm;
  }
  .escala-num { font-size: 8pt; font-weight: 800; color: #0f172a; }
  .escala-barra {
    width: 6mm; height: 17mm; border-radius: 3mm;
    background: linear-gradient(to top, #ef4444, #f59e0b 45%, #22c55e);
    border: 0.3mm solid #fff; box-shadow: 0 0 0 0.3mm #cbd5e1;
  }
  .escala-txt { font-size: 5.8pt; font-weight: 700; color: #0c4a6e; text-align: center; }
  .bottom-nps { background: #e0f2fe; border-color: #7dd3fc; color: #0c4a6e; }
  .bottom-nps .mas { color: #0369a1; }
</style></head>
<body>
<div class="hoja">${tarjeta.repeat(12)}</div>
<div class="hoja">${tarjetaNps.repeat(12)}</div>
</body></html>`

mkdirSync(dirname(salida), { recursive: true })
writeFileSync(html, doc, "utf8")

const navegadores = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
]
const exe = navegadores.find((p) => existsSync(p))
if (!exe) {
  console.error("No encontré Edge ni Chrome. Quedó el HTML en:", html)
  console.error("Abrilo en el navegador e imprimilo en A4 sin márgenes.")
  process.exit(1)
}

const r = spawnSync(
  exe,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-pdf-header-footer",
    `--print-to-pdf=${salida}`,
    pathToFileURL(html).href,
  ],
  { stdio: "inherit", timeout: 60_000 },
)
if (r.status !== 0 || !existsSync(salida)) {
  console.error("Falló la impresión a PDF (código", r.status, "). HTML en:", html)
  process.exit(1)
}
console.log("PDF listo:", salida)
console.log("HTML fuente:", html)
