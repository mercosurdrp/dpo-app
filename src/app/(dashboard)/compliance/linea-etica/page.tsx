import { getDenuncias } from "@/actions/linea-etica"
import { LineaEticaListClient } from "./linea-etica-list-client"

export default async function LineaEticaListPage() {
  const res = await getDenuncias()
  const denuncias = "data" in res ? res.data : []
  return <LineaEticaListClient denuncias={denuncias} />
}
