import { redirect } from "next/navigation"
import { requireRole } from "@/lib/session"
import { getCatalogosRemito, listOperaciones } from "@/actions/remitos-internos"
import { RemitoForm } from "../remito-form"

export const dynamic = "force-dynamic"

function hoyArg(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

export default async function NuevoRemitoPage({ searchParams }: { searchParams: Promise<{ op?: string }> }) {
  await requireRole(["admin", "supervisor", "admin_rrhh"])
  const { op } = await searchParams
  const [opsRes, catRes] = await Promise.all([listOperaciones(), getCatalogosRemito()])
  if ("error" in opsRes) return <p className="text-red-500">{opsRes.error}</p>
  if ("error" in catRes) return <p className="text-red-500">{catRes.error}</p>
  const operacion = opsRes.data.find((o) => o.id === op) ?? opsRes.data.find((o) => o.activa)
  if (!operacion) redirect("/remitos-internos")

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Nuevo remito interno</h1>
      <RemitoForm
        operacionNombre={operacion.nombre}
        inicial={{
          operacion_id: operacion.id,
          fecha: hoyArg(),
          origen: operacion.origen ?? "",
          destino: operacion.destino ?? "",
          patente: "",
          chofer_nombre: "",
          observaciones: "",
          items: [],
        }}
        {...catRes.data}
      />
    </div>
  )
}
