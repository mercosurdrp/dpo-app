import { redirect } from "next/navigation"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getRuteoDelDia, listarRuteoHistorial } from "@/actions/ruteo"
import { RuteoClient, type CargaViaje } from "./ruteo-client"

export const dynamic = "force-dynamic"

// Snapshot diario de la carga de camiones (fin de carga por viaje), pre-cocinado
// por el pusher local push_carga_camiones.ps1. Se cruza contra los camiones del
// día (ocupación de bodega) por patente + fecha para mostrar la hora de carga.
const CARGA_BLOB_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=carga-camiones"

interface CargaBlob {
  data?: {
    filas?: Array<{
      fecha?: string
      hora?: string
      patente?: string
    }>
  } | null
}

async function getCargaViajes(): Promise<CargaViaje[]> {
  try {
    const res = await fetch(CARGA_BLOB_URL, { cache: "no-store" })
    if (!res.ok) return []
    const json = (await res.json()) as CargaBlob
    const filas = Array.isArray(json?.data?.filas) ? json.data!.filas! : []
    return filas
      .filter((f) => f.patente && f.patente !== "0" && f.fecha && f.hora)
      .map((f) => ({
        fecha: f.fecha as string,
        patente: (f.patente as string).trim().toUpperCase(),
        hora: f.hora as string,
      }))
  } catch {
    return []
  }
}

export default async function RuteoPage() {
  await requireRole(["admin", "supervisor"])
  // Feature exclusiva de Pampeana (ciudades Pergamino / Ramallo).
  if (IS_MISIONES) redirect("/")

  const [dia, historial, carga] = await Promise.all([
    getRuteoDelDia(),
    listarRuteoHistorial(),
    getCargaViajes(),
  ])

  return (
    <RuteoClient
      diaInicial={"data" in dia ? dia.data : null}
      historialInicial={"data" in historial ? historial.data : []}
      errorInicial={"error" in dia ? dia.error : null}
      cargaInicial={carga}
    />
  )
}
