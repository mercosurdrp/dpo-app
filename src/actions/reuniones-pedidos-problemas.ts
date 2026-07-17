"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getPool } from "@/lib/mercosur-dashboard"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA =
  "La sección Pedidos con problemas solo está disponible en Pampeana."

/** Misma ventana que el bloque de Flota y Ruteo: la semana previa a la reunión. */
const VENTANA_DIAS = 7

function diaAnterior(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00`)
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export interface PedidoConProblema {
  /** vrl = reprogramado por capacidad de reparto · vrc = trabado por crédito. */
  fuente: "vrl" | "vrc"
  /** Fecha de entrega que se corrió (VRL: fecha del corte, VRC: entrega original). */
  fecha: string
  idCliente: string
  cliente: string
  localidad: string | null
  motivo: string
  bultos: number
  hl: number
  monto: number
  /** VRC: a qué fecha se movió; null = todavía sin fecha nueva. */
  fechaNueva: string | null
  /** VRL: cuántas veces ya se le había postergado el pedido antes de este corte. */
  vecesPrevias: number | null
}

export interface TotalesFuente {
  pedidos: number
  bultos: number
  hl: number
}

export interface PedidosConProblemasReunion {
  desde: string
  hasta: string
  /** Mes de la reunión (YYYY-MM); el acumulado corre del 1° al día previo. */
  mes: string
  pedidos: PedidoConProblema[]
  totalVrl: TotalesFuente
  /** null cuando el dashboard Mercosur no respondió: no se sabe, no es cero. */
  totalVrc: TotalesFuente | null
  mesVrl: TotalesFuente
  mesVrc: TotalesFuente | null
  vrcError: string | null
}

function totales(pedidos: Array<{ bultos: number; hl: number }>): TotalesFuente {
  return {
    pedidos: pedidos.length,
    bultos: pedidos.reduce((s, p) => s + p.bultos, 0),
    hl: pedidos.reduce((s, p) => s + p.hl, 0),
  }
}

const MOTIVO_VRL: Record<string, string> = {
  cupo: "Sin capacidad de reparto (cupo del día)",
  volumen: "No entró por el volumen del pedido",
  manual: "Sacado a mano en el ruteo",
}

/**
 * Pedidos reprogramados de la semana previa a la reunión Logística-Ventas,
 * juntando las dos patas del volumen reprogramado:
 *  - VRL (logístico): cortes de entrega registrados en Priorización de Entrega
 *    (`entrega_cortes`, Supabase propia).
 *  - VRC (comercial): pedidos corridos por límite de crédito
 *    (`vol_reprog_com_pedido`, Railway del dashboard Mercosur).
 */
export async function getPedidosConProblemas(
  fechaReunion: string
): Promise<Result<PedidosConProblemasReunion>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaReunion)) {
    return { error: "Fecha de reunión inválida (formato esperado YYYY-MM-DD)" }
  }

  const hasta = diaAnterior(fechaReunion, 1)
  const desde = diaAnterior(fechaReunion, VENTANA_DIAS)
  const mes = fechaReunion.slice(0, 7)
  const inicioMes = `${mes}-01`
  // La semana previa puede pisar el mes anterior (reunión a principio de mes):
  // se trae una sola ventana que cubre las dos y se separa en memoria.
  const inferior = desde < inicioMes ? desde : inicioMes

  // ── VRL: cortes de entrega, fila por cliente-día ──────────────────────────
  const supabase = await createClient()
  const vrlRes = await supabase
    .from("entrega_cortes")
    .select(
      "fecha_entrega, id_cliente, nombre_cliente, localidad, bultos, hl, monto, motivo, veces_previas"
    )
    .gte("fecha_entrega", inferior)
    .lte("fecha_entrega", hasta)
  if (vrlRes.error) {
    return { error: `No se pudo leer el VRL: ${vrlRes.error.message}` }
  }

  const vrlTodos: PedidoConProblema[] = (vrlRes.data ?? []).map((r) => ({
    fuente: "vrl" as const,
    fecha: String(r.fecha_entrega),
    idCliente: String(r.id_cliente),
    cliente: r.nombre_cliente ?? `Cliente ${r.id_cliente}`,
    localidad: r.localidad ?? null,
    motivo: MOTIVO_VRL[r.motivo ?? ""] ?? r.motivo ?? "Sin motivo registrado",
    bultos: Number(r.bultos ?? 0),
    hl: Number(r.hl ?? 0),
    monto: Number(r.monto ?? 0),
    fechaNueva: null,
    vecesPrevias: Number(r.veces_previas ?? 0),
  }))
  const pedidos = vrlTodos.filter((p) => p.fecha >= desde)

  // ── VRC: pedidos trabados por crédito, en la Railway del dashboard ────────
  // Si no responde se informa como error visible: un cero silencioso se leería
  // como "no hubo reprogramado por crédito" y es una conclusión falsa.
  let totalVrc: TotalesFuente | null = null
  let mesVrc: TotalesFuente | null = null
  let vrcError: string | null = null
  try {
    const pool = getPool()
    const { rows } = await pool.query<{
      fecha: string
      idcliente: string | null
      cliente: string | null
      motivo_credito: string | null
      bultos: string | null
      hl: string | null
      importe: string | null
      fecha_nueva: string | null
    }>(
      `select to_char(fecha_entrega_original, 'YYYY-MM-DD') as fecha,
              idcliente, cliente, motivo_credito, bultos, hl, importe,
              to_char(fecha_entrega_nueva, 'YYYY-MM-DD') as fecha_nueva
         from vol_reprog_com_pedido
        where lower(region) = 'pampeana'
          and fecha_entrega_original between $1 and $2
        order by fecha_entrega_original, bultos desc nulls last`,
      [inferior, hasta]
    )
    const vrcTodos: PedidoConProblema[] = rows.map((r) => ({
      fuente: "vrc" as const,
      fecha: r.fecha,
      idCliente: r.idcliente ?? "",
      cliente: r.cliente ?? `Cliente ${r.idcliente ?? "?"}`,
      localidad: null,
      motivo: r.motivo_credito
        ? `Crédito: ${r.motivo_credito.replace(/_/g, " ").toLowerCase()}`
        : "Límite de crédito",
      bultos: Number(r.bultos ?? 0),
      hl: Number(r.hl ?? 0),
      monto: Number(r.importe ?? 0),
      fechaNueva: r.fecha_nueva,
      vecesPrevias: null,
    }))
    const vrcSemana = vrcTodos.filter((p) => p.fecha >= desde)
    pedidos.push(...vrcSemana)
    totalVrc = totales(vrcSemana)
    mesVrc = totales(vrcTodos.filter((p) => p.fecha >= inicioMes))
  } catch (e) {
    vrcError =
      e instanceof Error
        ? `VRC no disponible (dashboard Mercosur): ${e.message}`
        : "VRC no disponible: no se pudo consultar el dashboard Mercosur."
  }

  pedidos.sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : b.bultos - a.bultos
  )

  return {
    data: {
      desde,
      hasta,
      mes,
      pedidos,
      totalVrl: totales(pedidos.filter((p) => p.fuente === "vrl")),
      totalVrc,
      mesVrl: totales(vrlTodos.filter((p) => p.fecha >= inicioMes)),
      mesVrc,
      vrcError,
    },
  }
}
