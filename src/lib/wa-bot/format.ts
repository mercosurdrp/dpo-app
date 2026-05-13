/**
 * Formato del mensaje que el bot envía al vendedor por WhatsApp.
 */
import type { GetTopPedidosResult, PedidoResumen } from "./pedidos"

const MONTO_FMT = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: 0,
})
const NUM_FMT = new Intl.NumberFormat("es-AR")

function formatMonto(n: number): string { return MONTO_FMT.format(n) }
function formatNum(n: number): string   { return NUM_FMT.format(n) }

/** Fecha "vie 14-may" (es-AR, sin año si es del año en curso). */
function formatFechaCorta(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC", weekday: "short", day: "2-digit", month: "short",
  }).format(dt).replace(".", "")
}

export function formatTopPedidosMessage(result: GetTopPedidosResult, opts?: {
  vendedor_nombre?: string
}): string {
  const fecha = formatFechaCorta(result.fecha)
  const head = opts?.vendedor_nombre
    ? `📦 *Hola ${opts.vendedor_nombre}!*\nTus pedidos top para *${fecha}*:`
    : `📦 *Pedidos top para ${fecha}*`

  if (result.pedidos_total === 0) {
    if (result.clientes_del_promotor === 0) {
      return `${head}\n\n⚠ No te encontré clientes asignados en el sistema. Avisale al supervisor.`
    }
    return `${head}\n\nSin pedidos cargados para esa fecha. Si esperabas alguno, fijate con admin/CCC.`
  }

  const lines = result.top.map((p, i) => formatLinea(i + 1, p))

  const resto = result.pedidos_total - result.top.length
  const restoLine = resto > 0
    ? `\n_…y ${formatNum(resto)} pedido${resto !== 1 ? "s" : ""} más fuera del top._`
    : ""

  const totalLine =
    `\n\n*Total del día:* ${formatNum(result.pedidos_total)} pedidos · ` +
    `${formatNum(result.bultos_total)} bultos · ${formatMonto(result.monto_total)}`

  const tip = `\n\n💡 Llamá a los grandes para confirmar — un pedido inflado = un rechazo seguro.`

  return `${head}\n\n${lines.join("\n")}${restoLine}${totalLine}${tip}`
}

function formatLinea(rank: number, p: PedidoResumen): string {
  const nombre = p.nombre_cliente?.trim() || `Cliente ${p.id_cliente}`
  const loc = p.localidad ? ` _(${p.localidad})_` : ""
  const tel = p.telefono ? `\n   📞 ${p.telefono}` : ""
  return (
    `*${rank}.* ${nombre}${loc}\n` +
    `   ${formatNum(p.bultos)} bultos · ${formatMonto(p.monto)} · ${p.items_count} SKUs` +
    tel
  )
}
