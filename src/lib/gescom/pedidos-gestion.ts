/**
 * Pedidos de GESTIÓN (GESCOM) pendientes de entrega, para la priorización del reparto.
 *
 * 🚨 No salen del endpoint de *pedidos* de GESCOM: ahí la empresa 98 (Pampeana) murió el
 * 2026-01-13 y lo que sigue vivo es la 99/ruta 100, que es OTRA operación (clientes 100xxx,
 * sede 1) y no cruza con los clientes de Chess. Lo que hoy entra a repartir por Gestión en
 * Pampeana son las VENTAS de la empresa 98 / sede 2 (verificado contra prod 2026-07-16).
 *
 * El ciclo de vida observado, que es lo que hace usable esto:
 *   estado "Pendiente"  + fechaEntrega futura → pedido esperando reparto  ← lo que buscamos
 *   estado "Finalizada" + fechaEntrega pasada → ya entregado
 * (2026-07-16: entregas del 14 y 15 todas Finalizada; del 16 al 23, todas Pendiente.)
 * 🚨 Ojo con el comentario viejo de `gescom-rechazos-sync.ts`, que lee "Pendiente = salió a la
 * calle pero no cerró": eso vale para el día en curso; con fecha de entrega futura, Pendiente
 * es un pedido que todavía no salió. Para el sync de rechazos da igual (ahí ambos estados son
 * "despachada"); acá NO: es toda la diferencia entre lo que hay que repartir y lo ya repartido.
 *
 * Mapeo a Chess: codigoCliente = "200" + idCliente ⇒ el pedido de Gestión cae en el mismo
 * cliente que el de Chess, con su score, su cluster y sus rechazos. Bultos y HL con la misma
 * fórmula que el sync (cantidad × unidadFactor / unidades_bulto × valor_unidad_medida) y el
 * mismo maestro de artículos que usa el pedido de Chess, para que los HL sean comparables.
 */
import {
  gescomCredsFromEnv,
  gescomLogin,
  fetchVentasPorFechaEntrega,
  normalizarCodigoCliente,
  type GescomVenta,
} from "./client"
import { getMaestroArticulos } from "@/lib/chess/pedidos-pendientes"

/** Gestión Pampeana. La 99 (ruta 100, clientes 100xxx) y la 1 son otras operaciones. */
const EMPRESA_GESTION = "98"
const SEDE_GESTION = "2"

export interface PedidoGestion {
  id_cliente: number
  pedidos: number
  bultos: number
  hl: number
  monto: number
  skus: number
}

/** Una venta de Gestión que todavía no se entregó, con fecha de entrega del día pedido. */
function esPedidoAEntregar(v: GescomVenta, fechaEntrega: string): boolean {
  return (
    v.codigoEmpresa === EMPRESA_GESTION &&
    v.codigoSede === SEDE_GESTION &&
    v.codigoTipoVenta === "VEN" &&          // ajustes (AJU-*), devoluciones (DEV-*) y débitos no se reparten
    v.estado === "Pendiente" &&
    (v.fechaEntrega ?? "").slice(0, 10) === fechaEntrega
  )
}

/**
 * Pedidos de Gestión a entregar en `fechaEntrega` (YYYY-MM-DD), agregados POR CLIENTE.
 *
 * Sin credenciales cargadas devuelve [] en vez de romper: la pantalla tiene que seguir
 * mostrando los pedidos de Chess aunque Gestión no conteste.
 */
export async function getPedidosGestion(fechaEntrega: string): Promise<PedidoGestion[]> {
  const creds = gescomCredsFromEnv()
  if (!creds.user || !creds.pass) return []

  const [token, articulos] = await Promise.all([gescomLogin(creds), getMaestroArticulos()])
  const ventas = await fetchVentasPorFechaEntrega(creds, token, fechaEntrega, fechaEntrega)

  const acc = new Map<number, PedidoGestion & { _skus: Set<number> }>()
  for (const v of ventas) {
    if (!esPedidoAEntregar(v, fechaEntrega)) continue
    const idCliente = normalizarCodigoCliente(v.codigoCliente)
    if (idCliente === null) continue

    let bultos = 0
    let hl = 0
    let monto = 0
    const skus: number[] = []
    for (const it of v.items ?? []) {
      const idArt = Number(it.codigoItem)
      const a = Number.isFinite(idArt) ? articulos.get(idArt) : undefined
      const cantidad = Number(it.cantidad ?? 0)
      const factor = Number(it.unidadFactor ?? 1) || 1
      // Gestión mide en "Pack"/"Unidad": unidadFactor lo lleva a unidades, y las unidades_bulto
      // del maestro a BULTOS, que es lo que ocupa cupo en el camión.
      const ub = a?.unidadesBulto || 0
      const b = ub > 0 ? (cantidad * factor) / ub : 0
      bultos += b
      hl += b * (a?.vum ?? 0)
      monto += Number(it.importeNeto ?? 0)
      if (Number.isFinite(idArt)) skus.push(idArt)
    }

    const prev =
      acc.get(idCliente) ??
      { id_cliente: idCliente, pedidos: 0, bultos: 0, hl: 0, monto: 0, skus: 0, _skus: new Set<number>() }
    prev.pedidos += 1
    prev.bultos += bultos
    prev.hl += hl
    prev.monto += monto
    for (const s of skus) prev._skus.add(s)
    acc.set(idCliente, prev)
  }

  return [...acc.values()]
    .map(({ _skus, ...rest }) => ({ ...rest, bultos: Math.round(rest.bultos), skus: _skus.size }))
    .filter((p) => p.bultos > 0)   // un pedido sin bultos no ocupa cupo
}
