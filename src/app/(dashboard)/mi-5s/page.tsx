import { getMiSector5S } from "@/actions/s5-mi-sector"
import { getCheckSector } from "@/actions/s5-check"
import { Mi5SClient } from "./mi-5s-client"

export default async function Mi5SPage() {
  const res = await getMiSector5S()

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi sector 5S</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  const check =
    res.data.sector_numero !== null ? await getCheckSector(res.data.sector_numero) : null

  return <Mi5SClient data={res.data} check={check && "data" in check ? check.data : null} />
}
