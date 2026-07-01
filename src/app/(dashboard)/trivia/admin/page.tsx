import { getConfigTrivia } from "@/actions/trivia"
import { ConfigClient } from "./config-client"

export const dynamic = "force-dynamic"

export default async function TriviaAdminPage() {
  // getConfigTrivia hace requireRole por dentro (redirige si no tiene permiso).
  const data = await getConfigTrivia()
  return (
    <ConfigClient
      config={data.config}
      capacitaciones={data.capacitaciones}
      participacionHoy={data.participacionHoy}
    />
  )
}
