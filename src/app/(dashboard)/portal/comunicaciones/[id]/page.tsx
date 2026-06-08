import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getComunicacion, getAsignablesComunicaciones } from "@/actions/portal-comunicaciones"
import { getProfile } from "@/lib/session"
import { ComunicacionDetailClient } from "./comunicacion-detail-client"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  const canManage = profile?.role === "admin"

  const [result, asignablesRes] = await Promise.all([
    getComunicacion(id),
    canManage ? getAsignablesComunicaciones() : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])

  if ("error" in result) {
    return (
      <div className="space-y-4">
        <Link href="/portal/comunicaciones" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" />
          Volver al buzón
        </Link>
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const asignables = "data" in asignablesRes ? asignablesRes.data : []

  return <ComunicacionDetailClient comunicacion={result.data} canManage={canManage} asignables={asignables} />
}
