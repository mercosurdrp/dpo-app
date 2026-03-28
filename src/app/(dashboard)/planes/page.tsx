import { getPlanesList } from "@/actions/planes"
import { PlanesListClient } from "./planes-list-client"

export default async function PlanesPage() {
  const result = await getPlanesList()

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return <PlanesListClient planes={result.data} />
}
