"use server"

import { requireAuth } from "@/lib/session"
import { CLAVE_CUADRO_MENSUAL } from "@/lib/fotos"
import { recalcularCuadroMensual } from "@/actions/cuadro-mensual"
import { recalcularKpiCombustible } from "@/actions/presupuesto-combustible-kpi"

/**
 * Refresco en segundo plano de las fotos vencidas. Lo llama <RefrescoFotos>
 * al montar la página: recalcula cada clave en vivo (con la sesión del
 * usuario), pisa la foto y el cliente hace `router.refresh()`.
 *
 * Las claves se validan acá: sólo se recalcula lo que la app conoce.
 */
export async function refrescarFotos(
  claves: string[],
): Promise<{ renovadas: string[]; errores: string[] }> {
  await requireAuth()
  const renovadas: string[] = []
  const errores: string[] = []

  // Secuencial a propósito: son cálculos pesados y comparten la base.
  for (const clave of [...new Set(claves)].slice(0, 5)) {
    try {
      if (clave === CLAVE_CUADRO_MENSUAL) {
        const r = await recalcularCuadroMensual()
        if ("error" in r) errores.push(`${clave}: ${r.error}`)
        else renovadas.push(clave)
        continue
      }
      const m = /^kpi-combustible-(\d{4})$/.exec(clave)
      if (m) {
        const r = await recalcularKpiCombustible(Number(m[1]))
        if ("error" in r) errores.push(`${clave}: ${r.error}`)
        else renovadas.push(clave)
        continue
      }
      errores.push(`${clave}: clave desconocida`)
    } catch (err) {
      errores.push(`${clave}: ${err instanceof Error ? err.message : "error"}`)
    }
  }

  return { renovadas, errores }
}
