import { getEstadoHoy } from "@/actions/trivia"
import { TriviaClient } from "./trivia-client"

export const dynamic = "force-dynamic"

export default async function TriviaPage() {
  const estadoInicial = await getEstadoHoy()
  return <TriviaClient estadoInicial={estadoInicial} />
}
