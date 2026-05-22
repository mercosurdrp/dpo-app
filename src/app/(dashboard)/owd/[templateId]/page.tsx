import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getOwdTemplateById, getOwdKpis, getObservaciones } from "@/actions/owd"
import { requireAuth } from "@/lib/session"
import { OwdTemplateClient } from "./owd-template-client"

export default async function OwdTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const profile = await requireAuth()

  const [tplRes, kpisRes, obsRes] = await Promise.all([
    getOwdTemplateById(templateId),
    getOwdKpis(templateId),
    getObservaciones(templateId, { limit: 50 }),
  ])

  if ("error" in tplRes) {
    if (tplRes.error.includes("No rows")) notFound()
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">OWD</h1>
        <p className="mt-2 text-red-500">Error: {tplRes.error}</p>
      </div>
    )
  }
  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{tplRes.data.template.nombre}</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const observaciones = "data" in obsRes ? obsRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/owd"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a OWD
      </Link>
      <OwdTemplateClient
        templateId={templateId}
        contexto={tplRes.data}
        kpis={kpisRes.data}
        observaciones={observaciones}
        isAdmin={profile.role === "admin"}
      />
    </div>
  )
}
