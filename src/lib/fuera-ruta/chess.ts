/**
 * FUERA DE RUTA desde Chess — criterio vigente desde el 16/10/2026.
 *
 * Un pedido está fuera de ruta cuando su fecha de entrega NO cae en uno de los
 * días de entrega pactados del cliente (ver `dias-pactados.ts`). Reemplaza al
 * sheet "Novedades Logísticas", que dependía de que alguien cargara cada
 * novedad a mano; el histórico anterior al corte queda como está.
 *
 * Verificado contra el sheet (sept-oct 2026): de 51 filas cargadas a mano, 47
 * caían fuera del día pactado. El criterio también marca pedidos que el sheet
 * no tenía (p. ej. cadenas con días pactados desactualizados en Chess): eso
 * ahora se lee como lo que es, mantenimiento pendiente del maestro.
 *
 *  - Fecha de hoy en adelante: `/pedidos/?fechaEntrega=` (pendientes; la lista
 *    cambia hasta que se factura). Sólo FCVTA (no comodatos COPOP/CTRCO), no
 *    eliminados, y con reparto por patente o todavía PENDIENTE.
 *  - Fecha pasada: `/ventas/?detallado=true` paginado (FACTURA no anulada con
 *    pedido). Es lo que efectivamente salió; definitivo.
 *
 * Se excluyen mostrador y transportes sin patente (SEGUNDA VUELTA, GESTION,
 * etc.): no son una ruta de reparto. HL con la misma fórmula del ranking y el VRL.
 */
import { chessLogin } from "@/lib/wa-bot/chess"
import { clasificarReparto } from "@/lib/sync/fueras-ruta-sync"
import { isPatenteValida } from "@/lib/sync/rechazos-sync"
import { getMaestroArticulos } from "@/lib/chess/pedidos-pendientes"
import type { FueraRutaFila } from "@/lib/fuera-ruta/sheet"
import {
  credencialesChess,
  diaIso,
  nombrarDias,
  type MapaDiasPactados,
} from "@/lib/fuera-ruta/dias-pactados"

/** Desde esta fecha de entrega el registro sale de Chess y no del sheet. */
export const FUERA_RUTA_CHESS_DESDE = "2026-10-16"

export interface FueraRutaChessFila extends FueraRutaFila {
  bultos_pedido: number
  hl_pedido: number
  medida_origen: "pedido" | "venta"
}

const esVerdad = (v: unknown) => v === true || v === "true"

/** "NXB-1-715353" a "715353" (el sufijo numérico es el número de pedido). */
function nroDePedido(idPedido: unknown): string | null {
  const m = String(idPedido ?? "").match(/(\d+)$/)
  return m && m[1] !== "0" ? m[1] : null
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function headers(sessionId: string) {
  return { headers: { Accept: "application/json", Cookie: sessionId } }
}

interface Base {
  fecha: string
  nro: string
  codCliente: number
  bultos: number
  hl: number
  monto: number
  patente: string | null
  tipoComprobante: string
  /** Lo que trae Chess del cliente en la factura; en pedidos no viene y se usa la foto. */
  cliente?: string | null
  localidad?: string | null
  canal?: string | null
  direccion?: string | null
}

function armarFila(
  b: Base,
  dias: number[],
  pactado: MapaDiasPactados[string] | undefined,
  origen: "pedido" | "venta",
): FueraRutaChessFila {
  const localidad = b.localidad ?? pactado?.localidad ?? null
  return {
    clave: `${b.fecha}|${b.nro}|${b.codCliente}`,
    fecha_entrega: b.fecha,
    sucursal: null,
    deposito: null,
    cod_cliente: b.codCliente,
    cliente: b.cliente ?? pactado?.nombre ?? null,
    comprobante: null,
    nro_pedido: b.nro,
    tipo_comprobante: b.tipoComprobante,
    monto: redondear(b.monto),
    localidad,
    bultos: null,
    descripcion: `Día pactado: ${nombrarDias(dias)} · entrega ${nombrarDias([diaIso(b.fecha)])}`,
    cod_cliente_entregado: null,
    cliente_entregado: null,
    direccion_entrega: b.direccion ?? pactado?.direccion ?? null,
    localidad_entrega: localidad,
    observaciones: origen === "pedido"
      ? "En el ruteo: pedido pendiente fuera del día pactado"
      : "Entregado fuera del día pactado (facturado)",
    patente: b.patente,
    canal: b.canal ?? pactado?.canal ?? null,
    bultos_pedido: redondear(b.bultos),
    hl_pedido: redondear(b.hl),
    medida_origen: origen,
  }
}

interface ChessPedidoRaw {
  idPedido?: string
  idCliente: number
  idTipoDocumento?: string
  eliminado?: boolean | string
  IdReparto?: number | null
  Reparto?: string | null
  items?: {
    idArticulo?: number
    cantBultos?: number
    cantUnidades?: number
    precioUnitario?: number
    anulado?: boolean | string
  }[]
}

/** Pedidos PENDIENTES de `fecha` que caen fuera del día pactado de su cliente. */
export async function fueraRutaDesdePedidos(
  fecha: string,
  pactados: MapaDiasPactados,
): Promise<FueraRutaChessFila[]> {
  const c = credencialesChess()
  const [sessionId, articulos] = await Promise.all([chessLogin(c), getMaestroArticulos()])
  const r = await fetch(`${c.baseUrl}/pedidos/?fechaEntrega=${fecha}`, headers(sessionId))
  if (!r.ok) throw new Error(`Chess GET /pedidos ${fecha}: ${r.status}`)
  const raw = (await r.json()) as { pedidos?: ChessPedidoRaw[] }
  const dia = diaIso(fecha)

  const out = new Map<string, FueraRutaChessFila>()
  for (const p of raw.pedidos ?? []) {
    if (esVerdad(p.eliminado)) continue
    if ((p.idTipoDocumento ?? "FCVTA") !== "FCVTA") continue
    if (clasificarReparto(p) === "transporte") continue
    const nro = nroDePedido(p.idPedido)
    if (!nro || out.has(nro)) continue
    const pactado = pactados[String(p.idCliente)]
    if (!pactado || pactado.dias.length === 0 || pactado.dias.includes(dia)) continue

    let bultos = 0
    let hl = 0
    let monto = 0
    for (const it of p.items ?? []) {
      if (esVerdad(it.anulado)) continue
      const b = Number(it.cantBultos) || 0
      const u = Number(it.cantUnidades) || 0
      bultos += b
      monto += b * (Number(it.precioUnitario) || 0)
      const art = it.idArticulo != null ? articulos.get(it.idArticulo) : undefined
      if (art) hl += b * art.vum + (art.unidadesBulto > 0 ? u * (art.vum / art.unidadesBulto) : 0)
    }
    if (bultos <= 0) continue
    const reparto = String(p.Reparto ?? "").trim()
    out.set(
      nro,
      armarFila(
        {
          fecha,
          nro,
          codCliente: Number(p.idCliente),
          bultos,
          hl,
          monto,
          patente: isPatenteValida(reparto) ? reparto.toUpperCase() : null,
          tipoComprobante: "Pedido pendiente",
        },
        pactado.dias,
        pactado,
        "pedido",
      ),
    )
  }
  return [...out.values()]
}

interface ChessVentaLinea {
  dsDocumento?: string
  anulado?: string
  idPedido?: number | string
  idCliente?: number | string
  nombreCliente?: string
  domicilioCliente?: string
  dsLocalidad?: string
  dsCanalMkt?: string
  dsFleteroCarga?: string
  idArticulo?: number
  cantidadesTotal?: number | string
  unimedtotal?: number | string
  subtotalFinal?: number | string
}

/**
 * Pedidos FACTURADOS de `fecha` que cayeron fuera del día pactado.
 * /ventas/ trunca en silencio sin nroLote, así que se pagina hasta lote vacío.
 */
export async function fueraRutaDesdeVentas(
  fecha: string,
  pactados: MapaDiasPactados,
): Promise<FueraRutaChessFila[]> {
  const c = credencialesChess()
  const [sessionId, articulos] = await Promise.all([chessLogin(c), getMaestroArticulos()])
  const dia = diaIso(fecha)

  const acc = new Map<string, Base & { dias: number[] }>()
  for (let lote = 1; lote <= 40; lote++) {
    const r = await fetch(
      `${c.baseUrl}/ventas/?fechaDesde=${fecha}&fechaHasta=${fecha}&detallado=true&nroLote=${lote}`,
      headers(sessionId),
    )
    if (!r.ok) throw new Error(`Chess GET /ventas ${fecha} lote ${lote}: ${r.status}`)
    const d = (await r.json()) as { dsReporteComprobantesApi?: { VentasResumen?: ChessVentaLinea[] } }
    const filas = d?.dsReporteComprobantesApi?.VentasResumen ?? []
    if (filas.length === 0) break
    for (const v of filas) {
      if (v.dsDocumento !== "FACTURA") continue
      if (String(v.anulado ?? "").toUpperCase() === "SI") continue
      const fletero = String(v.dsFleteroCarga ?? "").trim()
      if (!isPatenteValida(fletero)) continue // mostrador, segunda vuelta, etc.
      const nro = nroDePedido(v.idPedido)
      if (!nro) continue
      const codCliente = Number(v.idCliente)
      const pactado = pactados[String(codCliente)]
      if (!pactado || pactado.dias.length === 0 || pactado.dias.includes(dia)) continue

      const b = Number(v.cantidadesTotal) || 0
      const art = v.idArticulo != null ? articulos.get(v.idArticulo) : undefined
      const hl = art ? b * art.vum : Number(v.unimedtotal) || 0
      const prev = acc.get(nro) ?? {
        fecha,
        nro,
        codCliente,
        bultos: 0,
        hl: 0,
        monto: 0,
        dias: pactado.dias,
        patente: fletero.toUpperCase().replace(/\.\d+$/, ""),
        tipoComprobante: "FACTURA",
        cliente: v.nombreCliente ?? null,
        localidad: v.dsLocalidad ?? null,
        canal: v.dsCanalMkt ?? null,
        direccion: v.domicilioCliente ?? null,
      }
      prev.bultos += b
      prev.hl += hl
      prev.monto += Number(v.subtotalFinal) || 0
      acc.set(nro, prev)
    }
  }
  return [...acc.values()]
    .filter((b) => b.bultos > 0)
    .map((b) => armarFila(b, b.dias, pactados[String(b.codCliente)], "venta"))
}
