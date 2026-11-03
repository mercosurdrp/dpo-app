"use client"

/**
 * Visualización general del maestro de flota: las cuatro vistas del panel
 * (identificación, asignación, documentación y estado) juntas en UNA tabla, a
 * pantalla completa, con todas las unidades del filtro actual.
 *
 * «Descargar imagen» dibuja esa misma tabla en un canvas y la baja como PNG.
 * Se dibuja a mano (no captura del DOM) para que salga entera aunque en
 * pantalla haya scroll, nítida y sin depender de una librería más. Las celdas
 * salen de `celdasUnidad`, la misma función que usa la tabla HTML: lo que se
 * ve y lo que se descarga no pueden diferir.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Download, Maximize, Minimize, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MaestroFlotaUnidad } from "@/types/database"
import { evidenciasDe } from "./evidencia-identificacion-dialog"

// ---------------------------------------------------------------------------
// Modelo de la tabla (compartido entre la tabla y la imagen)
// ---------------------------------------------------------------------------

type Tono = "normal" | "suave" | "falta" | "rojo" | "ambar" | "verde" | "naranja" | "mono"

interface Celda {
  texto: string
  tono: Tono
  /** Texto completo para el tooltip (ej. motivo de la OT). */
  titulo?: string
}

type Seccion = "unidad" | "identificacion" | "asignacion" | "documentacion" | "estado"

interface Columna {
  titulo: string
  seccion: Seccion
  derecha?: boolean
  /** Texto largo: en pantalla parte en renglones en vez de estirar la tabla. */
  envolver?: boolean
}

const SECCIONES: Array<{ id: Seccion; label: string; fondo: string; fondoCanvas: string; textoCanvas: string }> = [
  { id: "unidad", label: "Unidad", fondo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", fondoCanvas: "#f1f5f9", textoCanvas: "#334155" },
  { id: "identificacion", label: "Identificación", fondo: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200", fondoCanvas: "#e0f2fe", textoCanvas: "#075985" },
  { id: "asignacion", label: "Asignación", fondo: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", fondoCanvas: "#ede9fe", textoCanvas: "#5b21b6" },
  { id: "documentacion", label: "Documentación", fondo: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200", fondoCanvas: "#fef3c7", textoCanvas: "#92400e" },
  { id: "estado", label: "Estado", fondo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", fondoCanvas: "#d1fae5", textoCanvas: "#065f46" },
]

const COLUMNAS: Columna[] = [
  { titulo: "Dominio", seccion: "unidad" },
  { titulo: "Tipo", seccion: "unidad" },
  { titulo: "N.º", seccion: "identificacion" },
  { titulo: "Marca", seccion: "identificacion", envolver: true },
  { titulo: "Modelo", seccion: "identificacion", envolver: true },
  { titulo: "Año", seccion: "identificacion" },
  { titulo: "Chasis", seccion: "identificacion" },
  { titulo: "VIN", seccion: "identificacion" },
  { titulo: "Motor", seccion: "identificacion", envolver: true },
  { titulo: "Carga", seccion: "identificacion", envolver: true },
  { titulo: "Tara", seccion: "identificacion" },
  { titulo: "Carrocería", seccion: "identificacion", envolver: true },
  { titulo: "Evidencia", seccion: "identificacion" },
  { titulo: "Chofer", seccion: "asignacion", envolver: true },
  { titulo: "Centro de costo", seccion: "asignacion", envolver: true },
  { titulo: "Ubicación", seccion: "asignacion", envolver: true },
  { titulo: "Sector", seccion: "asignacion" },
  { titulo: "Telemetría", seccion: "asignacion", envolver: true },
  { titulo: "Combustible", seccion: "asignacion", envolver: true },
  { titulo: "VTV", seccion: "documentacion" },
  { titulo: "Seguro", seccion: "documentacion" },
  { titulo: "SENASA", seccion: "documentacion" },
  { titulo: "Extintor", seccion: "documentacion" },
  { titulo: "Papeles", seccion: "documentacion", envolver: true },
  { titulo: "Km / horas", seccion: "estado", derecha: true },
  { titulo: "Última lectura", seccion: "estado" },
  { titulo: "Últ. checklist", seccion: "estado" },
  { titulo: "Disponibilidad", seccion: "estado", envolver: true },
]

const TIPO_LABEL: Record<string, string> = {
  camion: "Camión",
  camioneta: "Camioneta",
  acoplado: "Acoplado",
  autoelevador: "Autoelevador",
  utilitario: "Utilitario",
  auto: "Auto",
  moto: "Moto",
}

const SECTOR_LABEL: Record<string, string> = {
  distribucion: "Distribución",
  deposito: "Depósito",
}

function fmtFecha(f: string | null | undefined): string {
  if (!f) return "—"
  const [a, m, d] = f.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

function fmtNum(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("es-AR").format(n)
}

const dato = (v: string | number | null | undefined, falta = false, tono: Tono = "normal"): Celda =>
  v != null && String(v).trim() !== ""
    ? { texto: String(v), tono }
    : { texto: falta ? "falta" : "—", tono: falta ? "falta" : "suave" }

function papel(u: MaestroFlotaUnidad, categoria: string, alterna?: string): Celda {
  const p =
    u.papeles.find((x) => x.categoria === categoria) ??
    (alterna ? u.papeles.find((x) => x.categoria === alterna) : undefined)
  if (!p) return { texto: "—", tono: "suave" }
  const tono: Tono =
    p.estado === "vencido" ? "rojo" : p.estado === "por_vencer" ? "ambar" : p.estado === "sin_fecha" ? "suave" : "normal"
  const texto = (p.vencimiento ? fmtFecha(p.vencimiento) : "sin fecha") + (p.tieneArchivo ? "" : " ⚠")
  return { texto, tono, titulo: p.tieneArchivo ? undefined : "Sin archivo adjunto" }
}

/** Fotos de los datos grabados en la unidad (prueba del DPO 1.1). */
function evidencia(u: MaestroFlotaUnidad): Celda {
  const n = evidenciasDe(u).length
  return n > 0
    ? { texto: `${n} foto${n === 1 ? "" : "s"}`, tono: "verde" }
    : { texto: "sin fotos", tono: "falta" }
}

/** Las celdas de una unidad, en el orden de COLUMNAS. */
function celdasUnidad(u: MaestroFlotaUnidad): Celda[] {
  const f = u.ficha
  const falta = (c: string) => u.camposFaltantes.includes(c)

  const estadoPapeles: Celda =
    u.docsVencidos > 0
      ? { texto: `${u.docsVencidos} vencido${u.docsVencidos === 1 ? "" : "s"}`, tono: "rojo" }
      : u.docsPorVencer > 0
        ? { texto: `${u.docsPorVencer} por vencer`, tono: "ambar" }
        : u.papeles.length > 0
          ? { texto: "Al día", tono: "verde" }
          : { texto: "sin papeles", tono: "falta" }
  if (u.docsSinArchivo > 0) estadoPapeles.texto += ` (${u.docsSinArchivo} sin archivo)`

  const disponibilidad: Celda = u.fueraServicio
    ? {
        texto:
          `Fuera de servicio desde ${fmtFecha(u.fueraServicio.desde)}` +
          (u.fueraServicio.numero_ot ? ` · OT ${u.fueraServicio.numero_ot}` : ""),
        tono: "naranja",
        titulo: u.fueraServicio.motivo ?? undefined,
      }
    : { texto: "Disponible", tono: "verde" }

  return [
    { texto: u.dominio + (u.activo ? "" : " (baja)"), tono: "normal" },
    dato(u.tipo ? (TIPO_LABEL[u.tipo] ?? u.tipo) : null, false, "suave"),
    dato(f?.numero_asignado, !f?.numero_asignado),
    dato(f?.marca, falta("marca")),
    dato(f?.modelo, falta("modelo")),
    dato(f?.anio, falta("anio")),
    dato(f?.chasis, falta("chasis"), "mono"),
    f?.vin && f.vin === f.chasis ? { texto: "= chasis", tono: "suave" } : dato(f?.vin, false, "mono"),
    dato(f?.motor, falta("motor"), "mono"),
    dato(f?.capacidad_carga),
    dato(f?.tara_kg != null ? `${fmtNum(Number(f.tara_kg))} kg` : null, f?.tara_kg == null),
    dato(f?.carroceria),
    evidencia(u),
    dato(f?.chofer_asignado),
    dato(f?.centro_costo),
    dato(f?.ciudad),
    dato(u.sector ? (SECTOR_LABEL[u.sector] ?? u.sector) : null, false, "suave"),
    dato(f?.telemetria, !f?.telemetria),
    dato(f?.combustible ? f.combustible + (f.combustible_aux ? ` + ${f.combustible_aux}` : "") : null),
    papel(u, "VTV"),
    papel(u, "Seguro vehicular"),
    papel(u, "SENASA"),
    papel(u, "Extintores camiones", "Extintores de autoelevadores"),
    estadoPapeles,
    u.kmActual != null
      ? { texto: `${fmtNum(u.kmActual)} ${u.esHorometro ? "h" : "km"}`, tono: "normal" }
      : { texto: "—", tono: "suave" },
    dato(u.kmFecha ? fmtFecha(u.kmFecha) : null, false, "suave"),
    u.ultimoChecklist ? { texto: fmtFecha(u.ultimoChecklist), tono: "suave" } : { texto: "nunca", tono: "falta" },
    disponibilidad,
  ]
}

const TONO_CLASE: Record<Tono, string> = {
  normal: "text-foreground",
  suave: "text-muted-foreground",
  falta: "font-medium text-amber-600",
  rojo: "font-semibold text-destructive",
  ambar: "font-medium text-amber-600",
  verde: "font-medium text-emerald-700 dark:text-emerald-400",
  naranja: "font-medium text-orange-700 dark:text-orange-400",
  mono: "font-mono text-foreground",
}

/** Colores de la imagen: siempre en claro, para que se lea impresa o en WhatsApp. */
const TONO_CANVAS: Record<Tono, { color: string; peso: string; mono?: boolean }> = {
  normal: { color: "#0f172a", peso: "400" },
  suave: { color: "#64748b", peso: "400" },
  falta: { color: "#d97706", peso: "600" },
  rojo: { color: "#dc2626", peso: "700" },
  ambar: { color: "#d97706", peso: "600" },
  verde: { color: "#047857", peso: "600" },
  naranja: { color: "#c2410c", peso: "600" },
  mono: { color: "#0f172a", peso: "400", mono: true },
}

// ---------------------------------------------------------------------------
// Imagen
// ---------------------------------------------------------------------------

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

/** En la imagen cada celda va en un renglón: un texto de párrafo se recorta. */
const MAX_IMAGEN = 60
const recortar = (t: string) => (t.length > MAX_IMAGEN ? `${t.slice(0, MAX_IMAGEN - 1).trimEnd()}…` : t)

async function dibujarImagen(filasCompletas: Celda[][], subtitulo: string): Promise<Blob> {
  const filas = filasCompletas.map((f) => f.map((c) => ({ ...c, texto: recortar(c.texto) })))
  const familia =
    getComputedStyle(document.body).fontFamily || "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  const mono = "ui-monospace, SFMono-Regular, Consolas, monospace"
  await document.fonts?.ready

  const TAM = 13
  const PAD_X = 10
  const ALTO_FILA = 26
  const ALTO_SECCION = 26
  const ALTO_TITULOS = 28
  const MARGEN = 24
  const ALTO_CABECERA = 64
  const ALTO_PIE = 34

  const medir = document.createElement("canvas").getContext("2d")!
  const fuente = (peso: string, esMono = false, tam = TAM) => `${peso} ${tam}px ${esMono ? mono : familia}`

  // Ancho de cada columna: lo que ocupe su título o su celda más larga.
  const anchos = COLUMNAS.map((col, i) => {
    medir.font = fuente("600")
    let w = medir.measureText(col.titulo).width
    for (const fila of filas) {
      const c = fila[i]
      const t = TONO_CANVAS[c.tono]
      medir.font = fuente(t.peso, t.mono)
      w = Math.max(w, medir.measureText(c.texto).width)
    }
    return Math.ceil(w + PAD_X * 2)
  })
  const anchoTabla = anchos.reduce((a, b) => a + b, 0)
  const ancho = anchoTabla + MARGEN * 2
  const alto = MARGEN + ALTO_CABECERA + ALTO_SECCION + ALTO_TITULOS + filas.length * ALTO_FILA + ALTO_PIE + MARGEN

  // Nítida (x2) salvo que la imagen se vuelva enorme para el navegador.
  const escala = Math.max(1, Math.min(2, 16000 / ancho, 16000 / alto, Math.sqrt(120_000_000 / (ancho * alto))))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(ancho * escala)
  canvas.height = Math.round(alto * escala)
  const ctx = canvas.getContext("2d")!
  ctx.scale(escala, escala)
  ctx.textBaseline = "middle"

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, ancho, alto)

  // Cabecera
  ctx.fillStyle = "#0f172a"
  ctx.font = fuente("700", false, 22)
  ctx.fillText("Maestro de flota · Visualización general", MARGEN, MARGEN + 16)
  ctx.fillStyle = "#64748b"
  ctx.font = fuente("400", false, 13)
  ctx.fillText(subtitulo, MARGEN, MARGEN + 44)

  let y = MARGEN + ALTO_CABECERA

  // Bandas de sección
  let x = MARGEN
  for (const sec of SECCIONES) {
    const idx = COLUMNAS.map((c, i) => (c.seccion === sec.id ? i : -1)).filter((i) => i >= 0)
    const w = idx.reduce((a, i) => a + anchos[i], 0)
    ctx.fillStyle = sec.fondoCanvas
    ctx.fillRect(x, y, w, ALTO_SECCION)
    ctx.fillStyle = sec.textoCanvas
    ctx.font = fuente("700", false, 12)
    ctx.fillText(sec.label.toUpperCase(), x + PAD_X, y + ALTO_SECCION / 2)
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + w, y)
    ctx.lineTo(x + w, y + ALTO_SECCION)
    ctx.stroke()
    x += w
  }
  y += ALTO_SECCION

  // Títulos de columna
  ctx.fillStyle = "#f8fafc"
  ctx.fillRect(MARGEN, y, anchoTabla, ALTO_TITULOS)
  x = MARGEN
  ctx.font = fuente("600")
  ctx.fillStyle = "#334155"
  COLUMNAS.forEach((col, i) => {
    const tx = col.derecha ? x + anchos[i] - PAD_X : x + PAD_X
    ctx.textAlign = col.derecha ? "right" : "left"
    ctx.fillText(col.titulo, tx, y + ALTO_TITULOS / 2)
    x += anchos[i]
  })
  ctx.textAlign = "left"
  y += ALTO_TITULOS
  ctx.strokeStyle = "#cbd5e1"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(MARGEN, y)
  ctx.lineTo(MARGEN + anchoTabla, y)
  ctx.stroke()

  // Filas
  filas.forEach((fila, r) => {
    if (r % 2 === 1) {
      ctx.fillStyle = "#f8fafc"
      ctx.fillRect(MARGEN, y, anchoTabla, ALTO_FILA)
    }
    x = MARGEN
    fila.forEach((c, i) => {
      const t = TONO_CANVAS[c.tono]
      ctx.font = fuente(i === 0 ? "700" : t.peso, t.mono)
      ctx.fillStyle = t.color
      const col = COLUMNAS[i]
      ctx.textAlign = col.derecha ? "right" : "left"
      ctx.fillText(c.texto, col.derecha ? x + anchos[i] - PAD_X : x + PAD_X, y + ALTO_FILA / 2)
      x += anchos[i]
    })
    ctx.textAlign = "left"
    y += ALTO_FILA
    ctx.strokeStyle = "#e2e8f0"
    ctx.beginPath()
    ctx.moveTo(MARGEN, y)
    ctx.lineTo(MARGEN + anchoTabla, y)
    ctx.stroke()
  })

  // Separadores verticales entre secciones, sobre toda la tabla
  x = MARGEN
  const yTabla = MARGEN + ALTO_CABECERA + ALTO_SECCION
  COLUMNAS.forEach((col, i) => {
    x += anchos[i]
    const sig = COLUMNAS[i + 1]
    if (sig && sig.seccion !== col.seccion) {
      ctx.strokeStyle = "#cbd5e1"
      ctx.beginPath()
      ctx.moveTo(x, yTabla)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  })

  // Pie
  ctx.fillStyle = "#94a3b8"
  ctx.font = fuente("400", false, 11)
  ctx.fillText(
    "Rojo = vencido · Ámbar = vence en 30 días o dato faltante · ⚠ = papel sin archivo adjunto · Fuente: app DPO",
    MARGEN,
    y + ALTO_PIE / 2 + 4,
  )

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))), "image/png"),
  )
}

// ---------------------------------------------------------------------------
// Vista a pantalla completa
// ---------------------------------------------------------------------------

export function VistaGeneralFlota({
  todas,
  filtradas,
  filtro,
  onClose,
}: {
  /** Las unidades activas de la flota entera. */
  todas: MaestroFlotaUnidad[]
  /** Las que deja el filtro del panel. */
  filtradas: MaestroFlotaUnidad[]
  /** Descripción del filtro activo («Camión», «documentación vencida»…), o null. */
  filtro: string | null
  onClose: () => void
}) {
  // Arranca con la flota entera: es la «foto general». El filtro del panel
  // queda a un clic, si había uno puesto.
  const [soloFiltro, setSoloFiltro] = useState(false)
  const unidades = soloFiltro && filtro ? filtradas : todas
  const filas = useMemo(() => unidades.map(celdasUnidad), [unidades])
  const [bajando, setBajando] = useState(false)
  const [montado, setMontado] = useState(false)

  // Ajustar al ancho: la tabla ocupa el ancho de la pantalla y los textos
  // largos parten en renglones; si aun así no entra, se achica (CSS zoom)
  // hasta que entren todas las columnas. Con «Tamaño real» no se achica.
  const [ajustar, setAjustar] = useState(true)
  const [zoom, setZoom] = useState(1)
  const cajaRef = useRef<HTMLDivElement>(null)
  const tablaRef = useRef<HTMLTableElement>(null)
  useLayoutEffect(() => {
    const caja = cajaRef.current
    const tabla = tablaRef.current
    if (!caja || !tabla) return
    const medir = () => {
      if (!ajustar) {
        setZoom(1)
        return
      }
      // Con ancho 100% el navegador ya parte los textos: lo que sobresale es
      // el mínimo que la tabla necesita. Al achicar, la letra chica redondea
      // distinto, así que se mide de nuevo (hasta 6 vueltas) hasta que entre.
      tabla.style.width = "100%"
      let z = 1
      for (let i = 0; i < 6; i++) {
        tabla.style.zoom = String(z)
        const visible = tabla.getBoundingClientRect().width
        const disponible = caja.clientWidth - 4
        if (visible <= disponible || z <= 0.55) break
        z = Math.max(0.55, z * (disponible / visible) - 0.004)
      }
      setZoom(z)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(caja)
    return () => ro.disconnect()
  }, [ajustar, filas, montado])

  useEffect(() => {
    setMontado(true)
    const previo = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previo
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const subtitulo =
    `${unidades.length} unidad${unidades.length === 1 ? "" : "es"}` +
    (soloFiltro && filtro ? ` · filtro: ${filtro}` : " · flota completa (activas)") +
    ` · ${fmtFecha(hoyISO())}`

  async function descargar() {
    setBajando(true)
    try {
      const blob = await dibujarImagen(filas, subtitulo)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `maestro-de-flota-${hoyISO()}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setBajando(false)
    }
  }

  if (!montado) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualización general del maestro de flota"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Maestro de flota · Visualización general</h2>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {filtro && (
            <div className="flex rounded-md border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSoloFiltro(false)}
                className={cn("rounded px-2 py-1", !soloFiltro ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                Todas las unidades ({todas.length})
              </button>
              <button
                type="button"
                onClick={() => setSoloFiltro(true)}
                className={cn("rounded px-2 py-1", soloFiltro ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                Solo el filtro ({filtradas.length})
              </button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => setAjustar((a) => !a)}>
            {ajustar ? <Maximize className="mr-1.5 size-4" /> : <Minimize className="mr-1.5 size-4" />}
            {ajustar ? "Tamaño real" : "Ajustar a la pantalla"}
          </Button>
          <Button size="sm" onClick={descargar} disabled={bajando || unidades.length === 0}>
            <Download className="mr-1.5 size-4" />
            {bajando ? "Generando…" : "Descargar imagen"}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {unidades.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Ninguna unidad coincide con el filtro.</p>
      ) : (
        <div ref={cajaRef} className="flex-1 overflow-auto [scrollbar-gutter:stable]">
          <table
            ref={tablaRef}
            // El 100% se resuelve dentro del zoom: ocupa justo el ancho visible.
            style={{ zoom, width: ajustar ? "100%" : undefined }}
            className={cn(
              "border-separate border-spacing-0 text-[12px] leading-tight",
              !ajustar && "w-max min-w-full",
            )}
          >
            <thead className="sticky top-0 z-10">
              <tr>
                {SECCIONES.map((sec) => (
                  <th
                    key={sec.id}
                    colSpan={COLUMNAS.filter((c) => c.seccion === sec.id).length}
                    className={cn(
                      "border-b border-r border-background px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide",
                      sec.fondo,
                      sec.id === "unidad" && "sticky left-0 z-20",
                    )}
                  >
                    {sec.label}
                  </th>
                ))}
              </tr>
              <tr>
                {COLUMNAS.map((col, i) => (
                  <th
                    key={col.titulo}
                    className={cn(
                      "whitespace-nowrap border-b bg-muted px-2 py-1.5 text-left align-bottom font-semibold text-foreground/80",
                      col.derecha && "text-right",
                      COLUMNAS[i + 1] && COLUMNAS[i + 1].seccion !== col.seccion && "border-r",
                      i === 0 && "sticky left-0 z-20",
                    )}
                  >
                    {col.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, r) => {
                const u = unidades[r]
                return (
                  <tr key={u.dominio} className={cn("hover:bg-muted/60", !u.activo && "opacity-60")}>
                    {fila.map((c, i) => {
                      const col = COLUMNAS[i]
                      return (
                        <td
                          key={col.titulo}
                          title={c.titulo ?? (col.envolver && c.texto.length > 40 ? c.texto : undefined)}
                          className={cn(
                            "border-b px-2 py-1 align-top",
                            col.envolver
                              ? "min-w-[5.5rem] max-w-[10rem] whitespace-normal break-words"
                              : "whitespace-nowrap",
                            r % 2 === 1 ? "bg-muted/30" : "bg-background",
                            TONO_CLASE[c.tono],
                            col.derecha && "text-right tabular-nums",
                            COLUMNAS[i + 1] && COLUMNAS[i + 1].seccion !== col.seccion && "border-r",
                            i === 0 && "sticky left-0 z-[1] font-semibold",
                          )}
                        >
                          {i === 0 ? (
                            <Link href={`/vehiculos/${encodeURIComponent(u.dominio)}`} className="hover:underline">
                              {c.texto}
                            </Link>
                          ) : col.envolver ? (
                            <span className="line-clamp-3">{c.texto}</span>
                          ) : (
                            c.texto
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>,
    document.body,
  )
}
