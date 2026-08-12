import { getMiUrea } from "@/actions/urea"
import { MiUreaClient } from "./mi-urea-client"

export default async function MiUreaPage() {
  const res = await getMiUrea()

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground">Carga de Urea</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return <MiUreaClient data={res.data} />
}
