/**
 * Lectura del sheet "Novedades Logísticas 2025" (Pampeana) — pedidos FUERA DE RUTA.
 *
 * La logística carga a mano cada novedad en el Google Sheet; de ahí salen las
 * filas con NOVEDAD = 'FUERA DE RUTA', que son pedidos que se entregan fuera
 * del recorrido planificado (con quién lo autorizó en DESCRIPCIÓN/OBSERVACIONES).
 *
 * El sheet está compartido "cualquiera con el enlace: lector", así que el export
 * CSV server-side funciona sin credenciales. 🚨 El export respeta los filtros
 * BÁSICOS visibles de la pestaña: si alguien deja un filtro puesto, llegan solo
 * las filas filtradas (por eso el snapshot en `fuera_ruta_registros` nunca borra).
 */

const SHEET_ID = "1Im_mJOsHqSjtmXju-qD8lIUYoqkHKhQvucZRR57bIw8"
const GID_NOVEDADES = "1772554169"
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID_NOVEDADES}`

export interface FueraRutaFila {
  /** Identidad estable: fecha|nro_pedido|cod_cliente. */
  clave: string
  fecha_entrega: string // YYYY-MM-DD
  sucursal: string | null
  deposito: string | null
  cod_cliente: number | null
  cliente: string | null
  comprobante: string | null
  nro_pedido: string | null
  tipo_comprobante: string | null
  monto: number | null
  localidad: string | null
  bultos: number | null
  descripcion: string | null
  cod_cliente_entregado: number | null
  cliente_entregado: string | null
  direccion_entrega: string | null
  localidad_entrega: string | null
  observaciones: string | null
  patente: string | null
  canal: string | null
}

/** Parser CSV RFC4180: campos entre comillas pueden traer comas, saltos de línea y "". */
export function parseCsv(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ""
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ }
        else entreComillas = false
      } else campo += c
    } else if (c === '"') {
      entreComillas = true
    } else if (c === ",") {
      fila.push(campo); campo = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++
      fila.push(campo); campo = ""
      filas.push(fila); fila = []
    } else campo += c
  }
  if (campo !== "" || fila.length > 0) { fila.push(campo); filas.push(fila) }
  return filas
}

/** "18/07/2026" o "4/10/2025" → "2026-07-18". null si no parsea a una fecha real. */
export function parseFechaSheet(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mes, y] = m
  const dia = Number(d), mm = Number(mes)
  if (mm < 1 || mm > 12 || dia < 1 || dia > 31) return null
  return `${y}-${String(mm).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

/** " $126.010,78" → 126010.78 (formato es-AR del sheet). */
export function parseMontoSheet(s: string): number | null {
  const limpio = s.replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".")
  if (!limpio) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

function texto(v: string | undefined): string | null {
  const t = (v ?? "").trim()
  return t || null
}

function entero(v: string | undefined): number | null {
  const t = (v ?? "").trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/**
 * Baja la pestaña de novedades y devuelve SOLO las filas FUERA DE RUTA,
 * normalizadas y dedupeadas por clave (si el sheet repite la fila, gana la última).
 * Tira si el sheet no responde o dejó de estar compartido (el caller decide el fallback).
 */
export async function fetchFueraRutaSheet(): Promise<FueraRutaFila[]> {
  const res = await fetch(CSV_URL, { cache: "no-store", redirect: "follow" })
  if (!res.ok) throw new Error(`Sheet de novedades: HTTP ${res.status}`)
  const cuerpo = await res.text()
  // Si el sheet vuelve a "Restringido", Google devuelve 200 con su página de login.
  if (cuerpo.trimStart().startsWith("<")) {
    throw new Error("El sheet de novedades dejó de estar compartido (pide login de Google).")
  }

  const [encabezado, ...filas] = parseCsv(cuerpo)
  if (!encabezado) return []
  // Índice por nombre de columna: si en el sheet agregan/mueven columnas, seguimos leyendo bien.
  const col = new Map(encabezado.map((h, i) => [h.replace(/\s+/g, " ").trim().toUpperCase(), i]))
  const idx = (nombre: string) => col.get(nombre) ?? -1
  const iFecha = idx("FECHA")
  const iNovedad = idx("NOVEDAD")
  if (iFecha < 0 || iNovedad < 0) {
    throw new Error("El sheet de novedades cambió: no encuentro las columnas FECHA/NOVEDAD.")
  }
  const campo = (f: string[], nombre: string) => {
    const i = idx(nombre)
    return i >= 0 ? f[i] : undefined
  }

  const porClave = new Map<string, FueraRutaFila>()
  for (const f of filas) {
    if ((campo(f, "NOVEDAD") ?? "").trim().toUpperCase() !== "FUERA DE RUTA") continue
    const fecha = parseFechaSheet(f[iFecha] ?? "")
    if (!fecha) continue
    const nroPedido = texto(campo(f, "NÚMERO PEDIDO EN CASO DE FACTURA"))
    const codCliente = entero(campo(f, "COD. CLI FACTURADO"))
    const fila: FueraRutaFila = {
      clave: `${fecha}|${nroPedido ?? ""}|${codCliente ?? ""}`,
      fecha_entrega: fecha,
      sucursal: texto(campo(f, "SUCURSAL")),
      deposito: texto(campo(f, "DEPOSITO")),
      cod_cliente: codCliente,
      cliente: texto(campo(f, "CLIENTE FACT.")),
      comprobante: texto(campo(f, "COMPROBANTE")),
      nro_pedido: nroPedido,
      tipo_comprobante: texto(campo(f, "TIPO DE COMPROBANTE")),
      monto: parseMontoSheet(campo(f, "MONTO TOTAL") ?? ""),
      localidad: texto(campo(f, "LOCALIDAD FACTURADO")),
      bultos: parseMontoSheet(campo(f, "BULTOS") ?? ""),
      descripcion: texto(campo(f, "DESCRIPCIÓN")),
      cod_cliente_entregado: entero(campo(f, "COD. CLIENTE ENTREGADO")),
      cliente_entregado: texto(campo(f, "CLIENTE ENTR.")),
      direccion_entrega: texto(campo(f, "DIRECCION ENTREGA")),
      localidad_entrega: texto(campo(f, "LOCALIDAD ENTREGA")),
      observaciones: texto(campo(f, "OBSERVACIONES")),
      patente: texto(campo(f, "PATENTE")),
      canal: texto(campo(f, "CANAL")),
    }
    porClave.set(fila.clave, fila)
  }
  return [...porClave.values()]
}
