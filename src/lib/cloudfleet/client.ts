// Cliente mínimo de la API REST de Cloudfleet (gestión de flota) para Misiones.
// Solo lo que necesitamos hoy: listar checklists (inspecciones de
// liberación/retorno/AE) por rango de fecha.
//
// 🚨 Cloudflare delante de la API banea el User-Agent por defecto de fetch/Node
// (responde 403 "error code: 1010"). Hay que mandar un UA de navegador.
// La API key vive en CLOUDFLEET_API_KEY (env del proyecto Vercel de Misiones).

const BASE_URL = "https://fleet.cloudfleet.com/api/v1"
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

export interface CloudfleetChecklist {
  number: number
  checklistDate: string // ISO UTC (Z)
  type?: { name?: string } | null
  status?: { name?: string } | null
  vehicle?: { id?: number; code?: string } | null
  costCenter?: { name?: string } | null
  statistics?: {
    qtyVariablesApproved?: number
    qtyVariablesRejected?: number
    qtyVariablesCritical?: number
    qtyTotalVariables?: number
  } | null
}

function apiKey(): string {
  const key = process.env.CLOUDFLEET_API_KEY
  if (!key) throw new Error("CLOUDFLEET_API_KEY no está configurada")
  return key
}

/** El día siguiente a `fechaISO` (YYYY-MM-DD). */
function diaSiguiente(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Lista todos los checklists en [desde, hasta] (YYYY-MM-DD, filtro por
 * checklistDate). Pagina de a 50 (page=N) hasta agotar.
 *
 * 🚨 El parámetro `checklistDateTo` de Cloudfleet es EXCLUSIVO: el día indicado
 * NO se incluye (igual que el `fechahasta` de GESCOM). Para que `hasta` sea
 * inclusivo —en particular para traer el día de HOY, sin lo cual los checks no
 * aparecían hasta el cron de la madrugada siguiente (~24h de retraso)— se pide
 * el día siguiente como tope.
 */
export async function fetchChecklists(
  desde: string,
  hasta: string,
): Promise<CloudfleetChecklist[]> {
  const key = apiKey()
  const hastaExclusivo = diaSiguiente(hasta)
  const out: CloudfleetChecklist[] = []
  for (let page = 1; page <= 200; page++) {
    const url =
      `${BASE_URL}/checklist/?checklistDateFrom=${desde}` +
      `&checklistDateTo=${hastaExclusivo}&page=${page}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      cache: "no-store",
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      // 404 con "No Checklists found" = rango sin checklists (típico en días
      // sin reparto o antes de la primera liberación del día). Lista vacía,
      // no error.
      if (res.status === 404 && body.includes("No Checklists found")) break
      throw new Error(`Cloudfleet checklist ${res.status}: ${body.slice(0, 200)}`)
    }
    const chunk = (await res.json()) as CloudfleetChecklist[]
    if (!Array.isArray(chunk) || chunk.length === 0) break
    out.push(...chunk)
    if (chunk.length < 50) break
  }
  return out
}

// ===================== Órdenes de trabajo (OT) =====================
// Endpoint `work-orders/` (con guion). La LISTA filtra por rango de `startDate`
// (params `startDateFrom`/`startDateTo`) y pagina de a 50. El DETALLE por número
// (`work-orders/{number}/`) agrega `labors[]` (mano de obra) y `parts[]`
// (repuestos) ítem por ítem.

const CF_HEADERS = () => ({
  Authorization: `Bearer ${apiKey()}`,
  "Content-Type": "application/json; charset=utf-8",
  "User-Agent": BROWSER_UA,
  Accept: "application/json",
})

interface CfNamed {
  id?: number
  name?: string | null
  code?: string | null
}

export interface CloudfleetWorkOrder {
  number: number
  vehicleCode: string | null
  workshopDate: string | null
  startDate: string | null
  estimatedFinishDate: string | null
  finalCompletionDate?: string | null
  status: string | null // closed | opened | onTechnicalCompletion | voided
  odometer: number | null
  hourmeter: number | null
  vendor: { id?: number; name?: string | null; businessId?: string | null } | null
  reason: string | null
  detectedIssue: string | null
  comments: string | null
  type: string | null // Programado | No programado | Diagnostico o revisión
  affectsMaintenanceSchedule: boolean | null
  affectsVehicleAvailability: boolean | null
  totalCostLabors: number | null
  totalCostParts: number | null
  totalCost: number | null
}

export interface CloudfleetLabor {
  id: number
  name: string | null
  qty: number | null
  unitCost: number | null
  totalCost: number | null
  maintenanceType?: CfNamed | null
  system?: CfNamed | null
  subsystem?: CfNamed | null
  comment?: string | null
}

export interface CloudfleetPart {
  id: number
  laborId?: number | null
  name: string | null
  qty: number | null
  unitCost: number | null
  totalCost: number | null
  comment?: string | null
}

export interface CloudfleetWorkOrderDetail extends CloudfleetWorkOrder {
  labors: CloudfleetLabor[] | null
  parts: CloudfleetPart[] | null
}

/** Lista todas las OT cuyo `startDate` cae en [desde, hasta] (YYYY-MM-DD). */
export async function fetchWorkOrders(
  desde: string,
  hasta: string,
): Promise<CloudfleetWorkOrder[]> {
  const hastaExclusivo = diaSiguiente(hasta)
  const out: CloudfleetWorkOrder[] = []
  for (let page = 1; page <= 200; page++) {
    const url =
      `${BASE_URL}/work-orders/?startDateFrom=${desde}` +
      `&startDateTo=${hastaExclusivo}&page=${page}`
    const res = await fetch(url, { headers: CF_HEADERS(), cache: "no-store" })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      if (res.status === 404) break // sin OT en el rango
      throw new Error(`Cloudfleet work-orders ${res.status}: ${body.slice(0, 200)}`)
    }
    const chunk = (await res.json()) as CloudfleetWorkOrder[]
    if (!Array.isArray(chunk) || chunk.length === 0) break
    out.push(...chunk)
    if (chunk.length < 50) break
  }
  return out
}

// ===================== Vehículos (datos maestros) =====================
// Endpoint `vehicles/`: ficha técnica de cada unidad (marca, modelo, chasis,
// motor, capacidad, chofer asignado...). NO expone fotos ni documentos
// adjuntos (verificado 2026-07-10: no existen endpoints de imagen/documento
// en la API v1) — eso se carga a mano en la app.

export interface CloudfleetVehicle {
  id: number
  code: string | null // dominio/patente
  typeName: string | null
  brandName: string | null
  lineName: string | null
  year: string | null
  color: string | null
  mainFuelType: string | null
  auxFuelType: string | null
  odometer: { lastMeter?: number | null; lastMeterAt?: string | null } | null
  hourmeter: { lastMeter?: number | null; lastMeterAt?: string | null } | null
  city: CfNamed | null
  costCenter: CfNamed | null
  commentGroupingData: string | null
  vin: string | null
  engine: string | null
  weightCapacity: { value?: number | null; unit?: string | null } | null
  chassisNumber: string | null
  bodyType: string | null
  driver: { id?: number; name?: string | null; personId?: string | null } | null
}

/** Lista todos los vehículos de la cuenta (pagina de a 50). */
export async function fetchVehicles(): Promise<CloudfleetVehicle[]> {
  const out: CloudfleetVehicle[] = []
  for (let page = 1; page <= 40; page++) {
    const res = await fetch(`${BASE_URL}/vehicles/?page=${page}`, {
      headers: CF_HEADERS(),
      cache: "no-store",
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      if (res.status === 404) break
      throw new Error(`Cloudfleet vehicles ${res.status}: ${body.slice(0, 200)}`)
    }
    const chunk = (await res.json()) as CloudfleetVehicle[]
    if (!Array.isArray(chunk) || chunk.length === 0) break
    out.push(...chunk)
    if (chunk.length < 50) break
  }
  return out
}

/** Detalle de una OT con su desglose de mano de obra (`labors`) y repuestos (`parts`). */
export async function fetchWorkOrderDetail(
  number: number,
): Promise<CloudfleetWorkOrderDetail> {
  const res = await fetch(`${BASE_URL}/work-orders/${number}/`, {
    headers: CF_HEADERS(),
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Cloudfleet work-order ${number} ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as CloudfleetWorkOrderDetail
}
