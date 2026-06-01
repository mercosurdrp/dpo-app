import { redirect } from "next/navigation"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { CargaCamionesClient, type CargaRow } from "./carga-camiones-client"

export const dynamic = "force-dynamic"

// Snapshot diario pre-cocinado por el pusher local push_carga_camiones.ps1
// (Scheduled Task WMS-WarehouseKPI-Push). Datos del WMS: VIAJES + BANDVIA +
// EVENTOS de despacho. Una sola URL chica, sin acceso directo a la LAN.
const BLOB_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=carga-camiones"

interface BlobResponse {
  data?: {
    generado_en?: string | null
    filas?: CargaRow[]
  } | null
}

export default async function CargaCamionesPage() {
  await requireRole(["admin", "supervisor"])
  // Feature exclusiva de Pampeana (el WMS es el CD de Región Pampeana).
  if (IS_MISIONES) redirect("/")

  let filas: CargaRow[] = []
  let generadoEn: string | null = null
  let error: string | null = null
  try {
    const res = await fetch(BLOB_URL, { cache: "no-store" })
    if (res.ok) {
      const json = (await res.json()) as BlobResponse
      filas = Array.isArray(json?.data?.filas) ? json.data!.filas! : []
      generadoEn = json?.data?.generado_en ?? null
    } else {
      error = "Todavía no hay datos de carga de camiones."
    }
  } catch {
    error = "No se pudo leer la fuente de carga de camiones."
  }

  return (
    <CargaCamionesClient filas={filas} generadoEn={generadoEn} error={error} />
  )
}
