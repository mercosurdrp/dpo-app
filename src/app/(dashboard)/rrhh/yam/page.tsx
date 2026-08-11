import { requireRole } from "@/lib/session"
import { hoyAR } from "@/lib/herramientas-gestion"
import {
  getAsistenciaDiaYam,
  getAusentismosYam,
  getNominaYam,
} from "@/actions/yam"
import { YamClient } from "./yam-client"

export const dynamic = "force-dynamic"

/** Suma días a una fecha 'YYYY-MM-DD' (aritmética UTC, sin sorpresas de TZ). */
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export default async function RrhhYamPage() {
  await requireRole(["admin", "admin_rrhh"])

  const hoy = hoyAR()
  const [nominaRes, asistenciaRes, ausentismosRes] = await Promise.all([
    getNominaYam(),
    getAsistenciaDiaYam(hoy),
    // Ausencias que tocan la ventana [hoy-30, hoy+60]: historial reciente + futuras.
    getAusentismosYam(sumarDias(hoy, -30), sumarDias(hoy, 60)),
  ])

  return (
    <YamClient
      hoy={hoy}
      nomina={"data" in nominaRes ? nominaRes.data : []}
      asistenciaInicial={"data" in asistenciaRes ? asistenciaRes.data : []}
      ausentismos={"data" in ausentismosRes ? ausentismosRes.data : []}
      errores={[nominaRes, asistenciaRes, ausentismosRes]
        .filter((r): r is { error: string } => "error" in r)
        .map((r) => r.error)}
    />
  )
}
