// DPO Entrega 4.2 «Comunicación al cliente»: los días en que se pospuso la
// entrega de pedidos, con el motivo, para mostrar que Ventas recibió la lista y
// pudo avisar a esos clientes antes de que el camión no llegue.
//
// Junta las dos patas del volumen reprogramado (las mismas de On Time / 4.4):
//  - LOGÍSTICO (VRL): cortes registrados en Planeamiento → Priorización de
//    Entrega (`entrega_cortes`, base propia). Se registran el día ANTERIOR a la
//    entrega y de ahí sale el PDF «Clientes a reprogramar» que va a Ventas.
//  - COMERCIAL (VRC): pedidos retenidos por crédito (`vol_reprog_com_pedido`,
//    base del dashboard Mercosur). Los guarda Ventas/Créditos (`guardado_por`).
//
// Sin "use server": lo usan la server action y el route handler del PDF.

import { createClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/mercosur-dashboard"

export type TipoPospuesto = "logistico" | "comercial"

export interface PospuestoFila {
  idCliente: string
  cliente: string
  localidad: string | null
  bultos: number
  hl: number
  monto: number
  motivo: string
  /** Comercial: fecha a la que se movió (null = todavía sin fecha). */
  fechaNueva: string | null
  /** Logístico: cuántas veces se le había pospuesto antes. */
  vecesPrevias: number | null
}

export interface PospuestoDia {
  /** Fecha de entrega pactada que se corrió (YYYY-MM-DD). */
  fecha: string
  tipo: TipoPospuesto
  clientes: number
  pedidos: number
  bultos: number
  hl: number
  monto: number
  /** Motivo del día (el comentario del corte o el motivo de crédito). */
  motivo: string
  /** Quién lo registró (usuario de la app o de Créditos/Ventas). */
  registradoPor: string | null
  /** Cuándo quedó registrado (ISO). Logístico: alta del corte. Comercial: primer día detectado. */
  registradoEn: string | null
  filas: PospuestoFila[]
}

export interface PospuestosPeriodo {
  desde: string
  hasta: string
  dias: PospuestoDia[]
  /** El dashboard Mercosur no respondió: los comerciales no se sabe, no son cero. */
  vrcError: string | null
}

const MOTIVO_VRL: Record<string, string> = {
  cupo: "Sin capacidad de reparto (cupo del día)",
  volumen: "No entró por el volumen del pedido",
  manual: "Sacado del ruteo (decisión logística)",
}

function motivoCredito(m: string | null): string {
  return m ? `Crédito: ${m.replace(/_/g, " ").toLowerCase()}` : "Límite de crédito"
}

/** Días con pedidos pospuestos entre `desde` y `hasta` (inclusive), del más nuevo al más viejo. */
export async function leerPospuestos(desde: string, hasta: string): Promise<PospuestosPeriodo | { error: string }> {
  const dias = new Map<string, PospuestoDia>()
  const dia = (fecha: string, tipo: TipoPospuesto): PospuestoDia => {
    const k = `${fecha}|${tipo}`
    let d = dias.get(k)
    if (!d) {
      d = {
        fecha, tipo, clientes: 0, pedidos: 0, bultos: 0, hl: 0, monto: 0,
        motivo: "", registradoPor: null, registradoEn: null, filas: [],
      }
      dias.set(k, d)
    }
    return d
  }

  // ── Logístico: cortes de entrega (una fila por cliente-día) ───────────────
  const supabase = await createClient()
  const { data: cortes, error } = await supabase
    .from("entrega_cortes")
    .select("fecha_entrega, id_cliente, nombre_cliente, localidad, bultos, hl, monto, motivo, nota, veces_previas, cortado_por, created_at")
    .gte("fecha_entrega", desde)
    .lte("fecha_entrega", hasta)
    .order("fecha_entrega", { ascending: false })
    .range(0, 4999)
  if (error) return { error: `No se pudieron leer los cortes logísticos: ${error.message}` }

  for (const r of cortes ?? []) {
    const d = dia(String(r.fecha_entrega), "logistico")
    const motivo = MOTIVO_VRL[r.motivo ?? ""] ?? r.motivo ?? "Sin motivo registrado"
    d.filas.push({
      idCliente: String(r.id_cliente),
      cliente: r.nombre_cliente ?? `Cliente ${r.id_cliente}`,
      localidad: r.localidad ?? null,
      bultos: Number(r.bultos ?? 0),
      hl: Number(r.hl ?? 0),
      monto: Number(r.monto ?? 0),
      motivo,
      fechaNueva: null,
      vecesPrevias: Number(r.veces_previas ?? 0),
    })
    if (!d.motivo) d.motivo = (r.nota ?? "").trim() || motivo
    d.registradoPor ??= r.cortado_por ?? null
    const alta = r.created_at ? String(r.created_at) : null
    if (alta && (!d.registradoEn || alta < d.registradoEn)) d.registradoEn = alta
  }

  // ── Comercial: pedidos retenidos por crédito (dashboard Mercosur) ─────────
  let vrcError: string | null = null
  try {
    const { rows } = await getPool().query<{
      fecha: string; idcliente: string | null; cliente: string | null; motivo_credito: string | null
      bultos: string | null; hl: string | null; importe: string | null; fecha_nueva: string | null
      guardado_por: string | null; primer_snapshot: string | null
    }>(
      `select to_char(fecha_entrega_original, 'YYYY-MM-DD') as fecha, idcliente, cliente, motivo_credito,
              bultos, hl, importe, to_char(fecha_entrega_nueva, 'YYYY-MM-DD') as fecha_nueva,
              guardado_por, to_char(primer_snapshot, 'YYYY-MM-DD') as primer_snapshot
         from vol_reprog_com_pedido
        where lower(region) = 'pampeana'
          and fecha_entrega_original between $1 and $2
        order by fecha_entrega_original desc, bultos desc nulls last`,
      [desde, hasta],
    )
    for (const r of rows) {
      const d = dia(r.fecha, "comercial")
      const motivo = motivoCredito(r.motivo_credito)
      d.filas.push({
        idCliente: r.idcliente ?? "",
        cliente: r.cliente ?? `Cliente ${r.idcliente ?? "?"}`,
        localidad: null,
        bultos: Number(r.bultos ?? 0),
        hl: Number(r.hl ?? 0),
        monto: Number(r.importe ?? 0),
        motivo,
        fechaNueva: r.fecha_nueva,
        vecesPrevias: null,
      })
      if (!d.motivo) d.motivo = motivo
      if (r.guardado_por) {
        const quienes = new Set((d.registradoPor ?? "").split(", ").filter(Boolean))
        quienes.add(r.guardado_por)
        d.registradoPor = [...quienes].join(", ")
      }
      if (r.primer_snapshot && (!d.registradoEn || r.primer_snapshot < d.registradoEn)) d.registradoEn = r.primer_snapshot
    }
  } catch (e) {
    vrcError = e instanceof Error
      ? `Pedidos retenidos por crédito no disponibles (dashboard Mercosur): ${e.message}`
      : "Pedidos retenidos por crédito no disponibles: no respondió el dashboard Mercosur."
  }

  for (const d of dias.values()) {
    d.pedidos = d.filas.length
    d.clientes = new Set(d.filas.map((f) => f.idCliente || f.cliente)).size
    d.bultos = d.filas.reduce((s, f) => s + f.bultos, 0)
    d.hl = d.filas.reduce((s, f) => s + f.hl, 0)
    d.monto = d.filas.reduce((s, f) => s + f.monto, 0)
  }

  return {
    desde,
    hasta,
    dias: [...dias.values()].sort((a, b) =>
      a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.tipo.localeCompare(b.tipo),
    ),
    vrcError,
  }
}
