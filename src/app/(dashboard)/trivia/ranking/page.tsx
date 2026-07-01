import { getRanking } from "@/actions/trivia"
import { getProfile } from "@/lib/session"
import { RankingClient } from "./ranking-client"

export const dynamic = "force-dynamic"

export default async function RankingPage() {
  const [mes, historico, profile] = await Promise.all([
    getRanking("mes"),
    getRanking("historico"),
    getProfile(),
  ])
  const esAdmin = ["admin", "auditor", "admin_rrhh"].includes(profile?.role ?? "")
  return (
    <RankingClient
      mes={mes.filas}
      historico={historico.filas}
      esAdmin={esAdmin}
    />
  )
}
