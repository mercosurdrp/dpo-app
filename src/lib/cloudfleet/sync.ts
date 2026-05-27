// Sincroniza los checklists de Cloudfleet a la tabla `cloudfleet_checklists`.
// Lo usan el cron (/api/cloudfleet/cron-sync) y el refresh best-effort del día
// que dispara la reunión de logística. Idempotente (upsert por `number`).

import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchChecklists } from "./client"

/** checklistDate viene en UTC (Z); ARG = UTC − 3h. Devuelve la fecha ARG. */
function fechaARG(checklistDateUTC: string): string {
  const t = new Date(checklistDateUTC).getTime()
  return new Date(t - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export interface CloudfleetSyncResult {
  ok: boolean
  total: number
  error?: string
}

export async function syncCloudfleetChecklists(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<CloudfleetSyncResult> {
  try {
    const checklists = await fetchChecklists(desde, hasta)
    if (checklists.length === 0) return { ok: true, total: 0 }

    const rows = checklists
      .filter((c) => c.number != null && c.checklistDate)
      .map((c) => ({
        number: c.number,
        fecha: fechaARG(c.checklistDate),
        tipo: c.type?.name ?? null,
        vehicle_code: c.vehicle?.code ?? null,
        cost_center: c.costCenter?.name ?? null,
        status: c.status?.name ?? null,
        qty_approved: c.statistics?.qtyVariablesApproved ?? null,
        qty_rejected: c.statistics?.qtyVariablesRejected ?? null,
        qty_critical: c.statistics?.qtyVariablesCritical ?? null,
        qty_total: c.statistics?.qtyTotalVariables ?? null,
        updated_at: new Date().toISOString(),
      }))

    const { error } = await supabase
      .from("cloudfleet_checklists")
      .upsert(rows, { onConflict: "number" })
    if (error) return { ok: false, total: 0, error: error.message }

    return { ok: true, total: rows.length }
  } catch (err) {
    return {
      ok: false,
      total: 0,
      error: err instanceof Error ? err.message : "Error sincronizando Cloudfleet",
    }
  }
}
