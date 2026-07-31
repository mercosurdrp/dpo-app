/**
 * Sync de movimientos de EQUIPOS DE FRÍO desde Chess, para el SLA
 * Ventas ↔ Logística (`plan_equipos_frio`).
 *
 * Qué trae: los pedidos con `idTipoDocumento` COPOP (entrega del equipo en
 * comodato) y CTRCO (retiro / contracomodato), quedándose sólo con las líneas
 * cuyo artículo es un equipo de frío.
 *
 * 🚨 El equipo NO se detecta por el texto de `desArticulo`. Filtrar por
 * "HELADERA" pierde equipos reales (`M3500 CORONA C/SENSIFY`, `MT 17 PEPSI
 * BLACK`, `EQUIPO ELEC. V-100 UBC GROUP`). Se usan los marcadores del maestro:
 *   • `esActivoFijo === true`  (142 artículos)
 *   • agrupación `TIPO DE MATERIAL POP` ∈ {HELADERA, CHOPP}  (155)
 * La UNIÓN de ambos da 160 artículos; no coinciden entre sí (16 son sólo
 * activo fijo y 18 sólo POP), así que hay que usar la unión.
 *
 * 🚨 La lista de agrupaciones viene en la clave `eAgrupaciones` (no
 * `agrupaciones`) y el fin de paginación de `/articulos/` es una respuesta sin
 * `eArticulos`, no un error explícito.
 */
import https from "https"
import { esPatenteCamion } from "@/lib/sla-cumplimiento"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface ChessCredentials {
  baseUrl: string
  user: string
  pass: string
}

const insecureAgent = new https.Agent({ rejectUnauthorized: false })

function chessFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    // @ts-expect-error Node fetch supports agent option
    agent: insecureAgent,
  })
}

/** Tipos de documento de Chess que mueven un equipo de frío. */
const TIPOS_DOC = new Set(["COPOP", "CTRCO"])

/** Agrupaciones POP que son equipo de frío. */
const POP_FRIO = new Set(["HELADERA", "CHOPP"])

/** Tope de lotes de `/articulos/` (el maestro son ~1550 artículos). */
const MAX_LOTES_ARTICULOS = 60

interface ChessAgrupacion {
  idFormaAgrupar?: string
  desAgrupacion?: string
}

interface ChessArticulo {
  idArticulo?: number
  desArticulo?: string
  esActivoFijo?: boolean
  eAgrupaciones?: ChessAgrupacion[]
}

interface ChessPedidoItem {
  idLineaDetalle?: number
  idArticulo?: number
  cantBultos?: number
  cantUnidades?: number
  anulado?: boolean
}

interface ChessPedido {
  idPedido?: string
  idTipoDocumento?: string
  idCliente?: number
  fechaEntrega?: string
  Reparto?: string
  eliminado?: boolean
  items?: ChessPedidoItem[]
}

export async function chessLogin(creds: ChessCredentials): Promise<string> {
  const resp = await chessFetch(`${creds.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: creds.user, password: creds.pass }),
  })
  if (!resp.ok) throw new Error(`Chess login failed: ${resp.status}`)
  const data = (await resp.json()) as { sessionId?: string }
  if (!data.sessionId) throw new Error("No sessionId from Chess")
  return data.sessionId
}

/** `TIPO DE MATERIAL POP` de un artículo, en mayúsculas. */
function popDe(a: ChessArticulo): string | null {
  const g = (a.eAgrupaciones ?? []).find(
    (x) => x.idFormaAgrupar === "TIPO DE MATERIAL POP",
  )
  return g?.desAgrupacion ? g.desAgrupacion.toUpperCase() : null
}

function esEquipoFrio(a: ChessArticulo): boolean {
  if (a.esActivoFijo === true) return true
  const pop = popDe(a)
  return pop !== null && POP_FRIO.has(pop)
}

/**
 * Maestro de equipos de frío: `idArticulo` → `desArticulo`.
 * 🚨 Chess tira 403 ante llamadas concurrentes: los lotes van SECUENCIALES.
 */
export async function fetchEquiposFrio(
  creds: ChessCredentials,
  sessionId: string,
): Promise<Map<number, string>> {
  const equipos = new Map<number, string>()
  for (let lote = 1; lote <= MAX_LOTES_ARTICULOS; lote++) {
    const r = await chessFetch(`${creds.baseUrl}/articulos/?nroLote=${lote}`, {
      headers: { Accept: "application/json", Cookie: sessionId },
    })
    if (!r.ok) break
    let arts: ChessArticulo[] = []
    try {
      const d = (await r.json()) as {
        Articulos?: { eArticulos?: ChessArticulo[] }
      }
      arts = d?.Articulos?.eArticulos ?? []
    } catch {
      break // fin de paginación: Chess devuelve un cuerpo no parseable
    }
    if (arts.length === 0) break
    for (const a of arts) {
      if (a.idArticulo != null && esEquipoFrio(a)) {
        equipos.set(a.idArticulo, a.desArticulo ?? "")
      }
    }
  }
  return equipos
}

export interface EdfMovimientoRow {
  id_pedido: string
  id_linea: number
  fecha_entrega: string
  tipo_doc: string
  reparto: string | null
  en_camion: boolean
  id_cliente: number | null
  id_articulo: number
  des_articulo: string | null
  cantidad: number
}

/** Movimientos de equipos de frío de una fecha de entrega (YYYY-MM-DD). */
export async function fetchMovimientosDia(
  creds: ChessCredentials,
  sessionId: string,
  fecha: string,
  equipos: Map<number, string>,
): Promise<EdfMovimientoRow[]> {
  const r = await chessFetch(
    `${creds.baseUrl}/pedidos/?fechaEntrega=${fecha}`,
    { headers: { Accept: "application/json", Cookie: sessionId } },
  )
  if (!r.ok) {
    console.warn(`[edf-sync] pedidos ${fecha}: HTTP ${r.status}`)
    return []
  }
  let pedidos: ChessPedido[] = []
  try {
    const d = (await r.json()) as { pedidos?: ChessPedido[] }
    pedidos = d?.pedidos ?? []
  } catch {
    return []
  }

  const filas: EdfMovimientoRow[] = []
  for (const p of pedidos) {
    if (p.eliminado) continue
    const tipo = p.idTipoDocumento ?? ""
    if (!TIPOS_DOC.has(tipo)) continue
    const reparto = (p.Reparto ?? "").trim() || null
    for (const it of p.items ?? []) {
      if (it.anulado) continue
      const idArt = it.idArticulo
      if (idArt == null || !equipos.has(idArt)) continue
      const cantidad = (it.cantBultos ?? 0) + (it.cantUnidades ?? 0)
      if (cantidad <= 0) continue
      filas.push({
        id_pedido: p.idPedido ?? "",
        id_linea: it.idLineaDetalle ?? 0,
        fecha_entrega: p.fechaEntrega ?? fecha,
        tipo_doc: tipo,
        reparto,
        en_camion: esPatenteCamion(reparto),
        id_cliente: p.idCliente ?? null,
        id_articulo: idArt,
        des_articulo: equipos.get(idArt) ?? null,
        cantidad,
      })
    }
  }
  return filas
}

export interface EdfSyncDayResult {
  fecha: string
  movimientos: number
  enCamion: number
  fueraDeVentana: number
}

/**
 * Sincroniza una fecha: trae los movimientos y los upsertea por
 * (id_pedido, id_linea). Idempotente — se puede re-correr sobre el mismo día.
 */
export async function syncEdfForDate(
  supabase: SupabaseClient,
  creds: ChessCredentials,
  sessionId: string,
  fecha: string,
  equipos: Map<number, string>,
): Promise<EdfSyncDayResult> {
  const filas = await fetchMovimientosDia(creds, sessionId, fecha, equipos)
  if (filas.length > 0) {
    const { error } = await supabase
      .from("edf_movimientos")
      .upsert(filas, { onConflict: "id_pedido,id_linea" })
    if (error) throw new Error(`upsert edf_movimientos ${fecha}: ${error.message}`)
  }
  const enCamion = filas.filter((f) => f.en_camion)
  // dow 1..3 = lunes a miércoles (mismo criterio que la columna generada)
  const fuera = enCamion.filter((f) => {
    const dow = new Date(`${f.fecha_entrega}T00:00:00Z`).getUTCDay()
    return dow < 1 || dow > 3
  })
  return {
    fecha,
    movimientos: filas.length,
    enCamion: enCamion.length,
    fueraDeVentana: fuera.length,
  }
}
