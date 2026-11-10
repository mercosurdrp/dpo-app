import { notFound } from "next/navigation"
import { getRemito, puedeEditarRemitos } from "@/actions/remitos-internos"
import { RemitoDetalleClient } from "./remito-detalle-client"

export const dynamic = "force-dynamic"

export default async function RemitoInternoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [res, puedeEditar] = await Promise.all([getRemito(id), puedeEditarRemitos()])
  if ("error" in res) return <p className="text-red-500">{res.error}</p>
  if (!res.data) notFound()
  return (
    <div className="mx-auto max-w-3xl">
      <RemitoDetalleClient remito={res.data} puedeEditar={puedeEditar} />
    </div>
  )
}
