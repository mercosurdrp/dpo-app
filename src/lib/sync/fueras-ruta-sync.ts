/**
 * Sync core del indicador "Fueras de Ruta" (Misiones).
 *
 * Snapshotea desde Chess (AR1121) tres entidades:
 *   1) Maestro de rutas con sus días de visita (filtrado a fuerza PRE vigente).
 *   2) Clientes con su ruta PRE vigente asignada.
 *   3) Pedidos del rango [desde, hasta] (consulta día por día contra
 *      /pedidos/?fechaEntrega=YYYY-MM-DD).
 *
 * El cruce contra los días planificados de la ruta se hace en la vista
 * `v_fueras_de_ruta_misiones` (ver APLICAR_EN_MISIONES_FUERAS_RUTA.sql).
 *
 * Idempotente por rango: cada corrida borra los pedidos del rango antes
 * de re-insertar (asociados al run_id), así re-sincronizar el mismo período
 * no acumula.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { chessLogin, type ChessCredentials } from "@/lib/sync/rechazos-sync"
import {
  fetchAllClientes,
  fetchPedidosByFechaEntrega,
  type ChessCliente,
  type ChessPedido,
} from "@/lib/wa-bot/chess"
import https from "node:https"

// ───────────────────────── Tipos extendidos para /rutasVenta/ ─────────────────────────
// El cliente del wa-bot define un tipo "mínimo". Acá enriquecemos con los
// campos que necesita Fueras de Ruta. Chess es flexible con los tipos, los
// strings vs numbers vs arrays varían entre ambientes — tipamos defensivo.

export interface ChessRutaVentaFull {
  idRuta: number
  desRuta?: string | null
  idPersonal?: number | null
  desPersonal?: string | null
  idModoAtencion?: string | number | null
  diasVisita?: number[] | string | null
  anulado?: string | boolean | null
  fechaHasta?: string | null
  fechaInicioFuerza?: string | null
}

// Tipo independiente (no extiende ChessClienteFuerza del wa-bot porque ese
// tipa idModoAtencion como number, pero Chess en la práctica devuelve string
// 'PRE'/'TEL'/'MER'). Tipamos defensivo y normalizamos al usarlo.
interface ChessClienteFuerzaLoose {
  idRuta: number
  idModoAtencion?: string | number | null
  anulado?: string | boolean | null
  fechaInicioFuerza?: string | null
  fechaHasta?: string | null
}

// ───────────────────────── Util ─────────────────────────

const insecureAgent = new https.Agent({ rejectUnauthorized: false })
function chessFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    // @ts-expect-error Node fetch supports agent option
    agent: insecureAgent,
  })
}

/**
 * Chess weekday → ISO weekday (1=Lun..7=Dom).
 * Mapeo Chess: Lun=2, Mar=3, Mié=4, Jue=5, Vie=6, Sáb=7, Dom=1.
 * Equivalencia: iso = (chess === 1) ? 7 : chess - 1.
 * Acepta arrays, CSV strings, o cualquier shape; descarta valores fuera de 1-7.
 */
export function parseDiasVisitaToIso(input: unknown): number[] {
  const raw: number[] = []
  if (Array.isArray(input)) {
    for (const v of input) {
      const n = Number(v)
      if (Number.isFinite(n)) raw.push(n)
    }
  } else if (typeof input === "string" && input.trim()) {
    for (const part of input.split(/[,\s;]+/)) {
      const n = Number(part)
      if (Number.isFinite(n)) raw.push(n)
    }
  }
  const iso = new Set<number>()
  for (const n of raw) {
    if (n < 1 || n > 7) continue
    iso.add(n === 1 ? 7 : n - 1)
  }
  return Array.from(iso).sort((a, b) => a - b)
}

/** Devuelve la fuerza PRE vigente del cliente, o null si no tiene. */
export function pickFuerzaPreVigente(c: ChessCliente): ChessClienteFuerzaLoose | null {
  const fuerzas = (c.eClifuerza ?? []) as ChessClienteFuerzaLoose[]
  for (const f of fuerzas) {
    if (String(f.anulado ?? "").toLowerCase() === "true") continue
    const modo = String(f.idModoAtencion ?? "").toUpperCase()
    if (modo && modo !== "PRE") continue
    // fechaHasta vigente: vacía o empieza con 9999
    const hasta = String(f.fechaHasta ?? "")
    if (hasta && !hasta.startsWith("9999")) continue
    return f
  }
  return null
}

/** Trae el maestro de rutas con campos completos (incluye diasVisita). */
async function fetchRutasFull(
  creds: ChessCredentials,
  sessionId: string,
): Promise<ChessRutaVentaFull[]> {
  const url = `${creds.baseUrl}/rutasVenta/?anulada=false`
  const r = await chessFetch(url, {
    headers: { Accept: "application/json", Cookie: sessionId },
  })
  if (!r.ok) throw new Error(`Chess GET /rutasVenta: ${r.status}`)
  const d = (await r.json()) as { RutasVenta?: { eRutasVenta?: ChessRutaVentaFull[] } }
  return d?.RutasVenta?.eRutasVenta ?? []
}

// ───────────────────────── Sync principal ─────────────────────────

export interface SyncFuerasRutaInput {
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD
  triggeredBy?: string | null
}

export interface SyncFuerasRutaResult {
  runId: string
  rutas: { total: number; preVigentes: number }
  clientes: { total: number; conRutaPre: number; sinRutaPre: number }
  pedidos: {
    diasConsultados: number
    pedidosInsertados: number
    itemsTotal: number
    itemsNoAnulados: number
  }
  ms: number
}

function* iterDays(desde: string, hasta: string): Generator<string> {
  const start = new Date(desde + "T00:00:00Z")
  const end = new Date(hasta + "T00:00:00Z")
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10)
  }
}

function getChessCreds(): ChessCredentials {
  const baseUrl = process.env.CHESS_API_BASE_URL
  const user = process.env.CHESS_API_USER
  const pass = process.env.CHESS_API_PASS
  if (!baseUrl || !user || !pass) {
    throw new Error(
      "Faltan variables de entorno CHESS_API_BASE_URL / CHESS_API_USER / CHESS_API_PASS",
    )
  }
  return { baseUrl, user, pass }
}

/**
 * Ejecuta el sync end-to-end. Recibe un cliente Supabase con privilegios
 * service_role (usar createAdminClient()). El caller debe haber validado
 * permisos antes de llamar.
 */
export async function runFuerasRutaSync(
  input: SyncFuerasRutaInput,
  supabase: SupabaseClient,
): Promise<SyncFuerasRutaResult> {
  const t0 = Date.now()
  const creds = getChessCreds()

  const { data: runRow, error: errRun } = await supabase
    .from("chess_sync_runs_misiones")
    .insert({
      modulo: "fueras_de_ruta",
      desde: input.desde,
      hasta: input.hasta,
      status: "running",
      triggered_by: input.triggeredBy ?? null,
    })
    .select("id")
    .single()
  if (errRun || !runRow) throw new Error(`No se pudo crear sync_run: ${errRun?.message}`)
  const runId = runRow.id as string

  try {
    const sessionId = await chessLogin(creds)

    // ── 1) Rutas
    const rutasAll = await fetchRutasFull(creds, sessionId)
    const rutasPre: ChessRutaVentaFull[] = []
    for (const r of rutasAll) {
      if (String(r.anulado ?? "").toLowerCase() === "true") continue
      const modo = String(r.idModoAtencion ?? "").toUpperCase()
      if (modo && modo !== "PRE") continue
      const hasta = String(r.fechaHasta ?? "")
      if (hasta && !hasta.startsWith("9999")) continue
      rutasPre.push(r)
    }
    if (rutasPre.length > 0) {
      const rows = rutasPre.map((r) => ({
        id_ruta: r.idRuta,
        des_ruta: r.desRuta ?? null,
        id_personal: r.idPersonal ?? null,
        des_personal: r.desPersonal ?? null,
        id_modo_atencion: r.idModoAtencion == null ? null : String(r.idModoAtencion),
        dias_visita_iso: parseDiasVisitaToIso(r.diasVisita),
        anulado: false,
        synced_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from("chess_rutas_misiones")
        .upsert(rows, { onConflict: "id_ruta" })
      if (error) throw new Error(`upsert rutas: ${error.message}`)
    }

    // ── 2) Clientes
    const clientesAll = await fetchAllClientes(creds, sessionId)
    let conRutaPre = 0
    let sinRutaPre = 0
    const clientesRows: Array<Record<string, unknown>> = []
    for (const c of clientesAll) {
      const f = pickFuerzaPreVigente(c)
      const idRuta = f?.idRuta ?? null
      if (idRuta) conRutaPre++
      else sinRutaPre++
      const razon = c.eClialias?.find((a) => String(a.anulado ?? "").toLowerCase() !== "true")?.razonSocial
        ?? c.eClialias?.[0]?.razonSocial
        ?? null
      clientesRows.push({
        id_cliente: c.idCliente,
        id_ruta: idRuta,
        fecha_inicio_fuerza: f?.fechaInicioFuerza
          ? f.fechaInicioFuerza.slice(0, 10)
          : null,
        razon_social: razon,
        des_canal_mkt: c.desCanalMkt ?? null,
        des_localidad: c.desLocalidad ?? null,
        calle_entrega: c.calleEntrega ?? null,
        altura_entrega:
          c.alturaEntrega == null ? null : String(c.alturaEntrega),
        synced_at: new Date().toISOString(),
      })
    }
    // Upsert en lotes de 1000 (límite seguro para PostgREST)
    for (let i = 0; i < clientesRows.length; i += 1000) {
      const slice = clientesRows.slice(i, i + 1000)
      const { error } = await supabase
        .from("chess_clientes_ruta_misiones")
        .upsert(slice, { onConflict: "id_cliente" })
      if (error) throw new Error(`upsert clientes: ${error.message}`)
    }

    // ── 3) Pedidos del rango: DELETE previo del rango + INSERT día por día
    const { error: errDel } = await supabase
      .from("chess_pedidos_misiones")
      .delete()
      .gte("fecha_entrega", input.desde)
      .lte("fecha_entrega", input.hasta)
    if (errDel) throw new Error(`delete pedidos previos: ${errDel.message}`)

    let diasConsultados = 0
    let pedidosInsertados = 0
    let itemsTotal = 0
    let itemsNoAnulados = 0

    for (const fecha of iterDays(input.desde, input.hasta)) {
      diasConsultados++
      const pedidos = await fetchPedidosByFechaEntrega(creds, sessionId, fecha)

      // Agregar por id_cliente: Chess puede devolver varios pedidos del mismo
      // cliente para una fecha; los consolidamos.
      const porCliente = new Map<number, {
        eliminado: boolean
        id_deposito: number | null
        items_total: number
        items_no_anulados: number
        unidades_total: number
        monto_aprox: number
      }>()

      for (const p of pedidos as ChessPedido[]) {
        const idCli = Number(p.idCliente)
        if (!Number.isFinite(idCli) || idCli <= 0) continue
        const elim = String(p.eliminado ?? "").toLowerCase() === "true"

        let agg = porCliente.get(idCli)
        if (!agg) {
          agg = {
            eliminado: elim,
            id_deposito: p.idDeposito ?? null,
            items_total: 0,
            items_no_anulados: 0,
            unidades_total: 0,
            monto_aprox: 0,
          }
          porCliente.set(idCli, agg)
        } else {
          // Si CUALQUIER pedido del cliente para la fecha NO está eliminado, marcamos no eliminado.
          if (!elim) agg.eliminado = false
        }

        for (const it of p.items ?? []) {
          agg.items_total++
          const anul = String(it.anulado ?? "").toLowerCase() === "true"
          if (!anul) {
            agg.items_no_anulados++
            const u = Math.abs(Number(it.cantUnidades) || 0)
            const b = Math.abs(Number(it.cantBultos) || 0)
            const precio = Math.abs(Number(it.precioUnitario) || 0)
            agg.unidades_total += u
            agg.monto_aprox += (u || b) * precio
          }
        }
      }

      itemsTotal += Array.from(porCliente.values()).reduce((s, v) => s + v.items_total, 0)
      itemsNoAnulados += Array.from(porCliente.values()).reduce((s, v) => s + v.items_no_anulados, 0)

      const rows = Array.from(porCliente.entries()).map(([id_cliente, v]) => ({
        id_cliente,
        fecha_entrega: fecha,
        eliminado: v.eliminado,
        id_deposito: v.id_deposito,
        items_total: v.items_total,
        items_no_anulados: v.items_no_anulados,
        unidades_total: Math.round(v.unidades_total * 10000) / 10000,
        monto_aprox: Math.round(v.monto_aprox * 100) / 100,
        sync_run_id: runId,
        synced_at: new Date().toISOString(),
      }))
      if (rows.length > 0) {
        for (let i = 0; i < rows.length; i += 1000) {
          const slice = rows.slice(i, i + 1000)
          const { error } = await supabase
            .from("chess_pedidos_misiones")
            .upsert(slice, { onConflict: "id_cliente,fecha_entrega" })
          if (error) throw new Error(`upsert pedidos ${fecha}: ${error.message}`)
        }
        pedidosInsertados += rows.length
      }
    }

    const result: SyncFuerasRutaResult = {
      runId,
      rutas: { total: rutasAll.length, preVigentes: rutasPre.length },
      clientes: { total: clientesAll.length, conRutaPre, sinRutaPre },
      pedidos: { diasConsultados, pedidosInsertados, itemsTotal, itemsNoAnulados },
      ms: Date.now() - t0,
    }

    await supabase
      .from("chess_sync_runs_misiones")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        stats: result,
      })
      .eq("id", runId)

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from("chess_sync_runs_misiones")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_msg: message,
      })
      .eq("id", runId)
    throw err
  }
}
