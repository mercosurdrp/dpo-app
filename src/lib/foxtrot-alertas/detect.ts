// Detección liviana de rechazos del día contra la API de Foxtrot.
//
// Réplica dirigida de la lógica de attempts de foxtrot-snapshot/build.ts
// (attempt final FAILED = rechazo, con SUCCESSFUL previo = parcial) pero
// trayendo SOLO rutas + waypoints + deliveries: sin analytics, zonas,
// geocoding ni ubicación de camiones, que hacen pesado a buildSnapshot().
// La usa el cron /api/foxtrot/cron-alertas cada 5 minutos.

import {
  getDrivers,
  getRoutesForDc,
  getRouteDetail,
  toMs,
  type Attempt,
} from "@/lib/foxtrot-snapshot/client"
import type { RechazoItemAlerta } from "./types"

export interface RechazoDetectado {
  dc: string
  fecha: string
  route_id: string
  waypoint_id: string
  cliente_id_foxtrot: string | null
  chofer_nombre: string
  ruta: string
  motivos: string[]
  bultos: number
  parcial: boolean
  items: RechazoItemAlerta[]
  rechazo_ts_ms: number
}

export interface EntregaOkDetectada {
  dc: string
  cliente_id_foxtrot: string
  ruta: string
  ts_ms: number
}

// El customer_id de Foxtrot es "{código distribuidor}{id_cliente Chess
// zero-pad 8}" — verificado en vivo: "45902500010087" → id_cliente 10087.
// 459025 = Pampeana; se aceptan otros prefijos de 6 dígitos por si se
// replica a Misiones.
export function foxtrotCustomerToChessId(
  customerId: string | null | undefined,
): string | null {
  if (!customerId) return null
  const m = customerId.match(/^\d{6}(\d{8})$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n > 0 ? String(n) : null
}

export async function detectDia(
  dcs: string[],
  fecha: string,
): Promise<{ rechazos: RechazoDetectado[]; entregasOk: EntregaOkDetectada[] }> {
  const rechazos: RechazoDetectado[] = []
  const entregasOk: EntregaOkDetectada[] = []

  await Promise.all(
    dcs.map(async (dc) => {
      const [drivers, routes] = await Promise.all([
        getDrivers(dc),
        getRoutesForDc(dc, [fecha]),
      ])

      await Promise.all(
        routes.map(async (r) => {
          const { waypoints } = await getRouteDetail(dc, r.id)
          const chofer =
            (r.assigned_driver_id && drivers.get(r.assigned_driver_id)) ||
            r.assigned_driver_id ||
            "(sin chofer)"
          const ruta = r.name ?? r.id

          for (const wp of waypoints) {
            const wpid = wp.waypoint_id ?? wp.id ?? ""
            const cid = wp.customer_id ?? null

            let bultosRech = 0
            let parcial = false
            const motivos = new Set<string>()
            const items: RechazoItemAlerta[] = []
            let rechazoTs = 0
            let entregaOkTs = 0

            for (const d of wp.deliveries ?? []) {
              const qty = d.quantity ?? 0
              const atts = d.attempts ?? []
              if (atts.length === 0) continue
              const last: Attempt = atts[atts.length - 1]
              const ts =
                toMs(last.timestamp) ||
                toMs(last.attempt_timestamp) ||
                toMs(wp.completed_timestamp)

              if (last.attempt_status === "SUCCESSFUL") {
                if (ts > entregaOkTs) entregaOkTs = ts
              } else if (last.attempt_status === "FAILED") {
                // Igual que build.ts: SUCCESSFUL previo + FAILED final =
                // rechazo parcial; Foxtrot no expone quantity por attempt,
                // así que la porción rechazada no infla bultos.
                const esParcial = atts.some((a) => a.attempt_status === "SUCCESSFUL")
                const motivo =
                  last.delivery_message || last.delivery_code || last.driver_notes || "Sin motivo"
                motivos.add(motivo)
                if (esParcial) parcial = true
                else bultosRech += qty
                if (ts > rechazoTs) rechazoTs = ts
                items.push({
                  producto: d.name ?? "(sin nombre)",
                  cantidad: esParcial ? 0 : qty,
                  motivo,
                  notas: last.driver_notes ?? null,
                  ts_ms: ts,
                })
              }
            }

            if (items.length > 0) {
              rechazos.push({
                dc,
                fecha,
                route_id: r.id,
                waypoint_id: wpid,
                cliente_id_foxtrot: cid,
                chofer_nombre: chofer,
                ruta,
                motivos: Array.from(motivos).sort(),
                bultos: bultosRech,
                parcial,
                items,
                rechazo_ts_ms: rechazoTs,
              })
            } else if (entregaOkTs > 0 && cid) {
              entregasOk.push({ dc, cliente_id_foxtrot: cid, ruta, ts_ms: entregaOkTs })
            }
          }
        }),
      )
    }),
  )

  return { rechazos, entregasOk }
}
