import { getTlpEvolucion, getTlpMes } from "@/actions/tlp"
import { listarPlanesTlp } from "@/actions/tlp-planes"
import { TlpClient } from "./tlp-client"

function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number)
  const desde = `${mes}-01`
  const hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { desde, hasta }
}

export default async function TlpPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const sp = await searchParams
  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesActual
  const { desde, hasta } = rangoMes(mes)

  const anio = Number(mes.slice(0, 4))
  const [tlpRes, planesRes, evolucionRes] = await Promise.all([
    getTlpMes(desde, hasta),
    listarPlanesTlp(),
    getTlpEvolucion(anio),
  ])

  if ("error" in tlpRes) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-slate-900">TLP</h1>
        <p className="mt-2 text-red-500">Error: {tlpRes.error}</p>
      </div>
    )
  }

  const planes = "data" in planesRes ? planesRes.data : []
  const evolucion = "data" in evolucionRes ? evolucionRes.data : null
  return (
    <TlpClient
      mes={mes}
      data={tlpRes.data}
      planesIniciales={planes}
      evolucion={evolucion}
    />
  )
}
