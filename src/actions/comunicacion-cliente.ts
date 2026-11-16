"use server"

// 🚨 Este archivo SOLO puede exportar funciones async ("use server").

import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { leerPospuestos, type PospuestosPeriodo } from "@/lib/comunicacion-cliente/pospuestos"

type Result<T> = { data: T } | { error: string }

/**
 * Pedidos pospuestos (logístico + comercial) de los `meses` meses que terminan en
 * `anioMes` (YYYY-MM), para la sección de Comunicación al cliente (DPO Entrega 4.2).
 */
export async function getPospuestos(anioMes: string, meses = 1): Promise<Result<PospuestosPeriodo>> {
  await requireAuth()
  if (IS_MISIONES) return { error: "La sección de pedidos pospuestos solo está disponible en Pampeana." }
  if (!/^\d{4}-\d{2}$/.test(anioMes)) return { error: "Mes inválido (se espera YYYY-MM)." }
  const n = Math.min(Math.max(Math.trunc(meses), 1), 12)

  const [y, m] = anioMes.split("-").map((s) => parseInt(s, 10))
  // Primer día del mes inicial y último del mes final, sin depender de la zona horaria.
  const desde = new Date(Date.UTC(y, m - n, 1)).toISOString().slice(0, 10)
  const hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const res = await leerPospuestos(desde, hasta)
  if ("error" in res) return res
  return { data: res }
}
