import { getMisNeumaticos } from "@/actions/mis-neumaticos"
import { MisNeumaticosClient } from "./mis-neumaticos-client"

export default async function MisNeumaticosPage() {
  const res = await getMisNeumaticos()

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground">Neumáticos</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return <MisNeumaticosClient data={res.data} />
}
