import { getResumenPuntos } from "@/actions/dpo-evidencia"
import { EvidenciaLandingClient } from "./evidencia-landing-client"

export default async function EvidenciaPage() {
  const res = await getResumenPuntos()
  const puntos = "data" in res ? res.data : []
  return <EvidenciaLandingClient puntos={puntos} />
}
