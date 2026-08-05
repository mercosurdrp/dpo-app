import { getMiCil } from "@/actions/mi-cil"
import { MiCilClient } from "./mi-cil-client"

export default async function MiCilPage() {
  const res = await getMiCil()

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi CIL</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return <MiCilClient data={res.data} />
}
