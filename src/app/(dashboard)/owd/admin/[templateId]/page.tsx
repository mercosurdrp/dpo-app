import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { getOwdTemplateById, getOwdItemsAdmin } from "@/actions/owd"
import { OwdTemplateEditorClient } from "./owd-template-editor-client"

export default async function OwdTemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const profile = await requireAuth()
  if (profile.role !== "admin") redirect("/owd")

  const [tplRes, itemsRes] = await Promise.all([
    getOwdTemplateById(templateId),
    getOwdItemsAdmin(templateId),
  ])

  if ("error" in tplRes) {
    if (tplRes.error.includes("No rows")) notFound()
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Editor de plantilla</h1>
        <p className="mt-2 text-red-500">Error: {tplRes.error}</p>
      </div>
    )
  }

  const items = "data" in itemsRes ? itemsRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/owd/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a plantillas
      </Link>
      <OwdTemplateEditorClient templateId={templateId} contexto={tplRes.data} items={items} />
    </div>
  )
}
