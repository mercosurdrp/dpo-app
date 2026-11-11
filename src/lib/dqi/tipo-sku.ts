/**
 * DQI · apertura por tipo de SKU.
 *
 * Pedido de la auditoría (punto 1.4 Entrega): no alcanza con saber CUÁNTO se
 * rompe, hay que ver QUÉ se rompe para encontrar la causa. El tipo de producto
 * explica el mecanismo físico de la rotura: el vidrio retornable se golpea, el
 * PET grande revienta o se pincha, la lata se abolla.
 *
 * Chess no expone envase ni calibre como campo propio (la API REST /articulos
 * sólo trae la agrupación "TIPO DE PRODUCTO"), así que se derivan de la
 * descripción del artículo, que en Mercosur sigue una nomenclatura estable
 * ("PEPSI 70KCAL PET X6 3000CC", "BRAHMA - X12 1000RET#", "CORONA OW X12 710").
 * La familia sale de `chess_articulos.uneg` (pool gerencial Mercosur).
 *
 * Lo que no matchea cae en "Otros" a la vista: nunca se esconde volumen.
 *
 * Archivo sin "use server": acá viven los tipos y constantes que comparten la
 * action y los client components.
 */

export type EnvaseSku =
  | "vidrio_retornable"
  | "vidrio_ow"
  | "pet_retornable"
  | "pet"
  | "lata"
  | "bidon"
  | "otros"

export const ENVASE_SKU_ORDEN: EnvaseSku[] = [
  "vidrio_retornable",
  "vidrio_ow",
  "pet_retornable",
  "pet",
  "lata",
  "bidon",
  "otros",
]

export const ENVASE_SKU_LABEL: Record<EnvaseSku, string> = {
  vidrio_retornable: "Vidrio retornable",
  vidrio_ow: "Vidrio one-way",
  pet_retornable: "PET retornable",
  pet: "PET descartable",
  lata: "Lata",
  bidon: "Bidón",
  otros: "Otros",
}

/** Color por envase (barra apilada / chips). */
export const ENVASE_SKU_COLOR: Record<EnvaseSku, string> = {
  vidrio_retornable: "#b45309",
  vidrio_ow: "#d97706",
  pet_retornable: "#0f766e",
  pet: "#0ea5e9",
  lata: "#6366f1",
  bidon: "#64748b",
  otros: "#a1a1aa",
}

/** Key del nodo del Árbol de KPI (Rechazo) que abre el DQI por envase. */
export function nodoArbolEnvase(envase: EnvaseSku): string {
  return `dqi_${envase}`
}

export type FamiliaSku = "cervezas" | "ung" | "aguas" | "marketplace" | "otros" | "sin_dato"

export const FAMILIA_SKU_LABEL: Record<FamiliaSku, string> = {
  cervezas: "Cervezas",
  ung: "Gaseosas / UNG",
  aguas: "Aguas",
  marketplace: "Marketplace",
  otros: "Otros",
  sin_dato: "Sin dato",
}

export interface TipoSku {
  envase: EnvaseSku
  /** Calibre en cc (null si la descripción no lo trae). */
  calibre_cc: number | null
  /** "1 L", "3 L", "710 cc", "s/d". */
  calibre: string
  familia: FamiliaSku
}

function familiaDe(uneg: string | null | undefined): FamiliaSku {
  const u = (uneg ?? "").toUpperCase().trim()
  if (!u) return "sin_dato"
  if (u.startsWith("CERVEZA")) return "cervezas"
  if (u === "UNG") return "ung"
  if (u.startsWith("AGUA")) return "aguas"
  if (u.startsWith("MARKETPLACE")) return "marketplace"
  return "otros"
}

/** Número con coma o punto decimal. "2.000" con unidad CC = 2000 (miles). */
function num(raw: string, unidad: string): number {
  if (/^\d+\.\d{3}$/.test(raw) && unidad === "CC") return Number(raw.replace(".", ""))
  return Number(raw.replace(",", "."))
}

/** Calibre en cc a partir de la descripción de Chess. */
export function calibreCc(descripcion: string): number | null {
  const d = ` ${descripcion.toUpperCase()} `
  // 0) Fracciones de litro de la nomenclatura vieja: "1/1 BRAHMAX12" (litro),
  //    "1/2LT BRAH 4X6" (medio litro).
  if (/\s1\/1\s/.test(d)) return 1000
  if (/\s1\/2\s?LT?\b/.test(d)) return 500
  // Calibre pegado a LT: "PATAGONIA 24.7 LT473" (24.7 es el nombre, no litros).
  const lt = /\sLT(\d{3})\s/.exec(d)
  if (lt) return Number(lt[1])
  // 1) Explícito con unidad: 473CC, 2.000CC, 1.500L, 6,3L, 1L, 700ML, 2.25L.
  const conUnidad = /(\d+(?:[.,]\d+)?)\s?(CC|ML|LTS|LT|L)(?![A-Z0-9])/.exec(d)
  if (conUnidad) {
    const u = conUnidad[2]
    const v = num(conUnidad[1], u === "ML" ? "CC" : u)
    const cc = u === "CC" || u === "ML" ? v : v * 1000
    if (cc >= 100 && cc <= 30000) return Math.round(cc)
  }
  // 2) Pegado al envase: PET1500, LAT 473, L473, 1000RET, 975V.
  const pegado =
    /PET\s?(\d{3,4})/.exec(d) ??
    /LAT\s?(\d{3})/.exec(d) ??
    /\sL(\d{3})\s/.exec(d) ??
    /\s(\d{3,4})\s?(?:RET|V)/.exec(d) ??
    /\s(\d{3,4})X\d{1,2}\s/.exec(d) ??
    /PET\d\s(\d{3,4})\s/.exec(d)
  if (pegado) return Number(pegado[1])
  // 2b) Litros con decimal y sin unidad: "H2OH 2.25 CIT", "P2.25X8", "ECO S/G 1.5 X6".
  const litros = /[\sP](\d[.,]\d{1,2})(?=[\sX])/.exec(d)
  if (litros) {
    const v = Number(litros[1].replace(",", "."))
    if (v >= 0.2 && v <= 10) return Math.round(v * 1000)
  }
  // 3) Número suelto después del pack (X12 1000, X8 2000 NF, X12 710, 4X6 473).
  const suelto = /X\s?\d{1,2}\s+(\d{3,4})(?![\d.,]*\s?(?:GR|G|BUL|KG))/.exec(d)
  if (suelto) {
    const v = Number(suelto[1])
    if (v >= 150 && v <= 3000) return v
  }
  return null
}

export function etiquetaCalibre(cc: number | null): string {
  if (cc == null) return "s/d"
  if (cc >= 1000) {
    const l = Math.round((cc / 1000) * 100) / 100
    return `${String(l).replace(".", ",")} L`
  }
  return `${cc} cc`
}

const CALIBRES_LATA = new Set([250, 269, 310, 354, 355, 473, 500, 710])

export function envaseDe(descripcion: string, cc: number | null, familia?: FamiliaSku): EnvaseSku {
  const d = ` ${descripcion.toUpperCase()} `
  const has = (re: RegExp) => re.test(d)
  if (has(/BIDON/) || (has(/PET/) && cc != null && cc >= 5000)) return "bidon"
  if (has(/\s(CAN|LAT|LATA|LATON)\s/) || has(/\sLT?\d{3}\s/)) return "lata"
  if (has(/RECO/) || (has(/PET/) && has(/RET/))) return "pet_retornable"
  if (has(/PET/)) return "pet"
  if (has(/\sOW\s/)) return "vidrio_ow"
  if (has(/RET/) || has(/BOTSA|\d{3,4}V/)) return "vidrio_retornable"
  // Sin palabra de envase pero con pack de latas (4X6 / 6X4 / 4X4) y calibre
  // de lata: "PEPSI 70KCAL 4X6 354CC".
  if (has(/\s\dX\d\s/) && cc != null && CALIBRES_LATA.has(cc)) return "lata"
  // Nomenclatura abreviada sin palabra de envase ("P BLACK X8 2250",
  // "H2OH 1.5 CITRUS", "GATOR FTRO X6 500", "1/1 QUIL CLASICA X12"):
  // una bebida de 1,25 a 3 L no retornable es PET; el litro de cerveza por 12
  // es vidrio retornable; gaseosas/aguas sin otra pista, PET.
  if (cc != null && cc >= 1250 && cc < 5000) return "pet"
  if (cc === 1000 && has(/X\s?12/)) return "vidrio_retornable"
  if (cc != null && (familia === "ung" || familia === "aguas")) return "pet"
  return "otros"
}

export function clasificarSku(descripcion: string | null | undefined, uneg: string | null | undefined): TipoSku {
  const desc = descripcion ?? ""
  const cc = calibreCc(desc)
  const familia = familiaDe(uneg)
  return {
    envase: envaseDe(desc, cc, familia),
    calibre_cc: cc,
    calibre: etiquetaCalibre(cc),
    familia,
  }
}

// ===== Tipos del resultado de getDqiPorTipoSku =====

export interface DqiSkuFila {
  codigo: string
  descripcion: string
  tipo: TipoSku
  /** HL rotos en distribución (detalle por SKU del tablero). */
  hl_ruta: number
  /** HL que entraron a reempaque. */
  hl_reempaque: number
  hl_total: number
  unidades_ruta: number
  bultos_reempaque: number
  ppm: number | null
  /** Patentes donde se registró la rotura en ruta. */
  patentes: string[]
  /** Motivos cargados por el chofer en /mis-roturas para este SKU en el mes. */
  motivos_chofer: string[]
}

export interface DqiGrupoCalibre {
  calibre: string
  calibre_cc: number | null
  hl_ruta: number
  hl_reempaque: number
  hl_total: number
  ppm: number | null
  skus: DqiSkuFila[]
}

export interface DqiGrupoEnvase {
  envase: EnvaseSku
  hl_ruta: number
  hl_reempaque: number
  hl_total: number
  ppm: number | null
  /** % del DQI corregido del mes que explica este envase. */
  pct_dqi: number | null
  calibres: DqiGrupoCalibre[]
}

export interface DqiTipoSkuData {
  year: number
  month: number
  /** HL entregados del mes (denominador del DQI). */
  hl_entregados: number | null
  envases: DqiGrupoEnvase[]
  /**
   * Roturas en ruta que el DQI oficial cuenta (`dqi_detalle.hl_mes`) pero que
   * el tablero no publica desglosadas por SKU. Se muestran aparte para que la
   * suma cierre con el DQI corregido, sin inventar a qué SKU pertenecen.
   */
  sin_detalle: { hl: number; ppm: number | null }
  total: {
    hl_ruta: number
    hl_reempaque: number
    hl_total: number
    /** DQI corregido (ruta oficial + reempaque) en PPM. */
    ppm: number | null
  }
}
