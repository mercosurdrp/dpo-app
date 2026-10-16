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

/** Texto que marca una fila del ruteo que al final no salió fuera de ruta. */
export const OBS_NO_SALIO = "Estaba en el ruteo y no se entregó fuera de ruta ese día (se sacó o se reprogramó)"

/** Lista para el filtro `in` de PostgREST. Las claves no traen comillas. */
function listaIn(valores: string[]): string {
  return `(${valores.map((v) => `"${v}"`).join(",")})`
}

export function restarDiasIso(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map((s) => parseInt(s, 10))
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10)
}

/**
 * Detecta en Chess los fuera de ruta de `fecha` y los guarda. Hay dos fotos:
 *  - RUTEO (fecha de hoy en adelante): lo pendiente fuera de día. Se mantiene
 *    igual a Chess (lo que se reprograma al día pactado desaparece).
 *  - ENTREGADO (fecha pasada): lo facturado fuera de día pisa la fila del
 *    ruteo y queda como 'venta'. Lo que estaba en el ruteo y no salió se
 *    conserva como 'pedido' marcado, para comparar las dos fotos.
 * Sólo toca fechas del período Chess.
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
    // upsert no la pisa (queda cuándo apareció el registro por primera vez,
    // o sea si ya estaba en el ruteo o apareció recién al facturar).
    const rows = detectadas.map((f) => ({ ...f, synced_at: ahora }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin
        .from("fuera_ruta_registros")
        .upsert(rows.slice(i, i + 500), { onConflict: "clave" })
      if (error) throw new Error(`snapshot fuera de ruta (Chess): ${error.message}`)
    }
  }
  const claves = detectadas.map((f) => f.clave)
  if (esPendiente) {
    // Foto del RUTEO: refleja lo que hoy está pendiente fuera de día. Un pedido
    // que se reprogramó al día pactado (o se eliminó) deja de figurar.
    let borrar = admin
      .from("fuera_ruta_registros")
      .delete()
      .eq("fecha_entrega", fecha)
      .eq("medida_origen", "pedido")
    if (claves.length > 0) borrar = borrar.not("clave", "in", listaIn(claves))
    const { error } = await borrar
    if (error) throw new Error(`limpieza fuera de ruta (ruteo): ${error.message}`)
  } else {
    // Foto de lo ENTREGADO: lo facturado fuera de día pisa la fila del ruteo
    // (misma clave) y pasa a 'venta'. Lo que estaba en el ruteo y NO salió
    // fuera de ruta se conserva como 'pedido' y se marca: es justamente lo que
    // se sacó o reprogramó en el ruteo, y hay que poder verlo.
    let marcar = admin
      .from("fuera_ruta_registros")
      .update({ observaciones: OBS_NO_SALIO, synced_at: ahora })
      .eq("fecha_entrega", fecha)
      .eq("medida_origen", "pedido")
    if (claves.length > 0) marcar = marcar.not("clave", "in", listaIn(claves))
    const { error } = await marcar
    if (error) throw new Error(`marca fuera de ruta (no salió): ${error.message}`)
  }

  return {
    fecha,
    filas: detectadas.length,
    recalculado: true,
    origen: esPendiente ? "pedido" : "venta",
    dias_pactados_en: generadoEn,
  }
}
