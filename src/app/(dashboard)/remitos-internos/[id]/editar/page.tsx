import { notFound, redirect } from "next/navigation"
import { requireRole } from "@/lib/session"
import { getCatalogosRemito, getRemito } from "@/actions/remitos-internos"
import { RemitoForm } from "../../remito-form"

export const dynamic = "force-dynamic"

export default async function EditarRemitoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "supervisor", "admin_rrhh"])
  const { id } = await params
  const [remRes, catRes] = await Promise.all([getRemito(id), getCatalogosRemito()])
  if ("error" in remRes) return <p className="text-red-500">{remRes.error}</p>
  if ("error" in catRes) return <p className="text-red-500">{catRes.error}</p>
  const r = remRes.data
  if (!r) notFound()
  // Confirmada la descarga o anulado, el remito queda como está.
  if (r.descarga_estado || r.anulado) redirect(`/remitos-internos/${id}`)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Editar remito interno</h1>
      <RemitoForm
        remitoId={r.id}
        numero={r.numero}
        operacionNombre={r.operacion_nombre}
        inicial={{
          operacion_id: r.operacion_id,
          fecha: r.fecha,
          origen: r.origen ?? "",
          destino: r.destino ?? "",
          patente: r.patente,
          chofer_nombre: r.chofer_nombre,
          observaciones: r.observaciones ?? "",
          items: r.items,
        }}
        {...catRes.data}
      />
    </div>
  )
}
