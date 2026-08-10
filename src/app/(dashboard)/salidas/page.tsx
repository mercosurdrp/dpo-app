import { redirect } from "next/navigation"
import { IS_MISIONES } from "@/lib/empresa"
import { requireRole } from "@/lib/session"
import {
  getDatosSalidas,
  getFechaDefaultSalidas,
  getSalidasDia,
} from "@/actions/salidas"
import { SalidasClient } from "./salidas-client"

export const dynamic = "force-dynamic"

export default async function SalidasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  // Solo Pampeana (Misiones ya tiene su módulo Orden de salida).
  if (IS_MISIONES) redirect("/")
  await requireRole(["admin", "supervisor"])

  const { fecha: fechaParam } = await searchParams
  const fecha =
    fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)
      ? fechaParam
      : await getFechaDefaultSalidas()

  const [salidasRes, datosRes] = await Promise.all([
    getSalidasDia(fecha),
    getDatosSalidas(),
  ])

  if ("error" in datosRes) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {datosRes.error}
      </div>
    )
  }

  return (
    <SalidasClient
      fecha={fecha}
      salidas={"data" in salidasRes ? salidasRes.data : []}
      datos={datosRes.data}
      error={"error" in salidasRes ? salidasRes.error : null}
    />
  )
}
