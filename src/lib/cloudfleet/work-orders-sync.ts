// Sincroniza las órdenes de trabajo de Cloudfleet a `mantenimiento_realizados`
// (+ tareas y repuestos). Solo la flota Pampeana: filtra las OT cuyo
// `vehicleCode` está en `catalogo_vehiculos` del tenant. Idempotente: upsert de
// la cabecera por `cloudfleet_number` y reemplazo del detalle (labors→tareas,
// parts→repuestos) en cada corrida. Lo usa el cron /api/cloudfleet/work-orders-sync.
//
// La carga manual (origen 'manual') nunca se toca: el sync solo escribe filas
// con cloudfleet_number. Si una OT de Cloudfleet se editó a mano, el próximo
// sync la vuelve a dejar igual que en Cloudfleet (fuente de verdad).

import type { SupabaseClient } from "@supabase/supabase-js"
import type { MantenimientoEstado, MantenimientoTipo } from "@/types/database"
import {
  fetchWorkOrders,
  fetchWorkOrderDetail,
  type CloudfleetWorkOrderDetail,
} from "./client"

/** Las fechas de Cloudfleet vienen en UTC (Z); ARG = UTC − 3h. */
function fechaARG(utc: string): string {
  const t = new Date(utc).getTime()
  return new Date(t - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function mapEstado(status: string | null): MantenimientoEstado {
  switch ((status ?? "").toLowerCase()) {
    case "closed":
    case "ontechnicalcompletion":
      return "completado"
    case "voided":
      return "cancelado"
    case "opened":
    default:
      return "en_taller"
  }
}

function mapTipo(type: string | null): MantenimientoTipo {
  const t = (type ?? "").toLowerCase()
  if (t.includes("no programado")) return "correctivo"
  if (t.includes("programado")) return "preventivo"
  return "proactivo" // "Diagnostico o revisión" y otros
}

export interface CloudfleetWorkOrdersSyncResult {
  ok: boolean
  total: number
  error?: string
}

// 🚨 Cloudfleet manda `affectsMaintenanceSchedule = true` en prácticamente
// todas las OT (hasta un cambio de foco), así que ese flag NO sirve para
// detectar el service general: corría el ancla del "último service" del
// Tablero operativo a cualquier arreglo menor. El service se detecta por
// texto en la mano de obra / observaciones ("Servís completo", "servis", …).
const SERVICE_RE = /serv[ií]ce|serv[ií]s|servicio\s+(general|completo)/i

function esServiceGeneral(d: CloudfleetWorkOrderDetail): boolean {
  const textos = [d.comments, d.reason, d.detectedIssue, ...(d.labors ?? []).map((l) => l.name)]
  return textos.some((s) => s != null && SERVICE_RE.test(s))
}

async function upsertOrden(
  supabase: SupabaseClient,
  d: CloudfleetWorkOrderDetail,
): Promise<{ ok: boolean; error?: string }> {
  const fechaBase = d.startDate ?? d.workshopDate
  if (!d.vehicleCode || !fechaBase) return { ok: true } // sin datos clave: saltear

  const fueraDeServicio = d.affectsVehicleAvailability === true
  const fechaOt = fechaARG(fechaBase)
  const observaciones =
    [d.comments, d.reason, d.detectedIssue]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(" · ") || null

  const cabecera = {
    cloudfleet_number: d.number,
    origen: "cloudfleet" as const,
    numero_ot: String(d.number),
    dominio: d.vehicleCode.toUpperCase(),
    fecha: fechaOt,
    tipo: mapTipo(d.type),
    estado: mapEstado(d.status),
    odometro: d.odometer ?? null,
    horometro: d.hourmeter ?? null,
    taller: d.vendor?.name?.trim() || null,
    costo: d.totalCost ?? null,
    costo_mano_obra: d.totalCostLabors ?? null,
    observaciones,
    es_service_general: esServiceGeneral(d),
    fuera_servicio_desde: fueraDeServicio ? fechaOt : null,
    fuera_servicio_hasta:
      fueraDeServicio && d.finalCompletionDate ? fechaARG(d.finalCompletionDate) : null,
    updated_at: new Date().toISOString(),
  }

  const { data: up, error: upErr } = await supabase
    .from("mantenimiento_realizados")
    .upsert(cabecera, { onConflict: "cloudfleet_number" })
    .select("id")
    .single()
  if (upErr) return { ok: false, error: upErr.message }
  const mantId = (up as { id: string }).id

  // Mano de obra (labors) → tareas realizadas.
  const { error: delT } = await supabase
    .from("mantenimiento_realizado_tareas")
    .delete()
    .eq("mantenimiento_id", mantId)
  if (delT) return { ok: false, error: delT.message }
  const labors = d.labors ?? []
  if (labors.length > 0) {
    const { error } = await supabase.from("mantenimiento_realizado_tareas").insert(
      labors.map((l) => ({
        mantenimiento_id: mantId,
        descripcion: l.name?.trim() || "Mano de obra",
        costo: l.totalCost ?? null,
      })),
    )
    if (error) return { ok: false, error: error.message }
  }

  // Repuestos (parts).
  const { error: delR } = await supabase
    .from("mantenimiento_realizado_repuestos")
    .delete()
    .eq("mantenimiento_id", mantId)
  if (delR) return { ok: false, error: delR.message }
  const parts = d.parts ?? []
  if (parts.length > 0) {
    const { error } = await supabase.from("mantenimiento_realizado_repuestos").insert(
      parts.map((p) => ({
        mantenimiento_id: mantId,
        descripcion: [p.name?.trim(), p.comment?.trim()].filter(Boolean).join(" — ") || "Repuesto",
        cantidad: p.qty && p.qty > 0 ? p.qty : 1,
        costo_unitario: p.unitCost ?? null,
      })),
    )
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true }
}

export async function syncCloudfleetWorkOrders(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<CloudfleetWorkOrdersSyncResult> {
  try {
    // Flota del tenant (Pampeana): solo importamos OT de estos vehículos.
    const { data: veh, error: vErr } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio")
    if (vErr) return { ok: false, total: 0, error: vErr.message }
    const flota = new Set(
      (veh ?? []).map((v) => String((v as { dominio: string }).dominio).toUpperCase()),
    )
    if (flota.size === 0) return { ok: true, total: 0 }

    const ordenes = await fetchWorkOrders(desde, hasta)
    const propias = ordenes.filter(
      (o) => o.vehicleCode && flota.has(o.vehicleCode.toUpperCase()),
    )
    if (propias.length === 0) return { ok: true, total: 0 }

    let total = 0
    for (const o of propias) {
      const detalle = await fetchWorkOrderDetail(o.number)
      const r = await upsertOrden(supabase, detalle)
      if (!r.ok) return { ok: false, total, error: r.error }
      total++
    }
    return { ok: true, total }
  } catch (err) {
    return {
      ok: false,
      total: 0,
      error: err instanceof Error ? err.message : "Error sincronizando OT de Cloudfleet",
    }
  }
}
