import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { getOwdTemplates } from "@/actions/owd"
import { getDpoHierarchy } from "@/actions/capacitaciones"
import { OwdAdminClient } from "./owd-admin-client"

export default async function OwdAdminPage() {
  const profile = await requireAuth()
  if (profile.role !== "admin") redirect("/owd")

  const [templatesRes, hierarchyRes] = await Promise.all([getOwdTemplates(), getDpoHierarchy()])

  const templates = "data" in templatesRes ? templatesRes.data : []
  const hierarchy = "data" in hierarchyRes ? hierarchyRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/owd"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a OWD
      </Link>
      <OwdAdminClient templates={templates} hierarchy={hierarchy} />
    </div>
  )
}
