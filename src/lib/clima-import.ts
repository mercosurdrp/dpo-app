/**
 * Parser del export crudo de la Encuesta de Clima.
 *
 * La consultora entrega UN archivo por año calendario (`CLIMA 2026.xlsx` = ola
 * H1 2026) con las dos razones sociales del grupo mezcladas en las mismas
 * hojas: cada columna viene prefijada con la razón social. Cada app importa
 * solo la suya (`EMPRESA_RAZON_SOCIAL_CLIMA`).
 *
 * Todo lo que se guarda es el valor PUBLICADO. Nada se recalcula: el Índice de
 * Engagement lo calcula la herramienta sobre respuestas individuales y no es el
 * promedio de sus cuatro preguntas.
 */
import * as XLSX from "xlsx"

/** Corte publicado por razón social vs. corte publicado solo a nivel grupo. */
export type ClimaAmbito = "empresa" | "grupo"
export type ClimaCorteTipo =
  | "total"
  | "sector"
  | "posicion"
  | "jefe"
  | "genero"

export interface ClimaResultadoRow {
  ambito: ClimaAmbito
  corte_tipo: ClimaCorteTipo
  corte: string
  dimension: string
  /** '' = el valor es el de la dimensión. */
  pregunta: string
  valor: number
}

export interface ClimaComentarioRow {
  corte_tipo: "total" | "jefe"
  corte: string
  pregunta: string
  respuesta: string
}

export interface ClimaParseResult {
  resultados: ClimaResultadoRow[]
  comentarios: ClimaComentarioRow[]
  /** Nómina de jefes de la razón social, como la escribe la planilla. */
  jefes: string[]
  /** Hojas que no se encontraron: se informan en vez de fallar en silencio. */
  faltantes: string[]
}

/** En las hojas por distribuidora, esta columna es el total de la empresa. */
const COL_TOTAL_EMPRESA = "GRUPO MERCOSUR"

type Matriz = unknown[][]

function texto(v: unknown): string {
  return v == null ? "" : String(v).trim()
}

/** Los valores vienen 0–100 con decimales; se publican redondeados. */
function numero(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * Los nombres de hoja llegan truncados a 31 caracteres y varios comparten
 * prefijo ("Rdos por pregunta - Total" vs "Rdos por pregunta - Total por J"):
 * primero se busca el nombre exacto y recién después por prefijo.
 */
function hoja(wb: XLSX.WorkBook, prefijo: string): Matriz | null {
  const nombre =
    wb.SheetNames.find((s) => s === prefijo) ??
    wb.SheetNames.find((s) => s.startsWith(prefijo))
  if (!nombre) return null
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], {
    header: 1,
    blankrows: false,
    defval: null,
  }) as Matriz
}

/** {índice de columna: etiqueta} de las columnas de la razón social. */
function columnasDeLaEmpresa(
  fila: unknown[],
  razonSocial: string,
): Map<number, string> {
  const out = new Map<number, string>()
  fila.forEach((celda, i) => {
    const h = texto(celda)
    if (h.startsWith(razonSocial)) {
      out.set(i, h.slice(razonSocial.length).trim())
    }
  })
  return out
}

/** "BARGAS, RONALDO DANIEL. DNI: 34477993" -> "BARGAS, RONALDO DANIEL" */
function nombreJefe(etiqueta: string): string {
  return etiqueta.split(". DNI")[0].trim()
}

/**
 * Bloques de la hoja "…- Total": la primera fila rotula dónde empieza cada
 * corte (GRUPO_DEL_DISTRIBUIDOR, SECTOR, POSICION) y la segunda trae los
 * nombres de columna. Devuelve solo las columnas del bloque pedido.
 */
function columnasDelBloque(
  filaBloques: unknown[],
  filaHeaders: unknown[],
  bloque: string,
): Map<number, string> {
  const inicios: Array<{ idx: number; nombre: string }> = []
  filaBloques.forEach((celda, i) => {
    const t = texto(celda)
    if (t) inicios.push({ idx: i, nombre: t })
  })

  const pos = inicios.findIndex((b) => b.nombre === bloque)
  if (pos === -1) return new Map()

  const desde = inicios[pos].idx
  const hasta = pos + 1 < inicios.length ? inicios[pos + 1].idx : Infinity

  const out = new Map<number, string>()
  filaHeaders.forEach((celda, i) => {
    const h = texto(celda)
    if (h && i >= desde && i < hasta) out.set(i, h)
  })
  return out
}

export function parseClimaWorkbook(
  buffer: ArrayBuffer | Buffer,
  razonSocial: string,
): ClimaParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const resultados: ClimaResultadoRow[] = []
  const comentarios: ClimaComentarioRow[] = []
  const faltantes: string[] = []
  const jefes = new Set<string>()

  const push = (r: ClimaResultadoRow) => {
    if (!r.dimension || !r.corte) return
    resultados.push(r)
  }

  // ---------- por razón social: total, sector, posición y género ----------
  // Header en la fila 2; la fila 1 rotula en qué bloque cae cada columna
  // (GRUPO_DEL_DISTRIBUIDOR · SECTOR · POSICION · GENERO). Los cuatro cortes
  // vienen prefijados con la razón social, así que son propios de la empresa.
  for (const [prefijo, conPregunta] of [
    ["Rdos por dimension - Por distri", false],
    ["Rdos por pregunta - Por distrib", true],
  ] as const) {
    const m = hoja(wb, prefijo)
    if (!m) {
      faltantes.push(prefijo)
      continue
    }
    const bloques: Array<[string, ClimaCorteTipo]> = [
      ["GRUPO_DEL_DISTRIBUIDOR", "total"],
      ["SECTOR", "sector"],
      ["POSICION", "posicion"],
      ["GENERO", "genero"],
    ]
    for (const [bloque, corteTipo] of bloques) {
      const cols = columnasDelBloque(m[0] ?? [], m[1] ?? [], bloque)
      const mias = columnasDeLaEmpresa(m[1] ?? [], razonSocial)
      for (const fila of m.slice(2)) {
        const dimension = texto(fila[0])
        const pregunta = conPregunta ? texto(fila[1]) : ""
        if (!dimension) continue
        if (conPregunta && !pregunta) continue
        for (const [i, etiqueta] of mias) {
          if (!cols.has(i)) continue
          const valor = numero(fila[i])
          if (valor == null) continue
          push({
            ambito: "empresa",
            corte_tipo: corteTipo,
            corte: etiqueta === COL_TOTAL_EMPRESA ? "TOTAL" : etiqueta,
            dimension,
            pregunta,
            valor,
          })
        }
      }
    }
  }

  // ---------- dimensiones y preguntas, por jefe de la razón social ----------
  // Header en la fila 1.
  for (const [prefijo, conPregunta] of [
    ["Rdos por dimension - Por Jefe", false],
    ["Rdos por pregunta - Por Jefe", true],
  ] as const) {
    const m = hoja(wb, prefijo)
    if (!m) {
      faltantes.push(prefijo)
      continue
    }
    const cols = columnasDeLaEmpresa(m[0] ?? [], razonSocial)
    for (const [, etiqueta] of cols) jefes.add(nombreJefe(etiqueta))
    for (const fila of m.slice(1)) {
      const dimension = texto(fila[0])
      const pregunta = conPregunta ? texto(fila[1]) : ""
      if (!dimension) continue
      if (conPregunta && !pregunta) continue
      for (const [i, etiqueta] of cols) {
        const valor = numero(fila[i])
        if (valor == null) continue
        push({
          ambito: "empresa",
          corte_tipo: "jefe",
          corte: nombreJefe(etiqueta),
          dimension,
          pregunta,
          valor,
        })
      }
    }
  }

  // Las hojas "…- Total" (sin razón social) mezclan las dos empresas del grupo:
  // no se importan. Todo lo que se guarda es del propio distribuidor.

  // ---------- respuestas de texto por distribuidora ----------
  {
    const prefijo = "Respuestas de texto - Por distr"
    const m = hoja(wb, prefijo)
    if (!m) {
      faltantes.push(prefijo)
    } else {
      for (const fila of m.slice(1)) {
        if (texto(fila[1]) !== razonSocial) continue
        const pregunta = texto(fila[2])
        const respuesta = texto(fila[3])
        if (!pregunta || !respuesta) continue
        comentarios.push({
          corte_tipo: "total",
          corte: "TOTAL",
          pregunta,
          respuesta,
        })
      }
    }
  }

  // ---------- respuestas de texto por jefe ----------
  // Esta hoja NO trae la razón social: se filtra por la nómina de jefes que sí
  // viene prefijada en las hojas de resultados.
  {
    const prefijo = "Respuestas de texto - Por jefe"
    const m = hoja(wb, prefijo)
    if (!m) {
      faltantes.push(prefijo)
    } else {
      for (const fila of m.slice(1)) {
        const jefe = nombreJefe(texto(fila[1]))
        if (!jefes.has(jefe)) continue
        const pregunta = texto(fila[2])
        const respuesta = texto(fila[3])
        if (!pregunta || !respuesta) continue
        comentarios.push({
          corte_tipo: "jefe",
          corte: jefe,
          pregunta,
          respuesta,
        })
      }
    }
  }

  return {
    resultados,
    comentarios,
    jefes: [...jefes].sort(),
    faltantes,
  }
}

/** 'CLIMA 2026.xlsx' -> el año; la ola la elige quien importa. */
export function anioDelNombre(nombre: string): number | null {
  const m = nombre.match(/(20\d{2})/)
  return m ? Number(m[1]) : null
}
