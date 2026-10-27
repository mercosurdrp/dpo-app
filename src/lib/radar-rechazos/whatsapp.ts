/**
 * Aviso por WhatsApp del Radar de Rechazos: arma los mensajes de las 15:00
 * del día anterior a la entrega.
 *
 * Al vendedor le llegan SUS clientes críticos (criterio único de `criterio.ts`)
 * con entrega el próximo día de reparto, para que los llame antes de que salga
 * el camión. Al supervisor, el resumen de su equipo. Funciones puras: el cron
 * (`/api/radar-rechazos/cron-vendedores`) resuelve destinatarios y envía.
 *
 * Pedido de Fausto 27/10/2026: el radar casi no se abría (1 uso en 7 días), así
 * que en vez de esperar que Ventas entre, se lo llevamos al WhatsApp.
 */
import { evaluarCriticidad, type Criticidad } from "./criterio"

export interface ClienteCritico {
  id_cliente: number | null
  nombre_cliente: string | null
  localidad: string | null
  id_promotor: string | null
  nombre_promotor: string | null
  bultos_pedido: number
  monto_pedido: number
  cerrado_mes: number
  sin_dinero_mes: number
  cerrado_anio: number
  sin_dinero_anio: number
  criticidad: Criticidad
}

/** Filtra los críticos de una foto y los ordena por rechazos (peor primero). */
export function soloCriticos(
  filas: Omit<ClienteCritico, "criticidad">[],
): ClienteCritico[] {
  return filas
    .map((f) => ({ ...f, criticidad: evaluarCriticidad(f) }))
    .filter((f) => f.criticidad.es_critico)
    .sort(
      (a, b) =>
        b.criticidad.rechazos_30d - a.criticidad.rechazos_30d ||
        b.criticidad.rechazos_anio - a.criticidad.rechazos_anio,
    )
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

/** "de mañana miércoles 28/10" o "del lunes 02/11" según cuántos días faltan. */
export function textoFecha(fechaEntrega: string, hoy: string): string {
  const d = new Date(`${fechaEntrega}T00:00:00Z`)
  const dias = Math.round((d.getTime() - new Date(`${hoy}T00:00:00Z`).getTime()) / 86_400_000)
  const ddmm = `${fechaEntrega.slice(8, 10)}/${fechaEntrega.slice(5, 7)}`
  const dia = DIAS[d.getUTCDay()]
  return dias === 1 ? `de mañana ${dia} ${ddmm}` : `del ${dia} ${ddmm}`
}

const pesos = (n: number) =>
  `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`

/** "2 sin dinero + 1 cerrado", sin las partes en cero. */
function motivos(sinDinero: number, cerrado: number): string {
  const partes: string[] = []
  if (sinDinero) partes.push(`${sinDinero} sin dinero`)
  if (cerrado) partes.push(`${cerrado} cerrado`)
  return partes.join(" + ") || "0"
}

// Nombre completo en formato título. No se adivina el de pila: en Chess el
// orden no es fijo ("TRIANA VILLADA" salía "Hola Villada").
const titulo = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

function lineaCliente(c: ClienteCritico, i: number): string {
  const loc = c.localidad ? ` — ${titulo(c.localidad)}` : ""
  const pedido = [`${c.bultos_pedido} bultos`]
  if (Number(c.monto_pedido) > 0) pedido.push(pesos(c.monto_pedido))
  return [
    `${i + 1}. *${c.nombre_cliente ?? "Cliente"}* (${c.id_cliente ?? "s/n"})${loc}`,
    `   Pedido: ${pedido.join(" · ")}`,
    `   Rechazos últimos 30 días: ${motivos(c.sin_dinero_mes, c.cerrado_mes)} · en el año: ${motivos(c.sin_dinero_anio, c.cerrado_anio)}`,
  ].join("\n")
}

export function mensajeVendedor(
  nombreVendedor: string | null,
  clientes: ClienteCritico[],
  fechaEntrega: string,
  hoy: string,
): string {
  const hola = titulo(nombreVendedor)
  const uno = clientes.length === 1
  const cuantos = uno
    ? "este cliente tuyo tiene pedido y viene"
    : `estos ${clientes.length} clientes tuyos tienen pedido y vienen`
  const llamalo = uno
    ? "Llamalo hoy para confirmar que va a estar abierto y con la plata:"
    : "Llamalos hoy para confirmar que van a estar abiertos y con la plata:"
  return [
    `🎯 *Radar de rechazos* — entrega ${textoFecha(fechaEntrega, hoy)}`,
    "",
    `Hola${hola ? ` ${hola}` : ""}, ${cuantos} rechazando por *cerrado / sin dinero*. ${llamalo}`,
    "",
    clientes.map(lineaCliente).join("\n\n"),
    "",
    `${uno ? "Si no va" : "Si alguno no va"} a poder recibir, avisá para reprogramar la entrega. 🙌`,
  ].join("\n")
}

export interface GrupoVendedor {
  nombre: string
  clientes: ClienteCritico[]
}

export function mensajeSupervisor(
  nombreSupervisor: string | null,
  grupos: GrupoVendedor[],
  fechaEntrega: string,
  hoy: string,
): string {
  const total = grupos.reduce((n, g) => n + g.clientes.length, 0)
  const bloques = grupos.map((g) =>
    [
      `👤 *${g.nombre}* (${g.clientes.length})`,
      ...g.clientes.map(
        (c) =>
          `   • ${c.nombre_cliente ?? "Cliente"} (${c.id_cliente ?? "s/n"}) — rechazos: ${c.criticidad.rechazos_30d} en 30 días, ${c.criticidad.rechazos_anio} en el año`,
      ),
    ].join("\n"),
  )
  const hola = titulo(nombreSupervisor)
  return [
    `🎯 *Radar de rechazos* — resumen del equipo, entrega ${textoFecha(fechaEntrega, hoy)}`,
    "",
    `Hola${hola ? ` ${hola}` : ""}, hay *${total} ${total === 1 ? "cliente crítico" : "clientes críticos"}* con pedido. A cada vendedor ya le llegó su lista:`,
    "",
    bloques.join("\n\n"),
  ].join("\n")
}
