/**
 * Sincroniza en `fuera_ruta_registros` los FUERA DE RUTA detectados en Chess
 * para una fecha de entrega (criterio del día pactado, ver `chess.ts`).
 *
 * Sólo servidor (service role). Lo usan la pantalla de Priorización al abrir
 * una fecha y el cron diario `/api/fuera-ruta/cron-sync`, que deja cerrado el
 * día anterior aunque nadie abra la pantalla, para que el acumulado mensual
 * esté completo.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import {
  FUERA_RUTA_CHESS_DESDE,
  fueraRutaDesdePedidos,
  fueraRutaDesdeVentas,
  type FueraRutaChessFila,
} from "@/lib/fuera-ruta/chess"
import { getDiasPactados } from "@/lib/fuera-ruta/dias-pactados"

/**
 * Una fecha ya facturada se recalcula sólo durante estos días: después queda
 * congelada como se registró (Chess no cambia una factura de hace un mes y no
 * vale la pena demorar la pantalla paginando /ventas/ de días viejos).
 */
const DIAS_RECALCULO_FACTURADO = 7

export interface SyncChessResultado {
  fecha: string
  filas: number
  recalculado: boolean
  /** 'pedido' = pendientes de /pedidos/ · 'venta' = facturado de /ventas/. */
  origen: "pedido" | "venta" | null
  dias_pactados_en: string
}

/** Hoy en Argentina (UTC-3): Vercel corre en UTC y a la noche cambiaría de día antes. */
export function hoyArg(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

export function restarDiasIso(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10)
}

/**
 * Detecta en Chess los fuera de ruta de `fecha` y deja la base igual a Chess:
 * upserta las filas detectadas y borra las de esa fecha que ya no lo son (un
 * pedido pendiente que se reprograma al día pactado deja de estar fuera de
 * ruta; una factura anulada también). Sólo toca fechas del período Chess.
 */
export async function sincronizarFueraRutaChess(
  fecha: string,
  hoy: string = hoyArg(),
): Promise<SyncChessResultado> {
  if (fecha < FUERA_RUTA_CHESS_DESDE) {
    throw new Error(`La fecha ${fecha} es anterior al corte Chess (${FUERA_RUTA_CHESS_DESDE}).`)
  }
  const { mapa, generadoEn } = await getDiasPactados(hoy)
  const admin = createAdminClient()

  const esPendiente = fecha >= hoy
  if (!esPendiente && fecha < restarDiasIso(hoy, DIAS_RECALCULO_FACTURADO)) {
    const { count } = await admin
      .from("fuera_ruta_registros")
      .select("clave", { count: "exact", head: true })
      .eq("fecha_entrega", fecha)
    return { fecha, filas: count ?? 0, recalculado: false, origen: null, dias_pactados_en: generadoEn }
  }

  const detectadas: FueraRutaChessFila[] = esPendiente
    ? await fueraRutaDesdePedidos(fecha, mapa)
    : await fueraRutaDesdeVentas(fecha, mapa)

  const ahora = new Date().toISOString()
  if (detectadas.length > 0) {
    // primera_vez NO va en el payload: la pone el default en el insert y el
    // upsert no la pisa (queda cuándo apareció el registro por primera vez).
    const rows = detectadas.map((f) => ({ ...f, synced_at: ahora }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin
        .from("fuera_ruta_registros")
        .upsert(rows.slice(i, i + 500), { onConflict: "clave" })
      if (error) throw new Error(`snapshot fuera de ruta (Chess): ${error.message}`)
    }
  }
  // Lo que Chess ya no marca para esa fecha se va: la base refleja Chess.
  const claves = detectadas.map((f) => f.clave)
  let borrar = admin.from("fuera_ruta_registros").delete().eq("fecha_entrega", fecha)
  if (claves.length > 0) {
    borrar = borrar.not("clave", "in", `(${claves.map((c) => `"${c}"`).join(",")})`)
  }
  const { error: errBorrar } = await borrar
  if (errBorrar) throw new Error(`limpieza fuera de ruta (Chess): ${errBorrar.message}`)

  return {
    fecha,
    filas: detectadas.length,
    recalculado: true,
    origen: esPendiente ? "pedido" : "venta",
    dias_pactados_en: generadoEn,
  }
}
