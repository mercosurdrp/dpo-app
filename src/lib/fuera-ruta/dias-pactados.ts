/**
 * Día de entrega PACTADO de cada cliente, desde el maestro de clientes de Chess.
 *
 * Es el insumo del criterio de FUERA DE RUTA vigente desde el 16/10/2026: un
 * pedido que se entrega un día que no es uno de los días pactados del cliente
 * está fuera de su ruta. El dato vive en la fuerza de ventas PRE vigente del
 * cliente (`eClifuerza[].diasEntrega`, en numeración Chess Dom=1..Sáb=7).
 *
 * 🚨 Bajar el maestro completo (~2.300 clientes, 24 lotes) tarda ~10 s, así
 * que se guarda como foto en `indicadores_fotos` (misma mecánica que el Cuadro
 * mensual) y se renueva una vez por día desde el cron de fuera de ruta. Leer
 * la foto es instantáneo; si no hay ninguna, la primera apertura la calcula.
 *
 * Unos 200 clientes (8 %) no tienen día pactado cargado en Chess: a esos no se
 * los puede evaluar y quedan fuera del criterio (no son fuera de ruta ni dejan
 * de serlo; simplemente no hay contra qué comparar).
 */
import { chessLogin, fetchAllClientes, type ChessCliente, type ChessCredentials } from "@/lib/wa-bot/chess"
import { parseChessDiasToIso } from "@/lib/sync/fueras-ruta-sync"
import { leerFoto, guardarFoto, fotoVencida } from "@/lib/fotos"

export const CLAVE_FOTO_DIAS_PACTADOS = "fuera-ruta-dias-pactados"

/** La foto vale un día: los días pactados cambian con las revisiones de ruta, no a diario. */
const MAX_EDAD_MS = 26 * 60 * 60 * 1000

export interface ClientePactado {
  /** Días de entrega pactados, ISO 1=Lun..7=Dom. Vacío = sin dato en Chess. */
  dias: number[]
  nombre: string | null
  localidad: string | null
  canal: string | null
  direccion: string | null
}

/** id_cliente → datos pactados. Serializable (va a la foto). */
export type MapaDiasPactados = Record<string, ClientePactado>

export const NOMBRE_DIA_ISO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const

/** [1,4] → "Lun · Jue" */
export function nombrarDias(dias: number[]): string {
  return dias.map((d) => NOMBRE_DIA_ISO[d] ?? String(d)).join(" · ")
}

/** Día ISO (1=Lun..7=Dom) de una fecha YYYY-MM-DD. */
export function diaIso(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

export function credencialesChess(): ChessCredentials {
  const baseUrl = process.env.CHESS_API_BASE_URL
  const user = process.env.CHESS_API_USER
  const pass = process.env.CHESS_API_PASS
  if (!baseUrl || !user || !pass) throw new Error("Faltan credenciales de Chess (CHESS_API_*)")
  return { baseUrl, user, pass }
}

interface FuerzaLoose {
  idModoAtencion?: string | number | null
  anulado?: string | boolean | null
  fechaInicioFuerza?: string | null
  fechaFinFuerza?: string | null
  diasEntrega?: string | number[] | null
}

/**
 * Fuerza PRE vigente del cliente. En Pampeana Chess cierra las fuerzas viejas
 * con `fechaFinFuerza` (la vigente trae 9999-12-31); si hubiera más de una
 * abierta gana la de inicio más reciente, que es la que muestra la UI de Chess.
 */
export function fuerzaPreVigente(c: ChessCliente, hoy: string): FuerzaLoose | null {
  const fuerzas = (c.eClifuerza ?? []) as FuerzaLoose[]
  const vigentes = fuerzas.filter((f) => {
    if (String(f.anulado ?? "").toLowerCase() === "true") return false
    if (String(f.idModoAtencion ?? "PRE").toUpperCase() !== "PRE") return false
    const fin = String(f.fechaFinFuerza ?? "")
    return !fin || fin >= hoy
  })
  if (vigentes.length === 0) return null
  vigentes.sort((a, b) => String(b.fechaInicioFuerza ?? "").localeCompare(String(a.fechaInicioFuerza ?? "")))
  return vigentes[0]
}

function nombreCliente(c: ChessCliente): string | null {
  const vivo = (a: { anulado?: string | boolean }) => String(a.anulado ?? "").toLowerCase() !== "true"
  return (
    c.eClialias?.find((a) => a.idAlias != null && a.idAlias === c.idAliasVigente && vivo(a))?.razonSocial ??
    c.eClialias?.find(vivo)?.razonSocial ??
    c.eClialias?.[0]?.razonSocial ??
    null
  )
}

function direccionCliente(c: ChessCliente): string | null {
  const calle = String(c.calleEntrega ?? "").trim()
  const altura = String(c.alturaEntrega ?? "").trim()
  const dir = [calle, altura].filter(Boolean).join(" ")
  return dir || null
}

/** Baja el maestro de Chess y arma el mapa. ~10 s. */
export async function calcularDiasPactados(hoy: string): Promise<MapaDiasPactados> {
  const creds = credencialesChess()
  const sessionId = await chessLogin(creds)
  const clientes = await fetchAllClientes(creds, sessionId)
  const mapa: MapaDiasPactados = {}
  for (const c of clientes) {
    const f = fuerzaPreVigente(c, hoy)
    mapa[String(c.idCliente)] = {
      dias: f ? parseChessDiasToIso(f.diasEntrega) : [],
      nombre: nombreCliente(c),
      localidad: c.desLocalidad ?? null,
      canal: c.desCanalMkt ?? null,
      direccion: direccionCliente(c),
    }
  }
  return mapa
}

/**
 * Mapa de días pactados desde la foto. Si no hay foto, calcula y guarda (la
 * primera apertura paga los 10 s). Si la foto está vencida igual se usa: la
 * renueva el cron, no el usuario que abre la pantalla.
 */
export async function getDiasPactados(hoy: string): Promise<{ mapa: MapaDiasPactados; generadoEn: string }> {
  const foto = await leerFoto<MapaDiasPactados>(CLAVE_FOTO_DIAS_PACTADOS)
  if (foto && foto.datos && Object.keys(foto.datos).length > 0) {
    return { mapa: foto.datos, generadoEn: foto.generadoEn }
  }
  return renovarDiasPactados(hoy)
}

/** Recalcula desde Chess y pisa la foto. Para el cron (y para la primera vez). */
export async function renovarDiasPactados(hoy: string): Promise<{ mapa: MapaDiasPactados; generadoEn: string }> {
  const t0 = Date.now()
  const mapa = await calcularDiasPactados(hoy)
  await guardarFoto(CLAVE_FOTO_DIAS_PACTADOS, mapa, Date.now() - t0, "fuera-ruta")
  return { mapa, generadoEn: new Date().toISOString() }
}

export async function diasPactadosVencidos(): Promise<boolean> {
  const foto = await leerFoto<MapaDiasPactados>(CLAVE_FOTO_DIAS_PACTADOS)
  return !foto || fotoVencida(foto.generadoEn, MAX_EDAD_MS)
}
