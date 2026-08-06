/**
 * Parser del Consolidado de GOPs y Toolkits (el Excel que se completa una vez por mes
 * y se sube al Campus). Es puro: recibe el archivo y devuelve temas/preguntas/respuestas,
 * sin tocar la base — el server action de arriba se encarga de persistir.
 *
 * Las 11 hojas de tema NO comparten formato. Hay tres variantes conviviendo:
 *
 *   A) 'GOP WQI', 'GOP Obsolescencia', 'GOP Total Productivity WH', 'Inventory Toolkit',
 *      'GOP Total Quality Index (DEL)'
 *      → col 0: ID de pregunta ('7_7_64_762') · col 1: pregunta · col 2: comentario.
 *        Las secciones son filas propias con el puntaje del bloque en las columnas de mes.
 *
 *   B) 'Toolkit Prev. Violencia Nivel 1/2', 'GOP Combustible'
 *      → sin columna de ID; el número va pegado al texto ('132.Existe una SOP...').
 *        Las secciones son filas con texto y sin respuestas.
 *
 *   C) 'Toolkit Seg. Vial Nivel 1/2'
 *      → col 0: Tema (la sección, que se arrastra hacia abajo) · col 1: pregunta.
 *        No hay columna de comentario. Estas dos hojas venían sin ningún identificador:
 *        el 6/8/2026 se les numeraron las preguntas en el propio Excel (N1 desde 901,
 *        N2 desde 921 — rango libre, no pisa el 132-161 ni el 730-832 de las otras
 *        hojas) para que editar un enunciado no las convierta en preguntas nuevas.
 *
 * Por eso el parser no asume posiciones: ubica la fila de encabezado por los nombres de
 * mes y deduce de ahí dónde está cada cosa.
 */

import * as XLSX from "xlsx"

export type ValorGop = "si" | "no" | "na"

export interface PreguntaParseada {
  codigo: string
  seccion: string | null
  texto: string
  comentario: string | null
  orden: number
  /** mes (1-12) → respuesta. Solo los meses que el Excel trae cargados. */
  respuestas: Record<number, ValorGop>
}

export interface TemaParseado {
  hoja: string
  nombre: string
  area: string | null
  tipo: "GOP" | "Toolkit"
  frecuencia: "mensual" | "bimestral"
  dueno: string | null
  orden: number
  preguntas: PreguntaParseada[]
}

export interface ParseoGops {
  anio: number
  temas: TemaParseado[]
  /** Hojas salteadas o rarezas que conviene mostrarle a quien importa. */
  avisos: string[]
}

/**
 * Catálogo de las hojas conocidas. El nombre del KPI en la hoja 'Resumen' no coincide
 * con el nombre de la hoja ('Inventario' vs 'Inventory Toolkit', 'TLP' vs
 * 'GOP Entrega-Total productivity '), así que el mapeo es explícito en vez de difuso:
 * son 11 filas que cambian una vez al año, y dejarlo escrito evita que un match por
 * palabras le cuelgue el área equivocada a un tema.
 *
 * Una hoja que no esté acá igual se importa (con los datos que se puedan deducir del
 * nombre): perder respuestas en silencio sería peor que un tema mal etiquetado.
 */
const HOJAS_CONOCIDAS: Array<Omit<TemaParseado, "preguntas">> = [
  { hoja: "GOP WQI", nombre: "WQI", area: "Almacén", tipo: "GOP", frecuencia: "mensual", dueno: "Sebastián Roselli", orden: 1 },
  { hoja: "GOP Obsolescencia", nombre: "Obsolescencia", area: "Almacén", tipo: "GOP", frecuencia: "mensual", dueno: "Sebastián Roselli", orden: 2 },
  { hoja: "GOP Total Productivity WH", nombre: "Productividad de almacén", area: "Almacén", tipo: "GOP", frecuencia: "mensual", dueno: "Sebastián Roselli", orden: 3 },
  { hoja: "Inventory Toolkit", nombre: "Inventario", area: "Almacén", tipo: "Toolkit", frecuencia: "mensual", dueno: "Sebastián Roselli", orden: 4 },
  { hoja: "Toolkit Prev. Violencia Nivel 1", nombre: "Prevención de violencia (nivel 1)", area: "Seguridad", tipo: "Toolkit", frecuencia: "mensual", dueno: "Fausto Azzaretti", orden: 5 },
  { hoja: "Toolkit Prev. Violencia Nivel 2", nombre: "Prevención de violencia (nivel 2)", area: "Seguridad", tipo: "Toolkit", frecuencia: "mensual", dueno: "Fausto Azzaretti", orden: 6 },
  { hoja: "Toolkit Seg. Vial Nivel 1", nombre: "Seguridad vial (nivel 1)", area: "Seguridad", tipo: "Toolkit", frecuencia: "mensual", dueno: "Fausto Azzaretti", orden: 7 },
  { hoja: "Toolkit Seg. Vial Nivel 2", nombre: "Seguridad vial (nivel 2)", area: "Seguridad", tipo: "Toolkit", frecuencia: "mensual", dueno: "Fausto Azzaretti", orden: 8 },
  { hoja: "GOP Total Quality Index (DEL)", nombre: "DQI", area: "Entrega", tipo: "GOP", frecuencia: "bimestral", dueno: "Fausto Azzaretti", orden: 9 },
  { hoja: "GOP Entrega-Total productivity ", nombre: "TLP", area: "Entrega", tipo: "GOP", frecuencia: "bimestral", dueno: "Fausto Azzaretti", orden: 10 },
  { hoja: "GOP Combustible", nombre: "Consumo de combustible", area: "Flota", tipo: "GOP", frecuencia: "bimestral", dueno: "Fausto Azzaretti", orden: 11 },
]

/** Hojas que no son temas (resumen, instructivo, calendario). */
const HOJAS_NO_TEMA = ["calendarizacion", "instructivo", "resumen"]

const MESES: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agos: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
}

type Fila = unknown[]

function txt(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v).replace(/\s+/g, " ").trim()
}

/** minúsculas sin acentos, para comparar encabezados y respuestas. */
function norm(v: unknown): string {
  return txt(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function valorDeCelda(v: unknown): ValorGop | null {
  const n = norm(v).replace(/[.\s]/g, "")
  if (n === "si" || n === "yes") return "si"
  if (n === "no") return "no"
  if (n === "na" || n === "n/a") return "na"
  return null
}

/**
 * Código estable de la pregunta, en orden de preferencia:
 * el ID del Excel → el número pegado al texto → un hash del texto.
 * Es la clave con la que se reimporta el mes siguiente sin duplicar nada.
 */
function codigoDePregunta(id: string, texto: string): string {
  if (id && /^[\w.-]+$/.test(id) && !valorDeCelda(id)) return id
  const m = texto.match(/^(\d{1,4})\s*[.-]/)
  if (m) return `n${m[1]}`
  let h = 0
  const base = norm(texto).slice(0, 80)
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0
  return `h${(h >>> 0).toString(36)}`
}

function esFilaDeTotal(texto: string): boolean {
  const n = norm(texto)
  return n.startsWith("puntaje total") || n.startsWith("total kpi") || n.startsWith("puntaje")
}

interface Layout {
  filaHeader: number
  /** columna → mes */
  meses: Map<number, number>
  colTexto: number
  colComentario: number | null
  colId: number | null
  colTema: number | null
}

/** Ubica la fila de encabezado (la que tiene los meses) y deduce el resto de columnas. */
function detectarLayout(filas: Fila[]): Layout | null {
  for (let i = 0; i < Math.min(filas.length, 12); i++) {
    const fila = filas[i] ?? []
    const meses = new Map<number, number>()
    fila.forEach((celda, j) => {
      const mes = MESES[norm(celda)]
      // Un mes repetido (el Resumen tiene Target/REAL) se queda con la primera columna.
      if (mes && ![...meses.values()].includes(mes)) meses.set(j, mes)
    })
    if (meses.size < 6) continue

    const primerMes = Math.min(...meses.keys())
    const encabezados = fila.slice(0, primerMes).map(norm)

    let colTexto = encabezados.findIndex((h) => h === "pregunta" || h === "question")
    let colTema = encabezados.findIndex((h) => h === "tema")
    let colComentario = encabezados.findIndex(
      (h) => h === "comentario" || h === "comentarios" || h === "comment" || h === "comments",
    )

    // Sin encabezados reconocibles: las columnas previas al primer mes son, en orden,
    // pregunta y comentario.
    if (colTexto < 0) colTexto = primerMes > 1 ? 1 : 0
    if (colTema === colTexto) colTema = -1
    if (colComentario === colTexto) colComentario = -1

    // Formato A: la columna a la izquierda de 'Pregunta' trae el ID (su encabezado es
    // un número suelto, no un rótulo).
    const colId = colTexto > 0 && colTema < 0 ? colTexto - 1 : null

    return {
      filaHeader: i,
      meses,
      colTexto,
      colComentario: colComentario >= 0 ? colComentario : null,
      colId,
      colTema: colTema >= 0 ? colTema : null,
    }
  }
  return null
}

function parsearHoja(hoja: string, filas: Fila[]): { preguntas: PreguntaParseada[]; aviso?: string } {
  const layout = detectarLayout(filas)
  if (!layout) return { preguntas: [], aviso: `"${hoja}": no se encontró la fila de meses, se salteó.` }

  const preguntas: PreguntaParseada[] = []
  let seccion: string | null = null
  let orden = 0

  for (let i = layout.filaHeader + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const texto = txt(fila[layout.colTexto])

    const respuestas: Record<number, ValorGop> = {}
    for (const [col, mes] of layout.meses) {
      const v = valorDeCelda(fila[col])
      if (v) respuestas[mes] = v
    }

    // Formato C: la sección viaja en su propia columna y se arrastra hacia abajo.
    if (layout.colTema !== null) {
      const tema = txt(fila[layout.colTema])
      if (tema && !esFilaDeTotal(tema)) seccion = tema
    }

    if (!texto) continue
    if (esFilaDeTotal(texto)) continue

    // Fila sin ninguna respuesta = encabezado de sección (formatos A y B). En A además
    // trae el puntaje del bloque en las columnas de mes, que son números, no Si/No.
    if (Object.keys(respuestas).length === 0) {
      if (layout.colTema === null) seccion = texto
      continue
    }

    orden++
    preguntas.push({
      codigo: codigoDePregunta(txt(layout.colId !== null ? fila[layout.colId] : ""), texto),
      seccion,
      texto,
      comentario: layout.colComentario !== null ? txt(fila[layout.colComentario]) || null : null,
      orden,
      respuestas,
    })
  }

  if (preguntas.length === 0) {
    return { preguntas, aviso: `"${hoja}": no se encontró ninguna pregunta con Si/No/N/A.` }
  }
  return { preguntas }
}

function metadatosDeHoja(hoja: string): Omit<TemaParseado, "preguntas"> {
  const conocida = HOJAS_CONOCIDAS.find((h) => h.hoja.trim() === hoja.trim())
  if (conocida) return { ...conocida, hoja }
  // Hoja nueva: se importa igual, deduciendo lo que se pueda del nombre.
  const esToolkit = /toolkit/i.test(hoja)
  return {
    hoja,
    nombre: hoja.replace(/^(GOP|Toolkit)\s*/i, "").trim() || hoja,
    area: null,
    tipo: esToolkit ? "Toolkit" : "GOP",
    frecuencia: "mensual",
    dueno: null,
    orden: 99,
  }
}

export interface OpcionesParseo {
  /** Año del consolidado. Por defecto se busca en el nombre del archivo. */
  anio?: number
  /**
   * Último mes a importar. El Excel trae septiembre a diciembre precargados con "No"
   * literal (no vacíos): sin este corte, esos meses entran como 154 respuestas negativas
   * y hunden el puntaje de todo el año.
   */
  hastaMes: number
}

export function parsearConsolidadoGops(
  buffer: ArrayBuffer | Buffer,
  nombreArchivo: string,
  opciones: OpcionesParseo,
): ParseoGops {
  const wb = XLSX.read(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer, {
    type: "array",
  })

  const anioNombre = nombreArchivo.match(/20\d{2}/)
  const anio = opciones.anio ?? (anioNombre ? Number(anioNombre[0]) : new Date().getFullYear())
  const hastaMes = Math.min(Math.max(opciones.hastaMes, 1), 12)

  const temas: TemaParseado[] = []
  const avisos: string[] = []

  for (const hoja of wb.SheetNames) {
    const n = norm(hoja)
    if (HOJAS_NO_TEMA.some((h) => n.includes(h))) continue

    const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[hoja], {
      header: 1,
      blankrows: false,
      defval: null,
    })

    const { preguntas, aviso } = parsearHoja(hoja, filas)
    if (aviso) avisos.push(aviso)
    if (preguntas.length === 0) continue

    // Recién acá se descartan los meses futuros: el parseo de la hoja no tiene por qué
    // saber en qué mes estamos.
    for (const p of preguntas) {
      for (const mes of Object.keys(p.respuestas)) {
        if (Number(mes) > hastaMes) delete p.respuestas[Number(mes)]
      }
    }

    temas.push({ ...metadatosDeHoja(hoja), preguntas })
  }

  temas.sort((a, b) => a.orden - b.orden)

  if (temas.length === 0) {
    avisos.push("No se reconoció ninguna hoja de tema en el archivo.")
  }

  return { anio, temas, avisos }
}

/**
 * Puntaje de un tema en un mes: Si / (Si + No), con las N/A fuera del denominador.
 * Es la fórmula del propio Excel — verificado contra la hoja 'Resumen' de agosto 2026:
 * WQI 11/15 = 0,7333 · Inventario 25/30 = 0,8333 · Seguridad vial N1 5/8 = 0,625.
 */
export function puntajeDeRespuestas(valores: ValorGop[]): number | null {
  const cuentan = valores.filter((v) => v !== "na")
  if (cuentan.length === 0) return null
  return cuentan.filter((v) => v === "si").length / cuentan.length
}
